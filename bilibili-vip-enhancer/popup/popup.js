/**
 * B站大会员增强助手 - Popup弹窗逻辑
 * 功能：设置读写、Tab切换、VIP状态展示、数据导入导出
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Tab切换
  setupTabs();
  // 加载配置
  await loadConfig();
  // 加载VIP状态
  await loadVipStatus();
  // 绑定事件
  bindEvents();
});

// Tab切换逻辑
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById('tab-' + btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

// 加载配置到UI
async function loadConfig() {
  const data = await sendMsg('GET_CONFIG', null);
  if (!data || !data.success) return;
  const config = data.data;

  // 播放器配置
  if (config.playerConfig) {
    setChecked('autoQuality', config.playerConfig.autoQuality);
    setChecked('autoHDR', config.playerConfig.autoHDR);
    setChecked('autoHQAudio', config.playerConfig.autoHQAudio);
    setChecked('shortcuts', config.playerConfig.shortcuts);
    setChecked('rememberProgress', config.playerConfig.rememberProgress);
    setChecked('rememberRate', config.playerConfig.rememberRate);
    setChecked('disableAutoNext', config.playerConfig.disableAutoNext);
    setChecked('pauseOnHidden', config.playerConfig.pauseOnHidden);
    setChecked('volumeBoost', config.playerConfig.volumeBoost);
    setChecked('fullscreenHideUI', config.playerConfig.fullscreenHideUI);
    setValue('timerStop', config.playerConfig.timerStop || 0);
  }

  // 画质偏好
  if (config.qualityPrefs) {
    setValue('qualityBangumi', config.qualityPrefs.bangumi || '127');
    setValue('qualityNormal', config.qualityPrefs.normal || '116');
  }

  // VIP配置
  if (config.vipConfig) {
    setChecked('hideVipDialogs', config.vipConfig.hideVipDialogs);
    setChecked('autoSkipGuide', config.vipConfig.autoSkipGuide);
    setChecked('vipBadge', config.vipConfig.vipBadge);
    setChecked('autoDanmaku', config.vipConfig.autoDanmaku);
  }

  // 净化配置
  if (config.purifyConfig) {
    setChecked('hideAds', config.purifyConfig.hideAds);
    setChecked('hideBanner', config.purifyConfig.hideBanner);
    setChecked('wideScreen', config.purifyConfig.wideScreen);
    setChecked('simplifyLayout', config.purifyConfig.simplifyLayout);
    setChecked('hideLiveEffects', config.purifyConfig.hideLiveEffects);
    setChecked('hideVipPromo', config.purifyConfig.hideVipPromo);
  }

  // 弹幕配置
  if (config.danmakuConfig) {
    setRange('dmFontSize', config.danmakuConfig.fontSize || 25, 'dmFontSizeVal', 'px');
    setRange('dmOpacity', config.danmakuConfig.opacity || 100, 'dmOpacityVal', '%');
    setRange('dmArea', config.danmakuConfig.area || 100, 'dmAreaVal', '%');
    setValue('dmMode', config.danmakuConfig.mode || 'all');
    setChecked('dmFilterEnable', config.danmakuConfig.enableFilter);
    const keywords = config.danmakuConfig.blockedKeywords || [];
    setValue('dmKeywords', keywords.join('\n'));
  }

  // 性能配置
  if (config.perfConfig) {
    setChecked('idleThrottle', config.perfConfig.idleThrottle);
    setValue('idleTimeout', config.perfConfig.idleTimeout || 180);
    setChecked('lazyLoad', config.perfConfig.lazyLoad);
    setChecked('disablePreload', config.perfConfig.disablePreload);
    setChecked('disableAutoplay', config.perfConfig.disableAutoplay);
    setChecked('domCleanup', config.perfConfig.domCleanup);
    setChecked('lightweightThumb', config.perfConfig.lightweightThumb);
  }

  // 滤镜配置
  if (config.filterConfig) {
    setRange('brightness', config.filterConfig.brightness || 100, 'brightnessVal', '%');
    setRange('contrast', config.filterConfig.contrast || 100, 'contrastVal', '%');
    setRange('saturate', config.filterConfig.saturate || 100, 'saturateVal', '%');
    setChecked('denoise', config.filterConfig.denoise);
  }

  // 浏览配置
  if (config.browseConfig) {
    setChecked('commentEnhance', config.browseConfig.commentEnhance);
    setChecked('multiPartOptimize', config.browseConfig.multiPartOptimize);
    setChecked('timestampCopy', config.browseConfig.timestampCopy);
    setChecked('videoInfo', config.browseConfig.videoInfo);
  }

  // UP主屏蔽列表
  if (config.blockedUPs) {
    setValue('blockedUPs', config.blockedUPs.join('\n'));
  }
}

// 加载VIP状态
async function loadVipStatus() {
  const res = await sendMsg('GET_VIP_INFO');
  const statusEl = document.getElementById('vipStatus');
  const stateEl = document.getElementById('vipState');
  const expireEl = document.getElementById('vipExpire');
  const typeEl = document.getElementById('vipType');

  if (res && res.success && res.data) {
    const vip = res.data;
    const isVip = vip.status === 1 && vip.type === 2;
    statusEl.textContent = isVip ? '大会员 ✓' : '非大会员';
    statusEl.classList.toggle('active', isVip);
    stateEl.textContent = isVip ? '生效中' : '未开通';
    expireEl.textContent = vip.expireTime || '--';
    typeEl.textContent = vip.label || (vip.type === 2 ? '年度大会员' : vip.type === 1 ? '月度会员' : '无');
  } else {
    statusEl.textContent = '未登录';
    stateEl.textContent = '请先登录B站';
  }
}

// 绑定所有事件
function bindEvents() {
  // 播放器开关
  bindToggle('autoQuality', (v) => updatePlayerConfig({ autoQuality: v }));
  bindToggle('autoHDR', (v) => updatePlayerConfig({ autoHDR: v }));
  bindToggle('autoHQAudio', (v) => updatePlayerConfig({ autoHQAudio: v }));
  bindToggle('shortcuts', (v) => updatePlayerConfig({ shortcuts: v }));
  bindToggle('rememberProgress', (v) => updatePlayerConfig({ rememberProgress: v }));
  bindToggle('rememberRate', (v) => updatePlayerConfig({ rememberRate: v }));
  bindToggle('disableAutoNext', (v) => updatePlayerConfig({ disableAutoNext: v }));
  bindToggle('pauseOnHidden', (v) => updatePlayerConfig({ pauseOnHidden: v }));
  bindToggle('volumeBoost', (v) => updatePlayerConfig({ volumeBoost: v }));
  bindToggle('fullscreenHideUI', (v) => updatePlayerConfig({ fullscreenHideUI: v }));
  bindNumber('timerStop', (v) => updatePlayerConfig({ timerStop: v }));

  // 画质偏好
  bindSelect('qualityBangumi', (v) => updateQualityPrefs('bangumi', v));
  bindSelect('qualityNormal', (v) => updateQualityPrefs('normal', v));

  // VIP配置
  bindToggle('hideVipDialogs', (v) => updateVipConfig({ hideVipDialogs: v }));
  bindToggle('autoSkipGuide', (v) => updateVipConfig({ autoSkipGuide: v }));
  bindToggle('vipBadge', (v) => updateVipConfig({ vipBadge: v }));
  bindToggle('autoDanmaku', (v) => updateVipConfig({ autoDanmaku: v }));

  // 净化配置
  bindToggle('hideAds', (v) => updatePurifyConfig({ hideAds: v }));
  bindToggle('hideBanner', (v) => updatePurifyConfig({ hideBanner: v }));
  bindToggle('wideScreen', (v) => updatePurifyConfig({ wideScreen: v }));
  bindToggle('simplifyLayout', (v) => updatePurifyConfig({ simplifyLayout: v }));
  bindToggle('hideLiveEffects', (v) => updatePurifyConfig({ hideLiveEffects: v }));
  bindToggle('hideVipPromo', (v) => updatePurifyConfig({ hideVipPromo: v }));

  // 弹幕配置
  bindRange('dmFontSize', 'dmFontSizeVal', 'px', (v) => updateDanmakuConfig({ fontSize: v }));
  bindRange('dmOpacity', 'dmOpacityVal', '%', (v) => updateDanmakuConfig({ opacity: v }));
  bindRange('dmArea', 'dmAreaVal', '%', (v) => updateDanmakuConfig({ area: v }));
  bindSelect('dmMode', (v) => updateDanmakuConfig({ mode: v }));
  bindToggle('dmFilterEnable', (v) => updateDanmakuConfig({ enableFilter: v }));

  // 弹幕关键词保存（失焦时）
  const dmKeywords = document.getElementById('dmKeywords');
  if (dmKeywords) {
    dmKeywords.addEventListener('blur', () => {
      const keywords = dmKeywords.value.split('\n').map(k => k.trim()).filter(Boolean);
      updateDanmakuConfig({ blockedKeywords: keywords });
    });
  }

  // 性能配置
  bindToggle('idleThrottle', (v) => updatePerfConfig({ idleThrottle: v }));
  bindNumber('idleTimeout', (v) => updatePerfConfig({ idleTimeout: v }));
  bindToggle('lazyLoad', (v) => updatePerfConfig({ lazyLoad: v }));
  bindToggle('disablePreload', (v) => updatePerfConfig({ disablePreload: v }));
  bindToggle('disableAutoplay', (v) => updatePerfConfig({ disableAutoplay: v }));
  bindToggle('domCleanup', (v) => updatePerfConfig({ domCleanup: v }));
  bindToggle('lightweightThumb', (v) => updatePerfConfig({ lightweightThumb: v }));

  // 滤镜
  bindRange('brightness', 'brightnessVal', '%', (v) => updateFilterConfig({ brightness: v }));
  bindRange('contrast', 'contrastVal', '%', (v) => updateFilterConfig({ contrast: v }));
  bindRange('saturate', 'saturateVal', '%', (v) => updateFilterConfig({ saturate: v }));
  bindToggle('denoise', (v) => updateFilterConfig({ denoise: v }));

  // 浏览配置
  bindToggle('commentEnhance', (v) => updateBrowseConfig({ commentEnhance: v }));
  bindToggle('multiPartOptimize', (v) => updateBrowseConfig({ multiPartOptimize: v }));
  bindToggle('timestampCopy', (v) => updateBrowseConfig({ timestampCopy: v }));
  bindToggle('videoInfo', (v) => updateBrowseConfig({ videoInfo: v }));

  // UP主屏蔽
  const blockedUPs = document.getElementById('blockedUPs');
  if (blockedUPs) {
    blockedUPs.addEventListener('blur', () => {
      const ups = blockedUPs.value.split('\n').map(u => u.trim()).filter(Boolean);
      saveConfig({ blockedUPs: ups });
    });
  }

  // 导入导出按钮
  bindClick('dmExport', () => sendMsg('EXPORT_DATA', { type: 'blockedKeywords' }));
  bindClick('dmImport', () => triggerImport('blockedKeywords'));
  bindClick('upExport', () => sendMsg('EXPORT_DATA', { type: 'blockedUPs' }));
  bindClick('upImport', () => triggerImport('blockedUPs'));
  bindClick('exportAll', () => sendMsg('EXPORT_DATA', { type: 'all' }));
  bindClick('importAll', () => triggerImport('all'));
  bindClick('resetAll', () => resetAll());
}

// ===== 配置更新辅助函数 =====

async function updatePlayerConfig(partial) {
  const res = await sendMsg('GET_CONFIG', ['playerConfig']);
  const current = (res && res.success && res.data.playerConfig) || {};
  await saveConfig({ playerConfig: { ...current, ...partial } });
}

async function updateVipConfig(partial) {
  const res = await sendMsg('GET_CONFIG', ['vipConfig']);
  const current = (res && res.success && res.data.vipConfig) || {};
  await saveConfig({ vipConfig: { ...current, ...partial } });
}

async function updatePurifyConfig(partial) {
  const res = await sendMsg('GET_CONFIG', ['purifyConfig']);
  const current = (res && res.success && res.data.purifyConfig) || {};
  await saveConfig({ purifyConfig: { ...current, ...partial } });
}

async function updateDanmakuConfig(partial) {
  const res = await sendMsg('GET_CONFIG', ['danmakuConfig']);
  const current = (res && res.success && res.data.danmakuConfig) || {};
  await saveConfig({ danmakuConfig: { ...current, ...partial } });
}

async function updatePerfConfig(partial) {
  const res = await sendMsg('GET_CONFIG', ['perfConfig']);
  const current = (res && res.success && res.data.perfConfig) || {};
  await saveConfig({ perfConfig: { ...current, ...partial } });
}

async function updateFilterConfig(partial) {
  const res = await sendMsg('GET_CONFIG', ['filterConfig']);
  const current = (res && res.success && res.data.filterConfig) || {};
  await saveConfig({ filterConfig: { ...current, ...partial } });
}

async function updateBrowseConfig(partial) {
  const res = await sendMsg('GET_CONFIG', ['browseConfig']);
  const current = (res && res.success && res.data.browseConfig) || {};
  await saveConfig({ browseConfig: { ...current, ...partial } });
}

async function updateQualityPrefs(key, value) {
  const res = await sendMsg('GET_CONFIG', ['qualityPrefs']);
  const current = (res && res.success && res.data.qualityPrefs) || {};
  current[key] = value;
  await saveConfig({ qualityPrefs: current });
}

async function saveConfig(data) {
  await sendMsg('SET_CONFIG', data);
}

// ===== 导入功能 =====
function triggerImport(type) {
  const fileInput = document.getElementById('fileInput');
  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      if (type === 'blockedKeywords') {
        const keywords = jsonData.blockedKeywords || [];
        document.getElementById('dmKeywords').value = keywords.join('\n');
        await updateDanmakuConfig({ blockedKeywords: keywords });
      } else if (type === 'blockedUPs') {
        const ups = jsonData.blockedUPs || [];
        document.getElementById('blockedUPs').value = ups.join('\n');
        await saveConfig({ blockedUPs: ups });
      } else {
        await sendMsg('IMPORT_DATA', { importData: jsonData });
        await loadConfig();
      }
      showToast('导入成功');
    } catch (err) {
      showToast('导入失败: 文件格式错误');
    }
    fileInput.value = '';
  };
  fileInput.click();
}

// 重置所有设置
async function resetAll() {
  if (!confirm('确定要重置所有设置吗？此操作不可撤销。')) return;
  try {
    await chrome.storage.local.clear();
  } catch (e) { /* ignore */ }
  // 重新加载扩展触发初始化
  chrome.runtime.reload();
}

// ===== UI辅助函数 =====

function setChecked(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = !!value;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function setRange(id, value, labelId, suffix) {
  const el = document.getElementById(id);
  if (el) el.value = value;
  const label = document.getElementById(labelId);
  if (label) label.textContent = value + suffix;
}

function bindToggle(id, callback) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => callback(el.checked));
}

function bindNumber(id, callback) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => callback(parseInt(el.value) || 0));
}

function bindSelect(id, callback) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', () => callback(el.value));
}

function bindRange(id, labelId, suffix, callback) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    const label = document.getElementById(labelId);
    if (label) label.textContent = el.value + suffix;
  });
  el.addEventListener('change', () => callback(parseInt(el.value)));
}

function bindClick(id, callback) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', callback);
}

// 消息发送
function sendMsg(type, data) {
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

// 简易提示
function showToast(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:6px 14px;border-radius:4px;font-size:12px;z-index:9999;';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}
