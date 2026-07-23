/**
 * B站大会员增强助手 - 本地标签收藏模块
 * 功能：给视频添加自定义本地标签、按标签筛选、不修改B站云端数据
 */

const LocalTags = {
  tags: {},

  async init() {
    this.tags = await BiliEnhancer.storage.get('localTags') || {};

    if (BiliEnhancer.page.isVideoPage()) {
      this.setupTagButton();
      this.showCurrentTags();
    }
  },

  // 在视频页注入标签按钮
  setupTagButton() {
    setTimeout(() => {
      const toolbar = document.querySelector('.video-toolbar-left') ||
        document.querySelector('.video-toolbar') ||
        document.querySelector('.video-info');
      if (!toolbar || toolbar.querySelector('.bili-enhancer-tag-btn')) return;

      const btn = BiliEnhancer.dom.createElement('button', {
        class: 'bili-enhancer-tag-btn',
        title: '添加本地标签'
      }, {
        background: '#f0f0f0',
        color: '#333',
        border: '1px solid #ddd',
        borderRadius: '4px',
        padding: '4px 10px',
        fontSize: '12px',
        cursor: 'pointer',
        marginLeft: '8px'
      }, '+ 标签');

      btn.addEventListener('click', () => this.showTagDialog());
      toolbar.appendChild(btn);
    }, 3000);
  },

  // 显示当前视频的标签
  showCurrentTags() {
    const videoId = BiliEnhancer.page.getVideoId();
    if (!videoId) return;

    const videoTags = this.tags[videoId];
    if (!videoTags || videoTags.length === 0) return;

    setTimeout(() => {
      const titleArea = document.querySelector('.video-title') ||
        document.querySelector('h1') ||
        document.querySelector('[class*="video-title"]');
      if (!titleArea || titleArea.parentElement.querySelector('.bili-enhancer-tags')) return;

      const tagWrap = BiliEnhancer.dom.createElement('div', {
        class: 'bili-enhancer-tags'
      }, {
        display: 'flex',
        gap: '4px',
        flexWrap: 'wrap',
        marginTop: '6px'
      });

      videoTags.forEach(tag => {
        const tagEl = BiliEnhancer.dom.createElement('span', {}, {
          background: '#e8f4fd',
          color: '#1890ff',
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '11px',
          cursor: 'pointer'
        }, tag);
        tagEl.title = '点击删除标签';
        tagEl.addEventListener('click', () => this.removeTag(videoId, tag));
        tagWrap.appendChild(tagEl);
      });

      titleArea.parentElement.appendChild(tagWrap);
    }, 2500);
  },

  // 显示标签输入对话框
  showTagDialog() {
    const existing = document.querySelector('.bili-enhancer-tag-dialog');
    if (existing) existing.remove();

    const videoId = BiliEnhancer.page.getVideoId();
    if (!videoId) {
      BiliEnhancer.showToast('无法获取视频ID');
      return;
    }

    const dialog = BiliEnhancer.dom.createElement('div', {
      class: 'bili-enhancer-tag-dialog'
    }, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: '#fff',
      borderRadius: '10px',
      padding: '20px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      zIndex: '999999',
      minWidth: '300px'
    });

    const title = BiliEnhancer.dom.createElement('div', {}, {
      fontSize: '15px', fontWeight: 'bold', marginBottom: '12px'
    }, '添加本地标签');

    const input = BiliEnhancer.dom.createElement('input', {
      type: 'text',
      placeholder: '输入标签名，回车添加（如：教程、音乐、待看）'
    }, {
      width: '100%',
      padding: '8px 12px',
      border: '1px solid #ddd',
      borderRadius: '6px',
      fontSize: '13px',
      outline: 'none',
      boxSizing: 'border-box'
    });

    const currentTags = this.tags[videoId] || [];
    const tagList = BiliEnhancer.dom.createElement('div', {}, {
      display: 'flex', gap: '4px', flexWrap: 'wrap',
      marginTop: '10px', minHeight: '24px'
    });

    const renderTags = () => {
      tagList.textContent = '';
      currentTags.forEach(tag => {
        const tagEl = BiliEnhancer.dom.createElement('span', {}, {
          background: '#e8f4fd', color: '#1890ff',
          padding: '2px 8px', borderRadius: '10px', fontSize: '12px',
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
        }, tag + ' ×');
        tagEl.addEventListener('click', () => {
          const idx = currentTags.indexOf(tag);
          if (idx >= 0) currentTags.splice(idx, 1);
          renderTags();
        });
        tagList.appendChild(tagEl);
      });
    };
    renderTags();

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        if (val && !currentTags.includes(val)) {
          currentTags.push(val);
          renderTags();
          input.value = '';
        }
      }
    });

    const btnWrap = BiliEnhancer.dom.createElement('div', {}, {
      display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end'
    });

    const saveBtn = BiliEnhancer.dom.createElement('button', {}, {
      background: '#fb7299', color: '#fff', border: 'none',
      borderRadius: '6px', padding: '6px 16px', fontSize: '13px', cursor: 'pointer'
    }, '保存');
    saveBtn.addEventListener('click', async () => {
      this.tags[videoId] = currentTags;
      await BiliEnhancer.storage.set({ localTags: this.tags });
      dialog.remove();
      mask.remove();
      BiliEnhancer.showToast('标签已保存');
      // 刷新页面标签显示
      const oldTags = document.querySelector('.bili-enhancer-tags');
      if (oldTags) oldTags.remove();
      this.showCurrentTags();
    });

    const cancelBtn = BiliEnhancer.dom.createElement('button', {}, {
      background: '#f0f0f0', color: '#333', border: 'none',
      borderRadius: '6px', padding: '6px 16px', fontSize: '13px', cursor: 'pointer'
    }, '取消');

    const mask = BiliEnhancer.dom.createElement('div', {}, {
      position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
      background: 'rgba(0,0,0,0.3)', zIndex: '999998'
    });
    mask.addEventListener('click', () => { dialog.remove(); mask.remove(); });
    cancelBtn.addEventListener('click', () => { dialog.remove(); mask.remove(); });

    btnWrap.appendChild(cancelBtn);
    btnWrap.appendChild(saveBtn);

    dialog.appendChild(title);
    dialog.appendChild(input);
    dialog.appendChild(tagList);
    dialog.appendChild(btnWrap);

    document.body.appendChild(mask);
    document.body.appendChild(dialog);
    input.focus();
  },

  // 删除标签
  async removeTag(videoId, tag) {
    if (!this.tags[videoId]) return;
    const idx = this.tags[videoId].indexOf(tag);
    if (idx >= 0) {
      this.tags[videoId].splice(idx, 1);
      if (this.tags[videoId].length === 0) {
        delete this.tags[videoId];
      }
      await BiliEnhancer.storage.set({ localTags: this.tags });
      // 更新页面显示
      const oldTags = document.querySelector('.bili-enhancer-tags');
      if (oldTags) oldTags.remove();
      this.showCurrentTags();
      BiliEnhancer.showToast(`已删除标签: ${tag}`);
    }
  },

  destroy() { }
};
