/**
 * B站大会员增强助手 - 大会员专属模块
 * 功能：会员浮层过滤、引导页跳过、会员标记、高级弹幕
 */

const VipPanel = {
  config: null,
  isVip: false,
  _events: null,
  _observers: null,
  _timers: null,

  async init() {
    this._events = BiliEnhancer.createEventManager();
    this._observers = BiliEnhancer.createObserverManager();
    this._timers = BiliEnhancer.createTimerManager();

    this.config = await BiliEnhancer.storage.get('vipConfig') || DEFAULT_CONFIG.vipConfig;

    // 仅年度大会员激活
    this.isVip = await BiliEnhancer.vip.check();
    if (!this.isVip) return;

    this.hideVipDialogs();
    this.skipVipGuide();
    this.setupVipBadge();
    this.setupAdvancedDanmaku();
    this.hidePaidOverlay();
  },

  // ==================== 隐藏会员相关弹窗 ====================

  hideVipDialogs() {
    if (!this.config.hideVipDialogs) return;

    const vipDialogSelectors = [
      '.vip-dialog', '.pay-dialog', '.vip-pay-dialog',
      '[class*="vip-dialog"]', '[class*="pay-tip"]',
      '.bpx-player-toast-item-vip', '.membership-dialog',
      '.vip-limit-box', '.vip-pay-wrap',
      '[class*="open-vip"]', '[class*="buy-vip"]',
      '.dialog-open-vip', '.vip-promote-dialog'
    ];

    vipDialogSelectors.forEach(sel => BiliEnhancer.dom.hideElements(sel));

    // 动态监听
    this._observers.watch(document.body, (mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const cls = (node.className || '').toString();
          if (cls.includes('vip-dialog') || cls.includes('pay-dialog') ||
              cls.includes('vip-pay') || cls.includes('open-vip') ||
              cls.includes('buy-vip') || cls.includes('vip-promote') ||
              cls.includes('membership-dialog')) {
            node.style.display = 'none';
            const mask = BiliEnhancer.dom.queryFirst('.v-popover-mask, .bili-dialog-mask, [class*="dialog-mask"]');
            if (mask) mask.style.display = 'none';
          }
        }
      }
    });
  },

  // ==================== 跳过会员引导页 ====================

  skipVipGuide() {
    if (!this.config.autoSkipGuide) return;

    const isGuidePage = BiliEnhancer.dom.queryFirst('.vip-guide-page, .open-vip-page, [class*="vip-guide"]');
    if (isGuidePage) {
      const playBtn = BiliEnhancer.dom.queryFirst('.play-btn, [class*="play"], a[href*="/bangumi/play/"]');
      if (playBtn) {
        playBtn.click();
        return;
      }
    }

    // 番剧页面：检测会员验证遮挡
    if (BiliEnhancer.page.isBangumiPage()) {
      this._timers.timeout(() => {
        const limitBox = BiliEnhancer.dom.queryFirst('.vip-limit-box, .limit-box, [class*="vip-limit"]');
        if (limitBox) {
          limitBox.style.display = 'none';
          const video = BiliEnhancer.getVideoElement();
          if (video && video.paused) {
            video.play().catch(() => {});
          }
        }
      }, TIMING.PAID_OVERLAY_DELAY);
    }
  },

  // ==================== 隐藏付费选集遮挡 ====================

  hidePaidOverlay() {
    const paidSelectors = [
      '.ep-item .lock-icon', '.ep-item .pay-mark',
      '[class*="ep-lock"]', '[class*="ep-pay"]',
      '.season-item .lock', '.cursor-item .lock-icon'
    ];

    const hidePaid = () => {
      paidSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
      });
      document.querySelectorAll('.ep-item.locked, [class*="ep-item"][class*="lock"]').forEach(el => {
        el.classList.remove('locked');
        el.style.pointerEvents = 'auto';
        el.style.opacity = '1';
      });
    };

    this._timers.timeout(hidePaid, TIMING.PAID_OVERLAY_DELAY);

    // 监听选集列表变化
    const epList = BiliEnhancer.dom.queryFirst('.ep-list, .season-list, [class*="ep-list"], [class*="cursor-list"]');
    if (epList) {
      this._observers.watch(epList, hidePaid);
    }
  },

  // ==================== 会员专属内容标记 ====================

  setupVipBadge() {
    if (!this.config.vipBadge) return;
    if (!BiliEnhancer.page.isVideoPage()) return;

    this._timers.timeout(() => {
      const vipMark = BiliEnhancer.dom.queryFirst('.vip-tag, [class*="vip-tag"], .badge-vip, [class*="vip-badge"]');
      const isVipContent = !!vipMark ||
        document.title.includes('大会员') ||
        document.querySelector('[class*="vip-free"]');

      if (isVipContent) {
        this.injectVipBadge();
      }
    }, TIMING.VIP_BADGE_DELAY);
  },

  injectVipBadge() {
    const player = BiliEnhancer.dom.queryFirst(PLAYER_CONTAINER_SELECTORS);
    if (!player) return;
    if (player.querySelector('.bili-enhancer-vip-badge')) return;

    const badge = BiliEnhancer.dom.createElement('div', {
      class: 'bili-enhancer-vip-badge'
    }, {
      position: 'absolute',
      top: '10px',
      right: '10px',
      background: 'linear-gradient(135deg, #fb7299, #ff9a9e)',
      color: '#fff',
      padding: '3px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 'bold',
      zIndex: '100',
      pointerEvents: 'none',
      opacity: '0.9'
    }, '会员专属');
    player.style.position = 'relative';
    player.appendChild(badge);
  },

  // ==================== 高级弹幕快捷功能 ====================

  setupAdvancedDanmaku() {
    if (!this.config.autoDanmaku) return;
    if (!BiliEnhancer.page.isVideoPage()) return;

    this._timers.timeout(() => {
      const danmakuInput = BiliEnhancer.dom.queryFirst(
        '.bpx-player-dm-input, .bilibili-player-video-danmaku-input, input[class*="danmaku"]'
      );
      if (!danmakuInput) return;

      const container = danmakuInput.closest('.bpx-player-dm-wrap') || danmakuInput.parentElement;
      if (!container || container.querySelector('.bili-enhancer-dm-advanced')) return;

      const btnWrap = BiliEnhancer.dom.createElement('div', {
        class: 'bili-enhancer-dm-advanced'
      }, {
        display: 'inline-flex', gap: '4px', marginLeft: '6px', alignItems: 'center'
      });

      // 彩色弹幕按钮
      const colorBtn = BiliEnhancer.dom.createElement('button', {
        title: '彩色弹幕（大会员）'
      }, {
        background: 'linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00ff00, #0088ff, #8800ff)',
        color: '#fff', border: 'none', borderRadius: '3px',
        padding: '2px 6px', fontSize: '11px', cursor: 'pointer',
        textShadow: '0 0 2px rgba(0,0,0,0.8)'
      }, '彩');
      this._events.on(colorBtn, 'click', () => {
        const colorPicker = BiliEnhancer.dom.queryFirst('.bpx-player-dm-color, [class*="dm-color"]');
        if (colorPicker) colorPicker.click();
        BiliEnhancer.showToast('已开启彩色弹幕模式');
      });

      // 顶部弹幕按钮
      const topBtn = BiliEnhancer.dom.createElement('button', {
        title: '顶部固定弹幕（大会员）'
      }, {
        background: '#fb7299', color: '#fff', border: 'none',
        borderRadius: '3px', padding: '2px 6px', fontSize: '11px', cursor: 'pointer'
      }, '顶');
      this._events.on(topBtn, 'click', () => {
        const modeSelect = BiliEnhancer.dom.queryFirst('.bpx-player-dm-mode, [class*="dm-mode"]');
        if (modeSelect) modeSelect.click();
        BiliEnhancer.showToast('请选择顶部弹幕模式');
      });

      btnWrap.appendChild(colorBtn);
      btnWrap.appendChild(topBtn);
      container.appendChild(btnWrap);
    }, TIMING.ADVANCED_DM_DELAY);
  },

  // ==================== 清理 ====================

  destroy() {
    this._events?.destroy();
    this._observers?.destroy();
    this._timers?.destroy();
  }
};
