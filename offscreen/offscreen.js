/**
 * offscreen.js - Offscreen 文档逻辑
 * 处理任务：FETCH_AND_EXTRACT - 通过 fetch 获取页面 HTML 并解析
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_AND_EXTRACT') {
    handleFetchAndExtract(message.url, message.selector)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({ error: `FETCH_ERROR: ${error.message}`, text: null, html: null })
      );
    return true; // Keep message channel open for async response
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
      credentials: 'include', // Include cookies for auth
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        error: `HTTP_ERROR: ${response.status} ${response.statusText}`,
        text: null,
        html: null,
      };
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
    const removeTags = ['script', 'style', 'noscript'];
    for (const tag of removeTags) {
      const nodes = doc.querySelectorAll(tag);
      for (const node of nodes) {
        node.parentNode.removeChild(node);
      }
    }

    const el = selector ? doc.querySelector(selector) : doc.body;
    if (!el) {
      return { error: 'SELECTOR_NOT_FOUND', text: null, html: null };
    }

    return {
      error: null,
      text: el.textContent || '',
      html: el.innerHTML || '',
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      return { error: 'FETCH_TIMEOUT', text: null, html: null };
    }
    return { error: `FETCH_ERROR: ${error.message}`, text: null, html: null };
  }
}
