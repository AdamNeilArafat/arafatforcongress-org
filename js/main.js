const SHARE_LINES = [
  "Share this page. Every new voice shrinks the power of big money."
];

function getShareMessage() {
  const meta = document.querySelector('meta[name="share-message"]');
  const custom = meta ? meta.content.trim() : "";
  return custom || SHARE_LINES[Math.floor(Math.random() * SHARE_LINES.length)];
}

function rotateShareLine() {
  const line = document.getElementById("share-line");
  if (!line) return;
  line.textContent = getShareMessage();
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
        case "x":
          url = `https://twitter.com/intent/tweet?text=${text}%20${shareUrl}`;
          break;
        case "facebook":
          url = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`;
          break;
        case "tiktok":
          url = `https://www.tiktok.com/share?url=${shareUrl}&text=${text}`;
          break;
        case "bluesky":
          url = `https://bsky.app/intent/compose?text=${text}%20${shareUrl}`;
          break;
        case "reddit":
          url = `https://www.reddit.com/submit?url=${shareUrl}&title=${text}`;
          break;
        case "sms":
          url = `sms:?&body=${text}%20${shareUrl}`;
          break;
        case "email":
          url = `mailto:?subject=${text}&body=${shareUrl}`;
          break;
        default:
          url = shareUrl;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    });
  });
}

function setupSignupForm() {
  const form = document.getElementById("campaign-signup-form");
  if (!form) return;

  const emailInput = document.getElementById("signup-email");
  const feedback = document.getElementById("signup-feedback");
  const endpointMeta = document.querySelector('meta[name="campaign-signup-endpoint"]');
  const endpoint = endpointMeta ? endpointMeta.content.trim() : "";

  const setFeedback = (message, type) => {
    feedback.textContent = message;
    feedback.classList.remove("is-success", "is-error");
    if (type) feedback.classList.add(type);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!emailInput.checkValidity()) {
      setFeedback("Please enter a valid email address.", "is-error");
      emailInput.focus();
      return;
    }

    if (!endpoint || endpoint === "SIGNUP_ENDPOINT_PLACEHOLDER") {
      setFeedback("Signup is almost ready. Please check back soon.", "is-error");
      return;
    }

    const data = {
      firstName: form.firstName.value.trim(),
      email: form.email.value.trim(),
      source: "homepage"
    };

    setFeedback("Submitting...", null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`Signup failed with status ${response.status}`);
      }

      setFeedback("Thanks for signing up. You’re on the list.", "is-success");
      form.reset();
    } catch (error) {
      setFeedback("Could not submit right now. Please try again shortly.", "is-error");
    }
  });
}

async function loadEndorsements() {
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
  } catch (_) {
    // Keep placeholder message.
  }
}

document.addEventListener("DOMContentLoaded", () => {
  rotateShareLine();
  setInterval(rotateShareLine, 7000);
  setupShareIcons();
  setupSignupForm();
  loadEndorsements();
});
