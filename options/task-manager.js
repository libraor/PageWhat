/**
 * task-manager.js - 监控任务管理模块
 */
import { sendMessage, escapeHtml, getStatusColor, getTypeLabel, formatTime } from './utils.js';

let editingTaskId = null;
let dom = null;

export function initTaskManager(domRefs) {
  dom = domRefs;
  setupModal();
  setupTaskTableDelegation();
}

function setupModal() {
  dom.btnAddTask.addEventListener('click', () => openModal());
  dom.btnCloseModal.addEventListener('click', closeModal);
  dom.btnCancel.addEventListener('click', closeModal);
  dom.btnSave.addEventListener('click', handleSaveTask);

  dom.optType.addEventListener('change', () => {
    dom.optKeywordsRow.classList.toggle('hidden', dom.optType.value !== 'keyword');
  });

  dom.modalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.modalOverlay) {
      closeModal();
    }
  });

  dom.btnResumeAll.addEventListener('click', handleResumeAllTasks);
  dom.btnPauseAll.addEventListener('click', handlePauseAllTasks);
}

function openModal(task = null) {
  editingTaskId = task ? task.id : null;
  dom.modalTitle.textContent = task ? '编辑监控' : '添加监控';

  dom.optName.value = task ? task.name : '';
  dom.optUrl.value = task ? task.url : '';
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
          monitorType,
          keywords,
          intervalMinutes,
        },
      });
    } else {
      response = await sendMessage({
        type: 'ADD_TASK',
        payload: { name, url, monitorType, keywords, intervalMinutes },
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

async function handleResumeAllTasks() {
  const response = await sendMessage({ type: 'RESUME_ALL_TASKS' });
  if (response.success) {
    if (response.count > 0) {
      alert(`已开启 ${response.count} 个任务`);
    } else {
      alert('所有任务已处于开启状态');
    }
    await loadMonitorsTab();
  } else {
    alert(response.error || '操作失败');
  }
}

async function handlePauseAllTasks() {
  if (!confirm('确定要暂停所有监控任务吗？')) {
    return;
  }
  const response = await sendMessage({ type: 'PAUSE_ALL_TASKS' });
  if (response.success) {
    if (response.count > 0) {
      alert(`已暂停 ${response.count} 个任务`);
    } else {
      alert('所有任务已处于暂停状态');
    }
    await loadMonitorsTab();
  } else {
    alert(response.error || '操作失败');
  }
}

export async function loadMonitorsTab() {
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
