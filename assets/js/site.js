document.addEventListener('click', e => {
  const btn = e.target.closest('.acc-trigger, .why-toggle');
  if (!btn) return;
  const panel = document.getElementById(btn.getAttribute('aria-controls'));
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!expanded));
  panel.hidden = expanded;
});
