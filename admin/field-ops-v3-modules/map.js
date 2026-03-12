let map,layer;
const colors={not_contacted:'#9ca3af',contacted:'#22c55e',follow_up:'#f59e0b',donation_pledged:'#eab308'};
const icon=(c)=>L.divIcon({html:`<div style="width:14px;height:14px;border-radius:999px;background:${c};border:2px solid #fff"></div>`,className:'',iconSize:[14,14]});
export function initMap(el='field-map'){if(!map){map=L.map(el).setView([47.08,-122.55],10);L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{attribution:'©OpenStreetMap ©CARTO'}).addTo(map);layer=L.layerGroup().addTo(map);}return map;}
export function renderMap(records,onAction,filters={status:'all'}){if(!map) return;layer.clearLayers();records.forEach(r=>{if(!r.lat||!r.lng)return;if(filters.status!=='all'&&r.status!==filters.status)return;
const m=L.marker([r.lat,r.lng],{icon:icon(colors[r.status]||colors.not_contacted)}).addTo(layer);
m.bindPopup(`<b>${r.full_name||''}</b><br>${r.address||''}<br>${r.phone||''} ${r.email||''}<br>Status: ${r.status}<br><button data-action='contacted' data-id='${r.id}'>Mark Contacted</button> <button data-action='follow_up' data-id='${r.id}'>Mark Follow-up</button> <button data-action='donation_pledged' data-id='${r.id}'>Mark Donation</button>`);
});
map.off('popupopen');map.on('popupopen',e=>{e.popup.getElement().querySelectorAll('button[data-id]').forEach(b=>b.onclick=()=>onAction(b.dataset.id,b.dataset.action));});
}
