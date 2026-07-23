/**
 * B站大会员增强助手 - 大会员专属模块
 * 功能：会员浮层过滤、引导页跳过、会员标记、高级弹幕、福利入口
 */

const VipPanel = {
  config: null,
  isVip: false,
  observer: null,

  async init() {
    this.config = await BiliEnhancer.storage.get('vipConfig');
    if (!this.config) {
      this.config = {
        autoSkipGuide: true, hideVipDialogs: true,
        vipBadge: true, autoDanmaku: true
      };
    }

    // 检测VIP状态
    this.isVip = await BiliEnhancer.vip.check();
    if (!this.isVip) return; // 非大会员不激活任何会员功能

    this.hideVipDialogs();
    this.skipVipGuide();
    this.setupVipBadge();
    this.setupAdvancedDanmaku();
    this.hidePaidOverlay();
  },

  // 隐藏VIP相关弹窗/浮层（用户已是会员，这些是多余的前端渲染）
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

    // 立即隐藏
    vipDialogSelectors.forEach(sel => {
      BiliEnhancer.dom.hideElements(sel);
    });

    // 动态监听
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const cls = node.className || '';
          if (typeof cls === 'string' &&
            (cls.includes('vip-dialog') || cls.includes('pay-dialog') ||
              cls.includes('vip-pay') || cls.includes('open-vip') ||
              cls.includes('buy-vip') || cls.includes('vip-promote') ||
              cls.includes('membership-dialog'))) {
            node.style.display = 'none';
            // 同时移除可能的遮罩层
            const mask = document.querySelector('.v-popover-mask, .bili-dialog-mask, [class*="dialog-mask"]');
            if (mask) mask.style.display = 'none';
          }
        }
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  },

  // 跳过会员引导页
  skipVipGuide() {
    if (!this.config.autoSkipGuide) return;

    // 检测是否在会员引导/开通页面
    const isGuidePage = document.querySelector('.vip-guide-page, .open-vip-page, [class*="vip-guide"]');
    if (isGuidePage) {
      // 尝试找到播放按钮或跳转链接
      const playBtn = document.querySelector('.play-btn, [class*="play"], a[href*="/bangumi/play/"]');
      if (playBtn) {
        playBtn.click();
        return;
      }
    }

    // 番剧页面：检测是否有会员验证遮挡
    if (BiliEnhancer.page.isBangumiPage()) {
      setTimeout(() => {
        const limitBox = document.querySelector('.vip-limit-box, .limit-box, [class*="vip-limit"]');
        if (limitBox) {
          limitBox.style.display = 'none';
          // 尝试触发播放
          const video = BiliEnhancer.getVideoElement();
          if (video && video.paused) {
            video.play().catch(() => {});
          }
        }
      }, 2000);
    }
  },

  // 隐藏付费选集遮挡（本人已购买会员）
  hidePaidOverlay() {
    const paidSelectors = [
      '.ep-item .lock-icon', '.ep-item .pay-mark',
      '[class*="ep-lock"]', '[class*="ep-pay"]',
      '.season-item .lock', '.cursor-item .lock-icon'
    ];

    const hidePaid = () => {
      paidSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          el.style.display = 'none';
        });
      });
      // 移除选集项的锁定样式
      document.querySelectorAll('.ep-item.locked, [class*="ep-item"][class*="lock"]').forEach(el => {
        el.classList.remove('locked');
        el.style.pointerEvents = 'auto';
        el.style.opacity = '1';
      });
    };

    setTimeout(hidePaid, 2000);
    // 监听选集列表变化
    const epList = document.querySelector('.ep-list, .season-list, [class*="ep-list"], [class*="cursor-list"]');
    if (epList) {
      new MutationObserver(hidePaid).observe(epList, { childList: true, subtree: true });
    }
  },

  // 会员专属内容标记
  setupVipBadge() {
    if (!this.config.vipBadge) return;
    if (!BiliEnhancer.page.isVideoPage()) return;

    setTimeout(() => {
      // 检测视频是否有会员专属标识
      const vipMark = document.querySelector('.vip-tag, [class*="vip-tag"], .badge-vip, [class*="vip-badge"]');
      const isVipContent = !!vipMark ||
        document.title.includes('大会员') ||
        document.querySelector('[class*="vip-free"]');

      if (isVipContent) {
        this.injectVipBadge();
      }
    }, 3000);
  },

  injectVipBadge() {
    const player = document.querySelector('.bpx-player-container') ||
      document.querySelector('#bilibili-player') ||
      document.querySelector('.player-wrap');
    if (!player) return;

    // 避免重复注入
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

  // 高级弹幕快捷功能（大会员专属）
  setupAdvancedDanmaku() {
    if (!this.config.autoDanmaku) return;
    if (!BiliEnhancer.page.isVideoPage()) return;

    setTimeout(() => {
      const danmakuInput = document.querySelector('.bpx-player-dm-input') ||
        document.querySelector('.bilibili-player-video-danmaku-input') ||
        document.querySelector('input[class*="danmaku"]');

      if (!danmakuInput) return;

      // 在弹幕输入框旁注入高级弹幕按钮
      const container = danmakuInput.closest('.bpx-player-dm-wrap') ||
        danmakuInput.parentElement;
      if (!container || container.querySelector('.bili-enhancer-dm-advanced')) return;

      const btnWrap = BiliEnhancer.dom.createElement('div', {
        class: 'bili-enhancer-dm-advanced'
      }, {
        display: 'inline-flex',
        gap: '4px',
        marginLeft: '6px',
        alignItems: 'center'
      });

      // 彩色弹幕按钮
      const colorBtn = BiliEnhancer.dom.createElement('button', {
        title: '彩色弹幕（大会员）'
      }, {
        background: 'linear-gradient(90deg, #ff0000, #ff8800, #ffff00, #00ff00, #0088ff, #8800ff)',
        color: '#fff',
        border: 'none',
        borderRadius: '3px',
        padding: '2px 6px',
        fontSize: '11px',
        cursor: 'pointer',
        textShadow: '0 0 2px rgba(0,0,0,0.8)'
      }, '彩');
      colorBtn.addEventListener('click', () => {
        // 模拟选择彩色弹幕模式
        const colorPicker = document.querySelector('.bpx-player-dm-color') ||
          document.querySelector('[class*="dm-color"]');
        if (colorPicker) colorPicker.click();
        BiliEnhancer.showToast('已开启彩色弹幕模式');
      });

      // 顶部弹幕按钮
      const topBtn = BiliEnhancer.dom.createElement('button', {
        title: '顶部固定弹幕（大会员）'
      }, {
        background: '#fb7299',
        color: '#fff',
        border: 'none',
        borderRadius: '3px',
        padding: '2px 6px',
        fontSize: '11px',
        cursor: 'pointer'
      }, '顶');
      topBtn.addEventListener('click', () => {
        const modeSelect = document.querySelector('.bpx-player-dm-mode') ||
          document.querySelector('[class*="dm-mode"]');
        if (modeSelect) modeSelect.click();
        BiliEnhancer.showToast('请选择顶部弹幕模式');
      });

      btnWrap.appendChild(colorBtn);
      btnWrap.appendChild(topBtn);
      container.appendChild(btnWrap);
    }, 4000);
  },

  // 关闭付费弹幕特效弹窗
  hidePaidDanmakuPopup() {
    const popupSelectors = [
      '.dm-pay-popup', '[class*="dm-pay"]', '[class*="danmaku-pay"]',
      '.dm-effect-dialog', '[class*="dm-effect-popup"]'
    ];
    popupSelectors.forEach(sel => {
      BiliEnhancer.dom.hideElements(sel);
    });
  },

  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
};
