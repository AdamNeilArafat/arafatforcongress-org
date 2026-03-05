const SHARE_LINES = [
  "Share this page. Every new voice shrinks the power of big money."
];

const STANDARD_CONSENT_TEXT = "I agree to be contacted by Arafat for Congress about campaign updates and volunteer opportunities. Msg/data rates may apply. Reply STOP to unsubscribe.";

const EVENTS_PAGE_ENABLED = false;

function applyEventsPageVisibility() {
  if (EVENTS_PAGE_ENABLED) return;

  const path = window.location.pathname.replace(/\/$/, '');
  if (path === '/events.html') {
    window.location.replace('/contact.html');
    return;
  }
  if (path === '/es/events.html') {
    window.location.replace('/es/contact.html');
    return;
  }

  document.querySelectorAll('a[href="/events.html"], a[href="/es/events.html"]').forEach((link) => {
    link.style.display = 'none';
    link.setAttribute('aria-hidden', 'true');
    link.setAttribute('tabindex', '-1');
  });
}

function getSiteConfig() {
  if (window.AFC_CONFIG) return window.AFC_CONFIG;
  const gaMeta = document.querySelector('meta[name="ga-measurement-id"]');
  const endpointMeta = document.querySelector('meta[name="campaign-signup-endpoint"]');
  window.AFC_CONFIG = {
    gaMeasurementId: gaMeta ? gaMeta.content.trim() : '',
    signupEndpoint: endpointMeta ? endpointMeta.content.trim() : ''
  };
  return window.AFC_CONFIG;
}

function track(action, params = {}) {
  if (typeof window.trackEvent === 'function') window.trackEvent(action, params);
}

function trackFormEvent(eventName, details = {}) {
  track(eventName, {
    page: window.location.pathname,
    ...details
  });
}

function rotateShareLine() {
  const line = document.getElementById("share-line");
  if (!line) return;
  const random = SHARE_LINES[Math.floor(Math.random() * SHARE_LINES.length)];
  line.textContent = random;
}

function setupShareIcons() {
  const shareLine = document.getElementById("share-line");
  document.querySelectorAll(".share-icon").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const net = btn.dataset.net;
      const shareUrl = encodeURIComponent(window.location.href);
      const text = shareLine ? encodeURIComponent(shareLine.textContent) : "";
      let url = "";

      switch (net) {
        case "x": url = `https://twitter.com/intent/tweet?text=${text}%20${shareUrl}`; break;
        case "facebook": url = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`; break;
        case "tiktok": url = `https://www.tiktok.com/share?url=${shareUrl}&text=${text}`; break;
        case "bluesky": url = `https://bsky.app/intent/compose?text=${text}%20${shareUrl}`; break;
        case "reddit": url = `https://www.reddit.com/submit?url=${shareUrl}&title=${text}`; break;
        case "sms": url = `sms:?&body=${text}%20${shareUrl}`; break;
        case "email": url = `mailto:?subject=${text}&body=${shareUrl}`; break;
        default: url = shareUrl;
      }

      track('share_click', { network: net || 'unknown' });
      window.open(url, "_blank", "noopener,noreferrer");
    });
  });
}

async function submitSignup(payload) {
  const { signupEndpoint } = getSiteConfig();
  if (!signupEndpoint) throw new Error('missing-endpoint');

  const email = String(payload.email || '').trim();
  const fullName = String(payload.fullName || '').trim();
  const actionType = String(payload.actionType || '').trim();
  const source = String(payload.source || '').trim();

  const outboundPayload = {
    ...payload,
    _replyto: email,
    _subject: actionType ? `Campaign ${actionType.replace(/_/g, ' ')}` : 'Campaign form submission',
    _from: fullName && email ? `${fullName} <${email}>` : email,
    _template: 'table',
    _captcha: 'false',
    submittedFrom: source || window.location.pathname
  };

  const response = await fetch(signupEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(outboundPayload)
  });
  if (!response.ok) throw new Error(`signup-${response.status}`);
}

