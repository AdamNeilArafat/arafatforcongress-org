document.addEventListener('DOMContentLoaded', () => {
  fetch('/footer.html')
    .then(resp => resp.text())
    .then(html => {
      const container = document.getElementById('footer-placeholder');
      if (container) {
        container.innerHTML = html;
        const yr = document.getElementById('yr');
        if (yr) yr.textContent = new Date().getFullYear();
      }
    });
});
