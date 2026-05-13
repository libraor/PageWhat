/**
 * errors-manager.js - 错误日志管理模块
 */
import { sendMessage, escapeHtml, formatTime } from './utils.js';

let _errorsLoading = false;
let dom = null;

export function initErrorsManager(domRefs) {
  dom = domRefs;
}

export async function loadErrorsTab() {
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

    if (tasksResp.success) {
      const currentVal = dom.filterErrorTask.value;
      dom.filterErrorTask.innerHTML = '<option value="all">全部任务</option>';
      for (const task of tasksResp.tasks) {
        dom.filterErrorTask.innerHTML += `<option value="${task.id}">${escapeHtml(task.name)}</option>`;
      }
      dom.filterErrorTask.value = currentVal;
    }

    let records = errorsResp.errors || [];

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

  const typeDiv = document.createElement('div');
  typeDiv.className = 'error-type-row';
  const badge = document.createElement('span');
  badge.className = 'error-type-badge';
  badge.textContent = record.errorType || 'UNKNOWN';
  typeDiv.appendChild(badge);

  const msgDiv = document.createElement('div');
  msgDiv.className = 'error-message';
  msgDiv.textContent = record.errorMessage || '未知错误';

  card.appendChild(header);
  card.appendChild(typeDiv);
  card.appendChild(msgDiv);

  return card;
}
