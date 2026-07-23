/**
 * B站大会员增强助手 - 页面净化模块
 * 功能：隐藏营销元素、简化布局、直播特效关闭、强制宽屏
 */

const PagePurifier = {
  config: null,
  observer: null,
  styleEl: null,

  async init() {
    this.config = await BiliEnhancer.storage.get('purifyConfig');
    if (!this.config) {
      this.config = {
        hideAds: true, hideBanner: true, wideScreen: true,
        hideLiveEffects: true, simplifyLayout: true, hideVipPromo: true
      };
    }

    this.applyPurify();

    // 监听配置更新
    window.addEventListener('bili-enhancer-config-update', (e) => {
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
    let css = '';

    if (this.config.hideAds) {
      css += this.getAdsHideCSS();
    }
    if (this.config.hideBanner) {
      css += this.getBannerHideCSS();
    }
    if (this.config.hideVipPromo) {
      css += this.getVipPromoHideCSS();
    }
    if (this.config.wideScreen) {
      css += this.getWideScreenCSS();
    }
    if (this.config.simplifyLayout) {
      css += this.getSimplifyCSS();
    }
    if (this.config.hideLiveEffects && BiliEnhancer.page.isLivePage()) {
      css += this.getLiveHideCSS();
    }

    this.styleEl.textContent = css;
    document.head.appendChild(this.styleEl);

    // 动态清除
    if (this.config.hideAds || this.config.hideVipPromo) {
      this.setupDynamicClean();
    }
  },

  // 广告隐藏CSS
  getAdsHideCSS() {
    return `
      /* 开屏弹窗 */
      .bili-mini-mask, .bili-mini-login-right, .adblock-tips,
      [class*="open-dialog"], [class*="splash-ad"],
      .login-panel-popover, .activity-game-list,
      /* 信息流广告 */
      .bili-video-card__info--ad, [class*="ad-card"],
      .video-card-reco[is-ad], .feed-card[data-type="ad"],
      [class*="promote"], .gg-floor-module,
      /* 侧边广告 */
      .ad-report, [class*="ad-report"], .floor-single-card,
      /* 弹窗广告 */
      .bili-dialog-mask + div[class*="ad"],
      .desktop-download-tip, .pop-live-small-mode,
      /* 底部推广 */
      .bili-footer__banner, [class*="footer"] [class*="ad"],
      .activity-m-banner, [class*="m-banner"] {
        display: none !important;
      }
    `;
  },

  // 横幅隐藏CSS
  getBannerHideCSS() {
    return `
      /* 首页横幅 */
      .bili-banner, [class*="banner-card"], .banner-card,
      .carousel, [class*="carousel"],
      /* 活动横幅 */
      .activity-banner, [class*="activity-banner"],
      .bili-layout__banner, [class*="top-banner"],
      /* 会员横幅 */
      .vip-banner, [class*="vip-banner"],
      .member-banner, [class*="member-banner"] {
        display: none !important;
      }
    `;
  },

  // VIP推销隐藏
  getVipPromoHideCSS() {
    return `
      /* 开通大会员推销 */
      .vip-promote, [class*="vip-promote"],
      .open-vip-tip, [class*="open-vip"],
      .vip-privilege-item__btn, [class*="vip-buy"],
      .member-tip, [class*="member-tip"],
      /* 会员购推送 */
      .member-shop-entry, [class*="member-shop"],
      .vip-shop-card, [class*="vip-shop"],
      /* 付费推广信息流 */
      .pay-promote, [class*="pay-promote"],
      .charge-promote, [class*="charge-promote"] {
        display: none !important;
      }
    `;
  },

  // 强制宽屏CSS
  getWideScreenCSS() {
    return `
      /* 播放页宽屏 */
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
      /* 移除两侧空白 */
      .bili-layout__left, .video-page-left {
        width: 100% !important;
        max-width: 100% !important;
      }
      /* 播放器区域 */
      .bpx-player-video-wrap {
        width: 100% !important;
      }
    `;
  },

  // 布局简化CSS
  getSimplifyCSS() {
    let css = '';
    if (BiliEnhancer.page.isVideoPage()) {
      css += `
        /* 播放页：隐藏右侧推荐（可选保留） */
        .video-page-right, .bili-layout__right,
        .recommend-container, [class*="video-page-right"] {
          display: none !important;
        }
        /* 隐藏活动区域 */
        .activity-m, [class*="activity-m"],
        .video-page-activity, [class*="page-activity"] {
          display: none !important;
        }
      `;
    }
    if (BiliEnhancer.page.isHomePage()) {
      css += `
        /* 首页：隐藏推广卡片区域 */
        .bili-layout__banner, [class*="home-banner"],
        .channel-fixed, [class*="channel-fixed"],
        .bili-live-card, [class*="live-card"]:not(.video-card) {
          display: none !important;
        }
      `;
    }
    return css;
  },

  // 直播页特效隐藏
  getLiveHideCSS() {
    return `
      /* 礼物特效 */
      .gift-item, [class*="gift-panel"], .gift-animation,
      [class*="gift-anim"], .live-gift-box,
      /* 进场提示 */
      .enter-msg, [class*="enter-msg"], .welcome-msg,
      [class*="welcome"], .entry-effect,
      /* 互动弹幕（直播间弹幕保留，隐藏互动消息） */
      .interact-msg, [class*="interact-msg"],
      /* 全屏互动 */
      .full-screen-interact, [class*="full-interact"],
      /* 礼物连击 */
      .combo-item, [class*="combo"],
      /* 抽奖/红包 */
      .lottery-box, [class*="lottery"], .red-packet {
        display: none !important;
      }
      /* 礼物特效canvas */
      canvas[class*="gift"], canvas[class*="effect"] {
        display: none !important;
      }
    `;
  },

  // 动态清除（MutationObserver）
  setupDynamicClean() {
    if (this.observer) this.observer.disconnect();

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const cls = (node.className || '').toString();
          // 检测广告/弹窗类节点
          if (cls.includes('ad-') || cls.includes('promote') ||
            cls.includes('splash') || cls.includes('open-dialog') ||
            cls.includes('vip-promote') || cls.includes('member-tip') ||
            cls.includes('mini-mask') || cls.includes('pop-live')) {
            node.style.display = 'none';
          }
        }
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
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
