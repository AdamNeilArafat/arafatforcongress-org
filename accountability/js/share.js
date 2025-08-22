export function shareUrls({ url = location.href, title = "", text = "" }) {
  const U = encodeURIComponent(url);
  const T = encodeURIComponent(text || title || document.title);
  return {
    x: `https://twitter.com/intent/tweet?text=${T}&url=${U}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${U}`,
    reddit: `https://www.reddit.com/submit?url=${U}&title=${T}`,
    copy: url
  };
}

export async function nativeShare({ url = location.href, title = document.title, text = "" } = {}) {
  if (navigator.share) {
    try { await navigator.share({ url, title, text }); return true; } catch {}
  }
  try { await navigator.clipboard.writeText(url); alert("Link copied to clipboard"); return true; } catch {}
  window.open(url, "_blank", "noopener"); return false;
}
