export const KEYS = {
  records:'field_ops_v3_records', events:'field_ops_v3_events', territories:'field_ops_v3_territories',
  volunteers:'field_ops_v3_volunteers', settings:'field_ops_v3_settings', enrichmentLog:'field_ops_v3_enrichment_log', activity:'field_ops_v3_activity', outreach:'field_ops_v3_outreach'
};
export const read=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback;}catch{return fallback;}};
export const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
export function logActivity(message,meta={}){const a=read(KEYS.activity,[]);a.unshift({ts:new Date().toISOString(),message,meta});write(KEYS.activity,a.slice(0,300));}
