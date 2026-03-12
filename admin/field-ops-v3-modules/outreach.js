export const tmplVars=['first_name','last_name','full_name','phone','email','district'];
export function renderTemplate(t,r){let out=t||'';tmplVars.forEach(v=>{out=out.replaceAll(`{${v}}`,r[v]||'');});return out;}
export function dispositionToStatus(d){if(d==='follow_up')return 'follow_up';if(d==='pledged')return 'donation_pledged';if(d==='contacted')return 'contacted';return null;}
