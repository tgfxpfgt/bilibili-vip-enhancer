/**
 * B站大会员增强助手 - Popup 弹窗逻辑
 * 功能：设置读写、Tab 切换、VIP 状态展示、数据导入导出
 */

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  await loadConfig();
  await loadVipStatus();
  bindEvents();
});

// ==================== Tab 切换 ====================

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

// ==================== 加载配置到 UI ====================

async function loadConfig() {
  const data = await sendMsg(MSG.GET_CONFIG, null);
  if (!data || !data.success) return;
  const config = data.data;

  loadPlayerConfig(config);
  loadQualityPrefs(config);
  loadVipConfig(config);
  loadPurifyConfig(config);
  loadDanmakuConfig(config);
  loadPerfConfig(config);
  loadFilterConfig(config);
  loadBrowseConfig(config);

  if (config.blockedUPs) {
    setValue('blockedUPs', config.blockedUPs.join('\n'));
  }
}

function loadPlayerConfig(config) {
  if (!config.playerConfig) return;
  const c = config.playerConfig;
  setChecked('autoQuality', c.autoQuality);
  setChecked('autoHDR', c.autoHDR);
  setChecked('autoHQAudio', c.autoHQAudio);
  setChecked('shortcuts', c.shortcuts);
  setChecked('rememberProgress', c.rememberProgress);
  setChecked('rememberRate', c.rememberRate);
  setChecked('disableAutoNext', c.disableAutoNext);
  setChecked('pauseOnHidden', c.pauseOnHidden);
  setChecked('volumeBoost', c.volumeBoost);
  setChecked('fullscreenHideUI', c.fullscreenHideUI);
  setValue('timerStop', c.timerStop || 0);
}

function loadQualityPrefs(config) {
  if (!config.qualityPrefs) return;
  setValue('qualityBangumi', config.qualityPrefs.bangumi || '127');
  setValue('qualityNormal', config.qualityPrefs.normal || '116');
}

function loadVipConfig(config) {
  if (!config.vipConfig) return;
  const c = config.vipConfig;
  setChecked('hideVipDialogs', c.hideVipDialogs);
  setChecked('autoSkipGuide', c.autoSkipGuide);
  setChecked('vipBadge', c.vipBadge);
  setChecked('autoDanmaku', c.autoDanmaku);
}

function loadPurifyConfig(config) {
  if (!config.purifyConfig) return;
  const c = config.purifyConfig;
  setChecked('hideAds', c.hideAds);
  setChecked('hideBanner', c.hideBanner);
  setChecked('wideScreen', c.wideScreen);
  setChecked('simplifyLayout', c.simplifyLayout);
  setChecked('hideLiveEffects', c.hideLiveEffects);
  setChecked('hideVipPromo', c.hideVipPromo);
}

function loadDanmakuConfig(config) {
  if (!config.danmakuConfig) return;
  const c = config.danmakuConfig;
  setRange('dmFontSize', c.fontSize || 25, 'dmFontSizeVal', 'px');
  setRange('dmOpacity', c.opacity || 100, 'dmOpacityVal', '%');
  setRange('dmArea', c.area || 100, 'dmAreaVal', '%');
  setValue('dmMode', c.mode || 'all');
  setChecked('dmFilterEnable', c.enableFilter);
  setValue('dmKeywords', (c.blockedKeywords || []).join('\n'));
}

function loadPerfConfig(config) {
  if (!config.perfConfig) return;
  const c = config.perfConfig;
  setChecked('idleThrottle', c.idleThrottle);
  setValue('idleTimeout', c.idleTimeout || 180);
  setChecked('lazyLoad', c.lazyLoad);
  setChecked('disablePreload', c.disablePreload);
  setChecked('disableAutoplay', c.disableAutoplay);
  setChecked('domCleanup', c.domCleanup);
  setChecked('lightweightThumb', c.lightweightThumb);
}

function loadFilterConfig(config) {
  if (!config.filterConfig) return;
  const c = config.filterConfig;
  setRange('brightness', c.brightness || 100, 'brightnessVal', '%');
  setRange('contrast', c.contrast || 100, 'contrastVal', '%');
  setRange('saturate', c.saturate || 100, 'saturateVal', '%');
  setChecked('denoise', c.denoise);
}

function loadBrowseConfig(config) {
  if (!config.browseConfig) return;
  const c = config.browseConfig;
  setChecked('commentEnhance', c.commentEnhance);
  setChecked('multiPartOptimize', c.multiPartOptimize);
  setChecked('timestampCopy', c.timestampCopy);
  setChecked('videoInfo', c.videoInfo);
  setValue('titleFilters', (c.titleFilters || []).join('\n'));
}

// ==================== VIP 状态展示 ====================

