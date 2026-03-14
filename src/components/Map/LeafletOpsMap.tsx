import React from 'react';

declare global { interface Window { L: any } }

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

function ensureLeaflet() {
  if (document.querySelector(`script[src="${LEAFLET_JS}"]`)) return;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = LEAFLET_CSS;
  document.head.appendChild(css);
  const script = document.createElement('script');
  script.src = LEAFLET_JS;
  document.body.appendChild(script);
}

export default function LeafletOpsMap() {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    ensureLeaflet();
    const timer = setInterval(() => {
      if (!window.L || !ref.current || (ref.current as any)._leaflet_id) return;
      const map = window.L.map(ref.current).setView([47.2529, -122.4443], 11);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);

      const contacts = [
        { name: 'Sample Contact A', lat: 47.2529, lon: -122.4443 },
        { name: 'Sample Contact B', lat: 47.2687, lon: -122.4875 },
        { name: 'Sample Contact C', lat: 47.2201, lon: -122.4234 }
      ];
      contacts.forEach((c) => window.L.marker([c.lat, c.lon]).addTo(map).bindPopup(`<strong>${c.name}</strong><br/>Canvass status: pending`));

      window.L.polygon([[47.28, -122.52], [47.18, -122.52], [47.18, -122.36], [47.28, -122.36]], { color: '#2563eb' }).addTo(map).bindPopup('Sample turf polygon');
      clearInterval(timer);
    }, 100);

    return () => clearInterval(timer);
  }, []);

  return <div ref={ref} style={{ height: 360, borderRadius: 8, border: '1px solid #ccc' }} />;
}
