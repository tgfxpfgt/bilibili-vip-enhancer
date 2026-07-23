/**
 * B站大会员增强助手 - 弹幕管理模块
 * 功能：自定义弹幕样式、关键词过滤、弹幕模式控制、防遮挡
 */

const DanmakuManager = {
  config: null,
  observer: null,
  styleEl: null,

  async init() {
    this.config = await BiliEnhancer.storage.get('danmakuConfig');
    if (!this.config) {
      this.config = {
        fontSize: 25, opacity: 100, area: 100,
        blockedKeywords: [], mode: 'all', enableFilter: true
      };
    }

    if (!BiliEnhancer.page.isVideoPage()) return;

    this.applyStyles();
    this.setupKeywordFilter();
    this.setupDanmakuMode();

    // 监听配置更新
    window.addEventListener('bili-enhancer-config-update', (e) => {
      if (e.detail && e.detail.danmakuConfig) {
        this.config = e.detail.danmakuConfig;
        this.applyStyles();
        this.setupDanmakuMode();
      }
    });
  },

  // 应用弹幕样式
  applyStyles() {
    if (this.styleEl) this.styleEl.remove();

    const { fontSize, opacity, area } = this.config;
    const opacityVal = (opacity || 100) / 100;
    const areaVal = (area || 100) / 100;

    this.styleEl = document.createElement('style');
    this.styleEl.id = 'bili-enhancer-danmaku-style';
    this.styleEl.textContent = `
      /* 弹幕字号 */
      .bpx-player-dm-wrap .dm-item,
      .bilibili-player-video-danmaku .dm-item,
      .bpx-player-dm-text {
        font-size: ${fontSize}px !important;
        opacity: ${opacityVal} !important;
      }
      /* 弹幕显示区域限制（防遮挡） */
      .bpx-player-dm-wrap,
      .bilibili-player-video-danmaku {
        height: ${areaVal * 100}% !important;
        top: 0 !important;
      }
      /* 弹幕容器 */
      .bpx-player-dm-canvas,
      .bilibili-dm-canvas {
        opacity: ${opacityVal} !important;
      }
    `;
    document.head.appendChild(this.styleEl);
  },

  // 关键词过滤
  setupKeywordFilter() {
    if (!this.config.enableFilter) return;
    const keywords = this.config.blockedKeywords || [];
    if (keywords.length === 0) return;

    // 编译正则
    const patterns = keywords.map(kw => {
      try {
        if (kw.startsWith('/') && kw.endsWith('/')) {
          return new RegExp(kw.slice(1, -1), 'i');
        }
        return new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    if (patterns.length === 0) return;

    // 监听弹幕DOM节点
    const danmakuContainer = document.querySelector('.bpx-player-dm-wrap') ||
      document.querySelector('.bilibili-player-video-danmaku') ||
      document.querySelector('.bpx-player-video-area');

    if (danmakuContainer) {
      this.observer = new MutationObserver((mutations) => {
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
      });
      this.observer.observe(danmakuContainer, { childList: true, subtree: true });
    } else {
      // 等待弹幕容器出现
      BiliEnhancer.dom.waitForElement('.bpx-player-dm-wrap, .bilibili-player-video-danmaku, .bpx-player-video-area', 15000)
        .then((container) => {
          this.observer = new MutationObserver((mutations) => {
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
          });
          this.observer.observe(container, { childList: true, subtree: true });
        }).catch(() => {});
    }
  },

  // 弹幕模式控制
  setupDanmakuMode() {
    const mode = this.config.mode || 'all';
    let modeStyle = document.getElementById('bili-enhancer-danmaku-mode');
    if (modeStyle) modeStyle.remove();

    if (mode === 'all') return;

    modeStyle = document.createElement('style');
    modeStyle.id = 'bili-enhancer-danmaku-mode';

    switch (mode) {
      case 'top-only':
        // 仅保留顶部/底部固定弹幕，关闭滚动弹幕
        modeStyle.textContent = `
          .bpx-player-dm-wrap .dm-item:not(.dm-item-top):not(.dm-item-bottom),
          .bilibili-player-video-danmaku .dm-item:not(.mode-5):not(.mode-4) {
            display: none !important;
          }
          .bpx-player-dm-canvas { display: none !important; }
        `;
        break;
      case 'scroll-only':
        // 仅保留滚动弹幕
        modeStyle.textContent = `
          .bpx-player-dm-wrap .dm-item-top,
          .bpx-player-dm-wrap .dm-item-bottom,
          .bilibili-player-video-danmaku .mode-5,
          .bilibili-player-video-danmaku .mode-4 {
            display: none !important;
          }
        `;
        break;
      case 'none':
        // 关闭所有弹幕
        modeStyle.textContent = `
          .bpx-player-dm-wrap,
          .bilibili-player-video-danmaku,
          .bpx-player-dm-canvas {
            display: none !important;
          }
        `;
        break;
    }
    document.head.appendChild(modeStyle);
  },

  // 更新关键词列表
  updateKeywords(keywords) {
    this.config.blockedKeywords = keywords;
    BiliEnhancer.storage.set({ danmakuConfig: this.config });
    // 重新设置过滤
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.setupKeywordFilter();
  },

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
  }
};
