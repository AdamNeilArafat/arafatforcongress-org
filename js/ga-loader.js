(function loadGA4(){
  const meta = document.querySelector('meta[name="ga-measurement-id"]');
  const measurementId = meta && meta.content && !meta.content.includes('REPLACE')
    ? meta.content.trim()
    : null;

  if (!measurementId) {
    console.warn('GA4 measurement ID missing or placeholder; analytics loader skipped.');
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){
    window.dataLayer.push(arguments);
  };

  window.gtag('js', new Date());

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.onload = () => {
    window.gtag('config', measurementId, {
      transport_type: 'beacon',
      send_page_view: true
    });
  };

  document.head.appendChild(script);
})();
