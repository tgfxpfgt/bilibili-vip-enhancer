/**
 * B站大会员增强助手 - 共享常量
 * 单一数据源：消息类型、默认配置、选择器、时间常量、映射表
 *
 * 加载方式：
 * - Content scripts: manifest.json 中声明，排在 utils.js 之前
 * - Service worker:  importScripts('../constants.js')
 * - Popup:           <script src="../constants.js"></script>
 */

/** 消息类型（消除魔法字符串） */
const MSG = {
  GET_CONFIG:    'GET_CONFIG',
  SET_CONFIG:    'SET_CONFIG',
  CHECK_VIP:     'CHECK_VIP',
  GET_VIP_INFO:  'GET_VIP_INFO',
  SAVE_PROGRESS: 'SAVE_PROGRESS',
  GET_PROGRESS:  'GET_PROGRESS',
  SCREENSHOT:    'SCREENSHOT',
  EXPORT_DATA:   'EXPORT_DATA',
  IMPORT_DATA:   'IMPORT_DATA',
  CONFIG_UPDATED:'CONFIG_UPDATED',
  TAB_ACTIVATED: 'TAB_ACTIVATED'
};

/** 自定义事件名 */
const EVT = {
  CONFIG_UPDATE: 'bili-enhancer-config-update',
  TAB_ACTIVATED: 'bili-enhancer-tab-activated'
};

/** 视频元素选择器（按优先级降序） */
const VIDEO_SELECTORS = '.bpx-player-video-area video, #bilibili-player video, .player-wrap video';

/** 工具栏选择器（按优先级降序） */
const TOOLBAR_SELECTORS = '.video-toolbar-left, .video-toolbar, .video-info';

/** 播放器容器选择器 */
const PLAYER_CONTAINER_SELECTORS = '.bpx-player-container, #bilibili-player, .player-wrap';

/** 弹幕容器选择器 */
const DANMAKU_CONTAINER_SELECTORS = '.bpx-player-dm-wrap, .bilibili-player-video-danmaku, .bpx-player-video-area';

/** 默认配置（唯一数据源，service-worker 和各模块共享） */
const DEFAULT_CONFIG = {
  vipInfo: { status: 0, type: 0, expireTime: '', lastCheck: 0 },
  qualityPrefs: { bangumi: '127', movie: '127', normal: '116' },
  playerMemory: {},
  danmakuConfig: {
    fontSize: 25, opacity: 100, area: 100,
    blockedKeywords: [], mode: 'all', enableFilter: true
  },
  purifyConfig: {
    hideAds: true, hideBanner: true, wideScreen: true,
    hideLiveEffects: true, simplifyLayout: true, hideVipPromo: true
  },
  perfConfig: {
    idleThrottle: true, idleTimeout: 180, lazyLoad: true,
    disablePreload: true, disableAutoplay: true,
    domCleanup: true, lightweightThumb: true
  },
  filterConfig: {
    brightness: 100, contrast: 100, saturate: 100, denoise: false
  },
  playerConfig: {
    autoQuality: true, autoHDR: true, autoHighFPS: true, autoHQAudio: true,
    rememberProgress: true, rememberRate: true, disableAutoNext: false,
    pauseOnHidden: true, timerStop: 0, shortcuts: true,
    volumeBoost: true, fullscreenHideUI: true
  },
  browseConfig: {
    commentEnhance: true, multiPartOptimize: true,
    timestampCopy: true, videoInfo: true, upBlock: true
  },
  vipConfig: {
    autoSkipGuide: true, hideVipDialogs: true,
    vipBadge: true, autoDanmaku: true
  },
  blockedUPs: [],
  localTags: {},
  purchasedList: []
};

/** 画质 ID -> 名称映射（统一，消除重复定义） */
const QUALITY_MAP = {
  127: '8K 超高清', 126: '杜比视界', 125: 'HDR 真彩', 120: '4K 超清',
  116: '1080P 60帧', 112: '1080P 高码率', 80: '1080P 高清',
  74: '720P 60帧', 64: '720P 高清', 48: '480P', 32: '360P',
  16: '240P', 6: '240P'
};

/** 音质 ID -> 名称映射 */
const AUDIO_QUALITY_MAP = {
  30251: 'Hi-Res 无损', 30250: '杜比全景声', 30280: '192K',
  30232: '132K', 30216: '64K', 30215: '64K'
};

