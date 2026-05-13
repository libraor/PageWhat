/**
 * diff-engine.js - Diff 算法纯函数模块
 * 无 DOM 依赖，可被 diff-panel、highlight-inject 等多个消费者复用
 */
import { escapeHtml } from './utils.js';

export const DIFF_MAX_TOKENS = 2000;
export const DIFF_CONTEXT_RADIUS = 50;
export const CHUNK_TARGET_SIZE = 512;

export function compactWhitespace(text) {
  return text
    .replace(/[\r\n\t ]{2,}/g, (match) => {
      if (match.includes('\n')) {
        const leading = match.match(/^\s*/)[0];
        return '\n' + leading.replace(/\s+/g, ' ');
      }
      return ' ';
    })
    .replace(/^[\r\n]+|[\r\n]+$/g, '')
    .replace(/  +/g, ' ');
}

export function tokenizeText(text) {
  if (!text) {
    return [];
  }
  const tokens = [];
  const regex =
    /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]|[a-zA-Z0-9]+|\s+|[^\s\w\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    tokens.push(m[0]);
  }
  return tokens;
}

export function computeLcsTable(a, b) {
  const m = a.length,
    n = b.length;
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

export function backtrackLcs(dp, a, b) {
  const raw = [];
  let i = a.length,
    j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      raw.push({ type: 'equal', text: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: 'added', text: b[j - 1] });
      j--;
    } else {
      raw.push({ type: 'removed', text: a[i - 1] });
      i--;
    }
  }
  raw.reverse();

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

export function computeSimpleLineDiff(oldText, newText) {
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
      if (o !== undefined) {
        segments.push({ type: 'removed', text: o + '\n' });
      }
      if (n !== undefined) {
        segments.push({ type: 'added', text: n + '\n' });
      }
    }
  }
  return segments;
}

const BUZHASH_TABLE = new Uint32Array(65536);
{
  let seed = 0x12345678;
  for (let i = 0; i < 65536; i++) {
    seed = (Math.imul(seed, 0x5bd1e995) + i) >>> 0;
    BUZHASH_TABLE[i] = seed;
  }
}

export function cdChunk(text, targetSize) {
  if (!text) {
    return [];
  }
  if (text.length < targetSize) {
    return [text];
  }

  const WINDOW = 48;
  const MIN_CHUNK = targetSize >> 1;
  const MAX_CHUNK = targetSize * 3;
  const MASK = targetSize - 1;

  const chunks = [];
  let start = 0;
  let hash = 0;
  const win = new Uint16Array(WINDOW);
  let wp = 0,
    wlen = 0;

  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const outC = wlen >= WINDOW ? win[wp] : 0;

    hash = ((hash << 1) | (hash >>> 31)) >>> 0;
    if (wlen >= WINDOW) {
      hash = (hash ^ BUZHASH_TABLE[outC]) >>> 0;
    }
    hash = (hash ^ BUZHASH_TABLE[c]) >>> 0;

    win[wp] = c;
    wp = (wp + 1) % WINDOW;
    if (wlen < WINDOW) {
      wlen++;
    }

    const chunkLen = i - start + 1;
    if (chunkLen >= MIN_CHUNK && ((hash & MASK) === 0 || chunkLen >= MAX_CHUNK)) {
      chunks.push(text.slice(start, i + 1));
      start = i + 1;
      hash = 0;
      wlen = 0;
      wp = 0;
    }
  }

  if (start < text.length) {
    chunks.push(text.slice(start));
  }

  return chunks.length > 0 ? chunks : [text];
}

export function refineChunkSegments(chunkSegs, depth = 0) {
  const result = [];
  let i = 0;

  while (i < chunkSegs.length) {
    const seg = chunkSegs[i];

    if (seg.type === 'equal') {
      result.push(seg);
      i++;
      continue;
    }

    const removedTexts = [];
    const addedTexts = [];

    while (i < chunkSegs.length && chunkSegs[i].type === 'removed') {
      removedTexts.push(chunkSegs[i].text);
      i++;
    }
    while (i < chunkSegs.length && chunkSegs[i].type === 'added') {
      addedTexts.push(chunkSegs[i].text);
      i++;
    }

    if (removedTexts.length > 0 && addedTexts.length > 0) {
      const removed = removedTexts.join('');
      const added = addedTexts.join('');
      const oldTokens = tokenizeText(removed);
      const newTokens = tokenizeText(added);

      if (oldTokens.length <= DIFF_MAX_TOKENS && newTokens.length <= DIFF_MAX_TOKENS) {
        const dp = computeLcsTable(oldTokens, newTokens);
        result.push(...backtrackLcs(dp, oldTokens, newTokens));
      } else if (depth < 1) {
        result.push(...computeChunkedDiff(removed, added, depth + 1));
      } else {
        result.push(...computeSimpleLineDiff(removed, added));
      }
    } else {
      for (const t of removedTexts) {
        result.push({ type: 'removed', text: t });
      }
      for (const t of addedTexts) {
        result.push({ type: 'added', text: t });
      }
    }
  }

  return result;
}

