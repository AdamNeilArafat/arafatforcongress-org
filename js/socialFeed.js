// js/socialFeed.js
// Renders the live "Recent conversations" feed in the banner with id="live-conversations-banner"
// using data from /data/social_feed.json. Integrates with trackEvent if available.

(function () {
  const FEED_URL = '/data/social_feed.json';
  const MAX_VISIBLE_ITEMS = 10;

  function safeTrackEvent(action, params) {
    if (typeof trackEvent === 'function') {
      trackEvent(action, params || {});
    }
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  function createItemElement(item, index) {
    const li = document.createElement('li');
    li.className = 'social-feed-item';

    const link = document.createElement('a');
    link.href = item.url || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const title = document.createElement('div');
    title.className = 'social-feed-title';
    title.textContent = item.thread_title || '[No title]';

    const meta = document.createElement('div');
    meta.className = 'social-feed-meta';
    const platform = item.platform ? item.platform.toUpperCase() : 'UNKNOWN';
    const author = item.author || '';
    const created = formatDate(item.created_at);
    meta.textContent = [platform, author, created].filter(Boolean).join(' • ');

    const snippet = document.createElement('div');
    snippet.className = 'social-feed-snippet';
    snippet.textContent = item.snippet || '';

    link.appendChild(title);
    link.appendChild(meta);
    link.appendChild(snippet);
    li.appendChild(link);

    // Track click on this item
    link.addEventListener('click', function () {
      safeTrackEvent('social_feed_click', {
        item_id: item.id || ('idx-' + index),
        platform: item.platform || 'unknown',
        type: item.type || 'item',
        position: index,
        page_path: window.location.pathname
      });
    });

    // Track impression once when rendered
    safeTrackEvent('social_feed_impression', {
      item_id: item.id || ('idx-' + index),
      platform: item.platform || 'unknown',
      type: item.type || 'item',
      position: index,
      page_path: window.location.pathname
    });

    return li;
  }

  function renderFeed(items) {
    const banner = document.getElementById('live-conversations-banner');
    const listEl = document.getElementById('social-feed-list');
    if (!banner || !listEl) return;

    if (!items || !items.length) {
      // Hide banner if there is nothing to show
      banner.style.display = 'none';
      return;
    }

    banner.style.display = '';
    listEl.innerHTML = '';

    const limited = items.slice(0, MAX_VISIBLE_ITEMS);
    limited.forEach((item, idx) => {
      const li = createItemElement(item, idx);
      listEl.appendChild(li);
    });
  }

  function loadFeed() {
    fetch(FEED_URL, { cache: 'no-cache' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('Failed to load social feed');
        return resp.json();
      })
      .then(function (data) {
        const items = (data && Array.isArray(data.items)) ? data.items : [];
        renderFeed(items);
      })
      .catch(function () {
        const banner = document.getElementById('live-conversations-banner');
        if (banner) {
          banner.style.display = 'none';
        }
      });
  }

  document.addEventListener('DOMContentLoaded', loadFeed);
})();
