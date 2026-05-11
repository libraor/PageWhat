/**
 * offscreen.js - Offscreen 文档逻辑
 * 处理两类任务：
 * 1. FETCH_AND_EXTRACT: 通过 fetch 获取页面 HTML 并解析
 * 2. PLAY_SOUND: 播放提示音
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_AND_EXTRACT') {
    handleFetchAndExtract(message.url, message.selector)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ error: `FETCH_ERROR: ${error.message}`, text: null, html: null }));
    return true; // Keep message channel open for async response
  }

  if (message.type === 'PLAY_SOUND') {
    handlePlaySound(message.volume)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

/**
 * 通过 fetch 获取页面并提取内容
 */
async function handleFetchAndExtract(url, selector) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'include' // Include cookies for auth
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { error: `HTTP_ERROR: ${response.status} ${response.statusText}`, text: null, html: null };
    }

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Check for parsing errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return { error: 'PARSE_ERROR: Invalid HTML', text: null, html: null };
    }

    // 移除非可视元素后再提取内容，避免脚本/样式内容导致误报
    var removeTags = ['script', 'style', 'noscript'];
    for (var i = 0; i < removeTags.length; i++) {
      var nodes = doc.querySelectorAll(removeTags[i]);
      for (var j = 0; j < nodes.length; j++) {
        nodes[j].parentNode.removeChild(nodes[j]);
      }
    }

    const el = selector ? doc.querySelector(selector) : doc.body;
    if (!el) {
      return { error: 'SELECTOR_NOT_FOUND', text: null, html: null };
    }

    return {
      error: null,
      text: el.textContent || '',
      html: el.innerHTML || ''
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      return { error: 'FETCH_TIMEOUT', text: null, html: null };
    }
    return { error: `FETCH_ERROR: ${error.message}`, text: null, html: null };
  }
}

/**
 * 播放提示音
 */
async function handlePlaySound(volume = 0.7) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(chrome.runtime.getURL('assets/sounds/alert.wav'));
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.addEventListener('ended', () => resolve());
    audio.addEventListener('error', (e) => reject(new Error('Audio playback failed')));
    audio.play().catch(reject);
  });
}
