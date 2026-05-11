/**
 * background.js - Service Worker 核心调度
 * 处理 alarm 触发、消息通信、任务生命周期管理
 */

import Storage from './lib/storage.js';
import AlarmManager from './lib/alarm-manager.js';
import Checker from './lib/checker.js';
import Notifier from './lib/notifier.js';

// ==================== Event Listeners ====================

// Must be registered at top level for service worker persistence

/**
 * Alarm 触发 - 执行定时检查
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  const taskId = AlarmManager.extractTaskId(alarm.name);
  if (!taskId) {
    return;
  }

  const task = await Storage.getTask(taskId);
  if (!task || !task.isActive) {
    return;
  }

  const result = await Checker.performCheck(task);

  if (result.changed && result.changeRecord) {
    await Notifier.notify(result.task, result.changeRecord);
  }
});

/**
 * 消息处理 - 来自 popup 和 options 页面
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_AND_EXTRACT' || message.type === 'PLAY_SOUND') {
    return false;
  }

  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ success: false, error: error.message }));
  return true;
});

/**
 * 浏览器启动 - 恢复所有 alarm
 */
chrome.runtime.onStartup.addListener(async () => {
  await AlarmManager.restoreAll();
});

/**
 * 扩展安装/更新 - 初始化设置和 alarm
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // First install - set default settings
    await Storage.updateSettings({});
  }
  // Restore alarms for all active tasks
  await AlarmManager.restoreAll();
});

/**
 * 通知点击 - 打开变化页面
 */
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId.startsWith('change-')) {
    const recordId = notificationId.slice('change-'.length);
    // Find the change record and open the task URL
    const allHistory = await Storage.getAllHistory();
    const record = allHistory.find((r) => r.id === recordId);
    if (record) {
      const task = await Storage.getTask(record.taskId);
      if (task) {
        await chrome.tabs.create({ url: task.url });
      }
      // Mark as read
      await Storage.markHistoryRead(recordId, record.taskId);
      // Clear the notification
      await chrome.notifications.clear(notificationId);
    }
  }
});

// ==================== Message Handler ====================