async function loadVipStatus() {
  const res = await sendMsg(MSG.GET_VIP_INFO);
  const statusEl = document.getElementById('vipStatus');
  const stateEl = document.getElementById('vipState');
  const expireEl = document.getElementById('vipExpire');
  const typeEl = document.getElementById('vipType');

  if (res && res.success && res.data) {
    const vip = res.data;
    const isVip = vip.status === 1 && vip.type === 2;
    statusEl.textContent = isVip ? '大会员 \u2713' : '非大会员';
    statusEl.classList.toggle('active', isVip);
    stateEl.textContent = isVip ? '生效中' : '未开通';
    expireEl.textContent = vip.expireTime || '--';
    typeEl.textContent = vip.label || (vip.type === 2 ? '年度大会员' : vip.type === 1 ? '月度会员' : '无');
  } else {
    statusEl.textContent = '未登录';
    stateEl.textContent = '请先登录B站';
  }
}

// ==================== 事件绑定 ====================

function bindEvents() {
  bindPlayerEvents();
  bindQualityEvents();
  bindVipEvents();
  bindPurifyEvents();
  bindDanmakuEvents();
  bindPerfEvents();
  bindFilterEvents();
  bindBrowseEvents();
  bindDataEvents();
}

function bindPlayerEvents() {
  bindToggle('autoQuality', (v) => updateConfig('playerConfig', { autoQuality: v }));
  bindToggle('autoHDR', (v) => updateConfig('playerConfig', { autoHDR: v }));
  bindToggle('autoHQAudio', (v) => updateConfig('playerConfig', { autoHQAudio: v }));
  bindToggle('shortcuts', (v) => updateConfig('playerConfig', { shortcuts: v }));
  bindToggle('rememberProgress', (v) => updateConfig('playerConfig', { rememberProgress: v }));
  bindToggle('rememberRate', (v) => updateConfig('playerConfig', { rememberRate: v }));
  bindToggle('disableAutoNext', (v) => updateConfig('playerConfig', { disableAutoNext: v }));
  bindToggle('pauseOnHidden', (v) => updateConfig('playerConfig', { pauseOnHidden: v }));
  bindToggle('volumeBoost', (v) => updateConfig('playerConfig', { volumeBoost: v }));
  bindToggle('fullscreenHideUI', (v) => updateConfig('playerConfig', { fullscreenHideUI: v }));
  bindNumber('timerStop', (v) => updateConfig('playerConfig', { timerStop: v }));
}

function bindQualityEvents() {
  bindSelect('qualityBangumi', (v) => updateConfig('qualityPrefs', { bangumi: v }));
  bindSelect('qualityNormal', (v) => updateConfig('qualityPrefs', { normal: v }));
}

function bindVipEvents() {
  bindToggle('hideVipDialogs', (v) => updateConfig('vipConfig', { hideVipDialogs: v }));
  bindToggle('autoSkipGuide', (v) => updateConfig('vipConfig', { autoSkipGuide: v }));
  bindToggle('vipBadge', (v) => updateConfig('vipConfig', { vipBadge: v }));
  bindToggle('autoDanmaku', (v) => updateConfig('vipConfig', { autoDanmaku: v }));
}

function bindPurifyEvents() {
  bindToggle('hideAds', (v) => updateConfig('purifyConfig', { hideAds: v }));
  bindToggle('hideBanner', (v) => updateConfig('purifyConfig', { hideBanner: v }));
  bindToggle('wideScreen', (v) => updateConfig('purifyConfig', { wideScreen: v }));
  bindToggle('simplifyLayout', (v) => updateConfig('purifyConfig', { simplifyLayout: v }));
  bindToggle('hideLiveEffects', (v) => updateConfig('purifyConfig', { hideLiveEffects: v }));
  bindToggle('hideVipPromo', (v) => updateConfig('purifyConfig', { hideVipPromo: v }));
}

function bindDanmakuEvents() {
  bindRange('dmFontSize', 'dmFontSizeVal', 'px', (v) => updateConfig('danmakuConfig', { fontSize: v }));
  bindRange('dmOpacity', 'dmOpacityVal', '%', (v) => updateConfig('danmakuConfig', { opacity: v }));
  bindRange('dmArea', 'dmAreaVal', '%', (v) => updateConfig('danmakuConfig', { area: v }));
  bindSelect('dmMode', (v) => updateConfig('danmakuConfig', { mode: v }));
  bindToggle('dmFilterEnable', (v) => updateConfig('danmakuConfig', { enableFilter: v }));

  const dmKeywords = document.getElementById('dmKeywords');
  if (dmKeywords) {
    dmKeywords.addEventListener('blur', () => {
      const keywords = dmKeywords.value.split('\n').map(k => k.trim()).filter(Boolean);
      updateConfig('danmakuConfig', { blockedKeywords: keywords });
    });
  }
}

function bindPerfEvents() {
  bindToggle('idleThrottle', (v) => updateConfig('perfConfig', { idleThrottle: v }));
  bindNumber('idleTimeout', (v) => updateConfig('perfConfig', { idleTimeout: v }));
  bindToggle('lazyLoad', (v) => updateConfig('perfConfig', { lazyLoad: v }));
  bindToggle('disablePreload', (v) => updateConfig('perfConfig', { disablePreload: v }));
  bindToggle('disableAutoplay', (v) => updateConfig('perfConfig', { disableAutoplay: v }));
  bindToggle('domCleanup', (v) => updateConfig('perfConfig', { domCleanup: v }));
  bindToggle('lightweightThumb', (v) => updateConfig('perfConfig', { lightweightThumb: v }));
}

