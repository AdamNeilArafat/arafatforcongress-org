import { KEYS, read, write } from './storage.js';
const defaultModel='gemini-2.0-flash-lite';
const backoff=[15000,30000,60000,120000];
export function buildPrompt(record){
  return `You are enriching a voter/contact record for field organizing. Return JSON only (no markdown) with this schema:\n{"phone":"","email":"","lat":0,"lng":0,"district":"","donation_likelihood":"low|medium|high","volunteer_likelihood":"low|medium|high","tags":["..."]}\nRecord:\n${JSON.stringify(record)}\nRules: leave unknown as empty string/null; do not invent certainty; include tags for likely interests.`;
}
export function parseEnrichmentText(text){
  if(!text) return null;
  const s=String(text); const start=s.indexOf('{'); const end=s.lastIndexOf('}');
  if(start<0||end<0) return null;
  try{const j=JSON.parse(s.slice(start,end+1));if(!j||typeof j!=='object')return null;return {phone:j.phone||'',email:j.email||'',lat:Number(j.lat)||null,lng:Number(j.lng)||null,district:j.district||'',donation_likelihood:j.donation_likelihood||'',volunteer_likelihood:j.volunteer_likelihood||'',tags:Array.isArray(j.tags)?j.tags:[]};}catch{return null;}
}
export async function enrichWithGemini(record,settings){
  const apiKey=localStorage.getItem('gemini_api_key')||''; if(!apiKey) throw new Error('missing_api_key');
  const model=settings.gemini_model||defaultModel;
  const endpoint=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body={contents:[{parts:[{text:buildPrompt(record)}]}],generationConfig:{temperature:0.1,responseMimeType:'application/json'}};
  for(let i=0;i<=backoff.length;i++){
    const resp=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(resp.ok){const data=await resp.json();const text=data?.candidates?.[0]?.content?.parts?.[0]?.text||'';const parsed=parseEnrichmentText(text);if(!parsed) throw new Error('parse_failed');return parsed;}
    if((resp.status===429||resp.status>=500) && i<backoff.length){await new Promise(r=>setTimeout(r,backoff[i]));continue;}
    throw new Error(`gemini_http_${resp.status}`);
  }
}
export function audit(entry){const logs=read(KEYS.enrichmentLog,[]);logs.unshift({ts:new Date().toISOString(),...entry});write(KEYS.enrichmentLog,logs.slice(0,500));}
