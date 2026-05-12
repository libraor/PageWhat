/**
 * checker.js - 页面检查 & 变化检测引擎
 * 支持 Tab 注入和 Offscreen fetch 双策略
 */

import Storage from './storage.js';
import { computeHash, normalizeText, normalizeHtml, detectChange } from './diff.js';
import { ensureOffscreenDocument } from './utils.js';

// Track concurrent checks
let activeChecks = 0;

// Cached regex patterns for SPA detection (extracted for performance)
const SPA_CONFIRM_REGEX =
  /<(?:div|main|section)\s[^>]*id\s*=\s*["'](?:root|app|__next|__nuxt)["']/i;
const SCRIPT_TAG_REGEX = /<script[\s>]/gi;
const SPA_MARKERS = [
  '<div id="root"></div>',
  '<div id="app"></div>',
  '<div id="__next">',
  '<div id="__nuxt">',
  '__NEXT_DATA__',
  'window.__INITIAL_STATE__',
  '<noscript>You need to enable JavaScript</noscript>',
];

const Checker = {
  /**
   * 执行一次检查
   * @param {object} task - 监控任务
   * @returns {Promise<object>} 检查结果 { changed, changeRecord, task }
   */
  async performCheck(task) {
    const settings = await Storage.getSettings();

    // Concurrency check
    if (activeChecks >= settings.maxConcurrentChecks) {
      return { changed: false, skipped: true, reason: 'MAX_CONCURRENT' };
    }

    activeChecks++;
    try {
      // Get content from the page
      const extraction = await this.extractContent(task, settings);

      if (extraction.error) {
        // Handle extraction error
        task.errorCount = (task.errorCount || 0) + 1;
        task.lastError = extraction.error;
        task.lastChecked = new Date().toISOString();

        // Auto-disable after too many errors
        if (task.errorCount >= settings.autoDisableOnErrorCount) {
          task.isActive = false;
          task.lastError = `Auto-disabled after ${task.errorCount} consecutive errors: ${extraction.error}`;
        }

        // Record error log
        await Storage.addError(task.id, {
          id: crypto.randomUUID(),
          taskId: task.id,
          errorType: extraction.error.split(':')[0] || 'UNKNOWN',
          errorMessage: extraction.error,
          url: task.url,
          timestamp: new Date().toISOString(),
        });

        await Storage.saveTask(task);
        return { changed: false, error: extraction.error, task };
      }

      // Compute hash for the extracted content
      let newSnapshot;
      if (task.monitorType === 'structure') {
        // Normalize once and store; avoids re-normalization in detectChange/htmlDiff
        const normHtml = normalizeHtml(extraction.html);
        const hash = await computeHash(normHtml);
        newSnapshot = {
          text: '',
          html: truncateContent(normHtml, 51200),
          hash,
          timestamp: new Date().toISOString(),
          _normVersion: 2, // marker for pre-normalized HTML
        };
      } else {
        const hash = await computeHash(normalizeText(extraction.text));
        newSnapshot = {
          text: truncateContent(extraction.text, 51200), // Limit to 50KB
          html: '',
          hash,
          timestamp: new Date().toISOString(),
        };
      }

      // Detect changes
      const changeResult = await detectChange(task, newSnapshot);

      // Update task state
      task.lastChecked = new Date().toISOString();
      task.errorCount = 0;
      task.lastError = null;

      if (changeResult) {
        // Change detected - create a ChangeRecord
        const changeRecord = {
          id: crypto.randomUUID(),
          taskId: task.id,
          changeType: changeResult.changeType,
          oldSnapshot: changeResult.oldSnapshot,
          newSnapshot: changeResult.newSnapshot,
          diff: changeResult.diff,
          keywordsMatched: changeResult.keywordsMatched || [],
          detectedAt: new Date().toISOString(),
          isRead: false,
        };

        // Update task snapshot
        task.lastSnapshot = changeResult.newSnapshot;

        // Atomic write: task + history in one operation
        await Storage.saveCheckResult(task, changeRecord);

        return { changed: true, changeRecord, task };
      } else {
        // No change - just update snapshot and lastChecked
        if (!task.lastSnapshot) {
          // First check - set baseline
          task.lastSnapshot = newSnapshot;
        } else {
          // Update timestamp only for existing snapshot
          task.lastSnapshot.timestamp = newSnapshot.timestamp;
        }
        await Storage.saveTask(task);
        return { changed: false, task };
      }
    } catch (error) {
      task.errorCount = (task.errorCount || 0) + 1;
      task.lastError = error.message;
      task.lastChecked = new Date().toISOString();

      await Storage.addError(task.id, {
        id: crypto.randomUUID(),
        taskId: task.id,
        errorType: 'EXCEPTION',
        errorMessage: error.message,
        url: task.url,
        timestamp: new Date().toISOString(),
      });

      await Storage.saveTask(task);
      return { changed: false, error: error.message, task };
    } finally {
      activeChecks--;
    }
  },

  /**
   * 从目标页面提取内容
   * 根据设置选择 Tab 注入或 Offscreen fetch
   */
  async extractContent(task, settings) {
    const method = settings.checkMethod || 'auto';
    console.log(`[PageWhat] extractContent: url=${task.url}, method=${method}`);

    if (method === 'tab') {
      const result = await this.checkViaTab(task);
      console.log('[PageWhat] checkViaTab result:', result.error || 'OK');
      return result;
    } else if (method === 'fetch') {
      const fetchResult = await this.checkViaFetch(task);
      console.log('[PageWhat] checkViaFetch result:', fetchResult.error || 'OK');
      if (fetchResult.error) {
        console.log('[PageWhat] fetch failed, falling back to checkViaOpenTab');
        return this.checkViaOpenTab(task);
      }
      if (isSpaShell(fetchResult)) {
        console.log('[PageWhat] SPA shell detected, falling back to checkViaOpenTab');
        return this.checkViaOpenTab(task);
      }
      return fetchResult;
    } else {
      // Auto: prefer existing tab, fallback to fetch,
      // then if fetch fails or returns SPA shell, open a tab
      const tabResult = await this.checkViaTab(task);
      console.log('[PageWhat] checkViaTab result:', tabResult.error || 'OK');
      if (tabResult.error) {
        // Any tab error (not just NO_TAB_FOUND) — try fetch next
        const fetchResult = await this.checkViaFetch(task);
        console.log('[PageWhat] checkViaFetch result:', fetchResult.error || 'OK');
        if (fetchResult.error) {
          console.log('[PageWhat] fetch failed, falling back to checkViaOpenTab');
          return this.checkViaOpenTab(task);
        }
        if (isSpaShell(fetchResult)) {
          console.log('[PageWhat] SPA shell detected, falling back to checkViaOpenTab');
          return this.checkViaOpenTab(task);
        }
        return fetchResult;
      }
      return tabResult;
    }
  },

  /**
   * 通过已打开的 Tab 提取内容
   */
  async checkViaTab(task) {
    try {
      // chrome.tabs.query requires match patterns (e.g. https://host/*),
      // not plain URLs. Convert task.url to a valid pattern.
      const pattern = urlToMatchPattern(task.url);
      const tabs = await chrome.tabs.query({ url: pattern });

      let targetTab;
      if (tabs.length > 0) {
        targetTab = tabs[0];
      } else {
        return { error: 'NO_TAB_FOUND', text: null, html: null };
      }

      // Check if tab is accessible (not chrome:// etc.)
      if (
        targetTab.url.startsWith('chrome://') ||
        targetTab.url.startsWith('chrome-extension://')
      ) {
        return { error: 'INACCESSIBLE_PAGE', text: null, html: null };
      }

      // Inject content script to extract content
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: extractContent,
      });

      if (results && results[0] && results[0].result) {
        return results[0].result;
      }

      return { error: 'INJECTION_FAILED', text: null, html: null };
    } catch (error) {
      return { error: `TAB_CHECK_ERROR: ${error.message}`, text: null, html: null };
    }
  },

  /**
   * 通过 Offscreen 文档 fetch 提取内容
   */
  async checkViaFetch(task) {
    try {
      // Ensure offscreen document exists
      await this.ensureOffscreenDocument();

      // Send fetch request to offscreen document
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'FETCH_AND_EXTRACT',
            url: task.url,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({
                error: `OFFSCREEN_ERROR: ${chrome.runtime.lastError.message}`,
                text: null,
                html: null,
              });
            } else {
              resolve(response || { error: 'NO_RESPONSE', text: null, html: null });
            }
          }
        );
      });
    } catch (error) {
      return { error: `FETCH_CHECK_ERROR: ${error.message}`, text: null, html: null };
    }
  },

  /**
   * 通过打开新的后台标签页提取内容（适用于 SPA 页面）
   * 打开 → 等待 JS 渲染 → 提取 → 关闭标签页
   */
  async checkViaOpenTab(task) {
    let tab;
    try {
      console.log(`[PageWhat] checkViaOpenTab: opening ${task.url}`);
      // Open a background tab (not focused)
      tab = await chrome.tabs.create({ url: task.url, active: false });

      // Wait for page to render (SPA needs JS execution)
      console.log(`[PageWhat] checkViaOpenTab: waiting for tab ${tab.id} to load...`);
      await waitForTabComplete(tab.id, 15000);
      console.log('[PageWhat] checkViaOpenTab: tab loaded, injecting script...');

      // Inject content extraction script
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractContent,
      });

      if (results && results[0] && results[0].result) {
        console.log(
          `[PageWhat] checkViaOpenTab: extraction OK, text length=${(results[0].result.text || '').length}`
        );
        return results[0].result;
      }

      console.log('[PageWhat] checkViaOpenTab: injection returned no result, results=', results);
      return { error: 'INJECTION_FAILED', text: null, html: null };
    } catch (error) {
      console.error('[PageWhat] checkViaOpenTab ERROR:', error);
      return { error: `OPEN_TAB_ERROR: ${error.message}`, text: null, html: null };
    } finally {
      // Always close the temporary tab
      if (tab) {
        try {
          await chrome.tabs.remove(tab.id);
        } catch (e) {
          /* ignore */
        }
      }
    }
  },

  /**
   * 确保 Offscreen 文档存在（委托给共享函数）
   */
  async ensureOffscreenDocument() {
    await ensureOffscreenDocument();
  },

  /**
   * 关闭 Offscreen 文档
   */
  async closeOffscreenDocument() {
    try {
      await chrome.offscreen.closeDocument();
    } catch (e) {
      // May already be closed
    }
  },
};

