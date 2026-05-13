/**
 * highlight-inject.js - 页面高亮注入模块
 * 将变化高亮注入到目标页面中显示
 *
 * 核心改进：
 * - handleViewOnPage 在 options 侧预计算 diff 结果
 * - highlightOnPage 接收预计算数据，不再内含重复的 diff 算法
 * - 消除约 200 行重复代码（tokenizeLocal/lcsLocal/backtrackLocal/computeDiffLocally 等）
 */
import { computeDiffSegments, extractChangeRegions, extractTagLines } from './diff-engine.js';
import { sendMessage, urlToMatchPattern } from './utils.js';

/**
 * 在目标页面中高亮显示变化
 * 预先在 options 侧计算 diff 结果，注入函数只负责渲染
 */
export async function handleViewOnPage(record) {
  const taskResp = await sendMessage({ type: 'GET_TASK', payload: { taskId: record.taskId } });
  if (!taskResp.success || !taskResp.task) {
    alert('无法获取任务信息');
    return;
  }
  const task = taskResp.task;

  const injectData = {
    changeType: record.changeType,
    oldText: record.oldSnapshot?.text || '',
    newText: record.newSnapshot?.text || '',
    oldHtml: record.oldSnapshot?.html || '',
    newHtml: record.newSnapshot?.html || '',
    keywords: record.keywordsMatched || [],
    diff: record.diff || '',
    segments: null,
    changeRegions: null,
    structureSegments: null,
    structureChangeRegions: null,
  };

  if (record.changeType === 'text_change' && (injectData.oldText || injectData.newText)) {
    injectData.segments = computeDiffSegments(injectData.oldText, injectData.newText);
    injectData.changeRegions = extractChangeRegions(injectData.segments);
  }

  if (record.changeType === 'structure_change') {
    const oldTags = extractTagLines(injectData.oldHtml);
    const newTags = extractTagLines(injectData.newHtml);
    if (oldTags || newTags) {
      injectData.structureSegments = computeDiffSegments(oldTags, newTags);
      injectData.structureChangeRegions = extractChangeRegions(injectData.structureSegments);
    }
  }

  let tab;
  try {
    const tabs = await chrome.tabs.query({ url: urlToMatchPattern(task.url) });
    if (tabs.length > 0) {
      tab = tabs[0];
      await chrome.tabs.update(tab.id, { active: true });
    } else {
      tab = await chrome.tabs.create({ url: task.url });
    }
  } catch (e) {
    alert('无法打开目标页面: ' + e.message);
    return;
  }

  await waitForTabLoad(tab.id);

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: highlightOnPage,
      args: [injectData],
    });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (e) {
    alert('无法在该页面显示标记（可能是受保护的页面）: ' + e.message);
  }
}

function waitForTabLoad(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        done();
      }
    };

    const timeout = setTimeout(() => done(), timeoutMs);

    chrome.tabs.get(tabId, (tab) => {
      if (tab && tab.status === 'complete') {
        done();
        return;
      }
      chrome.tabs.onUpdated.addListener(listener);
    });
  });
}

/**
 * 自包含的高亮注入函数 — 通过 chrome.scripting.executeScript 注入到目标页面
 * 不能引用任何外部变量或函数
 *
 * 接收预计算的 diff 数据（data.segments / data.changeRegions），
 * 不再内部重复实现 diff 算法。
 *
 * @param {object} data - { changeType, oldText, newText, oldHtml, newHtml, keywords, diff, segments, changeRegions, structureSegments, structureChangeRegions }
 */