function setFeedback(feedback, message, type) {
  if (!feedback) return;
  feedback.textContent = message;
  feedback.classList.remove("is-success", "is-error");
  if (type) feedback.classList.add(type);
}

function wireSimpleEmailForm(config) {
  const form = document.getElementById(config.formId);
  if (!form) return;
  const input = document.getElementById(config.emailId);
  const feedback = document.getElementById(config.feedbackId);
  let hasStarted = false;

  form.addEventListener('focusin', () => {
    if (hasStarted) return;
    hasStarted = true;
    trackFormEvent('form_start', { form_id: config.formId, source: config.source, action_type: config.actionType || 'general' });
  }, { once: true });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = input ? input.value.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFeedback(feedback, config.invalidMessage, 'is-error');
      return;
    }

    setFeedback(feedback, config.pendingMessage, null);
    try {
      await submitSignup({
        fullName: '',
        email,
        zip: '',
        message: config.defaultMessage || '',
        consent: true,
        consentText: STANDARD_CONSENT_TEXT,
        source: config.source,
        actionType: config.actionType || 'general'
      });
      setFeedback(feedback, config.successMessage, 'is-success');
      form.reset();
      trackFormEvent('form_submit_success', { form_id: config.formId, source: config.source, action_type: config.actionType || 'general' });
    } catch (_) {
      setFeedback(feedback, config.errorMessage, 'is-error');
      trackFormEvent('form_submit_failure', { form_id: config.formId, source: config.source, action_type: config.actionType || 'general' });
    }
  });
}

function wireStandardCampaignForm(config) {
  const form = document.getElementById(config.formId);
  if (!form) return;
  const feedback = document.getElementById(config.feedbackId);
  let hasStarted = false;

  form.addEventListener('focusin', () => {
    if (hasStarted) return;
    hasStarted = true;
    trackFormEvent('form_start', { form_id: config.formId, source: config.source, action_type: config.actionType });
  }, { once: true });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      setFeedback(feedback, config.invalidMessage || 'Please complete all required fields.', 'is-error');
      return;
    }

    const data = new FormData(form);
    const payload = {
      fullName: String(data.get('fullName') || '').trim(),
      email: String(data.get('email') || '').trim(),
      zip: String(data.get('zip') || '').trim(),
      message: String(data.get('message') || '').trim(),
      consent: data.get('consent') === 'on' || data.get('consent') === 'true',
      consentText: STANDARD_CONSENT_TEXT,
      source: config.source,
      actionType: config.actionType,
      topic: String(data.get('topic') || '').trim()
    };

    setFeedback(feedback, config.pendingMessage || 'Submitting…', null);
    try {
      await submitSignup(payload);
      setFeedback(feedback, config.successMessage, 'is-success');
      form.reset();
      trackFormEvent('form_submit_success', { form_id: config.formId, source: config.source, action_type: config.actionType });
    } catch (_) {
      setFeedback(feedback, config.errorMessage, 'is-error');
      trackFormEvent('form_submit_failure', { form_id: config.formId, source: config.source, action_type: config.actionType });
    }
  });
}

function setupSignupForm() {
  wireStandardCampaignForm({
    formId: 'campaign-signup-form',
    feedbackId: 'signup-feedback',
    source: 'homepage',
    actionType: 'volunteer_intake',
    successMessage: 'Thanks for joining the campaign. We will follow up soon.',
    errorMessage: 'We could not submit right now. Please try again or use the mailto fallback link.',
    invalidMessage: 'Please complete name, email, ZIP, how you want to help, and consent.'
  });
}

function setupEventsNotifyForm() {
  wireStandardCampaignForm({
    formId: 'event-notify-form',
    feedbackId: 'notify-feedback',
    source: 'events-page',
    actionType: 'event_interest',
    successMessage: 'Thanks — you are on the event interest list for upcoming WA-10 events.',
    errorMessage: 'We could not save your event interest right now. Please try again or use the mailto fallback link.',
    invalidMessage: 'Please complete all required event interest fields.'
  });
}

