/**
 * B站大会员增强助手 - 公共工具模块
 * 提供：存储封装、消息通信、DOM 观察、页面检测、资源管理器、滤镜应用
 */

const BiliEnhancer = {

  // ==================== 存储封装 ====================

  storage: {
    async get(key) {
      const res = await BiliEnhancer.message.send(MSG.GET_CONFIG, key ? [key] : null);
      if (res && res.success) {
        return key ? res.data[key] : res.data;
      }
      return null;
    },

    async set(data) {
      const res = await BiliEnhancer.message.send(MSG.SET_CONFIG, data);
      return !!(res && res.success);
    }
  },

  // ==================== 消息通信 ====================

  message: {
    send(type, data) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type, data }, (res) => {
            if (chrome.runtime.lastError) { resolve(null); return; }
            resolve(res);
          });
        } catch (e) {
          console.warn('[B站增强] 消息发送失败:', type, e);
          resolve(null);
        }
      });
    }
  },

  // ==================== 页面类型检测 ====================

  page: {
    isVideoPage() {
      return /^\/video\/|^\/bangumi\/play\/|^\/cheese\/play\//.test(location.pathname);
    },
    isBangumiPage() {
      return /^\/bangumi\/play\//.test(location.pathname);
    },
    isCheesePage() {
      return /^\/cheese\/play\//.test(location.pathname);
    },
    isLivePage() {
      return /^\/live\//.test(location.pathname) || location.hostname === 'live.bilibili.com';
    },
    isHomePage() {
      return location.pathname === '/' || location.pathname === '/index.html';
    },
    isDynamicPage() {
      return /^\/opus\/|^\/dynamic/.test(location.pathname);
    },
    getVideoId() {
      const bvMatch = location.pathname.match(/\/video\/(BV[\w]+)/);
      if (bvMatch) return bvMatch[1];
      const epMatch = location.pathname.match(/\/bangumi\/play\/(ep\d+|ss\d+)/);
      if (epMatch) return epMatch[1];
      const cheeseMatch = location.pathname.match(/\/cheese\/play\/(ep\d+|ss\d+)/);
      if (cheeseMatch) return cheeseMatch[1];
      return null;
    },
    /** 在内联 script 标签中按正则搜索（getAid/getCid 共用） */
    _scanScripts(pattern) {
      const scripts = document.querySelectorAll('script:not([src])');
      const limit = Math.min(scripts.length, LIMITS.MAX_SCRIPT_SEARCH);
      for (let i = 0; i < limit; i++) {
        const match = scripts[i].textContent.match(pattern);
        if (match) return match[1];
      }
      return null;
    },
    getAid() {
      const params = new URLSearchParams(location.search);
      const urlAid = params.get('aid');
      if (urlAid) return urlAid;
      try {
        const state = window.__INITIAL_STATE__;
        if (state && state.aid) return String(state.aid);
        if (state && state.videoData && state.videoData.aid) return String(state.videoData.aid);
      } catch (e) { /* 跨域访问限制 */ }
      return this._scanScripts(/"aid"\s*:\s*(\d+)/);
    },
    getCid() {
      try {
        const state = window.__INITIAL_STATE__;
        if (state && state.videoData && state.videoData.cid) return String(state.videoData.cid);
        if (state && state.cid) return String(state.cid);
      } catch (e) { /* 跨域访问限制 */ }
      return this._scanScripts(/"cid"\s*:\s*(\d+)/);
    },
    getPage() {
      const params = new URLSearchParams(location.search);
      return parseInt(params.get('p')) || 1;
    },
    getVideoCategory() {
      if (this.isBangumiPage()) return 'bangumi';
      if (this.isCheesePage()) return 'cheese';
      return 'normal';
    }
  },

  // ==================== DOM 工具 ====================

  dom: {
    waitForElement(selector, timeout = TIMING.ELEMENT_TIMEOUT, root = document) {
      return new Promise((resolve, reject) => {
        const el = root.querySelector(selector);
        if (el) { resolve(el); return; }
        const observer = new MutationObserver((_, obs) => {
          const found = root.querySelector(selector);
          if (found) { obs.disconnect(); resolve(found); }
        });
        observer.observe(root.body || root.documentElement, { childList: true, subtree: true });
        setTimeout(() => {
          observer.disconnect();
          reject(new Error('Timeout: ' + selector));
        }, timeout);
      });
    },

    createElement(tag, attrs = {}, styles = {}, text = '') {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      Object.entries(styles).forEach(([k, v]) => el.style[k] = v);
      if (text) el.textContent = text;
      return el;
    },

    removeElements(selector) {
      document.querySelectorAll(selector).forEach(el => el.remove());
    },

    hideElements(selector) {
      document.querySelectorAll(selector).forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });
    },

    /** 在多个选择器中找到第一个匹配的元素 */
    queryFirst(selectors) {
      const list = selectors.split(',').map(s => s.trim());
      for (const sel of list) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    }
  },

  // ==================== 通用工具函数 ====================

  throttle(fn, delay) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last >= delay) {
        last = now;
        fn.apply(this, args);
      }
    };
  },

  debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  },

  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // 降级方案
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* 忽略 */ }
      ta.remove();
      return true;
    }
  },

  showToast(msg, duration = TIMING.TOAST_DURATION) {
    const existing = document.querySelector('.bili-enhancer-toast');
    if (existing) existing.remove();
    const toast = this.dom.createElement('div', { class: 'bili-enhancer-toast' }, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.8)',
      color: '#fff',
      padding: '10px 20px',
      borderRadius: '6px',
      fontSize: '14px',
      zIndex: '999999',
      transition: 'opacity 0.3s',
      pointerEvents: 'none'
    }, msg);
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // ==================== 播放器相关 ====================

  getVideoElement() {
    return this.dom.queryFirst(VIDEO_SELECTORS) || document.querySelector('video');
  },

  getPlayInfo() {
    try {
      if (window.__playinfo__) return window.__playinfo__;
      const scripts = document.querySelectorAll('script:not([src])');
      for (let i = 0; i < Math.min(scripts.length, LIMITS.MAX_SCRIPT_SEARCH); i++) {
        const text = scripts[i].textContent;
        const idx = text.indexOf('window.__playinfo__');
        if (idx === -1) continue;
        const eqIdx = text.indexOf('=', idx);
        if (eqIdx === -1) continue;
        const jsonStr = text.slice(eqIdx + 1).trim();
        let depth = 0, end = -1;
        for (let j = 0; j < jsonStr.length; j++) {
          if (jsonStr[j] === '{') depth++;
          else if (jsonStr[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
        }
        if (end > 0) return JSON.parse(jsonStr.slice(0, end + 1));
      }
    } catch (e) {
      console.warn('[B站增强] 解析 playinfo 失败:', e.message);
    }
    return null;
  },

  getInitialState() {
    try {
      if (window.__INITIAL_STATE__) return window.__INITIAL_STATE__;
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const match = s.textContent.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/);
        if (match) return JSON.parse(match[1]);
      }
    } catch (e) {
      console.warn('[B站增强] 解析 __INITIAL_STATE__ 失败:', e.message);
    }
    return null;
  },

  /**
   * 统一滤镜应用（消除 PlayerEnhancer 与 VideoInfo 之间的竞态条件）
   * 所有模块都应通过此方法应用滤镜。
   */
  applyFilter(filterConfig, video) {
    const target = video || this.getVideoElement();
    if (!target) return;
    const { brightness, contrast, saturate, denoise } = filterConfig;
    if (brightness === 100 && contrast === 100 && saturate === 100 && !denoise) {
      target.style.filter = '';
      return;
    }
    const parts = [];
    if (brightness !== 100) parts.push(`brightness(${brightness / 100})`);
    if (contrast !== 100) parts.push(`contrast(${contrast / 100})`);
    if (saturate !== 100) parts.push(`saturate(${saturate / 100})`);
    if (denoise) parts.push(`blur(${DENOISE_BLUR})`);
    target.style.filter = parts.join(' ');
  },

  // ==================== VIP 状态检测 ====================

  vip: {
    _isVip: null,
    _vipType: 0,
    _lastCheck: 0,

    async check() {
      if (this._isVip !== null && Date.now() - this._lastCheck < TIMING.VIP_CACHE_DURATION) {
        return this._isVip;
      }
      try {
        const resp = await fetch('https://api.bilibili.com/x/web-interface/nav', {
          credentials: 'include'
        });
        const json = await resp.json();
        if (json.code === 0 && json.data) {
          // 年度大会员 (vipType === 2) 才激活全部功能
          this._isVip = json.data.vipStatus === 1 && json.data.vipType === 2;
          this._vipType = json.data.vipType;
          this._lastCheck = Date.now();
          BiliEnhancer.storage.set({
            vipInfo: {
              status: json.data.vipStatus,
              type: json.data.vipType,
              expireTime: json.data.vipDueDate ? new Date(json.data.vipDueDate).toLocaleDateString() : '',
              label: json.data.vipLabel ? json.data.vipLabel.text : '',
              lastCheck: Date.now()
            }
          });
          return this._isVip;
        }
      } catch (e) {
        console.warn('[B站增强] VIP 检测失败:', e.message);
      }
      // 降级：从 storage 读取
      const stored = await BiliEnhancer.storage.get('vipInfo');
      if (stored && stored.status === 1 && stored.type === 2) {
        this._isVip = true;
        this._vipType = 2;
        return true;
      }
      this._isVip = false;
      return false;
    },

    isVip() {
      return this._isVip === true;
    },

    getVipType() {
      return this._vipType;
    }
  },

  // ==================== 资源管理器工厂 ====================
  // 统一管理事件监听器、Observer、定时器，destroy() 时自动清理，彻底解决内存泄漏

  /** 创建事件监听器管理器 */
  createEventManager() {
    const listeners = [];
    return {
      on(target, event, handler, options) {
        target.addEventListener(event, handler, options);
        listeners.push({ target, event, handler, options });
      },
      once(target, event, handler, options) {
        const wrapper = (...args) => {
          handler(...args);
          this.off(target, event, wrapper);
        };
        target.addEventListener(event, wrapper, { ...options, once: true });
        listeners.push({ target, event, handler: wrapper, options: { ...options, once: true } });
      },
      off(target, event, handler) {
        target.removeEventListener(event, handler);
      },
      destroy() {
        listeners.forEach(({ target, event, handler, options }) => {
          target.removeEventListener(event, handler, options);
        });
        listeners.length = 0;
      }
    };
  },

  /** 创建 MutationObserver 管理器 */
  createObserverManager() {
    const observers = [];
    return {
      watch(target, callback, options = { childList: true, subtree: true }) {
        const obs = new MutationObserver(callback);
        obs.observe(target, options);
        observers.push(obs);
        return obs;
      },
      destroy() {
        observers.forEach(obs => obs.disconnect());
        observers.length = 0;
      }
    };
  },

  /** 创建定时器管理器 */
  createTimerManager() {
    const timers = [];
    return {
      interval(fn, delay) {
        const id = setInterval(fn, delay);
        timers.push({ type: 'interval', id });
        return id;
      },
      timeout(fn, delay) {
        const id = setTimeout(fn, delay);
        timers.push({ type: 'timeout', id });
        return id;
      },
      /** 按 id 提前取消定时器（无需等待 destroy） */
      clear(id) {
        const idx = timers.findIndex(t => t.id === id);
        if (idx === -1) return;
        const { type } = timers[idx];
        if (type === 'interval') clearInterval(id);
        else clearTimeout(id);
        timers.splice(idx, 1);
      },
      destroy() {
        timers.forEach(({ type, id }) => {
          if (type === 'interval') clearInterval(id);
          else clearTimeout(id);
        });
        timers.length = 0;
      }
    };
  }
};

// ==================== 消息监听（转发为自定义事件） ====================

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MSG.CONFIG_UPDATED) {
    window.dispatchEvent(new CustomEvent(EVT.CONFIG_UPDATE, { detail: message.data }));
  }
  if (message.type === MSG.TAB_ACTIVATED) {
    window.dispatchEvent(new CustomEvent(EVT.TAB_ACTIVATED));
  }
  if (message.type === MSG.COMMAND) {
    window.dispatchEvent(new CustomEvent(EVT.COMMAND, { detail: message.data }));
  }
});
