/**
 * options.js - 管理页面逻辑
 */

// ==================== DOM Elements ====================

const $ = (id) => document.getElementById(id);

const dom = {
  // Tabs
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content'),

  // Monitors tab
  btnAddTask: $('btn-add-task'),
  modalOverlay: $('modal-overlay'),
  modalTitle: $('modal-title'),
  btnCloseModal: $('btn-close-modal'),
  btnCancel: $('btn-cancel'),
  btnSave: $('btn-save'),
  optName: $('opt-name'),
  optUrl: $('opt-url'),
  optSelector: $('opt-selector'),
  optType: $('opt-type'),
  optKeywords: $('opt-keywords'),
  optKeywordsRow: document.querySelector('.opt-keywords-row'),
  optInterval: $('opt-interval'),
  taskTbody: $('task-tbody'),
  tasksEmpty: $('tasks-empty'),

  // Changes tab
  filterTask: $('filter-task'),
  filterTime: $('filter-time'),
  filterUnread: $('filter-unread'),
  btnMarkAllRead: $('btn-mark-all-read'),
  changesList: $('changes-list'),
  changesEmpty: $('changes-empty'),

  // Errors tab
  filterErrorTask: $('filter-error-task'),
  errorsList: $('errors-list'),
  errorsEmpty: $('errors-empty'),
  btnClearAllErrors: $('btn-clear-all-errors'),

  // Settings tab
  setDefaultInterval: $('set-default-interval'),
  setMaxConcurrent: $('set-max-concurrent'),
  setAutoDisable: $('set-auto-disable'),
  setCheckMethod: $('set-check-method'),
  setEnableNotifications: $('set-enable-notifications'),
  setEnableBadge: $('set-enable-badge'),
  setMaxHistory: $('set-max-history'),
  btnExport: $('btn-export'),
  btnClearAllHistory: $('btn-clear-all-history'),
  btnSaveSettings: $('btn-save-settings'),
};

let editingTaskId = null;
let _changesLoading = false;
let _errorsLoading = false;

// ==================== Initialization ====================

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupModal();
  setupSettings();
  setupTaskTableDelegation();
  await loadMonitorsTab();
  await loadSettings();
});

// ==================== Tab Navigation ====================

function setupTabs() {
  dom.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      dom.tabs.forEach((t) => t.classList.remove('active'));
      dom.tabContents.forEach((tc) => tc.classList.remove('active'));

      tab.classList.add('active');
      const tabId = `tab-${tab.dataset.tab}`;
      document.getElementById(tabId).classList.add('active');

      // Load data for the active tab
      if (tab.dataset.tab === 'monitors') {
        loadMonitorsTab();
      }
      if (tab.dataset.tab === 'changes') {
        loadChangesTab();
      }
      if (tab.dataset.tab === 'errors') {
        loadErrorsTab();
      }
      if (tab.dataset.tab === 'settings') {
        loadSettings();
      }
    });
  });
}

// ==================== Modal ====================

function setupModal() {
  dom.btnAddTask.addEventListener('click', () => openModal());
  dom.btnCloseModal.addEventListener('click', closeModal);
  dom.btnCancel.addEventListener('click', closeModal);
  dom.btnSave.addEventListener('click', handleSaveTask);

  dom.optType.addEventListener('change', () => {
    dom.optKeywordsRow.classList.toggle('hidden', dom.optType.value !== 'keyword');
  });

  // Close modal on overlay click
  dom.modalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.modalOverlay) {
      closeModal();
    }
  });
}

function openModal(task = null) {
  editingTaskId = task ? task.id : null;
  dom.modalTitle.textContent = task ? '编辑监控' : '添加监控';

  dom.optName.value = task ? task.name : '';
  dom.optUrl.value = task ? task.url : '';
  dom.optSelector.value = task ? task.selector : '';
  dom.optType.value = task ? task.monitorType : 'text';
  dom.optKeywords.value = task ? (task.keywords || []).join(', ') : '';
  dom.optInterval.value = task ? task.intervalMinutes : '5';

  dom.optKeywordsRow.classList.toggle('hidden', dom.optType.value !== 'keyword');

  dom.modalOverlay.classList.remove('hidden');
}

function closeModal() {
  dom.modalOverlay.classList.add('hidden');
  editingTaskId = null;
}

async function handleSaveTask() {
  const url = dom.optUrl.value.trim();
  const selector = dom.optSelector.value.trim();
  const monitorType = dom.optType.value;
  const keywords = dom.optKeywords.value
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k);
  const intervalMinutes = parseInt(dom.optInterval.value);
  const name = dom.optName.value.trim();

  if (!url) {
    return alert('请输入 URL');
  }
  // selector 可选，为空时监控整个页面
  if (monitorType === 'keyword' && keywords.length === 0) {
    return alert('请输入关键词');
  }

  try {
    let response;
    if (editingTaskId) {
      response = await sendMessage({
        type: 'UPDATE_TASK',
        payload: {
          taskId: editingTaskId,
          name: name || new URL(url).hostname,
          url,
          selector,
          monitorType,
          keywords,
          intervalMinutes,
        },
      });
    } else {
      response = await sendMessage({
        type: 'ADD_TASK',
        payload: { name, url, selector, monitorType, keywords, intervalMinutes },
      });
    }

    if (response.success) {
      closeModal();
      await loadMonitorsTab();
    } else {
      alert(response.error || '操作失败');
    }
  } catch (e) {
    alert('操作失败: ' + e.message);
  }
}

// ==================== Monitors Tab ====================

/**
 * 事件委托：在 tbody 上监听所有按钮点击，避免内联 onclick（Manifest V3 CSP 禁止）
 */
function setupTaskTableDelegation() {
  dom.taskTbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-task-action]');
    if (!btn) {
      return;
    }

    const taskId = btn.dataset.taskId;
    const action = btn.dataset.taskAction;

    switch (action) {
      case 'check':
        await handleCheckNow(taskId);
        break;
      case 'toggle':
        await handleToggleTask(taskId, btn.dataset.taskActive === 'true');
        break;
      case 'edit':
        await handleEditTask(taskId);
        break;
      case 'delete':
        await handleDeleteTask(taskId);
        break;

      default:
        break;
    }
  });
}

async function handleCheckNow(taskId) {
  const response = await sendMessage({ type: 'CHECK_NOW', payload: { taskId } });
  if (response.success) {
    if (response.changed) {
      alert('检测到变化！');
    } else {
      alert('未检测到变化');
    }
    await loadMonitorsTab();
  }
}

async function handleToggleTask(taskId, isActive) {
  const type = isActive ? 'PAUSE_TASK' : 'RESUME_TASK';
  await sendMessage({ type, payload: { taskId } });
  await loadMonitorsTab();
}

async function handleEditTask(taskId) {
  const response = await sendMessage({ type: 'GET_TASK', payload: { taskId } });
  if (response.success && response.task) {
    openModal(response.task);
  }
}

async function handleDeleteTask(taskId) {
  if (!confirm('确定删除此监控任务？相关历史记录也将被删除。')) {
    return;
  }
  await sendMessage({ type: 'DELETE_TASK', payload: { taskId } });
  await loadMonitorsTab();
}

