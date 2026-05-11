/**
 * options.js - 管理页面逻辑
 */

// ==================== DOM Elements ====================

const $ = id => document.getElementById(id);

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
  setEnableSound: $('set-enable-sound'),
  setSoundVolume: $('set-sound-volume'),
  volumeLabel: $('volume-label'),
  setMaxHistory: $('set-max-history'),
  btnExport: $('btn-export'),
  btnClearAllHistory: $('btn-clear-all-history'),
  btnSaveSettings: $('btn-save-settings')
};

let editingTaskId = null;

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
  dom.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      dom.tabs.forEach(t => t.classList.remove('active'));
      dom.tabContents.forEach(tc => tc.classList.remove('active'));

      tab.classList.add('active');
      const tabId = `tab-${tab.dataset.tab}`;
      document.getElementById(tabId).classList.add('active');

      // Load data for the active tab
      if (tab.dataset.tab === 'monitors') loadMonitorsTab();
      if (tab.dataset.tab === 'changes') loadChangesTab();
      if (tab.dataset.tab === 'errors') loadErrorsTab();
      if (tab.dataset.tab === 'settings') loadSettings();
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
    if (e.target === dom.modalOverlay) closeModal();
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
    .map(k => k.trim())
    .filter(k => k);
  const intervalMinutes = parseInt(dom.optInterval.value);
  const name = dom.optName.value.trim();

  if (!url) return alert('请输入 URL');
  // selector 可选，为空时监控整个页面
  if (monitorType === 'keyword' && keywords.length === 0) return alert('请输入关键词');

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
          intervalMinutes
        }
      });
    } else {
      response = await sendMessage({
        type: 'ADD_TASK',
        payload: { name, url, selector, monitorType, keywords, intervalMinutes }
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
    if (!btn) return;

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
  if (!confirm('确定删除此监控任务？相关历史记录也将被删除。')) return;
  await sendMessage({ type: 'DELETE_TASK', payload: { taskId } });
  await loadMonitorsTab();
}

async function loadMonitorsTab() {
  try {
    const response = await sendMessage({ type: 'GET_TASKS' });
    if (!response.success) return;

    const tasks = response.tasks;
    if (tasks.length === 0) {
      dom.tasksEmpty.classList.remove('hidden');
      dom.taskTbody.innerHTML = '';
      return;
    }

    dom.tasksEmpty.classList.add('hidden');

    // Sort: active first
    tasks.sort((a, b) => {
      if (a.isActive !== b.isActive) return b.isActive - a.isActive;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    dom.taskTbody.innerHTML = tasks.map(task => `
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
    `).join('');
  } catch (e) {
    console.error('Failed to load monitors:', e);
  }
}

// ==================== Changes Tab ====================

async function loadChangesTab() {
  try {
    const [historyResp, tasksResp] = await Promise.all([
      sendMessage({ type: 'GET_ALL_HISTORY' }),
      sendMessage({ type: 'GET_TASKS' })
    ]);

    if (!historyResp.success) return;

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
      records = records.filter(r => r.taskId === taskFilter);
    }

    if (timeFilter === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      records = records.filter(r => r.detectedAt && r.detectedAt.startsWith(today));
    } else if (timeFilter === 'week') {
      const weekAgo = Date.now() - 7 * 86400000;
      records = records.filter(r => r.detectedAt && new Date(r.detectedAt).getTime() > weekAgo);
    }

    if (unreadOnly) {
      records = records.filter(r => !r.isRead);
    }

    if (records.length === 0) {
      dom.changesEmpty.classList.remove('hidden');
      dom.changesList.querySelectorAll('.change-card').forEach(el => el.remove());
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

    dom.changesList.querySelectorAll('.change-card').forEach(el => el.remove());

    const fragment = document.createDocumentFragment();
    for (const record of records) {
      fragment.appendChild(createChangeCard(record, taskMap[record.taskId] || '未知任务'));
    }
    dom.changesList.appendChild(fragment);
  } catch (e) {
    console.error('Failed to load changes:', e);
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
  const typeClass = record.changeType === 'text_change' ? 'text'
    : record.changeType === 'structure_change' ? 'structure' : 'keyword';
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
    buildStructureDiffPanel(diffPanel, record.oldSnapshot?.html, record.newSnapshot?.html, record.diff);
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
      await sendMessage({ type: 'MARK_READ', payload: { recordId: record.id, taskId: record.taskId } });
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
dom.filterTask.addEventListener('change', () => loadChangesTab());
dom.filterTime.addEventListener('change', () => loadChangesTab());
dom.filterUnread.addEventListener('change', () => loadChangesTab());
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
  try {
    const [errorsResp, tasksResp] = await Promise.all([
      sendMessage({ type: 'GET_ALL_ERRORS' }),
      sendMessage({ type: 'GET_TASKS' })
    ]);

    if (!errorsResp.success) return;

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
      records = records.filter(r => r.taskId === taskFilter);
    }

    if (records.length === 0) {
      dom.errorsEmpty.classList.remove('hidden');
      dom.errorsList.querySelectorAll('.error-card').forEach(el => el.remove());
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

    dom.errorsList.querySelectorAll('.error-card').forEach(el => el.remove());

    const fragment = document.createDocumentFragment();
    for (const record of records) {
      fragment.appendChild(createErrorCard(record, taskMap[record.taskId] || '未知任务'));
    }
    dom.errorsList.appendChild(fragment);
  } catch (e) {
    console.error('Failed to load errors:', e);
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

dom.filterErrorTask.addEventListener('change', () => loadErrorsTab());
dom.btnClearAllErrors.addEventListener('click', async () => {
  if (!confirm('确定清除全部错误记录？')) return;
  await sendMessage({ type: 'CLEAR_ALL_ERRORS' });
  await loadErrorsTab();
});

// ==================== Settings Tab ====================

function setupSettings() {
  dom.setSoundVolume.addEventListener('input', () => {
    dom.volumeLabel.textContent = dom.setSoundVolume.value + '%';
  });

  dom.btnSaveSettings.addEventListener('click', handleSaveSettings);

  dom.btnExport.addEventListener('click', handleExport);

  dom.btnClearAllHistory.addEventListener('click', async () => {
    if (!confirm('确定清除全部历史记录？此操作不可恢复。')) return;
    const response = await sendMessage({ type: 'CLEAR_ALL_HISTORY' });
    if (response.success) {
      alert('历史记录已清除');
    }
  });
}

async function loadSettings() {
  try {
    const response = await sendMessage({ type: 'GET_SETTINGS' });
    if (!response.success) return;

    const s = response.settings;
    dom.setDefaultInterval.value = s.defaultIntervalMinutes;
    dom.setMaxConcurrent.value = s.maxConcurrentChecks;
    dom.setAutoDisable.value = s.autoDisableOnErrorCount;
    dom.setCheckMethod.value = s.checkMethod;
    dom.setEnableNotifications.checked = s.enableNotifications;
    dom.setEnableBadge.checked = s.enableBadge;
    dom.setEnableSound.checked = s.enableSound;
    dom.setSoundVolume.value = Math.round(s.soundVolume * 100);
    dom.volumeLabel.textContent = Math.round(s.soundVolume * 100) + '%';
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
        enableSound: dom.setEnableSound.checked,
        soundVolume: parseInt(dom.setSoundVolume.value) / 100,
        maxHistoryPerTask: parseInt(dom.setMaxHistory.value)
      }
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
    if (!response.success) return;

    const blob = new Blob([JSON.stringify(response.history, null, 2)], { type: 'application/json' });
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
      resolve(response || { success: false, error: 'No response' });
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
  if (!task.isActive) return 'gray';
  if (task.errorCount > 0) return 'red';
  return 'green';
}

function getTypeLabel(type) {
  const labels = {
    text: '文本',
    structure: '结构',
    keyword: '关键词',
    text_change: '文本变化',
    structure_change: '结构变化',
    keyword_found: '关键词'
  };
  return labels[type] || type;
}

function formatTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 172800000) return '昨天';

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ==================== Diff Engine ====================

const DIFF_MAX_TOKENS = 2000;   // 超过则降级为行级 diff
const DIFF_CONTEXT_RADIUS = 30; // 变化区域前后保留的 token 数
const DIFF_TRUNCATE_LEN = 6000; // 文本最大处理长度

/**
 * 将文本分割为 token 数组
 * CJK 字符逐字、英文按单词、空白和标点各自分组
 */
function tokenizeText(text) {
  if (!text) return [];
  const tokens = [];
  const regex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]|[a-zA-Z0-9]+|\s+|[^\s\w\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+/g;
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
  const m = a.length, n = b.length;
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
  let i = a.length, j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      raw.push({ type: 'equal', text: a[i - 1] });
      i--; j--;
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
 * 简单行级 diff（大文本降级方案）
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
      if (o !== undefined) segments.push({ type: 'removed', text: o + '\n' });
      if (n !== undefined) segments.push({ type: 'added', text: n + '\n' });
    }
  }
  return segments;
}

/**
 * 计算前后对比 diff 段落
 */
function computeDiffSegments(oldText, newText) {
  if (!oldText && !newText) return [];
  if (!oldText) return [{ type: 'added', text: newText }];
  if (!newText) return [{ type: 'removed', text: oldText }];

  // 截断过长文本
  const truncMark = '…[内容过长已截断]';
  const oldT = oldText.length > DIFF_TRUNCATE_LEN
    ? oldText.slice(0, DIFF_TRUNCATE_LEN) + truncMark : oldText;
  const newT = newText.length > DIFF_TRUNCATE_LEN
    ? newText.slice(0, DIFF_TRUNCATE_LEN) + truncMark : newText;

  const oldTokens = tokenizeText(oldT);
  const newTokens = tokenizeText(newT);

  // token 过多则降级
  if (oldTokens.length > DIFF_MAX_TOKENS || newTokens.length > DIFF_MAX_TOKENS) {
    return computeSimpleLineDiff(oldT, newT);
  }

  const dp = computeLcsTable(oldTokens, newTokens);
  return backtrackLcs(dp, oldTokens, newTokens);
}

/**
 * 从 diff 段落中提取变化区域（含上下文），中间用省略号连接
 */
function extractChangeRegions(segments) {
  const changeIdx = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].type !== 'equal') changeIdx.push(i);
  }
  if (changeIdx.length === 0) return segments;

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

  const result = [];
  for (let i = 0; i < ranges.length; i++) {
    if (i > 0 || ranges[i].start > 0) result.push({ type: 'ellipsis' });
    for (let j = ranges[i].start; j <= ranges[i].end; j++) result.push(segments[j]);
  }
  if (ranges[ranges.length - 1].end < segments.length - 1) {
    result.push({ type: 'ellipsis' });
  }
  return result;
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
      html += `<span class="diff-deleted-marker" title="已删除的内容">${escapeHtml(seg.text.length > 50 ? seg.text.slice(0, 50) + '…' : seg.text)}</span>`;
    } else if (seg.type === 'added' && side === 'after') {
      html += `<mark class="diff-added">${escapeHtml(seg.text)}</mark>`;
    } else if (seg.type === 'added' && side === 'before') {
      // 在"变更前"侧显示新增占位符
      html += `<span class="diff-added-marker" title="此处新增了内容">[+]</span>`;
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
  const regions = extractChangeRegions(segments);
  const beforeHtml = renderDiffHtml(regions, 'before');
  const afterHtml = renderDiffHtml(regions, 'after');

  const grid = document.createElement('div');
  grid.className = 'diff-grid';
  grid.innerHTML = `
    <div class="diff-column">
      <div class="diff-label">变更前</div>
      <div class="diff-content">${beforeHtml}</div>
    </div>
    <div class="diff-column">
      <div class="diff-label">变更后</div>
      <div class="diff-content">${afterHtml}</div>
    </div>
  `;
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
    const regions = extractChangeRegions(segments);
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
    highlighted = highlighted.replace(regex, `<mark class="diff-keyword">$&</mark>`);
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
  if (!html) return '';
  const tags = html.match(/<[\w][^>]*>/g);
  return tags ? tags.join('\n') : '';
}

/**
 * 截取关键词附近上下文片段
 */
function extractKeywordSnippet(text, keywords, maxLen) {
  if (!text || text.length <= maxLen) return text;

  const positions = [];
  for (const kw of keywords) {
    const idx = text.toLowerCase().indexOf(kw.toLowerCase());
    if (idx >= 0) positions.push(idx);
  }
  if (positions.length === 0) return text.slice(0, maxLen) + '…';

  const center = positions[0];
  const halfLen = Math.floor(maxLen / 2);
  let start = Math.max(0, center - halfLen);
  let end = Math.min(text.length, start + maxLen);
  if (end - start < maxLen) start = Math.max(0, end - maxLen);

  let snippet = '';
  if (start > 0) snippet += '…';
  snippet += text.slice(start, end);
  if (end < text.length) snippet += '…';
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
 * 点击后：打开/切换到目标页面 → 注入高亮脚本
 */
async function handleViewOnPage(record) {
  // 1. Get task data
  const taskResp = await sendMessage({ type: 'GET_TASK', payload: { taskId: record.taskId } });
  if (!taskResp.success || !taskResp.task) {
    alert('无法获取任务信息');
    return;
  }
  const task = taskResp.task;

  // 2. Compute diff data for injection
  const diffData = {};
  if (record.changeType === 'text_change') {
    const segments = computeDiffSegments(
      record.oldSnapshot?.text || '',
      record.newSnapshot?.text || ''
    );
    diffData.addedChunks = segments
      .filter(s => s.type === 'added')
      .map(s => s.text)
      .filter(t => t.trim());
    diffData.removedChunks = segments
      .filter(s => s.type === 'removed')
      .map(s => s.text)
      .filter(t => t.trim());
  } else if (record.changeType === 'keyword_found') {
    diffData.keywords = record.keywordsMatched || [];
  }

  // 3. Open or switch to target tab
  let tab;
  try {
    const tabs = await chrome.tabs.query({ url: urlToMatchPattern(task.url) });
    if (tabs.length > 0) {
      tab = tabs[0];
      await chrome.tabs.update(tab.id, { active: true });
      // Reload to get fresh content matching the snapshot
      await chrome.tabs.reload(tab.id);
    } else {
      tab = await chrome.tabs.create({ url: task.url });
    }
  } catch (e) {
    alert('无法打开目标页面: ' + e.message);
    return;
  }

  // 4. Wait for tab to finish loading
  await waitForTabLoad(tab.id);

  // 5. Inject highlight script
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: highlightOnPage,
      args: [{
        selector: task.selector,
        changeType: record.changeType,
        addedChunks: diffData.addedChunks || [],
        removedChunks: diffData.removedChunks || [],
        keywords: diffData.keywords || []
      }]
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
      if (settled) return;
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
 * - 被监控元素蓝色虚线边框
 * - 新增文本绿色底色+下划线标记
 * - 删除内容红色删除线（插入到元素前方）
 * - 关键词橙色高亮
 * - 顶部浮动工具栏（导航、查看删除内容、清除标记）
 * - 自动滚动到第一个变化
 */
function highlightOnPage(data) {
  // data: { selector, changeType, addedChunks, removedChunks, keywords }

  var P = '__pw';
  var TOOLBAR_ID = P + '_toolbar';
  var STYLE_ID = P + '_style';
  var MARK_ADDED = P + '_added';
  var MARK_KEYWORD = P + '_kw';
  var TARGET_CLS = P + '_target';
  var REMOVED_CLS = P + '_removed';

  // If already highlighted, clear and re-apply
  if (document.getElementById(TOOLBAR_ID)) {
    clearAll();
  }

  // ---- Inject styles ----
  var styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = [
    '.' + TARGET_CLS + ' { outline: 3px dashed #1a73e8 !important; outline-offset: 6px !important; }',
    '.' + MARK_ADDED + ' { background: rgba(76,175,80,0.35) !important; border-bottom: 2px solid #4caf50 !important; padding: 0 2px !important; border-radius: 2px !important; cursor: help !important; }',
    '.' + MARK_KEYWORD + ' { background: rgba(255,152,0,0.35) !important; border-bottom: 2px solid #ff9800 !important; padding: 0 2px !important; border-radius: 2px !important; font-weight: 600 !important; }',
    '.' + REMOVED_CLS + '_section { background: rgba(244,67,54,0.06) !important; border-left: 3px solid #ef5350 !important; padding: 8px 12px !important; margin: 8px 0 !important; border-radius: 0 4px 4px 0 !important; }',
    '.' + REMOVED_CLS + '_label { color: #e53935 !important; font-weight: 600 !important; font-size: 0.8em !important; margin-right: 8px !important; }',
    '.' + REMOVED_CLS + '_text { color: #b71c1c !important; text-decoration: line-through !important; }',
    '#' + TOOLBAR_ID + ' { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; z-index: 2147483647 !important; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif !important; font-size: 14px !important; box-shadow: 0 2px 12px rgba(0,0,0,0.25) !important; }',
    '.' + P + '_main { display: flex !important; align-items: center !important; padding: 10px 16px !important; gap: 12px !important; background: linear-gradient(135deg,#1a73e8,#0d47a1) !important; color: #fff !important; }',
    '.' + P + '_title { font-weight: 700 !important; white-space: nowrap !important; }',
    '.' + P + '_summary { flex: 1 !important; font-size: 13px !important; opacity: 0.9 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }',
    '.' + P + '_nav { display: flex !important; align-items: center !important; gap: 6px !important; }',
    '.' + P + '_nav span { font-size: 12px !important; opacity: 0.8 !important; min-width: 40px !important; text-align: center !important; }',
    '.' + P + '_btn { background: rgba(255,255,255,0.15) !important; border: 1px solid rgba(255,255,255,0.3) !important; color: #fff !important; padding: 4px 12px !important; border-radius: 4px !important; cursor: pointer !important; font-size: 12px !important; transition: background 0.15s !important; white-space: nowrap !important; }',
    '.' + P + '_btn:hover { background: rgba(255,255,255,0.25) !important; }',
    '.' + P + '_btn:disabled { opacity: 0.4 !important; cursor: default !important; }',
    '.' + P + '_sep { width: 1px !important; height: 20px !important; background: rgba(255,255,255,0.3) !important; }',
    '.' + P + '_rpanel { display: none !important; background: rgba(0,0,0,0.15) !important; padding: 12px 16px !important; max-height: 200px !important; overflow-y: auto !important; color: #fff !important; }',
    '.' + P + '_rpanel.open { display: block !important; }',
    '.' + P + '_ritem { padding: 4px 0 !important; font-size: 13px !important; }',
    '.' + P + '_ritem del { color: #ffcdd2 !important; }',
    'body.' + P + '_active { padding-top: 0 !important; }'
  ].join('\n');
  document.head.appendChild(styleEl);

  // ---- Find target element ----
  var el = data.selector ? document.querySelector(data.selector) : document.body;

  // If target element not found but there is deleted content,
  // still show the deleted content in a floating overlay
  if (!el) {
    if (data.removedChunks && data.removedChunks.length > 0) {
      showDeletedContentFallback(data.removedChunks);
    } else {
      buildToolbar(data, []);
    }
    return;
  }

  // Mark target element
  el.classList.add(TARGET_CLS);

  // ---- Apply highlights ----
  var marks = [];

  if (data.changeType === 'text_change') {
    marks = applyAddedHighlights(el, data.addedChunks || []);
    insertRemovedBlocks(el, data.removedChunks || []);
  } else if (data.changeType === 'keyword_found') {
    marks = applyKeywordHighlights(el, data.keywords || []);
  }

  // ---- Build toolbar ----
  buildToolbar(data, marks);

  // ---- Scroll to element ----
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // ========== Local helper functions ==========

  function applyAddedHighlights(root, chunks) {
    var result = [];
    var textNodes = collectTextNodes(root);

    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i];
      if (!chunk || !chunk.trim()) continue;

      for (var j = 0; j < textNodes.length; j++) {
        var tn = textNodes[j];
        var idx = tn.textContent.indexOf(chunk);
        if (idx >= 0) {
          try {
            var range = document.createRange();
            range.setStart(tn, idx);
            range.setEnd(tn, idx + chunk.length);
            var mark = document.createElement('mark');
            mark.className = MARK_ADDED;
            mark.title = '新增内容';
            range.surroundContents(mark);
            result.push(mark);
            // Refresh text nodes after DOM modification
            textNodes = collectTextNodes(root);
          } catch (e) {
            // Range crosses element boundary — skip
          }
          break;
        }
      }
    }
    return result;
  }

  function applyKeywordHighlights(root, keywords) {
    var result = [];
    if (!keywords || keywords.length === 0) return result;
    var textNodes = collectTextNodes(root);

    for (var i = 0; i < keywords.length; i++) {
      var kw = keywords[i];
      for (var j = 0; j < textNodes.length; j++) {
        var tn = textNodes[j];
        var lowerText = tn.textContent.toLowerCase();
        var lowerKw = kw.toLowerCase();
        var idx = lowerText.indexOf(lowerKw);
        if (idx >= 0) {
          try {
            var range = document.createRange();
            range.setStart(tn, idx);
            range.setEnd(tn, idx + kw.length);
            var mark = document.createElement('mark');
            mark.className = MARK_KEYWORD;
            mark.title = '匹配关键词: ' + kw;
            range.surroundContents(mark);
            result.push(mark);
            textNodes = collectTextNodes(root);
          } catch (e) {
            // Range crosses element boundary — skip
          }
          break;
        }
      }
    }
    return result;
  }

  function insertRemovedBlocks(root, chunks) {
    if (!chunks || chunks.length === 0) return;
    var filtered = chunks.filter(function(c) { return c && c.trim(); });
    if (filtered.length === 0) return;

    var container = document.createElement('div');
    container.className = REMOVED_CLS + '_section';

    var label = document.createElement('span');
    label.className = REMOVED_CLS + '_label';
    label.textContent = '已删除的内容:';
    container.appendChild(label);

    // 逐条展示删除的内容，而非合并为一段
    for (var i = 0; i < filtered.length; i++) {
      var text = document.createElement('span');
      text.className = REMOVED_CLS + '_text';
      var content = filtered[i];
      text.textContent = content.length > 200 ? content.slice(0, 200) + '\u2026' : content;
      container.appendChild(text);
      if (i < filtered.length - 1) {
        container.appendChild(document.createElement('br'));
      }
    }

    root.parentNode.insertBefore(container, root);
  }

  function collectTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while (n = walker.nextNode()) {
      if (n.textContent.trim()) nodes.push(n);
    }
    return nodes;
  }

  function buildToolbar(data, marks) {
    var toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;

    var main = document.createElement('div');
    main.className = P + '_main';

    // Title
    var title = document.createElement('span');
    title.className = P + '_title';
    title.textContent = '\u{1F50D} PageWhat';
    main.appendChild(title);

    // Summary
    var summary = document.createElement('span');
    summary.className = P + '_summary';
    if (data.changeType === 'text_change') {
      var ac = (data.addedChunks || []).filter(function(c) { return c.trim(); }).length;
      var rc = (data.removedChunks || []).filter(function(c) { return c.trim(); }).length;
      summary.textContent = ac + ' 处新增, ' + rc + ' 处删除';
    } else if (data.changeType === 'keyword_found') {
      summary.textContent = '发现关键词: ' + (data.keywords || []).join(', ');
    } else {
      summary.textContent = '页面结构发生变化';
    }
    main.appendChild(summary);

    // Navigation (prev/next mark)
    if (marks.length > 0) {
      var sep1 = document.createElement('div');
      sep1.className = P + '_sep';
      main.appendChild(sep1);

      var nav = document.createElement('div');
      nav.className = P + '_nav';

      var prevBtn = document.createElement('button');
      prevBtn.className = P + '_btn';
      prevBtn.textContent = '\u25C0 上一个';

      var counter = document.createElement('span');
      counter.textContent = '0/' + marks.length;

      var nextBtn = document.createElement('button');
      nextBtn.className = P + '_btn';
      nextBtn.textContent = '下一个 \u25B6';

      var currentIdx = -1;

      function navigateTo(idx) {
        if (idx < 0 || idx >= marks.length) return;
        currentIdx = idx;
        counter.textContent = (idx + 1) + '/' + marks.length;
        marks[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Brief flash
        marks[idx].style.transition = 'transform 0.15s';
        marks[idx].style.transform = 'scale(1.15)';
        setTimeout(function() { marks[idx].style.transform = ''; }, 300);
        prevBtn.disabled = idx === 0;
        nextBtn.disabled = idx === marks.length - 1;
      }

      prevBtn.addEventListener('click', function() { navigateTo(currentIdx - 1); });
      nextBtn.addEventListener('click', function() { navigateTo(currentIdx + 1); });
      prevBtn.disabled = true;

      nav.appendChild(prevBtn);
      nav.appendChild(counter);
      nav.appendChild(nextBtn);
      main.appendChild(nav);

      // Auto-navigate to first mark after a short delay
      setTimeout(function() { navigateTo(0); }, 600);
    }

    // "查看删除内容" toggle (for text_change with removals)
    var removedBtn = null;
    if (data.changeType === 'text_change' && data.removedChunks) {
      var rc2 = data.removedChunks.filter(function(c) { return c.trim(); });
      if (rc2.length > 0) {
        var sep2 = document.createElement('div');
        sep2.className = P + '_sep';
        main.appendChild(sep2);

        removedBtn = document.createElement('button');
        removedBtn.className = P + '_btn';
        removedBtn.textContent = '查看删除内容 \u25BC';
        main.appendChild(removedBtn);
      }
    }

    // Dismiss button
    var sep3 = document.createElement('div');
    sep3.className = P + '_sep';
    main.appendChild(sep3);

    var dismissBtn = document.createElement('button');
    dismissBtn.className = P + '_btn';
    dismissBtn.textContent = '\u2715 清除标记';
    dismissBtn.addEventListener('click', clearAll);
    main.appendChild(dismissBtn);

    toolbar.appendChild(main);

    // Removed content dropdown panel
    if (removedBtn) {
      var panel = document.createElement('div');
      panel.className = P + '_rpanel';
      for (var k = 0; k < data.removedChunks.length; k++) {
        var chunk = data.removedChunks[k];
        if (!chunk || !chunk.trim()) continue;
        var item = document.createElement('div');
        item.className = P + '_ritem';
        var del = document.createElement('del');
        del.textContent = chunk.length > 200 ? chunk.slice(0, 200) + '\u2026' : chunk;
        item.appendChild(del);
        panel.appendChild(item);
      }
      toolbar.appendChild(panel);

      removedBtn.addEventListener('click', function() {
        var isOpen = panel.classList.contains('open');
        panel.classList.toggle('open');
        removedBtn.textContent = isOpen ? '查看删除内容 \u25BC' : '收起删除内容 \u25B2';
      });
    }

    document.body.appendChild(toolbar);
    document.body.classList.add(P + '_active');
  }

  function showDeletedContentFallback(chunks) {
    var filtered = chunks.filter(function(c) { return c && c.trim(); });
    if (filtered.length === 0) {
      buildToolbar(data, []);
      return;
    }

    // Inject styles if not already present
    if (!document.getElementById(STYLE_ID)) {
      var styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      styleEl.textContent = [
        '.' + TARGET_CLS + ' { outline: 3px dashed #1a73e8 !important; outline-offset: 6px !important; }',
        '.' + MARK_ADDED + ' { background: rgba(76,175,80,0.35) !important; border-bottom: 2px solid #4caf50 !important; padding: 0 2px !important; border-radius: 2px !important; cursor: help !important; }',
        '.' + MARK_KEYWORD + ' { background: rgba(255,152,0,0.35) !important; border-bottom: 2px solid #ff9800 !important; padding: 0 2px !important; border-radius: 2px !important; font-weight: 600 !important; }',
        '.' + REMOVED_CLS + '_section { background: rgba(244,67,54,0.06) !important; border-left: 3px solid #ef5350 !important; padding: 8px 12px !important; margin: 8px 0 !important; border-radius: 0 4px 4px 0 !important; }',
        '.' + REMOVED_CLS + '_label { color: #e53935 !important; font-weight: 600 !important; font-size: 0.8em !important; margin-right: 8px !important; }',
        '.' + REMOVED_CLS + '_text { color: #b71c1c !important; text-decoration: line-through !important; }',
        '#' + TOOLBAR_ID + ' { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; z-index: 2147483647 !important; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif !important; font-size: 14px !important; box-shadow: 0 2px 12px rgba(0,0,0,0.25) !important; }',
        '.' + P + '_main { display: flex !important; align-items: center !important; padding: 10px 16px !important; gap: 12px !important; background: linear-gradient(135deg,#1a73e8,#0d47a1) !important; color: #fff !important; }',
        '.' + P + '_title { font-weight: 700 !important; white-space: nowrap !important; }',
        '.' + P + '_summary { flex: 1 !important; font-size: 13px !important; opacity: 0.9 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }',
        '.' + P + '_btn { background: rgba(255,255,255,0.15) !important; border: 1px solid rgba(255,255,255,0.3) !important; color: #fff !important; padding: 4px 12px !important; border-radius: 4px !important; cursor: pointer !important; font-size: 12px !important; transition: background 0.15s !important; white-space: nowrap !important; }',
        '.' + P + '_btn:hover { background: rgba(255,255,255,0.25) !important; }',
        '.' + P + '_rpanel { display: none !important; background: rgba(0,0,0,0.15) !important; padding: 12px 16px !important; max-height: 200px !important; overflow-y: auto !important; color: #fff !important; }',
        '.' + P + '_rpanel.open { display: block !important; }',
        '.' + P + '_ritem { padding: 4px 0 !important; font-size: 13px !important; }',
        '.' + P + '_ritem del { color: #ffcdd2 !important; }',
        '.' + P + '_fallback { position: fixed !important; top: 60px !important; left: 50% !important; transform: translateX(-50%) !important; z-index: 2147483646 !important; background: white !important; border: 2px solid #ef5350 !important; border-radius: 8px !important; padding: 20px 24px !important; max-width: 600px !important; width: 90% !important; box-shadow: 0 4px 20px rgba(0,0,0,0.2) !important; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif !important; }',
        '.' + P + '_fallback h3 { color: #c62828 !important; margin-bottom: 12px !important; font-size: 15px !important; }',
        '.' + P + '_fallback p { color: #666 !important; font-size: 13px !important; margin-bottom: 12px !important; }',
        '.' + P + '_fallback del { color: #b71c1c !important; text-decoration: line-through !important; background: #fce4ec !important; padding: 2px 4px !important; border-radius: 2px !important; }',
        'body.' + P + '_active { padding-top: 0 !important; }'
      ].join('\n');
      document.head.appendChild(styleEl);
    }

    // Build toolbar
    buildToolbar(data, []);

    // Show floating panel with deleted content
    var panel = document.createElement('div');
    panel.className = P + '_fallback';

    var heading = document.createElement('h3');
    heading.textContent = '\u26A0 监控元素已不存在';
    panel.appendChild(heading);

    var desc = document.createElement('p');
    desc.textContent = '被监控的内容已从页面中删除。以下是被删除的内容：';
    panel.appendChild(desc);

    for (var i = 0; i < filtered.length; i++) {
      var delEl = document.createElement('div');
      delEl.style.cssText = 'margin: 6px 0; font-size: 13px; line-height: 1.6;';
      var del = document.createElement('del');
      del.textContent = filtered[i].length > 300 ? filtered[i].slice(0, 300) + '\u2026' : filtered[i];
      delEl.appendChild(del);
      panel.appendChild(delEl);
    }

    var closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'margin-top: 12px; padding: 6px 16px; background: #ef5350; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;';
    closeBtn.textContent = '关闭';
    closeBtn.addEventListener('click', function() { panel.remove(); });
    panel.appendChild(closeBtn);

    document.body.appendChild(panel);
    document.body.classList.add(P + '_active');
  }

  function clearAll() {
    // Remove toolbar
    var tb = document.getElementById(TOOLBAR_ID);
    if (tb) tb.remove();

    // Remove styles
    var st = document.getElementById(STYLE_ID);
    if (st) st.remove();

    // Remove body class
    document.body.classList.remove(P + '_active');

    // Remove target outline
    var targets = document.querySelectorAll('.' + TARGET_CLS);
    for (var i = 0; i < targets.length; i++) {
      targets[i].classList.remove(TARGET_CLS);
    }

    // Unwrap added/keyword marks
    var marks = document.querySelectorAll('.' + MARK_ADDED + ', .' + MARK_KEYWORD);
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      var parent = m.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(m.textContent), m);
        parent.normalize();
      }
    }

    // Remove removed blocks
    var sections = document.querySelectorAll('.' + REMOVED_CLS + '_section');
    for (var i = 0; i < sections.length; i++) {
      sections[i].remove();
    }
  }
}
