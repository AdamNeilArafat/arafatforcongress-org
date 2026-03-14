const aliases={fname:'first_name',firstname:'first_name',lname:'last_name',lastname:'last_name',regzipcode:'zip',address:'address',regcity:'city',regstate:'state',phone:'phone',email:'email'};
const now=()=>new Date().toISOString();
export function normalizeRecord(raw={}){
  const g=(...keys)=>{for(const k of keys){const v=raw[k]??raw[k?.toLowerCase?.()];if(v!==undefined&&String(v).trim()!=='')return String(v).trim();}return '';};
  const first_name=g('first_name','firstName','fname','firstname');
  const last_name=g('last_name','lastName','lname','lastname');
  return {
    id:g('id','statevoterid')||`v_${Math.random().toString(36).slice(2,10)}`,
    first_name,last_name,full_name:g('full_name')||`${first_name} ${last_name}`.trim(),
    address:g('address'),city:g('city','regcity'),state:g('state','regstate')||'WA',zip:g('zip','regzipcode'),
    phone:g('phone','phone1','mobilephone'),email:g('email','emailaddress'),lat:parseFloat(g('lat','latitude'))||null,lng:parseFloat(g('lng','lon','longitude'))||null,
    district:g('district','congressionaldistrict'),precinct:g('precinct','precinctcode'),status:g('status')||'not_contacted',priority:g('priority')||'normal',
    tags:Array.isArray(raw.tags)?raw.tags:String(g('tags')).split(';').map(s=>s.trim()).filter(Boolean),notes:g('notes'),assigned_volunteer:g('assigned_volunteer','lastContactBy'),
    donation_pledged:g('donation_pledged')==='true'||g('status')==='donation_pledged',donation_likelihood:g('donation_likelihood'),volunteer_likelihood:g('volunteer_likelihood'),
    last_contacted_at:g('last_contacted_at','lastContact'),contact_attempts:parseInt(g('contact_attempts'))||0,source:g('source')||'local',created_at:g('created_at')||now(),updated_at:now()
  };
}
export function normalizeHeader(h){const k=String(h||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_');return aliases[k]||k;}
export function hasImportableValues(record={}){return Boolean(record.first_name||record.last_name||record.full_name||record.address||record.city||record.zip||record.phone||record.email||record.id);}
export function fromVoterData(voters=[]){return voters.map(v=>normalizeRecord(v)).filter(hasImportableValues);}
export function mergeRecord(base,patch){const out={...base};for(const [k,v] of Object.entries(patch||{})){if(k==='tags'){const set=new Set([...(base.tags||[]),...((v||[]).filter(Boolean))]);out.tags=[...set];continue;}if(v===null||v===undefined)continue;if(typeof v==='string'&&v.trim()==='')continue;out[k]=v;}out.updated_at=new Date().toISOString();return out;}
