# PageWhat

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/)
[![ES Modules](https://img.shields.io/badge/Module-ES%20Modules-green)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
[![ESLint](https://img.shields.io/badge/Lint-ESLint-4B32C3)](https://eslint.org/)
[![Prettier](https://img.shields.io/badge/Format-Prettier-F7B93E)](https://prettier.io/)
[![Jest](https://img.shields.io/badge/Test-Jest-C21325)](https://jestjs.io/)

Chrome 扩展，监控网页内容变化——文本增删、结构改变、关键词出现，变化一目了然。

## 功能亮点

### 三种监控模式

| 模式       | 说明                                              |
| ---------- | ------------------------------------------------- |
| 文本监控   | 检测网页文本内容增删，Buzhash CDC + LCS 精确 diff |
| 结构监控   | 检测 HTML 标签结构变化，归一化后比对              |
| 关键词监控 | 监控指定关键词出现，自动去重避免重复通知          |

### 智能检查策略

- **Tab 注入** — 复用已打开的标签页，保留登录态
- **Offscreen fetch** — 后台 fetch + DOMParser，无需打开标签页
- **Open Tab** — 打开后台标签页等待 JS 渲染，适用于 SPA
- **自动模式（推荐）** — 依次尝试 Tab 注入 → fetch → openTab，智能降级
- **并发控制** — `maxConcurrentChecks` 限制同时执行的检查数，超出时跳过并标记 `skipped`

### 精确变化对比

- **Buzhash 内容定义分块** — 大文本也能精确 diff，相同内容在不同位置产生相同分块边界
- **LCS token 算法** — CJK 逐字、英文按单词，精确到词级差异
- **可折叠对比面板** — 默认只显示变化区域及上下文，一键切换完整差异
- **页面内高亮** — 点击"在页面中显示"，直接在原始页面上标记新增（绿底）、删除（红删除线）、关键词（橙色）

### 多重通知

- Chrome 原生桌面通知
- 扩展图标红色角标（99+）

### 动态页面抗噪声

自动过滤 React / Vue / Next.js 等 SPA 框架的水合数据、动态 CSS、CSRF token、CSP nonce 等每次都变但非用户可见的内容，避免误报。

### 错误追踪

- 每个任务独立记录错误日志，支持按任务筛选
- 连续错误达到阈值自动暂停任务，避免无效请求
- 错误类型标签化，快速定位问题

## 技术栈

**运行时**

- **Manifest V3** — Chrome 扩展最新标准
- **纯原生 JS / HTML / CSS** — 无框架、无构建工具
- **ES Modules** — 顶部静态 import
- **chrome.\* API** — alarms / storage / scripting / notifications / offscreen

**开发工具链**

- **ESLint** — 代码规范检查（Manifest V3 专属规则）
- **Prettier** — 代码格式化
- **Jest** — 单元测试（jsdom 环境 + Chrome API mock）

## 开发环境搭建

```bash
# 1. 安装 Node.js >= 18
node -v

# 2. 安装依赖
npm install

# 3. 运行全量验证
npm run validate
```

## 安装扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择本项目根目录
5. 扩展图标出现在工具栏，安装完成

## 项目结构

```
PageWhat/
├── manifest.json              # Manifest V3 配置
├── background.js              # Service Worker 核心调度
├── package.json               # 开发依赖与脚本
├── jest.config.cjs            # Jest 测试配置
├── .eslintrc.json             # ESLint 规则
├── .prettierrc.json           # Prettier 格式化配置
├── .gitignore                 # Git 忽略规则
├── .gitattributes             # Git 属性（LF 归一化）
├── LICENSE                    # Apache License 2.0
├── verify.js                  # 文件完整性验证脚本
├── lib/
│   ├── storage.js             # chrome.storage.local CRUD 封装
│   ├── alarm-manager.js       # chrome.alarms 生命周期管理
│   ├── checker.js             # 检查引擎（Tab 注入 / Offscreen fetch / Open Tab）
│   ├── diff.js                # 变化检测算法（SHA-256 + 文本/结构/关键词 diff）
│   ├── notifier.js            # 通知调度（Chrome 通知 + 角标）
│   └── utils.js               # 共享工具（ensureOffscreenDocument + truncate）
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js           # Offscreen 文档（DOM 解析）
├── popup/
│   ├── popup.html
│   ├── popup.js               # 快速添加监控、任务列表
│   └── popup.css
├── options/
│   ├── options.html
│   ├── options.js             # 管理面板（任务 / 变化 / 错误 / 设置 + diff 引擎）
│   └── options.css
└── assets/
    └── icons/                 # 扩展图标（16 / 48 / 128）
```

## 开发命令

| 命令                    | 说明                             |
| ----------------------- | -------------------------------- |
| `npm run lint`          | ESLint 代码检查                  |
| `npm run lint:fix`      | ESLint 自动修复                  |
| `npm run format`        | Prettier 格式化所有文件          |
| `npm run format:check`  | 检查格式是否合规                 |
| `npm run test`          | 运行单元测试                     |
| `npm run test:watch`    | 监听模式                         |
| `npm run test:coverage` | 生成覆盖率报告                   |
| `npm run validate`      | 全量验证（lint + format + test） |

## 核心架构

### 数据流

```
Popup / Options --sendMessage--> Service Worker --alarm--> Checker
                                     |                        |
                                     |                   提取内容 + 哈希比对
                                     |                        |
                                     |                   检测到变化
                                     |                        v
                                     |                     Diff Engine
                                     |                        |
                                     <-------- changeRecord <--'
                                     |
                                     v
                                 Notifier
                              ----+----
                             通知    角标
```

### 双 Diff 引擎

|          | lib/diff.js                      | options.js                   |
| -------- | -------------------------------- | ---------------------------- |
| **用途** | 后台检测（轻量）                 | 前端展示（精确）             |
| **算法** | 段落级 textDiff、标签级 htmlDiff | Buzhash CDC + LCS token diff |
| **适用** | 快速判断"是否变化"               | 完整展示"哪里变了"           |

#### Buzhash 内容定义分块（CDC）

大文本直接做 LCS 的时间 / 空间复杂度为 O(n²)，不可行。解决方案：

1. **Buzhash 滚动哈希**将文本按内容自动分块（相同文本片段无论出现在哪里，分块边界一致）
2. **分块级 LCS** — 将大量 token 缩减为少量分块，O(n²) 完全可接受
3. **细粒度精化** — 对变化的分块对再做 token 级 LCS，得到精确的词级 diff
4. 65536 项查找表 + `Uint16Array` 滑动窗口，完整支持 CJK 字符

### 检查策略选择

```
Auto 模式流程：
Tab 注入（查找已打开的匹配标签页）
  | 失败或无匹配 Tab
  v
Offscreen fetch（后台 fetch + DOMParser 解析）
  | 返回 SPA 空壳（文本 < 300 字符 + SPA 标记）
  v
Open Tab（打开后台标签页 -> 等待 JS 渲染 -> 提取 -> 关闭）
```

SPA 空壳检测（仅无 selector 时生效）：文本 < 300 字符时，依次检查 HTML 大小（< 2KB 为简短页面）、SPA 框架挂载点（`id="root"` / `id="__next"` 等）、script 标签数量（>3 为 SPA）、HTML 体积（>10KB 大概率为 SPA）；文本 < 800 字符时额外检查 `__NEXT_DATA__` / `window.__INITIAL_STATE__` 等框架水合标记。使用 selector 时信任提取结果，不做 SPA 空壳判断。

### 消息路由

`chrome.runtime.sendMessage` 会广播到所有监听器（包括 Service Worker 和 Offscreen 文档）。为避免响应竞争：

- **FETCH_AND_EXTRACT** — Service Worker 返回 `false`（不响应），由 Offscreen 文档处理
- **其余消息** — Service Worker 返回 `true`（异步响应），统一由 `handleMessage` 处理

### 关键数据结构

**Task（监控任务）**

```javascript
{
  id, name, url, selector,           // 基本信息
  monitorType, keywords[],           // text | structure | keyword
  intervalMinutes, isActive,         // 调度
  lastChecked, lastSnapshot,         // 状态
  errorCount, lastError,             // 错误追踪
  createdAt
}
```

**ChangeRecord（变化记录）**

```javascript
{
  id, taskId, changeType,            // text_change | structure_change | keyword_found
  oldSnapshot, newSnapshot,          // { text, html, hash, timestamp }
  diff, keywordsMatched[],
  detectedAt, isRead
}
```

**ErrorRecord（错误记录）**

```javascript
{
  id,
  taskId,
  errorType,
  errorMessage,
  url,
  timestamp
}
```

### Storage 布局

`chrome.storage.local` 五个 key：

| Key          | 类型                           | 说明         |
| ------------ | ------------------------------ | ------------ |
| `tasks`      | `{ [taskId]: Task }`           | 所有监控任务 |
| `history`    | `{ [taskId]: ChangeRecord[] }` | 变化记录     |
| `errors`     | `{ [taskId]: ErrorRecord[] }`  | 错误日志     |
| `settings`   | 合并 DEFAULT_SETTINGS          | 配置         |
| `badgeCount` | `number`                       | 未读角标数   |

**默认配置（DEFAULT_SETTINGS）**

| 配置项                    | 默认值 | 说明                       |
| ------------------------- | ------ | -------------------------- |
| `defaultIntervalMinutes`  | `5`    | 默认检查间隔（分钟）       |
| `enableNotifications`     | `true` | 启用 Chrome 桌面通知       |
| `enableBadge`             | `true` | 启用扩展图标角标           |
| `maxHistoryPerTask`       | `100`  | 每个任务最多保留的历史记录 |
| `checkMethod`             | `auto` | 默认检查方式               |
| `maxConcurrentChecks`     | `3`    | 最大并发检查数             |
| `autoDisableOnErrorCount` | `5`    | 连续错误达此数自动暂停任务 |
| `maxErrorsPerTask`        | `50`   | 每个任务最多保留的错误记录 |

`saveCheckResult()` 原子写入 tasks + history，避免 Service Worker 中途终止导致数据不一致。`deleteTask()` 同时删除关联的 history 和 errors。历史记录按 `maxHistoryPerTask` 自动裁剪（保留最新记录），错误记录按 `maxErrorsPerTask` 自动裁剪。

## 页面内高亮

点击变化记录的 **"在页面中显示"** 按钮：

1. 打开 / 切换到目标页面（不 reload，保留当前页面状态）
2. 注入自包含高亮脚本，标记变化位置
3. 顶部浮动工具栏提供导航和完整对比面板

| 标记              | 说明                 |
| ----------------- | -------------------- |
| 绿色底色 + 下划线 | 新增文本             |
| 红色删除线区块    | 已删除内容（可折叠） |
| 橙色高亮          | 关键词匹配           |
| 蓝色虚线边框      | 被监控元素范围       |

工具栏功能：上一个 / 下一个导航 → 查看完整对比面板 → 清除标记。

## 数据导出

Options 页面设置标签页提供 **导出历史** 功能，将全部变化记录导出为 JSON 文件（`pagewhat-history-YYYY-MM-DD.json`）。

## 消息协议

所有消息格式：`{ type: string, payload?: object }`

响应：`{ success: boolean, ...data }` 或 `{ success: false, error: string }`

| 消息类型                    | 说明                                     |
| --------------------------- | ---------------------------------------- |
| `ADD_TASK`                  | 添加监控任务                             |
| `UPDATE_TASK`               | 更新任务                                 |
| `DELETE_TASK`               | 删除任务                                 |
| `PAUSE_TASK`                | 暂停任务                                 |
| `RESUME_TASK`               | 恢复任务                                 |
| `CHECK_NOW`                 | 立即检查                                 |
| `GET_TASKS`                 | 获取所有任务                             |
| `GET_TASK`                  | 获取单个任务                             |
| `GET_HISTORY`               | 获取任务变化记录                         |
| `GET_ALL_HISTORY`           | 获取全部变化记录                         |
| `MARK_READ`                 | 标记已读                                 |
| `MARK_ALL_READ`             | 全部标记已读                             |
| `CLEAR_HISTORY`             | 清除任务历史                             |
| `CLEAR_ALL_HISTORY`         | 清除全部历史                             |
| `GET_ERRORS`                | 获取任务错误                             |
| `GET_ALL_ERRORS`            | 获取全部错误                             |
| `GET_ERROR_COUNTS_BY_TASK`  | 按任务统计错误数                         |
| `CLEAR_ERRORS`              | 清除任务错误                             |
| `CLEAR_ALL_ERRORS`          | 清除全部错误                             |
| `GET_SETTINGS`              | 获取设置                                 |
| `UPDATE_SETTINGS`           | 更新设置                                 |
| `GET_UNREAD_COUNT`          | 获取未读数                               |
| `GET_UNREAD_COUNTS_BY_TASK` | 按任务统计未读数                         |
| `RESET_BADGE`               | 重置角标                                 |
| `FETCH_AND_EXTRACT`         | Offscreen fetch（由 Offscreen 文档响应） |

## Manifest V3 开发注意事项

### 禁止动态 import()

Service Worker 中只能用顶部静态 `import`。

```javascript
// 正确
import Storage from './lib/storage.js';

// 会报错
const Storage = await import('./lib/storage.js');
```

### 禁止内联事件处理器

CSP 禁止 `onclick="..."` 等，使用 `addEventListener` 或事件委托（`data-*` + 父元素监听）。

### 禁止内联 style 属性

`style="display:none"` 触发 CSP 违规，用 CSS `.hidden` 类 + `classList` 代替。

### Service Worker 无 DOM

DOM 解析通过 Offscreen 文档完成。

### 自包含注入函数

`chrome.scripting.executeScript` 的 `func` 参数必须是**完全自包含**的，不能引用闭包变量。项目中有两个这样的函数：

- `extractContent(selector)`（checker.js）— 提取目标页面 DOM 内容
- `highlightOnPage(data)`（options.js）— 在页面上高亮显示变化

## 调试

### Service Worker

`chrome://extensions/` -> 找到 PageWhat -> 点击 **"Service Worker"** -> 打开 DevTools Console。

### Popup

点击扩展图标打开 Popup -> 右键 Popup 区域 -> **"检查"**。

> Popup 会在失去焦点时关闭，调试时保持 DevTools 焦点。

### Options 页面

`chrome://extensions/` -> 找到 PageWhat -> 点击 **"详情"** -> 点击 **"扩展程序选项"**。

### 查看存储数据

在 Service Worker DevTools Console 中：

```javascript
// 查看所有任务
chrome.storage.local.get('tasks', (r) => console.log(r.tasks));

// 查看变化历史
chrome.storage.local.get('history', (r) => console.log(r.history));

// 查看错误日志
chrome.storage.local.get('errors', (r) => console.log(r.errors));
```

## 常见问题

### 修改代码后扩展没有更新？

Chrome 扩展不会自动热重载：

- 修改 Service Worker -> `chrome://extensions/` -> 点击"重新加载"
- 修改 Popup / Options 前端 -> 关闭并重新打开即可

### Service Worker 频繁终止？

Manifest V3 的正常行为。确保：

- 用 `chrome.alarms` 做定时任务（而非 `setInterval`）
- 关键数据及时保存到 `chrome.storage.local`

### Tab 注入模式失败？

可能原因：

- 目标网页有 CSP 策略阻止脚本注入
- 解决：切换到 `fetch` 或 `openTab` 模式

## 许可证

Apache License 2.0
