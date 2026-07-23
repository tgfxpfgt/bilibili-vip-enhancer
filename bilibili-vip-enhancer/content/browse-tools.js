/**
 * B站大会员增强助手 - 浏览效率工具模块
 * 功能：评论增强、分P优化、时间戳复制、UP主屏蔽
 */

const BrowseTools = {
  config: null,
  blockedUPs: [],

  async init() {
    this.config = await BiliEnhancer.storage.get('browseConfig');
    if (!this.config) {
      this.config = {
        commentEnhance: true, multiPartOptimize: true,
        timestampCopy: true, videoInfo: true, upBlock: true
      };
    }

    this.blockedUPs = await BiliEnhancer.storage.get('blockedUPs') || [];

    if (this.config.timestampCopy) this.setupTimestampCopy();
    if (this.config.commentEnhance && BiliEnhancer.page.isVideoPage()) this.setupCommentEnhance();
    if (this.config.multiPartOptimize && BiliEnhancer.page.isVideoPage()) this.setupMultiPartOptimize();
    if (this.config.upBlock) this.setupUPBlock();
  },

  // 时间戳复制
  setupTimestampCopy() {
    if (!BiliEnhancer.page.isVideoPage()) return;

    setTimeout(() => {
      const playerArea = document.querySelector('.bpx-player-container') ||
        document.querySelector('#bilibili-player') ||
        document.querySelector('.video-toolbar-left');
      if (!playerArea || playerArea.querySelector('.bili-enhancer-ts-btn')) return;

      const btn = BiliEnhancer.dom.createElement('button', {
        class: 'bili-enhancer-ts-btn',
        title: '复制当前时间戳链接'
      }, {
        background: '#fb7299',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        padding: '4px 10px',
        fontSize: '12px',
        cursor: 'pointer',
        marginLeft: '8px',
        whiteSpace: 'nowrap'
      }, '复制时间戳');

      btn.addEventListener('click', () => {
        const video = BiliEnhancer.getVideoElement();
        if (!video) {
          BiliEnhancer.showToast('未找到播放器');
          return;
        }
        const videoId = BiliEnhancer.page.getVideoId();
        const time = Math.floor(video.currentTime);
        const url = `https://www.bilibili.com/video/${videoId}?t=${time}`;
        BiliEnhancer.copyText(url).then(() => {
          BiliEnhancer.showToast(`已复制: ${BiliEnhancer.formatTime(time)}`);
        });
      });

      // 插入到工具栏
      const toolbar = document.querySelector('.video-toolbar-left') ||
        document.querySelector('.video-toolbar') ||
        playerArea;
      if (toolbar) {
        toolbar.appendChild(btn);
      }
    }, 3000);
  },

  // 评论增强
  setupCommentEnhance() {
    setTimeout(() => {
      const commentArea = document.querySelector('#comment') ||
        document.querySelector('.comment') ||
        document.querySelector('[class*="comment"]');
      if (!commentArea || commentArea.querySelector('.bili-enhancer-comment-tools')) return;

      // 注入评论工具栏
      const tools = BiliEnhancer.dom.createElement('div', {
        class: 'bili-enhancer-comment-tools'
      }, {
        display: 'flex',
        gap: '8px',
        padding: '8px 0',
        alignItems: 'center',
        flexWrap: 'wrap'
      });

      // 排序切换按钮
      const sortLabel = BiliEnhancer.dom.createElement('span', {}, {
        fontSize: '12px', color: '#666'
      }, '排序:');

      const sortByLike = BiliEnhancer.dom.createElement('button', {
        class: 'bili-enhancer-sort-btn active'
      }, {
        background: '#fb7299', color: '#fff', border: 'none',
        borderRadius: '3px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer'
      }, '按热度');

      const sortByTime = BiliEnhancer.dom.createElement('button', {
        class: 'bili-enhancer-sort-btn'
      }, {
        background: '#f0f0f0', color: '#333', border: 'none',
        borderRadius: '3px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer'
      }, '按时间');

      sortByLike.addEventListener('click', () => {
        this.switchCommentSort(1);
        sortByLike.style.background = '#fb7299';
        sortByLike.style.color = '#fff';
        sortByTime.style.background = '#f0f0f0';
        sortByTime.style.color = '#333';
      });

      sortByTime.addEventListener('click', () => {
        this.switchCommentSort(0);
        sortByTime.style.background = '#fb7299';
        sortByTime.style.color = '#fff';
        sortByLike.style.background = '#f0f0f0';
        sortByLike.style.color = '#333';
      });

      // 折叠刷屏评论按钮
      const foldBtn = BiliEnhancer.dom.createElement('button', {}, {
        background: '#f0f0f0', color: '#333', border: 'none',
        borderRadius: '3px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer'
      }, '折叠刷屏');
      foldBtn.addEventListener('click', () => this.foldSpamComments());

      tools.appendChild(sortLabel);
      tools.appendChild(sortByLike);
      tools.appendChild(sortByTime);
      tools.appendChild(foldBtn);

      // 插入到评论区上方
      const commentHeader = commentArea.querySelector('.reply-header') ||
        commentArea.querySelector('[class*="reply-header"]') || commentArea;
      commentHeader.parentElement.insertBefore(tools, commentHeader);

      // 为每条评论添加复制UP主ID按钮
      this.addCopyUPButtons(commentArea);
    }, 4000);
  },

  switchCommentSort(sortType) {
    // 通过点击B站自带的排序按钮来切换
    const sortBtns = document.querySelectorAll('.reply-sort-btn, [class*="sort-btn"]');
    if (sortBtns.length > sortType) {
      sortBtns[sortType].click();
    } else {
      // 尝试通过URL参数刷新
      const url = new URL(location.href);
      url.searchParams.set('sort', sortType === 0 ? '0' : '1');
      BiliEnhancer.showToast(`已切换评论排序: ${sortType === 0 ? '按时间' : '按热度'}`);
    }
  },

  foldSpamComments() {
    const comments = document.querySelectorAll('.reply-item, [class*="reply-item"]');
    const textCount = {};
    let folded = 0;

    comments.forEach(comment => {
      const content = comment.querySelector('.reply-content, [class*="reply-content"]');
      if (!content) return;
      const text = content.textContent.trim().slice(0, 50);
      textCount[text] = (textCount[text] || 0) + 1;
      if (textCount[text] > 3) {
        comment.style.display = 'none';
        folded++;
      }
    });

    BiliEnhancer.showToast(folded > 0 ? `已折叠 ${folded} 条刷屏评论` : '未发现刷屏评论');
  },

  addCopyUPButtons(container) {
    const observer = new MutationObserver(() => {
      const upNames = container.querySelectorAll('.user-name, [class*="user-name"], .name');
      upNames.forEach(el => {
        if (el.dataset.copyAdded) return;
        el.dataset.copyAdded = 'true';
        el.style.cursor = 'pointer';
        el.title = '点击复制UP主ID';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const href = el.getAttribute('href') || '';
          const uidMatch = href.match(/space\.bilibili\.com\/(\d+)/);
          const text = uidMatch ? uidMatch[1] : el.textContent.trim();
          BiliEnhancer.copyText(text).then(() => {
            BiliEnhancer.showToast(`已复制: ${text}`);
          });
        });
      });
    });
    observer.observe(container, { childList: true, subtree: true });
  },

  // 分P合集优化
  setupMultiPartOptimize() {
    setTimeout(() => {
      const epList = document.querySelector('.video-episode-card') ||
        document.querySelector('[class*="video-episode"]') ||
        document.querySelector('.multi-page') ||
        document.querySelector('[class*="video-sections"]');
      if (!epList) return;

      // 固定侧边栏
      epList.style.position = 'sticky';
      epList.style.top = '10px';
      epList.style.maxHeight = '70vh';
      epList.style.overflowY = 'auto';
      epList.style.zIndex = '10';

      // 添加已看标记功能
      const videoId = BiliEnhancer.page.getVideoId();
      const epItems = epList.querySelectorAll('.video-episode-item, [class*="episode-item"], li');

      // 从storage读取已看记录
      BiliEnhancer.storage.get('watchedEpisodes').then((watched) => {
        const watchedList = watched || {};
        const key = videoId || 'unknown';
        const watchedPages = watchedList[key] || [];

        epItems.forEach((item, index) => {
          // 标记已看
          if (watchedPages.includes(index + 1)) {
            item.style.opacity = '0.6';
            const mark = BiliEnhancer.dom.createElement('span', {}, {
              color: '#999', fontSize: '11px', marginLeft: '4px'
            }, '✓已看');
            item.appendChild(mark);
          }

          // 双击标记已看/未看
          item.addEventListener('dblclick', async (e) => {
            e.preventDefault();
            const stored = await BiliEnhancer.storage.get('watchedEpisodes') || {};
            if (!stored[key]) stored[key] = [];
            const idx = stored[key].indexOf(index + 1);
            if (idx >= 0) {
              stored[key].splice(idx, 1);
              item.style.opacity = '1';
              const mark = item.querySelector('span:last-child');
              if (mark && mark.textContent === '✓已看') mark.remove();
            } else {
              stored[key].push(index + 1);
              item.style.opacity = '0.6';
              const mark = BiliEnhancer.dom.createElement('span', {}, {
                color: '#999', fontSize: '11px', marginLeft: '4px'
              }, '✓已看');
              item.appendChild(mark);
            }
            await BiliEnhancer.storage.set({ watchedEpisodes: stored });
          });
        });
      });

      // 添加快速跳转提示
      const tip = BiliEnhancer.dom.createElement('div', {}, {
        fontSize: '11px', color: '#999', padding: '4px 8px',
        borderBottom: '1px solid #eee'
      }, '提示: 双击分P可标记已看/未看');
      epList.insertBefore(tip, epList.firstChild);
    }, 3000);
  },

  // UP主屏蔽
  setupUPBlock() {
    if (this.blockedUPs.length === 0) return;

    const blockCards = () => {
      // 首页/推荐流视频卡片
      const cards = document.querySelectorAll('.bili-video-card, .video-card-reco, [class*="video-card"]');
      cards.forEach(card => {
        const upLink = card.querySelector('a[href*="space.bilibili.com"]');
        if (!upLink) return;
        const uidMatch = upLink.href.match(/space\.bilibili\.com\/(\d+)/);
        if (uidMatch && this.blockedUPs.includes(uidMatch[1])) {
          card.style.display = 'none';
        }
      });

      // 动态页面
      const dynCards = document.querySelectorAll('.bili-dyn-item, [class*="dyn-card"]');
      dynCards.forEach(card => {
        const upLink = card.querySelector('a[href*="space.bilibili.com"]');
        if (!upLink) return;
        const uidMatch = upLink.href.match(/space\.bilibili\.com\/(\d+)/);
        if (uidMatch && this.blockedUPs.includes(uidMatch[1])) {
          card.style.display = 'none';
        }
      });
    };

    setTimeout(blockCards, 2000);
    // 用定时轮询代替重量级MutationObserver，降低CPU占用
    this._upBlockTimer = setInterval(blockCards, 4000);
    // 滚动时也检查新加载的内容
    window.addEventListener('scroll', BiliEnhancer.throttle(blockCards, 2000), { passive: true });
  },

  destroy() {
    if (this._upBlockTimer) clearInterval(this._upBlockTimer);
  }
};
