/**
 * alarm-manager.js - chrome.alarms 管理
 * 为每个监控任务创建/删除独立的 alarm
 */

import Storage from './storage.js';

const ALARM_PREFIX = 'task-';

const AlarmManager = {
  /**
   * 为任务创建定时 alarm
   * @param {string} taskId - 任务 ID
   * @param {number} intervalMinutes - 检查间隔（分钟）
   */
  async create(taskId, intervalMinutes) {
    const alarmName = `${ALARM_PREFIX}${taskId}`;
    // chrome.alarms minimum is 1 minute for packed, 0.5 for unpacked
    const interval = Math.max(1, intervalMinutes);
    await chrome.alarms.create(alarmName, {
      periodInMinutes: interval,
    });
  },

  /**
   * 删除任务的 alarm
   * @param {string} taskId - 任务 ID
   */
  async remove(taskId) {
    const alarmName = `${ALARM_PREFIX}${taskId}`;
    await chrome.alarms.clear(alarmName);
  },

  /**
   * 更新任务的 alarm（先删后建）
   * @param {string} taskId - 任务 ID
   * @param {number} intervalMinutes - 新的检查间隔
   */
  async update(taskId, intervalMinutes) {
    await this.remove(taskId);
    await this.create(taskId, intervalMinutes);
  },

  /**
   * 从 alarm name 中提取 taskId
   * @param {string} alarmName - alarm 名称
   * @returns {string|null} taskId 或 null
   */
  extractTaskId(alarmName) {
    if (alarmName.startsWith(ALARM_PREFIX)) {
      return alarmName.slice(ALARM_PREFIX.length);
    }
    return null;
  },

  /**
   * 重新注册所有活跃任务的 alarm
   * 用于浏览器启动或扩展更新时
   */
  async restoreAll() {
    // Clear all existing task alarms first
    const allAlarms = await chrome.alarms.getAll();
    for (const alarm of allAlarms) {
      if (alarm.name.startsWith(ALARM_PREFIX)) {
        await chrome.alarms.clear(alarm.name);
      }
    }

    // Re-create alarms for active tasks
    const tasks = await Storage.getActiveTasks();
    for (const task of tasks) {
      await this.create(task.id, task.intervalMinutes);
    }
  },

  /**
   * 获取所有当前活跃的 task alarm 名称
   * @returns {Promise<string[]>}
   */
  async getActiveAlarms() {
    const allAlarms = await chrome.alarms.getAll();
    return allAlarms.filter((a) => a.name.startsWith(ALARM_PREFIX)).map((a) => a.name);
  },
};

export default AlarmManager;
export { ALARM_PREFIX };