async function loadMonitorsTab() {
  try {
    const response = await sendMessage({ type: 'GET_TASKS' });
    if (!response.success) {
      return;
    }

    const tasks = response.tasks;
    if (tasks.length === 0) {
      dom.tasksEmpty.classList.remove('hidden');
      dom.taskTbody.innerHTML = '';
      return;
    }

    dom.tasksEmpty.classList.add('hidden');

    // Sort: active first
    tasks.sort((a, b) => {
      if (a.isActive !== b.isActive) {
        return b.isActive - a.isActive;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    dom.taskTbody.innerHTML = tasks
      .map(
        (task) => `
      <tr>
        <td><span class="status-dot ${getStatusColor(task)}"></span></td>
        <td>${escapeHtml(task.name)}</td>
        <td class="url-cell" title="${escapeHtml(task.url)}">${escapeHtml(task.url)}</td>
        <td><code>${escapeHtml(task.selector || '全部页面')}</code></td>
        <td><span class="type-badge ${task.monitorType}">${getTypeLabel(task.monitorType)}</span></td>
        <td>${task.intervalMinutes}分钟</td>
        <td>${formatTime(task.lastChecked)}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-sm btn-secondary" data-task-action="check" data-task-id="${task.id}">立即检查</button>
            <button class="btn btn-sm btn-secondary" data-task-action="toggle" data-task-id="${task.id}" data-task-active="${task.isActive}">${task.isActive ? '暂停' : '恢复'}</button>
            <button class="btn btn-sm btn-secondary" data-task-action="edit" data-task-id="${task.id}">编辑</button>
            <button class="btn btn-sm btn-danger" data-task-action="delete" data-task-id="${task.id}">删除</button>
          </div>
        </td>
      </tr>
    `
      )
      .join('');
  } catch (e) {
    console.error('Failed to load monitors:', e);
  }
}

// ==================== Changes Tab ====================

async function loadChangesTab() {
  // Reentrancy guard: prevent recursive calls when innerHTML mutations
  // on the filter <select> fire 'change' events that call us back.
  if (_changesLoading) {
    return;
  }
  _changesLoading = true;
  try {
    const [historyResp, tasksResp] = await Promise.all([
      sendMessage({ type: 'GET_ALL_HISTORY' }),
      sendMessage({ type: 'GET_TASKS' }),
    ]);

    if (!historyResp.success) {
      return;
    }

    // Populate filter dropdown
    if (tasksResp.success) {
      const currentVal = dom.filterTask.value;
      dom.filterTask.innerHTML = '<option value="all">全部任务</option>';
      for (const task of tasksResp.tasks) {
        dom.filterTask.innerHTML += `<option value="${task.id}">${escapeHtml(task.name)}</option>`;
      }
      dom.filterTask.value = currentVal;
    }

    let records = historyResp.history || [];

    // Apply filters
    const taskFilter = dom.filterTask.value;
    const timeFilter = dom.filterTime.value;
    const unreadOnly = dom.filterUnread.checked;

    if (taskFilter !== 'all') {
      records = records.filter((r) => r.taskId === taskFilter);
    }

    if (timeFilter === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      records = records.filter((r) => r.detectedAt && r.detectedAt.startsWith(today));
    } else if (timeFilter === 'week') {
      const weekAgo = Date.now() - 7 * 86400000;
      records = records.filter((r) => r.detectedAt && new Date(r.detectedAt).getTime() > weekAgo);
    }

    if (unreadOnly) {
      records = records.filter((r) => !r.isRead);
    }

    if (records.length === 0) {
      dom.changesEmpty.classList.remove('hidden');
      dom.changesList.querySelectorAll('.change-card').forEach((el) => el.remove());
      return;
    }

    dom.changesEmpty.classList.add('hidden');

    // Get task names
    const taskMap = {};
    if (tasksResp.success) {
      for (const task of tasksResp.tasks) {
        taskMap[task.id] = task.name;
      }
    }

    dom.changesList.querySelectorAll('.change-card').forEach((el) => el.remove());

    const fragment = document.createDocumentFragment();
    for (const record of records) {
      fragment.appendChild(createChangeCard(record, taskMap[record.taskId] || '未知任务'));
    }
    dom.changesList.appendChild(fragment);
  } catch (e) {
    console.error('Failed to load changes:', e);
  } finally {
    _changesLoading = false;
  }
}

function createChangeCard(record, taskName) {
  const card = document.createElement('div');
  card.className = `change-card ${record.isRead ? '' : 'unread'}`;

  // Header
  const header = document.createElement('div');
  header.className = 'change-header';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'change-title';
  titleSpan.textContent = taskName;
  const timeSpan = document.createElement('span');
  timeSpan.className = 'change-time';
  timeSpan.textContent = formatTime(record.detectedAt);
  header.appendChild(titleSpan);
  header.appendChild(timeSpan);

  // Type badge
  const typeDiv = document.createElement('div');
  typeDiv.className = 'change-type';
  const typeClass =
    record.changeType === 'text_change'
      ? 'text'
      : record.changeType === 'structure_change'
        ? 'structure'
        : 'keyword';
  const badge = document.createElement('span');
  badge.className = `type-badge ${typeClass}`;
  badge.textContent = getTypeLabel(record.changeType);
  typeDiv.appendChild(badge);

  // Summary
  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'change-summary';
  summaryDiv.textContent = record.diff || '检测到页面变化';

  // Toggle button for diff panel
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'btn btn-sm btn-secondary diff-toggle';
  toggleBtn.textContent = '展开对比';

  // Diff panel (collapsed by default)
  const diffPanel = document.createElement('div');
  diffPanel.className = 'diff-panel hidden';

  // Build diff content based on change type
  if (record.changeType === 'text_change') {
    buildTextDiffPanel(diffPanel, record.oldSnapshot?.text, record.newSnapshot?.text);
  } else if (record.changeType === 'structure_change') {
    buildStructureDiffPanel(
      diffPanel,
      record.oldSnapshot?.html,
      record.newSnapshot?.html,
      record.diff
    );
  } else if (record.changeType === 'keyword_found') {
    buildKeywordDiffPanel(diffPanel, record.newSnapshot?.text, record.keywordsMatched || []);
  }

  toggleBtn.addEventListener('click', () => {
    const isHidden = diffPanel.classList.contains('hidden');
    diffPanel.classList.toggle('hidden');
    toggleBtn.textContent = isHidden ? '收起对比' : '展开对比';
  });

  // Actions
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'change-actions';

  // "在页面中显示" button — primary action
  const viewOnPageBtn = document.createElement('button');
  viewOnPageBtn.className = 'btn btn-sm btn-primary';
  viewOnPageBtn.textContent = '在页面中显示';
  viewOnPageBtn.addEventListener('click', async () => {
    await handleViewOnPage(record);
  });
  actionsDiv.appendChild(viewOnPageBtn);
  actionsDiv.appendChild(toggleBtn);

  const viewBtn = document.createElement('button');
  viewBtn.className = 'btn btn-sm btn-secondary';
  viewBtn.textContent = '查看页面';
  viewBtn.addEventListener('click', async () => {
    const taskResp = await sendMessage({ type: 'GET_TASK', payload: { taskId: record.taskId } });
    if (taskResp.success && taskResp.task) {
      chrome.tabs.create({ url: taskResp.task.url });
    }
  });
  actionsDiv.appendChild(viewBtn);

  if (!record.isRead) {
    const readBtn = document.createElement('button');
    readBtn.className = 'btn btn-sm btn-secondary';
    readBtn.textContent = '标记已读';
    readBtn.addEventListener('click', async () => {
      await sendMessage({
        type: 'MARK_READ',
        payload: { recordId: record.id, taskId: record.taskId },
      });
      await loadChangesTab();
    });
    actionsDiv.appendChild(readBtn);
  }

  card.appendChild(header);
  card.appendChild(typeDiv);
  card.appendChild(summaryDiv);
  card.appendChild(diffPanel);
  card.appendChild(actionsDiv);

  return card;
}

// Setup changes filters
// _changesLoading prevents infinite recursion when innerHTML mutations
// on the filter <select> fire 'change' events during loadChangesTab().
dom.filterTask.addEventListener('change', () => {
  if (_changesLoading) {
    return;
  }
  loadChangesTab();
});
dom.filterTime.addEventListener('change', () => {
  if (!_changesLoading) {
    loadChangesTab();
  }
});
dom.filterUnread.addEventListener('change', () => {
  if (!_changesLoading) {
    loadChangesTab();
  }
});
dom.btnMarkAllRead.addEventListener('click', async () => {
  await sendMessage({ type: 'RESET_BADGE' });
  // Group unread records by taskId and call MARK_ALL_READ per task
  const historyResp = await sendMessage({ type: 'GET_ALL_HISTORY' });
  if (historyResp.success) {
    const taskIds = new Set();
    for (const record of historyResp.history) {
      if (!record.isRead) {
        taskIds.add(record.taskId);
      }
    }
    for (const taskId of taskIds) {
      await sendMessage({ type: 'MARK_ALL_READ', payload: { taskId } });
    }
  }
  await loadChangesTab();
});

// ==================== Errors Tab ====================

async function loadErrorsTab() {
  if (_errorsLoading) {
    return;
  }
  _errorsLoading = true;
  try {
    const [errorsResp, tasksResp] = await Promise.all([
      sendMessage({ type: 'GET_ALL_ERRORS' }),
      sendMessage({ type: 'GET_TASKS' }),
    ]);

    if (!errorsResp.success) {
      return;
    }

    // Populate filter dropdown
    if (tasksResp.success) {
      const currentVal = dom.filterErrorTask.value;
      dom.filterErrorTask.innerHTML = '<option value="all">全部任务</option>';
      for (const task of tasksResp.tasks) {
        dom.filterErrorTask.innerHTML += `<option value="${task.id}">${escapeHtml(task.name)}</option>`;
      }
      dom.filterErrorTask.value = currentVal;
    }

    let records = errorsResp.errors || [];

    // Apply filter
    const taskFilter = dom.filterErrorTask.value;
    if (taskFilter !== 'all') {
      records = records.filter((r) => r.taskId === taskFilter);
    }

    if (records.length === 0) {
      dom.errorsEmpty.classList.remove('hidden');
      dom.errorsList.querySelectorAll('.error-card').forEach((el) => el.remove());
      return;
    }

    dom.errorsEmpty.classList.add('hidden');

    // Get task names
    const taskMap = {};
    if (tasksResp.success) {
      for (const task of tasksResp.tasks) {
        taskMap[task.id] = task.name;
      }
    }

    dom.errorsList.querySelectorAll('.error-card').forEach((el) => el.remove());

    const fragment = document.createDocumentFragment();
    for (const record of records) {
      fragment.appendChild(createErrorCard(record, taskMap[record.taskId] || '未知任务'));
    }
    dom.errorsList.appendChild(fragment);
  } catch (e) {
    console.error('Failed to load errors:', e);
  } finally {
    _errorsLoading = false;
  }
}

function createErrorCard(record, taskName) {
  const card = document.createElement('div');
  card.className = 'error-card';

  // Header
  const header = document.createElement('div');
  header.className = 'error-header';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'error-title';
  titleSpan.textContent = taskName;
  const timeSpan = document.createElement('span');
  timeSpan.className = 'error-time';
  timeSpan.textContent = formatTime(record.timestamp);
  header.appendChild(titleSpan);
  header.appendChild(timeSpan);

  // Error type badge
  const typeDiv = document.createElement('div');
  typeDiv.className = 'error-type-row';
  const badge = document.createElement('span');
  badge.className = 'error-type-badge';
  badge.textContent = record.errorType || 'UNKNOWN';
  typeDiv.appendChild(badge);

  // Error message
  const msgDiv = document.createElement('div');
  msgDiv.className = 'error-message';
  msgDiv.textContent = record.errorMessage || '未知错误';

  card.appendChild(header);
  card.appendChild(typeDiv);
  card.appendChild(msgDiv);

  return card;
}

dom.filterErrorTask.addEventListener('change', () => {
  if (_errorsLoading) {
    return;
  }
  loadErrorsTab();
});
dom.btnClearAllErrors.addEventListener('click', async () => {
  if (!confirm('确定清除全部错误记录？')) {
    return;
  }
  await sendMessage({ type: 'CLEAR_ALL_ERRORS' });
  await loadErrorsTab();
});

// ==================== Settings Tab ====================

function setupSettings() {
  dom.btnSaveSettings.addEventListener('click', handleSaveSettings);

  dom.btnExport.addEventListener('click', handleExport);

  dom.btnClearAllHistory.addEventListener('click', async () => {
    if (!confirm('确定清除全部历史记录？此操作不可恢复。')) {
      return;
    }
    const response = await sendMessage({ type: 'CLEAR_ALL_HISTORY' });
    if (response.success) {
      alert('历史记录已清除');
    }
  });
}

async function loadSettings() {
  try {
    const response = await sendMessage({ type: 'GET_SETTINGS' });
    if (!response.success) {
      return;
    }

    const s = response.settings;
    dom.setDefaultInterval.value = s.defaultIntervalMinutes;
    dom.setMaxConcurrent.value = s.maxConcurrentChecks;
    dom.setAutoDisable.value = s.autoDisableOnErrorCount;
    dom.setCheckMethod.value = s.checkMethod;
    dom.setEnableNotifications.checked = s.enableNotifications;
    dom.setEnableBadge.checked = s.enableBadge;
    dom.setMaxHistory.value = s.maxHistoryPerTask;
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

async function handleSaveSettings() {
  try {
    const response = await sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: {
        defaultIntervalMinutes: parseInt(dom.setDefaultInterval.value),
        maxConcurrentChecks: parseInt(dom.setMaxConcurrent.value),
        autoDisableOnErrorCount: parseInt(dom.setAutoDisable.value),
        checkMethod: dom.setCheckMethod.value,
        enableNotifications: dom.setEnableNotifications.checked,
        enableBadge: dom.setEnableBadge.checked,
        maxHistoryPerTask: parseInt(dom.setMaxHistory.value),
      },
    });

    if (response.success) {
      alert('设置已保存');
    }
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

async function handleExport() {
  try {
    const response = await sendMessage({ type: 'GET_ALL_HISTORY' });
    if (!response.success) {
      return;
    }

    const blob = new Blob([JSON.stringify(response.history, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagewhat-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('导出失败');
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

/**
 * 将 URL 转换为 chrome.tabs.query 可用的 match pattern
 * chrome.tabs.query 要求 url 参数是 match pattern 格式，如 https://www.example.com/*
 */
function urlToMatchPattern(url) {
  try {
    const u = new URL(url);
    return u.origin + '/*';
  } catch {
    return url;
  }
}

function getStatusColor(task) {
  if (!task.isActive) {
    return 'gray';
  }
  if (task.errorCount > 0) {
    return 'red';
  }
  return 'green';
}

function getTypeLabel(type) {
  const labels = {
    text: '文本',
    structure: '结构',
    keyword: '关键词',
    text_change: '文本变化',
    structure_change: '结构变化',
    keyword_found: '关键词',
  };
  return labels[type] || type;
}

function formatTime(isoString) {
  if (!isoString) {
    return '-';
  }
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) {
    return '刚刚';
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  }
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`;
  }
  if (diff < 172800000) {
    return '昨天';
  }

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ==================== Diff Engine ====================

const DIFF_MAX_TOKENS = 2000; // LCS 单次输入 token 上限（超过用分块 diff）
const DIFF_CONTEXT_RADIUS = 200; // 变化区域前后保留的 token 数
const CHUNK_TARGET_SIZE = 512; // 内容分块目标大小（必须是 2 的幂）

/**
 * 将文本分割为 token 数组
 * CJK 字符逐字、英文按单词、空白和标点各自分组
 */
function tokenizeText(text) {
  if (!text) {
    return [];
  }
  const tokens = [];
  const regex =
    /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]|[a-zA-Z0-9]+|\s+|[^\s\w\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    tokens.push(m[0]);
  }
  return tokens;
}

/**
 * LCS 动态规划表（Uint16Array 节省内存）
 */
function computeLcsTable(a, b) {
  const m = a.length,
    n = b.length;
  const dp = new Array(m + 1);
  for (let i = 0; i <= m; i++) {
    dp[i] = new Uint16Array(n + 1);
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = dp[i - 1][j] > dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
      }
    }
  }
  return dp;
}

/**
 * 回溯 LCS 表，生成 diff 段落并合并相邻同类
 */
function backtrackLcs(dp, a, b) {
  const raw = [];
  let i = a.length,
    j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      raw.push({ type: 'equal', text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: 'added', text: b[j - 1] });
      j--;
    } else {
      raw.push({ type: 'removed', text: a[i - 1] });
      i--;
    }
  }
  raw.reverse();

  // 合并相邻同类段落
  const merged = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      merged.push({ type: seg.type, text: seg.text });
    }
  }
  return merged;
}

/**
 * 简单行级 diff（最终降级方案，仅当分块 diff 也无法处理时使用）
 */
function computeSimpleLineDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const segments = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) {
      segments.push({ type: 'equal', text: o + '\n' });
    } else {
      if (o !== undefined) {
        segments.push({ type: 'removed', text: o + '\n' });
      }
      if (n !== undefined) {
        segments.push({ type: 'added', text: n + '\n' });
      }
    }
  }
  return segments;
}

// ==================== Content-Defined Chunking ====================

/**
 * Buzhash 查找表（确定性，使用固定种子）
 * 使用 65536 项以支持完整 UTF-16 字符（中文等），
 * 确保不同字符映射到不同的哈希值，提高分块区分度。
 */
const BUZHASH_TABLE = new Uint32Array(65536);
{
  let seed = 0x12345678;
  for (let i = 0; i < 65536; i++) {
    seed = (Math.imul(seed, 0x5bd1e995) + i) >>> 0;
    BUZHASH_TABLE[i] = seed;
  }
}

/**
 * 内容定义分块（Content-Defined Chunking）
 * 使用 Buzhash 滚动哈希，根据内容自动确定分块边界。
 * 相同的文本片段无论出现在文本的什么位置，都会产生相同的分块边界。
 *
 * @param {string} text - 待分块文本
 * @param {number} targetSize - 目标分块大小（必须是 2 的幂）
 * @returns {string[]} 分块数组
 */
function cdChunk(text, targetSize) {
  if (!text) {
    return [];
  }
  if (text.length < targetSize) {
    return [text];
  }

  const WINDOW = 48;
  const MIN_CHUNK = targetSize >> 1;
  const MAX_CHUNK = targetSize * 3;
  const MASK = targetSize - 1;

  const chunks = [];
  let start = 0;
  let hash = 0;
  const win = new Uint16Array(WINDOW);
  let wp = 0,
    wlen = 0;

  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const outC = wlen >= WINDOW ? win[wp] : 0;

    // Buzhash: 左旋 → 异或出旧字符 → 异或入新字符
    hash = ((hash << 1) | (hash >>> 31)) >>> 0;
    if (wlen >= WINDOW) {
      hash = (hash ^ BUZHASH_TABLE[outC]) >>> 0;
    }
    hash = (hash ^ BUZHASH_TABLE[c]) >>> 0;

    // 更新滑动窗口
    win[wp] = c;
    wp = (wp + 1) % WINDOW;
    if (wlen < WINDOW) {
      wlen++;
    }

    // 检查分块边界
    const chunkLen = i - start + 1;
    if (chunkLen >= MIN_CHUNK && ((hash & MASK) === 0 || chunkLen >= MAX_CHUNK)) {
      chunks.push(text.slice(start, i + 1));
      start = i + 1;
      hash = 0;
      wlen = 0;
      wp = 0;
    }
  }

  if (start < text.length) {
    chunks.push(text.slice(start));
  }

  return chunks.length > 0 ? chunks : [text];
}

/**
 * 对相邻的 removed+added 分块对做细粒度 LCS 精化
 * 将粗粒度的"整块删除+整块添加"转换为精确的 token 级 diff
 */
function refineChunkSegments(chunkSegs, depth = 0) {
  const result = [];
  let i = 0;

  while (i < chunkSegs.length) {
    const seg = chunkSegs[i];

    if (seg.type === 'equal') {
      result.push(seg);
      i++;
      continue;
    }

    // 收集连续的 removed 和 added 段
    const removedTexts = [];
    const addedTexts = [];

    while (i < chunkSegs.length && chunkSegs[i].type === 'removed') {
      removedTexts.push(chunkSegs[i].text);
      i++;
    }
    while (i < chunkSegs.length && chunkSegs[i].type === 'added') {
      addedTexts.push(chunkSegs[i].text);
      i++;
    }

    if (removedTexts.length > 0 && addedTexts.length > 0) {
      const removed = removedTexts.join('');
      const added = addedTexts.join('');
      const oldTokens = tokenizeText(removed);
      const newTokens = tokenizeText(added);

      if (oldTokens.length <= DIFF_MAX_TOKENS && newTokens.length <= DIFF_MAX_TOKENS) {
        // 单次 LCS 可处理 → 精确 token 级 diff
        const dp = computeLcsTable(oldTokens, newTokens);
        result.push(...backtrackLcs(dp, oldTokens, newTokens));
      } else if (depth < 1) {
        // 递归做一次更细的分块 diff（限制递归深度为 1，防止无限递归）
        result.push(...computeChunkedDiff(removed, added, depth + 1));
      } else {
        // 已达递归深度上限 → 降级为简单行级 diff，保证终止
        result.push(...computeSimpleLineDiff(removed, added));
      }
    } else {
      for (const t of removedTexts) {
        result.push({ type: 'removed', text: t });
      }
      for (const t of addedTexts) {
        result.push({ type: 'added', text: t });
      }
    }
  }

  return result;
}

/**
 * 分块 diff：内容定义分块 → 分块级 LCS → 细粒度精化
 * 适用于大文本（token 数超过 DIFF_MAX_TOKENS），避免 O(n²) LCS 爆炸。
 *
 * 算法流程：
 * 1. 将新旧文本分别做内容定义分块（cdChunk）
 * 2. 以分块为 token 做 LCS，找出哪些分块变了
 * 3. 对变化的分块对做 token 级 LCS，得到精确的词级 diff
 */
function computeChunkedDiff(oldText, newText, depth = 0) {
  const oldChunks = cdChunk(oldText, CHUNK_TARGET_SIZE);
  const newChunks = cdChunk(newText, CHUNK_TARGET_SIZE);

  // 分块级 LCS（分块数通常 < 几百，O(n²) 完全可接受）
  const dp = computeLcsTable(oldChunks, newChunks);
  const chunkSegs = backtrackLcs(dp, oldChunks, newChunks);

  // 对 removed+added 相邻段做细粒度精化
  return refineChunkSegments(chunkSegs, depth);
}

/**
 * 计算前后对比 diff 段落
 * 小文本直接 LCS；大文本用内容定义分块 diff
 */
function computeDiffSegments(oldText, newText) {
  if (!oldText && !newText) {
    return [];
  }
  if (!oldText) {
    return [{ type: 'added', text: newText }];
  }
  if (!newText) {
    return [{ type: 'removed', text: oldText }];
  }

  const oldTokens = tokenizeText(oldText);
  const newTokens = tokenizeText(newText);

  // token 数在限制内 → 直接 LCS（最快最精确）
  if (oldTokens.length <= DIFF_MAX_TOKENS && newTokens.length <= DIFF_MAX_TOKENS) {
    const dp = computeLcsTable(oldTokens, newTokens);
    return backtrackLcs(dp, oldTokens, newTokens);
  }

  // 大文本 → 内容定义分块 diff
  return computeChunkedDiff(oldText, newText);
}

/**
 * 从 diff 段落中提取变化区域（含上下文），中间用省略号连接
 * @returns {{ segments: Array, hasEllipsis: boolean }}
 */
function extractChangeRegions(segments) {
  const changeIdx = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].type !== 'equal') {
      changeIdx.push(i);
    }
  }
  if (changeIdx.length === 0) {
    return { segments, hasEllipsis: false };
  }

  // 合并重叠的可见范围
  const ranges = [];
  for (const idx of changeIdx) {
    const start = Math.max(0, idx - DIFF_CONTEXT_RADIUS);
    const end = Math.min(segments.length - 1, idx + DIFF_CONTEXT_RADIUS);
    if (ranges.length > 0 && start <= ranges[ranges.length - 1].end + 1) {
      ranges[ranges.length - 1].end = end;
    } else {
      ranges.push({ start, end });
    }
  }

  let hasEllipsis = false;
  const result = [];
  for (let i = 0; i < ranges.length; i++) {
    if (i > 0 || ranges[i].start > 0) {
      result.push({ type: 'ellipsis' });
      hasEllipsis = true;
    }
    for (let j = ranges[i].start; j <= ranges[i].end; j++) {
      result.push(segments[j]);
    }
  }
  if (ranges[ranges.length - 1].end < segments.length - 1) {
    result.push({ type: 'ellipsis' });
    hasEllipsis = true;
  }
  return { segments: result, hasEllipsis };
}

/**
 * 渲染 diff 内容为安全 HTML
 * @param {Array} segments - diff 段落
 * @param {'before'|'after'} side - 渲染哪一侧
 */
function renderDiffHtml(segments, side) {
  let html = '';
  for (const seg of segments) {
    if (seg.type === 'ellipsis') {
      html += '<span class="diff-ellipsis"> … </span>';
      continue;
    }
    if (seg.type === 'equal') {
      html += escapeHtml(seg.text);
    } else if (seg.type === 'removed' && side === 'before') {
      html += `<mark class="diff-removed">${escapeHtml(seg.text)}</mark>`;
    } else if (seg.type === 'removed' && side === 'after') {
      // 在"变更后"侧显示删除占位符，让用户知道这里曾有内容被删除
      html += `<span class="diff-deleted-marker" title="已删除的内容">${escapeHtml(seg.text.length > 200 ? seg.text.slice(0, 200) + '…' : seg.text)}</span>`;
    } else if (seg.type === 'added' && side === 'after') {
      html += `<mark class="diff-added">${escapeHtml(seg.text)}</mark>`;
    } else if (seg.type === 'added' && side === 'before') {
      // 在"变更前"侧显示新增占位符
      html += '<span class="diff-added-marker" title="此处新增了内容">[+]</span>';
    }
  }
  return html || '<span class="diff-ellipsis">（无差异）</span>';
}

// ==================== Diff Panel Builders ====================

/**
 * 文本变化：变更前/后左右对比面板
 */
function buildTextDiffPanel(panel, oldText, newText) {
  oldText = oldText || '';
  newText = newText || '';

  if (!oldText && !newText) {
    panel.textContent = '无文本内容';
    return;
  }

  const segments = computeDiffSegments(oldText, newText);
  const { segments: initialRegions, hasEllipsis } = extractChangeRegions(segments);

  // 渲染函数：isExpanded=true 显示全部，false 只显示变化区域
  function render(isExpanded) {
    const displaySegs = isExpanded ? segments : extractChangeRegions(segments).segments;
    return {
      before: renderDiffHtml(displaySegs, 'before'),
      after: renderDiffHtml(displaySegs, 'after'),
    };
  }

  const initial = {
    before: renderDiffHtml(initialRegions, 'before'),
    after: renderDiffHtml(initialRegions, 'after'),
  };

  const grid = document.createElement('div');
  grid.className = 'diff-grid';

  // 工具栏（含切换按钮）
  const toolbar = document.createElement('div');
  toolbar.className = 'diff-toolbar';
  if (hasEllipsis) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-sm btn-secondary diff-toggle';
    toggleBtn.textContent = '显示完整差异';
    let expanded = false;
    toggleBtn.addEventListener('click', () => {
      expanded = !expanded;
      const html = render(expanded);
      grid.querySelector('.diff-column-before .diff-content').innerHTML = html.before;
      grid.querySelector('.diff-column-after .diff-content').innerHTML = html.after;
      toggleBtn.textContent = expanded ? '只显示变化区域' : '显示完整差异';
    });
    toolbar.appendChild(toggleBtn);
  }

  grid.innerHTML = `
    <div class="diff-column diff-column-before">
      <div class="diff-label">变更前</div>
      <div class="diff-content">${initial.before}</div>
    </div>
    <div class="diff-column diff-column-after">
      <div class="diff-label">变更后</div>
      <div class="diff-content">${initial.after}</div>
    </div>
  `;

  panel.appendChild(toolbar);
  panel.appendChild(grid);
}

/**
 * 结构变化：标签摘要 + 标签级前后对比
 */
function buildStructureDiffPanel(panel, oldHtml, newHtml, summary) {
  oldHtml = oldHtml || '';
  newHtml = newHtml || '';

  // 标签摘要
  if (summary) {
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'diff-tag-summary';
    summaryDiv.textContent = summary;
    panel.appendChild(summaryDiv);
  }

  // 提取开标签并按行排列，便于 diff
  const oldTags = extractTagLines(oldHtml);
  const newTags = extractTagLines(newHtml);

  if (oldTags || newTags) {
    const segments = computeDiffSegments(oldTags, newTags);
    const { segments: regions } = extractChangeRegions(segments);
    const beforeHtml = renderDiffHtml(regions, 'before');
    const afterHtml = renderDiffHtml(regions, 'after');

    const grid = document.createElement('div');
    grid.className = 'diff-grid';
    grid.innerHTML = `
      <div class="diff-column">
        <div class="diff-label">变更前标签</div>
        <div class="diff-content">${beforeHtml}</div>
      </div>
      <div class="diff-column">
        <div class="diff-label">变更后标签</div>
        <div class="diff-content">${afterHtml}</div>
      </div>
    `;
    panel.appendChild(grid);
  }
}

/**
 * 关键词匹配：高亮显示关键词在文本中的位置
 */
function buildKeywordDiffPanel(panel, text, keywords) {
  text = text || '';
  keywords = keywords || [];

  if (!text || keywords.length === 0) {
    panel.textContent = '无匹配内容';
    return;
  }

  // 截取关键词附近上下文
  const snippet = extractKeywordSnippet(text, keywords, 2000);
  const snippetEscaped = escapeHtml(snippet);

  let highlighted = snippetEscaped;
  for (const kw of keywords) {
    const escapedKw = escapeHtml(kw);
    const regex = new RegExp(escapeRegExp(escapedKw), 'gi');
    highlighted = highlighted.replace(regex, '<mark class="diff-keyword">$&</mark>');
  }

  const col = document.createElement('div');
  col.className = 'diff-column diff-full-width';
  col.innerHTML = `
    <div class="diff-label">关键词位置</div>
    <div class="diff-content">${highlighted}</div>
  `;
  panel.appendChild(col);
}

// ==================== Diff Helpers ====================

/**
 * 提取 HTML 开标签，按行排列（用于结构 diff）
 */
function extractTagLines(html) {
  if (!html) {
    return '';
  }
  const tags = html.match(/<[\w][^>]*>/g);
  return tags ? tags.join('\n') : '';
}

/**
 * 截取关键词附近上下文片段
 */
function extractKeywordSnippet(text, keywords, maxLen) {
  if (!text || text.length <= maxLen) {
    return text;
  }

  const positions = [];
  for (const kw of keywords) {
    const idx = text.toLowerCase().indexOf(kw.toLowerCase());
    if (idx >= 0) {
      positions.push(idx);
    }
  }
  if (positions.length === 0) {
    return text.slice(0, maxLen) + '…';
  }

  const center = positions[0];
  const halfLen = Math.floor(maxLen / 2);
  let start = Math.max(0, center - halfLen);
  const end = Math.min(text.length, start + maxLen);
  if (end - start < maxLen) {
    start = Math.max(0, end - maxLen);
  }

  let snippet = '';
  if (start > 0) {
    snippet += '…';
  }
  snippet += text.slice(start, end);
  if (end < text.length) {
    snippet += '…';
  }
  return snippet;
}

/**
 * 转义正则特殊字符
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==================== View Changes On Page ====================

/**
 * 在目标页面中高亮显示变化
 * 核心策略：
 * 1. 打开/切换到目标页面，不 reload（保留当前页面状态）
 * 2. 传入完整的快照数据，让注入函数自行渲染完整对比
 * 3. 在页面上方注入一个完整的可视化对比面板（浮动面板）
 * 4. 同时在页面 DOM 中尝试标记新增内容
 */
async function handleViewOnPage(record) {
  // 1. Get task data
  const taskResp = await sendMessage({ type: 'GET_TASK', payload: { taskId: record.taskId } });
  if (!taskResp.success || !taskResp.task) {
    alert('无法获取任务信息');
    return;
  }
  const task = taskResp.task;

  // 2. Prepare full injection data (pass complete snapshots for rendering)
  const injectData = {
    selector: task.selector || '',
    changeType: record.changeType,
    oldText: record.oldSnapshot?.text || '',
    newText: record.newSnapshot?.text || '',
    oldHtml: record.oldSnapshot?.html || '',
    newHtml: record.newSnapshot?.html || '',
    keywords: record.keywordsMatched || [],
    diff: record.diff || '',
  };

  // 3. Open or switch to target tab (NO reload — preserve current page state)
  let tab;
  try {
    const tabs = await chrome.tabs.query({ url: urlToMatchPattern(task.url) });
    if (tabs.length > 0) {
      tab = tabs[0];
      await chrome.tabs.update(tab.id, { active: true });
    } else {
      tab = await chrome.tabs.create({ url: task.url });
    }
  } catch (e) {
    alert('无法打开目标页面: ' + e.message);
    return;
  }

  // 4. Wait for tab to finish loading
  await waitForTabLoad(tab.id);

  // 5. Inject highlight script with full snapshot data
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: highlightOnPage,
      args: [injectData],
    });
    // Focus the tab's window
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (e) {
    alert('无法在该页面显示标记（可能是受保护的页面）: ' + e.message);
  }
}

/**
 * 等待标签页加载完成
 */
function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        done();
      }
    };

    const timeout = setTimeout(() => done(), timeoutMs);

    chrome.tabs.get(tabId, (tab) => {
      if (tab && tab.status === 'complete') {
        done();
        return;
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

/**
 * 自包含的高亮注入函数 — 通过 chrome.scripting.executeScript 注入到目标页面
 * 不能引用任何外部变量或函数
 *
 * 功能：
 * - 顶部浮动工具栏（导航、清除标记、折叠面板）
 * - 完整的变更前后对比面板（不依赖 DOM 匹配，直接用快照数据渲染）
 * - 被监控元素蓝色虚线边框
 * - 新增文本绿色底色标记（尽力在 DOM 中匹配）
 * - 删除内容红色删除线（插入到元素前方 + 面板中完整展示）
 * - 关键词橙色高亮
 * - 自动滚动到对比面板或第一个变化
 *
 * @param {object} data - { selector, changeType, oldText, newText, oldHtml, newHtml, keywords, diff }
 */
/* eslint-disable no-var, no-redeclare, no-inner-declarations, max-depth, complexity */
function highlightOnPage(data) {
  const P = '__pw';
  const TOOLBAR_ID = P + '_toolbar';
  const STYLE_ID = P + '_style';
  const MARK_ADDED = P + '_added';
  const MARK_KEYWORD = P + '_kw';
  const TARGET_CLS = P + '_target';
  const REMOVED_CLS = P + '_removed';
  const PANEL_ID = P + '_panel';

  // If already highlighted, clear and re-apply
  if (document.getElementById(TOOLBAR_ID) || document.getElementById(PANEL_ID)) {
    clearAll();
  }

  // ---- Inject styles ----
  const styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = [
    '.' +
      TARGET_CLS +
      ' { outline: 3px dashed #1a73e8 !important; outline-offset: 6px !important; }',
    '.' +
      MARK_ADDED +
      ' { background: rgba(76,175,80,0.35) !important; border-bottom: 2px solid #4caf50 !important; padding: 0 2px !important; border-radius: 2px !important; cursor: help !important; }',
    '.' +
      MARK_KEYWORD +
      ' { background: rgba(255,152,0,0.35) !important; border-bottom: 2px solid #ff9800 !important; padding: 0 2px !important; border-radius: 2px !important; font-weight: 600 !important; }',
    '.' +
      REMOVED_CLS +
      '_section { background: rgba(244,67,54,0.06) !important; border-left: 3px solid #ef5350 !important; padding: 8px 12px !important; margin: 8px 0 !important; border-radius: 0 4px 4px 0 !important; }',
    '.' +
      REMOVED_CLS +
      '_label { color: #e53935 !important; font-weight: 600 !important; font-size: 0.8em !important; margin-right: 8px !important; cursor: pointer !important; }',
    '.' +
      REMOVED_CLS +
      '_text { color: #b71c1c !important; text-decoration: line-through !important; }',
    '.' +
      REMOVED_CLS +
      '_text.collapsed { max-height: 3em !important; overflow: hidden !important; position: relative !important; }',
    '.' +
      REMOVED_CLS +
      '_text.collapsed::after { content: "...点击展开" !important; position: absolute !important; bottom: 0 !important; left: 0 !important; right: 0 !important; background: linear-gradient(transparent, rgba(244,67,54,0.06)) !important; padding: 4px 0 !important; text-decoration: none !important; font-size: 0.85em !important; cursor: pointer !important; color: #e53935 !important; }',
    '#' +
      TOOLBAR_ID +
      ' { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; z-index: 2147483647 !important; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif !important; font-size: 14px !important; box-shadow: 0 2px 12px rgba(0,0,0,0.25) !important; }',
    '.' +
      P +
      '_main { display: flex !important; align-items: center !important; padding: 10px 16px !important; gap: 12px !important; background: linear-gradient(135deg,#1a73e8,#0d47a1) !important; color: #fff !important; }',
    '.' + P + '_title { font-weight: 700 !important; white-space: nowrap !important; }',
    '.' +
      P +
      '_summary { flex: 1 !important; font-size: 13px !important; opacity: 0.9 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }',
    '.' +
      P +
      '_btn { background: rgba(255,255,255,0.15) !important; border: 1px solid rgba(255,255,255,0.3) !important; color: #fff !important; padding: 4px 12px !important; border-radius: 4px !important; cursor: pointer !important; font-size: 12px !important; transition: background 0.15s !important; white-space: nowrap !important; }',
    '.' + P + '_btn:hover { background: rgba(255,255,255,0.25) !important; }',
    '.' +
      P +
      '_sep { width: 1px !important; height: 20px !important; background: rgba(255,255,255,0.3) !important; flex-shrink: 0 !important; }',
    // Full diff panel styles
    '#' +
      PANEL_ID +
      ' { position: fixed !important; top: 48px !important; left: 12px !important; right: 12px !important; bottom: 12px !important; z-index: 2147483646 !important; background: #fff !important; border-radius: 12px !important; box-shadow: 0 8px 40px rgba(0,0,0,0.3) !important; display: flex !important; flex-direction: column !important; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif !important; overflow: hidden !important; }',
    '.' +
      P +
      '_panel_header { display: flex !important; align-items: center !important; justify-content: space-between !important; padding: 12px 20px !important; background: #fafbfc !important; border-bottom: 1px solid #e8e8e8 !important; }',
    '.' +
      P +
      '_panel_title { font-size: 15px !important; font-weight: 600 !important; color: #333 !important; }',
    '.' +
      P +
      '_panel_close { background: #e0e0e0 !important; border: none !important; width: 32px !important; height: 32px !important; border-radius: 50% !important; cursor: pointer !important; font-size: 18px !important; display: flex !important; align-items: center !important; justify-content: center !important; color: #666 !important; }',
    '.' + P + '_panel_close:hover { background: #d0d0d0 !important; }',
    '.' +
      P +
      '_panel_body { flex: 1 !important; display: flex !important; flex-direction: column !important; overflow: hidden !important; }',
    '.' +
      P +
      '_diff_tabs { display: flex !important; border-bottom: 1px solid #e0e0e0 !important; padding: 0 16px !important; }',
    '.' +
      P +
      '_diff_tab { padding: 8px 16px !important; font-size: 13px !important; font-weight: 500 !important; color: #666 !important; cursor: pointer !important; border-bottom: 2px solid transparent !important; margin-bottom: -1px !important; background: none !important; border-top: none !important; border-left: none !important; border-right: none !important; }',
    '.' + P + '_diff_tab:hover { color: #1a73e8 !important; }',
    '.' +
      P +
      '_diff_tab.active { color: #1a73e8 !important; border-bottom-color: #1a73e8 !important; }',
    '.' +
      P +
      '_diff_content { flex: 1 !important; overflow-y: auto !important; padding: 16px 20px !important; }',
    '.' +
      P +
      '_diff_grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 16px !important; min-height: 100% !important; }',
    '.' + P + '_diff_col { min-width: 0 !important; }',
    '.' +
      P +
      '_diff_label { font-size: 11px !important; font-weight: 600 !important; color: #888 !important; text-transform: uppercase !important; letter-spacing: 0.5px !important; margin-bottom: 8px !important; }',
    '.' +
      P +
      '_diff_text { background: #fafbfc !important; border: 1px solid #e8e8e8 !important; border-radius: 6px !important; padding: 12px 14px !important; font-size: 13px !important; line-height: 1.7 !important; word-break: break-word !important; white-space: pre-wrap !important; color: #333 !important; max-height: none !important; font-family: Consolas,Monaco,"Courier New",monospace !important; }',
    '.' +
      P +
      '_diff_text mark.removed { background: #fdd !important; color: #b71c1c !important; text-decoration: line-through !important; border-radius: 2px !important; padding: 1px 3px !important; }',
    '.' +
      P +
      '_diff_text mark.added { background: #c8e6c9 !important; color: #1b5e20 !important; border-radius: 2px !important; padding: 1px 3px !important; }',
    '.' +
      P +
      '_diff_text .diff-ellipsis { color: #aaa !important; font-style: italic !important; }',
    '.' +
      P +
      '_diff_text .diff-deleted-marker { background: #fce4ec !important; color: #c62828 !important; text-decoration: line-through !important; opacity: 0.65 !important; border-radius: 2px !important; padding: 1px 4px !important; font-size: 0.9em !important; cursor: help !important; }',
    '.' +
      P +
      '_diff_text .diff-added-marker { background: #e8f5e9 !important; color: #2e7d32 !important; border-radius: 2px !important; padding: 1px 4px !important; font-size: 0.85em !important; cursor: help !important; }',
    '.' +
      P +
      '_diff_text mark.keyword { background: #ffe0b2 !important; color: #e65100 !important; border-radius: 2px !important; padding: 1px 3px !important; font-weight: 600 !important; }',
    '.' + P + '_kw_section { padding: 8px 0 !important; }',
    '.' +
      P +
      '_kw_item { padding: 6px 12px !important; margin: 6px 0 !important; background: #fff3e0 !important; border-left: 3px solid #ff9800 !important; border-radius: 0 4px 4px 0 !important; font-size: 13px !important; color: #e65100 !important; font-weight: 500 !important; }',
    '.' +
      P +
      '_struct_summary { padding: 12px 16px !important; background: #f0f4ff !important; border-radius: 6px !important; margin-bottom: 12px !important; line-height: 1.5 !important; font-size: 13px !important; color: #555 !important; }',
    // Overlay backdrop for panel
    '#' +
      P +
      '_backdrop { position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.3) !important; z-index: 2147483645 !important; }',
    'body.' + P + '_active { padding-top: 0 !important; }',
  ].join('\n');
  document.head.appendChild(styleEl);

  // ---- Find target element ----
  const el = data.selector ? document.querySelector(data.selector) : document.body;

  // Mark target element (if found)
  if (el) {
    el.classList.add(TARGET_CLS);
  }

  // ---- Compute diff segments (self-contained, no external deps) ----
  let segments = [];
  let addedChunks = [];
  let removedChunks = [];

  if (data.changeType === 'text_change' && (data.oldText || data.newText)) {
    segments = computeDiffLocally(data.oldText, data.newText);
    addedChunks = [];
    removedChunks = [];
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].type === 'added' && segments[i].text.trim()) {
        addedChunks.push(segments[i].text);
      }
      if (segments[i].type === 'removed' && segments[i].text.trim()) {
        removedChunks.push(segments[i].text);
      }
    }
  }

  // ---- Apply in-page highlights (best-effort) ----
  let marks = [];
  if (el) {
    if (data.changeType === 'text_change') {
      marks = applyAddedHighlights(el, addedChunks);
      insertRemovedBlocks(el, removedChunks);
    } else if (data.changeType === 'keyword_found') {
      marks = applyKeywordHighlights(el, data.keywords || []);
    }
  }

  // ---- Build toolbar ----
  buildToolbar(data, segments, marks);

  // ---- Build full comparison panel ----
  buildFullPanel(data, segments);

  // ---- Scroll ----
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ========== Self-contained diff engine (LCS-based) ==========
  // Tiny tokenizer: CJK char-by-char, English by word
  function tokenizeLocal(text) {
    if (!text) {
      return [];
    }
    const tokens = [];
    const re =
      /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]|[a-zA-Z0-9]+|\s+|[^\s\w\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      tokens.push(m[0]);
    }
    return tokens;
  }

  function lcsLocal(a, b) {
    const m = a.length,
      n = b.length;
    const dp = new Array(m + 1);
    for (var i = 0; i <= m; i++) {
      dp[i] = new Uint16Array(n + 1);
    }
    for (var i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = dp[i - 1][j] > dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1];
        }
      }
    }
    return dp;
  }

  function backtrackLocal(dp, a, b) {
    const raw = [];
    let i = a.length,
      j = b.length;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        raw.push({ type: 'equal', text: a[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        raw.push({ type: 'added', text: b[j - 1] });
        j--;
      } else {
        raw.push({ type: 'removed', text: a[i - 1] });
        i--;
      }
    }
    raw.reverse();
    const merged = [];
    for (let k = 0; k < raw.length; k++) {
      const last = merged[merged.length - 1];
      if (last && last.type === raw[k].type) {
        last.text += raw[k].text;
      } else {
        merged.push({ type: raw[k].type, text: raw[k].text });
      }
    }
    return merged;
  }

  function computeDiffLocally(oldText, newText) {
    if (!oldText && !newText) {
      return [];
    }
    if (!oldText) {
      return [{ type: 'added', text: newText }];
    }
    if (!newText) {
      return [{ type: 'removed', text: oldText }];
    }
    const MAX_T = 2000;
    const ot = tokenizeLocal(oldText);
    const nt = tokenizeLocal(newText);
    if (ot.length <= MAX_T && nt.length <= MAX_T) {
      return backtrackLocal(lcsLocal(ot, nt), ot, nt);
    }
    // For very large texts, do line-level diff
    const ol = oldText.split('\n');
    const nl = newText.split('\n');
    const segs = [];
    const maxLen = Math.max(ol.length, nl.length);
    for (let i = 0; i < maxLen; i++) {
      if (ol[i] === nl[i]) {
        segs.push({ type: 'equal', text: ol[i] + '\n' });
      } else {
        if (ol[i] !== undefined) {
          segs.push({ type: 'removed', text: ol[i] + '\n' });
        }
        if (nl[i] !== undefined) {
          segs.push({ type: 'added', text: nl[i] + '\n' });
        }
      }
    }
    return segs;
  }

  // ========== Rendering helpers ==========
  function escHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function renderDiffToHtml(segs, side) {
    let html = '';
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.type === 'equal') {
        html += escHtml(s.text);
      } else if (s.type === 'removed' && side === 'before') {
        html += '<mark class="removed">' + escHtml(s.text) + '</mark>';
      } else if (s.type === 'removed' && side === 'after') {
        const txt = s.text.length > 500 ? s.text.slice(0, 500) + '\u2026' : s.text;
        html +=
          '<span class="diff-deleted-marker" title="已删除的内容">' + escHtml(txt) + '</span>';
      } else if (s.type === 'added' && side === 'after') {
        html += '<mark class="added">' + escHtml(s.text) + '</mark>';
      } else if (s.type === 'added' && side === 'before') {
        html += '<span class="diff-added-marker" title="此处新增了内容">[+]</span>';
      }
    }
    return html || '<span class="diff-ellipsis">（无差异）</span>';
  }

  // ========== In-page highlight functions ==========

  function collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    let n;
    while ((n = walker.nextNode())) {
      if (n.textContent.trim()) {
        nodes.push(n);
      }
    }
    return nodes;
  }

  /**
   * Improved added highlight: tries exact match first,
   * then falls back to searching across concatenated textNodes
   */
  function applyAddedHighlights(root, chunks) {
    const result = [];
    let textNodes = collectTextNodes(root);

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      if (!chunk || !chunk.trim()) {
        continue;
      }
      let found = false;

      // Strategy 1: exact match in a single textNode
      for (var j = 0; j < textNodes.length; j++) {
        const idx = textNodes[j].textContent.indexOf(chunk);
        if (idx >= 0) {
          try {
            const range = document.createRange();
            range.setStart(textNodes[j], idx);
            range.setEnd(textNodes[j], idx + chunk.length);
            const mark = document.createElement('mark');
            mark.className = MARK_ADDED;
            mark.title = '新增内容';
            range.surroundContents(mark);
            result.push(mark);
            textNodes = collectTextNodes(root);
            found = true;
          } catch (e) {
            /* cross-boundary, try next strategy */
          }
          break;
        }
      }
      if (found) {
        continue;
      }

      // Strategy 2: search across concatenated textNodes (cross-node match)
      // Build a map of textNode → cumulative offset
      let fullText = '';
      const nodeMap = []; // { node, start, end }
      for (var j = 0; j < textNodes.length; j++) {
        const start = fullText.length;
        fullText += textNodes[j].textContent;
        nodeMap.push({ node: textNodes[j], start: start, end: fullText.length });
      }

      const crossIdx = fullText.indexOf(chunk);
      if (crossIdx >= 0) {
        // Found across nodes — highlight each portion within its node
        const chunkStart = crossIdx;
        const chunkEnd = crossIdx + chunk.length;
        const tempMarks = [];
        try {
          for (let k = 0; k < nodeMap.length && chunkStart < chunkEnd; k++) {
            const nm = nodeMap[k];
            const overlapStart = Math.max(chunkStart, nm.start);
            const overlapEnd = Math.min(chunkEnd, nm.end);
            if (overlapStart >= overlapEnd) {
              continue;
            }
            const localStart = overlapStart - nm.start;
            const localEnd = overlapEnd - nm.start;
            const r = document.createRange();
            r.setStart(nm.node, localStart);
            r.setEnd(nm.node, localEnd);
            const mk = document.createElement('mark');
            mk.className = MARK_ADDED;
            mk.title = '新增内容';
            r.surroundContents(mk);
            tempMarks.push(mk);
          }
          for (let t = 0; t < tempMarks.length; t++) {
            result.push(tempMarks[t]);
          }
          textNodes = collectTextNodes(root);
        } catch (e) {
          /* cross-boundary within nested elements, skip */
        }
      }
    }
    return result;
  }

  function applyKeywordHighlights(root, keywords) {
    const result = [];
    if (!keywords || keywords.length === 0) {
      return result;
    }
    let textNodes = collectTextNodes(root);

    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      for (let j = 0; j < textNodes.length; j++) {
        const idx = textNodes[j].textContent.toLowerCase().indexOf(kw.toLowerCase());
        if (idx >= 0) {
          try {
            const range = document.createRange();
            range.setStart(textNodes[j], idx);
            range.setEnd(textNodes[j], idx + kw.length);
            const mark = document.createElement('mark');
            mark.className = MARK_KEYWORD;
            mark.title = '匹配关键词: ' + kw;
            range.surroundContents(mark);
            result.push(mark);
            textNodes = collectTextNodes(root);
          } catch (e) {
            /* skip */
          }
          break;
        }
      }
    }
    return result;
  }

  function insertRemovedBlocks(root, chunks) {
    if (!chunks || chunks.length === 0) {
      return;
    }
    const filtered = [];
    for (var i = 0; i < chunks.length; i++) {
      if (chunks[i] && chunks[i].trim()) {
        filtered.push(chunks[i]);
      }
    }
    if (filtered.length === 0) {
      return;
    }

    const container = document.createElement('div');
    container.className = REMOVED_CLS + '_section';

    const label = document.createElement('span');
    label.className = REMOVED_CLS + '_label';
    label.textContent = '已删除的内容 (' + filtered.length + ' 处):';
    container.appendChild(label);

    for (var i = 0; i < filtered.length; i++) {
      const text = document.createElement('span');
      text.className = REMOVED_CLS + '_text';
      text.textContent = filtered[i];
      // Truncate display with click-to-expand (using max-height instead of textContent truncation)
      if (filtered[i].length > 300) {
        text.classList.add('collapsed');
        text.title = '点击展开完整删除内容';
        (function (txtEl) {
          txtEl.addEventListener('click', function () {
            txtEl.classList.toggle('collapsed');
            txtEl.title = txtEl.classList.contains('collapsed')
              ? '点击展开完整删除内容'
              : '点击收起';
          });
        })(text);
      }
      container.appendChild(text);
      if (i < filtered.length - 1) {
        container.appendChild(document.createElement('br'));
      }
    }

    // Insert before the target element
    if (root.parentNode) {
      root.parentNode.insertBefore(container, root);
    }
  }

  // ========== Toolbar ==========

  function buildToolbar(data, segments, marks) {
    const toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;

    const main = document.createElement('div');
    main.className = P + '_main';

    // Title
    const title = document.createElement('span');
    title.className = P + '_title';
    title.textContent = '\u{1F50D} PageWhat';
    main.appendChild(title);

    // Summary
    const summary = document.createElement('span');
    summary.className = P + '_summary';
    if (data.changeType === 'text_change') {
      let ac = 0,
        rc = 0;
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].type === 'added' && segments[i].text.trim()) {
          ac++;
        }
        if (segments[i].type === 'removed' && segments[i].text.trim()) {
          rc++;
        }
      }
      summary.textContent = ac + ' 处新增, ' + rc + ' 处删除';
    } else if (data.changeType === 'keyword_found') {
      summary.textContent = '发现关键词: ' + (data.keywords || []).join(', ');
    } else {
      summary.textContent = '页面结构发生变化';
    }
    main.appendChild(summary);

    // "查看完整对比" button — opens the full diff panel
    const sep0 = document.createElement('div');
    sep0.className = P + '_sep';
    main.appendChild(sep0);
    const panelBtn = document.createElement('button');
    panelBtn.className = P + '_btn';
    panelBtn.textContent = '\u{1F4CA} 查看完整对比';
    main.appendChild(panelBtn);

    // Navigation (prev/next mark) — only if there are in-page marks
    if (marks.length > 0) {
      const sep1 = document.createElement('div');
      sep1.className = P + '_sep';
      main.appendChild(sep1);

      const nav = document.createElement('div');
      nav.className = P + '_nav';
      nav.style.cssText = 'display:flex;align-items:center;gap:6px;';

      const prevBtn = document.createElement('button');
      prevBtn.className = P + '_btn';
      prevBtn.textContent = '\u25C0 上一个';

      const counter = document.createElement('span');
      counter.textContent = '0/' + marks.length;

      const nextBtn = document.createElement('button');
      nextBtn.className = P + '_btn';
      nextBtn.textContent = '下一个 \u25B6';

      let currentIdx = -1;

      function navigateTo(idx) {
        if (idx < 0 || idx >= marks.length) {
          return;
        }
        currentIdx = idx;
        counter.textContent = idx + 1 + '/' + marks.length;
        marks[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        marks[idx].style.transition = 'transform 0.15s';
        marks[idx].style.transform = 'scale(1.15)';
        setTimeout(function () {
          marks[idx].style.transform = '';
        }, 300);
        prevBtn.disabled = idx === 0;
        nextBtn.disabled = idx === marks.length - 1;
      }

      prevBtn.addEventListener('click', function () {
        navigateTo(currentIdx - 1);
      });
      nextBtn.addEventListener('click', function () {
        navigateTo(currentIdx + 1);
      });
      prevBtn.disabled = true;

      nav.appendChild(prevBtn);
      nav.appendChild(counter);
      nav.appendChild(nextBtn);
      main.appendChild(nav);

      setTimeout(function () {
        navigateTo(0);
      }, 600);
    }

    // Dismiss button
    const sep3 = document.createElement('div');
    sep3.className = P + '_sep';
    main.appendChild(sep3);

    const dismissBtn = document.createElement('button');
    dismissBtn.className = P + '_btn';
    dismissBtn.textContent = '\u2715 清除标记';
    dismissBtn.addEventListener('click', clearAll);
    main.appendChild(dismissBtn);

    toolbar.appendChild(main);

    // Panel toggle
    panelBtn.addEventListener('click', function () {
      const panel = document.getElementById(PANEL_ID);
      const backdrop = document.getElementById(P + '_backdrop');
      if (panel) {
        panel.remove();
        if (backdrop) {
          backdrop.remove();
        }
      } else {
        buildFullPanel(data, segments);
        const bd = document.createElement('div');
        bd.id = P + '_backdrop';
        bd.addEventListener('click', function () {
          const p = document.getElementById(PANEL_ID);
          if (p) {
            p.remove();
          }
          bd.remove();
        });
        document.body.appendChild(bd);
      }
    });

    document.body.appendChild(toolbar);
    document.body.classList.add(P + '_active');
  }

  // ========== Full Comparison Panel ==========

  function buildFullPanel(data, segments) {
    // Remove existing panel if present
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      existing.remove();
    }

    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    // Header
    const header = document.createElement('div');
    header.className = P + '_panel_header';
    const htitle = document.createElement('span');
    htitle.className = P + '_panel_title';
    if (data.changeType === 'text_change') {
      htitle.textContent = '\u{1F4CA} 文本变化对比';
    } else if (data.changeType === 'keyword_found') {
      htitle.textContent = '\u{1F50D} 关键词匹配详情';
    } else if (data.changeType === 'structure_change') {
      htitle.textContent = '\u{1F3D7} 结构变化对比';
    } else {
      htitle.textContent = '\u{1F4CA} 变化详情';
    }
    header.appendChild(htitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = P + '_panel_close';
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', function () {
      panel.remove();
      const bd = document.getElementById(P + '_backdrop');
      if (bd) {
        bd.remove();
      }
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = P + '_panel_body';

    if (data.changeType === 'text_change') {
      buildTextDiffInPanel(body, segments);
    } else if (data.changeType === 'keyword_found') {
      buildKeywordDiffInPanel(body, data);
    } else if (data.changeType === 'structure_change') {
      buildStructureDiffInPanel(body, data);
    }

    panel.appendChild(body);
    document.body.appendChild(panel);

    // Auto-scroll to panel
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildTextDiffInPanel(body, segments) {
    // Tab: change regions / full text
    const tabsDiv = document.createElement('div');
    tabsDiv.className = P + '_diff_tabs';

    const tabChange = document.createElement('button');
    tabChange.className = P + '_diff_tab active';
    tabChange.textContent = '变化区域';
    const tabFull = document.createElement('button');
    tabFull.className = P + '_diff_tab';
    tabFull.textContent = '完整文本';
    tabsDiv.appendChild(tabChange);
    tabsDiv.appendChild(tabFull);
    body.appendChild(tabsDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = P + '_diff_content';

    // Render change regions (default)
    const changeRegions = extractChangeRegionsLocal(segments);
    contentDiv.appendChild(renderDiffGrid(contentDiv, changeRegions));

    // Tab switching
    tabChange.addEventListener('click', function () {
      tabChange.classList.add('active');
      tabFull.classList.remove('active');
      contentDiv.innerHTML = '';
      contentDiv.appendChild(renderDiffGrid(contentDiv, extractChangeRegionsLocal(segments)));
    });
    tabFull.addEventListener('click', function () {
      tabFull.classList.add('active');
      tabChange.classList.remove('active');
      contentDiv.innerHTML = '';
      contentDiv.appendChild(renderDiffGrid(contentDiv, segments));
    });

    body.appendChild(contentDiv);
  }

  function extractChangeRegionsLocal(segments) {
    const changeIdx = [];
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].type !== 'equal') {
        changeIdx.push(i);
      }
    }
    if (changeIdx.length === 0) {
      return segments;
    }

    const RADIUS = 200;
    const ranges = [];
    for (let c = 0; c < changeIdx.length; c++) {
      const start = Math.max(0, changeIdx[c] - RADIUS);
      const end = Math.min(segments.length - 1, changeIdx[c] + RADIUS);
      if (ranges.length > 0 && start <= ranges[ranges.length - 1].end + 1) {
        ranges[ranges.length - 1].end = end;
      } else {
        ranges.push({ start: start, end: end });
      }
    }

    const result = [];
    for (var i = 0; i < ranges.length; i++) {
      if (i > 0 || ranges[i].start > 0) {
        result.push({ type: 'ellipsis', text: ' \u2026 ' });
      }
      for (let j = ranges[i].start; j <= ranges[i].end; j++) {
        result.push(segments[j]);
      }
    }
    if (ranges[ranges.length - 1].end < segments.length - 1) {
      result.push({ type: 'ellipsis', text: ' \u2026 ' });
    }
    return result;
  }

  function renderDiffGrid(parent, segs) {
    const grid = document.createElement('div');
    grid.className = P + '_diff_grid';

    const beforeCol = document.createElement('div');
    beforeCol.className = P + '_diff_col';
    const beforeLabel = document.createElement('div');
    beforeLabel.className = P + '_diff_label';
    beforeLabel.textContent = '变更前';
    beforeCol.appendChild(beforeLabel);
    const beforeText = document.createElement('div');
    beforeText.className = P + '_diff_text';
    beforeText.innerHTML = renderDiffToHtml(segs, 'before');
    beforeCol.appendChild(beforeText);

    const afterCol = document.createElement('div');
    afterCol.className = P + '_diff_col';
    const afterLabel = document.createElement('div');
    afterLabel.className = P + '_diff_label';
    afterLabel.textContent = '变更后';
    afterCol.appendChild(afterLabel);
    const afterText = document.createElement('div');
    afterText.className = P + '_diff_text';
    afterText.innerHTML = renderDiffToHtml(segs, 'after');
    afterCol.appendChild(afterText);

    grid.appendChild(beforeCol);
    grid.appendChild(afterCol);
    return grid;
  }

  function buildKeywordDiffInPanel(body, data) {
    const contentDiv = document.createElement('div');
    contentDiv.className = P + '_diff_content';
    contentDiv.style.maxWidth = '700px';

    if (!data.keywords || data.keywords.length === 0) {
      contentDiv.textContent = '无匹配关键词';
      body.appendChild(contentDiv);
      return;
    }

    const desc = document.createElement('p');
    desc.style.cssText = 'color:#666;font-size:13px;margin-bottom:16px;';
    desc.textContent = '以下关键词在页面中被找到：';
    contentDiv.appendChild(desc);

    for (let i = 0; i < data.keywords.length; i++) {
      const item = document.createElement('div');
      item.className = P + '_kw_item';
      item.textContent = '\u{1F534} ' + data.keywords[i];
      contentDiv.appendChild(item);
    }

    // Show context around keywords in the page text
    if (data.newText) {
      const ctxTitle = document.createElement('p');
      ctxTitle.style.cssText = 'color:#666;font-size:13px;margin:16px 0 8px;font-weight:600;';
      ctxTitle.textContent = '关键词上下文：';
      contentDiv.appendChild(ctxTitle);

      const ctxDiv = document.createElement('div');
      ctxDiv.className = P + '_diff_text';
      ctxDiv.style.maxHeight = '400px';
      ctxDiv.style.overflow = 'auto';

      let snippet = data.newText;
      if (snippet.length > 5000) {
        // Find first keyword position and extract context
        const kw = data.keywords[0] || '';
        const kwIdx = snippet.toLowerCase().indexOf(kw.toLowerCase());
        if (kwIdx >= 0) {
          const half = 2000;
          const s = Math.max(0, kwIdx - half);
          const e = Math.min(snippet.length, kwIdx + half + 2000);
          snippet =
            (s > 0 ? '\u2026' : '') + snippet.slice(s, e) + (e < snippet.length ? '\u2026' : '');
        } else {
          snippet = snippet.slice(0, 5000) + '\u2026';
        }
      }

      let escaped = escHtml(snippet);
      for (let k = 0; k < data.keywords.length; k++) {
        const kwEsc = escHtml(data.keywords[k]);
        const re = new RegExp(kwEsc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        escaped = escaped.replace(re, '<mark class="keyword">$&</mark>');
      }
      ctxDiv.innerHTML = escaped;
      contentDiv.appendChild(ctxDiv);
    }

    body.appendChild(contentDiv);
  }

  function buildStructureDiffInPanel(body, data) {
    const contentDiv = document.createElement('div');
    contentDiv.className = P + '_diff_content';

    // Show summary
    if (data.diff) {
      const summary = document.createElement('div');
      summary.className = P + '_struct_summary';
      summary.textContent = data.diff;
      contentDiv.appendChild(summary);
    }

    // Tag-level diff
    const oldTags = extractTagLinesLocal(data.oldHtml || '');
    const newTags = extractTagLinesLocal(data.newHtml || '');

    if (oldTags || newTags) {
      const segments = computeDiffLocally(oldTags, newTags);
      const regions = extractChangeRegionsLocal(segments);
      contentDiv.appendChild(renderDiffGrid(contentDiv, regions));
    } else {
      const noData = document.createElement('p');
      noData.style.cssText = 'color:#999;font-size:13px;';
      noData.textContent = '无结构数据可用于对比。';
      contentDiv.appendChild(noData);
    }

    body.appendChild(contentDiv);
  }

  function extractTagLinesLocal(html) {
    if (!html) {
      return '';
    }
    const tags = html.match(/<[\w][^>]*>/g);
    return tags ? tags.join('\n') : '';
  }

  // ========== Clear all ==========

  function clearAll() {
    const tb = document.getElementById(TOOLBAR_ID);
    if (tb) {
      tb.remove();
    }
    const pn = document.getElementById(PANEL_ID);
    if (pn) {
      pn.remove();
    }
    const bd = document.getElementById(P + '_backdrop');
    if (bd) {
      bd.remove();
    }
    const st = document.getElementById(STYLE_ID);
    if (st) {
      st.remove();
    }
    document.body.classList.remove(P + '_active');
    const targets = document.querySelectorAll('.' + TARGET_CLS);
    for (var i = 0; i < targets.length; i++) {
      targets[i].classList.remove(TARGET_CLS);
    }
    const marks = document.querySelectorAll('.' + MARK_ADDED + ', .' + MARK_KEYWORD);
    for (var i = 0; i < marks.length; i++) {
      const m = marks[i];
      const parent = m.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(m.textContent), m);
        parent.normalize();
      }
    }
    const sections = document.querySelectorAll('.' + REMOVED_CLS + '_section');
    for (var i = 0; i < sections.length; i++) {
      sections[i].remove();
    }
  }
}
/* eslint-enable no-var, no-redeclare, no-inner-declarations, max-depth, complexity */
