(function () {
  const lines = [
    "They don’t represent you. They represent their donors.",
    "85% of her money comes from outside WA-10. That’s not representation.",
    "Every dollar they take has a string attached. Ours don’t.",
    "Executives have PACs. We have people.",
    "They’re protecting profits. We’re protecting families.",
    "They cash checks. We cash pay stubs.",
    "August 4: The rich have lobbyists. We have our vote.",
    "They’ve taken enough. August 4 is payday for the working class.",
    "They write checks. We write history.",
    "They thought no one was watching. We are.",
    "On August 4, WA-10 decides if big money wins or we do."
  ];

  // 1) Pick one message per page load
  const pick = lines[Math.floor(Math.random() * lines.length)];
  const tag = " #WA10 #PeopleOverPACs";

  // 2) Base URL + UTM
  const wrapper = document.querySelector('.share-buttons');
  if (!wrapper) return;
  const baseUrl = (wrapper.dataset.shareUrl || window.location.href).replace(/\/?$/, '/');

  const makeUrl = (network) => {
    const u = new URL(baseUrl);
    u.searchParams.set('utm_source', network);
    u.searchParams.set('utm_medium', 'social');
    u.searchParams.set('utm_campaign', 'grassroots');
    return u.toString();
  };

  // 3) Builders per network
  const shareBuilders = {
    bluesky: (text, url) =>
      `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text}${tag} ${url}`)}`,
    x: (text, url) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text + tag)}&url=${encodeURIComponent(url)}`,
    facebook: (_, url) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    linkedin: (_, url) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    email: (text, url) =>
      `mailto:?subject=${encodeURIComponent("WA-10: People over PACs")}&body=${encodeURIComponent(text + "\n\n" + url)}`,
    sms: (text, url) => {
      const body = encodeURIComponent(`${text} ${url}`);
      return /iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? `sms:&body=${body}`
        : `sms:?body=${body}`;
    }
  };

  // 4) Apply hrefs
  document.querySelectorAll('.share-btn[data-network]').forEach(a => {
    const net = a.getAttribute('data-network');
    const builder = shareBuilders[net];
    if (!builder) return;
    const url = makeUrl(net);
    a.setAttribute('href', builder(pick, url));
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  });

  // 5) Copy helper
  const copyBtn = document.getElementById('copy-share');
  if (copyBtn) {
    const copyUrl = makeUrl('copy');
    const toCopy = `${pick}${tag} ${copyUrl}`;
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(toCopy);
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
      } catch {
        copyBtn.textContent = "Press Ctrl/Cmd+C";
        setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
      }
    });
  }
})();
