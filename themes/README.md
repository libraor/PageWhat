# PageWhat 主题系统

## 概述

PageWhat 主题系统提供 5 种精心设计的视觉风格，每种风格都有完整的设计规范，包括色彩系统、排版规范、组件样式、空间布局和交互状态。所有主题均支持响应式设计，适配不同屏幕尺寸。

## 主题列表

| 主题 | ID | 风格特点 | 适用场景 |
|------|-----|---------|---------|
| 现代简约 | `modern-minimal` | 留白清晰、扁平设计 | SaaS 产品、效率工具 |
| 复古经典 | `vintage-classic` | 衬线字体、纸张色调 | 内容出版、文化应用 |
| 未来科技 | `future-tech` | 深色背景、霓虹发光 | 开发者工具、数据监控 |
| 自然清新 | `nature-fresh` | 森林绿色、圆润有机 | 健康生活、教育平台 |
| 商务专业 | `business-pro` | 深海蓝色、严谨高效 | 企业后台、金融应用 |

## 快速开始

### 1. 引入主题系统

```javascript
import { initTheme, switchTheme, createThemeSelector } from '../themes/theme-system.js';

// 初始化主题（加载用户保存的主题偏好）
await initTheme();
```

### 2. 创建主题选择器

```javascript
const selectorContainer = document.getElementById('theme-selector');
createThemeSelector(selectorContainer, (themeId) => {
  console.log('主题已切换至:', themeId);
});
```

### 3. 手动切换主题

```javascript
import { switchTheme } from '../themes/theme-system.js';

// 切换到未来科技主题
await switchTheme('future-tech');
```

## 主题设计规范

### 色彩系统

每个主题包含完整的色彩体系：

- **主色 (Primary)**：品牌主色调，用于主要操作按钮、链接、激活状态
- **辅助色 (Secondary)**：用于次要信息、辅助操作
- **语义色 (Semantic)**：成功、警告、错误、信息四种状态色
- **中性色 (Neutral)**：灰阶系统，用于文字、背景、边框

### 排版规范

| 属性 | 说明 |
|------|------|
| 字体栈 | 每个主题有特定的字体偏好 |
| 字号层级 | xs/sm/base/md/lg/xl/2xl/3xl 八级 |
| 字重 | normal(400)/medium(500)/semibold(600)/bold(700) |
| 行高 | tight(1.25)/normal(1.5)/relaxed(1.625+) |

### 组件样式

所有主题提供一致的组件类名前缀：

| 组件 | 现代简约 | 复古经典 | 未来科技 | 自然清新 | 商务专业 |
|------|---------|---------|---------|---------|---------|
| 按钮 | `.mm-btn` | `.vc-btn` | `.ft-btn` | `.nf-btn` | `.bp-btn` |
| 卡片 | `.mm-card` | `.vc-card` | `.ft-card` | `.nf-card` | `.bp-card` |
| 输入框 | `.mm-input` | `.vc-input` | `.ft-input` | `.nf-input` | `.bp-input` |
| 表格 | `.mm-table` | `.vc-table` | `.ft-table` | `.nf-table` | `.bp-table` |
| 标签页 | `.mm-tabs` | `.vc-tabs` | `.ft-tabs` | `.nf-tabs` | `.bp-tabs` |
| 模态框 | `.mm-modal` | `.vc-modal` | `.ft-modal` | `.nf-modal` | `.bp-modal` |
| 徽章 | `.mm-badge` | `.vc-badge` | `.ft-badge` | `.nf-badge` | `.bp-badge` |

### 交互状态

每个组件都定义了完整的交互状态：

- **正常 (Normal)**：默认状态
- **悬停 (Hover)**：鼠标悬停时的反馈
- **点击 (Active)**：按下时的状态
- **禁用 (Disabled)**：不可操作状态
- **聚焦 (Focus)**：键盘导航时的焦点状态

### 响应式断点

| 断点 | 宽度 | 说明 |
|------|------|------|
| 手机 | < 480px | 单列布局、全宽弹窗 |
| 平板 | < 768px | 调整间距、底部弹窗 |
| 桌面 | ≥ 768px | 完整布局 |

## 主题对比

### 现代简约 vs 商务专业

- **现代简约**：圆角更大(8-16px)、阴影更轻、色彩更明亮
- **商务专业**：圆角更小(2-6px)、布局更紧凑、色彩更沉稳

### 复古经典 vs 自然清新

- **复古经典**：衬线字体、暖色调、边框略粗(1.5px)
- **自然清新**：无衬线字体、绿色主调、圆角更圆润(8-20px)

### 未来科技

- 唯一深色主题
- 霓虹发光效果（box-shadow）
- 等宽字体用于代码展示
- 青色/紫色霓虹配色

## 扩展主题

要创建新主题，请遵循以下步骤：

1. 复制 `themes/modern-minimal.css` 作为模板
2. 修改变量前缀（如 `--mm-` → `--custom-`）
3. 调整色彩、字体、圆角等设计 token
4. 在 `theme-system.js` 的 `THEMES` 数组中注册
5. 创建对应的类名（如 `.custom-theme`）

## 文件结构

```
themes/
├── README.md              # 本文件
├── theme-system.js        # 主题系统核心
├── modern-minimal.css     # 现代简约主题
├── vintage-classic.css    # 复古经典主题
├── future-tech.css        # 未来科技主题
├── nature-fresh.css       # 自然清新主题
└── business-pro.css       # 商务专业主题
```

## 浏览器兼容性

- Chrome 88+
- Firefox 78+
- Safari 14+
- Edge 88+

所有主题使用 CSS 自定义属性（变量），不支持 IE11。
