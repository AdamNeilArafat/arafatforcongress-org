document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('header-include');
  const footer = document.getElementById('footer-include');
  if (header) {
    fetch('/partials/header.html').then(res => res.text()).then(html => { header.innerHTML = html; });
  }
  if (footer) {
    fetch('/partials/footer.html').then(res => res.text()).then(html => { footer.innerHTML = html; });
  }
});
