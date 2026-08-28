// ==UserScript==
// @name         B站大会员增强助手 Lite
// @namespace    https://github.com/tgfxpfgt/bilibili-vip-enhancer
// @version      1.1.0
// @description  B站大会员增强（油猴轻量版）：自动画质、快捷键、进度记忆、滤镜、弹幕管理、页面净化、推荐流过滤
// @author       tgfxpfgt
// @match        https://*.bilibili.com/*
// @exclude      https://passport.bilibili.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @run-at       document-idle
// @noframes
// @license      MIT
// @homepageURL  https://github.com/tgfxpfgt/bilibili-vip-enhancer
// ==/UserScript==

/**
 * 【同步约定】本脚本为 Chrome 扩展版（同仓库 bilibili-vip-enhancer）的轻量版。
 * 功能子集 = 扩展中不依赖 service worker 的部分。
 * 扩展迭代升级时，需同步更新本脚本对应模块，并保持 @version 与扩展 manifest 一致。
 *
 * 与扩展版的差异：
 * - 无配置云同步（油猴无跨设备 sync storage）
 * - 无浏览器级快捷键（commands API 为扩展专属）
 * - 无工具栏徽标、无后台定时清理
 * - 进度记忆存 localStorage（每域隔离，等价于扩展行为）
 * - 截图直接用 GM_download / <a download>，无下载 API 依赖
 * - 设置通过 GM 菜单命令打开内置面板
 */

