/**
 * options.js - 管理页面入口
 * 负责初始化和模块编排，各功能域由独立模块实现
 */

import { initTheme } from '../themes/theme-system.js';
import { initTaskManager, loadMonitorsTab } from './task-manager.js';
import { initChangesManager, loadChangesTab } from './changes-manager.js';
import { initErrorsManager, loadErrorsTab } from './errors-manager.js';
import { initSettingsManager, loadSettings } from './settings-manager.js';

const $ = (id) => document.getElementById(id);

const dom = {
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content'),

  btnAddTask: $('btn-add-task'),
  btnResumeAll: $('btn-resume-all'),
  btnPauseAll: $('btn-pause-all'),
  modalOverlay: $('modal-overlay'),
  modalTitle: $('modal-title'),
  btnCloseModal: $('btn-close-modal'),
  btnCancel: $('btn-cancel'),
  btnSave: $('btn-save'),
  optName: $('opt-name'),
  optUrl: $('opt-url'),
  optType: $('opt-type'),
  optKeywords: $('opt-keywords'),
  optKeywordsRow: document.querySelector('.opt-keywords-row'),
  optInterval: $('opt-interval'),
  taskTbody: $('task-tbody'),
  tasksEmpty: $('tasks-empty'),

  filterTask: $('filter-task'),
  filterTime: $('filter-time'),
  filterUnread: $('filter-unread'),
  btnMarkAllRead: $('btn-mark-all-read'),
  changesList: $('changes-list'),
  changesEmpty: $('changes-empty'),

  filterErrorTask: $('filter-error-task'),
  errorsList: $('errors-list'),
  errorsEmpty: $('errors-empty'),
  btnClearAllErrors: $('btn-clear-all-errors'),

  setDefaultInterval: $('set-default-interval'),
  setMaxConcurrent: $('set-max-concurrent'),
  setAutoDisable: $('set-auto-disable'),
  setCheckMethod: $('set-check-method'),
  setEnableNotifications: $('set-enable-notifications'),
  setEnableBadge: $('set-enable-badge'),
  setMaxHistory: $('set-max-history'),
  setTheme: $('set-theme'),
  themeDescription: $('theme-description'),
  btnExport: $('btn-export'),
  btnClearAllHistory: $('btn-clear-all-history'),
  btnSaveSettings: $('btn-save-settings'),
};

document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();

  setupTabs();
  setupHelpNav();

  initTaskManager(dom);
  initChangesManager(dom);
  initErrorsManager(dom);
  initSettingsManager(dom);

  await loadMonitorsTab();
  await loadSettings();
});

function setupTabs() {
  dom.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      dom.tabs.forEach((t) => t.classList.remove('active'));
      dom.tabContents.forEach((tc) => tc.classList.remove('active'));

      tab.classList.add('active');
      const tabId = `tab-${tab.dataset.tab}`;
      document.getElementById(tabId).classList.add('active');

      if (tab.dataset.tab === 'monitors') {
        loadMonitorsTab();
      }
      if (tab.dataset.tab === 'changes') {
        loadChangesTab();
      }
      if (tab.dataset.tab === 'errors') {
        loadErrorsTab();
      }
      if (tab.dataset.tab === 'settings') {
        loadSettings();
      }
    });
  });
}

function setupHelpNav() {
  const tocLinks = document.querySelectorAll('.toc-link');
  const helpSections = document.querySelectorAll('.help-section');

  tocLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      const targetSection = document.getElementById(targetId);

      if (targetSection) {
        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        history.pushState(null, null, `#${targetId}`);
      }
    });
  });

  const observerOptions = {
    root: null,
    rootMargin: '-20% 0px -70% 0px',
    threshold: 0,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const sectionId = entry.target.id;

        tocLinks.forEach((link) => {
          link.classList.remove('active');
          if (link.getAttribute('href') === `#${sectionId}`) {
            link.classList.add('active');
          }
        });
      }
    });
  }, observerOptions);

  helpSections.forEach((section) => {
    observer.observe(section);
  });

  const hash = window.location.hash;
  if (hash) {
    const targetSection = document.querySelector(hash);
    if (targetSection) {
      setTimeout(() => {
        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }
}
