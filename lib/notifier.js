/**
 * notifier.js - 通知调度
 * 支持三种通知方式：Chrome 原生通知、图标角标、声音提醒
 */

import Storage from './storage.js';
import { ensureOffscreenDocument, truncate } from './utils.js';

const Notifier = {
  /**
   * 发送变化通知
   * @param {object} task - 监控任务
   * @param {object} changeRecord - 变化记录
   */
  async notify(task, changeRecord) {
    const settings = await Storage.getSettings();

    // Chrome native notification
    if (settings.enableNotifications) {
      await this.sendNotification(task, changeRecord);
    }

    // Badge update
    if (settings.enableBadge) {
      await this.updateBadge();
    }

    // Sound alert
    if (settings.enableSound) {
      await this.playSound(settings.soundVolume);
    }
  },

  /**
   * 发送 Chrome 原生通知
   */
  async sendNotification(task, changeRecord) {
    const typeLabels = {
      text_change: '文本变化',
      structure_change: '结构变化',
      keyword_found: '关键词出现',
    };

    const title = `PageWhat: ${task.name}`;
    const changeLabel = typeLabels[changeRecord.changeType] || '变化';
    const message = `[${changeLabel}] ${changeRecord.diff || '检测到页面变化'}`;

    try {
      await chrome.notifications.create(`change-${changeRecord.id}`, {
        type: 'basic',
        iconUrl: 'assets/icons/icon128.png',
        title,
        message: truncate(message, 200),
        priority: 2,
      });
    } catch (e) {
      console.error('Failed to send notification:', e);
    }
  },

  /**
   * 更新扩展图标角标
   */
  async updateBadge() {
    try {
      const count = await Storage.incrementBadgeCount();
      const badgeText = count > 99 ? '99+' : String(count);
      await chrome.action.setBadgeText({ text: badgeText });
      await chrome.action.setBadgeBackgroundColor({ color: '#E53935' });
    } catch (e) {
      console.error('Failed to update badge:', e);
    }
  },

  /**
   * 重置角标计数
   */
  async resetBadge() {
    try {
      await Storage.resetBadgeCount();
      await chrome.action.setBadgeText({ text: '' });
    } catch (e) {
      console.error('Failed to reset badge:', e);
    }
  },

  /**
   * 播放提示音（通过 Offscreen 文档）
   */
  async playSound(volume = 0.7) {
    try {
      await ensureOffscreenDocument();

      // Send play sound message to offscreen document
      chrome.runtime.sendMessage(
        {
          type: 'PLAY_SOUND',
          volume,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error('Failed to play sound:', chrome.runtime.lastError.message);
          }
        }
      );
    } catch (e) {
      console.error('Failed to play sound:', e);
    }
  },
};

export default Notifier;
