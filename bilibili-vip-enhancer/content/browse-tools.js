/**
 * B站大会员增强助手 - 浏览效率工具模块
 * 功能：评论增强、分P优化、时间戳复制、UP主屏蔽
 */

const BrowseTools = {
  config: null,
  blockedUPs: [],
  _events: null,
  _observers: null,
  _timers: null,

  async init() {
    this._events = BiliEnhancer.createEventManager();
    this._observers = BiliEnhancer.createObserverManager();
    this._timers = BiliEnhancer.createTimerManager();

    this.config = await BiliEnhancer.storage.get('browseConfig') || DEFAULT_CONFIG.browseConfig;
    this.blockedUPs = await BiliEnhancer.storage.get('blockedUPs') || [];

    if (this.config.timestampCopy) this.setupTimestampCopy();
    if (this.config.commentEnhance && BiliEnhancer.page.isVideoPage()) this.setupCommentEnhance();
    if (this.config.multiPartOptimize && BiliEnhancer.page.isVideoPage()) this.setupMultiPartOptimize();
    if (this.config.upBlock) this.setupFeedFilter();

    // 配置实时更新（UP 屏蔽列表 / 标题关键词即时生效）
    this._events.on(window, EVT.CONFIG_UPDATE, (e) => {
      if (!e.detail) return;
      if (e.detail.blockedUPs) this.blockedUPs = e.detail.blockedUPs;
      if (e.detail.browseConfig) {
        this.config = e.detail.browseConfig;
        // 过滤列表从空变为非空时动态启动（初始为空不会预启动）
        if (this.config.upBlock && !this._feedFilterStarted) this.setupFeedFilter();
      }
    });
  },

  // ==================== 时间戳复制 ====================

  setupTimestampCopy() {
    if (!BiliEnhancer.page.isVideoPage()) return;

    this._timers.timeout(() => {
      const playerArea = BiliEnhancer.dom.queryFirst(
        PLAYER_CONTAINER_SELECTORS + ', .video-toolbar-left'
      );
      if (!playerArea || playerArea.querySelector('.bili-enhancer-ts-btn')) return;

      const btn = BiliEnhancer.dom.createElement('button', {
        class: 'bili-enhancer-ts-btn',
        title: '复制当前时间戳链接'
      }, {
        background: '#fb7299', color: '#fff', border: 'none',
        borderRadius: '4px', padding: '4px 10px', fontSize: '12px',
        cursor: 'pointer', marginLeft: '8px', whiteSpace: 'nowrap'
      }, '复制时间戳');

      this._events.on(btn, 'click', () => {
        const video = BiliEnhancer.getVideoElement();
        if (!video) { BiliEnhancer.showToast('未找到播放器'); return; }
        const videoId = BiliEnhancer.page.getVideoId();
        const time = Math.floor(video.currentTime);
        const url = `https://www.bilibili.com/video/${videoId}?t=${time}`;
        BiliEnhancer.copyText(url).then(() => {
          BiliEnhancer.showToast(`已复制: ${BiliEnhancer.formatTime(time)}`);
        });
      });

      const toolbar = BiliEnhancer.dom.queryFirst(TOOLBAR_SELECTORS) || playerArea;
      if (toolbar) toolbar.appendChild(btn);
    }, TIMING.BUTTON_INJECT_DELAY);
  },

  // ==================== 评论增强 ====================

  setupCommentEnhance() {
    this._timers.timeout(() => {
      const commentArea = BiliEnhancer.dom.queryFirst('#comment, .comment, [class*="comment"]');
      if (!commentArea || commentArea.querySelector('.bili-enhancer-comment-tools')) return;

      const tools = BiliEnhancer.dom.createElement('div', {
        class: 'bili-enhancer-comment-tools'
      }, {
        display: 'flex', gap: '8px', padding: '8px 0',
        alignItems: 'center', flexWrap: 'wrap'
      });

      const sortLabel = BiliEnhancer.dom.createElement('span', {}, {
        fontSize: '12px', color: '#666'
      }, '排序:');

      const activeStyle = { background: '#fb7299', color: '#fff' };
      const inactiveStyle = { background: '#f0f0f0', color: '#333' };
      const btnBaseStyle = { border: 'none', borderRadius: '3px', padding: '3px 8px', fontSize: '12px', cursor: 'pointer' };

      const sortByLike = BiliEnhancer.dom.createElement('button',
        { class: 'bili-enhancer-sort-btn active' }, { ...activeStyle, ...btnBaseStyle }, '按热度');
      const sortByTime = BiliEnhancer.dom.createElement('button',
        { class: 'bili-enhancer-sort-btn' }, { ...inactiveStyle, ...btnBaseStyle }, '按时间');

      const toggleSortButtons = (active) => {
        const setActive = (btn, isActive) => {
          Object.assign(btn.style, isActive ? activeStyle : inactiveStyle);
        };
        setActive(sortByLike, active === 'like');
        setActive(sortByTime, active === 'time');
      };

      this._events.on(sortByLike, 'click', () => {
        this.switchCommentSort(1);
        toggleSortButtons('like');
      });
      this._events.on(sortByTime, 'click', () => {
        this.switchCommentSort(0);
        toggleSortButtons('time');
      });

      // 折叠刷屏评论
      const foldBtn = BiliEnhancer.dom.createElement('button', {},
        { ...inactiveStyle, ...btnBaseStyle }, '折叠刷屏');
      this._events.on(foldBtn, 'click', () => this.foldSpamComments());

      tools.appendChild(sortLabel);
      tools.appendChild(sortByLike);
      tools.appendChild(sortByTime);
      tools.appendChild(foldBtn);

      const commentHeader = commentArea.querySelector('.reply-header, [class*="reply-header"]') || commentArea;
      commentHeader.parentElement.insertBefore(tools, commentHeader);

      this.addCopyUPButtons(commentArea);
    }, TIMING.COMMENT_TOOL_DELAY);
  },

  switchCommentSort(sortType) {
    const sortBtns = document.querySelectorAll('.reply-sort-btn, [class*="sort-btn"]');
    if (sortBtns.length > sortType) {
      sortBtns[sortType].click();
    } else {
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
      if (textCount[text] > LIMITS.SPAM_COMMENT_THRESHOLD) {
        comment.style.display = 'none';
        folded++;
      }
    });

    BiliEnhancer.showToast(folded > 0 ? `已折叠 ${folded} 条刷屏评论` : '未发现刷屏评论');
  },

  addCopyUPButtons(container) {
    this._observers.watch(container, () => {
      const upNames = container.querySelectorAll('.user-name, [class*="user-name"], .name');
      upNames.forEach(el => {
        if (el.dataset.copyAdded) return;
        el.dataset.copyAdded = 'true';
        el.style.cursor = 'pointer';
        el.title = '点击复制UP主ID';
        this._events.on(el, 'click', (e) => {
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
  },

  // ==================== 分 P 合集优化 ====================

  setupMultiPartOptimize() {
    this._timers.timeout(() => {
      const epList = BiliEnhancer.dom.queryFirst(
        '.video-episode-card, [class*="video-episode"], .multi-page, [class*="video-sections"]'
      );
      if (!epList) return;

      // 固定侧边栏
      epList.classList.add('bili-enhancer-ep-sticky');
      epList.style.zIndex = '10';

      const videoId = BiliEnhancer.page.getVideoId();
      const epItems = epList.querySelectorAll('.video-episode-item, [class*="episode-item"], li');

      BiliEnhancer.storage.get('watchedEpisodes').then((watched) => {
        const watchedList = watched || {};
        const key = videoId || 'unknown';
        const watchedPages = watchedList[key] || [];

        epItems.forEach((item, index) => {
          if (watchedPages.includes(index + 1)) {
            item.classList.add('bili-enhancer-watched');
          }

          this._events.on(item, 'dblclick', async (e) => {
            e.preventDefault();
            const stored = await BiliEnhancer.storage.get('watchedEpisodes') || {};
            if (!stored[key]) stored[key] = [];
            const idx = stored[key].indexOf(index + 1);
            if (idx >= 0) {
              stored[key].splice(idx, 1);
              item.classList.remove('bili-enhancer-watched');
            } else {
              stored[key].push(index + 1);
              item.classList.add('bili-enhancer-watched');
            }
            await BiliEnhancer.storage.set({ watchedEpisodes: stored });
          });
        });
      });

      const tip = BiliEnhancer.dom.createElement('div', {}, {
        fontSize: '11px', color: '#999', padding: '4px 8px',
        borderBottom: '1px solid #eee'
      }, '提示: 双击分P可标记已看/未看');
      epList.insertBefore(tip, epList.firstChild);
    }, TIMING.BUTTON_INJECT_DELAY);
  },

  // ==================== 推荐流过滤（UP 主 + 标题关键词） ====================

  /** 对标 BewlyBewly title filter：首页/动态推荐流按 UP 主 UID 与标题关键词隐藏卡片 */
  setupFeedFilter() {
    if (this.blockedUPs.length === 0 && (this.config.titleFilters || []).length === 0) return;

    const isBlockedUP = (card) => {
      if (this.blockedUPs.length === 0) return false;
      const upLink = card.querySelector('a[href*="space.bilibili.com"]');
      if (!upLink) return false;
      const uidMatch = upLink.href.match(/space\.bilibili\.com\/(\d+)/);
      return uidMatch && this.blockedUPs.includes(uidMatch[1]);
    };

    const isBlockedTitle = (card) => {
      const filters = this.config.titleFilters || [];
      if (filters.length === 0) return false;
      const titleEl = card.querySelector(
        '.bili-video-card__info--tit, [class*="title"], h3'
      );
      if (!titleEl) return false;
      const text = titleEl.textContent.trim();
      return filters.some(kw => text.includes(kw));
    };

    const blockCards = () => {
      // 首页 / 推荐流
      document.querySelectorAll('.bili-video-card, .video-card-reco, [class*="video-card"]').forEach(card => {
        if (isBlockedUP(card) || isBlockedTitle(card)) {
          card.style.display = 'none';
        }
      });

      // 动态页面
      document.querySelectorAll('.bili-dyn-item, [class*="dyn-card"]').forEach(card => {
        if (isBlockedUP(card)) {
          card.style.display = 'none';
        }
      });
    };

    this._feedFilterStarted = true;
    this._timers.timeout(blockCards, TIMING.UP_BLOCK_INITIAL_DELAY);
    this._timers.interval(blockCards, TIMING.UP_BLOCK_POLL_INTERVAL);
    this._events.on(window, 'scroll', BiliEnhancer.throttle(blockCards, 2000), { passive: true });
  },

  // ==================== 清理 ====================

  destroy() {
    this._events?.destroy();
    this._observers?.destroy();
    this._timers?.destroy();
  }
};
