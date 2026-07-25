/**
 * B站大会员增强助手 - 视频信息与滤镜模块
 * 功能：显示真实码率/分辨率/编码信息、画面滤镜（委托给 BiliEnhancer.applyFilter）
 */

const VideoInfo = {
  config: null,
  filterConfig: null,
  infoPanel: null,
  _events: null,
  _timers: null,

  async init() {
    this._events = BiliEnhancer.createEventManager();
    this._timers = BiliEnhancer.createTimerManager();

    this.config = await BiliEnhancer.storage.get('browseConfig') || DEFAULT_CONFIG.browseConfig;
    this.filterConfig = await BiliEnhancer.storage.get('filterConfig') || DEFAULT_CONFIG.filterConfig;

    if (!BiliEnhancer.page.isVideoPage()) return;

    if (this.config && this.config.videoInfo) {
      this.setupVideoInfoPanel();
    }

    // 应用滤镜（委托给统一方法，消除竞态条件）
    this.applyFilter();

    // 监听配置更新 — 滤镜由 PlayerEnhancer 统一应用，这里仅更新本地缓存
    this._events.on(window, EVT.CONFIG_UPDATE, (e) => {
      if (e.detail && e.detail.filterConfig) {
        this.filterConfig = e.detail.filterConfig;
        this.applyFilter();
      }
    });
  },

  // ==================== 视频信息面板 ====================

  setupVideoInfoPanel() {
    this._timers.timeout(() => {
      const playerArea = BiliEnhancer.dom.queryFirst(TOOLBAR_SELECTORS);
      if (!playerArea || playerArea.querySelector('.bili-enhancer-info-btn')) return;

      const btn = BiliEnhancer.dom.createElement('button', {
        class: 'bili-enhancer-info-btn',
        title: '查看视频编码信息'
      }, {
        background: '#f0f0f0', color: '#333', border: '1px solid #ddd',
        borderRadius: '4px', padding: '4px 10px', fontSize: '12px',
        cursor: 'pointer', marginLeft: '8px'
      }, '视频信息');

      this._events.on(btn, 'click', () => this.toggleInfoPanel());
      playerArea.appendChild(btn);
    }, TIMING.BUTTON_INJECT_DELAY);
  },

  toggleInfoPanel() {
    if (this.infoPanel) {
      this.infoPanel.remove();
      this.infoPanel = null;
      return;
    }

    const info = this.collectVideoInfo();
    this.infoPanel = BiliEnhancer.dom.createElement('div', {
      class: 'bili-enhancer-info-panel'
    }, {
      position: 'fixed', top: '60px', right: '20px',
      background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px',
      padding: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: '99999', fontSize: '13px', lineHeight: '1.8',
      minWidth: '280px', maxWidth: '360px'
    });

    const title = BiliEnhancer.dom.createElement('div', {}, {
      fontWeight: 'bold', fontSize: '14px', marginBottom: '8px',
      borderBottom: '1px solid #eee', paddingBottom: '6px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    });
    title.appendChild(BiliEnhancer.dom.createElement('span', {}, {}, '视频编码信息'));

    const closeBtn = BiliEnhancer.dom.createElement('span', {}, {
      cursor: 'pointer', color: '#999', fontSize: '18px'
    }, '\u00d7');
    this._events.on(closeBtn, 'click', () => {
      this.infoPanel.remove();
      this.infoPanel = null;
    });
    title.appendChild(closeBtn);
    this.infoPanel.appendChild(title);

    const content = BiliEnhancer.dom.createElement('div');
    this.buildInfoRows(content, info);
    this.infoPanel.appendChild(content);

    document.body.appendChild(this.infoPanel);
  },

  buildInfoRows(container, infoItems) {
    infoItems.forEach(item => {
      const row = BiliEnhancer.dom.createElement('div', {}, item.style || {});
      row.appendChild(BiliEnhancer.dom.createElement('b', {}, {}, item.label + ': '));
      row.appendChild(BiliEnhancer.dom.createElement('span', {}, {}, item.value));
      container.appendChild(row);
    });
  },

  collectVideoInfo() {
    const video = BiliEnhancer.getVideoElement();
    const playInfo = BiliEnhancer.getPlayInfo();
    const items = [];

    if (video) {
      items.push({ label: '分辨率', value: `${video.videoWidth} \u00d7 ${video.videoHeight}` });
      items.push({ label: '当前时间', value: `${BiliEnhancer.formatTime(video.currentTime)} / ${BiliEnhancer.formatTime(video.duration || 0)}` });
      items.push({ label: '缓冲进度', value: video.buffered.length > 0 ? BiliEnhancer.formatTime(video.buffered.end(video.buffered.length - 1)) : '0:00' });
    }

    if (playInfo && playInfo.data && playInfo.data.dash) {
      const dash = playInfo.data.dash;
      const sectionStyle = { marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '6px' };

      // 视频流
      if (dash.video && dash.video.length > 0) {
        const v = dash.video[0];
        items.push({ label: '--- 视频流 ---', value: '', style: sectionStyle });
        items.push({ label: '编码格式', value: this.getCodecName(v.codecid || v.codecs) });
        items.push({ label: '码率', value: v.bandwidth ? (v.bandwidth / 1000).toFixed(0) + ' kbps' : '未知' });
        items.push({ label: '分辨率', value: `${v.width || '?'} \u00d7 ${v.height || '?'}` });
        items.push({ label: '帧率', value: String(v.frameRate || v.frame_rate || '未知') });
        if (v.quality) {
          items.push({ label: '画质ID', value: `${v.quality} (${QUALITY_MAP[v.quality] || '未知'})` });
        }
      }

      // 音频流
      if (dash.audio && dash.audio.length > 0) {
        const a = dash.audio[0];
        items.push({ label: '--- 音频流 ---', value: '', style: sectionStyle });
        items.push({ label: '编码格式', value: this.getCodecName(a.codecid || a.codecs) });
        items.push({ label: '码率', value: a.bandwidth ? (a.bandwidth / 1000).toFixed(0) + ' kbps' : '未知' });
        if (a.id) {
          items.push({ label: '音质ID', value: `${a.id} (${AUDIO_QUALITY_MAP[a.id] || '未知'})` });
        }
      }

      if (dash.dolby && dash.dolby.audio && dash.dolby.audio.length > 0) {
        items.push({ label: '杜比音频', value: '可用 \u2713' });
      }
      if (dash.flac && dash.flac.audio) {
        items.push({ label: 'FLAC无损', value: '可用 \u2713' });
      }

      // 可用画质列表
      if (playInfo.data.accept_quality) {
        items.push({
          label: '可用画质',
          value: playInfo.data.accept_quality.map(q => QUALITY_MAP[q] || ('画质' + q)).join(', '),
          style: sectionStyle
        });
      }
    } else {
      items.push({ label: '提示', value: '详细编码信息需要视频加载后获取', style: { color: '#999', marginTop: '8px' } });
    }

    // 丢帧检测
    if (video && video.getVideoPlaybackQuality) {
      const q = video.getVideoPlaybackQuality();
      const dropRate = q.totalVideoFrames > 0 ? ((q.droppedVideoFrames / q.totalVideoFrames) * 100).toFixed(2) : '0';
      items.push({ label: '--- 解码状态 ---', value: '', style: { marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '6px' } });
      items.push({ label: '总帧数', value: String(q.totalVideoFrames) });
      items.push({ label: '丢帧数', value: String(q.droppedVideoFrames) });
      items.push({ label: '丢帧率', value: `${dropRate}%` });
      const hwStatus = parseFloat(dropRate) < 0.01 ? '良好（可能硬件解码）' : '有丢帧';
      items.push({ label: '解码状态', value: hwStatus });
    }

    return items.length > 0 ? items : [{ label: '提示', value: '暂无视频信息' }];
  },

  getCodecName(id) {
    if (typeof id === 'string') {
      if (id.includes('avc')) return 'AVC/H.264';
      if (id.includes('hev') || id.includes('hvc')) return 'HEVC/H.265';
      if (id.includes('av01') || id.includes('av1')) return 'AV1';
      return id;
    }
    return CODEC_MAP[id] || `未知(${id})`;
  },

  // ==================== 滤镜（委托给统一方法） ====================

  applyFilter() {
    BiliEnhancer.applyFilter(this.filterConfig);
  },

  // ==================== 清理 ====================

  destroy() {
    this._events?.destroy();
    this._timers?.destroy();
    if (this.infoPanel) { this.infoPanel.remove(); this.infoPanel = null; }
  }
};
