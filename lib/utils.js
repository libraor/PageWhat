/**
 * utils.js - 共享工具函数
 * 适用于 Service Worker、Popup、Options 页面
 */

/**
 * 确保 Offscreen 文档存在
 * 统一入口：同时声明 DOM_SCRAPING 和 AUDIO_PLAYBACK 权限
 */
const OFFSCREEN_URL = 'offscreen/offscreen.html';

export async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });

  if (existingContexts.length > 0) {
    return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['DOM_SCRAPING', 'AUDIO_PLAYBACK'],
      justification: 'Page change monitoring: HTML parsing and alert sounds',
    });
  } catch (e) {
    // Race condition: another caller may have created the document concurrently.
    // Verify it now exists; if not, re-throw.
    const recheck = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    });
    if (recheck.length === 0) {
      throw e;
    }
  }
}

/**
 * 截断文本到指定长度
 * @param {string} text - 原始文本
 * @param {number} maxLen - 最大长度
 * @returns {string} 截断后的文本
 */
export function truncate(text, maxLen) {
  if (!text || text.length <= maxLen) {
    return text || '';
  }
  return text.slice(0, maxLen - 3) + '...';
}
