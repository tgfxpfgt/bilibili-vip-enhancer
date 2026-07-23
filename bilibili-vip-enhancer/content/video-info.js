/**
 * B站大会员增强助手 - 视频信息与滤镜模块
 * 功能：显示真实码率/分辨率/编码信息、画面滤镜控制、硬件解码检测
 */

const VideoInfo = {
  config: null,
  filterConfig: null,
  infoPanel: null,
  styleEl: null,

  async init() {
    this.config = await BiliEnhancer.storage.get('browseConfig');
    this.filterConfig = await BiliEnhancer.storage.get('filterConfig');
    if (!this.filterConfig) {
      this.filterConfig = { brightness: 100, contrast: 100, saturate: 100, denoise: false };
    }

    if (!BiliEnhancer.page.isVideoPage()) return;

    if (this.config && this.config.videoInfo) {
      this.setupVideoInfoPanel();
    }
    this.applyFilter();

    // 监听配置更新
    window.addEventListener('bili-enhancer-config-update', (e) => {
      if (e.detail && e.detail.filterConfig) {
        this.filterConfig = e.detail.filterConfig;
        this.applyFilter();
      }
    });
  },

  // 视频信息面板
  setupVideoInfoPanel() {
    setTimeout(() => {
      const playerArea = document.querySelector('.video-toolbar-left') ||
        document.querySelector('.video-toolbar') ||
        document.querySelector('.video-info');
      if (!playerArea || playerArea.querySelector('.bili-enhancer-info-btn')) return;

      const btn = BiliEnhancer.dom.createElement('button', {
        class: 'bili-enhancer-info-btn',
        title: '查看视频编码信息'
      }, {
        background: '#f0f0f0',
        color: '#333',
        border: '1px solid #ddd',
        borderRadius: '4px',
        padding: '4px 10px',
        fontSize: '12px',
        cursor: 'pointer',
        marginLeft: '8px'
      }, '视频信息');

      btn.addEventListener('click', () => this.toggleInfoPanel());
      playerArea.appendChild(btn);
    }, 3000);
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
      position: 'fixed',
      top: '60px',
      right: '20px',
      background: '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '16px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: '99999',
      fontSize: '13px',
      lineHeight: '1.8',
      minWidth: '280px',
      maxWidth: '360px'
    });

    const title = BiliEnhancer.dom.createElement('div', {}, {
      fontWeight: 'bold', fontSize: '14px', marginBottom: '8px',
      borderBottom: '1px solid #eee', paddingBottom: '6px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    });
    const titleText = BiliEnhancer.dom.createElement('span', {}, {}, '视频编码信息');
    title.appendChild(titleText);
    const closeBtn = BiliEnhancer.dom.createElement('span', {}, {
      cursor: 'pointer', color: '#999', fontSize: '18px'
    }, '×');
    closeBtn.addEventListener('click', () => {
      this.infoPanel.remove();
      this.infoPanel = null;
    });
    title.appendChild(closeBtn);
    this.infoPanel.appendChild(title);

    const content = BiliEnhancer.dom.createElement('div');
    this.buildInfoContent(content, info);
    this.infoPanel.appendChild(content);

    document.body.appendChild(this.infoPanel);
  },

  buildInfoContent(container, infoItems) {
    infoItems.forEach(item => {
      const row = BiliEnhancer.dom.createElement('div', {}, item.style || {});
      const label = BiliEnhancer.dom.createElement('b', {}, {}, item.label + ': ');
      row.appendChild(label);
      const value = BiliEnhancer.dom.createElement('span', {}, {}, item.value);
      row.appendChild(value);
      container.appendChild(row);
    });
  },

  collectVideoInfo() {
    const video = BiliEnhancer.getVideoElement();
    const playInfo = BiliEnhancer.getPlayInfo();
    const items = [];

    // 基本分辨率信息
    if (video) {
      items.push({ label: '分辨率', value: `${video.videoWidth} × ${video.videoHeight}` });
      items.push({ label: '当前时间', value: `${BiliEnhancer.formatTime(video.currentTime)} / ${BiliEnhancer.formatTime(video.duration || 0)}` });
      items.push({ label: '缓冲进度', value: video.buffered.length > 0 ? BiliEnhancer.formatTime(video.buffered.end(video.buffered.length - 1)) : '0:00' });
    }

    // 从playinfo获取详细编码信息
    if (playInfo && playInfo.data) {
      const data = playInfo.data;
      if (data.dash) {
        const dash = data.dash;
        // 视频流信息
        if (dash.video && dash.video.length > 0) {
          const v = dash.video[0];
          items.push({ label: '--- 视频流 ---', value: '', style: { marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '6px' } });
          items.push({ label: '编码格式', value: this.getCodecName(v.codecid || v.codecs) });
          items.push({ label: '码率', value: v.bandwidth ? (v.bandwidth / 1000).toFixed(0) + ' kbps' : '未知' });
          items.push({ label: '分辨率', value: `${v.width || '?'} × ${v.height || '?'}` });
          items.push({ label: '帧率', value: String(v.frameRate || v.frame_rate || '未知') });
          if (v.quality) {
            items.push({ label: '画质ID', value: `${v.quality} (${this.getQualityName(v.quality)})` });
          }
        }
        // 音频流信息
        if (dash.audio && dash.audio.length > 0) {
          const a = dash.audio[0];
          items.push({ label: '--- 音频流 ---', value: '', style: { marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '6px' } });
          items.push({ label: '编码格式', value: this.getCodecName(a.codecid || a.codecs) });
          items.push({ label: '码率', value: a.bandwidth ? (a.bandwidth / 1000).toFixed(0) + ' kbps' : '未知' });
          if (a.id) {
            items.push({ label: '音质ID', value: `${a.id} (${this.getAudioQualityName(a.id)})` });
          }
        }
        // 杜比音频
        if (dash.dolby && dash.dolby.audio && dash.dolby.audio.length > 0) {
          items.push({ label: '杜比音频', value: '可用 ✓' });
        }
        // FLAC无损
        if (dash.flac && dash.flac.audio) {
          items.push({ label: 'FLAC无损', value: '可用 ✓' });
        }
      }
      // 支持的画质列表
      if (data.accept_quality) {
        items.push({ label: '可用画质', value: data.accept_quality.map(q => this.getQualityName(q)).join(', '), style: { marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '6px' } });
      }
    } else {
      items.push({ label: '提示', value: '详细编码信息需要视频加载后获取', style: { color: '#999', marginTop: '8px' } });
    }

    // 硬件解码检测
    if (video && video.getVideoPlaybackQuality) {
      const quality = video.getVideoPlaybackQuality();
      items.push({ label: '--- 解码状态 ---', value: '', style: { marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '6px' } });
      items.push({ label: '总帧数', value: String(quality.totalVideoFrames) });
      items.push({ label: '丢帧数', value: String(quality.droppedVideoFrames) });
      items.push({ label: '丢帧率', value: `${quality.totalVideoFrames > 0 ? ((quality.droppedVideoFrames / quality.totalVideoFrames) * 100).toFixed(2) : 0}%` });
      const hwStatus = quality.droppedVideoFrames / (quality.totalVideoFrames || 1) < 0.01 ? '良好（可能硬件解码）' : '有丢帧';
      items.push({ label: '解码状态', value: hwStatus });
    }

    return items.length > 0 ? items : [{ label: '提示', value: '暂无视频信息' }];
  },

  getCodecName(id) {
    const codecs = {
      7: 'AVC/H.264', 12: 'HEVC/H.265', 13: 'AV1',
      'avc1': 'AVC/H.264', 'hev1': 'HEVC/H.265', 'av01': 'AV1'
    };
    if (typeof id === 'string') {
      if (id.includes('avc')) return 'AVC/H.264';
      if (id.includes('hev') || id.includes('hvc')) return 'HEVC/H.265';
      if (id.includes('av01') || id.includes('av1')) return 'AV1';
      return id;
    }
    return codecs[id] || `未知(${id})`;
  },

  getQualityName(id) {
    const qualities = {
      127: '8K', 126: '杜比视界', 125: 'HDR 真彩', 120: '4K 超清',
      116: '1080P 60帧', 112: '1080P 高码率', 80: '1080P 高清',
      74: '720P 60帧', 64: '720P 高清', 48: '480P', 32: '360P',
      16: '240P', 6: '240P'
    };
    return qualities[id] || `画质${id}`;
  },

  getAudioQualityName(id) {
    const qualities = {
      30251: 'Hi-Res 无损', 30250: '杜比全景声', 30280: '192K',
      30232: '132K', 30216: '64K', 30215: '64K'
    };
    return qualities[id] || `音质${id}`;
  },

  // 应用画面滤镜
  applyFilter() {
    const video = BiliEnhancer.getVideoElement();
    if (!video) {
      // 等待video出现
      setTimeout(() => {
        const v = BiliEnhancer.getVideoElement();
        if (v) this.applyFilterToVideo(v);
      }, 3000);
      return;
    }
    this.applyFilterToVideo(video);
  },

  applyFilterToVideo(video) {
    const { brightness, contrast, saturate, denoise } = this.filterConfig;
    // 如果都是默认值则不应用
    if (brightness === 100 && contrast === 100 && saturate === 100 && !denoise) {
      video.style.filter = '';
      return;
    }
    let filter = '';
    if (brightness !== 100) filter += `brightness(${brightness / 100}) `;
    if (contrast !== 100) filter += `contrast(${contrast / 100}) `;
    if (saturate !== 100) filter += `saturate(${saturate / 100}) `;
    if (denoise) filter += 'blur(0.3px) ';
    video.style.filter = filter.trim();
  },

  destroy() {
    if (this.infoPanel) {
      this.infoPanel.remove();
      this.infoPanel = null;
    }
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
  }
};
