// /assets/js/share.js
// Social share URL builders + native share helper (fallback to copy link).

export function shareUrls({ url, title = "", text = "" }) {
  const U = encodeURIComponent(url || location.href);
  const T = encodeURIComponent(text || title || document.title);

  return {
    x: `https://twitter.com/intent/tweet?text=${T}&url=${U}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${U}`,
    reddit: `https://www.reddit.com/submit?url=${U}&title=${T}`,
    // Instagram & TikTok do not support direct web feed shares; use native share/copy.
    copy: url || location.href
  };
}

export async function nativeShare({ url = location.href, title = document.title, text = "" } = {}) {
  if (navigator.share) {
    try { await navigator.share({ url, title, text }); return true; } catch { /* user canceled */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    alert("Link copied to clipboard");
    return true;
  } catch {
    // no clipboard; last resort: open window to show URL
    window.open(url, "_blank", "noopener");
    return false;
  }
}
