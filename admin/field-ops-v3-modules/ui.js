export const $=(s,p=document)=>p.querySelector(s);
export const $$=(s,p=document)=>[...p.querySelectorAll(s)];
export function setTab(id){$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===id));$$('.tab-panel').forEach(p=>p.classList.toggle('hidden',p.id!==`tab-${id}`));}
export function countdown(target='2026-11-03'){const ms=new Date(target)-new Date();return Math.max(0,Math.ceil(ms/86400000));}
