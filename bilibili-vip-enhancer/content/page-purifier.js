/**
 * B站大会员增强助手 - 页面净化模块
 * 功能：隐藏营销元素、简化布局、直播特效关闭、强制宽屏
 */

const PagePurifier = {
  config: null,
  styleEl: null,
  _events: null,
  _observers: null,

  async init() {
    this._events = BiliEnhancer.createEventManager();
    this._observers = BiliEnhancer.createObserverManager();

    this.config = await BiliEnhancer.storage.get('purifyConfig') || DEFAULT_CONFIG.purifyConfig;

    this.applyPurify();

    this._events.on(window, EVT.CONFIG_UPDATE, (e) => {
      if (e.detail && e.detail.purifyConfig) {
        this.config = e.detail.purifyConfig;
        this.applyPurify();
      }
    });
  },

  applyPurify() {
    if (this.styleEl) this.styleEl.remove();
    this.styleEl = document.createElement('style');
    this.styleEl.id = 'bili-enhancer-purify';

    const rules = [
      [this.config.hideAds,         () => this.getAdsHideCSS()],
      [this.config.hideBanner,      () => this.getBannerHideCSS()],
      [this.config.hideVipPromo,    () => this.getVipPromoHideCSS()],
      [this.config.wideScreen,      () => this.getWideScreenCSS()],
      [this.config.simplifyLayout,  () => this.getSimplifyCSS()],
      [this.config.hideLiveEffects && BiliEnhancer.page.isLivePage(), () => this.getLiveHideCSS()]
    ];

    this.styleEl.textContent = rules
      .filter(([enabled]) => enabled)
      .map(([, fn]) => fn())
      .join('\n');

    document.head.appendChild(this.styleEl);

    // 动态清除
    if (this.config.hideAds || this.config.hideVipPromo) {
      this.setupDynamicClean();
    }
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
      .bili-dialog-mask + div[class*="ad"],
      .desktop-download-tip, .pop-live-small-mode,
      .bili-footer__banner, [class*="footer"] [class*="ad"],
      .activity-m-banner, [class*="m-banner"] {
        display: none !important;
      }
    `;
  },

  getBannerHideCSS() {
    return `
      .bili-banner, [class*="banner-card"], .banner-card,
      .carousel, [class*="carousel"],
      .activity-banner, [class*="activity-banner"],
      .bili-layout__banner, [class*="top-banner"],
      .vip-banner, [class*="vip-banner"],
      .member-banner, [class*="member-banner"] {
        display: none !important;
      }
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
      .charge-promote, [class*="charge-promote"] {
        display: none !important;
      }
    `;
  },

  getWideScreenCSS() {
    return `
      .video-page-container, .bili-layout,
      #app > .bili-layout, .video-container-v1 {
        max-width: 100% !important;
        width: 100% !important;
        padding: 0 10px !important;
      }
      .player-wrap, .bpx-player-container,
      #bilibili-player, .video-player-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .bili-layout__left, .video-page-left {
        width: 100% !important;
        max-width: 100% !important;
      }
      .bpx-player-video-wrap {
        width: 100% !important;
      }
    `;
  },

  getSimplifyCSS() {
    let css = '';
    if (BiliEnhancer.page.isVideoPage()) {
      css += `
        .video-page-right, .bili-layout__right,
        .recommend-container, [class*="video-page-right"] {
          display: none !important;
        }
        .activity-m, [class*="activity-m"],
        .video-page-activity, [class*="page-activity"] {
          display: none !important;
        }
      `;
    }
    if (BiliEnhancer.page.isHomePage()) {
      css += `
        .bili-layout__banner, [class*="home-banner"],
        .channel-fixed, [class*="channel-fixed"],
        .bili-live-card, [class*="live-card"]:not(.video-card) {
          display: none !important;
        }
      `;
    }
    return css;
  },

  getLiveHideCSS() {
    return `
      .gift-item, [class*="gift-panel"], .gift-animation,
      [class*="gift-anim"], .live-gift-box,
      .enter-msg, [class*="enter-msg"], .welcome-msg,
      [class*="welcome"], .entry-effect,
      .interact-msg, [class*="interact-msg"],
      .full-screen-interact, [class*="full-interact"],
      .combo-item, [class*="combo"],
      .lottery-box, [class*="lottery"], .red-packet {
        display: none !important;
      }
      canvas[class*="gift"], canvas[class*="effect"] {
        display: none !important;
      }
    `;
  },

  setupDynamicClean() {
    this._observers.watch(document.body, (mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const cls = (node.className || '').toString();
          if (cls.includes('ad-') || cls.includes('promote') ||
              cls.includes('splash') || cls.includes('open-dialog') ||
              cls.includes('vip-promote') || cls.includes('member-tip') ||
              cls.includes('mini-mask') || cls.includes('pop-live')) {
            node.style.display = 'none';
          }
        }
      }
    });
  },

  destroy() {
    this._events?.destroy();
    this._observers?.destroy();
    if (this.styleEl) { this.styleEl.remove(); this.styleEl = null; }
  }
};
