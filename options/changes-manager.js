/**
 * changes-manager.js - 变化记录管理模块
 */
import { sendMessage, escapeHtml, getTypeLabel, formatTime } from './utils.js';
import { buildTextDiffPanel, buildStructureDiffPanel, buildKeywordDiffPanel } from './diff-panel.js';
import { handleViewOnPage } from './highlight-inject.js';

let _changesLoading = false;
let dom = null;

export function initChangesManager(domRefs) {
  dom = domRefs;
  setupChangesFilters();
}

function setupChangesFilters() {
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
}

export async function loadChangesTab() {
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

    if (tasksResp.success) {
      const currentVal = dom.filterTask.value;
      dom.filterTask.innerHTML = '<option value="all">全部任务</option>';
      for (const task of tasksResp.tasks) {
        dom.filterTask.innerHTML += `<option value="${task.id}">${escapeHtml(task.name)}</option>`;
      }
      dom.filterTask.value = currentVal;
    }

    let records = historyResp.history || [];

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

  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'change-summary';
  summaryDiv.textContent = record.diff || '检测到页面变化';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'btn btn-sm btn-secondary diff-toggle';
  toggleBtn.textContent = '展开对比';

  const diffPanel = document.createElement('div');
  diffPanel.className = 'diff-panel hidden';

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

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'change-actions';

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
