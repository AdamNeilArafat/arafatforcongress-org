(function loadGA4(){
  const existingConfig = window.AFC_CONFIG || {};
  const gaMeta = document.querySelector('meta[name="ga-measurement-id"]');
  const endpointMeta = document.querySelector('meta[name="campaign-signup-endpoint"]');
  const config = {
    gaMeasurementId: (existingConfig.gaMeasurementId || (gaMeta ? gaMeta.content : '') || '').trim(),
    signupEndpoint: (existingConfig.signupEndpoint || (endpointMeta ? endpointMeta.content : '') || '').trim()
  };
  window.AFC_CONFIG = config;

  const measurementId = config.gaMeasurementId;
  if (!measurementId || measurementId.includes('REPLACE') || measurementId === 'G-PLACEHOLDER') {
    console.error('GA4 measurement ID missing; analytics loader skipped.');
    return;
  }

  window.__GA_MEASUREMENT_ID__ = measurementId;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
  window.gtag('js', new Date());

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.onload = () => {
    window.gtag('config', measurementId, { transport_type: 'beacon', send_page_view: true });
  };

  document.head.appendChild(script);
})();
