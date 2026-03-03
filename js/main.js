const SHARE_LINES = [
  "Share this page. Every new voice shrinks the power of big money."
];

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
  const endpoint = signupEndpoint;
  if (!endpoint) throw new Error('missing-endpoint');

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload)
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = input ? input.value.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFeedback(feedback, config.invalidMessage, 'is-error');
      return;
    }

    setFeedback(feedback, config.pendingMessage, null);
    try {
      await submitSignup({ email, source: config.source, firstName: '' });
      setFeedback(feedback, config.successMessage, 'is-success');
      form.reset();
      track(config.trackEvent || 'volunteer_submit', { source: config.source, status: 'success' });
    } catch (_) {
      setFeedback(feedback, config.errorMessage, 'is-error');
      track(config.trackEvent || 'volunteer_submit', { source: config.source, status: 'error' });
    }
  });
}

function setupSignupForm() {
  const form = document.getElementById("campaign-signup-form");
  if (!form) return;

  const emailInput = document.getElementById("signup-email");
  const feedback = document.getElementById("signup-feedback");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!emailInput.checkValidity()) {
      setFeedback(feedback, "Please enter a valid email address.", "is-error");
      return;
    }

    const data = {
      firstName: form.firstName ? form.firstName.value.trim() : "",
      email: form.email.value.trim(),
      source: "homepage"
    };

    setFeedback(feedback, "Submitting...", null);
    try {
      await submitSignup(data);
      setFeedback(feedback, "Thanks for signing up. You’re on the list.", "is-success");
      form.reset();
      track('volunteer_submit', { source: 'homepage', status: 'success' });
    } catch (_) {
      setFeedback(feedback, "We couldn’t submit right now. Please try again or email volunteer@arafatforcongress.org.", "is-error");
      track('volunteer_submit', { source: 'homepage', status: 'error' });
    }
  });
}

function setupEventsNotifyForm() {
  wireSimpleEmailForm({
    formId: 'event-notify-form',
    emailId: 'notify-email',
    feedbackId: 'notify-feedback',
    source: 'events-notify',
    trackEvent: 'events_notify_submit',
    invalidMessage: 'Please enter a valid email.',
    pendingMessage: 'Submitting…',
    successMessage: 'Thanks — we’ll notify you when events are scheduled near you.',
    errorMessage: 'We couldn’t save that request. Please try again or email volunteer@arafatforcongress.org.'
  });
}

function setupQuickForms() {
  wireSimpleEmailForm({
    formId: 'quick-signup-form',
    emailId: 'quick-signup-email',
    feedbackId: 'quick-signup-feedback',
    source: 'homepage-quick-signup',
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
  rotateShareLine();
  setInterval(rotateShareLine, 7000);
  setupShareIcons();
  setupSignupForm();
  setupQuickForms();
  setupEventsNotifyForm();
  loadEndorsements();
});