export function computeChunkedDiff(oldText, newText, depth = 0) {
  const oldChunks = cdChunk(oldText, CHUNK_TARGET_SIZE);
  const newChunks = cdChunk(newText, CHUNK_TARGET_SIZE);

  const dp = computeLcsTable(oldChunks, newChunks);
  const chunkSegs = backtrackLcs(dp, oldChunks, newChunks);

  return refineChunkSegments(chunkSegs, depth);
}

export function computeDiffSegments(oldText, newText) {
  if (!oldText && !newText) {
    return [];
  }
  if (!oldText) {
    return [{ type: 'added', text: newText }];
  }
  if (!newText) {
    return [{ type: 'removed', text: oldText }];
  }

  const oldTokens = tokenizeText(oldText);
  const newTokens = tokenizeText(newText);

  if (oldTokens.length <= DIFF_MAX_TOKENS && newTokens.length <= DIFF_MAX_TOKENS) {
    const dp = computeLcsTable(oldTokens, newTokens);
    return backtrackLcs(dp, oldTokens, newTokens);
  }

  return computeChunkedDiff(oldText, newText);
}

export function extractChangeRegions(segments) {
  const changeIdx = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].type !== 'equal') {
      changeIdx.push(i);
    }
  }
  if (changeIdx.length === 0) {
    return { segments, hasEllipsis: false };
  }

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

  let hasEllipsis = false;
  const result = [];
  for (let i = 0; i < ranges.length; i++) {
    if (i > 0 || ranges[i].start > 0) {
      result.push({ type: 'ellipsis' });
      hasEllipsis = true;
    }
    for (let j = ranges[i].start; j <= ranges[i].end; j++) {
      result.push(segments[j]);
    }
  }
  if (ranges[ranges.length - 1].end < segments.length - 1) {
    result.push({ type: 'ellipsis' });
    hasEllipsis = true;
  }
  return { segments: result, hasEllipsis };
}

export function renderDiffHtml(segments, side) {
  let html = '';
  for (const seg of segments) {
    if (seg.type === 'ellipsis') {
      html += '<span class="diff-ellipsis"> … </span>';
      continue;
    }
    if (seg.type === 'equal') {
      html += escapeHtml(compactWhitespace(seg.text));
    } else if (seg.type === 'removed' && side === 'before') {
      html += `<mark class="diff-removed">${escapeHtml(seg.text)}</mark>`;
    } else if (seg.type === 'removed' && side === 'after') {
      html += `<span class="diff-deleted-marker" title="已删除的内容">${escapeHtml(seg.text.length > 200 ? seg.text.slice(0, 200) + '…' : seg.text)}</span>`;
    } else if (seg.type === 'added' && side === 'after') {
      html += `<mark class="diff-added">${escapeHtml(seg.text)}</mark>`;
    } else if (seg.type === 'added' && side === 'before') {
      html += '<span class="diff-added-marker" title="此处新增了内容">[+]</span>';
    }
  }
  return html || '<span class="diff-ellipsis">（无差异）</span>';
}

export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractTagLines(html) {
  if (!html) {
    return '';
  }
  const tags = html.match(/<[\w][^>]*>/g);
  return tags ? tags.join('\n') : '';
}

export function extractKeywordSnippet(text, keywords, maxLen) {
  if (!text || text.length <= maxLen) {
    return text;
  }

  const positions = [];
  for (const kw of keywords) {
    const idx = text.toLowerCase().indexOf(kw.toLowerCase());
    if (idx >= 0) {
      positions.push(idx);
    }
  }
  if (positions.length === 0) {
    return text.slice(0, maxLen) + '…';
  }

  const center = positions[0];
  const halfLen = Math.floor(maxLen / 2);
  let start = Math.max(0, center - halfLen);
  const end = Math.min(text.length, start + maxLen);
  if (end - start < maxLen) {
    start = Math.max(0, end - maxLen);
  }

  let snippet = '';
  if (start > 0) {
    snippet += '…';
  }
  snippet += text.slice(start, end);
  if (end < text.length) {
    snippet += '…';
  }
  return snippet;
}