/**
 * 注入到目标页面的内容提取函数
 * 必须是独立的、无外部依赖的
 * 排除 script/style/noscript 等非可视内容，避免动态页面误报
 */
function extractContent() {
  try {
    const el = document.body;
    if (!el) {
      return { error: 'EXTRACTION_ERROR', text: null, html: null };
    }

    // 克隆节点以避免修改原始 DOM
    const clone = el.cloneNode(true);

    // 移除非可视元素：script、style、noscript
    const removeTags = ['SCRIPT', 'STYLE', 'NOSCRIPT'];
    for (let i = 0; i < removeTags.length; i++) {
      const nodes = clone.querySelectorAll(removeTags[i]);
      for (let j = 0; j < nodes.length; j++) {
        nodes[j].parentNode.removeChild(nodes[j]);
      }
    }

    // 获取纯可视文本（排除脚本/样式内容）
    const text = clone.textContent || '';

    // 清理克隆节点中的动态属性以获取更稳定的 HTML
    const allEls = clone.querySelectorAll('*');
    for (let k = 0; k < allEls.length; k++) {
      const node = allEls[k];
      // 移除 style 属性（CSS-in-JS 每次都变）
      node.removeAttribute('style');
      // 移除 nonce 属性
      node.removeAttribute('nonce');
      // 移除 integrity 属性
      node.removeAttribute('integrity');
      // 移除 data-reactroot 等 React 动态属性
      const attrs = node.attributes;
      const removeAttrs = [];
      for (let m = 0; m < attrs.length; m++) {
        const attrName = attrs[m].name.toLowerCase();
        if (
          attrName.startsWith('data-react') ||
          attrName === 'data-reactid' ||
          attrName === 'data-react-checksum' ||
          attrName === 'data-reactroot'
        ) {
          removeAttrs.push(attrs[m].name);
        }
      }
      for (let n = 0; n < removeAttrs.length; n++) {
        node.removeAttribute(removeAttrs[n]);
      }
    }

    const html = clone.innerHTML || '';

    return {
      error: null,
      text: text,
      html: html,
    };
  } catch (e) {
    return { error: 'EXTRACTION_ERROR: ' + e.message, text: null, html: null };
  }
}

