/**
 * ============================================================
 * PageWhat Theme System
 * ============================================================
 * 主题系统核心模块，提供主题切换、CSS 加载和主题管理功能。
 */

/**
 * 可用主题列表
 * @type {Array<{id: string, name: string, file: string, className: string}>}
 */
export const THEMES = [
  {
    id: 'modern-minimal',
    name: '现代简约',
    file: 'themes/modern-minimal.css',
    className: 'modern-minimal',
    description: '以留白和清晰层次为核心，去除多余装饰',
  },
  {
    id: 'vintage-classic',
    name: '复古经典',
    file: 'themes/vintage-classic.css',
    className: 'vintage-classic',
    description: '致敬传统印刷美学，温暖纸张色调',
  },
  {
    id: 'future-tech',
    name: '未来科技',
    file: 'themes/future-tech.css',
    className: 'future-tech',
    description: '深色背景配合霓虹色点缀，赛博朋克风格',
  },
  {
    id: 'nature-fresh',
    name: '自然清新',
    file: 'themes/nature-fresh.css',
    className: 'nature-fresh',
    description: '以自然界的绿色和大地色为灵感',
  },
  {
    id: 'business-pro',
    name: '商务专业',
    file: 'themes/business-pro.css',
    className: 'business-pro',
    description: '严谨稳重，经典商务配色',
  },
];

/** 默认主题 ID */
export const DEFAULT_THEME = 'modern-minimal';

/** Storage key for theme preference */
const STORAGE_KEY = 'pagewhat_theme';

/**
 * 获取当前主题设置
 * @returns {string} 主题 ID
 */
export function getCurrentTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) {
      return stored;
    }
  } catch {
    // localStorage may be unavailable
  }
  return DEFAULT_THEME;
}

/**
 * 保存主题设置
 * @param {string} themeId
 */
export function saveTheme(themeId) {
  try {
    localStorage.setItem(STORAGE_KEY, themeId);
  } catch {
    // localStorage may be unavailable
  }
}

/**
 * 获取主题信息
 * @param {string} themeId
 * @returns {Object|undefined}
 */
export function getTheme(themeId) {
  return THEMES.find((t) => t.id === themeId);
}

/**
 * 动态加载主题 CSS 文件
 * @param {string} themeId
 * @returns {Promise<void>}
 */
export async function loadThemeCSS(themeId) {
  const theme = getTheme(themeId);
  if (!theme) {
    throw new Error(`Theme "${themeId}" not found`);
  }

  // 检查是否已加载
  const existing = document.querySelector(`link[data-theme="${themeId}"]`);
  if (existing) {
    return;
  }

  // 移除其他主题样式
  document.querySelectorAll('link[data-theme]').forEach((link) => {
    link.remove();
  });

  // 创建新的 link 元素
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = theme.file;
  link.setAttribute('data-theme', themeId);

  return new Promise((resolve, reject) => {
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load theme CSS: ${theme.file}`));
    document.head.appendChild(link);
  });
}

/**
 * 应用主题到文档
 * @param {string} themeId
 */
export function applyThemeClass(themeId) {
  const theme = getTheme(themeId);
  if (!theme) return;

  // 移除所有主题类名
  THEMES.forEach((t) => {
    document.body.classList.remove(t.className);
  });

  // 添加新主题类名
  document.body.classList.add(theme.className);
}

/**
 * 切换主题
 * @param {string} themeId
 * @returns {Promise<void>}
 */
export async function switchTheme(themeId) {
  const theme = getTheme(themeId);
  if (!theme) {
    console.warn(`Theme "${themeId}" not found, using default`);
    themeId = DEFAULT_THEME;
  }

  await loadThemeCSS(themeId);
  applyThemeClass(themeId);
  saveTheme(themeId);
}

/**
 * 初始化主题系统
 * 应在页面加载时调用
 * @returns {Promise<void>}
 */
export async function initTheme() {
  const themeId = getCurrentTheme();
  await switchTheme(themeId);
}

/**
 * 创建主题选择器 UI
 * @param {HTMLElement} container
 * @param {Function} onChange
 */
export function createThemeSelector(container, onChange) {
  const select = document.createElement('select');
  select.className = 'theme-selector';

  THEMES.forEach((theme) => {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.name;
    if (theme.id === getCurrentTheme()) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.addEventListener('change', (e) => {
    const themeId = e.target.value;
    switchTheme(themeId);
    if (onChange) {
      onChange(themeId);
    }
  });

  container.appendChild(select);
  return select;
}
