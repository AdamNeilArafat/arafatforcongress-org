document.addEventListener('click', e => {
  const btn = e.target.closest('.acc-trigger, .why-toggle');
  if (!btn) return;
  const panel = document.getElementById(btn.getAttribute('aria-controls'));
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!expanded));
  panel.hidden = expanded;
});

document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname.replace(/\/$/, '/index.html');
  const link = document.querySelector(`nav a[href="${path}"]`);
  if (link) link.setAttribute('aria-current', 'page');
});
