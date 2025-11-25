// ===== GA4 event helper =====
function trackEvent(action, params = {}) {
  if (typeof gtag === 'function') {
    gtag('event', action, params);
  }
}

// ===== Query parameter helpers =====
function getQueryParams() {
  const params = {};
  const search = window.location.search.substring(1);
  if (!search) return params;

  search.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (!key) return;
    params[decodeURIComponent(key)] = decodeURIComponent(value || '');
  });

  return params;
}

// ===== Visitor identity & source tracking (localStorage) =====
const LS_KEYS = {
  visitorId: 'afc_visitor_id',
  firstSource: 'afc_first_source',
  lastSource: 'afc_last_source',
  firstVisitTs: 'afc_first_visit_ts'
};

function getOrCreateVisitorId() {
  let id = localStorage.getItem(LS_KEYS.visitorId);
  if (!id) {
    id = 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(LS_KEYS.visitorId, id);
  }
  return id;
}

function initSourceTracking() {
  const params = getQueryParams();
  const src = params.src || params.utm_source || null;

  const visitorId = getOrCreateVisitorId();
  let firstSource = localStorage.getItem(LS_KEYS.firstSource);
  let lastSource = localStorage.getItem(LS_KEYS.lastSource);
  let firstVisitTs = localStorage.getItem(LS_KEYS.firstVisitTs);

  const now = Date.now().toString();

  if (!firstVisitTs) {
    firstVisitTs = now;
    localStorage.setItem(LS_KEYS.firstVisitTs, firstVisitTs);
  }

  if (!firstSource && src) {
    firstSource = src;
    localStorage.setItem(LS_KEYS.firstSource, firstSource);
  }

  if (src) {
    lastSource = src;
    localStorage.setItem(LS_KEYS.lastSource, lastSource);
  } else if (!lastSource) {
    lastSource = '(direct)';
    localStorage.setItem(LS_KEYS.lastSource, lastSource);
  }

  return {
    visitorId,
    firstSource: firstSource || '(direct)',
    lastSource: lastSource || '(direct)',
    firstVisitTs
  };
}

let TRACKING_CONTEXT = null;

// ===== Session & scroll tracking =====
let sessionPageViews = 0;
let sessionScrollMax = 0;
let sessionStartTime = Date.now();

function trackPageView() {
  sessionPageViews += 1;
}

function initScrollTracking() {
  function updateScrollMax() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
      document.body.clientHeight,
      document.documentElement.clientHeight
    );
    const windowHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    const maxScrollable = docHeight - windowHeight;
    if (maxScrollable <= 0) {
      sessionScrollMax = 100;
      return;
    }

    const current = Math.min(100, Math.round((scrollTop / maxScrollable) * 100));
    if (current > sessionScrollMax) {
      sessionScrollMax = current;
    }
  }

  window.addEventListener('scroll', updateScrollMax, { passive: true });
  // Initial call
  updateScrollMax();
}

function computeSessionQuality() {
  const durationMs = Date.now() - sessionStartTime;
  const durationSec = Math.round(durationMs / 1000);

  let score = 0;

  // Pages viewed
  score += sessionPageViews * 2;

  // Scroll depth
  if (sessionScrollMax >= 25) score += 2;
  if (sessionScrollMax >= 50) score += 2;
  if (sessionScrollMax >= 75) score += 3;

  // Duration
  if (durationSec >= 30) score += 2;
  if (durationSec >= 90) score += 3;
  if (durationSec >= 300) score += 5;

  let bucket = 'low';
  if (score >= 10) bucket = 'high';
  else if (score >= 4) bucket = 'medium';

  return { score, bucket, durationSec };
}

function sendSessionQualityEvent() {
  if (!TRACKING_CONTEXT) return;

  const quality = computeSessionQuality();
  trackEvent('session_quality', {
    score: quality.score,
    bucket: quality.bucket,
    duration_sec: quality.durationSec,
    scroll_max: sessionScrollMax,
    page_views: sessionPageViews,
    visitor_id: TRACKING_CONTEXT.visitorId,
    first_source: TRACKING_CONTEXT.firstSource,
    last_source: TRACKING_CONTEXT.lastSource
  });
}

