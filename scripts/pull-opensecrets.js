import { writeFile } from 'fs/promises';

const SUMMARY_URL = 'https://www.opensecrets.org/members-of-congress/marilyn-strickland/summary?cid=N00046320';
const GEO_URL = 'https://www.opensecrets.org/members-of-congress/marilyn-strickland/geography?cid=N00046320&cycle=2024';

function extract(regex, text){
  const m = text.match(regex);
  return m ? m[1] : null;
}

async function fetchText(url){
  const res = await fetch(url, { headers:{'User-Agent':'Mozilla/5.0'} });
  if(!res.ok) throw new Error('Request failed '+res.status);
  return await res.text();
}

async function run(){
  try{
    const summaryHtml = await fetchText(SUMMARY_URL);
    const totalRaised = extract(/Total\s+Raised[^$]*\$([0-9,]+)/i, summaryHtml);
    const pacShare = extract(/PAC\s+Contributions[^%]*([0-9.]+)%/i, summaryHtml);
    const updated = extract(/FEC\s+data\s+processed[^0-9]*([0-9-]+)/i, summaryHtml);

    const geoHtml = await fetchText(GEO_URL);
    const outPct = extract(/Out\s+of\s+District[^%]*([0-9.]+)%/i, geoHtml);
    const aipacListed = /AIPAC/i.test(summaryHtml);

    const data = {
      updated_on: updated || new Date().toISOString().slice(0,10),
      total_raised: totalRaised ? Number(totalRaised.replace(/,/g,'')) : null,
      pac_share_pct: pacShare ? Number(pacShare) : null,
      out_of_district_pct: outPct ? Number(outPct) : null,
      aipac_listed_top_contributor: aipacListed
    };
    await writeFile('site/_data/contrast.json', JSON.stringify(data, null, 2));
    console.log('Wrote site/_data/contrast.json');
  }catch(err){
    console.error('Failed to refresh OpenSecrets data:', err.message);
  }
}

run();