/** 编码 ID -> 名称映射 */
const CODEC_MAP = {
  7: 'AVC/H.264', 12: 'HEVC/H.265', 13: 'AV1'
};

/** 时间常量（毫秒） */
const TIMING = {
  ELEMENT_TIMEOUT:        10000,  // waitForElement 默认超时
  VIDEO_ELEMENT_TIMEOUT:  15000,  // 等待视频元素超时
  VIDEO_FALLBACK_TIMEOUT: 5000,   // 降级等待超时
  VIP_CACHE_DURATION:     300000, // VIP 状态缓存 5 分钟
  VIP_CACHE_BG:           600000, // 后台 VIP 缓存 10 分钟
  PROGRESS_SAVE_INTERVAL: 5000,   // 进度保存间隔
  SPA_POLL_INTERVAL:      1000,   // SPA 路由轮询间隔
  SPA_REINIT_DELAY:       1500,   // 路由变化后重新初始化延迟
  IDLE_CHECK_INTERVAL:    10000,  // 闲置检查间隔
  DOM_CLEANUP_INTERVAL:   600000, // DOM 清理间隔（10 分钟）
  AUTOPLAY_POLL_INTERVAL: 5000,   // 自动播放轮询间隔
  UP_BLOCK_POLL_INTERVAL: 4000,   // UP 屏蔽轮询间隔
  PRELOAD_CHECK_INTERVAL: 8000,   // 预加载检查间隔
  TOAST_DURATION:         2000,   // Toast 显示时长
  QUALITY_SET_DELAY:      3000,   // 画质设置延迟
  BUTTON_INJECT_DELAY:    3000,   // 工具栏按钮注入延迟
  TAG_DISPLAY_DELAY:      2500,   // 标签显示延迟
  COMMENT_TOOL_DELAY:     4000,   // 评论工具注入延迟
  VIP_BADGE_DELAY:        3000,   // VIP 标记延迟
  ADVANCED_DM_DELAY:      4000,   // 高级弹幕注入延迟
  PAID_OVERLAY_DELAY:     2000,   // 付费遮挡检测延迟
  PREVIEW_SUPPRESS_DELAY: 2000,   // 预览抑制初始延迟
  LAZY_LOAD_DELAY:        1000,   // 懒加载初始处理延迟
  THUMB_LIGHTWEIGHT_DELAY:1500,   // 缩略图轻量化延迟
  UP_BLOCK_INITIAL_DELAY: 2000,   // UP 屏蔽初始延迟
  QUALITY_PANEL_DELAY:    500     // 画质面板展开延迟
};

/** 存储与功能限制 */
const LIMITS = {
  MAX_PLAYER_MEMORY:     500,             // 最多保存播放记忆条数
  MEMORY_EXPIRY_MS:      30 * 24 * 60 * 60 * 1000, // 播放记忆过期 30 天
  CLEANUP_ALARM_MIN:     1440,            // 清理定时器周期（分钟）
  SPAM_COMMENT_THRESHOLD:3,               // 刷屏评论阈值
  MAX_VOLUME_BOOST:      5,               // 最大音量增强倍数
  MIN_PLAYBACK_RATE:     0.25,            // 最小播放倍速
  MAX_PLAYBACK_RATE:     10,              // 最大播放倍速
  FRAME_STEP:            1 / 30,          // 逐帧步长（30fps）
  MAX_IMPORT_FILE_SIZE:  10 * 1024 * 1024,// 导入文件最大 10MB
  MAX_SCRIPT_SEARCH:     10               // 搜索 script 标签最大数量
};

/** 懒加载 rootMargin */
const LAZY_LOAD_ROOT_MARGIN = '200px';

/** 缩略图尺寸参数 */
const THUMB_SIZE_PARAM = '@160w_100h_1c.webp';

/** 降噪模糊值（统一，消除 PlayerEnhancer 与 VideoInfo 之间的竞态条件） */
const DENOISE_BLUR = '0.4px';

/** 允许导入的 storage 键白名单 */
const IMPORTABLE_KEYS = new Set([
  'vipInfo', 'qualityPrefs', 'playerMemory', 'danmakuConfig',
  'purifyConfig', 'perfConfig', 'filterConfig', 'playerConfig',
  'browseConfig', 'vipConfig', 'blockedUPs', 'localTags', 'purchasedList'
]);
