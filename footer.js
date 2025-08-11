/* footer.js */
(function () {
  const ATTRIBUTION =
    'Paid for by Adam Neil Arafat for Congress, PO Box XXXX, [City, WA ZIP]. Treasurer: [Name].';

  // Minimal built‑in styles so it’s readable everywhere
  const css = `
    #site-attribution{margin-top:2rem;padding:12px 16px;font-size:.9rem;line-height:1.4;
      color:#374151;background:#F3F4F6;border-top:1px solid #E5E7EB}
    #site-attribution .inner{max-width:1000px;margin:0 auto;padding:0 12px}
    #site-attribution a{text-decoration:underline}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const el = document.createElement('footer');
  el.id = 'site-attribution';
  el.setAttribute('role', 'contentinfo');
  el.innerHTML = `<div class="inner">${ATTRIBUTION}</div>`;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
  } else {
    document.body.appendChild(el);
  }
})();