async function handleMessage(message, _sender) {
  switch (message.type) {
    case 'ADD_TASK':
      return handleAddTask(message.payload);

    case 'UPDATE_TASK':
      return handleUpdateTask(message.payload);

    case 'DELETE_TASK':
      return handleDeleteTask(message.payload.taskId);

    case 'PAUSE_TASK':
      return handlePauseTask(message.payload.taskId);

    case 'RESUME_TASK':
      return handleResumeTask(message.payload.taskId);

    case 'CHECK_NOW':
      return handleCheckNow(message.payload.taskId);

    case 'GET_TASKS':
      return handleGetTasks();

    case 'GET_TASK':
      return handleGetTask(message.payload.taskId);

    case 'GET_HISTORY':
      return handleGetHistory(message.payload.taskId, message.payload.limit);

    case 'GET_ALL_HISTORY':
      return handleGetAllHistory();

    case 'MARK_READ':
      return handleMarkRead(message.payload);

    case 'MARK_ALL_READ':
      return handleMarkAllRead(message.payload.taskId);

    case 'CLEAR_HISTORY':
      return handleClearHistory(message.payload.taskId);

    case 'CLEAR_ALL_HISTORY':
      return handleClearAllHistory();

    case 'GET_SETTINGS':
      return handleGetSettings();

    case 'UPDATE_SETTINGS':
      return handleUpdateSettings(message.payload);

    case 'GET_UNREAD_COUNT':
      return handleGetUnreadCount();

    case 'GET_UNREAD_COUNTS_BY_TASK':
      return handleGetUnreadCountsByTask();

    case 'RESET_BADGE':
      return handleResetBadge();

    case 'GET_ERRORS':
      return handleGetErrors(message.payload.taskId, message.payload.limit);

    case 'GET_ALL_ERRORS':
      return handleGetAllErrors();

    case 'GET_ERROR_COUNTS_BY_TASK':
      return handleGetErrorCountsByTask();

    case 'CLEAR_ERRORS':
      return handleClearErrors(message.payload.taskId);

    case 'CLEAR_ALL_ERRORS':
      return handleClearAllErrors();

    default:
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

// ==================== Task Handlers ====================

async function handleAddTask(payload) {
  const { name, url, selector, monitorType, keywords, intervalMinutes } = payload;

  // Validate URL
  try {
    new URL(url);
  } catch {
    return { success: false, error: '无效的 URL' };
  }

  // Block chrome:// and other restricted URLs
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:')
  ) {
    return { success: false, error: '无法监控浏览器内部页面' };
  }

  // Validate interval
  const interval = Math.max(1, intervalMinutes || 5);

  const task = {
    id: crypto.randomUUID(),
    name: name || new URL(url).hostname,
    url,
    selector,
    monitorType: monitorType || 'text',
    keywords: keywords || [],
    intervalMinutes: interval,
    isActive: true,
    lastChecked: null,
    lastSnapshot: null,
    createdAt: new Date().toISOString(),
    errorCount: 0,
    lastError: null,
  };

  await Storage.saveTask(task);
  await AlarmManager.create(task.id, task.intervalMinutes);

  // Perform initial check to establish baseline
  const result = await Checker.performCheck(task);
  if (result.task) {
    await Storage.saveTask(result.task);
  }

  return { success: true, task: result.task || task };
}

async function handleUpdateTask(payload) {
  const { taskId, ...updates } = payload;
  const task = await Storage.getTask(taskId);
  if (!task) {
    return { success: false, error: '任务不存在' };
  }

  // Apply updates
  Object.assign(task, updates);

  // If interval changed, update alarm
  if (updates.intervalMinutes !== undefined) {
    task.intervalMinutes = Math.max(1, updates.intervalMinutes);
    await AlarmManager.update(task.id, task.intervalMinutes);
  }

  await Storage.saveTask(task);
  return { success: true, task };
}

async function handleDeleteTask(taskId) {
  await AlarmManager.remove(taskId);
  await Storage.deleteTask(taskId);
  return { success: true };
}

async function handlePauseTask(taskId) {
  const task = await Storage.getTask(taskId);
  if (!task) {
    return { success: false, error: '任务不存在' };
  }

  task.isActive = false;
  await Storage.saveTask(task);
  await AlarmManager.remove(taskId);
  return { success: true, task };
}

async function handleResumeTask(taskId) {
  const task = await Storage.getTask(taskId);
  if (!task) {
    return { success: false, error: '任务不存在' };
  }

  task.isActive = true;
  task.errorCount = 0;
  task.lastError = null;
  await Storage.saveTask(task);
  await AlarmManager.create(task.id, task.intervalMinutes);
  return { success: true, task };
}

async function handleCheckNow(taskId) {
  const task = await Storage.getTask(taskId);
  if (!task) {
    return { success: false, error: '任务不存在' };
  }

  const result = await Checker.performCheck(task);

  if (result.changed && result.changeRecord) {
    await Notifier.notify(result.task, result.changeRecord);
  }

  return { success: true, changed: result.changed, task: result.task };
}

// ==================== Data Handlers ====================

async function handleGetTasks() {
  const tasks = await Storage.getAllTasks();
  return { success: true, tasks };
}

async function handleGetTask(taskId) {
  const task = await Storage.getTask(taskId);
  return { success: true, task };
}

async function handleGetHistory(taskId, limit) {
  const history = await Storage.getHistory(taskId, limit);
  return { success: true, history };
}

async function handleGetAllHistory() {
  const history = await Storage.getAllHistory();
  return { success: true, history };
}

async function handleMarkRead({ recordId, taskId }) {
  await Storage.markHistoryRead(recordId, taskId);
  return { success: true };
}

async function handleMarkAllRead(taskId) {
  await Storage.markAllHistoryRead(taskId);
  return { success: true };
}

async function handleClearHistory(taskId) {
  await Storage.clearHistory(taskId);
  return { success: true };
}

async function handleClearAllHistory() {
  await Storage.clearAllHistory();
  return { success: true };
}

async function handleGetSettings() {
  const settings = await Storage.getSettings();
  return { success: true, settings };
}

async function handleUpdateSettings(payload) {
  const settings = await Storage.updateSettings(payload);
  return { success: true, settings };
}

async function handleGetUnreadCount() {
  const count = await Storage.getUnreadCount();
  return { success: true, count };
}

async function handleGetUnreadCountsByTask() {
  const counts = await Storage.getUnreadCountsByTask();
  return { success: true, counts };
}

async function handleResetBadge() {
  await Notifier.resetBadge();
  return { success: true };
}

// ==================== Error Handlers ====================

async function handleGetErrors(taskId, limit) {
  const errors = await Storage.getErrors(taskId, limit);
  return { success: true, errors };
}

async function handleGetAllErrors() {
  const errors = await Storage.getAllErrors();
  return { success: true, errors };
}

async function handleGetErrorCountsByTask() {
  const counts = await Storage.getErrorCountsByTask();
  return { success: true, counts };
}

async function handleClearErrors(taskId) {
  await Storage.clearErrors(taskId);
  return { success: true };
}

async function handleClearAllErrors() {
  await Storage.clearAllErrors();
  return { success: true };
}
