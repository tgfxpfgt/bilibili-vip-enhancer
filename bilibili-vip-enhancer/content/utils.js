/**
 * B站大会员增强助手 - 公共工具模块
 * 提供：存储封装、消息通信、DOM观察、页面检测等通用功能
 */

const BiliEnhancer = {
  // 存储相关
  storage: {
    async get(key) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'GET_CONFIG', data: key ? [key] : null }, (res) => {
            if (chrome.runtime.lastError) { resolve(null); return; }
            if (res && res.success) {
              resolve(key ? res.data[key] : res.data);
            } else {
              resolve(null);
            }
          });
        } catch (e) { resolve(null); }
      });
    },
    async set(data) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'SET_CONFIG', data }, (res) => {
            if (chrome.runtime.lastError) { resolve(false); return; }
            resolve(res && res.success);
          });
        } catch (e) { resolve(false); }
      });
    }
  },

  // 消息通信
  message: {
    send(type, data) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type, data }, (res) => {
            if (chrome.runtime.lastError) { resolve(null); return; }
            resolve(res);
          });
        } catch (e) {
          resolve(null);
        }
      });
    }
  },

  // 页面类型检测
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
      // 获取BV号
      const bvMatch = location.pathname.match(/\/video\/(BV[\w]+)/);
      if (bvMatch) return bvMatch[1];
      // 获取ep号（番剧）
      const epMatch = location.pathname.match(/\/bangumi\/play\/(ep\d+|ss\d+)/);
      if (epMatch) return epMatch[1];
      // 获取课程号
      const cheeseMatch = location.pathname.match(/\/cheese\/play\/(ep\d+|ss\d+)/);
      if (cheeseMatch) return cheeseMatch[1];
      return null;
    },
    getAid() {
      // 优先从URL参数获取（最快）
      const params = new URLSearchParams(location.search);
      const urlAid = params.get('aid');
      if (urlAid) return urlAid;
      // 从window对象获取
      try {
        const state = window.__INITIAL_STATE__;
        if (state && state.aid) return String(state.aid);
        if (state && state.videoData && state.videoData.aid) return String(state.videoData.aid);
      } catch (e) { /* ignore */ }
      // 降级：从脚本中获取（限制搜索范围）
      const scripts = document.querySelectorAll('script:not([src])');
      for (let i = 0; i < Math.min(scripts.length, 10); i++) {
        const match = scripts[i].textContent.match(/"aid"\s*:\s*(\d+)/);
        if (match) return match[1];
      }
      return null;
    },
    getCid() {
      try {
        const state = window.__INITIAL_STATE__;
        if (state && state.videoData && state.videoData.cid) return String(state.videoData.cid);
        if (state && state.cid) return String(state.cid);
      } catch (e) { /* ignore */ }
      const scripts = document.querySelectorAll('script:not([src])');
      for (let i = 0; i < Math.min(scripts.length, 10); i++) {
        const match = scripts[i].textContent.match(/"cid"\s*:\s*(\d+)/);
        if (match) return match[1];
      }
      return null;
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

  // DOM工具
  dom: {
    // 等待元素出现
    waitForElement(selector, timeout = 10000, root = document) {
      return new Promise((resolve, reject) => {
        const el = root.querySelector(selector);
        if (el) { resolve(el); return; }
        const observer = new MutationObserver((mutations, obs) => {
          const el = root.querySelector(selector);
          if (el) { obs.disconnect(); resolve(el); }
        });
        observer.observe(root.body || root.documentElement, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); reject(new Error('Timeout: ' + selector)); }, timeout);
      });
    },

    // 创建元素
    createElement(tag, attrs = {}, styles = {}, text = '') {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      Object.entries(styles).forEach(([k, v]) => el.style[k] = v);
      if (text) el.textContent = text;
      return el;
    },

    // 安全移除元素
    removeElements(selector) {
      document.querySelectorAll(selector).forEach(el => el.remove());
    },

    // 隐藏元素
    hideElements(selector) {
      document.querySelectorAll(selector).forEach(el => {
        el.style.setProperty('display', 'none', 'important');
      });
    },

    // 监听DOM变化
    observe(target, callback, options = { childList: true, subtree: true }) {
      const observer = new MutationObserver(callback);
      observer.observe(target, options);
      return observer;
    }
  },

  // 节流函数
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

  // 防抖函数
  debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  // VIP状态检测
  vip: {
    _isVip: null,
    _vipType: 0,
    _lastCheck: 0,

    async check() {
      // 缓存5分钟
      if (this._isVip !== null && Date.now() - this._lastCheck < 300000) {
        return this._isVip;
      }
      try {
        const resp = await fetch('https://api.bilibili.com/x/web-interface/nav', {
          credentials: 'include'
        });
        const json = await resp.json();
        if (json.code === 0 && json.data) {
          this._isVip = json.data.vipStatus === 1 && json.data.vipType === 2;
          this._vipType = json.data.vipType;
          this._lastCheck = Date.now();
          // 缓存到storage
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
        console.log('[B站增强] VIP检测失败:', e);
      }
      // 降级：从storage读取
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

  // 获取播放器video元素（优先匹配主播放器）
  getVideoElement() {
    return document.querySelector('.bpx-player-video-area video') ||
      document.querySelector('#bilibili-player video') ||
      document.querySelector('.player-wrap video') ||
      document.querySelector('video');
  },

  // 获取当前播放信息
  getPlayInfo() {
    try {
      if (window.__playinfo__) return window.__playinfo__;
      // 从脚本标签中提取（限制搜索范围，避免遍历所有script）
      const scripts = document.querySelectorAll('script:not([src])');
      for (let i = 0; i < Math.min(scripts.length, 15); i++) {
        const text = scripts[i].textContent;
        const idx = text.indexOf('window.__playinfo__');
        if (idx === -1) continue;
        const eqIdx = text.indexOf('=', idx);
        if (eqIdx === -1) continue;
        const jsonStr = text.slice(eqIdx + 1).trim();
        // 找到JSON结束位置（匹配大括号）
        let depth = 0, end = -1;
        for (let j = 0; j < jsonStr.length; j++) {
          if (jsonStr[j] === '{') depth++;
          else if (jsonStr[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
        }
        if (end > 0) return JSON.parse(jsonStr.slice(0, end + 1));
      }
    } catch (e) { /* ignore */ }
    return null;
  },

  // 获取初始状态
  getInitialState() {
    try {
      if (window.__INITIAL_STATE__) return window.__INITIAL_STATE__;
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const match = s.textContent.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/);
        if (match) return JSON.parse(match[1]);
      }
    } catch (e) { /* ignore */ }
    return null;
  },

  // 格式化时间
  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  },

  // 复制文本到剪贴板
  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // 降级方案
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    }
  },

  // 显示提示消息
  showToast(msg, duration = 2000) {
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
  }
};

// 监听配置更新
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CONFIG_UPDATED') {
    window.dispatchEvent(new CustomEvent('bili-enhancer-config-update', { detail: message.data }));
  }
  if (message.type === 'TAB_ACTIVATED') {
    window.dispatchEvent(new CustomEvent('bili-enhancer-tab-activated'));
  }
});
