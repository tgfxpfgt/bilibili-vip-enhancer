/**
 * B站大会员增强助手 - Service Worker (后台服务)
 * 职责：会员状态缓存、全局消息中转、标签页休眠监听、定时任务调度
 */

// 加载共享常量（路径相对 service worker 文件）
importScripts('../constants.js');

// ==================== 消息路由表 ====================

const handlers = {
  [MSG.GET_CONFIG]:    (data) => handleGetConfig(data),
  [MSG.SET_CONFIG]:    (data) => handleSetConfig(data),
  [MSG.GET_VIP_INFO]:  () => handleGetVipInfo(),
  [MSG.SAVE_PROGRESS]: (data) => handleSaveProgress(data),
  [MSG.GET_PROGRESS]:  (data) => handleGetProgress(data),
  [MSG.SCREENSHOT]:    (data) => handleScreenshot(data),
  [MSG.EXPORT_DATA]:   (data) => handleExportData(data),
  [MSG.IMPORT_DATA]:   (data) => handleImportData(data)
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message.type];
  if (handler) {
    handler(message.data).then(sendResponse);
    return true; // 保持异步响应通道
  }
  sendResponse({ success: false, error: 'Unknown message type: ' + message.type });
});

// ==================== 初始化 ====================

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(null);
  if (!stored._initialized) {
    await chrome.storage.local.set({ ...DEFAULT_CONFIG, _initialized: true });
    console.log('[B站增强] 初始化配置完成');
  }
  await restoreFromSync();
  await updateBadge();
});

// ==================== 多设备云同步 ====================
// 对标 BewlyBewly 的 storage sync 实践：小体量配置跨设备同步，
// 大体量数据（播放记忆/标签等）仅存本地

/** 写入配置时同步到云端（超配额等异常只告警不阻断） */
async function syncToRemote(data) {
  const payload = {};
  for (const key of SYNC_KEYS) {
    if (key in data) payload[key] = data[key];
  }
  if (Object.keys(payload).length === 0) return;
  try {
    await chrome.storage.sync.set(payload);
  } catch (e) {
    console.warn('[B站增强] 云同步写入失败（可能超出配额）:', e.message);
  }
}

/** 启动时从云端恢复配置（其他设备修改在本设备生效） */
async function restoreFromSync() {
  try {
    const remote = await chrome.storage.sync.get(null);
    if (Object.keys(remote).length > 0) {
      await chrome.storage.local.set(remote);
    }
  } catch (e) {
    console.warn('[B站增强] 云同步恢复失败:', e.message);
  }
}

// 本设备任何标签页写入 -> 推到云端；云端变化（其他设备）-> 广播到本设备标签页
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    const data = {};
    for (const [key, value] of Object.entries(changes)) data[key] = value.newValue;
    syncToRemote(data);
  } else if (area === 'sync') {
    const data = {};
    for (const [key, value] of Object.entries(changes)) data[key] = value.newValue;
    chrome.storage.local.set(data).catch(() => {});
    broadcastToTabs({ type: MSG.CONFIG_UPDATED, data });
  }
  if (changes.vipInfo) updateBadge();
});

/** 向所有 bilibili 标签页广播消息 */
async function broadcastToTabs(message) {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.bilibili.com/*' });
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  } catch (e) { /* 标签页查询失败不影响主流程 */ }
}

// ==================== 徽标状态 ====================

async function updateBadge() {
  try {
    const stored = await chrome.storage.local.get('vipInfo');
    const vip = stored.vipInfo;
    const isVip = !!vip && vip.status === 1 && vip.type === 2;
    await chrome.action.setBadgeText({ text: isVip ? 'V' : '' });
    if (isVip) {
      await chrome.action.setBadgeBackgroundColor({ color: '#f7ba2a' });
    }
  } catch (e) { /* 徽标失败不影响主流程 */ }
}

// ==================== 浏览器级快捷键 ====================
// 页面级快捷键在播放器失焦时失效，commands API 在任意页面均可用

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true, currentWindow: true, url: '*://*.bilibili.com/*'
    });
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: MSG.COMMAND, data: { command } }).catch(() => {});
  } catch (e) {
    console.warn('[B站增强] 快捷键转发失败:', e.message);
  }
});