(function () {
  'use strict';

  // ==================== 常量（与扩展 constants.js 保持同步） ====================

  const VERSION = '1.1.0';
  const LS_PREFIX = 'bili-enhancer-lite:';

  const VIDEO_SELECTORS = '.bpx-player-video-area video, #bilibili-player video, .player-wrap video';
  const PLAYER_CONTAINER_SELECTORS = '.bpx-player-container, #bilibili-player, .player-wrap';

  const QUALITY_MAP = {
    127: '8K 超高清', 126: '杜比视界', 125: 'HDR 真彩', 120: '4K 超清',
    116: '1080P 60帧', 112: '1080P 高码率', 80: '1080P 高清',
    74: '720P 60帧', 64: '720P 高清', 48: '480P', 32: '360P'
  };

  const TIMING = {
    VIDEO_TIMEOUT: 15000,
    QUALITY_SET_DELAY: 3000,
    QUALITY_PANEL_DELAY: 500,
    PROGRESS_SAVE_INTERVAL: 5000,
    SPA_REINIT_DELAY: 1500,
    TOAST_DURATION: 2000,
    VIP_CACHE: 5 * 60 * 1000,
    BUTTON_INJECT_DELAY: 2000,
    UP_BLOCK_INTERVAL: 4000,
    UP_BLOCK_INITIAL: 2000
  };

  const LIMITS = {
    MAX_VOLUME_BOOST: 5,
    MIN_RATE: 0.25,
    MAX_RATE: 10,
    FRAME_STEP: 1 / 30,
    MAX_PROGRESS_ENTRIES: 500,
    PROGRESS_EXPIRY: 30 * 24 * 60 * 60 * 1000,
    DENOISE_BLUR: '0.4px'
  };

  // ==================== 默认配置（与扩展 DEFAULT_CONFIG 保持同步） ====================

  const DEFAULTS = {
    player: {
      autoQuality: true, shortcuts: true,
      rememberProgress: true, rememberRate: true,
      pauseOnHidden: true, timerStop: 0, volumeBoost: true
    },
    qualityPrefs: { bangumi: '127', normal: '116' },
    filter: { brightness: 100, contrast: 100, saturate: 100, denoise: false },
    danmaku: {
      fontSize: 25, opacity: 100, area: 100,
      mode: 'all', enableFilter: true, blockedKeywords: []
    },
    purify: {
      hideAds: true, hideBanner: true,
      hideVipPromo: true, hideLiveEffects: true
    },
    browse: { upBlock: true, titleFilters: [] },
    blockedUPs: []
  };

  const config = loadConfig();

  function loadConfig() {
    const saved = GM_getValue('config', {});
    const merged = {};
    for (const [section, defaults] of Object.entries(DEFAULTS)) {
      merged[section] = { ...defaults, ...(saved[section] || {}) };
    }
    merged.blockedUPs = Array.isArray(saved.blockedUPs) ? saved.blockedUPs : [];
    return merged;
  }

  function saveConfig() {
    GM_setValue('config', JSON.parse(JSON.stringify(config)));
  }

  // ==================== 基础工具 ====================

  const page = {
    isVideoPage() { return /^\/video\/|^\/bangumi\/play\/|^\/cheese\/play\//.test(location.pathname); },
    isBangumiPage() { return /^\/bangumi\/play\//.test(location.pathname); },
    isCheesePage() { return /^\/cheese\/play\//.test(location.pathname); },
    isLivePage() { return location.hostname === 'live.bilibili.com'; },
    isHomePage() { return location.pathname === '/' || location.pathname === '/index.html'; },
    getVideoCategory() {
      if (this.isBangumiPage()) return 'bangumi';
      if (this.isCheesePage()) return 'cheese';
      return 'normal';
    },
    getVideoId() {
      const bv = location.pathname.match(/\/video\/(BV[\w]+)/);
      if (bv) return bv[1];
      const ep = location.pathname.match(/\/(bangumi|cheese)\/play\/(ep\d+|ss\d+)/);
      return ep ? ep[2] : null;
    },
    getCid() {
      try {
        const state = window.__INITIAL_STATE__;
        if (state && state.videoData && state.videoData.cid) return String(state.videoData.cid);
        if (state && state.cid) return String(state.cid);
      } catch (e) { /* ignore */ }
      return null;
    },
    getPage() { return parseInt(new URLSearchParams(location.search).get('p')) || 1; }
  };

  function queryFirst(selectors) {
    for (const sel of selectors.split(',').map(s => s.trim())) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function waitForElement(selector, timeout = TIMING.VIDEO_TIMEOUT, root = document) {
    return new Promise((resolve, reject) => {
      const el = root.querySelector(selector);
      if (el) { resolve(el); return; }
      const observer = new MutationObserver((_, obs) => {
        const found = root.querySelector(selector);
        if (found) { obs.disconnect(); resolve(found); }
      });
      observer.observe(root.body || root.documentElement, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); reject(new Error('Timeout: ' + selector)); }, timeout);
    });
  }

  function getVideoElement() {
    return queryFirst(VIDEO_SELECTORS) || document.querySelector('video');
  }

  function throttle(fn, delay) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last >= delay) { last = now; fn.apply(this, args); }
    };
  }

  function showToast(msg, duration = TIMING.TOAST_DURATION) {
    document.querySelector('.belite-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'belite-toast';
    toast.textContent = msg;
    Object.assign(toast.style, {
      position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '10px 20px',
      borderRadius: '6px', fontSize: '14px', zIndex: 999999,
      transition: 'opacity 0.3s', pointerEvents: 'none'
    });
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ==================== VIP 检测（年度大会员激活全部功能） ====================

  const vip = {
    _isVip: null,
    _lastCheck: 0,
    async check() {
      if (this._isVip !== null && Date.now() - this._lastCheck < TIMING.VIP_CACHE) {
        return this._isVip;
      }
      try {
        const resp = await fetch('https://api.bilibili.com/x/web-interface/nav', { credentials: 'include' });
        const json = await resp.json();
        if (json.code === 0 && json.data) {
          this._isVip = json.data.vipStatus === 1 && json.data.vipType === 2;
          this._lastCheck = Date.now();
          return this._isVip;
        }
      } catch (e) {
        console.warn('[B站增强Lite] VIP 检测失败:', e.message);
      }
      this._isVip = false;
      return false;
    }
  };

  // ==================== 统一滤镜（与扩展 BiliEnhancer.applyFilter 逻辑同步） ====================

  function applyFilter(video) {
    if (!video) return;
    const { brightness, contrast, saturate, denoise } = config.filter;
    if (brightness === 100 && contrast === 100 && saturate === 100 && !denoise) {
      video.style.filter = '';
      return;
    }
    const parts = [];
    if (brightness !== 100) parts.push(`brightness(${brightness / 100})`);
    if (contrast !== 100) parts.push(`contrast(${contrast / 100})`);
    if (saturate !== 100) parts.push(`saturate(${saturate / 100})`);
    if (denoise) parts.push(`blur(${LIMITS.DENOISE_BLUR})`);
    video.style.filter = parts.join(' ');
  }

  // ==================== 播放器增强 ====================

  const Player = {
    video: null,
    currentVolume: 1,
    rotation: 0,
    mirrored: false,
    timerStopId: null,
    _progressInterval: null,
    _globalBound: false,

    async init() {
      // 全局监听（键盘/可见性）只绑定一次
      if (!this._globalBound) {
        this.setupShortcuts();
        this.setupPauseOnHidden();
        this._globalBound = true;
      }

      // 页面级状态重置（SPA 二次进入视频页）
      this.resetPageState();

      try {
        this.video = await waitForElement(VIDEO_SELECTORS);
      } catch (e) {
        try {
          this.video = await waitForElement('video', 5000);
        } catch (e2) {
          return; // 非视频页或找不到播放器
        }
      }

      this.setupQualityAuto();
      this.setupProgressMemory();
      this.setupTimerStop();
      applyFilter(this.video);
    },

    /** 清理页面级资源（SPA 离开视频页 / 重新进入时调用） */
    resetPageState() {
      if (this._progressInterval) {
        clearInterval(this._progressInterval);
        this._progressInterval = null;
      }
      clearTimeout(this.timerStopId);
      this.timerStopId = null;
      this.video = null;
      this.rotation = 0;
      this.mirrored = false;
      this.currentVolume = 1;
    },

    // ---------- 画质自动（VIP 专属） ----------

    async setupQualityAuto() {
      if (!config.player.autoQuality) return;
      if (!(await vip.check())) return;

      const category = page.getVideoCategory();
      const targetQuality = config.qualityPrefs[category] || '127';
      setTimeout(() => this.trySetQuality(targetQuality), TIMING.QUALITY_SET_DELAY);
    },

    trySetQuality(targetQuality) {
      const qualityBtn = queryFirst('.bpx-player-ctrl-quality, .squirtle-quality-wrap, [class*="quality"]');
      if (!qualityBtn) return;

      qualityBtn.click();
      setTimeout(() => {
        const targetText = QUALITY_MAP[targetQuality] || '1080P';
        const options = document.querySelectorAll(
          '.bpx-player-ctrl-quality-result li, .quality-list li, [class*="quality"] li'
        );
        for (const opt of options) {
          const text = opt.textContent.trim();
          if (text.includes(targetText) || (text.includes('4K') && targetQuality === '127')) {
            opt.click();
            showToast(`已自动切换画质: ${text}`);
            return;
          }
        }
        if (options.length > 0) {
          options[0].click();
          showToast(`已自动切换至最高画质: ${options[0].textContent.trim()}`);
        }
      }, TIMING.QUALITY_PANEL_DELAY);
    },

    // ---------- 页面内快捷键 ----------

    setupShortcuts() {
      if (!config.player.shortcuts) return;

      document.addEventListener('keydown', (e) => {
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
        const video = this.video;
        if (!video) return;

        switch (e.key) {
          case '[': e.preventDefault(); this.adjustRate(-0.25); break;
          case ']': e.preventDefault(); this.adjustRate(0.25); break;
          case ',':
            if (video.paused) { e.preventDefault(); video.currentTime -= LIMITS.FRAME_STEP; }
            break;
          case '.':
            if (video.paused) { e.preventDefault(); video.currentTime += LIMITS.FRAME_STEP; }
            break;
          case 'r': case 'R':
            if (!e.ctrlKey && !e.altKey) { e.preventDefault(); this.rotateVideo(); }
            break;
          case 'm': case 'M':
            if (!e.ctrlKey && !e.altKey) { e.preventDefault(); this.mirrorVideo(); }
            break;
          case 's': case 'S':
            if (!e.ctrlKey && !e.altKey) { e.preventDefault(); this.takeScreenshot(); }
            break;
        }

        if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          if (config.player.volumeBoost) {
            e.preventDefault();
            this.adjustBoostVolume(e.key === 'ArrowUp' ? 0.1 : -0.1);
          }
        }
      });
    },

    adjustRate(delta) {
      const video = this.video;
      if (!video) return;
      let rate = Math.round((video.playbackRate + delta) * 100) / 100;
      rate = Math.max(LIMITS.MIN_RATE, Math.min(LIMITS.MAX_RATE, rate));
      video.playbackRate = rate;
      showToast(`倍速: ${rate}x`);
    },

    rotateVideo() {
      this.rotation = (this.rotation + 90) % 360;
      this.applyTransform();
      showToast(`画面旋转: ${this.rotation}\u00b0`);
    },

    mirrorVideo() {
      this.mirrored = !this.mirrored;
      this.applyTransform();
      showToast(this.mirrored ? '已开启水平镜像' : '已关闭水平镜像');
    },

    applyTransform() {
      const video = this.video;
      if (!video) return;
      const parts = [];
      if (this.rotation !== 0) parts.push(`rotate(${this.rotation}deg)`);
      if (this.mirrored) parts.push('scaleX(-1)');
      video.style.transform = parts.join(' ') || 'none';
    },

    takeScreenshot() {
      const video = this.video;
      if (!video) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        const videoId = page.getVideoId() || 'screenshot';
        const time = formatTime(video.currentTime).replace(/:/g, '-');
        const filename = `bilibili_${videoId}_${time}.png`;

        if (typeof GM_download === 'function') {
          GM_download({ url: dataUrl, name: filename });
        } else {
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = filename;
          a.click();
        }
        showToast('截图已保存');
      } catch (e) {
        showToast('截图失败（可能是跨域限制）: ' + e.message);
      }
    },

    // ---------- 音量增强 ----------

    setupVolumeBoost() {
      this.currentVolume = 1;
    },

    adjustBoostVolume(delta) {
      const video = this.video;
      if (!video) return;
      this.currentVolume = Math.max(0, Math.min(LIMITS.MAX_VOLUME_BOOST, this.currentVolume + delta));
      video.volume = Math.min(1, this.currentVolume);
      // 超过 100% 时提示（油猴版不做 Web Audio 放大，避免劫持音频管道）
      const pct = Math.round(this.currentVolume * 100);
      showToast(pct > 100 ? `音量: ${pct}%（Lite 版上限 100%）` : `音量: ${pct}%`);
      if (pct > 100) this.currentVolume = 1;
    },

    // ---------- 进度记忆（localStorage） ----------

    setupProgressMemory() {
      if (!config.player.rememberProgress) return;

      const videoId = page.getVideoId();
      if (!videoId) return;
      const key = `${videoId}_${page.getCid() || 'default'}_p${page.getPage()}`;

      // 恢复
      const saved = loadProgress(key);
      if (saved) {
        const restore = () => {
          const video = this.video;
          if (!video) return;
          if (saved.time && saved.time > 5 && saved.time < video.duration - 5) {
            video.currentTime = saved.time;
            showToast(`已恢复播放进度: ${formatTime(saved.time)}`);
          }
          if (saved.rate && config.player.rememberRate) video.playbackRate = saved.rate;
          if (saved.volume !== undefined && saved.volume <= 1) {
            video.volume = saved.volume;
            this.currentVolume = saved.volume;
          }
        };
        if (this.video.readyState >= 1) restore();
        else this.video.addEventListener('loadedmetadata', restore, { once: true });
      }

      // 定时保存
      this._progressInterval = setInterval(() => {
        const video = this.video;
        if (!video || video.paused || video.ended) return;
        saveProgress(key, {
          time: video.currentTime,
          rate: video.playbackRate,
          volume: video.volume,
          savedAt: Date.now()
        });
      }, TIMING.PROGRESS_SAVE_INTERVAL);
    },

    // ---------- 切后台暂停 ----------

    setupPauseOnHidden() {
      if (!config.player.pauseOnHidden) return;
      document.addEventListener('visibilitychange', () => {
        const video = this.video;
        if (!video) return;
        if (document.hidden && !video.paused) {
          video.pause();
          video.dataset.autoPaused = 'true';
        } else if (!document.hidden && video.dataset.autoPaused === 'true') {
          video.play().catch(() => {});
          delete video.dataset.autoPaused;
        }
      });
    },

    // ---------- 定时停止 ----------

    setupTimerStop() {
      if (config.player.timerStop > 0) this.setTimerStop(config.player.timerStop);
    },

    setTimerStop(minutes) {
      clearTimeout(this.timerStopId);
      this.timerStopId = null;
      if (minutes <= 0) return;
      this.timerStopId = setTimeout(() => {
        const video = this.video;
        if (video && !video.paused) {
          video.pause();
          showToast('定时停止：已暂停播放');
        }
      }, minutes * 60 * 1000);
    }
  };

  // 进度记忆存储（localStorage + 上限/过期清理）

  function loadProgress(key) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + 'progress');
      const store = raw ? JSON.parse(raw) : {};
      return store[key] || null;
    } catch (e) { return null; }
  }

  function saveProgress(key, progress) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + 'progress');
      const store = raw ? JSON.parse(raw) : {};
      store[key] = progress;

      // 数量上限 + 过期清理
      const entries = Object.entries(store);
      const now = Date.now();
      const valid = entries.filter(([, v]) => now - (v.savedAt || 0) < LIMITS.PROGRESS_EXPIRY);
      valid.sort((a, b) => (a[1].savedAt || 0) - (b[1].savedAt || 0));
      const trimmed = valid.slice(-LIMITS.MAX_PROGRESS_ENTRIES);

      localStorage.setItem(LS_PREFIX + 'progress', JSON.stringify(Object.fromEntries(trimmed)));
    } catch (e) { /* 存储满等异常忽略 */ }
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ==================== 弹幕管理 ====================

  const Danmaku = {
    observer: null,
    styleEl: null,
    modeStyleEl: null,
    _previousMode: null,

    init() {
      this.applyStyles();
      this.setupKeywordFilter();
      this.setupDanmakuMode();
    },

    applyStyles() {
      this.styleEl?.remove();
      const { fontSize, opacity, area } = config.danmaku;
      const opacityVal = (opacity || 100) / 100;
      const areaVal = (area || 100) / 100;

      this.styleEl = document.createElement('style');
      this.styleEl.id = 'belite-danmaku-style';
      this.styleEl.textContent = `
        .bpx-player-dm-wrap .dm-item,
        .bilibili-player-video-danmaku .dm-item,
        .bpx-player-dm-text {
          font-size: ${fontSize}px !important;
          opacity: ${opacityVal} !important;
        }
        .bpx-player-dm-wrap,
        .bilibili-player-video-danmaku {
          height: ${areaVal * 100}% !important;
          top: 0 !important;
        }
        .bpx-player-dm-canvas,
        .bilibili-dm-canvas {
          opacity: ${opacityVal} !important;
        }
      `;
      document.head.appendChild(this.styleEl);
    },

    compilePatterns(keywords) {
      return keywords.map(kw => {
        try {
          if (kw.startsWith('/') && kw.endsWith('/')) {
            return new RegExp(kw.slice(1, -1), 'i');
          }
          return new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        } catch (e) {
          console.warn(`[B站增强Lite] 无效的关键词正则已跳过: "${kw}"`);
          return null;
        }
      }).filter(Boolean);
    },

    setupKeywordFilter() {
      this.disconnectFilterObserver();
      if (!config.danmaku.enableFilter) return;
      const keywords = config.danmaku.blockedKeywords || [];
      if (keywords.length === 0) return;

      const patterns = this.compilePatterns(keywords);
      if (patterns.length === 0) return;

      const callback = (mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            const text = node.textContent || '';
            if (patterns.some(p => p.test(text))) {
              node.style.display = 'none';
              node.classList.add('belite-blocked');
            }
          }
        }
      };

      const startWatch = (el) => {
        this.disconnectFilterObserver();
        this.observer = new MutationObserver(callback);
        this.observer.observe(el, { childList: true, subtree: true });
      };

      const container = queryFirst(
        '.bpx-player-dm-wrap, .bilibili-player-video-danmaku, .bpx-player-video-area'
      );
      if (container) {
        startWatch(container);
      } else {
        waitForElement('.bpx-player-dm-wrap, .bilibili-player-video-danmaku')
          .then(startWatch)
          .catch(() => {});
      }
    },

    disconnectFilterObserver() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    },

    setupDanmakuMode() {
      this.modeStyleEl?.remove();
      this.modeStyleEl = null;
      const mode = config.danmaku.mode || 'all';
      if (mode === 'all') return;

      this.modeStyleEl = document.createElement('style');
      this.modeStyleEl.id = 'belite-danmaku-mode';
      const modeCSS = {
        'top-only': `
          .bpx-player-dm-wrap .dm-item:not(.dm-item-top):not(.dm-item-bottom),
          .bilibili-player-video-danmaku .dm-item:not(.mode-5):not(.mode-4) { display: none !important; }
          .bpx-player-dm-canvas { display: none !important; }
        `,
        'scroll-only': `
          .bpx-player-dm-wrap .dm-item-top,
          .bpx-player-dm-wrap .dm-item-bottom,
          .bilibili-player-video-danmaku .mode-5,
          .bilibili-player-video-danmaku .mode-4 { display: none !important; }
        `,
        'none': `
          .bpx-player-dm-wrap,
          .bilibili-player-video-danmaku,
          .bpx-player-dm-canvas { display: none !important; }
        `
      };
      this.modeStyleEl.textContent = modeCSS[mode] || '';
      document.head.appendChild(this.modeStyleEl);
    },

    /** 菜单命令：运行时开关弹幕（仅切换显示，不写入配置） */
    toggle() {
      const mode = config.danmaku.mode || 'all';
      if (mode !== 'none') {
        this._previousMode = mode;
        config.danmaku.mode = 'none';
        showToast('已关闭弹幕');
      } else {
        config.danmaku.mode = this._previousMode || 'all';
        showToast('已开启弹幕');
      }
      this.setupDanmakuMode();
    },

    destroy() {
      this.disconnectFilterObserver();
      this.styleEl?.remove();
      this.modeStyleEl?.remove();
    }
  };

  // ==================== 页面净化（选择器与扩展 page-purifier.js 保持同步） ====================

  const Purifier = {
    styleEl: null,

    init() {
      this.apply();
    },

    apply() {
      this.styleEl?.remove();
      this.styleEl = document.createElement('style');
      this.styleEl.id = 'belite-purify';

      const rules = [
        [config.purify.hideAds, this.getAdsHideCSS()],
        [config.purify.hideBanner, this.getBannerHideCSS()],
        [config.purify.hideVipPromo, this.getVipPromoHideCSS()],
        [config.purify.hideLiveEffects && page.isLivePage(), this.getLiveHideCSS()]
      ];

      this.styleEl.textContent = rules
        .filter(([enabled]) => enabled)
        .map(([, css]) => css)
        .join('\n');
      document.head.appendChild(this.styleEl);
    },

    getAdsHideCSS() {
      return `
        .bili-mini-mask, .bili-mini-login-right, .adblock-tips,
        [class*="open-dialog"], [class*="splash-ad"],
        .login-panel-popover, .activity-game-list,
        .bili-video-card__info--ad, [class*="ad-card"],
        .video-card-reco[is-ad], .feed-card[data-type="ad"],
        [class*="promote"], .gg-floor-module,
        .ad-report, [class*="ad-report"], .floor-single-card,
        .desktop-download-tip, .pop-live-small-mode { display: none !important; }
      `;
    },

    getBannerHideCSS() {
      return `
        .bili-banner, [class*="banner-card"], .banner-card,
        .carousel, [class*="carousel"],
        .activity-banner, [class*="activity-banner"],
        .bili-layout__banner, [class*="top-banner"],
        .vip-banner, [class*="vip-banner"],
        .member-banner, [class*="member-banner"] { display: none !important; }
      `;
    },

    getVipPromoHideCSS() {
      return `
        .vip-promote, [class*="vip-promote"],
        .open-vip-tip, [class*="open-vip"],
        .vip-privilege-item__btn, [class*="vip-buy"],
        .member-tip, [class*="member-tip"],
        .member-shop-entry, [class*="member-shop"],
        .vip-shop-card, [class*="vip-shop"],
        .pay-promote, [class*="pay-promote"],
        .charge-promote, [class*="charge-promote"] { display: none !important; }
      `;
    },

    getLiveHideCSS() {
      return `
        .gift-item, [class*="gift-panel"], .gift-animation,
        [class*="gift-anim"], .live-gift-box,
        .enter-msg, [class*="enter-msg"], .welcome-msg,
        [class*="welcome"], .entry-effect,
        .interact-msg, [class*="interact-msg"],
        .full-screen-interact, [class*="full-interact"],
        .lottery-box, [class*="lottery"], .red-packet { display: none !important; }
        canvas[class*="gift"], canvas[class*="effect"] { display: none !important; }
      `;
    },

    destroy() {
      this.styleEl?.remove();
    }
  };

  // ==================== 推荐流过滤（UP 主 + 标题关键词） ====================

  const FeedFilter = {
    intervalId: null,

    init() {
      const hasUP = config.blockedUPs.length > 0;
      const hasTitle = (config.browse.titleFilters || []).length > 0;
      if (!config.browse.upBlock || (!hasUP && !hasTitle)) return;

      const isBlockedUP = (card) => {
        if (config.blockedUPs.length === 0) return false;
        const upLink = card.querySelector('a[href*="space.bilibili.com"]');
        if (!upLink) return false;
        const uidMatch = upLink.href.match(/space\.bilibili\.com\/(\d+)/);
        return uidMatch && config.blockedUPs.includes(uidMatch[1]);
      };

      const isBlockedTitle = (card) => {
        const filters = config.browse.titleFilters || [];
        if (filters.length === 0) return false;
        const titleEl = card.querySelector('.bili-video-card__info--tit, [class*="title"], h3');
        if (!titleEl) return false;
        const text = titleEl.textContent.trim();
        return filters.some(kw => text.includes(kw));
      };

      const blockCards = () => {
        document.querySelectorAll('.bili-video-card, .video-card-reco, [class*="video-card"]').forEach(card => {
          if (isBlockedUP(card) || isBlockedTitle(card)) card.style.display = 'none';
        });
        document.querySelectorAll('.bili-dyn-item, [class*="dyn-card"]').forEach(card => {
          if (isBlockedUP(card)) card.style.display = 'none';
        });
      };

      setTimeout(blockCards, TIMING.UP_BLOCK_INITIAL);
      this.intervalId = setInterval(blockCards, TIMING.UP_BLOCK_INTERVAL);
      window.addEventListener('scroll', throttle(blockCards, 2000), { passive: true });
    },

    destroy() {
      clearInterval(this.intervalId);
    }
  };

  // ==================== 设置面板 ====================

  const SettingsPanel = {
    el: null,

    init() {
      GM_registerMenuCommand('\u2699\uFE0F 打开设置', () => this.toggle());
      GM_registerMenuCommand('\u5F39\u5E55\u5F00\u5173 (Alt+D \u4E0D\u53EF\u7528\u65F6)', () => Danmaku.toggle());
    },

    toggle() {
      if (this.el) {
        this.el.remove();
        this.el = null;
        return;
      }
      this.build();
    },

    build() {
      const panel = document.createElement('div');
      panel.id = 'belite-settings';

      // ---- 播放 ----
      const playSec = this.section('播放设置');
      playSec.appendChild(this.toggle('自动最高画质（大会员）', 'player', 'autoQuality'));
      playSec.appendChild(this.toggle('启用页面快捷键', 'player', 'shortcuts'));
      playSec.appendChild(this.toggle('记忆播放进度', 'player', 'rememberProgress'));
      playSec.appendChild(this.toggle('记忆倍速设置', 'player', 'rememberRate'));
      playSec.appendChild(this.toggle('切后台自动暂停', 'player', 'pauseOnHidden'));
      playSec.appendChild(this.toggle('音量快捷键', 'player', 'volumeBoost'));
      playSec.appendChild(this.number('定时停止（分钟，0=关闭）', 'player', 'timerStop', 0, 180));

      // ---- 滤镜 ----
      const filterSec = this.section('画面滤镜');
      filterSec.appendChild(this.range('亮度', 'filter', 'brightness', 50, 150, '%'));
      filterSec.appendChild(this.range('对比度', 'filter', 'contrast', 50, 150, '%'));
      filterSec.appendChild(this.range('饱和度', 'filter', 'saturate', 0, 200, '%'));
      filterSec.appendChild(this.toggle('画面降噪', 'filter', 'denoise'));

      // ---- 弹幕 ----
      const dmSec = this.section('弹幕设置');
      dmSec.appendChild(this.range('字号', 'danmaku', 'fontSize', 12, 50, 'px'));
      dmSec.appendChild(this.range('透明度', 'danmaku', 'opacity', 10, 100, '%'));
      dmSec.appendChild(this.range('显示区域', 'danmaku', 'area', 25, 100, '%'));
      dmSec.appendChild(this.select('显示模式', 'danmaku', 'mode', [
        ['all', '全部弹幕'], ['top-only', '仅顶部/底部'],
        ['scroll-only', '仅滚动弹幕'], ['none', '关闭全部']
      ]));
      dmSec.appendChild(this.toggle('启用关键词过滤', 'danmaku', 'enableFilter'));
      dmSec.appendChild(this.textarea('弹幕关键词屏蔽', 'danmaku', 'blockedKeywords', '每行一个，支持正则（用/包裹）'));

      // ---- 净化 ----
      const purifySec = this.section('页面净化');
      purifySec.appendChild(this.toggle('隐藏广告推广', 'purify', 'hideAds'));
      purifySec.appendChild(this.toggle('隐藏活动横幅', 'purify', 'hideBanner'));
      purifySec.appendChild(this.toggle('隐藏会员推销', 'purify', 'hideVipPromo'));
      purifySec.appendChild(this.toggle('关闭直播礼物特效', 'purify', 'hideLiveEffects'));

      // ---- 推荐流 ----
      const feedSec = this.section('推荐流过滤');
      feedSec.appendChild(this.textarea('屏蔽UP主UID', null, 'blockedUPs', '每行一个UP主UID'));
      feedSec.appendChild(this.textarea('标题关键词过滤', 'browse', 'titleFilters', '包含关键词的推荐视频将被隐藏'));

      // ---- 保存 ----
      const saveBtn = document.createElement('button');
      saveBtn.className = 'belite-save-btn';
      saveBtn.textContent = '保存并应用';
      saveBtn.addEventListener('click', () => {
        this.collect(panel);
        saveConfig();
        panel.remove();
        this.el = null;
        applyAll();
        showToast('设置已保存');
      });

      panel.appendChild(this.header());
      panel.appendChild(playSec);
      panel.appendChild(filterSec);
      panel.appendChild(dmSec);
      panel.appendChild(purifySec);
      panel.appendChild(feedSec);
      panel.appendChild(saveBtn);
      document.body.appendChild(panel);
      this.el = panel;
    },

    header() {
      const h = document.createElement('div');
      h.className = 'belite-panel-header';
      h.innerHTML = `<span>B站大会员增强助手 Lite <small>v${VERSION}</small></span>`;
      const close = document.createElement('button');
      close.textContent = '\u00d7';
      close.addEventListener('click', () => { this.el?.remove(); this.el = null; });
      h.appendChild(close);
      return h;
    },

    section(title) {
      const sec = document.createElement('div');
      sec.className = 'belite-section';
      const h4 = document.createElement('h4');
      h4.textContent = title;
      sec.appendChild(h4);
      return sec;
    },

    // ---- 控件工厂：初始值从 config 读，save 时统一 collect ----

    toggle(label, section, key) {
      const row = document.createElement('div');
      row.className = 'belite-row';
      row.dataset.control = 'toggle';
      row.dataset.section = section || '';
      row.dataset.key = key;
      const value = section ? config[section][key] : config[key];
      row.innerHTML = `<span>${label}</span>
        <input type="checkbox" ${value ? 'checked' : ''}>`;
      return row;
    },

    number(label, section, key, min, max) {
      const row = document.createElement('div');
      row.className = 'belite-row';
      row.dataset.control = 'number';
      row.dataset.section = section || '';
      row.dataset.key = key;
      const value = section ? config[section][key] : config[key];
      row.innerHTML = `<span>${label}</span>
        <input type="number" value="${value}" min="${min}" max="${max}">`;
      return row;
    },

    range(label, section, key, min, max, suffix) {
      const row = document.createElement('div');
      row.className = 'belite-row';
      row.dataset.control = 'range';
      row.dataset.section = section;
      row.dataset.key = key;
      row.dataset.suffix = suffix;
      const value = config[section][key];
      row.innerHTML = `<span>${label}</span>
        <input type="range" min="${min}" max="${max}" value="${value}">
        <b>${value}${suffix}</b>`;
      const input = row.querySelector('input');
      const labelEl = row.querySelector('b');
      input.addEventListener('input', () => { labelEl.textContent = input.value + suffix; });
      return row;
    },

    select(label, section, key, options) {
      const row = document.createElement('div');
      row.className = 'belite-row';
      row.dataset.control = 'select';
      row.dataset.section = section;
      row.dataset.key = key;
      const value = config[section][key];
      const opts = options.map(([v, t]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${t}</option>`).join('');
      row.innerHTML = `<span>${label}</span><select>${opts}</select>`;
      return row;
    },

    textarea(label, section, key, placeholder) {
      const wrap = document.createElement('div');
      wrap.className = 'belite-row belite-textarea-row';
      wrap.dataset.control = 'textarea';
      wrap.dataset.section = section || '';
      wrap.dataset.key = key;
      const value = section ? config[section][key] : config[key];
      wrap.innerHTML = `<label>${label}</label>
        <textarea placeholder="${placeholder}">${(value || []).join('\n')}</textarea>`;
      return wrap;
    },

    /** 从面板收集所有控件值写回 config */
    collect(panel) {
      panel.querySelectorAll('[data-control]').forEach(row => {
        const section = row.dataset.section;
        const key = row.dataset.key;
        const target = section ? config[section] : config;
        switch (row.dataset.control) {
          case 'toggle':
            target[key] = row.querySelector('input').checked;
            break;
          case 'number':
            target[key] = parseInt(row.querySelector('input').value) || 0;
            break;
          case 'range':
            target[key] = parseInt(row.querySelector('input').value);
            break;
          case 'select':
            target[key] = row.querySelector('select').value;
            break;
          case 'textarea':
            target[key] = row.querySelector('textarea').value
              .split('\n').map(s => s.trim()).filter(Boolean);
            break;
        }
      });
    }
  };

  // ==================== 统一应用入口 ====================

  /**
   * full=false（保存设置）: 仅重新应用样式/滤镜
   * full=true（SPA 进入视频页）: 完整重新初始化播放器与弹幕
   */
  function applyAll({ full = false } = {}) {
    Purifier.apply();
    if (page.isVideoPage()) {
      Danmaku.init();
      if (full) {
        Player.init();
      } else {
        applyFilter(Player.video);
      }
    }
  }

  // ==================== SPA 路由监听 ====================

  function setupSPAListener() {
    let lastUrl = location.href;
    const fire = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      setTimeout(() => {
        if (page.isVideoPage()) {
          applyAll({ full: true });
        } else {
          // 离开视频页：清理页面级资源
          Danmaku.destroy();
          Player.resetPageState();
        }
      }, TIMING.SPA_REINIT_DELAY);
    };

    // hook pushState/replaceState
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        window.dispatchEvent(new Event('locationchange'));
        return result;
      };
    }
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
    window.addEventListener('locationchange', throttle(fire, 500));
  }

  // ==================== 面板样式 ====================

  function injectPanelCSS() {
    const style = document.createElement('style');
    style.id = 'belite-panel-css';
    style.textContent = `
      #belite-settings {
        position: fixed; top: 60px; right: 20px; width: 340px; max-height: 80vh;
        overflow-y: auto; background: #fff; border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.2); z-index: 999998;
        padding: 16px; font-family: system-ui, sans-serif; font-size: 13px; color: #333;
      }
      #belite-settings .belite-panel-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 12px; font-weight: 600; font-size: 15px;
      }
      #belite-settings .belite-panel-header small { color: #999; font-weight: normal; }
      #belite-settings .belite-panel-header button {
        border: none; background: #f0f0f0; border-radius: 50%;
        width: 24px; height: 24px; cursor: pointer; font-size: 14px;
      }
      #belite-settings .belite-section { margin-bottom: 12px; border-top: 1px solid #f0f0f0; padding-top: 8px; }
      #belite-settings .belite-section h4 { margin: 4px 0 8px; color: #fb7299; }
      #belite-settings .belite-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 4px 0; flex-wrap: wrap;
      }
      #belite-settings .belite-row input[type="number"] { width: 70px; }
      #belite-settings .belite-row input[type="range"] { flex: 1; }
      #belite-settings .belite-row select { padding: 2px 6px; }
      #belite-settings .belite-textarea-row { flex-direction: column; align-items: stretch; }
      #belite-settings .belite-textarea-row label { font-weight: 500; }
      #belite-settings .belite-textarea-row textarea {
        width: 100%; height: 60px; box-sizing: border-box; resize: vertical;
        border: 1px solid #ddd; border-radius: 4px; padding: 4px 8px; font-size: 12px;
      }
      #belite-settings .belite-save-btn {
        width: 100%; padding: 8px; border: none; border-radius: 6px;
        background: #fb7299; color: #fff; font-size: 14px; cursor: pointer;
      }
      #belite-settings .belite-save-btn:hover { background: #fc8bab; }
      .belite-blocked { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  // ==================== 启动 ====================

  function boot() {
    if (window.__beliteLoaded) return;
    window.__beliteLoaded = true;

    injectPanelCSS();
    SettingsPanel.init();
    Purifier.init();
    FeedFilter.init();
    if (page.isVideoPage()) Player.init();
    setupSPAListener();

    console.log(`[B站大会员增强助手 Lite] v${VERSION} 已加载`);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    boot();
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
