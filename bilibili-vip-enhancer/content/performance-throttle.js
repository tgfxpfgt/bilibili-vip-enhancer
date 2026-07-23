/**
 * B站大会员增强助手 - 性能节流模块
 * 功能：闲置节流、图片懒加载、禁用预加载、关闭自动播放预览、DOM清理
 */

const PerformanceThrottle = {
  config: null,
  idleTimer: null,
  domCleanTimer: null,
  lazyObserver: null,
  videoObserver: null,
  isThrottled: false,

  async init() {
    this.config = await BiliEnhancer.storage.get('perfConfig');
    if (!this.config) {
      this.config = {
        idleThrottle: true, idleTimeout: 180, lazyLoad: true,
        disablePreload: true, disableAutoplay: true, domCleanup: true,
        lightweightThumb: true
      };
    }

    if (this.config.idleThrottle) this.setupIdleThrottle();
    if (this.config.lazyLoad) this.setupLazyLoad();
    if (this.config.disablePreload) this.disablePreload();
    if (this.config.disableAutoplay) this.disableAutoplayPreview();
    if (this.config.domCleanup) this.setupDomCleanup();
    if (this.config.lightweightThumb) this.lightweightThumbnails();

    // 标签页可见性监听
    this.setupVisibilityHandler();

    // 监听配置更新
    window.addEventListener('bili-enhancer-config-update', (e) => {
      if (e.detail && e.detail.perfConfig) {
        this.config = e.detail.perfConfig;
      }
    });
  },

  // 智能闲置节流
  setupIdleThrottle() {
    const timeout = (this.config.idleTimeout || 180) * 1000;
    let lastActivity = Date.now();

    // 记录用户活动
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    const onActivity = BiliEnhancer.throttle(() => {
      lastActivity = Date.now();
      if (this.isThrottled) {
        this.restoreFromThrottle();
      }
    }, 1000);

    activityEvents.forEach(evt => {
      document.addEventListener(evt, onActivity, { passive: true });
    });

    // 定时检查闲置状态
    this.idleTimer = setInterval(() => {
      const video = BiliEnhancer.getVideoElement();
      if (!video) return;

      // 视频暂停后超过设定时间 → 降低资源占用
      if (video.paused && Date.now() - lastActivity > timeout) {
        this.applyThrottle(video);
      }
    }, 10000);
  },

  applyThrottle(video) {
    if (this.isThrottled) return;
    this.isThrottled = true;
    // 降低渲染：暂停时不需要高帧率渲染
    video.style.willChange = 'auto';
    // 标记节流状态
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

  // 标签页可见性处理
  setupVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
      const video = BiliEnhancer.getVideoElement();
      if (!video) return;

      if (document.hidden) {
        // 标签页不可见：暂停视频解码
        if (!video.paused) {
          video.pause();
          video.dataset.hiddenPaused = 'true';
        }
      } else {
        // 标签页恢复可见
        if (video.dataset.hiddenPaused === 'true') {
          video.play().catch(() => {});
          delete video.dataset.hiddenPaused;
        }
        this.restoreFromThrottle();
      }
    });
  },

  // 封面图片懒加载
  setupLazyLoad() {
    // 仅首页和动态页启用（播放页不需要）
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
        }, { rootMargin: '200px' });
      }

      images.forEach(img => {
        // 已经在视口内的直接加载
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

    // 初始处理
    setTimeout(processImages, 1000);
    // 滚动时处理新出现的图片
    window.addEventListener('scroll', BiliEnhancer.throttle(processImages, 500), { passive: true });
    // 监听DOM变化
    new MutationObserver(BiliEnhancer.debounce(processImages, 1000))
      .observe(document.body, { childList: true, subtree: true });
  },

  // 禁用预加载
  disablePreload() {
    // 移除已有的preload/prefetch标签
    const removePreloadLinks = () => {
      document.querySelectorAll('link[rel="preload"], link[rel="prefetch"], link[rel="preconnect"]').forEach(el => {
        // 保留关键资源预加载（CSS/字体），只移除视频/图片预加载
        const as = el.getAttribute('as');
        if (as === 'video' || as === 'image' || as === 'fetch' || !as) {
          el.remove();
        }
      });
    };
    removePreloadLinks();

    // 监听新增的预加载标签
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1 && node.tagName === 'LINK') {
            const rel = node.getAttribute('rel');
            const as = node.getAttribute('as');
            if ((rel === 'preload' || rel === 'prefetch') &&
              (as === 'video' || as === 'image' || as === 'fetch' || !as)) {
              node.remove();
            }
          }
        }
      }
    }).observe(document.head, { childList: true });

    // 拦截播放器预加载下一集（轻量级定时检查代替Observer）
    if (BiliEnhancer.page.isVideoPage()) {
      setInterval(() => {
        const videos = document.querySelectorAll('video[preload="auto"]');
        videos.forEach(v => {
          if (v.paused && v.currentTime === 0) {
            v.preload = 'none';
          }
        });
      }, 8000);
    }
  },

  // 关闭自动播放预览（用定时轮询代替重量级MutationObserver，降低CPU占用）
  disableAutoplayPreview() {
    const suppressPreviews = () => {
      document.querySelectorAll('video').forEach(video => {
        if (video.dataset.biliSuppress) return;
        const isMainPlayer = video.closest('.bpx-player-container') ||
          video.closest('#bilibili-player') ||
          video.closest('.player-wrap') ||
          video.closest('.bpx-player-video-area');
        if (!isMainPlayer) {
          video.dataset.biliSuppress = '1';
          video.muted = true;
          video.autoplay = false;
          if (!video.paused) video.pause();
          video.addEventListener('play', () => {
            if (!video.closest('.bpx-player-container') &&
              !video.closest('#bilibili-player')) {
              video.pause();
            }
          }, { capture: true, once: false });
        }
      });
    };

    // 初始处理
    setTimeout(suppressPreviews, 2000);
    // 每5秒轮询一次（比MutationObserver轻量得多）
    this._autoplayTimer = setInterval(suppressPreviews, 5000);
  },

  // 定时DOM清理
  setupDomCleanup() {
    this.domCleanTimer = setInterval(() => {
      this.cleanUnusedDOM();
    }, 600000); // 每10分钟
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
        // 只清理非必要的隐藏元素
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

      // 清理离屏的已处理懒加载占位
      document.querySelectorAll('img[data-lazy-processed][src=""]').forEach(el => el.remove());

    } catch (e) {
      // 静默处理，不影响页面
    }
  },

  // 缩略图轻量化
  lightweightThumbnails() {
    if (BiliEnhancer.page.isVideoPage()) return;

    const processThumb = (img) => {
      let src = img.src || img.dataset.src || '';
      if (!src || src.includes('@') || src.includes('data:')) return;
      // B站CDN支持尺寸参数
      if (src.includes('hdslb.com') || src.includes('biliimg.com')) {
        // 添加缩略图参数，减少图片大小
        if (!src.includes('@')) {
          const newSrc = src + '@160w_100h_1c.webp';
          if (img.dataset.src) {
            img.dataset.src = newSrc;
          } else {
            img.src = newSrc;
          }
        }
      }
    };

    // 处理首页/推荐流封面
    setTimeout(() => {
      document.querySelectorAll('.bili-video-card__cover img, .video-card-reco img, [class*="cover"] img').forEach(processThumb);
    }, 1500);
  },

  destroy() {
    if (this.idleTimer) clearInterval(this.idleTimer);
    if (this.domCleanTimer) clearInterval(this.domCleanTimer);
    if (this._autoplayTimer) clearInterval(this._autoplayTimer);
    if (this.lazyObserver) this.lazyObserver.disconnect();
    if (this.videoObserver) this.videoObserver.disconnect();
  }
};
