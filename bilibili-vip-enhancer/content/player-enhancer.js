/**
 * B站大会员增强助手 - 播放器增强模块
 * 功能：画质自动锁定、倍速控制、快捷键、进度记忆、连播控制、截图、滤镜
 */

const PlayerEnhancer = {
  config: null,
  video: null,
  audioContext: null,
  gainNode: null,
  currentVolume: 1,
  rotation: 0,
  mirrored: false,
  timerStopId: null,
  _events: null,
  _observers: null,
  _timers: null,

  async init() {
    // 初始化资源管理器
    this._events = BiliEnhancer.createEventManager();
    this._observers = BiliEnhancer.createObserverManager();
    this._timers = BiliEnhancer.createTimerManager();

    this.config = await BiliEnhancer.storage.get('playerConfig') || DEFAULT_CONFIG.playerConfig;

    if (!BiliEnhancer.page.isVideoPage()) return;

    // 等待主播放器 video 元素
    try {
      this.video = await BiliEnhancer.dom.waitForElement(VIDEO_SELECTORS, TIMING.VIDEO_ELEMENT_TIMEOUT);
    } catch (e) {
      try {
        this.video = await BiliEnhancer.dom.waitForElement('video', TIMING.VIDEO_FALLBACK_TIMEOUT);
      } catch (e2) {
        console.warn('[B站增强] 未找到视频元素');
        return;
      }
    }

    this.setupQualityAuto();
    this.setupShortcuts();
    this.setupProgressMemory();
    this.setupAutoNextControl();
    this.setupPauseOnHidden();
    this.setupTimerStop();
    this.setupFullscreenUI();
    this.setupVolumeBoost();
    this.setupBrowserCommands();
  },

  // ==================== 画质自动优化 ====================

  async setupQualityAuto() {
    if (!this.config.autoQuality) return;
    const isVip = await BiliEnhancer.vip.check();
    if (!isVip) return;

    const category = BiliEnhancer.page.getVideoCategory();
    const qualityPrefs = await BiliEnhancer.storage.get('qualityPrefs');
    const targetQuality = (qualityPrefs && qualityPrefs[category]) || '127';

    this._timers.timeout(() => this.trySetQuality(targetQuality), TIMING.QUALITY_SET_DELAY);
  },

  trySetQuality(targetQuality) {
    const qualityBtn = BiliEnhancer.dom.queryFirst(
      '.bpx-player-ctrl-quality, .squirtle-quality-wrap, [class*="quality"]'
    );

    if (!qualityBtn) return;

    qualityBtn.click();
    this._timers.timeout(() => {
      const targetText = QUALITY_MAP[targetQuality] || '1080P';
      const options = document.querySelectorAll(
        '.bpx-player-ctrl-quality-result li, .quality-list li, [class*="quality"] li'
      );
      for (const opt of options) {
        const text = opt.textContent.trim();
        if (text.includes(targetText) || (text.includes('4K') && targetQuality === '127')) {
          opt.click();
          BiliEnhancer.showToast(`已自动切换画质: ${text}`);
          return;
        }
      }
      // 选择最高可用画质
      if (options.length > 0) {
        options[0].click();
        BiliEnhancer.showToast(`已自动切换至最高画质: ${options[0].textContent.trim()}`);
      }
    }, TIMING.QUALITY_PANEL_DELAY);
  },

  // ==================== 全局快捷键 ====================

  setupShortcuts() {
    if (!this.config.shortcuts) return;

    this._events.on(document, 'keydown', (e) => {
      // 排除输入框
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

      const video = this.video;
      if (!video) return;

      switch (e.key) {
        case '[':
          e.preventDefault();
          this.adjustRate(-0.25);
          break;
        case ']':
          e.preventDefault();
          this.adjustRate(0.25);
          break;
        case ',':
          if (video.paused) {
            e.preventDefault();
            video.currentTime -= LIMITS.FRAME_STEP;
          }
          break;
        case '.':
          if (video.paused) {
            e.preventDefault();
            video.currentTime += LIMITS.FRAME_STEP;
          }
          break;
        case 'r': case 'R':
          if (!e.ctrlKey && !e.altKey) {
            e.preventDefault();
            this.rotateVideo();
          }
          break;
        case 'm': case 'M':
          if (!e.ctrlKey && !e.altKey) {
            e.preventDefault();
            this.mirrorVideo();
          }
          break;
        case 's': case 'S':
          if (!e.ctrlKey && !e.altKey) {
            e.preventDefault();
            this.takeScreenshot();
          }
          break;
      }

      // Shift+方向键 音量增强
      if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (this.config.volumeBoost) {
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
    rate = Math.max(LIMITS.MIN_PLAYBACK_RATE, Math.min(LIMITS.MAX_PLAYBACK_RATE, rate));
    video.playbackRate = rate;
    BiliEnhancer.showToast(`倍速: ${rate}x`);
  },

  rotateVideo() {
    this.rotation = (this.rotation + 90) % 360;
    this.applyVideoTransform();
    BiliEnhancer.showToast(`画面旋转: ${this.rotation}\u00b0`);
  },

  mirrorVideo() {
    this.mirrored = !this.mirrored;
    this.applyVideoTransform();
    BiliEnhancer.showToast(this.mirrored ? '已开启水平镜像' : '已关闭水平镜像');
  },

  applyVideoTransform() {
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
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      const videoId = BiliEnhancer.page.getVideoId() || 'screenshot';
      const time = BiliEnhancer.formatTime(video.currentTime).replace(/:/g, '-');
      BiliEnhancer.message.send(MSG.SCREENSHOT, {
        dataUrl,
        filename: `bilibili_${videoId}_${time}.png`
      });
      BiliEnhancer.showToast('截图已保存');
    } catch (e) {
      BiliEnhancer.showToast('截图失败（可能是跨域限制）: ' + e.message);
    }
  },

  // ==================== 浏览器级快捷键 ====================

  /** 处理 commands API 转发的命令（不受页面焦点影响） */
  setupBrowserCommands() {
    this._events.on(window, EVT.COMMAND, (e) => {
      const command = e.detail && e.detail.command;
      if (!this.video) return;
      switch (command) {
        case 'take-screenshot': this.takeScreenshot(); break;
        case 'speed-up':        this.adjustRate(0.25); break;
        case 'speed-down':      this.adjustRate(-0.25); break;
      }
    });
  },

  // ==================== 音量增强 ====================

  setupVolumeBoost() {
    if (!this.config.volumeBoost) return;
    this.currentVolume = 1;
  },

  adjustBoostVolume(delta) {
    const video = this.video;
    if (!video) return;

    this.currentVolume = Math.max(0, Math.min(LIMITS.MAX_VOLUME_BOOST, this.currentVolume + delta));

    if (this.currentVolume > 1) {
      // 使用 Web Audio API 放大
      if (!this.audioContext) {
        try {
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = this.audioContext.createMediaElementSource(video);
          this.gainNode = this.audioContext.createGain();
          source.connect(this.gainNode);
          this.gainNode.connect(this.audioContext.destination);
        } catch (e) {
          // 已为同一 video 创建过 source 时降级
          console.warn('[B站增强] Web Audio 初始化失败:', e.message);
          video.volume = 1;
          BiliEnhancer.showToast(`音量: ${Math.round(this.currentVolume * 100)}%`);
          return;
        }
      }
      video.volume = 1;
      if (this.gainNode) this.gainNode.gain.value = this.currentVolume;
    } else {
      if (this.gainNode) this.gainNode.gain.value = 1;
      video.volume = this.currentVolume;
    }
    BiliEnhancer.showToast(`音量: ${Math.round(this.currentVolume * 100)}%`);
  },

  // ==================== 播放进度记忆 ====================

  setupProgressMemory() {
    if (!this.config.rememberProgress) return;

    const videoId = BiliEnhancer.page.getVideoId();
    const cid = BiliEnhancer.page.getCid();
    const page = BiliEnhancer.page.getPage();
    if (!videoId) return;

    const key = `${videoId}_${cid || 'default'}_p${page}`;

    // 恢复进度
    BiliEnhancer.message.send(MSG.GET_PROGRESS, { key }).then((res) => {
      if (!res || !res.success || !res.data) return;
      const { time, rate, volume } = res.data;
      const video = this.video;
      if (!video) return;

      const restore = () => {
        if (time && time > 5 && time < video.duration - 5) {
          video.currentTime = time;
          BiliEnhancer.showToast(`已恢复播放进度: ${BiliEnhancer.formatTime(time)}`);
        }
        if (rate && this.config.rememberRate) {
          video.playbackRate = rate;
        }
        if (volume !== undefined) {
          video.volume = volume;
          this.currentVolume = volume;
        }
      };

      if (video.readyState >= 1) {
        restore();
      } else {
        this._events.once(video, 'loadedmetadata', restore);
      }
    });

    // 定时保存进度
    this._timers.interval(() => {
      const video = this.video;
      if (!video || video.paused || video.ended) return;
      BiliEnhancer.message.send(MSG.SAVE_PROGRESS, {
        key,
        progress: {
          time: video.currentTime,
          rate: video.playbackRate,
          volume: video.volume,
          duration: video.duration
        }
      });
    }, TIMING.PROGRESS_SAVE_INTERVAL);
  },

  // ==================== 连播控制 ====================

  setupAutoNextControl() {
    if (!this.config.disableAutoNext) return;

    // 阻止自动连播
    this._events.on(this.video, 'ended', (e) => {
      const nextBtn = BiliEnhancer.dom.queryFirst('.bpx-player-ctrl-next, [class*="next-episode"]');
      if (nextBtn) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    // 关闭自动连播开关
    const playerWrap = BiliEnhancer.dom.queryFirst(PLAYER_CONTAINER_SELECTORS);
    if (playerWrap) {
      this._observers.watch(playerWrap, () => {
        const autoNext = BiliEnhancer.dom.queryFirst('.bpx-player-ctrl-auto-next, [class*="auto-next"]');
        if (autoNext && autoNext.classList.contains('on')) {
          autoNext.click();
        }
      });
    }
  },

  // ==================== 切后台暂停 ====================

  setupPauseOnHidden() {
    if (!this.config.pauseOnHidden) return;

    this._events.on(document, 'visibilitychange', () => {
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

  // ==================== 定时停止 ====================

  setupTimerStop() {
    if (!this.config.timerStop || this.config.timerStop <= 0) return;
    this.setTimerStop(this.config.timerStop);
  },

  setTimerStop(minutes) {
    if (!this._timers) return; // 模块已销毁
    if (this.timerStopId) this._timers.clear(this.timerStopId);
    this.timerStopId = null;
    if (minutes <= 0) return;
    this.timerStopId = this._timers.timeout(() => {
      this.timerStopId = null;
      const video = this.video;
      if (video && !video.paused) {
        video.pause();
        BiliEnhancer.showToast('定时停止：已暂停播放');
      }
    }, minutes * 60 * 1000);
  },

  // ==================== 全屏隐藏 UI ====================

  setupFullscreenUI() {
    if (!this.config.fullscreenHideUI) return;

    this._events.on(document, 'fullscreenchange', () => {
      const isFullscreen = !!document.fullscreenElement;
      document.body.classList.toggle('bili-enhancer-fullscreen', isFullscreen);
    });
  },

  // ==================== 滤镜（委托给统一方法） ====================

  applyFilter(filterConfig) {
    BiliEnhancer.applyFilter(filterConfig, this.video);
  },

  // ==================== 清理 ====================

  destroy() {
    this._events?.destroy();
    this._observers?.destroy();
    this._timers?.destroy();
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.gainNode = null;
    }
    this.video = null;
  }
};
