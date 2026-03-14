import { KEYS, read, write } from './storage.js';
const backoff=[15000,30000,60000,120000];

export function parseEnrichmentText(text){
  if(!text) return null;
  const s=String(text); const start=s.indexOf('{'); const end=s.lastIndexOf('}');
  if(start<0||end<0) return null;
  try{const j=JSON.parse(s.slice(start,end+1));if(!j||typeof j!=='object')return null;return {phone:j.phone||'',email:j.email||'',lat:Number(j.lat)||null,lng:Number(j.lng)||null,district:j.district||'',donation_likelihood:j.donation_likelihood||'',volunteer_likelihood:j.volunteer_likelihood||'',tags:Array.isArray(j.tags)?j.tags:[]};}catch{return null;}
}

export async function enrichWithApi(record,settings){
  const apiKey=settings.enrichment_api_key||localStorage.getItem('enrichment_api_key')||''; if(!apiKey) throw new Error('missing_api_key');
  const endpoint=(settings.enrichment_api_url||'').trim(); if(!endpoint) throw new Error('missing_api_url');
  const body={record};
  for(let i=0;i<=backoff.length;i++){
    const resp=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify(body)});
    if(resp.ok){
      const data=await resp.json();
      const candidate=data?.enrichment||data?.data||data;
      if(candidate&&typeof candidate==='object'&&!Array.isArray(candidate)){
        const normalized={phone:candidate.phone||'',email:candidate.email||'',lat:Number(candidate.lat??candidate.latitude)||null,lng:Number(candidate.lng??candidate.longitude)||null,district:candidate.district||'',donation_likelihood:candidate.donation_likelihood||'',volunteer_likelihood:candidate.volunteer_likelihood||'',tags:Array.isArray(candidate.tags)?candidate.tags:[]};
        return normalized;
      }
      const parsed=parseEnrichmentText(data?.text||data?.message||'');
      if(!parsed) throw new Error('parse_failed');
      return parsed;
    }
    if((resp.status===429||resp.status>=500) && i<backoff.length){await new Promise(r=>setTimeout(r,backoff[i]));continue;}
    throw new Error(`enrichment_http_${resp.status}`);
  }
}

export function audit(entry){const logs=read(KEYS.enrichmentLog,[]);logs.unshift({ts:new Date().toISOString(),...entry});write(KEYS.enrichmentLog,logs.slice(0,500));}
