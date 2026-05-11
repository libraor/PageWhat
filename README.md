# PageWhat - 网页变化监控 Chrome 扩展

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/)
[![纯原生JS](https://img.shields.io/badge/Tech-Vanilla%20JS%2FHTML%2FCSS-orange)](https://developer.mozilla.org/)
[![ES Modules](https://img.shields.io/badge/Module-ES%20Modules-green)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

一个轻量级的 Chrome 扩展程序，用于监控网页内容变化（文本、结构、关键词），无需构建工具，纯原生 JS/HTML/CSS 开发。

## 📋 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速安装](#快速安装)
- [日常开发指南](#日常开发指南)
- [项目结构](#项目结构)
- [核心架构](#核心架构)
- [调试技巧](#调试技巧)
- [Manifest V3 开发注意事项](#manifest-v3-开发注意事项)
- [常见问题](#常见问题)

## ✨ 功能特性

- **三种监控模式**
  - 📝 文本监控：检测网页文本内容变化
  - 🏗️ 结构监控：检测 HTML 结构变化
  - 🔍 关键词监控：监控指定关键词出现

- **智能检查策略**
  - Tab 注入模式（保留登录态）
  - Offscreen fetch 模式（无需打开 Tab）
  - 自动模式（智能选择最优策略）

- **多重通知**
  - Chrome 原生通知
  - 扩展图标角标
  - 声音提醒（WAV 格式）

- **变化对比**
  - SHA-256 哈希快速比对
  - 字符级 diff 高亮显示
  - 支持在原始页面高亮变化位置

## 🛠️ 技术栈

- **Manifest V3** - Chrome 扩展最新标准
- **纯原生 JS/HTML/CSS** - 无框架、无构建工具
- **ES Modules** - 现代化模块化开发
- **chrome.* API** - alarms、storage、scripting、notifications、offscreen

## 🚀 快速安装

### 开发者模式安装

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的**"开发者模式"**
3. 点击**"加载已解压的扩展程序"**
4. 选择 `F:\GitHub\PageWhat` 目录
5. 扩展安装完成，图标将出现在工具栏

### 验证安装

- 访问 `chrome://extensions/` 确认 PageWhat 已启用
- 点击扩展图标，应显示 Popup 界面
- 右键扩展图标 → "选项"，应打开管理页面

## 💻 日常开发指南

### 开发工作流

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 修改代码
# 编辑相应文件（background.js, popup/, options/, lib/ 等）

# 3. 重新加载扩展
# 方法 A：访问 chrome://extensions/ → 点击 PageWhat 的"重新加载"按钮
# 方法 B：使用快捷键 Ctrl+R（在 chrome://extensions/ 页面）

# 4. 测试功能
# - 测试 Popup：点击扩展图标
# - 测试 Options：右键图标 → "选项" 或访问 chrome-extension://[ID]/options/options.html
# - 测试后台逻辑：查看 Service Worker 控制台

# 5. 调试完成后提交
git add .
git commit -m "feat: 描述你的修改"
git push origin main
```

### 热重载技巧

由于 Chrome 扩展不支持真正的热重载，推荐以下高效开发流程：

1. **修改 Popup/Options 前端代码**
   - 保存文件后，关闭并重新打开 Popup/Options 页面即可生效
   - 如果在 DevTools 中，点击 DevTools 的重新加载按钮

2. **修改 Service Worker (background.js)**
   - 必须手动点击"重新加载"按钮
   - 建议在 `chrome.alarms.onAlarm.addListener` 处添加 `console.log` 便于调试

3. **修改 Content Script 或注入函数**
   - 需要重新加载扩展并刷新测试页面

### 添加新功能的标准流程

1. **确定功能范围**
   - 前端界面修改 → `popup/` 或 `options/`
   - 后台逻辑修改 → `background.js` 或 `lib/`
   - 新检查策略 → `lib/checker.js`

2. **遵循消息协议**
   - 所有前后端通信通过 `chrome.runtime.sendMessage` 完成
   - 消息格式：`{ type: string, payload?: object }`
   - 响应格式：`{ success: boolean, ...data }` 或 `{ success: false, error: string }`

3. **更新文档**
   - 修改消息协议 → 更新 `CLAUDE.md` 的"消息协议"章节
   - 修改架构 → 更新 `CLAUDE.md` 的"架构"章节
   - 添加新功能 → 更新本 README

## 📁 项目结构

```
PageWhat/
├── manifest.json          # Manifest V3 配置（权限、入口、资源声明）
├── background.js          # Service Worker 核心调度器
├── lib/                  # 核心库（模块化）
│   ├── storage.js        # chrome.storage.local CRUD 封装
│   ├── alarm-manager.js  # chrome.alarms 生命周期管理
│   ├── checker.js        # 检查引擎（Tab注入/Offscreen fetch 双策略）
│   ├── diff.js           # 变化检测算法（SHA-256哈希 + diff）
│   ├── notifier.js       # 通知调度（Chrome通知 + 角标 + 声音）
│   └── utils.js          # 共享工具函数（ensureOffscreenDocument + truncate）
├── offscreen/            # Offscreen 文档（DOM解析 + 音频播放）
│   ├── offscreen.html
│   └── offscreen.js
├── popup/                # 弹出窗口（快速添加监控）
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/              # 管理面板（任务管理 + 变化记录）
│   ├── options.html
│   ├── options.js
│   └── options.css
├── assets/               # 静态资源
│   ├── icons/            # 扩展图标（16/48/128）
│   └── sounds/           # 提示音（alert.wav）
└── CLAUDE.md             # 项目开发指南（AI 助手用）
```

## 🏗️ 核心架构

### 数据流

```
┌─────────────────────────────────────────────────────────────┐
│  用户界面 (Popup / Options)                                │
│  - 添加/编辑/删除任务                                      │
│  - 查看变化历史                                           │
│  - 手动触发检查                                           │
└───────────────────┬─────────────────────────────────────────┘
                    │ chrome.runtime.sendMessage
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Service Worker (background.js)                            │
│  - 消息路由（根据 type 分发到对应 handler）                 │
│  - 任务 CRUD（通过 storage.js）                            │
│  - Alarm 调度（通过 alarm-manager.js）                     │
└───────────────────┬─────────────────────────────────────────┘
                    │ chrome.alarms.onAlarm
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  检查引擎 (lib/checker.js)                                │
│  - 策略1: Tab 注入（保留登录态）                           │
│  - 策略2: Offscreen fetch（无需 Tab）                      │
│  - 策略3: Open Tab（SPA 渲染等待）                        │
└───────────────────┬─────────────────────────────────────────┘
                    │ 提取内容 → 哈希比对
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  变化检测 (lib/diff.js)                                    │
│  - SHA-256 哈希快速比对                                    │
│  - 文本级 diff（LCS token 算法）                           │
│  - 结构级 diff（归一化 HTML 标签比对）                      │
│  - 关键词搜索                                              │
└───────────────────┬─────────────────────────────────────────┘
                    │ 检测到变化
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  通知调度 (lib/notifier.js)                                │
│  - Chrome 通知（chrome.notifications.create）               │
│  - 图标角标（badge 文字 + 背景色）                         │
│  - 声音提醒（通过 Offscreen 文档播放 WAV）                  │
└─────────────────────────────────────────────────────────────┘
```

### 关键数据结构

**Task（监控任务）**
```javascript
{
  id: string,              // 唯一标识（时间戳）
  name: string,            // 任务名称
  url: string,            // 监控网址
  selector: string | null, // CSS 选择器（可选）
  monitorType: 'text' | 'structure' | 'keyword', // 监控类型
  keywords: string[],      // 关键词列表（keyword 模式）
  intervalMinutes: number, // 检查间隔（分钟）
  isActive: boolean,       // 是否启用
  lastChecked: number,     // 上次检查时间戳
  lastSnapshot: Snapshot,  // 上次快照
  errorCount: number,      // 连续错误次数
  lastError: string | null,// 上次错误信息
  createdAt: number       // 创建时间戳
}
```

**ChangeRecord（变化记录）**
```javascript
{
  id: string,
  taskId: string,
  changeType: 'text' | 'structure' | 'keyword',
  oldSnapshot: Snapshot,
  newSnapshot: Snapshot,
  diff: string,           // diff 结果（HTML 格式）
  keywordsMatched: string[], // 匹配的关键词
  detectedAt: number,     // 检测时间戳
  isRead: boolean         // 是否已读
}
```

**Snapshot（快照）**
```javascript
{
  text: string,           // 提取的文本内容
  html: string,           // 提取的 HTML 内容
  hash: string,           // SHA-256 哈希值
  timestamp: number       // 快照时间戳
}
```

## 🐛 调试技巧

### 调试 Service Worker

1. 访问 `chrome://extensions/`
2. 找到 PageWhat，点击 **"Service Worker"** 链接
3. 打开 DevTools Console，查看 `console.log` 输出

**常用调试断点：**
```javascript
// 在 background.js 中
chrome.alarms.onAlarm.addListener((alarm) => {
  console.log('[DEBUG] Alarm triggered:', alarm); // 添加此行
  // ...
});

// 在 checker.js 中
async performCheck(taskId) {
  console.log('[DEBUG] Checking task:', taskId); // 添加此行
  // ...
}
```

### 调试 Popup

1. 点击扩展图标打开 Popup
2. 右键 Popup 区域 → **"检查"**
3. 打开 DevTools 进行调试

**注意：** Popup 会在失去焦点时关闭，调试时保持 DevTools 焦点。

### 调试 Options 页面

1. 访问 `chrome://extensions/`
2. 找到 PageWhat，点击 **"详情"**
3. 点击 **"扩展程序选项"** 链接
4. 打开 DevTools 进行调试

### 调试 Content Script 注入函数

`chrome.scripting.executeScript` 的 `func` 参数必须是**完全自包含**的，不能引用外部变量。

**正确示例：**
```javascript
// 在 checker.js 中定义自包含函数
function extractContent(selector) {
  // 函数体内部不能引用外部变量或函数
  const text = selector
    ? document.querySelector(selector)?.textContent || ''
    : document.body.textContent;
  return { text, html: document.body.innerHTML };
}

// 注入执行
await chrome.scripting.executeScript({
  target: { tabId },
  func: extractContent,
  args: [selector]
});
```

### 查看存储数据

在 Service Worker DevTools Console 中执行：
```javascript
// 查看所有任务
chrome.storage.local.get('tasks', (result) => console.log(result.tasks));

// 查看变化历史
chrome.storage.local.get('history', (result) => console.log(result.history));

// 清空所有数据（慎用）
chrome.storage.local.clear(() => console.log('Storage cleared'));
```

## ⚠️ Manifest V3 开发注意事项

### 1. 禁止动态 `import()`

**问题：** Service Worker 中不能使用 `import()` 动态导入。

**解决方案：** 所有模块必须在文件顶部静态导入。

```javascript
// ✅ 正确：静态导入
import { storage } from './lib/storage.js';
import { checker } from './lib/checker.js';

// ❌ 错误：动态导入（会报错）
const { storage } = await import('./lib/storage.js');
```

### 2. 禁止内联事件处理器

**问题：** CSP 策略禁止 `onclick="..."` 等内联事件。

**解决方案：** 使用 `addEventListener` 或事件委托。

```html
<!-- ❌ 错误：内联事件 -->
<button onclick="addTask()">添加</button>

<!-- ✅ 正确：addEventListener -->
<button id="addBtn">添加</button>
<script>
  document.getElementById('addBtn').addEventListener('click', addTask);
</script>

<!-- ✅ 更好：事件委托（推荐） -->
<div id="taskList">
  <button data-action="edit" data-id="123">编辑</button>
  <button data-action="delete" data-id="123">删除</button>
</div>
<script>
  document.getElementById('taskList').addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    const id = e.target.dataset.id;
    if (action === 'edit') editTask(id);
    if (action === 'delete') deleteTask(id);
  });
</script>
```

### 3. 禁止内联 style 属性

**问题：** `style="display: none;"` 会触发 CSP 违规。

**解决方案：** 使用 CSS 类 + `classList` 操作。

```html
<!-- ❌ 错误：内联 style -->
<div id="errorMsg" style="display: none;">错误信息</div>

<!-- ✅ 正确：CSS 类 -->
<style>
  .hidden { display: none; }
</style>
<div id="errorMsg" class="hidden">错误信息</div>
<script>
  document.getElementById('errorMsg').classList.remove('hidden');
</script>
```

### 4. Service Worker 无 DOM

**问题：** Service Worker 无法访问 DOM，无法播放音频。

**解决方案：** 使用 Offscreen 文档。

```javascript
// 在 background.js 中
async function playSound() {
  await utils.ensureOffscreenDocument('offscreen/offscreen.html');
  await chrome.runtime.sendMessage({
    type: 'PLAY_SOUND',
    payload: { src: 'assets/sounds/alert.wav' }
  });
}

// 在 offscreen/offscreen.js 中
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PLAY_SOUND') {
    const audio = new Audio(message.payload.src);
    audio.play();
  }
});
```

## ❓ 常见问题

### Q1: 修改代码后扩展没有更新？

**A:** Chrome 扩展不会自动热重载，需要手动重新加载：
1. 访问 `chrome://extensions/`
2. 找到 PageWhat，点击**"重新加载"**按钮
3. 如果是修改 Popup/Options 前端，关闭并重新打开即可

### Q2: Service Worker 频繁终止怎么办？

**A:** 这是 Manifest V3 的正常行为。Service Worker 在不活动时会被终止以节省资源。确保：
- 使用 `chrome.alarms` 进行定时任务（而非 `setInterval`）
- 异步操作使用 `await` 或返回 Promise，避免中途终止
- 关键数据及时保存到 `chrome.storage.local`

### Q3: 为什么 Tab 注入模式失败？

**A:** 可能原因：
- 目标网页的 URL 与 `host_permissions` 不匹配
- 目标网页使用 SPA 框架，需要等待 JS 渲染完成
- 目标网页有 CSP 策略阻止脚本注入

**解决方案：**
- 检查 `manifest.json` 的 `host_permissions` 是否包含目标网址
- 切换到 `offscreen` 模式或 `openTab` 模式
- 查看 Service Worker Console 的错误信息

### Q4: 如何调试 Offscreen 文档？

**A:** Offscreen 文档没有界面，调试方法：
1. 在 `offscreen/offscreen.js` 中添加 `console.log`
2. 在 Service Worker 中调用 `ensureOffscreenDocument`
3. 查看 Chrome 的任务管理器（`Shift+Esc`），找到 Offscreen 进程
4. 右键进程 → **"转到"** → 打开 DevTools

### Q5: 为什么声音无法播放？

**A:** 确保：
- 音频文件格式为 WAV（MP3 可能不支持）
- 音频文件路径正确（`assets/sounds/alert.wav`）
- Offscreen 文档已正确加载
- 没有浏览器静音或系统静音

### Q6: 如何导出/导入任务配置？

**A:** 目前需要手动操作：
1. 在 Service Worker Console 中执行：
   ```javascript
   chrome.storage.local.get('tasks', (result) => {
     console.log(JSON.stringify(result.tasks, null, 2));
   });
   ```
2. 复制输出的 JSON，保存到文件
3. 导入时，在 Console 中执行：
   ```javascript
   const tasks = JSON.parse('你的JSON字符串');
   chrome.storage.local.set({ tasks }, () => {
     console.log('Tasks imported');
   });
   ```

## 📄 许可证

MIT License

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

**提交代码前请确保：**
- [ ] 代码符合 Manifest V3 规范
- [ ] 无内联事件处理器和内联 style
- [ ] 所有 `chrome.*` API 调用有错误处理
- [ ] 新增消息类型已更新 `CLAUDE.md`
- [ ] 测试了 Tab 注入和 Offscreen 两种模式

---

**开发愉快！如有问题，请查看 `CLAUDE.md` 获取更详细的开发指南。**