// ==================== Handler 实现 ====================

async function handleGetConfig(keys) {
  try {
    const result = keys && keys.length > 0
      ? await chrome.storage.local.get(keys)
      : await chrome.storage.local.get(null);
    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleSetConfig(data) {
  try {
    await chrome.storage.local.set(data);
    // 通知所有 bilibili 标签页
    broadcastToTabs({ type: MSG.CONFIG_UPDATED, data });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleGetVipInfo() {
  try {
    const stored = await chrome.storage.local.get('vipInfo');
    return { success: true, data: stored.vipInfo || DEFAULT_CONFIG.vipInfo };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleSaveProgress(data) {
  try {
    const { key, progress } = data;
    const stored = await chrome.storage.local.get('playerMemory');
    const playerMemory = stored.playerMemory || {};
    playerMemory[key] = { ...progress, savedAt: Date.now() };

    // 限制存储数量
    const keys = Object.keys(playerMemory);
    if (keys.length > LIMITS.MAX_PLAYER_MEMORY) {
      const sorted = keys.sort((a, b) =>
        (playerMemory[a].savedAt || 0) - (playerMemory[b].savedAt || 0)
      );
      for (let i = 0; i < keys.length - LIMITS.MAX_PLAYER_MEMORY; i++) {
        delete playerMemory[sorted[i]];
      }
    }

    await chrome.storage.local.set({ playerMemory });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleGetProgress(data) {
  try {
    const stored = await chrome.storage.local.get('playerMemory');
    const playerMemory = stored.playerMemory || {};
    return { success: true, data: playerMemory[data.key] || null };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleScreenshot(data) {
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

/** 部分导出类型 -> 需读取的 storage 键（'all' 表示全量导出） */
const EXPORT_SOURCE_KEYS = {
  blockedUPs:     ['blockedUPs'],
  blockedKeywords: ['danmakuConfig'],
  localTags:      ['localTags']
};

async function handleExportData(data) {
  try {
    const { type: exportType } = data;
    let exportData = {};

    const sourceKeys = EXPORT_SOURCE_KEYS[exportType];
    if (sourceKeys) {
      const stored = await chrome.storage.local.get(sourceKeys);
      if (exportType === 'blockedKeywords') {
        exportData = { blockedKeywords: (stored.danmakuConfig || {}).blockedKeywords || [] };
      } else {
        exportData = { [exportType]: stored[exportType] || (exportType === 'localTags' ? {} : []) };
      }
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

/**
 * 导入数据 — 带白名单验证，防止恶意/损坏数据覆盖任意配置
 */
async function handleImportData(data) {
  try {
    const { importData: rawData } = data;
    if (!rawData || typeof rawData !== 'object') {
      return { success: false, error: '导入数据格式无效' };
    }

    // 白名单过滤：只允许写入已知的配置键
    const filtered = {};
    let importedCount = 0;
    for (const key of Object.keys(rawData)) {
      if (IMPORTABLE_KEYS.has(key)) {
        filtered[key] = rawData[key];
        importedCount++;
      }
    }

    if (importedCount === 0) {
      return { success: false, error: '导入数据中不包含任何有效配置项' };
    }

    await chrome.storage.local.set(filtered);
    return { success: true, data: { importedCount } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ==================== 标签页监听 ====================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('bilibili.com')) {
    chrome.tabs.sendMessage(tabId, { type: MSG.TAB_ACTIVATED }).catch(() => {});
  }
});

// ==================== 定时清理过期播放记忆 ====================

chrome.alarms.create('cleanExpiredMemory', { periodInMinutes: LIMITS.CLEANUP_ALARM_MIN });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'cleanExpiredMemory') return;
  try {
    const stored = await chrome.storage.local.get('playerMemory');
    const playerMemory = stored.playerMemory || {};
    const now = Date.now();
    let changed = false;

    for (const [key, val] of Object.entries(playerMemory)) {
      if (now - (val.savedAt || 0) > LIMITS.MEMORY_EXPIRY_MS) {
        delete playerMemory[key];
        changed = true;
      }
    }

    if (changed) {
      await chrome.storage.local.set({ playerMemory });
    }
  } catch (e) {
    console.warn('[B站增强] 清理过期记忆失败:', e.message);
  }
});
