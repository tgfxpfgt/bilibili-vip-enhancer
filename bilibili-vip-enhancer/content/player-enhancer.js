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
  progressSaveTimer: null,

  async init() {
    this.config = await BiliEnhancer.storage.get('playerConfig');
    if (!this.config) {
      this.config = {
        autoQuality: true, autoHDR: true, autoHighFPS: true, autoHQAudio: true,
        rememberProgress: true, rememberRate: true, disableAutoNext: false,
        pauseOnHidden: true, timerStop: 0, shortcuts: true, volumeBoost: true,
        fullscreenHideUI: true
      };
    }

    if (!BiliEnhancer.page.isVideoPage()) return;

    // 等待主播放器video元素出现（优先匹配播放器容器内的video）
    try {
      this.video = await BiliEnhancer.dom.waitForElement(
        '.bpx-player-video-area video, #bilibili-player video, .player-wrap video', 15000
      );
    } catch (e) {
      // 降级：等待任意video
      try {
        this.video = await BiliEnhancer.dom.waitForElement('video', 5000);
      } catch (e2) {
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
  },

  // 画质自动优化
  async setupQualityAuto() {
    if (!this.config.autoQuality) return;
    const isVip = await BiliEnhancer.vip.check();
    if (!isVip) return;

    const category = BiliEnhancer.page.getVideoCategory();
    const qualityPrefs = await BiliEnhancer.storage.get('qualityPrefs');
    const targetQuality = qualityPrefs ? qualityPrefs[category] || '127' : '127';

    // 等待播放器控件加载
    setTimeout(() => {
      this.trySetQuality(targetQuality);
    }, 3000);
  },

  trySetQuality(targetQuality) {
    // 尝试通过播放器设置面板切换画质
    const qualityBtn = document.querySelector('.bpx-player-ctrl-quality') ||
      document.querySelector('.squirtle-quality-wrap') ||
      document.querySelector('[class*="quality"]');

    if (qualityBtn) {
      qualityBtn.click();
      setTimeout(() => {
        // 查找目标画质选项
        const qualityMap = {
          '127': '4K', '126': '杜比视界', '125': 'HDR', '120': '4K',
          '116': '1080P 60帧', '112': '1080P 高码率', '80': '1080P',
          '74': '720P 60帧', '64': '720P'
        };
        const targetText = qualityMap[targetQuality] || '1080P';
        const options = document.querySelectorAll('.bpx-player-ctrl-quality-result li, .quality-list li, [class*="quality"] li');
        for (const opt of options) {
          if (opt.textContent.includes(targetText) || opt.textContent.includes('4K') && targetQuality === '127') {
            opt.click();
            BiliEnhancer.showToast(`已自动切换画质: ${opt.textContent.trim()}`);
            return;
          }
        }
        // 选择最高可用画质（第一个选项通常是最高）
        if (options.length > 0) {
          options[0].click();
          BiliEnhancer.showToast(`已自动切换至最高画质: ${options[0].textContent.trim()}`);
        }
      }, 500);
    }
  },

  // 全局快捷键
  setupShortcuts() {
    if (!this.config.shortcuts) return;

    document.addEventListener('keydown', (e) => {
      // 排除输入框
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

      const video = this.video;
      if (!video) return;

      switch (e.key) {
        case '[': // 减速
          e.preventDefault();
          this.adjustRate(-0.25);
          break;
        case ']': // 加速
          e.preventDefault();
          this.adjustRate(0.25);
          break;
        case ',': // 逐帧后退
          if (video.paused) {
            e.preventDefault();
            video.currentTime -= 1 / 30;
          }
          break;
        case '.': // 逐帧前进
          if (video.paused) {
            e.preventDefault();
            video.currentTime += 1 / 30;
          }
          break;
        case 'r': case 'R': // 旋转
          if (!e.ctrlKey && !e.altKey) {
            e.preventDefault();
            this.rotateVideo();
          }
          break;
        case 'm': case 'M': // 镜像
          if (!e.ctrlKey && !e.altKey) {
            e.preventDefault();
            this.mirrorVideo();
          }
          break;
        case 's': case 'S': // 截图
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
          const delta = e.key === 'ArrowUp' ? 0.1 : -0.1;
          this.adjustBoostVolume(delta);
        }
      }
    });
  },

  adjustRate(delta) {
    const video = this.video;
    if (!video) return;
    let rate = Math.round((video.playbackRate + delta) * 100) / 100;
    rate = Math.max(0.25, Math.min(10, rate));
    video.playbackRate = rate;
    BiliEnhancer.showToast(`倍速: ${rate}x`);
  },

  rotateVideo() {
    this.rotation = (this.rotation + 90) % 360;
    this.applyVideoTransform();
    BiliEnhancer.showToast(`画面旋转: ${this.rotation}°`);
  },

  mirrorVideo() {
    this.mirrored = !this.mirrored;
    this.applyVideoTransform();
    BiliEnhancer.showToast(this.mirrored ? '已开启水平镜像' : '已关闭水平镜像');
  },

  applyVideoTransform() {
    const video = this.video;
    if (!video) return;
    let transform = '';
    if (this.rotation !== 0) transform += `rotate(${this.rotation}deg) `;
    if (this.mirrored) transform += 'scaleX(-1) ';
    video.style.transform = transform.trim() || 'none';
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
      BiliEnhancer.message.send('SCREENSHOT', {
        dataUrl,
        filename: `bilibili_${videoId}_${time}.png`
      });
      BiliEnhancer.showToast('截图已保存');
    } catch (e) {
      BiliEnhancer.showToast('截图失败: ' + e.message);
    }
  },

  // 音量增强（超过100%）
  setupVolumeBoost() {
    if (!this.config.volumeBoost) return;
    this.currentVolume = 1;
  },

  adjustBoostVolume(delta) {
    const video = this.video;
    if (!video) return;

    this.currentVolume = Math.max(0, Math.min(5, this.currentVolume + delta));

    if (this.currentVolume > 1) {
      // 使用Web Audio API放大
      if (!this.audioContext) {
        try {
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = this.audioContext.createMediaElementSource(video);
          this.gainNode = this.audioContext.createGain();
          source.connect(this.gainNode);
          this.gainNode.connect(this.audioContext.destination);
        } catch (e) {
          // 如果已创建过source，直接使用
          video.volume = 1;
          BiliEnhancer.showToast(`音量: ${Math.round(this.currentVolume * 100)}%`);
          return;
        }
      }
      video.volume = 1;
      if (this.gainNode) {
        this.gainNode.gain.value = this.currentVolume;
      }
    } else {
      if (this.gainNode) this.gainNode.gain.value = 1;
      video.volume = this.currentVolume;
    }
    BiliEnhancer.showToast(`音量: ${Math.round(this.currentVolume * 100)}%`);
  },

  // 播放进度记忆
  setupProgressMemory() {
    if (!this.config.rememberProgress) return;

    const videoId = BiliEnhancer.page.getVideoId();
    const cid = BiliEnhancer.page.getCid();
    const page = BiliEnhancer.page.getPage();
    if (!videoId) return;

    const key = `${videoId}_${cid || 'default'}_p${page}`;

    // 恢复进度
    BiliEnhancer.message.send('GET_PROGRESS', { key }).then((res) => {
      if (res && res.success && res.data) {
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
          video.addEventListener('loadedmetadata', restore, { once: true });
        }
      }
    });

    // 定时保存进度（每5秒）
    this.progressSaveTimer = setInterval(() => {
      const video = this.video;
      if (!video || video.paused || video.ended) return;
      BiliEnhancer.message.send('SAVE_PROGRESS', {
        key,
        progress: {
          time: video.currentTime,
          rate: video.playbackRate,
          volume: video.volume,
          duration: video.duration
        }
      });
    }, 5000);
  },

  // 连播控制
  setupAutoNextControl() {
    if (!this.config.disableAutoNext) return;

    // 监听播放结束事件，阻止自动下一集
    this.video.addEventListener('ended', (e) => {
      // 阻止B站自动连播
      const nextBtn = document.querySelector('.bpx-player-ctrl-next') ||
        document.querySelector('[class*="next-episode"]');
      if (nextBtn) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    // 隐藏自动连播按钮的自动触发
    const observer = new MutationObserver(() => {
      const autoNext = document.querySelector('.bpx-player-ctrl-auto-next') ||
        document.querySelector('[class*="auto-next"]');
      if (autoNext && autoNext.classList.contains('on')) {
        autoNext.click(); // 关闭自动连播
      }
    });
    const playerWrap = document.querySelector('.bpx-player-container') || document.querySelector('#bilibili-player');
    if (playerWrap) {
      observer.observe(playerWrap, { childList: true, subtree: true });
    }
  },

  // 切后台暂停
  setupPauseOnHidden() {
    if (!this.config.pauseOnHidden) return;

    document.addEventListener('visibilitychange', () => {
      const video = this.video;
      if (!video) return;
      if (document.hidden && !video.paused) {
        video.pause();
        video.dataset.autoPaused = 'true';
      } else if (!document.hidden && video.dataset.autoPaused === 'true') {
        video.play();
        delete video.dataset.autoPaused;
      }
    });
  },

  // 定时停止
  setupTimerStop() {
    if (!this.config.timerStop || this.config.timerStop <= 0) return;
    this.setTimerStop(this.config.timerStop);
  },

  setTimerStop(minutes) {
    if (this.timerStopId) clearTimeout(this.timerStopId);
    if (minutes <= 0) return;
    this.timerStopId = setTimeout(() => {
      const video = this.video;
      if (video && !video.paused) {
        video.pause();
        BiliEnhancer.showToast('定时停止：已暂停播放');
      }
    }, minutes * 60 * 1000);
  },

  // 全屏隐藏UI
  setupFullscreenUI() {
    if (!this.config.fullscreenHideUI) return;

    document.addEventListener('fullscreenchange', () => {
      const isFullscreen = !!document.fullscreenElement;
      document.body.classList.toggle('bili-enhancer-fullscreen', isFullscreen);
    });
  },

  // 应用滤镜
  applyFilter(filterConfig) {
    const video = this.video;
    if (!video) return;
    const { brightness, contrast, saturate, denoise } = filterConfig;
    let filter = '';
    if (brightness !== 100) filter += `brightness(${brightness / 100}) `;
    if (contrast !== 100) filter += `contrast(${contrast / 100}) `;
    if (saturate !== 100) filter += `saturate(${saturate / 100}) `;
    if (denoise) filter += 'blur(0.5px) ';
    video.style.filter = filter.trim() || 'none';
  },

  destroy() {
    if (this.progressSaveTimer) clearInterval(this.progressSaveTimer);
    if (this.timerStopId) clearTimeout(this.timerStopId);
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
};
