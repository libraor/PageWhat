/**
 * diff-panel.js - Diff 面板 DOM 构建模块
 * 负责在 options 页面中渲染 diff 对比面板
 */
import {
  computeDiffSegments,
  extractChangeRegions,
  renderDiffHtml,
  extractTagLines,
  extractKeywordSnippet,
  escapeRegExp,
} from './diff-engine.js';
import { escapeHtml } from './utils.js';

export function buildTextDiffPanel(panel, oldText, newText) {
  oldText = oldText || '';
  newText = newText || '';

  if (!oldText && !newText) {
    panel.textContent = '无文本内容';
    return;
  }

  const segments = computeDiffSegments(oldText, newText);
  const { segments: initialRegions, hasEllipsis } = extractChangeRegions(segments);

  function render(isExpanded) {
    const displaySegs = isExpanded ? segments : extractChangeRegions(segments).segments;
    return {
      before: renderDiffHtml(displaySegs, 'before'),
      after: renderDiffHtml(displaySegs, 'after'),
    };
  }

  const initial = {
    before: renderDiffHtml(initialRegions, 'before'),
    after: renderDiffHtml(initialRegions, 'after'),
  };

  const grid = document.createElement('div');
  grid.className = 'diff-grid';

  const toolbar = document.createElement('div');
  toolbar.className = 'diff-toolbar';
  if (hasEllipsis) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-sm btn-secondary diff-toggle';
    toggleBtn.textContent = '显示完整差异';
    let expanded = false;
    toggleBtn.addEventListener('click', () => {
      expanded = !expanded;
      const html = render(expanded);
      grid.querySelector('.diff-column-before .diff-content').innerHTML = html.before;
      grid.querySelector('.diff-column-after .diff-content').innerHTML = html.after;
      toggleBtn.textContent = expanded ? '只显示变化区域' : '显示完整差异';
    });
    toolbar.appendChild(toggleBtn);
  }

  grid.innerHTML = `
    <div class="diff-column diff-column-before">
      <div class="diff-label">变更前</div>
      <div class="diff-content">${initial.before}</div>
    </div>
    <div class="diff-column diff-column-after">
      <div class="diff-label">变更后</div>
      <div class="diff-content">${initial.after}</div>
    </div>
  `;

  panel.appendChild(toolbar);
  panel.appendChild(grid);
}

export function buildStructureDiffPanel(panel, oldHtml, newHtml, summary) {
  oldHtml = oldHtml || '';
  newHtml = newHtml || '';

  if (summary) {
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'diff-tag-summary';
    summaryDiv.textContent = summary;
    panel.appendChild(summaryDiv);
  }

  const oldTags = extractTagLines(oldHtml);
  const newTags = extractTagLines(newHtml);

  if (oldTags || newTags) {
    const segments = computeDiffSegments(oldTags, newTags);
    const { segments: regions } = extractChangeRegions(segments);
    const beforeHtml = renderDiffHtml(regions, 'before');
    const afterHtml = renderDiffHtml(regions, 'after');

    const grid = document.createElement('div');
    grid.className = 'diff-grid';
    grid.innerHTML = `
      <div class="diff-column">
        <div class="diff-label">变更前标签</div>
        <div class="diff-content">${beforeHtml}</div>
      </div>
      <div class="diff-column">
        <div class="diff-label">变更后标签</div>
        <div class="diff-content">${afterHtml}</div>
      </div>
    `;
    panel.appendChild(grid);
  }
}

export function buildKeywordDiffPanel(panel, text, keywords) {
  text = text || '';
  keywords = keywords || [];

  if (!text || keywords.length === 0) {
    panel.textContent = '无匹配内容';
    return;
  }

  const snippet = extractKeywordSnippet(text, keywords, 2000);
  const snippetEscaped = escapeHtml(snippet);

  let highlighted = snippetEscaped;
  for (const kw of keywords) {
    const escapedKw = escapeHtml(kw);
    const regex = new RegExp(escapeRegExp(escapedKw), 'gi');
    highlighted = highlighted.replace(regex, '<mark class="diff-keyword">$&</mark>');
  }

  const col = document.createElement('div');
  col.className = 'diff-column diff-full-width';
  col.innerHTML = `
    <div class="diff-label">关键词位置</div>
    <div class="diff-content">${highlighted}</div>
  `;
  panel.appendChild(col);
}
