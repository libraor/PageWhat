/**
 * popup.js - 弹窗逻辑
 */

import { initTheme } from '../themes/theme-system.js';

// ==================== DOM Elements ====================

const elements = {
  activeCount: document.getElementById('active-count'),
  unreadCount: document.getElementById('unread-count'),
  btnDashboard: document.getElementById('btn-dashboard'),
  btnResumeAll: document.getElementById('btn-resume-all'),
  btnPauseAll: document.getElementById('btn-pause-all'),
  btnMonitorCurrent: document.getElementById('btn-monitor-current'),
};

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  await refreshData();
  setupEventListeners();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.history || changes.badgeCount)) {
      refreshData();
    }
  });
});

async function refreshData() {
  const [tasksResp, unreadResp] = await Promise.all([
    sendMessage({ type: 'GET_TASKS' }),
    sendMessage({ type: 'GET_UNREAD_COUNT' }),
  ]);
  const tasks = tasksResp.success ? tasksResp.tasks : [];
  updateStatus(tasks, unreadResp);
}

// ==================== Event Listeners ====================

function setupEventListeners() {
  elements.btnDashboard.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  elements.btnResumeAll.addEventListener('click', handleResumeAllTasks);
  elements.btnPauseAll.addEventListener('click', handlePauseAllTasks);
  elements.btnMonitorCurrent.addEventListener('click', handleMonitorCurrentPage);
}

// ==================== Render ====================

function updateStatus(tasks, unreadResp) {
  const activeCount = tasks.filter((t) => t.isActive).length;
  const unreadCount = unreadResp.success ? unreadResp.count : 0;

  elements.activeCount.textContent = activeCount;
  elements.unreadCount.textContent = unreadCount;
}

async function handleResumeAllTasks() {
  try {
    const response = await sendMessage({ type: 'RESUME_ALL_TASKS' });
    if (response.success) {
      showToast(response.count > 0 ? `已开启 ${response.count} 个任务` : '所有任务已处于开启状态');
      await refreshData();
    } else {
      showToast(response.error || '操作失败');
    }
  } catch (e) {
    showToast('操作失败');
  }
}

async function handlePauseAllTasks() {
  if (!confirm('确定要暂停所有监控任务吗？')) {
    return;
  }
  try {
    const response = await sendMessage({ type: 'PAUSE_ALL_TASKS' });
    if (response.success) {
      showToast(response.count > 0 ? `已暂停 ${response.count} 个任务` : '所有任务已处于暂停状态');
      await refreshData();
    } else {
      showToast(response.error || '操作失败');
    }
  } catch (e) {
    showToast('操作失败');
  }
}

async function handleMonitorCurrentPage() {
  elements.btnMonitorCurrent.disabled = true;
  elements.btnMonitorCurrent.textContent = '获取中...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url) {
      showToast('无法获取当前页面 URL');
      return;
    }

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
      showToast('无法监控浏览器内部页面');
      return;
    }

    const url = tab.url;
    const name = tab.title || new URL(url).hostname;

    const response = await sendMessage({
      type: 'ADD_TASK',
      payload: { name, url, monitorType: 'text', keywords: [], intervalMinutes: 5 },
    });

    if (response.success) {
      showToast(`已添加监控: ${name}`);
      await refreshData();
    } else {
      showToast(response.error || '添加失败');
    }
  } catch (error) {
    showToast('添加失败: ' + error.message);
  } finally {
    elements.btnMonitorCurrent.disabled = false;
    elements.btnMonitorCurrent.textContent = '📌 监控当前页面';
  }
}

// ==================== Helpers ====================

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false, error: 'No response' });
      }
    });
  });
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}