function setupHostEventForm() {
  wireStandardCampaignForm({
    formId: 'host-event-form',
    feedbackId: 'host-event-feedback',
    source: 'events-page',
    actionType: 'host_event_request',
    successMessage: 'Thank you for offering to host. Our team will follow up with next steps.',
    errorMessage: 'We could not submit your host request right now. Please try again or use the mailto fallback link.',
    invalidMessage: 'Please complete all required host event fields.'
  });
}

function setupStoryForm() {
  wireStandardCampaignForm({
    formId: 'story-form',
    feedbackId: 'story-feedback',
    source: 'contact-page',
    actionType: 'story_submission',
    successMessage: 'Thank you for sharing your story. The campaign team has received it.',
    errorMessage: 'We could not submit your story right now. Please try again or use the mailto fallback link.',
    invalidMessage: 'Please complete all required story fields.'
  });
}

function setupVolunteerIntakeForm() {
  wireStandardCampaignForm({
    formId: 'volunteer-intake-form',
    feedbackId: 'volunteer-intake-feedback',
    source: 'contact-page',
    actionType: 'volunteer_intake',
    successMessage: 'Thanks for stepping up. A volunteer coordinator will contact you soon.',
    errorMessage: 'We could not submit your volunteer intake right now. Please try again or use the mailto fallback link.',
    invalidMessage: 'Please complete all required volunteer intake fields.'
  });
}

function setupQuickForms() {
  wireSimpleEmailForm({
    formId: 'quick-signup-form',
    emailId: 'quick-signup-email',
    feedbackId: 'quick-signup-feedback',
    source: 'homepage-quick-signup',
    actionType: 'volunteer_intake',
    invalidMessage: 'Please enter a valid email address.',
    pendingMessage: 'Submitting…',
    successMessage: "You're on the list. Thank you!",
    errorMessage: 'Submission failed. Please try again or email volunteer@arafatforcongress.org.'
  });

  wireSimpleEmailForm({
    formId: 'contact-quick-form',
    emailId: 'contact-quick-email',
    feedbackId: 'contact-quick-feedback',
    source: 'contact-page-quick-signup',
    actionType: 'volunteer_intake',
    invalidMessage: 'Please enter a valid email address.',
    pendingMessage: 'Submitting…',
    successMessage: 'Got it! Someone from the team will be in touch.',
    errorMessage: 'Submission failed. Please try again or email volunteer@arafatforcongress.org.'
  });
}

async function loadEndorsements() { /* unchanged */
  const list = document.getElementById("endorsements-list");
  const placeholder = document.getElementById("endorsements-placeholder");
  if (!list || !placeholder) return;
  try {
    const response = await fetch("/data/endorsements.json", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const items = Array.isArray(data.endorsements) ? data.endorsements : [];
    const quotes = Array.isArray(data.supporterQuotes) ? data.supporterQuotes : [];
    const allItems = [...items, ...quotes];
    if (allItems.length === 0) return;
    list.innerHTML = "";
    allItems.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "endorsement-item";
      const title = document.createElement("h3");
      title.textContent = entry.name || "Supporter";
      const text = document.createElement("p");
      text.textContent = entry.note || entry.quote || "";
      item.append(title, text);
      list.appendChild(item);
    });
    placeholder.hidden = true;
    list.hidden = false;
  } catch (_) {}
}

document.addEventListener("DOMContentLoaded", () => {
  getSiteConfig();
  applyEventsPageVisibility();
  rotateShareLine();
  setInterval(rotateShareLine, 7000);
  setupShareIcons();
  setupSignupForm();
  setupVolunteerIntakeForm();
  setupStoryForm();
  setupQuickForms();
  setupEventsNotifyForm();
  setupHostEventForm();
  loadEndorsements();
});
