/**
 * B站大会员增强助手 - 内容脚本入口
 * 职责：路由分发、按页面类型加载对应模块
 */

(function () {
  'use strict';

  // 防止重复注入
  if (window.__biliEnhancerLoaded) return;
  window.__biliEnhancerLoaded = true;

  // 初始化所有模块
  async function initAll() {
    try {
      // 通用模块（所有页面）
      await PagePurifier.init();
      await PerformanceThrottle.init();
      await BrowseTools.init();

      // 视频页面专属模块
      if (BiliEnhancer.page.isVideoPage()) {
        await PlayerEnhancer.init();
        await DanmakuManager.init();
        await VipPanel.init();
        await VideoInfo.init();
        await LocalTags.init();
      }

      // 应用滤镜（视频页）
      if (BiliEnhancer.page.isVideoPage()) {
        const filterConfig = await BiliEnhancer.storage.get('filterConfig');
        if (filterConfig && PlayerEnhancer.video) {
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

  // 监听配置更新，实时响应
  window.addEventListener('bili-enhancer-config-update', async (e) => {
    const data = e.detail;
    if (!data) return;

    // 滤镜实时更新
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
  });

  // SPA路由变化监听（B站是单页应用，用轻量级轮询代替重量级MutationObserver）
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // 页面切换后重新初始化视频相关模块
      setTimeout(async () => {
        if (BiliEnhancer.page.isVideoPage()) {
          // 销毁旧实例
          PlayerEnhancer.destroy();
          DanmakuManager.destroy();
          VipPanel.destroy();
          VideoInfo.destroy();
          // 重新初始化
          await PlayerEnhancer.init();
          await DanmakuManager.init();
          await VipPanel.init();
          await VideoInfo.init();
          await LocalTags.init();
        }
      }, 1500);
    }
  }, 1000);

  // 页面加载完成后初始化
  if (document.readyState === 'complete') {
    initAll();
  } else {
    window.addEventListener('load', initAll);
  }
})();