// ===== Generic click tracking via data attributes =====
function initClickTracking() {
  // Elements with data-event fire GA events
  document.querySelectorAll('[data-event]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.getAttribute('data-event');
      const location = el.getAttribute('data-location') || 'unknown';
      const dataNet = el.getAttribute('data-net');
      const extra = el.getAttribute('data-extra') || dataNet || null;

      const eventParams = {
        location,
        visitor_id: TRACKING_CONTEXT ? TRACKING_CONTEXT.visitorId : undefined,
        first_source: TRACKING_CONTEXT ? TRACKING_CONTEXT.firstSource : undefined,
        last_source: TRACKING_CONTEXT ? TRACKING_CONTEXT.lastSource : undefined
      };

      if (extra) {
        eventParams.extra = extra;
      }

      trackEvent(action, eventParams);
    });
  });
}

// ===== Form augmentation (invisible) =====
function initFormAugmentation() {
  // Any form marked with data-augment-tracking="true" will get hidden fields
  const forms = document.querySelectorAll('form[data-augment-tracking="true"]');
  if (!forms.length) return;

  forms.forEach(form => {
    // Create or update hidden fields for tracking context
    const ensureHiddenField = (name, value) => {
      let input = form.querySelector('input[name="' + name + '"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        form.appendChild(input);
      }
      if (value !== undefined && value !== null) {
        input.value = value;
      }
    };

    const ctx = TRACKING_CONTEXT || initSourceTracking();
    // Store visitor + source context
    ensureHiddenField('visitor_id', ctx.visitorId);
    ensureHiddenField('first_source', ctx.firstSource);
    ensureHiddenField('last_source', ctx.lastSource);

    // Attempt to store current URL path as context
    ensureHiddenField('page_path', window.location.pathname);

    // On submit, also send an analytics event if form has data-form-type
    form.addEventListener('submit', () => {
      const formType = form.getAttribute('data-form-type') || 'generic_form';

      const quality = computeSessionQuality();

      trackEvent(formType + '_submit', {
        visitor_id: ctx.visitorId,
        first_source: ctx.firstSource,
        last_source: ctx.lastSource,
        page_path: window.location.pathname,
        session_score: quality.score,
        session_bucket: quality.bucket,
        scroll_max: sessionScrollMax
      });
    });
  });
}

// ===== Section visibility tracking (using existing IDs) =====
function initSectionTracking() {
  // Only track sections that already exist with IDs; do not modify DOM structure.
  const SECTION_IDS = [
    'about',
    'accountability',
    'issues',
    'difference-heading',
    'donate',
    'priorities',
    'agenda',
    'lower-costs',
    'healthcare',
    'housing',
    'safety',
    'share-line'
  ];

  if (!SECTION_IDS.length || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id || '(no_id)';
        trackEvent('section_view', {
          section_id: id,
          page_path: window.location.pathname,
          visitor_id: TRACKING_CONTEXT ? TRACKING_CONTEXT.visitorId : undefined
        });
      }
    });
  }, {
    threshold: 0.4
  });

  SECTION_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

// ===== 404 tracking (if applicable) =====
function init404Tracking() {
  // If this is a dedicated 404 page, use body or html class to detect it.
  const body = document.body;
  if (!body) return;

  if (body.classList.contains('page-404') || body.id === 'page-404') {
    trackEvent('404_hit', {
      path: window.location.pathname,
      visitor_id: TRACKING_CONTEXT ? TRACKING_CONTEXT.visitorId : undefined,
      first_source: TRACKING_CONTEXT ? TRACKING_CONTEXT.firstSource : undefined,
      last_source: TRACKING_CONTEXT ? TRACKING_CONTEXT.lastSource : undefined
    });
  }
}

// ===== Main init =====
function initAnalytics() {
  TRACKING_CONTEXT = initSourceTracking();
  trackPageView();
  initScrollTracking();
  initClickTracking();
  initFormAugmentation();
  initSectionTracking();
  init404Tracking();
}

// Send session quality when user leaves or tab hides
window.addEventListener('beforeunload', sendSessionQualityEvent);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    sendSessionQualityEvent();
  }
});

document.addEventListener('DOMContentLoaded', initAnalytics);
