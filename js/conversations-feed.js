(function () {
  // TODO: update this to the real WebCrawler feed URL
  // Example: 'https://<username>.github.io/WebCrawler/conversations.json'
  const FEED_URL = 'https://arafatforcongress.github.io/WebCrawler/conversations.json';

  const VISIBLE_COUNT = 2;
  const SCROLL_INTERVAL_MS = 4500;
  const SCROLL_DURATION_MS = 650;

  let posts = [];
  let cardHeight = 0;
  let gap = 12; // px; should roughly match .conversation-card__link margin-bottom
  let isAnimating = false;

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const options = {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    };
    return d.toLocaleString(undefined, options);
  }

  function createCard(post) {
    const li = document.createElement('li');
    li.className = 'conversation-card';

    const a = document.createElement('a');
    a.className = 'conversation-card__link';
    a.href = post.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('data-card', 'true');

    const title = document.createElement('h3');
    title.className = 'conversation-card__title';
    title.textContent = post.title || '';

    const meta = document.createElement('div');
    meta.className = 'conversation-card__meta';
    const source = post.source || '';
    const author = post.author ? ' • ' + post.author : '';
    const when = post.timestamp_iso ? ' • ' + formatDate(post.timestamp_iso) : '';
    meta.textContent = source + author + when;

    const snippet = document.createElement('p');
    snippet.className = 'conversation-card__snippet';
    snippet.textContent = post.snippet || '';

    a.appendChild(title);
    a.appendChild(meta);
    a.appendChild(snippet);
    li.appendChild(a);
    return li;
  }

  function setupTrack(loopPosts, trackEl, viewportEl) {
    trackEl.innerHTML = '';
    loopPosts.forEach(post => trackEl.appendChild(createCard(post)));

    const firstCardLink = trackEl.querySelector('.conversation-card__link');
    if (!firstCardLink) return;

    const rect = firstCardLink.getBoundingClientRect();
    cardHeight = rect.height;

    if (viewportEl) {
      viewportEl.style.height =
        cardHeight * VISIBLE_COUNT + gap * (VISIBLE_COUNT - 1) + 'px';
    }
  }

  function startAutoScroll(trackEl, viewportEl) {
    if (posts.length <= VISIBLE_COUNT) {
      return; // nothing to scroll
    }

    // Clone first VISIBLE_COUNT posts to end so we can wrap smoothly
    const loopPosts = posts.concat(posts.slice(0, VISIBLE_COUNT));
    setupTrack(loopPosts, trackEl, viewportEl);

    const totalCards = loopPosts.length;
    let index = 0;

    function step() {
      if (isAnimating) return;
      isAnimating = true;
      index += 1;

      trackEl.style.transition =
        'transform ' + SCROLL_DURATION_MS / 1000 + 's ease-in-out';
      trackEl.style.transform =
        'translateY(' + -(index * (cardHeight + gap)) + 'px)';

      setTimeout(() => {
        if (index >= totalCards - VISIBLE_COUNT) {
          trackEl.style.transition = 'none';
          trackEl.style.transform = 'translateY(0)';
          index = 0;
        }
        isAnimating = false;
      }, SCROLL_DURATION_MS + 50);
    }

    setInterval(step, SCROLL_INTERVAL_MS);
  }

  function initFeed() {
    const trackEl = document.getElementById('conversations-track');
    const emptyState = document.getElementById('conversations-empty');
    const viewportEl = trackEl
      ? trackEl.closest('.recent-conversations__viewport')
      : null;

    // If this page doesn't have the section, just exit quietly.
    if (!trackEl) return;

    fetch(FEED_URL, { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error('Feed load failed');
        return res.json();
      })
      .then(data => {
        if (!Array.isArray(data) || data.length === 0) {
          if (emptyState) emptyState.hidden = false;
          return;
        }

        // Keep a reasonable number of items from the feed, ordered by score
        posts = data.slice(0, 20);

        // Initial non-scrolling view (first 2 cards)
        const initial = posts.slice(0, Math.max(VISIBLE_COUNT, posts.length));
        setupTrack(initial, trackEl, viewportEl);

        if (emptyState) emptyState.hidden = true;

        startAutoScroll(trackEl, viewportEl);
      })
      .catch(err => {
        console.error('Conversations feed error:', err);
        const emptyState = document.getElementById('conversations-empty');
        if (emptyState) emptyState.hidden = false;
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFeed);
  } else {
    initFeed();
  }
})();
