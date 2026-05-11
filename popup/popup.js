/**
 * popup.js - 弹窗逻辑
 */

// ==================== DOM Elements ====================

const elements = {
  activeCount: document.getElementById('active-count'),
  unreadCount: document.getElementById('unread-count'),
  formToggle: document.getElementById('form-toggle'),
  formBody: document.getElementById('form-body'),
  toggleIcon: document.getElementById('toggle-icon'),
  inputUrl: document.getElementById('input-url'),
  inputSelector: document.getElementById('input-selector'),
  inputType: document.getElementById('input-type'),
  inputKeywords: document.getElementById('input-keywords'),
  keywordsGroup: document.getElementById('keywords-group'),
  inputInterval: document.getElementById('input-interval'),
  btnAdd: document.getElementById('btn-add'),
  taskList: document.getElementById('task-list'),
  emptyState: document.getElementById('empty-state'),
  btnSettings: document.getElementById('btn-settings'),
  btnDashboard: document.getElementById('btn-dashboard')
};

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', async () => {
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
  const [tasksResp, unreadResp, unreadByTaskResp] = await Promise.all([
    sendMessage({ type: 'GET_TASKS' }),
    sendMessage({ type: 'GET_UNREAD_COUNT' }),
    sendMessage({ type: 'GET_UNREAD_COUNTS_BY_TASK' })
  ]);
  const tasks = tasksResp.success ? tasksResp.tasks : [];
  const unreadByTask = unreadByTaskResp.success ? unreadByTaskResp.counts : {};
  updateStatus(tasks, unreadResp);
  renderTaskList(tasks, unreadByTask);
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
  const selector = elements.inputSelector.value.trim();
  const monitorType = elements.inputType.value;
  const keywords = elements.inputKeywords.value
    .split(',')
    .map(k => k.trim())
    .filter(k => k);
  const intervalMinutes = parseInt(elements.inputInterval.value);

  // Validation
  if (!url) {
    showToast('请输入 URL');
    return;
  }
  // selector 可选，为空时监控整个页面
  if (monitorType === 'keyword' && keywords.length === 0) {
    showToast('关键词监控需要至少一个关键词');
    return;
  }

  elements.btnAdd.disabled = true;
  elements.btnAdd.textContent = '添加中...';

  try {
    const response = await sendMessage({
      type: 'ADD_TASK',
      payload: { name: '', url, selector, monitorType, keywords, intervalMinutes }
    });

    if (response.success) {
      showToast('监控已添加');
      // Reset form
      elements.inputUrl.value = '';
      elements.inputSelector.value = '';
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
  const activeCount = tasks.filter(t => t.isActive).length;
  const unreadCount = unreadResp.success ? unreadResp.count : 0;

  elements.activeCount.textContent = activeCount;
  elements.unreadCount.textContent = unreadCount;
}

function renderTaskList(tasks, unreadByTask) {
  if (tasks.length === 0) {
    elements.emptyState.classList.remove('hidden');
    elements.taskList.querySelectorAll('.task-item').forEach(el => el.remove());
    return;
  }

  elements.emptyState.classList.add('hidden');

  // Sort: tasks with unread first, then active, then by createdAt
  tasks.sort((a, b) => {
    const aUnread = (unreadByTask[a.id] || 0) > 0 ? 1 : 0;
    const bUnread = (unreadByTask[b.id] || 0) > 0 ? 1 : 0;
    if (aUnread !== bUnread) return bUnread - aUnread;
    if (a.isActive !== b.isActive) return b.isActive - a.isActive;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  const fragment = document.createDocumentFragment();
  for (const task of tasks) {
    fragment.appendChild(createTaskElement(task, unreadByTask[task.id] || 0));
  }

  // Clear existing and append
  elements.taskList.querySelectorAll('.task-item').forEach(el => el.remove());
  elements.taskList.appendChild(fragment);
}

function createTaskElement(task, unreadCount) {
  const item = document.createElement('div');
  item.className = 'task-item';
  if (unreadCount > 0) item.classList.add('has-unread');
  item.dataset.taskId = task.id;

  const dotClass = getDotClass(task, unreadCount);
  const timeInfo = getTimeInfo(task);

  const unreadBadge = unreadCount > 0
    ? `<span class="unread-badge">${unreadCount > 9 ? '9+' : unreadCount}</span>`
    : '';

  const errorBadge = task.errorCount > 0
    ? `<span class="error-badge">${task.errorCount > 9 ? '9+' : task.errorCount}</span>`
    : '';

  item.innerHTML = `
    <span class="task-dot ${dotClass}"></span>
    <div class="task-info">
      <div class="task-name">${escapeHtml(task.name)}${unreadBadge}${errorBadge}</div>
      <div class="task-meta">${escapeHtml(task.selector || '全部页面')} · ${task.intervalMinutes}分钟 · ${timeInfo}</div>
    </div>
    <div class="task-actions">
      ${task.isActive
        ? `<button class="task-btn" data-action="pause">暂停</button>`
        : `<button class="task-btn" data-action="resume">恢复</button>`
      }
      <button class="task-btn danger" data-action="delete">删除</button>
    </div>
  `;

  // Event delegation for action buttons
  item.addEventListener('click', async (e) => {
    const btn = e.target.closest('.task-btn');
    if (!btn) return;
    e.stopPropagation();

    const action = btn.dataset.action;
    await handleTaskAction(action, task.id);
  });

  // Click on task item (not on buttons) — open options with changes tab if unread
  item.addEventListener('click', (e) => {
    if (e.target.closest('.task-btn')) return;
    if (unreadCount > 0) {
      chrome.runtime.openOptionsPage();
    }
  });

  return item;
}

function getDotClass(task, unreadCount) {
  if (unreadCount > 0) return 'orange';
  if (!task.isActive) return 'gray';
  if (task.errorCount > 0) return 'red';
  return 'green';
}

function getTimeInfo(task) {
  if (!task.lastChecked) return '未检查';
  const now = Date.now();
  const last = new Date(task.lastChecked).getTime();
  const diff = now - last;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

async function handleTaskAction(action, taskId) {
  try {
    let response;
    switch (action) {
      case 'pause':
        response = await sendMessage({ type: 'PAUSE_TASK', payload: { taskId } });
        break;
      case 'resume':
        response = await sendMessage({ type: 'RESUME_TASK', payload: { taskId } });
        break;
      case 'delete':
        if (!confirm('确定删除此监控任务？')) return;
        response = await sendMessage({ type: 'DELETE_TASK', payload: { taskId } });
        break;
    }

    if (response && response.success) {
      await refreshData();
    } else {
      showToast(response?.error || '操作失败');
    }
  } catch (e) {
    showToast('操作失败');
  }
}

// ==================== Helpers ====================

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || { success: false, error: 'No response' });
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
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}
