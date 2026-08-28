/**
 * B站大会员增强助手 - 性能节流模块
 * 功能：闲置节流、图片懒加载、禁用预加载、关闭自动播放预览、DOM清理
 */

const PerformanceThrottle = {
  config: null,
  isThrottled: false,
  lazyObserver: null,
  _events: null,
  _observers: null,
  _timers: null,

  async init() {
    this._events = BiliEnhancer.createEventManager();
    this._observers = BiliEnhancer.createObserverManager();
    this._timers = BiliEnhancer.createTimerManager();

    this.config = await BiliEnhancer.storage.get('perfConfig') || DEFAULT_CONFIG.perfConfig;

    if (this.config.idleThrottle) this.setupIdleThrottle();
    if (this.config.lazyLoad) this.setupLazyLoad();
    if (this.config.disablePreload) this.disablePreload();
    if (this.config.disableAutoplay) this.disableAutoplayPreview();
    if (this.config.domCleanup) this.setupDomCleanup();
    if (this.config.lightweightThumb) this.lightweightThumbnails();

    this.setupVisibilityHandler();

    this._events.on(window, EVT.CONFIG_UPDATE, (e) => {
      if (e.detail && e.detail.perfConfig) {
        this.config = e.detail.perfConfig;
      }
    });
  },

  // ==================== 闲置节流 ====================

  setupIdleThrottle() {
    const timeout = (this.config.idleTimeout || 180) * 1000;
    let lastActivity = Date.now();

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    const onActivity = BiliEnhancer.throttle(() => {
      lastActivity = Date.now();
      if (this.isThrottled) this.restoreFromThrottle();
    }, 1000);

    activityEvents.forEach(evt => {
      this._events.on(document, evt, onActivity, { passive: true });
    });

    this._timers.interval(() => {
      const video = BiliEnhancer.getVideoElement();
      if (!video) return;
      if (video.paused && Date.now() - lastActivity > timeout) {
        this.applyThrottle(video);
      }
    }, TIMING.IDLE_CHECK_INTERVAL);
  },

  applyThrottle(video) {
    if (this.isThrottled) return;
    this.isThrottled = true;
    video.style.willChange = 'auto';
    video.dataset.throttled = 'true';
  },

  restoreFromThrottle() {
    const video = BiliEnhancer.getVideoElement();
    if (video) {
      video.style.willChange = '';
      delete video.dataset.throttled;
    }
    this.isThrottled = false;
  },

  // ==================== 可见性处理 ====================

  setupVisibilityHandler() {
    this._events.on(document, 'visibilitychange', () => {
      const video = BiliEnhancer.getVideoElement();
      if (!video) return;

      if (document.hidden) {
        if (!video.paused) {
          video.pause();
          video.dataset.hiddenPaused = 'true';
        }
      } else {
        if (video.dataset.hiddenPaused === 'true') {
          video.play().catch(() => {});
          delete video.dataset.hiddenPaused;
        }
        this.restoreFromThrottle();
      }
    });
  },

  // ==================== 封面懒加载 ====================

  setupLazyLoad() {
    if (BiliEnhancer.page.isVideoPage()) return;

    const processImages = () => {
      const images = document.querySelectorAll('img[data-src]:not([data-lazy-processed])');
      if (images.length === 0) return;

      if (!this.lazyObserver) {
        this.lazyObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const img = entry.target;
              if (img.dataset.src) {
                img.src = img.dataset.src;
                delete img.dataset.src;
              }
              img.dataset.lazyProcessed = 'true';
              this.lazyObserver.unobserve(img);
            }
          });
        }, { rootMargin: LAZY_LOAD_ROOT_MARGIN });
      }

      images.forEach(img => {
        const rect = img.getBoundingClientRect();
        if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
          if (img.dataset.src) {
            img.src = img.dataset.src;
            delete img.dataset.src;
          }
          img.dataset.lazyProcessed = 'true';
        } else {
          this.lazyObserver.observe(img);
        }
      });
    };

    this._timers.timeout(processImages, TIMING.LAZY_LOAD_DELAY);
    this._events.on(window, 'scroll', BiliEnhancer.throttle(processImages, 500), { passive: true });
    this._observers.watch(document.body, BiliEnhancer.debounce(processImages, 1000));
  },

  // ==================== 禁用预加载 ====================

  /** 判断是否为应移除的资源预加载标签 */
  isUnwantedPreload(link) {
    const rel = link.getAttribute('rel');
    if (rel !== 'preload' && rel !== 'prefetch' && rel !== 'preconnect') return false;
    const as = link.getAttribute('as');
    return as === 'video' || as === 'image' || as === 'fetch' || !as;
  },

  disablePreload() {
    const removePreloadLinks = () => {
      document.querySelectorAll('link[rel="preload"], link[rel="prefetch"], link[rel="preconnect"]')
        .forEach(el => { if (this.isUnwantedPreload(el)) el.remove(); });
    };
    removePreloadLinks();

    // 监听新增预加载标签
    this._observers.watch(document.head, (mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.tagName === 'LINK' && this.isUnwantedPreload(node)) {
            node.remove();
          }
        }
      }
    });

    // 拦截播放器预加载下一集
    if (BiliEnhancer.page.isVideoPage()) {
      this._timers.interval(() => {
        document.querySelectorAll('video[preload="auto"]').forEach(v => {
          if (v.paused && v.currentTime === 0) {
            v.preload = 'none';
          }
        });
      }, TIMING.PRELOAD_CHECK_INTERVAL);
    }
  },

  // ==================== 关闭预览自动播放 ====================

  disableAutoplayPreview() {
    const suppressPreviews = () => {
      document.querySelectorAll('video').forEach(video => {
        if (video.dataset.biliSuppress) return;
        const isMainPlayer = video.closest(PLAYER_CONTAINER_SELECTORS) ||
          video.closest('.bpx-player-video-area');
        if (!isMainPlayer) {
          video.dataset.biliSuppress = '1';
          video.muted = true;
          video.autoplay = false;
          if (!video.paused) video.pause();
          this._events.on(video, 'play', () => {
            if (!video.closest(PLAYER_CONTAINER_SELECTORS)) {
              video.pause();
            }
          }, { capture: true });
        }
      });
    };

    this._timers.timeout(suppressPreviews, TIMING.PREVIEW_SUPPRESS_DELAY);
    this._timers.interval(suppressPreviews, TIMING.AUTOPLAY_POLL_INTERVAL);
  },

  // ==================== DOM 清理 ====================

  setupDomCleanup() {
    this._timers.interval(() => this.cleanUnusedDOM(), TIMING.DOM_CLEANUP_INTERVAL);
  },

  cleanUnusedDOM() {
    try {
      // 清理隐藏的弹窗残留
      const hiddenDialogs = document.querySelectorAll(
        '[class*="dialog"][style*="display: none"], [class*="dialog"][style*="display:none"], ' +
        '[class*="popup"][style*="display: none"], [class*="popup"][style*="display:none"], ' +
        '[class*="modal"][style*="display: none"], [class*="modal"][style*="display:none"], ' +
        '.bili-enhancer-blocked'
      );
      hiddenDialogs.forEach(el => {
        if (!el.closest('.bpx-player-container') && el.children.length < 50) {
          el.remove();
        }
      });

      // 清理空的容器
      document.querySelectorAll('[class*="wrapper"]:empty, [class*="container"]:empty').forEach(el => {
        if (el.id !== 'app' && !el.closest('#app')) {
          el.remove();
        }
      });

      // 清理离屏的懒加载占位
      document.querySelectorAll('img[data-lazy-processed][src=""]').forEach(el => el.remove());
    } catch (e) {
      console.warn('[B站增强] DOM 清理失败:', e.message);
    }
  },

  // ==================== 缩略图轻量化 ====================

  lightweightThumbnails() {
    if (BiliEnhancer.page.isVideoPage()) return;

    const processThumb = (img) => {
      let src = img.src || img.dataset.src || '';
      if (!src || src.includes('@') || src.includes('data:')) return;
      if ((src.includes('hdslb.com') || src.includes('biliimg.com')) && !src.includes('@')) {
        const newSrc = src + THUMB_SIZE_PARAM;
        if (img.dataset.src) img.dataset.src = newSrc;
        else img.src = newSrc;
      }
    };

    this._timers.timeout(() => {
      document.querySelectorAll('.bili-video-card__cover img, .video-card-reco img, [class*="cover"] img')
        .forEach(processThumb);
    }, TIMING.THUMB_LIGHTWEIGHT_DELAY);
  },

  // ==================== 清理 ====================

  destroy() {
    this._events?.destroy();
    this._observers?.destroy();
    this._timers?.destroy();
    if (this.lazyObserver) {
      this.lazyObserver.disconnect();
      this.lazyObserver = null;
    }
  }
};
