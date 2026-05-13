/**
 * settings-manager.js - 设置管理模块
 */
import { THEMES, switchTheme, getCurrentTheme } from '../themes/theme-system.js';
import { sendMessage } from './utils.js';

let dom = null;

export function initSettingsManager(domRefs) {
  dom = domRefs;
  setupSettings();
}

function setupSettings() {
  dom.btnSaveSettings.addEventListener('click', handleSaveSettings);

  dom.btnExport.addEventListener('click', handleExport);

  dom.btnClearAllHistory.addEventListener('click', async () => {
    if (!confirm('确定清除全部历史记录？此操作不可恢复。')) {
      return;
    }
    const response = await sendMessage({ type: 'CLEAR_ALL_HISTORY' });
    if (response.success) {
      alert('历史记录已清除');
    }
  });

  if (dom.setTheme) {
    dom.setTheme.addEventListener('change', handleThemeChange);
  }
}

export async function loadSettings() {
  try {
    const response = await sendMessage({ type: 'GET_SETTINGS' });
    if (!response.success) {
      return;
    }

    const s = response.settings;
    dom.setDefaultInterval.value = s.defaultIntervalMinutes;
    dom.setMaxConcurrent.value = s.maxConcurrentChecks;
    dom.setAutoDisable.value = s.autoDisableOnErrorCount;
    dom.setCheckMethod.value = s.checkMethod;
    dom.setEnableNotifications.checked = s.enableNotifications;
    dom.setEnableBadge.checked = s.enableBadge;
    dom.setMaxHistory.value = s.maxHistoryPerTask;

    const currentTheme = s.theme || getCurrentTheme();
    if (dom.setTheme) {
      dom.setTheme.value = currentTheme;
      updateThemeDescription(currentTheme);
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

function updateThemeDescription(themeId) {
  const theme = THEMES.find((t) => t.id === themeId);
  if (theme && dom.themeDescription) {
    dom.themeDescription.textContent = theme.description;
  }
}

async function handleThemeChange(e) {
  const themeId = e.target.value;
  await switchTheme(themeId);
  updateThemeDescription(themeId);
}

async function handleSaveSettings() {
  try {
    const response = await sendMessage({
      type: 'UPDATE_SETTINGS',
      payload: {
        defaultIntervalMinutes: parseInt(dom.setDefaultInterval.value),
        maxConcurrentChecks: parseInt(dom.setMaxConcurrent.value),
        autoDisableOnErrorCount: parseInt(dom.setAutoDisable.value),
        checkMethod: dom.setCheckMethod.value,
        enableNotifications: dom.setEnableNotifications.checked,
        enableBadge: dom.setEnableBadge.checked,
        maxHistoryPerTask: parseInt(dom.setMaxHistory.value),
        theme: dom.setTheme ? dom.setTheme.value : getCurrentTheme(),
      },
    });

    if (response.success) {
      alert('设置已保存');
    }
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

async function handleExport() {
  try {
    const response = await sendMessage({ type: 'GET_ALL_HISTORY' });
    if (!response.success) {
      return;
    }

    const blob = new Blob([JSON.stringify(response.history, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagewhat-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('导出失败: ' + e.message);
  }
}
