(function(){
  const path = location.pathname.replace(/\/+$/,'');
  document.querySelectorAll('.nav a').forEach(a => {
    const href = new URL(a.getAttribute('href'), location.origin).pathname.replace(/\/+$/,'');
    if (href === path) { a.classList.add('active'); a.setAttribute('aria-current','page'); }
  });
})();
