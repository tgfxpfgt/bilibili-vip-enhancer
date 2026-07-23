/**
 * B站大会员增强助手 - Service Worker (后台服务)
 * 职责：会员状态缓存、全局消息中转、标签页休眠监听、定时任务调度
 */

// 默认配置
const DEFAULT_CONFIG = {
  vipInfo: { status: 0, type: 0, expireTime: '', lastCheck: 0 },
  qualityPrefs: { bangumi: '127', movie: '127', normal: '116' },
  playerMemory: {},
  danmakuConfig: {
    fontSize: 25,
    opacity: 100,
    area: 100,
    blockedKeywords: [],
    mode: 'all',
    enableFilter: true
  },
  purifyConfig: {
    hideAds: true,
    hideBanner: true,
    wideScreen: true,
    hideLiveEffects: true,
    simplifyLayout: true,
    hideVipPromo: true
  },
  perfConfig: {
    idleThrottle: true,
    idleTimeout: 180,
    lazyLoad: true,
    disablePreload: true,
    disableAutoplay: true,
    domCleanup: true,
    lightweightThumb: true
  },
  filterConfig: {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    denoise: false
  },
  playerConfig: {
    autoQuality: true,
    autoHDR: true,
    autoHighFPS: true,
    autoHQAudio: true,
    rememberProgress: true,
    rememberRate: true,
    disableAutoNext: false,
    pauseOnHidden: true,
    timerStop: 0,
    shortcuts: true,
    volumeBoost: true,
    fullscreenHideUI: true
  },
  browseConfig: {
    commentEnhance: true,
    multiPartOptimize: true,
    timestampCopy: true,
    videoInfo: true,
    upBlock: true
  },
  vipConfig: {
    autoSkipGuide: true,
    hideVipDialogs: true,
    vipBadge: true,
    autoDanmaku: true
  },
  blockedUPs: [],
  localTags: {},
  purchasedList: []
};

// 初始化存储
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(null);
  if (!stored._initialized) {
    await chrome.storage.local.set({ ...DEFAULT_CONFIG, _initialized: true });
    console.log('[B站增强] 初始化配置完成');
  }
});