/**
 * 将 URL 转换为 chrome.tabs.query 可用的 match pattern
 * chrome.tabs.query 要求 url 参数是 match pattern 格式，如 https://www.example.com/*
 * 普通URL（如 https://www.example.com）会导致 Invalid url pattern 错误
 */
function urlToMatchPattern(url) {
  try {
    const u = new URL(url);
    // match pattern: scheme://host/path*
    // Preserve the path prefix so tabs for different pages on the same host
    // are matched independently (e.g. /product/123 vs /about).
    const pathPrefix = u.pathname.replace(/\/[^/]*$/, '') || '/';
    return u.origin + pathPrefix + '*';
  } catch {
    return url;
  }
}

/**
 * 截断内容到指定大小
 */
function truncateContent(content, maxBytes) {
  if (!content) {
    return '';
  }
  if (content.length <= maxBytes) {
    return content;
  }
  return content.slice(0, maxBytes) + '...[truncated]';
}

/**
 * 检测 fetch 返回的内容是否为 SPA 空壳
 * SPA 页面特点是：HTML 中实际可见文本极少，内容由 JS 客户端渲染
 *
 * @param {object} extraction - { text, html } 提取结果
 * @returns {boolean}
 */
function isSpaShell(extraction) {
  const text = (extraction.text || '').trim();
  const html = (extraction.html || '').trim();

  // 全页监控下文本极短 — 但需要排除本身就是短文本的非 SPA 页面。
  // 如果 HTML 本身也很小（< 2KB），说明页面本身就是简短页面（如 API 状态页），
  // 不是 SPA 空壳。
  if (text.length < 300) {
    // Non-SPA indicator: HTML is small (simple static page, API response, etc.)
    if (html.length < 2000) {
      return false;
    }
    // Look for SPA markers to confirm it's a framework shell
    if (SPA_CONFIRM_REGEX.test(html)) {
      return true;
    }
    // Small text but HTML has script count typical of SPA bundles (>3 scripts)
    const scriptCount = (html.match(SCRIPT_TAG_REGEX) || []).length;
    if (scriptCount > 3) {
      return true;
    }
    // Very small text on a page with substantial HTML — likely SPA
    if (html.length > 10000) {
      return true;
    }
    // Ambiguous: treat as non-SPA to avoid over-escalation to Open Tab
    return false;
  }

  // Common SPA mount points / frameworks (see SPA_MARKERS above)

  // 有 SPA 标记且文本很少 → SPA 空壳
  if (text.length < 800) {
    for (const marker of SPA_MARKERS) {
      if (html.includes(marker)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 等待标签页加载完成（带超时）
 */
function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const timeout = setTimeout(() => done(new Error('Tab load timeout')), timeoutMs);

    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        done();
      }
    };

    // Check if already loaded
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        done(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (tab && tab.status === 'complete') {
        done();
        return;
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

export default Checker;
