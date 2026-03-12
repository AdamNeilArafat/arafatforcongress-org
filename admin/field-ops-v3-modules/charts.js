let velocityChart,statusChart,trendChart;
export function renderCharts(records,events){
  const byDay={};for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);byDay[d.toISOString().slice(0,10)]=0;}
  (events||[]).forEach(e=>{const k=String(e.date||'').slice(0,10);if(k in byDay) byDay[k]+=Number(e.contacts_completed||1);});
  const labels=Object.keys(byDay),vals=Object.values(byDay);
  const s={not_contacted:0,contacted:0,follow_up:0,donation_pledged:0};(records||[]).forEach(r=>s[r.status]=(s[r.status]||0)+1);
  const rc=(inst,ctx,config)=>{if(inst)inst.destroy();return new Chart(ctx,config);};
  velocityChart=rc(velocityChart,document.getElementById('velocityChart'),{type:'bar',data:{labels,datasets:[{label:'7-day contacts',data:vals,backgroundColor:'#10b981'}]},options:{plugins:{legend:{display:false}}}});
  statusChart=rc(statusChart,document.getElementById('statusChart'),{type:'doughnut',data:{labels:Object.keys(s),datasets:[{data:Object.values(s),backgroundColor:['#6b7280','#22c55e','#f59e0b','#eab308']}]} });
  trendChart=rc(trendChart,document.getElementById('trendChart'),{type:'line',data:{labels,datasets:[{label:'Trend',data:vals,borderColor:'#38bdf8'}]},options:{plugins:{legend:{display:false}}}});
}