// 消息处理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data } = message;

  switch (type) {
    case 'GET_CONFIG':
      handleGetConfig(data).then(sendResponse);
      return true;

    case 'SET_CONFIG':
      handleSetConfig(data).then(sendResponse);
      return true;

    case 'CHECK_VIP':
      handleCheckVip().then(sendResponse);
      return true;

    case 'GET_VIP_INFO':
      handleGetVipInfo().then(sendResponse);
      return true;

    case 'SAVE_PROGRESS':
      handleSaveProgress(data).then(sendResponse);
      return true;

    case 'GET_PROGRESS':
      handleGetProgress(data).then(sendResponse);
      return true;

    case 'SCREENSHOT':
      handleScreenshot(data, sender.tab).then(sendResponse);
      return true;

    case 'EXPORT_DATA':
      handleExportData(data).then(sendResponse);
      return true;

    case 'IMPORT_DATA':
      handleImportData(data).then(sendResponse);
      return true;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

// 获取配置
async function handleGetConfig(keys) {
  try {
    if (keys && keys.length > 0) {
      const result = await chrome.storage.local.get(keys);
      return { success: true, data: result };
    }
    const result = await chrome.storage.local.get(null);
    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 设置配置
async function handleSetConfig(data) {
  try {
    await chrome.storage.local.set(data);
    // 通知所有bilibili标签页配置更新
    try {
      const tabs = await chrome.tabs.query({ url: '*://*.bilibili.com/*' });
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, { type: 'CONFIG_UPDATED', data }).catch(() => {});
      }
    } catch (e) { /* 忽略标签页查询失败 */ }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 检查VIP状态（通过content script请求B站API）
async function handleCheckVip() {
  try {
    const stored = await chrome.storage.local.get('vipInfo');
    const vipInfo = stored.vipInfo || { lastCheck: 0 };
    // 缓存10分钟
    if (Date.now() - vipInfo.lastCheck < 600000) {
      return { success: true, data: vipInfo };
    }
    return { success: true, data: vipInfo, needRefresh: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 获取VIP信息
async function handleGetVipInfo() {
  try {
    const stored = await chrome.storage.local.get('vipInfo');
    return { success: true, data: stored.vipInfo || DEFAULT_CONFIG.vipInfo };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 保存播放进度
async function handleSaveProgress(data) {
  try {
    const { key, progress } = data;
    const stored = await chrome.storage.local.get('playerMemory');
    const playerMemory = stored.playerMemory || {};
    playerMemory[key] = { ...progress, savedAt: Date.now() };
    // 限制存储数量，最多保存500条
    const keys = Object.keys(playerMemory);
    if (keys.length > 500) {
      const sorted = keys.sort((a, b) => (playerMemory[a].savedAt || 0) - (playerMemory[b].savedAt || 0));
      for (let i = 0; i < keys.length - 500; i++) {
        delete playerMemory[sorted[i]];
      }
    }
    await chrome.storage.local.set({ playerMemory });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 获取播放进度
async function handleGetProgress(data) {
  try {
    const { key } = data;
    const stored = await chrome.storage.local.get('playerMemory');
    const playerMemory = stored.playerMemory || {};
    return { success: true, data: playerMemory[key] || null };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 截图保存
async function handleScreenshot(data, tab) {
  try {
    const { dataUrl, filename } = data;
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename || `bilibili_screenshot_${Date.now()}.png`,
      saveAs: false
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 导出数据
async function handleExportData(data) {
  try {
    const { type: exportType } = data;
    let exportData = {};
    if (exportType === 'blockedUPs') {
      const stored = await chrome.storage.local.get('blockedUPs');
      exportData = { blockedUPs: stored.blockedUPs || [] };
    } else if (exportType === 'blockedKeywords') {
      const stored = await chrome.storage.local.get('danmakuConfig');
      exportData = { blockedKeywords: (stored.danmakuConfig || {}).blockedKeywords || [] };
    } else if (exportType === 'localTags') {
      const stored = await chrome.storage.local.get('localTags');
      exportData = { localTags: stored.localTags || {} };
    } else {
      exportData = await chrome.storage.local.get(null);
    }
    const jsonStr = JSON.stringify(exportData, null, 2);
    const bytes = new TextEncoder().encode(jsonStr);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    const dataUrl = 'data:application/json;base64,' + btoa(binary);
    await chrome.downloads.download({
      url: dataUrl,
      filename: `bilibili_enhancer_${exportType}_${Date.now()}.json`,
      saveAs: true
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 导入数据
async function handleImportData(data) {
  try {
    const { importData: rawData } = data;
    await chrome.storage.local.set(rawData);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 标签页休眠监听 - 标签不可见时通知content script暂停
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('bilibili.com')) {
    try {
      chrome.tabs.sendMessage(tabId, { type: 'TAB_ACTIVATED' });
    } catch (e) { /* 忽略 */ }
  }
});

// 定时清理过期的播放记忆（超过30天）
chrome.alarms.create('cleanExpiredMemory', { periodInMinutes: 1440 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanExpiredMemory') {
    try {
      const stored = await chrome.storage.local.get('playerMemory');
      const playerMemory = stored.playerMemory || {};
      const now = Date.now();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      let changed = false;
      for (const [key, val] of Object.entries(playerMemory)) {
        if (now - (val.savedAt || 0) > thirtyDays) {
          delete playerMemory[key];
          changed = true;
        }
      }
      if (changed) {
        await chrome.storage.local.set({ playerMemory });
      }
    } catch (e) {
      console.log('[B站增强] 清理过期记忆失败:', e);
    }
  }
});
