/**
 * B站大会员增强助手 - 弹幕管理模块
 * 功能：自定义弹幕样式、关键词过滤、弹幕模式控制、防遮挡
 */

const DanmakuManager = {
  config: null,
  observer: null,
  styleEl: null,
  modeStyleEl: null,
  _events: null,

  async init() {
    this._events = BiliEnhancer.createEventManager();

    this.config = await BiliEnhancer.storage.get('danmakuConfig') || DEFAULT_CONFIG.danmakuConfig;

    if (!BiliEnhancer.page.isVideoPage()) return;

    this.applyStyles();
    this.setupKeywordFilter();
    this.setupDanmakuMode();

    // 监听配置更新
    this._events.on(window, EVT.CONFIG_UPDATE, (e) => {
      if (e.detail && e.detail.danmakuConfig) {
        this.config = e.detail.danmakuConfig;
        this.applyStyles();
        this.setupDanmakuMode();
        // 关键词变化时重新设置过滤
        if (this.observer) {
          this.observer.disconnect();
          this.observer = null;
        }
        this.setupKeywordFilter();
      }
    });
  },

  // ==================== 弹幕样式 ====================

  applyStyles() {
    if (this.styleEl) this.styleEl.remove();

    const { fontSize, opacity, area } = this.config;
    const opacityVal = (opacity || 100) / 100;
    const areaVal = (area || 100) / 100;

    this.styleEl = document.createElement('style');
    this.styleEl.id = 'bili-enhancer-danmaku-style';
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

  // ==================== 关键词过滤 ====================

  /** 编译关键词为正则表达式列表，无效关键词会被跳过 */
  compilePatterns(keywords) {
    return keywords.map(kw => {
      try {
        if (kw.startsWith('/') && kw.endsWith('/')) {
          return new RegExp(kw.slice(1, -1), 'i');
        }
        return new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      } catch (e) {
        console.warn(`[B站增强] 无效的关键词正则已跳过: "${kw}"`);
        return null;
      }
    }).filter(Boolean);
  },

  /** 创建弹幕过滤 Observer 回调（提取公共逻辑，消除重复代码） */
  createFilterCallback(patterns) {
    return (mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const text = node.textContent || '';
          if (patterns.some(p => p.test(text))) {
            node.style.display = 'none';
            node.classList.add('bili-enhancer-blocked');
          }
        }
      }
    };
  },

  setupKeywordFilter() {
    if (!this.config.enableFilter) return;
    const keywords = this.config.blockedKeywords || [];
    if (keywords.length === 0) return;

    const patterns = this.compilePatterns(keywords);
    if (patterns.length === 0) return;

    const callback = this.createFilterCallback(patterns);

    const container = BiliEnhancer.dom.queryFirst(DANMAKU_CONTAINER_SELECTORS);
    if (container) {
      this.observer = new MutationObserver(callback);
      this.observer.observe(container, { childList: true, subtree: true });
    } else {
      // 等待弹幕容器出现
      BiliEnhancer.dom.waitForElement(DANMAKU_CONTAINER_SELECTORS, TIMING.VIDEO_ELEMENT_TIMEOUT)
        .then((el) => {
          this.observer = new MutationObserver(callback);
          this.observer.observe(el, { childList: true, subtree: true });
        })
        .catch(() => {});
    }
  },

  // ==================== 弹幕模式控制 ====================

  setupDanmakuMode() {
    const mode = this.config.mode || 'all';
    if (this.modeStyleEl) {
      this.modeStyleEl.remove();
      this.modeStyleEl = null;
    }
    if (mode === 'all') return;

    this.modeStyleEl = document.createElement('style');
    this.modeStyleEl.id = 'bili-enhancer-danmaku-mode';

    const modeCSS = {
      'top-only': `
        .bpx-player-dm-wrap .dm-item:not(.dm-item-top):not(.dm-item-bottom),
        .bilibili-player-video-danmaku .dm-item:not(.mode-5):not(.mode-4) {
          display: none !important;
        }
        .bpx-player-dm-canvas { display: none !important; }
      `,
      'scroll-only': `
        .bpx-player-dm-wrap .dm-item-top,
        .bpx-player-dm-wrap .dm-item-bottom,
        .bilibili-player-video-danmaku .mode-5,
        .bilibili-player-video-danmaku .mode-4 {
          display: none !important;
        }
      `,
      'none': `
        .bpx-player-dm-wrap,
        .bilibili-player-video-danmaku,
        .bpx-player-dm-canvas {
          display: none !important;
        }
      `
    };

    this.modeStyleEl.textContent = modeCSS[mode] || '';
    document.head.appendChild(this.modeStyleEl);
  },

  // ==================== 更新关键词 ====================

  updateKeywords(keywords) {
    this.config.blockedKeywords = keywords;
    BiliEnhancer.storage.set({ danmakuConfig: this.config });
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.setupKeywordFilter();
  },

  // ==================== 清理 ====================

  destroy() {
    this._events?.destroy();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.styleEl) { this.styleEl.remove(); this.styleEl = null; }
    if (this.modeStyleEl) { this.modeStyleEl.remove(); this.modeStyleEl = null; }
  }
};
