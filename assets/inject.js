(async () => {
  // attach global stylesheet if not present
  if (!document.querySelector('link[href="/assets/site.css"]')) {
    const l=document.createElement('link'); l.rel='stylesheet'; l.href='/assets/site.css';
    document.head.appendChild(l);
  }
  // inject social bar to top of body
  const res = await fetch('/partials/social.html'); const html = await res.text();
  const wrap = document.createElement('div'); wrap.innerHTML = html;
  document.body.insertBefore(wrap.firstElementChild, document.body.firstChild);
})();
