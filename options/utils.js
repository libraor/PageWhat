/**
 * utils.js - Options 页面共享工具函数
 */

export function sendMessage(message) {
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

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function urlToMatchPattern(url) {
  try {
    const u = new URL(url);
    return u.origin + '/*';
  } catch {
    return url;
  }
}

export function getStatusColor(task) {
  if (!task.isActive) {
    return 'gray';
  }
  if (task.errorCount > 0) {
    return 'red';
  }
  return 'green';
}

export function getTypeLabel(type) {
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

export function formatTime(isoString) {
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
