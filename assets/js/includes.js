document.addEventListener('DOMContentLoaded', async () => {
  const blocks = document.querySelectorAll('[data-include]');
  for (const el of blocks) {
    const file = el.getAttribute('data-include');
    try {
      const res = await fetch(file, { cache: 'no-store' });
      if (!res.ok) throw new Error(file);
      el.innerHTML = await res.text();
    } catch (e) {
      el.innerHTML = '<!-- include failed: ' + e.message + ' -->';
    }
  }
});
