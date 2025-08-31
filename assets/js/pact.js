document.addEventListener('click', e => {
  const btn = e.target.closest('[data-toggle]');
  if (!btn) return;
  const id = btn.getAttribute('aria-controls');
  const panel = document.getElementById(id);
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!expanded));
  if (panel) panel.hidden = expanded;
});
