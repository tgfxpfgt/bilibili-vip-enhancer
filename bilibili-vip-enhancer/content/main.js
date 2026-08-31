/**
 * B站大会员增强助手 - 内容脚本入口
 * 职责：模块编排、SPA 路由监听、配置更新分发
 */

(function () {
  'use strict';

  // 防止重复注入
  if (window.__biliEnhancerLoaded) return;
  window.__biliEnhancerLoaded = true;

  /** 视频页面专属模块列表 */
  const VIDEO_MODULES = ['PlayerEnhancer', 'DanmakuManager', 'VipPanel', 'VideoInfo', 'LocalTags'];
  /** 通用模块列表 */
  const GENERAL_MODULES = ['PagePurifier', 'PerformanceThrottle', 'BrowseTools'];

  /** 安全调用模块方法 */
  function callModule(name, method) {
    const mod = window[name];
    if (mod && typeof mod[method] === 'function') {
      try {
        return mod[method]();
      } catch (e) {
        console.warn(`[B站增强] ${name}.${method}() 异常:`, e.message);
      }
    }
  }

  /** 销毁并重新初始化视频模块 */
  async function reinitVideoModules() {
    VIDEO_MODULES.forEach(name => callModule(name, 'destroy'));
    for (const name of VIDEO_MODULES) {
      await callModule(name, 'init');
    }
  }

  /** 初始化所有模块 */
  async function initAll() {
    try {
      // 通用模块（所有页面）
      GENERAL_MODULES.forEach(name => callModule(name, 'init'));

      // 视频页面专属模块
      if (BiliEnhancer.page.isVideoPage()) {
        VIDEO_MODULES.forEach(name => callModule(name, 'init'));

        // 应用滤镜（统一入口）
        const filterConfig = await BiliEnhancer.storage.get('filterConfig');
        if (filterConfig) {
          PlayerEnhancer.applyFilter(filterConfig);
        }
      }

      console.log('[B站大会员增强助手] 初始化完成', {
        page: location.pathname,
        isVideo: BiliEnhancer.page.isVideoPage(),
        isVip: BiliEnhancer.vip.isVip()
      });
    } catch (e) {
      console.error('[B站大会员增强助手] 初始化错误:', e);
    }
  }

  // ==================== 配置更新分发 ====================

  const onConfigUpdate = async (e) => {
    const data = e.detail;
    if (!data) return;

    // 滤镜实时更新（统一入口，避免竞态）
    if (data.filterConfig && PlayerEnhancer.video) {
      PlayerEnhancer.applyFilter(data.filterConfig);
    }

    // 播放器配置更新
    if (data.playerConfig) {
      PlayerEnhancer.config = data.playerConfig;
      if (data.playerConfig.timerStop !== undefined) {
        PlayerEnhancer.setTimerStop(data.playerConfig.timerStop);
      }
    }
  };

  window.addEventListener(EVT.CONFIG_UPDATE, onConfigUpdate);

  // ==================== SPA 路由变化监听 ====================

  let lastUrl = location.href;
  const spaPollId = setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;

    // 路由变化后延迟处理：进入视频页重新初始化，离开则销毁并清理
    setTimeout(async () => {
      if (BiliEnhancer.page.isVideoPage()) {
        await reinitVideoModules();
      } else {
        VIDEO_MODULES.forEach(name => callModule(name, 'destroy'));
      }
    }, TIMING.SPA_REINIT_DELAY);
  }, TIMING.SPA_POLL_INTERVAL);

  // ==================== 页面卸载清理 ====================

  window.addEventListener('beforeunload', () => {
    clearInterval(spaPollId);
    window.removeEventListener(EVT.CONFIG_UPDATE, onConfigUpdate);
    // 销毁所有模块
    [...VIDEO_MODULES, ...GENERAL_MODULES].forEach(name => callModule(name, 'destroy'));
  });

  // ==================== 启动 ====================

  if (document.readyState === 'complete') {
    initAll();
  } else {
    window.addEventListener('load', initAll, { once: true });
  }
})();
