/**
 * storage.js - chrome.storage 抽象层
 * 提供对 tasks、history、settings、badge 的 CRUD 操作
 */

const STORAGE_KEYS = {
  TASKS: 'tasks',
  HISTORY: 'history',
  ERRORS: 'errors',
  SETTINGS: 'settings',
  BADGE_COUNT: 'badgeCount',
};

const DEFAULT_SETTINGS = {
  defaultIntervalMinutes: 5,
  enableNotifications: true,
  enableBadge: true,
  enableSound: true,
  soundVolume: 0.7,
  maxHistoryPerTask: 100,
  checkMethod: 'auto',
  maxConcurrentChecks: 3,
  autoDisableOnErrorCount: 5,
  maxErrorsPerTask: 50,
};

const Storage = {
  // ==================== Generic Helpers ====================

  async _get(key) {
    const result = await chrome.storage.local.get(key);
    return result[key];
  },

  async _set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },

  /**
   * Prune history records to maxHistoryPerTask limit
   * @param {Object} history - history object from storage
   * @param {string} taskId - task ID
   */
  async _pruneHistory(history, taskId) {
    const settings = await this.getSettings();
    const maxRecords = settings.maxHistoryPerTask || DEFAULT_SETTINGS.maxHistoryPerTask;
    if (history[taskId] && history[taskId].length > maxRecords) {
      history[taskId] = history[taskId].slice(-maxRecords);
    }
  },

  // ==================== Task Operations ====================

  async getTasks() {
    const tasks = await this._get(STORAGE_KEYS.TASKS);
    return tasks || {};
  },

  async getTask(id) {
    const tasks = await this.getTasks();
    return tasks[id] || null;
  },

  async saveTask(task) {
    const tasks = await this.getTasks();
    tasks[task.id] = task;
    await this._set(STORAGE_KEYS.TASKS, tasks);
  },

  async deleteTask(id) {
    const tasks = await this.getTasks();
    delete tasks[id];
    await this._set(STORAGE_KEYS.TASKS, tasks);
    // Also delete associated history and errors
    const history = (await this._get(STORAGE_KEYS.HISTORY)) || {};
    delete history[id];
    const errors = (await this._get(STORAGE_KEYS.ERRORS)) || {};
    delete errors[id];
    await chrome.storage.local.set({
      [STORAGE_KEYS.HISTORY]: history,
      [STORAGE_KEYS.ERRORS]: errors,
    });
  },

  async getActiveTasks() {
    const tasks = await this.getTasks();
    return Object.values(tasks).filter((t) => t.isActive);
  },

  async getAllTasks() {
    const tasks = await this.getTasks();
    return Object.values(tasks);
  },

  // ==================== History Operations ====================

  async getHistory(taskId, limit) {
    const history = (await this._get(STORAGE_KEYS.HISTORY)) || {};
    const records = history[taskId] || [];
    if (limit) {
      return records.slice(-limit);
    }
    return records;
  },

  async addHistory(taskId, record) {
    const history = (await this._get(STORAGE_KEYS.HISTORY)) || {};
    if (!history[taskId]) {
      history[taskId] = [];
    }
    history[taskId].push(record);

    await this._pruneHistory(history, taskId);

    await this._set(STORAGE_KEYS.HISTORY, history);
  },

  /**
   * 原子写入：同时保存任务快照和变化记录
   * 避免两次独立写入导致的 SW 终止不一致
   */
  async saveCheckResult(task, changeRecord) {
    const [tasks, history] = await Promise.all([this.getTasks(), this._get(STORAGE_KEYS.HISTORY)]);

    tasks[task.id] = task;

    const taskId = changeRecord.taskId;
    if (!history[taskId]) {
      history[taskId] = [];
    }
    history[taskId].push(changeRecord);

    await this._pruneHistory(history, taskId);

    // Atomic write: both keys in one set() call
    await chrome.storage.local.set({
      [STORAGE_KEYS.TASKS]: tasks,
      [STORAGE_KEYS.HISTORY]: history,
    });
  },

  async markHistoryRead(recordId, taskId) {
    if (!taskId) {
      // Fallback: scan all tasks (backward compatibility)
      const history = (await this._get(STORAGE_KEYS.HISTORY)) || {};
      for (const tid of Object.keys(history)) {
        const rec = history[tid].find((r) => r.id === recordId);
        if (rec) {
          rec.isRead = true;
          await this._set(STORAGE_KEYS.HISTORY, history);
          return;
        }
      }
      return;
    }
    const history = (await this._get(STORAGE_KEYS.HISTORY)) || {};
    const records = history[taskId];
    if (!records) {
      return;
    }
    const record = records.find((r) => r.id === recordId);
    if (record) {
      record.isRead = true;
      await this._set(STORAGE_KEYS.HISTORY, history);
    }
  },

  async markAllHistoryRead(taskId) {
    const history = (await this._get(STORAGE_KEYS.HISTORY)) || {};
    if (history[taskId]) {
      for (const record of history[taskId]) {
        record.isRead = true;
      }
      await this._set(STORAGE_KEYS.HISTORY, history);
    }
  },

  async clearHistory(taskId) {
    const history = (await this._get(STORAGE_KEYS.HISTORY)) || {};
    delete history[taskId];
    await this._set(STORAGE_KEYS.HISTORY, history);
  },

  async clearAllHistory() {
    await this._set(STORAGE_KEYS.HISTORY, {});
  },

  async getUnreadCount() {
    const history = (await this._get(STORAGE_KEYS.HISTORY)) || {};
    let count = 0;
    for (const records of Object.values(history)) {
      count += records.filter((r) => !r.isRead).length;
    }
    return count;
  },

  /**
   * 按任务统计未读变化数量
   * @returns {Promise<Object>} { taskId: unreadCount, ... }
   */
  async getUnreadCountsByTask() {
    const history = (await this._get(STORAGE_KEYS.HISTORY)) || {};
    const counts = {};
    for (const [taskId, records] of Object.entries(history)) {
      const n = records.filter((r) => !r.isRead).length;
      if (n > 0) {
        counts[taskId] = n;
      }
    }
    return counts;
  },

  async getAllHistory() {
    const history = (await this._get(STORAGE_KEYS.HISTORY)) || {};
    const allRecords = [];
    for (const [taskId, records] of Object.entries(history)) {
      for (const record of records) {
        allRecords.push({ ...record, taskId });
      }
    }
    // Sort by detectedAt descending
    allRecords.sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt));
    return allRecords;
  },

  // ==================== Error Operations ====================

  async addError(taskId, record) {
    const errors = (await this._get(STORAGE_KEYS.ERRORS)) || {};
    if (!errors[taskId]) {
      errors[taskId] = [];
    }
    errors[taskId].push(record);

    const settings = await this.getSettings();
    const maxRecords = settings.maxErrorsPerTask || DEFAULT_SETTINGS.maxErrorsPerTask;
    if (errors[taskId].length > maxRecords) {
      errors[taskId] = errors[taskId].slice(-maxRecords);
    }

    await this._set(STORAGE_KEYS.ERRORS, errors);
  },

  async getErrors(taskId, limit) {
    const errors = (await this._get(STORAGE_KEYS.ERRORS)) || {};
    const records = errors[taskId] || [];
    if (limit) {
      return records.slice(-limit);
    }
    return records;
  },

  async getAllErrors() {
    const errors = (await this._get(STORAGE_KEYS.ERRORS)) || {};
    const allRecords = [];
    for (const [taskId, records] of Object.entries(errors)) {
      for (const record of records) {
        allRecords.push({ ...record, taskId });
      }
    }
    allRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return allRecords;
  },

  async getErrorCountsByTask() {
    const errors = (await this._get(STORAGE_KEYS.ERRORS)) || {};
    const counts = {};
    for (const [taskId, records] of Object.entries(errors)) {
      if (records.length > 0) {
        counts[taskId] = records.length;
      }
    }
    return counts;
  },

  async clearErrors(taskId) {
    const errors = (await this._get(STORAGE_KEYS.ERRORS)) || {};
    delete errors[taskId];
    await this._set(STORAGE_KEYS.ERRORS, errors);
  },

  async clearAllErrors() {
    await this._set(STORAGE_KEYS.ERRORS, {});
  },

  // ==================== Settings Operations ====================

  async getSettings() {
    const settings = await this._get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...settings };
  },

  async updateSettings(partial) {
    const current = await this.getSettings();
    const updated = { ...current, ...partial };
    await this._set(STORAGE_KEYS.SETTINGS, updated);
    return updated;
  },

  // ==================== Badge Operations ====================

  async getBadgeCount() {
    const count = await this._get(STORAGE_KEYS.BADGE_COUNT);
    return count || 0;
  },

  async setBadgeCount(count) {
    await this._set(STORAGE_KEYS.BADGE_COUNT, count);
  },

  async incrementBadgeCount() {
    const count = await this.getBadgeCount();
    await this.setBadgeCount(count + 1);
    return count + 1;
  },

  async resetBadgeCount() {
    await this.setBadgeCount(0);
  },
};

export default Storage;
export { STORAGE_KEYS, DEFAULT_SETTINGS };
