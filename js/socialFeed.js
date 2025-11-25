// js/socialFeed.js
// Renders the live "Recent conversations" feed in the banner with id="live-conversations-banner"
// using data from /data/social_feed.json. Integrates with trackEvent if available.

(function () {
  const FEED_URL = '/data/social_feed.json';
  const MAX_VISIBLE_ITEMS = 10;

  const PRELOADED_ITEMS = (Array.isArray(window.__SOCIAL_FEED_PRELOAD)
    ? window.__SOCIAL_FEED_PRELOAD
    : [
        {
          id: 'reddit-olympia-renters',
          platform: 'reddit',
          type: 'discussion',
          thread_title: 'Local renters break down Arafat’s housing plan',
          author: 'u/SouthSoundHousing',
          conversation_url: 'https://www.reddit.com/r/olympia/comments/1i0rent/adam_arafat_housing_plan_for_wa10/',
          snippet:
            'Neighborhood advocates in Olympia are walking through how the campaign’s anti-price-gouging plank would help tenants.',
          created_at: '2025-02-18T16:05:00Z'
        },
        {
          id: 'bsky-town-hall-highlights',
          platform: 'bluesky',
          type: 'townhall',
          thread_title: 'Town hall takeaways on healthcare and costs',
          author: '@civicwatch.pnw',
          conversation_url: 'https://bsky.app/profile/civicwatch.pnw/post/3kx6it7r2bx2k',
          snippet:
            'A live thread captured Adam’s answers on lowering drug prices, ending junk fees, and protecting rural clinics.',
          created_at: '2025-02-17T03:22:00Z'
        },
        {
          id: 'x-labor-endorsement-thread',
          platform: 'x',
          type: 'press',
          thread_title: 'Local labor council discusses endorsing Arafat',
          author: '@SouthSoundLabor',
          conversation_url: 'https://x.com/SouthSoundLabor/status/1891522334408125632',
          snippet:
            'Union members are sharing why they back the campaign’s apprenticeship and prevailing wage commitments.',
          created_at: '2025-02-16T19:40:00Z'
        },
        {
          id: 'facebook-veterans-roundtable',
          platform: 'facebook',
          type: 'community',
          thread_title: 'Veterans roundtable recap from Lacey',
          author: 'Lacey Veterans Network',
          conversation_url: 'https://www.facebook.com/groups/laceyveterans/permalink/324155119123804/',
          snippet:
            'Attendees are comparing notes on Adam’s commitments to VA access, transition support, and military family housing.',
          created_at: '2025-02-15T02:55:00Z'
        },
        {
          id: 'reddit-pugetsound-transit',
          platform: 'reddit',
          type: 'transit',
          thread_title: 'Transit riders react to the south sound commuter plan',
          author: 'u/CapitolLakeCommuter',
          conversation_url: 'https://www.reddit.com/r/pugetsound/comments/1hzrail/olympia_commuter_link_and_better_bus_frequency/',
          snippet:
            'Commuters are digging into the proposal for more reliable bus frequency between Olympia, Lacey, and Tacoma.',
          created_at: '2025-02-14T14:18:00Z'
        },
        {
          id: 'site-plan-under-400k',
          platform: 'site',
          type: 'policy',
          thread_title: 'Keeping taxes down for families under $400k',
          author: 'Arafat for Congress',
          url: '/plan.html',
          snippet:
            'Every part of the economic plan supports working families and will not raise taxes on anyone making under $400,000 a year.',
          created_at: '2024-06-01T12:00:00Z'
        },
        {
          id: 'site-issues-healthcare',
          platform: 'site',
          type: 'issue',
          thread_title: 'Fighting for affordable healthcare and lower costs',
          author: 'Arafat for Congress',
          url: '/issues.html#affordable-healthcare',
          snippet:
            'Adam is pushing to make healthcare affordable, lower drug prices, and protect Social Security and Medicare.',
          created_at: '2024-05-28T15:30:00Z'
        },
        {
          id: 'site-issues-workers',
          platform: 'site',
          type: 'issue',
          thread_title: 'Better jobs, wages, and protections for workers',
          author: 'Arafat for Congress',
          url: '/issues.html#jobs-and-wages',
          snippet:
            'The campaign is focused on creating good-paying jobs, strengthening unions, and expanding apprenticeship opportunities.',
          created_at: '2024-05-25T09:15:00Z'
        }
      ]);

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
    const linkUrl = [
      item.conversation_url,
      item.url,
      item.permalink,
      item.link,
      item.source_url
    ].find(function (href) {
      return typeof href === 'string' && href.trim() !== '';
    });

    if (linkUrl) {
      link.href = linkUrl;
      // Keep internal links in the same tab but open external sources in a new one.
      const isInternal = linkUrl.startsWith('/') || linkUrl.startsWith(window.location.origin);
      link.target = isInternal ? '_self' : '_blank';
      link.rel = isInternal ? '' : 'noopener noreferrer';
      link.title = linkUrl;
    } else {
      link.href = '#';
      link.classList.add('social-feed-link--disabled');
      link.setAttribute('aria-disabled', 'true');
    }

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
        item_id: item.id || 'idx-' + index,
        platform: item.platform || 'unknown',
        type: item.type || 'item',
        position: index,
        page_path: window.location.pathname
      });
    });

    // Track impression once when rendered
    safeTrackEvent('social_feed_impression', {
      item_id: item.id || 'idx-' + index,
      platform: item.platform || 'unknown',
      type: item.type || 'item',
      position: index,
      page_path: window.location.pathname
    });

    return li;
  }

  function sortByRecency(items) {
    return (items || [])
      .slice()
      .sort(function (a, b) {
        const aDate = Date.parse(a && a.created_at);
        const bDate = Date.parse(b && b.created_at);

        if (Number.isNaN(bDate) && Number.isNaN(aDate)) return 0;
        if (Number.isNaN(bDate)) return -1;
        if (Number.isNaN(aDate)) return 1;
        return bDate - aDate;
      });
  }

  function renderFeed(items) {
    const banner = document.getElementById('live-conversations-banner');
    const listEl = document.getElementById('social-feed-list');
    if (!banner || !listEl) return;

    listEl.innerHTML = '';
    const limited = (items || []).slice(0, MAX_VISIBLE_ITEMS);

    if (!limited.length) {
      banner.style.display = '';
      const emptyState = document.createElement('li');
      emptyState.className = 'social-feed-empty';
      emptyState.textContent = 'Recent conversations will appear here soon.';
      listEl.appendChild(emptyState);
      return;
    }

    banner.style.display = '';
    limited.forEach(function (item, idx) {
      const li = createItemElement(item, idx);
      listEl.appendChild(li);
    });
  }

  function loadFeed() {
    // Render immediately with preloaded items while the live feed loads.
    if (PRELOADED_ITEMS && PRELOADED_ITEMS.length) {
      renderFeed(sortByRecency(PRELOADED_ITEMS));
    }

    fetch(FEED_URL, { cache: 'no-cache' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('Failed to load social feed');
        return resp.json();
      })
      .then(function (data) {
        const items = data && Array.isArray(data.items) ? data.items : [];
        const sorted = items.length ? sortByRecency(items) : sortByRecency(PRELOADED_ITEMS);
        renderFeed(sorted);
      })
      .catch(function () {
        renderFeed(sortByRecency(PRELOADED_ITEMS));
      });
  }

  document.addEventListener('DOMContentLoaded', loadFeed);
})();