function bindFilterEvents() {
  bindRange('brightness', 'brightnessVal', '%', (v) => updateConfig('filterConfig', { brightness: v }));
  bindRange('contrast', 'contrastVal', '%', (v) => updateConfig('filterConfig', { contrast: v }));
  bindRange('saturate', 'saturateVal', '%', (v) => updateConfig('filterConfig', { saturate: v }));
  bindToggle('denoise', (v) => updateConfig('filterConfig', { denoise: v }));
}

function bindBrowseEvents() {
  bindToggle('commentEnhance', (v) => updateConfig('browseConfig', { commentEnhance: v }));
  bindToggle('multiPartOptimize', (v) => updateConfig('browseConfig', { multiPartOptimize: v }));
  bindToggle('timestampCopy', (v) => updateConfig('browseConfig', { timestampCopy: v }));
  bindToggle('videoInfo', (v) => updateConfig('browseConfig', { videoInfo: v }));

  const blockedUPs = document.getElementById('blockedUPs');
  if (blockedUPs) {
    blockedUPs.addEventListener('blur', () => {
      const ups = blockedUPs.value.split('\n').map(u => u.trim()).filter(Boolean);
      saveConfig({ blockedUPs: ups });
    });
  }

  const titleFilters = document.getElementById('titleFilters');
  if (titleFilters) {
    titleFilters.addEventListener('blur', () => {
      const kws = titleFilters.value.split('\n').map(k => k.trim()).filter(Boolean);
      updateConfig('browseConfig', { titleFilters: kws });
    });
  }
}

function bindDataEvents() {
  bindClick('dmExport', () => sendMsg(MSG.EXPORT_DATA, { type: 'blockedKeywords' }));
  bindClick('dmImport', () => triggerImport('blockedKeywords'));
  bindClick('upExport', () => sendMsg(MSG.EXPORT_DATA, { type: 'blockedUPs' }));
  bindClick('upImport', () => triggerImport('blockedUPs'));
  bindClick('exportAll', () => sendMsg(MSG.EXPORT_DATA, { type: 'all' }));
  bindClick('importAll', () => triggerImport('all'));
  bindClick('resetAll', () => resetAll());
}

// ==================== 配置更新（通用函数替代 7 个同构函数） ====================

/**
 * 通用配置更新：读取当前配置 -> 合并部分更新 -> 保存
 * 替代原来的 updatePlayerConfig / updateVipConfig / updatePurifyConfig 等 7 个函数
 */
async function updateConfig(key, partial) {
  const res = await sendMsg(MSG.GET_CONFIG, [key]);
  const current = (res && res.success && res.data[key]) || {};
  await saveConfig({ [key]: { ...current, ...partial } });
}

async function saveConfig(data) {
  await sendMsg(MSG.SET_CONFIG, data);
}

// ==================== 导入功能 ====================

function triggerImport(type) {
  const fileInput = document.getElementById('fileInput');
  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 文件大小检查
    if (file.size > LIMITS.MAX_IMPORT_FILE_SIZE) {
      showToast('文件过大，请选择小于 10MB 的文件');
      fileInput.value = '';
      return;
    }

    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);

      if (type === 'blockedKeywords') {
        const keywords = jsonData.blockedKeywords || [];
        document.getElementById('dmKeywords').value = keywords.join('\n');
        await updateConfig('danmakuConfig', { blockedKeywords: keywords });
      } else if (type === 'blockedUPs') {
        const ups = jsonData.blockedUPs || [];
        document.getElementById('blockedUPs').value = ups.join('\n');
        await saveConfig({ blockedUPs: ups });
      } else {
        const res = await sendMsg(MSG.IMPORT_DATA, { importData: jsonData });
        if (res && res.success) {
          showToast(`导入成功（${res.data.importedCount} 项）`);
          await loadConfig();
        } else {
          showToast('导入失败: ' + (res ? res.error : '未知错误'));
        }
        fileInput.value = '';
        return;
      }
      showToast('导入成功');
    } catch (err) {
      showToast('导入失败: 文件格式错误');
    }
    fileInput.value = '';
  };
  fileInput.click();
}

// ==================== 重置所有设置 ====================

async function resetAll() {
  if (!confirm('确定要重置所有设置吗？此操作不可撤销。')) return;
  try {
    await chrome.storage.local.clear();
    // 重新写入默认配置（修复原版 reload 后配置为空的 bug）
    await chrome.storage.local.set({ ...DEFAULT_CONFIG, _initialized: true });
    showToast('已重置所有设置，正在刷新...');
    setTimeout(() => chrome.runtime.reload(), 500);
  } catch (e) {
    showToast('重置失败: ' + e.message);
  }
}

// ==================== UI 辅助函数 ====================

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

// ==================== 消息发送 ====================

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

// ==================== 简易提示 ====================

function showToast(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:6px 14px;border-radius:4px;font-size:12px;z-index:9999;';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}
