/**
 * popup.js - 弹窗逻辑
 */

import { initTheme } from '../themes/theme-system.js';

// ==================== DOM Elements ====================

const elements = {
  activeCount: document.getElementById('active-count'),
  unreadCount: document.getElementById('unread-count'),
  formToggle: document.getElementById('form-toggle'),
  formBody: document.getElementById('form-body'),
  toggleIcon: document.getElementById('toggle-icon'),
  inputUrl: document.getElementById('input-url'),
  inputType: document.getElementById('input-type'),
  inputKeywords: document.getElementById('input-keywords'),
  keywordsGroup: document.getElementById('keywords-group'),
  inputInterval: document.getElementById('input-interval'),
  btnAdd: document.getElementById('btn-add'),
  btnSettings: document.getElementById('btn-settings'),
  btnDashboard: document.getElementById('btn-dashboard'),
  btnResumeAll: document.getElementById('btn-resume-all'),
  btnPauseAll: document.getElementById('btn-pause-all'),
};

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize theme first
  await initTheme();

  await refreshData();
  setupEventListeners();

  // Auto-refresh when storage changes (e.g. new change detected by background)
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
  // Toggle form
  elements.formToggle.addEventListener('click', toggleForm);

  // Monitor type change - show/hide keywords
  elements.inputType.addEventListener('change', () => {
    elements.keywordsGroup.classList.toggle('hidden', elements.inputType.value !== 'keyword');
  });

  // Add task
  elements.btnAdd.addEventListener('click', handleAddTask);

  // Settings button
  elements.btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Dashboard button
  elements.btnDashboard.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Bulk actions
  elements.btnResumeAll.addEventListener('click', handleResumeAllTasks);
  elements.btnPauseAll.addEventListener('click', handlePauseAllTasks);
}

// ==================== Form Logic ====================

let formExpanded = true;

function toggleForm() {
  formExpanded = !formExpanded;
  if (formExpanded) {
    elements.formBody.classList.remove('hidden');
    elements.toggleIcon.classList.remove('collapsed');
  } else {
    elements.formBody.classList.add('hidden');
    elements.toggleIcon.classList.add('collapsed');
  }
}

async function handleAddTask() {
  const url = elements.inputUrl.value.trim();
  const monitorType = elements.inputType.value;
  const keywords = elements.inputKeywords.value
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k);
  const intervalMinutes = parseInt(elements.inputInterval.value);

  // Validation
  if (!url) {
    showToast('请输入 URL');
    return;
  }
  if (monitorType === 'keyword' && keywords.length === 0) {
    showToast('关键词监控需要至少一个关键词');
    return;
  }

  elements.btnAdd.disabled = true;
  elements.btnAdd.textContent = '添加中...';

  try {
    const response = await sendMessage({
      type: 'ADD_TASK',
      payload: { name: '', url, monitorType, keywords, intervalMinutes },
    });

    if (response.success) {
      showToast('监控已添加');
      // Reset form
      elements.inputUrl.value = '';
      elements.inputType.value = 'text';
      elements.inputKeywords.value = '';
      elements.keywordsGroup.classList.add('hidden');
      elements.inputInterval.value = '5';

      await refreshData();
    } else {
      showToast(response.error || '添加失败');
    }
  } catch (error) {
    showToast('添加失败: ' + error.message);
  } finally {
    elements.btnAdd.disabled = false;
    elements.btnAdd.textContent = '开始监控';
  }
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
