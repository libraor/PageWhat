/**
 * diff.js - 变化检测算法
 * 提供 SHA-256 哈希、文本 diff、HTML 结构 diff、关键词搜索
 */

import { truncate } from './utils.js';

/**
 * 计算内容的 SHA-256 哈希
 * @param {string} content - 要哈希的内容
 * @returns {Promise<string>} 十六进制哈希字符串
 */
export async function computeHash(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 归一化文本内容（减少误报）
 * - 去除首尾空白
 * - 统一空白字符为单个空格
 * - 移除零宽字符
 * - 过滤常见的动态噪声（时间戳、CSRF token 等）
 * @param {string} text - 原始文本
 * @returns {string} 归一化后的文本
 */
export function normalizeText(text) {
  if (!text) {
    return '';
  }
  return (
    text
      // eslint-disable-next-line no-misleading-character-class
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // 零宽字符
      .replace(/\s+/g, ' ') // 统一空白
      // 过滤常见动态噪声模式
      .replace(/__NEXT_DATA__\s*=\s*\{[^}]*\}/g, '') // Next.js hydration data
      .replace(/window\.__[A-Z_]+__\s*=\s*\{[^}]*\}/g, '') // Framework hydration
      .replace(/csrf[_-]?token['":\s]*['"][a-zA-Z0-9_-]+['"]/gi, '') // CSRF tokens
      .replace(/nonce['":\s]*['"][a-zA-Z0-9_-]+['"]/gi, '') // CSP nonces
      .trim()
  );
}

/**
 * 归一化 HTML 内容（用于结构比较）
 * - 移除 script/style 标签及其内容
 * - 移除动态属性（data-*、style、nonce、integrity 等）
 * - 排序属性
 * - 移除纯空白文本节点
 * @param {string} html - 原始 HTML
 * @returns {string} 归一化后的 HTML
 */