/* eslint-disable no-var, no-redeclare, no-inner-declarations, max-depth, complexity */
function highlightOnPage(data) {
  const P = '__pw';
  const TOOLBAR_ID = P + '_toolbar';
  const STYLE_ID = P + '_style';
  const MARK_ADDED = P + '_added';
  const MARK_KEYWORD = P + '_kw';
  const TARGET_CLS = P + '_target';
  const REMOVED_CLS = P + '_removed';
  const PANEL_ID = P + '_panel';

  if (document.getElementById(TOOLBAR_ID) || document.getElementById(PANEL_ID)) {
    clearAll();
  }

  const styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = [
    '.' +
      TARGET_CLS +
      ' { outline: 3px dashed #1a73e8 !important; outline-offset: 6px !important; }',
    '.' +
      MARK_ADDED +
      ' { background: rgba(76,175,80,0.35) !important; border-bottom: 2px solid #4caf50 !important; padding: 0 2px !important; border-radius: 2px !important; cursor: help !important; }',
    '.' +
      MARK_KEYWORD +
      ' { background: rgba(255,152,0,0.35) !important; border-bottom: 2px solid #ff9800 !important; padding: 0 2px !important; border-radius: 2px !important; font-weight: 600 !important; }',
    '.' +
      REMOVED_CLS +
      '_section { background: rgba(244,67,54,0.06) !important; border-left: 3px solid #ef5350 !important; padding: 8px 12px !important; margin: 8px 0 !important; border-radius: 0 4px 4px 0 !important; }',
    '.' +
      REMOVED_CLS +
      '_label { color: #e53935 !important; font-weight: 600 !important; font-size: 0.8em !important; margin-right: 8px !important; cursor: pointer !important; }',
    '.' +
      REMOVED_CLS +
      '_text { color: #b71c1c !important; text-decoration: line-through !important; }',
    '.' +
      REMOVED_CLS +
      '_text.collapsed { max-height: 3em !important; overflow: hidden !important; position: relative !important; }',
    '.' +
      REMOVED_CLS +
      '_text.collapsed::after { content: "...点击展开" !important; position: absolute !important; bottom: 0 !important; left: 0 !important; right: 0 !important; background: linear-gradient(transparent, rgba(244,67,54,0.06)) !important; padding: 4px 0 !important; text-decoration: none !important; font-size: 0.85em !important; cursor: pointer !important; color: #e53935 !important; }',
    '#' +
      TOOLBAR_ID +
      ' { position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; z-index: 2147483647 !important; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif !important; font-size: 14px !important; box-shadow: 0 2px 12px rgba(0,0,0,0.25) !important; }',
    '.' +
      P +
      '_main { display: flex !important; align-items: center !important; padding: 10px 16px !important; gap: 12px !important; background: linear-gradient(135deg,#1a73e8,#0d47a1) !important; color: #fff !important; }',
    '.' + P + '_title { font-weight: 700 !important; white-space: nowrap !important; }',
    '.' +
      P +
      '_summary { flex: 1 !important; font-size: 13px !important; opacity: 0.9 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }',
    '.' +
      P +
      '_btn { background: rgba(255,255,255,0.15) !important; border: 1px solid rgba(255,255,255,0.3) !important; color: #fff !important; padding: 4px 12px !important; border-radius: 4px !important; cursor: pointer !important; font-size: 12px !important; transition: background 0.15s !important; white-space: nowrap !important; }',
    '.' + P + '_btn:hover { background: rgba(255,255,255,0.25) !important; }',
    '.' +
      P +
      '_sep { width: 1px !important; height: 20px !important; background: rgba(255,255,255,0.3) !important; flex-shrink: 0 !important; }',
    '#' +
      PANEL_ID +
      ' { position: fixed !important; top: 48px !important; left: 12px !important; right: 12px !important; bottom: 12px !important; z-index: 2147483646 !important; background: #fff !important; border-radius: 12px !important; box-shadow: 0 8px 40px rgba(0,0,0,0.3) !important; display: flex !important; flex-direction: column !important; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif !important; overflow: hidden !important; }',
    '.' +
      P +
      '_panel_header { display: flex !important; align-items: center !important; justify-content: space-between !important; padding: 12px 20px !important; background: #fafbfc !important; border-bottom: 1px solid #e8e8e8 !important; }',
    '.' +
      P +
      '_panel_title { font-size: 15px !important; font-weight: 600 !important; color: #333 !important; }',
    '.' +
      P +
      '_panel_close { background: #e0e0e0 !important; border: none !important; width: 32px !important; height: 32px !important; border-radius: 50% !important; cursor: pointer !important; font-size: 18px !important; display: flex !important; align-items: center !important; justify-content: center !important; color: #666 !important; }',
    '.' + P + '_panel_close:hover { background: #d0d0d0 !important; }',
    '.' +
      P +
      '_panel_body { flex: 1 !important; display: flex !important; flex-direction: column !important; overflow: hidden !important; }',
    '.' +
      P +
      '_diff_tabs { display: flex !important; border-bottom: 1px solid #e0e0e0 !important; padding: 0 16px !important; }',
    '.' +
      P +
      '_diff_tab { padding: 8px 16px !important; font-size: 13px !important; font-weight: 500 !important; color: #666 !important; cursor: pointer !important; border-bottom: 2px solid transparent !important; margin-bottom: -1px !important; background: none !important; border-top: none !important; border-left: none !important; border-right: none !important; }',
    '.' + P + '_diff_tab:hover { color: #1a73e8 !important; }',
    '.' +
      P +
      '_diff_tab.active { color: #1a73e8 !important; border-bottom-color: #1a73e8 !important; }',
    '.' +
      P +
      '_diff_content { flex: 1 !important; overflow-y: auto !important; padding: 12px 16px !important; }',
    '.' +
      P +
      '_diff_grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 12px !important; min-height: 100% !important; }',
    '.' + P + '_diff_col { min-width: 0 !important; }',
    '.' +
      P +
      '_diff_label { font-size: 11px !important; font-weight: 600 !important; color: #888 !important; text-transform: uppercase !important; letter-spacing: 0.5px !important; margin-bottom: 6px !important; }',
    '.' +
      P +
      '_diff_text { background: #fafbfc !important; border: 1px solid #e8e8e8 !important; border-radius: 6px !important; padding: 8px 10px !important; font-size: 12px !important; line-height: 1.5 !important; word-break: break-word !important; white-space: pre-wrap !important; color: #333 !important; max-height: none !important; font-family: Consolas,Monaco,"Courier New",monospace !important; }',
    '.' +
      P +
      '_diff_text mark.removed { background: #fdd !important; color: #b71c1c !important; text-decoration: line-through !important; border-radius: 2px !important; padding: 1px 3px !important; }',
    '.' +
      P +
      '_diff_text mark.added { background: #c8e6c9 !important; color: #1b5e20 !important; border-radius: 2px !important; padding: 1px 3px !important; }',
    '.' +
      P +
      '_diff_text .diff-ellipsis { color: #aaa !important; font-style: italic !important; }',
    '.' +
      P +
      '_diff_text .diff-deleted-marker { background: #fce4ec !important; color: #c62828 !important; text-decoration: line-through !important; opacity: 0.65 !important; border-radius: 2px !important; padding: 1px 4px !important; font-size: 0.9em !important; cursor: help !important; }',
    '.' +
      P +
      '_diff_text .diff-added-marker { background: #e8f5e9 !important; color: #2e7d32 !important; border-radius: 2px !important; padding: 1px 4px !important; font-size: 0.85em !important; cursor: help !important; }',
    '.' +
      P +
      '_diff_text mark.keyword { background: #ffe0b2 !important; color: #e65100 !important; border-radius: 2px !important; padding: 1px 3px !important; font-weight: 600 !important; }',
    '.' + P + '_kw_section { padding: 8px 0 !important; }',
    '.' +
      P +
      '_kw_item { padding: 6px 12px !important; margin: 6px 0 !important; background: #fff3e0 !important; border-left: 3px solid #ff9800 !important; border-radius: 0 4px 4px 0 !important; font-size: 13px !important; color: #e65100 !important; font-weight: 500 !important; }',
    '.' +
      P +
      '_struct_summary { padding: 12px 16px !important; background: #f0f4ff !important; border-radius: 6px !important; margin-bottom: 12px !important; line-height: 1.5 !important; font-size: 13px !important; color: #555 !important; }',
    '#' +
      P +
      '_backdrop { position: fixed !important; inset: 0 !important; background: rgba(0,0,0,0.3) !important; z-index: 2147483645 !important; }',
    'body.' + P + '_active { padding-top: 0 !important; }',
  ].join('\n');
  document.head.appendChild(styleEl);

  const el = document.body;

  if (el) {
    el.classList.add(TARGET_CLS);
  }

  var segments = data.segments || [];
  var addedChunks = [];
  var removedChunks = [];

  if (data.changeType === 'text_change' && segments.length > 0) {
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].type === 'added' && segments[i].text.trim()) {
        addedChunks.push(segments[i].text);
      }
      if (segments[i].type === 'removed' && segments[i].text.trim()) {
        removedChunks.push(segments[i].text);
      }
    }
  }

  var marks = [];
  if (el) {
    if (data.changeType === 'text_change') {
      marks = applyAddedHighlights(el, addedChunks);
      insertRemovedBlocks(el, removedChunks);
    } else if (data.changeType === 'keyword_found') {
      marks = applyKeywordHighlights(el, data.keywords || []);
    }
  }

  buildToolbar(data, segments, marks);

  buildFullPanel(data, segments);

  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function escHtml(text) {
    var d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function compactWhitespaceLocal(text) {
    return text.replace(/[\r\n\t ]{2,}/g, function (match) {
      if (match.indexOf('\n') >= 0) {
        var leading = match.match(/^\s*/)[0];
        return '\n' + leading.replace(/\s+/g, ' ');
      }
      return ' ';
    }).replace(/^[\r\n]+|[\r\n]+$/g, '').replace(/  +/g, ' ');
  }

  function renderDiffToHtml(segs, side) {
    var html = '';
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.type === 'ellipsis') {
        html += '<span class="diff-ellipsis"> \u2026 </span>';
      } else if (s.type === 'equal') {
        html += escHtml(compactWhitespaceLocal(s.text));
      } else if (s.type === 'removed' && side === 'before') {
        html += '<mark class="removed">' + escHtml(s.text) + '</mark>';
      } else if (s.type === 'removed' && side === 'after') {
        var txt = s.text.length > 500 ? s.text.slice(0, 500) + '\u2026' : s.text;
        html +=
          '<span class="diff-deleted-marker" title="已删除的内容">' + escHtml(txt) + '</span>';
      } else if (s.type === 'added' && side === 'after') {
        html += '<mark class="added">' + escHtml(s.text) + '</mark>';
      } else if (s.type === 'added' && side === 'before') {
        html += '<span class="diff-added-marker" title="此处新增了内容">[+]</span>';
      }
    }
    return html || '<span class="diff-ellipsis">（无差异）</span>';
  }

  function collectTextNodes(root) {
    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while ((n = walker.nextNode())) {
      if (n.textContent.trim()) {
        nodes.push(n);
      }
    }
    return nodes;
  }

  function applyAddedHighlights(root, chunks) {
    var result = [];
    var textNodes = collectTextNodes(root);

    for (var ci = 0; ci < chunks.length; ci++) {
      var chunk = chunks[ci];
      if (!chunk || !chunk.trim()) {
        continue;
      }
      var found = false;

      for (var j = 0; j < textNodes.length; j++) {
        var idx = textNodes[j].textContent.indexOf(chunk);
        if (idx >= 0) {
          try {
            var range = document.createRange();
            range.setStart(textNodes[j], idx);
            range.setEnd(textNodes[j], idx + chunk.length);
            var mark = document.createElement('mark');
            mark.className = MARK_ADDED;
            mark.title = '新增内容';
            range.surroundContents(mark);
            result.push(mark);
            textNodes = collectTextNodes(root);
            found = true;
          } catch (e) {
            /* cross-boundary, try next strategy */
          }
          break;
        }
      }
      if (found) {
        continue;
      }

      var fullText = '';
      var nodeMap = [];
      for (var j = 0; j < textNodes.length; j++) {
        var start = fullText.length;
        fullText += textNodes[j].textContent;
        nodeMap.push({ node: textNodes[j], start: start, end: fullText.length });
      }

      var crossIdx = fullText.indexOf(chunk);
      if (crossIdx >= 0) {
        var chunkStart = crossIdx;
        var chunkEnd = crossIdx + chunk.length;
        var tempMarks = [];
        try {
          for (var k = 0; k < nodeMap.length && chunkStart < chunkEnd; k++) {
            var nm = nodeMap[k];
            var overlapStart = Math.max(chunkStart, nm.start);
            var overlapEnd = Math.min(chunkEnd, nm.end);
            if (overlapStart >= overlapEnd) {
              continue;
            }
            var localStart = overlapStart - nm.start;
            var localEnd = overlapEnd - nm.start;
            var r = document.createRange();
            r.setStart(nm.node, localStart);
            r.setEnd(nm.node, localEnd);
            var mk = document.createElement('mark');
            mk.className = MARK_ADDED;
            mk.title = '新增内容';
            r.surroundContents(mk);
            tempMarks.push(mk);
          }
          for (var t = 0; t < tempMarks.length; t++) {
            result.push(tempMarks[t]);
          }
          textNodes = collectTextNodes(root);
        } catch (e) {
          /* cross-boundary within nested elements, skip */
        }
      }
    }
    return result;
  }

  function applyKeywordHighlights(root, keywords) {
    var result = [];
    if (!keywords || keywords.length === 0) {
      return result;
    }
    var textNodes = collectTextNodes(root);

    for (var i = 0; i < keywords.length; i++) {
      var kw = keywords[i];
      for (var j = 0; j < textNodes.length; j++) {
        var idx = textNodes[j].textContent.toLowerCase().indexOf(kw.toLowerCase());
        if (idx >= 0) {
          try {
            var range = document.createRange();
            range.setStart(textNodes[j], idx);
            range.setEnd(textNodes[j], idx + kw.length);
            var mark = document.createElement('mark');
            mark.className = MARK_KEYWORD;
            mark.title = '匹配关键词: ' + kw;
            range.surroundContents(mark);
            result.push(mark);
            textNodes = collectTextNodes(root);
          } catch (e) {
            /* skip */
          }
          break;
        }
      }
    }
    return result;
  }

  function insertRemovedBlocks(root, chunks) {
    if (!chunks || chunks.length === 0) {
      return;
    }
    var filtered = [];
    for (var i = 0; i < chunks.length; i++) {
      if (chunks[i] && chunks[i].trim()) {
        filtered.push(chunks[i]);
      }
    }
    if (filtered.length === 0) {
      return;
    }

    var container = document.createElement('div');
    container.className = REMOVED_CLS + '_section';

    var label = document.createElement('span');
    label.className = REMOVED_CLS + '_label';
    label.textContent = '已删除的内容 (' + filtered.length + ' 处):';
    container.appendChild(label);

    for (var i = 0; i < filtered.length; i++) {
      var text = document.createElement('span');
      text.className = REMOVED_CLS + '_text';
      text.textContent = filtered[i];
      if (filtered[i].length > 300) {
        text.classList.add('collapsed');
        text.title = '点击展开完整删除内容';
        (function (txtEl) {
          txtEl.addEventListener('click', function () {
            txtEl.classList.toggle('collapsed');
            txtEl.title = txtEl.classList.contains('collapsed')
              ? '点击展开完整删除内容'
              : '点击收起';
          });
        })(text);
      }
      container.appendChild(text);
      if (i < filtered.length - 1) {
        container.appendChild(document.createElement('br'));
      }
    }

    if (root.parentNode) {
      root.parentNode.insertBefore(container, root);
    }
  }

  function buildToolbar(data, segs, marks) {
    var toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;

    var main = document.createElement('div');
    main.className = P + '_main';

    var title = document.createElement('span');
    title.className = P + '_title';
    title.textContent = '\u{1F50D} PageWhat';
    main.appendChild(title);

    var summary = document.createElement('span');
    summary.className = P + '_summary';
    if (data.changeType === 'text_change') {
      var ac = 0,
        rc = 0;
      for (var i = 0; i < segs.length; i++) {
        if (segs[i].type === 'added' && segs[i].text.trim()) {
          ac++;
        }
        if (segs[i].type === 'removed' && segs[i].text.trim()) {
          rc++;
        }
      }
      summary.textContent = ac + ' 处新增, ' + rc + ' 处删除';
    } else if (data.changeType === 'keyword_found') {
      summary.textContent = '发现关键词: ' + (data.keywords || []).join(', ');
    } else {
      summary.textContent = '页面结构发生变化';
    }
    main.appendChild(summary);

    var sep0 = document.createElement('div');
    sep0.className = P + '_sep';
    main.appendChild(sep0);
    var panelBtn = document.createElement('button');
    panelBtn.className = P + '_btn';
    panelBtn.textContent = '\u{1F4CA} 查看完整对比';
    main.appendChild(panelBtn);

    if (marks.length > 0) {
      var sep1 = document.createElement('div');
      sep1.className = P + '_sep';
      main.appendChild(sep1);

      var nav = document.createElement('div');
      nav.className = P + '_nav';
      nav.style.cssText = 'display:flex;align-items:center;gap:6px;';

      var prevBtn = document.createElement('button');
      prevBtn.className = P + '_btn';
      prevBtn.textContent = '\u25C0 上一个';

      var counter = document.createElement('span');
      counter.textContent = '0/' + marks.length;

      var nextBtn = document.createElement('button');
      nextBtn.className = P + '_btn';
      nextBtn.textContent = '下一个 \u25B6';

      var currentIdx = -1;

      function navigateTo(idx) {
        if (idx < 0 || idx >= marks.length) {
          return;
        }
        currentIdx = idx;
        counter.textContent = idx + 1 + '/' + marks.length;
        marks[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        marks[idx].style.transition = 'transform 0.15s';
        marks[idx].style.transform = 'scale(1.15)';
        setTimeout(function () {
          marks[idx].style.transform = '';
        }, 300);
        prevBtn.disabled = idx === 0;
        nextBtn.disabled = idx === marks.length - 1;
      }

      prevBtn.addEventListener('click', function () {
        navigateTo(currentIdx - 1);
      });
      nextBtn.addEventListener('click', function () {
        navigateTo(currentIdx + 1);
      });
      prevBtn.disabled = true;

      nav.appendChild(prevBtn);
      nav.appendChild(counter);
      nav.appendChild(nextBtn);
      main.appendChild(nav);

      setTimeout(function () {
        navigateTo(0);
      }, 600);
    }

    var sep3 = document.createElement('div');
    sep3.className = P + '_sep';
    main.appendChild(sep3);

    var dismissBtn = document.createElement('button');
    dismissBtn.className = P + '_btn';
    dismissBtn.textContent = '\u2715 清除标记';
    dismissBtn.addEventListener('click', clearAll);
    main.appendChild(dismissBtn);

    toolbar.appendChild(main);

    panelBtn.addEventListener('click', function () {
      var panel = document.getElementById(PANEL_ID);
      var backdrop = document.getElementById(P + '_backdrop');
      if (panel) {
        panel.remove();
        if (backdrop) {
          backdrop.remove();
        }
      } else {
        buildFullPanel(data, segs);
        var bd = document.createElement('div');
        bd.id = P + '_backdrop';
        bd.addEventListener('click', function () {
          var p = document.getElementById(PANEL_ID);
          if (p) {
            p.remove();
          }
          bd.remove();
        });
        document.body.appendChild(bd);
      }
    });

    document.body.appendChild(toolbar);
    document.body.classList.add(P + '_active');
  }

  function buildFullPanel(data, segs) {
    var existing = document.getElementById(PANEL_ID);
    if (existing) {
      existing.remove();
    }

    var panel = document.createElement('div');
    panel.id = PANEL_ID;

    var header = document.createElement('div');
    header.className = P + '_panel_header';
    var htitle = document.createElement('span');
    htitle.className = P + '_panel_title';
    if (data.changeType === 'text_change') {
      htitle.textContent = '\u{1F4CA} 文本变化对比';
    } else if (data.changeType === 'keyword_found') {
      htitle.textContent = '\u{1F50D} 关键词匹配详情';
    } else if (data.changeType === 'structure_change') {
      htitle.textContent = '\u{1F3D7} 结构变化对比';
    } else {
      htitle.textContent = '\u{1F4CA} 变化详情';
    }
    header.appendChild(htitle);

    var closeBtn = document.createElement('button');
    closeBtn.className = P + '_panel_close';
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', function () {
      panel.remove();
      var bd = document.getElementById(P + '_backdrop');
      if (bd) {
        bd.remove();
      }
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var body = document.createElement('div');
    body.className = P + '_panel_body';

    if (data.changeType === 'text_change') {
      buildTextDiffInPanel(body, segs);
    } else if (data.changeType === 'keyword_found') {
      buildKeywordDiffInPanel(body, data);
    } else if (data.changeType === 'structure_change') {
      buildStructureDiffInPanel(body, data);
    }

    panel.appendChild(body);
    document.body.appendChild(panel);

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildTextDiffInPanel(body, segs) {
    var tabsDiv = document.createElement('div');
    tabsDiv.className = P + '_diff_tabs';

    var tabChange = document.createElement('button');
    tabChange.className = P + '_diff_tab active';
    tabChange.textContent = '变化区域';
    var tabFull = document.createElement('button');
    tabFull.className = P + '_diff_tab';
    tabFull.textContent = '完整文本';
    tabsDiv.appendChild(tabChange);
    tabsDiv.appendChild(tabFull);
    body.appendChild(tabsDiv);

    var contentDiv = document.createElement('div');
    contentDiv.className = P + '_diff_content';

    var changeRegions = data.changeRegions ? data.changeRegions.segments : segs;
    contentDiv.appendChild(renderDiffGrid(contentDiv, changeRegions));

    tabChange.addEventListener('click', function () {
      tabChange.classList.add('active');
      tabFull.classList.remove('active');
      contentDiv.innerHTML = '';
      var regions = data.changeRegions ? data.changeRegions.segments : segs;
      contentDiv.appendChild(renderDiffGrid(contentDiv, regions));
    });
    tabFull.addEventListener('click', function () {
      tabFull.classList.add('active');
      tabChange.classList.remove('active');
      contentDiv.innerHTML = '';
      contentDiv.appendChild(renderDiffGrid(contentDiv, segs));
    });

    body.appendChild(contentDiv);
  }

  function renderDiffGrid(parent, segs) {
    var grid = document.createElement('div');
    grid.className = P + '_diff_grid';

    var beforeCol = document.createElement('div');
    beforeCol.className = P + '_diff_col';
    var beforeLabel = document.createElement('div');
    beforeLabel.className = P + '_diff_label';
    beforeLabel.textContent = '变更前';
    beforeCol.appendChild(beforeLabel);
    var beforeText = document.createElement('div');
    beforeText.className = P + '_diff_text';
    beforeText.innerHTML = renderDiffToHtml(segs, 'before');
    beforeCol.appendChild(beforeText);

    var afterCol = document.createElement('div');
    afterCol.className = P + '_diff_col';
    var afterLabel = document.createElement('div');
    afterLabel.className = P + '_diff_label';
    afterLabel.textContent = '变更后';
    afterCol.appendChild(afterLabel);
    var afterText = document.createElement('div');
    afterText.className = P + '_diff_text';
    afterText.innerHTML = renderDiffToHtml(segs, 'after');
    afterCol.appendChild(afterText);

    grid.appendChild(beforeCol);
    grid.appendChild(afterCol);
    return grid;
  }

  function buildKeywordDiffInPanel(body, data) {
    var contentDiv = document.createElement('div');
    contentDiv.className = P + '_diff_content';
    contentDiv.style.maxWidth = '700px';

    if (!data.keywords || data.keywords.length === 0) {
      contentDiv.textContent = '无匹配关键词';
      body.appendChild(contentDiv);
      return;
    }

    var desc = document.createElement('p');
    desc.style.cssText = 'color:#666;font-size:13px;margin-bottom:16px;';
    desc.textContent = '以下关键词在页面中被找到：';
    contentDiv.appendChild(desc);

    for (var i = 0; i < data.keywords.length; i++) {
      var item = document.createElement('div');
      item.className = P + '_kw_item';
      item.textContent = '\u{1F534} ' + data.keywords[i];
      contentDiv.appendChild(item);
    }

    if (data.newText) {
      var ctxTitle = document.createElement('p');
      ctxTitle.style.cssText = 'color:#666;font-size:13px;margin:16px 0 8px;font-weight:600;';
      ctxTitle.textContent = '关键词上下文：';
      contentDiv.appendChild(ctxTitle);

      var ctxDiv = document.createElement('div');
      ctxDiv.className = P + '_diff_text';
      ctxDiv.style.maxHeight = '400px';
      ctxDiv.style.overflow = 'auto';

      var snippet = data.newText;
      if (snippet.length > 5000) {
        var kw = data.keywords[0] || '';
        var kwIdx = snippet.toLowerCase().indexOf(kw.toLowerCase());
        if (kwIdx >= 0) {
          var half = 2000;
          var s = Math.max(0, kwIdx - half);
          var e = Math.min(snippet.length, kwIdx + half + 2000);
          snippet =
            (s > 0 ? '\u2026' : '') + snippet.slice(s, e) + (e < snippet.length ? '\u2026' : '');
        } else {
          snippet = snippet.slice(0, 5000) + '\u2026';
        }
      }

      var escaped = escHtml(snippet);
      for (var k = 0; k < data.keywords.length; k++) {
        var kwEsc = escHtml(data.keywords[k]);
        var re = new RegExp(kwEsc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        escaped = escaped.replace(re, '<mark class="keyword">$&</mark>');
      }
      ctxDiv.innerHTML = escaped;
      contentDiv.appendChild(ctxDiv);
    }

    body.appendChild(contentDiv);
  }

  function buildStructureDiffInPanel(body, data) {
    var contentDiv = document.createElement('div');
    contentDiv.className = P + '_diff_content';

    if (data.diff) {
      var summary = document.createElement('div');
      summary.className = P + '_struct_summary';
      summary.textContent = data.diff;
      contentDiv.appendChild(summary);
    }

    if (data.structureSegments) {
      var regions = data.structureChangeRegions ? data.structureChangeRegions.segments : data.structureSegments;
      contentDiv.appendChild(renderDiffGrid(contentDiv, regions));
    } else {
      var noData = document.createElement('p');
      noData.style.cssText = 'color:#999;font-size:13px;';
      noData.textContent = '无结构数据可用于对比。';
      contentDiv.appendChild(noData);
    }

    body.appendChild(contentDiv);
  }

  function clearAll() {
    var tb = document.getElementById(TOOLBAR_ID);
    if (tb) {
      tb.remove();
    }
    var pn = document.getElementById(PANEL_ID);
    if (pn) {
      pn.remove();
    }
    var bd = document.getElementById(P + '_backdrop');
    if (bd) {
      bd.remove();
    }
    var st = document.getElementById(STYLE_ID);
    if (st) {
      st.remove();
    }
    document.body.classList.remove(P + '_active');
    var targets = document.querySelectorAll('.' + TARGET_CLS);
    for (var i = 0; i < targets.length; i++) {
      targets[i].classList.remove(TARGET_CLS);
    }
    var marks = document.querySelectorAll('.' + MARK_ADDED + ', .' + MARK_KEYWORD);
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      var parent = m.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(m.textContent), m);
        parent.normalize();
      }
    }
    var sections = document.querySelectorAll('.' + REMOVED_CLS + '_section');
    for (var i = 0; i < sections.length; i++) {
      sections[i].remove();
    }
  }
}
/* eslint-enable no-var, no-redeclare, no-inner-declarations, max-depth, complexity */