export function normalizeHtml(html) {
  if (!html) {
    return '';
  }
  let normalized = html;
  // Remove script tags and their content (dynamic JS, hydration data, etc.)
  // Use [\s\S] instead of [^] for cross-browser clarity and to avoid rare
  // backtracking issues on malformed HTML without closing tags.
  normalized = normalized.replace(/<script[\s>][\s\S]*?<\/script>/gi, '');
  // Remove style tags and their content (CSS-in-JS, dynamic styles)
  normalized = normalized.replace(/<style[\s>][\s\S]*?<\/style>/gi, '');
  // Remove noscript tags
  normalized = normalized.replace(/<noscript[\s>][\s\S]*?<\/noscript>/gi, '');
  // Remove dynamic attributes that change on every load
  normalized = normalized.replace(/\s+data-reactid="[^"]*"/g, '');
  normalized = normalized.replace(/\s+data-react-checksum="[^"]*"/g, '');
  normalized = normalized.replace(/\s+data-reactroot="[^"]*"/g, '');
  normalized = normalized.replace(/\s+data-react[^"]*="[^"]*"/g, '');
  // Remove style attributes (CSS-in-JS generates these dynamically)
  normalized = normalized.replace(/\s+style="[^"]*"/g, '');
  normalized = normalized.replace(/\s+style='[^']*'/g, '');
  // Remove nonce attributes (CSP nonces change every request)
  normalized = normalized.replace(/\s+nonce="[^"]*"/g, '');
  // Remove integrity attributes (SRI hashes)
  normalized = normalized.replace(/\s+integrity="[^"]*"/g, '');
  // Remove crossorigin attributes
  normalized = normalized.replace(/\s+crossorigin="[^"]*"/g, '');
  // Remove data-* attributes (often contain session/timestamp data)
  normalized = normalized.replace(/\s+data-[a-z-]+="[^"]*"/gi, '');
  // Remove empty class attributes
  normalized = normalized.replace(/\s+class=""/g, '');
  // Remove hidden attributes (dynamic toggling)
  normalized = normalized.replace(/\s+hidden=""/g, '');
  // Remove src query parameters (cache busters like ?v=1234, ?_=5678)
  normalized = normalized.replace(/(src="[^"?]*)\?[^"]*"/g, '$1"');
  normalized = normalized.replace(/(href="[^"?]*)\?[^"]*"/g, '$1"');
  // Normalize whitespace between tags
  normalized = normalized.replace(/>\s+</g, '><');
  // Normalize remaining whitespace
  normalized = normalized.replace(/\s+/g, ' ');
  return normalized.trim();
}

/**
 * 计算文本差异（基于句子的分段 diff）
 * 将文本按句子/段落拆分后比较，避免整段文本被标记为删除/添加
 * @param {string} oldText - 旧文本
 * @param {string} newText - 新文本
 * @returns {object} 差异结果 { added, removed, summary }
 */
export function textDiff(oldText, newText) {
  const oldNorm = normalizeText(oldText);
  const newNorm = normalizeText(newText);

  if (oldNorm === newNorm) {
    return { changed: false, summary: '' };
  }

  // 按句子/段落拆分，保留换行符作为自然分段
  const oldSegments = splitIntoSegments(oldText);
  const newSegments = splitIntoSegments(newText);

  const added = [];
  const removed = [];

  // Find removed segments (in old but not in new)
  for (const seg of oldSegments) {
    if (seg.trim() && !newSegments.some((ns) => normalizeText(ns) === normalizeText(seg))) {
      removed.push(seg.trim());
    }
  }

  // Find added segments (in new but not in old)
  for (const seg of newSegments) {
    if (seg.trim() && !oldSegments.some((os) => normalizeText(os) === normalizeText(seg))) {
      added.push(seg.trim());
    }
  }

  // Build summary
  const parts = [];
  if (removed.length > 0) {
    parts.push(
      `- "${truncate(removed[0], 80)}"${removed.length > 1 ? ` 等${removed.length}处` : ''}`
    );
  }
  if (added.length > 0) {
    parts.push(`+ "${truncate(added[0], 80)}"${added.length > 1 ? ` 等${added.length}处` : ''}`);
  }

  return {
    changed: true,
    added,
    removed,
    summary: parts.join(' → ') || '文本内容发生变化',
  };
}

/**
 * 将文本按句子/段落拆分为片段
 * 保留自然段落边界，比 normalizeText 后 split(/\n/) 更有意义
 * @param {string} text - 原始文本
 * @returns {string[]} 文本片段数组
 */
function splitIntoSegments(text) {
  if (!text) {
    return [];
  }
  // 按换行符分段（保留自然段落结构）
  return text
    .split(/\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 计算 HTML 结构差异
 * @param {string} oldHtml - 旧 HTML
 * @param {string} newHtml - 新 HTML
 * @returns {object} 差异结果 { changed, summary }
 */
export function htmlDiff(oldHtml, newHtml) {
  const oldNorm = normalizeHtml(oldHtml);
  const newNorm = normalizeHtml(newHtml);

  if (oldNorm === newNorm) {
    return { changed: false, summary: '' };
  }

  // Detect structural changes
  const oldTags = extractTagStructure(oldNorm);
  const newTags = extractTagStructure(newNorm);

  const addedTags = newTags.filter((t) => !oldTags.includes(t));
  const removedTags = oldTags.filter((t) => !newTags.includes(t));

  const parts = [];
  if (addedTags.length > 0) {
    parts.push(`新增元素: ${addedTags.slice(0, 3).join(', ')}${addedTags.length > 3 ? '...' : ''}`);
  }
  if (removedTags.length > 0) {
    parts.push(
      `移除元素: ${removedTags.slice(0, 3).join(', ')}${removedTags.length > 3 ? '...' : ''}`
    );
  }

  return {
    changed: true,
    addedTags,
    removedTags,
    summary: parts.join('; ') || 'HTML 结构发生变化',
  };
}

/**
 * 对预归一化的 HTML 计算结构差异（跳过重复的 normalizeHtml 调用）
 * @param {string} oldNorm - 已归一化的旧 HTML
 * @param {string} newNorm - 已归一化的新 HTML
 * @returns {object} 差异结果 { changed, summary }
 */
export function htmlDiffPreNormalized(oldNorm, newNorm) {
  if (oldNorm === newNorm) {
    return { changed: false, summary: '' };
  }

  const oldTags = extractTagStructure(oldNorm);
  const newTags = extractTagStructure(newNorm);

  const addedTags = newTags.filter((t) => !oldTags.includes(t));
  const removedTags = oldTags.filter((t) => !newTags.includes(t));

  const parts = [];
  if (addedTags.length > 0) {
    parts.push(`新增元素: ${addedTags.slice(0, 3).join(', ')}${addedTags.length > 3 ? '...' : ''}`);
  }
  if (removedTags.length > 0) {
    parts.push(
      `移除元素: ${removedTags.slice(0, 3).join(', ')}${removedTags.length > 3 ? '...' : ''}`
    );
  }

  return {
    changed: true,
    addedTags,
    removedTags,
    summary: parts.join('; ') || 'HTML 结构发生变化',
  };
}

/**
 * 在文本中搜索关键词
 * @param {string} text - 目标文本
 * @param {string[]} keywords - 关键词列表
 * @returns {object} { found: boolean, matched: string[] }
 */
export function keywordSearch(text, keywords) {
  if (!keywords || keywords.length === 0 || !text) {
    return { found: false, matched: [] };
  }

  const lowerText = text.toLowerCase();
  const matched = keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));

  return {
    found: matched.length > 0,
    matched,
  };
}

/**
 * 执行变化检测（根据监控类型）
 * @param {object} task - 监控任务
 * @param {object} newSnapshot - 新快照 { text, html, hash }
 * @returns {Promise<object|null>} 变化记录或 null（无变化）
 */
export async function detectChange(task, newSnapshot) {
  if (!task.lastSnapshot) {
    return null; // 首次检查，建立基线
  }

  const { monitorType } = task;

  switch (monitorType) {
    case 'text': {
      // 快速哈希比较
      if (task.lastSnapshot.hash === newSnapshot.hash) {
        return null;
      }
      // 文本级 diff
      const diff = textDiff(task.lastSnapshot.text, newSnapshot.text);
      if (!diff.changed) {
        return null;
      }
      return {
        changeType: 'text_change',
        diff: diff.summary,
        oldSnapshot: task.lastSnapshot,
        newSnapshot,
      };
    }

    case 'structure': {
      // Snapshots already contain normalized HTML and its hash (computed in checker.js)
      if (task.lastSnapshot.hash === newSnapshot.hash) {
        return null;
      }
      // Handle migration: old snapshots may have raw HTML (not normalized).
      // Normalize the old snapshot if it hasn't been pre-normalized yet.
      let oldNorm = task.lastSnapshot.html;
      let newNorm = newSnapshot.html;
      if (task.lastSnapshot._normVersion !== 2) {
        oldNorm = normalizeHtml(task.lastSnapshot.html);
      }
      if (newSnapshot._normVersion !== 2) {
        newNorm = normalizeHtml(newSnapshot.html);
      }
      const diff = htmlDiffPreNormalized(oldNorm, newNorm);
      if (!diff.changed) {
        return null;
      }
      return {
        changeType: 'structure_change',
        diff: diff.summary,
        oldSnapshot: task.lastSnapshot,
        newSnapshot,
      };
    }

    case 'keyword': {
      const searchResult = keywordSearch(newSnapshot.text, task.keywords);
      if (!searchResult.found) {
        return null;
      }
      // Check if these keywords were already found before
      const prevMatched = task.lastSnapshot.matchedKeywords || [];
      const newlyMatched = searchResult.matched.filter((kw) => !prevMatched.includes(kw));
      if (newlyMatched.length === 0) {
        return null;
      }
      return {
        changeType: 'keyword_found',
        diff: `发现关键词: ${newlyMatched.join(', ')}`,
        keywordsMatched: newlyMatched,
        oldSnapshot: task.lastSnapshot,
        newSnapshot: {
          ...newSnapshot,
          matchedKeywords: searchResult.matched,
        },
      };
    }

    default:
      return null;
  }
}

// ==================== Helper Functions ====================

/**
 * 提取 HTML 中的标签结构
 */
function extractTagStructure(html) {
  // Match opening/self-closing tags: <tagname followed by space, >, />, or newline
  const tagRegex = /<(\w+)(?:[\s/>]|$)/g;
  const tags = [];
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    tags.push(match[1].toLowerCase());
  }
  return tags;
}
