/* Skylinks Pro Shop Orders — pulls Lightspeed Retail reports (read only) and builds the order run. */
const LS='https://us.merchantos.com';
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const pretty=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const short=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
function defaultWeekEnd(){const t=parseISO(window.SkylinksUtils.dates.todayPacific());const day=t.getDay();return addDays(t,day===0?-7:-day)}
function parseISO(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)}

const params=new URLSearchParams(location.search);
const WE=params.get('w')?parseISO(params.get('w')):defaultWeekEnd();
const META={pw:[iso(addDays(WE,-13)),iso(addDays(WE,-7))],weekEnd:iso(WE),d7:[iso(addDays(WE,-6)),iso(WE)],w4:[iso(addDays(WE,-27)),iso(WE)],prev:[iso(addDays(WE,-34)),iso(addDays(WE,-28))],ly:[iso(addDays(WE,-370)),iso(addDays(WE,-364))],nextMonday:pretty(addDays(WE,1))};
META.d7lbl=short(addDays(WE,-6))+' – '+short(WE);META.pwlbl=short(addDays(WE,-13))+' – '+short(addDays(WE,-7));
META.days=[0,1,2,3,4,5,6].map(i=>{const d=addDays(WE,-6+i);return [iso(d),d.toLocaleDateString('en-US',{weekday:'short'})]});

const $=id=>document.getElementById(id);
function setStatus(tag,html){$('stTag').textContent=tag;$('status').innerHTML=html}
const dlog=(lvl,msg,data)=>{try{window.SkylinksUtils.logEvent(lvl,'orders',msg,data)}catch(e){}};
function setLoad(msg,frac){$('loadMsg').textContent=msg;if(frac!=null)$('loadBar').style.width=Math.round(frac*100)+'%'}
function gmailUrl(m){const e=encodeURIComponent;return 'https://mail.google.com/mail/?view=cm&fs=1&to='+e(m.to||'')+'&su='+e(m.subject)+'&body='+e(m.body)}

/* ---------- functions injected into the Lightspeed tab (same-origin, uses the signed-in session) ---------- */
/* Lightspeed now embeds each report's rows as JSON (listing_row_values); the visible table no longer has cost columns. */
async function lsSetup(){
  const grab=h=>{const i=h.indexOf('listing_row_values');if(i<0)return null;const s=h.indexOf('[',i);if(s<0)return null;let dep=0,j=s,inS=false,esc=false;for(;j<h.length;j++){const c=h[j];if(inS){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')inS=false;continue}if(c==='"')inS=true;else if(c==='['||c==='{')dep++;else if(c===']'||c==='}'){dep--;if(dep===0)break}}try{return JSON.parse(h.slice(s,j+1))}catch(e){return null}};
  const pages=h=>{const m=h.match(/listing\.page_count\s*=\s*(\d+)/);return m?+m[1]:1};
  const num=x=>parseFloat(String(x==null?'':x).replace(/[$,%]/g,''))||0;
  const all=async(u,max)=>{const out=[];let n=1;for(let p=1;p<=Math.min(n,max||200);p++){const h=await fetch(u+'&page='+p).then(r=>r.text());const rows=grab(h);if(!rows)return p===1?null:out;if(p===1)n=pages(h);out.push(...rows);if(!rows.length)break}return out};
  const h=await fetch('/?name=reports.sales.listings.item&form_name=listing&shop_id=1').then(r=>r.text());
  const rep=new DOMParser().parseFromString(h,'text/html');
  if(rep.querySelector('input[type=password]')||!rep.querySelector('select[name=vendor_id]'))return {login:true};
  const vendors=[...rep.querySelector('select[name=vendor_id]').options].filter(o=>o.value!=='-1'&&o.value!=='').map(o=>({id:o.value,name:o.text.trim()}));
  const bx=await all('/?name=item.listings.items&form_name=listing&shop_id=1&vendor_id=-1&item_type=box&__sort=description&__sort_dir=ASC',25)||[];
  return {vendors,boxes:bx.filter(r=>+r.box===1||r.box==null).map(r=>r.description)};
}
async function lsVendor(id,ranges){
  const grab=h=>{const i=h.indexOf('listing_row_values');if(i<0)return null;const s=h.indexOf('[',i);if(s<0)return null;let dep=0,j=s,inS=false,esc=false;for(;j<h.length;j++){const c=h[j];if(inS){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')inS=false;continue}if(c==='"')inS=true;else if(c==='['||c==='{')dep++;else if(c===']'||c==='}'){dep--;if(dep===0)break}}try{return JSON.parse(h.slice(s,j+1))}catch(e){return null}};
  const pages=h=>{const m=h.match(/listing\.page_count\s*=\s*(\d+)/);return m?+m[1]:1};
  const num=x=>parseFloat(String(x==null?'':x).replace(/[$,%]/g,''))||0;
  const all=async(u,max)=>{const out=[];let n=1;for(let p=1;p<=Math.min(n,max||200);p++){const h=await fetch(u+'&page='+p).then(r=>r.text());const rows=grab(h);if(!rows)return p===1?null:out;if(p===1)n=pages(h);out.push(...rows);if(!rows.length)break}return out};
  const out={};
  for(const [k,[s,e]] of Object.entries(ranges)){
    const rows=await all('/?name=reports.sales.listings.item&form_name=listing&shop_id=1&__sort=sold&__sort_dir=DESC&category_id=-1&vendor_id='+id+'&start_date='+s+'&end_date='+e,30)||[];
    out[k]=rows.map(r=>[String(r.description||'').trim(),num(r.qoh),num(r.qout),num(r.total),num(r.cost),num(r.subtotal_w_discount)]).filter(r=>r[0]);
  }
  return out;
}
async function lsCats(ranges){
  const grab=h=>{const i=h.indexOf('listing_row_values');if(i<0)return null;const s=h.indexOf('[',i);if(s<0)return null;let dep=0,j=s,inS=false,esc=false;for(;j<h.length;j++){const c=h[j];if(inS){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')inS=false;continue}if(c==='"')inS=true;else if(c==='['||c==='{')dep++;else if(c===']'||c==='}'){dep--;if(dep===0)break}}try{return JSON.parse(h.slice(s,j+1))}catch(e){return null}};
  const pages=h=>{const m=h.match(/listing\.page_count\s*=\s*(\d+)/);return m?+m[1]:1};
  const num=x=>parseFloat(String(x==null?'':x).replace(/[$,%]/g,''))||0;
  const all=async(u,max)=>{const out=[];let n=1;for(let p=1;p<=Math.min(n,max||200);p++){const h=await fetch(u+'&page='+p).then(r=>r.text());const rows=grab(h);if(!rows)return p===1?null:out;if(p===1)n=pages(h);out.push(...rows);if(!rows.length)break}return out};
  const out={};
  for(const [k,[s,e]] of Object.entries(ranges)){
    const rows=await all('/?name=reports.sales.listings.sales_category&form_name=listing&shop_id=1&category_id=-1&start_date='+s+'&end_date='+e,6)||[];
    out[k]=rows.map(r=>[String(r.category_name||'').trim(),num(r.qout),num(r.subtotal_w_discount),num(r.cost)]).filter(r=>r[0]);
  }
  return out;
}
async function lsDisc(ranges){
  const grab=h=>{const i=h.indexOf('listing_row_values');if(i<0)return null;const s=h.indexOf('[',i);if(s<0)return null;let dep=0,j=s,inS=false,esc=false;for(;j<h.length;j++){const c=h[j];if(inS){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')inS=false;continue}if(c==='"')inS=true;else if(c==='['||c==='{')dep++;else if(c===']'||c==='}'){dep--;if(dep===0)break}}try{return JSON.parse(h.slice(s,j+1))}catch(e){return null}};
  const pages=h=>{const m=h.match(/listing\.page_count\s*=\s*(\d+)/);return m?+m[1]:1};
  const num=x=>parseFloat(String(x==null?'':x).replace(/[$,%]/g,''))||0;
  const all=async(u,max)=>{const out=[];let n=1;for(let p=1;p<=Math.min(n,max||200);p++){const h=await fetch(u+'&page='+p).then(r=>r.text());const rows=grab(h);if(!rows)return p===1?null:out;if(p===1)n=pages(h);out.push(...rows);if(!rows.length)break}return out};
  const out={};
  for(const [k,[s,e]] of Object.entries(ranges)){
    const rows=await all('/?name=reports.sales.listings.sales_discount&form_name=listing&shop_id=1&start_date='+s+'&end_date='+e,6)||[];
    out[k]=rows.map(r=>[String(r.discount_name||'').trim(),num(r.discount_amount),num(r.qout),num(r.subtotal_w_discount)]).filter(r=>r[0]&&!/^(No Discount|Subtotal)/.test(r[0]));
  }
  return out;
}
async function lsAssets(){
  const grab=h=>{const i=h.indexOf('listing_row_values');if(i<0)return null;const s=h.indexOf('[',i);if(s<0)return null;let dep=0,j=s,inS=false,esc=false;for(;j<h.length;j++){const c=h[j];if(inS){if(esc)esc=false;else if(c==='\\')esc=true;else if(c==='"')inS=false;continue}if(c==='"')inS=true;else if(c==='['||c==='{')dep++;else if(c===']'||c==='}'){dep--;if(dep===0)break}}try{return JSON.parse(h.slice(s,j+1))}catch(e){return null}};
  const pages=h=>{const m=h.match(/listing\.page_count\s*=\s*(\d+)/);return m?+m[1]:1};
  const num=x=>parseFloat(String(x==null?'':x).replace(/[$,%]/g,''))||0;
  const all=async(u,max)=>{const out=[];let n=1;for(let p=1;p<=Math.min(n,max||200);p++){const h=await fetch(u+'&page='+p).then(r=>r.text());const rows=grab(h);if(!rows)return p===1?null:out;if(p===1)n=pages(h);out.push(...rows);if(!rows.length)break}return out};
  const rows=await all('/?name=reports.inventory.listings.assets&form_name=listing&shop_id=1&show_category=off&qty=on',120)||[];
  return rows.map(r=>[String(r.description||'').trim(),num(r.quantity),num(r.cost)]);
}

/* ---------- pull ---------- */
async function getLsTab(){
  let [tab]=await chrome.tabs.query({url:LS+'/*'});
  if(!tab){tab=await chrome.tabs.create({url:LS+'/?form_name=ui_tab&tab=reports',active:false});
    await new Promise(res=>{const f=(id,info)=>{if(id===tab.id&&info.status==='complete'){chrome.tabs.onUpdated.removeListener(f);res()}};chrome.tabs.onUpdated.addListener(f);setTimeout(res,20000)})}
  return tab;
}
async function run(tab,func,args=[]){try{const [r]=await chrome.scripting.executeScript({target:{tabId:tab.id},func,args});return r.result}catch(e){dlog('error','Lightspeed reader failed: '+func.name,e);throw e}}
async function pull(){
  setLoad('Connecting to Lightspeed…',0.02);
  const tab=await getLsTab();
  const setup=await run(tab,lsSetup);
  dlog('info','pull: setup read',{vendors:setup&&setup.vendors?setup.vendors.length:0,login:!!(setup&&setup.login)});
  if(!setup||setup.login)throw new Error('LOGIN');
  const sales={};const vs=setup.vendors;
  for(let i=0;i<vs.length;i++){
    setLoad(`Reading sales: ${vs[i].name} (${i+1} of ${vs.length})`,0.08+0.9*i/vs.length);
    sales[vs[i].name]=await run(tab,lsVendor,[vs[i].id,{w4:META.w4,d7:META.d7}]);
  }
  setLoad('Reading category totals and trends…',0.9);
  const cr={d7:META.d7,w4:META.w4,prev:META.prev,ly:META.ly,pw:META.pw};META.days.forEach((d,i)=>cr['day'+i]=[d[0],d[0]]);
  const cats=await run(tab,lsCats,[cr]);
  setLoad('Reading discounts and comps…',0.94);
  const disc=await run(tab,lsDisc,[{d7:META.d7,w4:META.w4,pw:META.pw}]);
  setLoad('Reading stock value…',0.96);
  const assets=await run(tab,lsAssets);
  const nRows=Object.values(sales).reduce((a,v)=>a+((v&&v.w4)||[]).length,0);
  dlog('info','pull: sales rows read',{rows:nRows});
  if(!nRows)throw new Error('EMPTY');
  const raw={pulledAt:Date.now(),boxes:setup.boxes,sales,cats,disc,assets};
  await chrome.storage.local.set({['run2-'+META.weekEnd]:raw});
  return raw;
}

/* ---------- compute ---------- */
const norm=s=>s.toLowerCase().replace(/^\[?case\]?\s*-?\s*/,'').replace(/\s*-\s*(single|serving)\b.*$/,'').replace(/\s*-\s*\d+\s?pk.*$/,'').replace(/[^a-z0-9]/g,'');
function packMap(boxes){const m={};for(const b of boxes){const p=+(b.match(/(\d+)\s?pk/i)||[])[1];if(p)m[norm(b)]=p}return m}
function packFor(name,pm){const k=norm(name);if(pm[k])return pm[k];for(const [rx,p] of PACK_RULES)if(rx.test(name))return p;return 12}
const catOf=n=>{if(/Non-?\s?Alcoholic|Mocktail/i.test(n))return'NA';if(/^(Beer|Seltzer|Cider|Wine|Malt|Hard|Cocktail|Flybird|House Wine|Cantina|Margi|Viano)/.test(n))return'ALC';if(/^(Candy|Snack|Chips|Ice|Cookies|Protein Bar)/.test(n))return'SNK';if(/^(Soda|Juice|Tea|Sportsdrink|Energy|Water|Sparkling|Milk|Protein|Coffee|Crystal|El Jefe|Creatine)/.test(n))return'NA';return'MER'};
const styleOf=n=>/Non-?\s?Alc/i.test(n)?'Non-alcoholic beer':/Modelo|Pacifico|Corona|Tecate|Chelada|Mexican|Calidad|Pachuco/.test(n)?'Mexican lager':/Coors|Miller|Bud|Michelob|Stella|Heineken|Garage|Blue Moon|Guin/.test(n)?'Domestic & import':/Hazy|Haze|Juicy|Dust|IPA|Ipa|IPNA|DIPA|Pale|Hoppy|Torpedo|Racer|Dankness|Bunny|Lil Sumpin/.test(n)?'IPA & hazy':/Lager|Pils|Helles|Fest|Oktober|Blonde|Pool|Cerveza/.test(n)?'Craft lager & pils':'Wheat, sour, stout & other';
const subOf=n=>/^Beer/.test(n)?'Beer':/^Seltzer/.test(n)?'Seltzer':/^Cider/.test(n)?'Cider':/Shooter/.test(n)?'Shooters':/^(Wine Cocktail|Wine - Cocktail|Cocktail|Flybird)|Sabe/.test(n)?'Wine cocktails':/^Wine|House Wine|Viano/.test(n)?'Wine':/^Hard|Malt/.test(n)?'Hard tea, malt & kombucha':'In-house';
// Unlisted vendors get a code that is safe in HTML attributes and selectors; the name is only ever shown through esc().
function codeOf(name){if(NAME2CODE[name])return NAME2CODE[name];const code='X_'+String(name).replace(/[^A-Za-z0-9]/g,c=>'_'+c.charCodeAt(0).toString(16));if(!V[code])V[code]={n:name,m:'email',c:'',e:'',cad:'Unknown',g:2};return code}
function compute(raw){
  const pm=packMap(raw.boxes);const D={};
  for(const [vname,r] of Object.entries(raw.sales)){const v=codeOf(vname);
    for(const [k,rows] of Object.entries(r))for(const [n,stock,sold,rev,cost,net] of rows){const o=D[n]=D[n]||{v,stock,w4:0,d7:0,r4:0,r7:0,c4:0,n4:0};o[k]+=sold;if(k==='w4'){o.r4+=rev;o.c4+=cost;o.n4+=(net||0)}else o.r7+=rev}}
  const I=Object.entries(D).filter(([n,o])=>o.w4>0&&!SERVICE_RX.test(n)).map(([n,o])=>({n:n.replace(/ - Single$/i,'').replace(/\*+$/,'').trim(),full:n,v:o.v,s:o.stock,w4:o.w4,d7:o.d7,r4:o.r4,r7:o.r7,n4:o.n4,c4:o.c4,uc:o.w4?o.c4/o.w4:0,c:catOf(n)}));
  const byc={};I.forEach(i=>(byc[i.c]=byc[i.c]||[]).push(i));
  for(const c in byc){const a=byc[c].sort((x,y)=>y.r4-x.r4);const tot=a.reduce((s,i)=>s+i.r4,0);let cum=0;a.forEach(i=>{cum+=i.r4;i.cls=(cum-i.r4)<0.8*tot?'A':(i.w4<=2?'C':'B')})}
  I.forEach(i=>{i.wk=i.w4/4;const cv=COVER_BY_GROUP[(V[i.v]||{}).g]||1.5;const inh=INHOUSE_RX.test(i.n);i.par=(i.cls==='C'||inh)?0:Math.max(1,Math.ceil(i.wk*cv));i.rep=i.s<0?1:0;i.pk=packFor(i.full,pm);i.inh=inh});
  const cats={};['ALC','NA','SNK','MER'].forEach(c=>cats[c]={u7:0,r7:0,u4:0,r4:0});I.forEach(i=>{const t=cats[i.c];t.u7+=i.d7;t.r7+=i.r7;t.u4+=i.w4;t.r4+=i.r4});
  const top={};for(const c in cats)top[c]=(byc[c]||[]).slice().sort((x,y)=>y.r7-x.r7).slice(0,10).map(i=>[i.n,i.d7,i.r7]);
  const items=I.filter(i=>i.cls!=='C'&&!i.inh).map(i=>[i.n,i.v,i.c,i.s,i.w4,i.d7,i.par,0,i.rep,i.cls,i.pk]);
  const slow=I.filter(i=>i.cls==='C'&&i.s>0).map(i=>[i.n,i.v,i.s,i.w4,Math.round(i.s*i.uc)]).sort((a,b)=>b[4]-a[4]).slice(0,25);
  const up=I.filter(i=>i.d7>=Math.max(5,1.5*i.wk)).sort((a,b)=>b.d7-a.d7).slice(0,20).map(i=>[i.n,i.v,i.d7,Math.round(i.wk*10)/10]);
  const down=I.filter(i=>i.wk>=4&&i.d7<=0.4*i.wk&&!/^(TITL|VWGO)$/.test(i.v)).sort((a,b)=>b.wk-a.wk).slice(0,20).map(i=>[i.n,i.v,i.d7,Math.round(i.wk*10)/10,i.s]);
  const bs={};I.filter(i=>/^Beer/.test(i.full)).forEach(i=>{const k=styleOf(i.full);const t=bs[k]=bs[k]||{u:0,r:0,n:0};t.u+=i.w4;t.r+=i.r4;t.n++});
  const loc={local:{u:0,r:0,n:0},other:{u:0,r:0,n:0}};I.filter(i=>/^Beer/.test(i.full)).forEach(i=>{const t=loc[LOCAL_CODES.includes(i.v)||/Morgan Territory/.test(i.n)?'local':'other'];t.u+=i.w4;t.r+=i.r4;t.n++});
  const as={};I.filter(i=>i.c==='ALC').forEach(i=>{const k=subOf(i.full);const t=as[k]=as[k]||{u:0,r:0,n:0};t.u+=i.w4;t.r+=i.r4;t.n++});
  const neg=I.filter(i=>i.s<0).length;
  const COST={};I.forEach(i=>{if(i.uc>0)COST[i.n]=Math.round(i.uc*100)/100});
  return {DATA:{cats,top,items,slow,up,down,bs,loc,as,neg,count:I.length},COST,MONEY:money(raw,I)};
}

/* ---------- owner numbers (Money tab) ---------- */
function money(raw,I){
  const G=['ALC','NA','SNK','MER'];const grp=n=>/^Alcoholic/.test(n)?'ALC':/^Non-Alcoholic/.test(n)?'NA':/^Food/.test(n)?'SNK':/^Merchandise/.test(n)?'MER':null;const r=Math.round;
  const sumC=rows=>{const o={rounds:0};G.forEach(g=>o[g]={u:0,net:0,cost:0});for(const [n,u,net,cost] of rows||[]){const g=grp(n);if(g){o[g].u+=u;o[g].net+=net;o[g].cost+=cost}if(n==='Golf / Green Fees')o.rounds+=u}G.forEach(g=>{o[g].net=r(o[g].net);o[g].cost=r(o[g].cost)});return o};
  const c=raw.cats||{};const M={cats:{d7:sumC(c.d7),w4:sumC(c.w4),prev:sumC(c.prev),ly:sumC(c.ly),pw:sumC(c.pw)}};
  M.days=META.days.map((d,i)=>{const x=sumC(c['day'+i]);return [d[1],x.rounds||0,G.reduce((a,g)=>a+x[g].net,0)]}).filter(d=>d[1]>0);
  const ds=rows=>{let total=0,comp=0;const top=[];for(const [n,amt,q,after] of rows||[]){total+=amt;if(/100%|Charity|Removed From Inventory|Owner/.test(n)||after===0)comp+=amt;top.push([n.replace(/^[_*X ]+|[_*]+$/g,'').replace(/^X_ ?/,'').trim(),r(amt),q])}top.sort((a,b)=>b[1]-a[1]);return {total:r(total),comp:r(comp),top:top.slice(0,8)}};
  M.disc={d7:ds((raw.disc||{}).d7),w4:ds((raw.disc||{}).w4),pw:ds((raw.disc||{}).pw)};
  const sold=new Set(I.map(i=>i.full));let inv=0,dead=0;const D=[];for(const [n,q,tc] of raw.assets||[]){if(q<=0||tc<=0)continue;inv+=tc;if(!sold.has(n)&&!/^\[CASE\]/.test(n)){dead+=tc;D.push([n.replace(/ - Single$/,''),q,r(tc)])}}D.sort((a,b)=>b[2]-a[2]);
  M.assets={inv:r(inv),dead:r(dead),deadN:D.length,deadTop:D.slice(0,8)};
  const J=I.filter(i=>!INHOUSE_RX.test(i.n));
  M.topProfit=J.filter(i=>i.c4>0&&i.n4>0).map(i=>[i.full.replace(/ - Single$/,''),r(i.n4-i.c4),r((i.n4-i.c4)/i.n4*100)]).sort((a,b)=>b[1]-a[1]).slice(0,8);
  M.belowCost=J.filter(i=>i.c4>0&&i.w4>=10&&i.n4>0&&i.n4<i.c4).map(i=>[i.full.replace(/ - Single$/,''),i.w4,+(i.n4/i.w4).toFixed(2),+(i.c4/i.w4).toFixed(2)]).sort((a,b)=>(a[2]/a[3])-(b[2]/b[3])).slice(0,10);
  const vp={};J.forEach(i=>{const name=(V[i.v]||{}).n||i.v;const t=vp[name]=vp[name]||{net:0,cost:0};t.net+=i.n4;t.cost+=i.c4});
  M.vendors=Object.entries(vp).filter(([v,t])=>t.net>0).map(([v,t])=>[v,r(t.net),r(t.cost)]).sort((a,b)=>b[1]-a[1]).slice(0,14);
  return M;
}

/* ---------- recommendations built from this week's numbers ---------- */
function buildRecs(items,b,per){
  const R=[];const names=a=>a.map(i=>i.n).join(', ');
  const core=items.filter(i=>i.t==='A'&&i.c!=='MER').sort((x,y)=>y.w4-x.w4).slice(0,5);
  if(core.length)R.push(['keep','Keep',`Never run out of your biggest movers: ${names(core)}.`]);
  if(b['IPA & hazy']&&b['IPA & hazy'].n>15)R.push(['cut','Trim',`${b['IPA & hazy'].n} different IPAs and hazies average ${per('IPA & hazy')} sold each in 4 weeks, vs ${per('Mexican lager')} for Mexican lagers. Keep a set number of craft spots and swap the slowest one instead of adding.`]);
  if(b['Non-alcoholic beer']&&b['Non-alcoholic beer'].n>4)R.push(['cut','Trim',`Non-alcoholic beer: ${b['Non-alcoholic beer'].n} items sold ${b['Non-alcoholic beer'].u} total in 4 weeks. Keep the best 3.`]);
  const over=items.filter(i=>i.s>0&&i.w4>0&&i.s/(i.w4/4)>=12).sort((x,y)=>y.s/y.w4-x.s/x.w4)[0];
  if(over)R.push(['watch','Check',`${over.n} shows ${fmt(over.s)} on hand, about ${Math.round(over.s/(over.w4/4))} weeks of sales. Hold reorders until a count confirms it.`]);
  const u=DATA.up[0];if(u)R.push(['add','Add',`${u[0]} sold ${u[2]} last week vs ${u[3]} a week on average. Give it more space.`]);
  return R.slice(0,5);
}

/* ---------- boot ---------- */
async function boot(force){
  $('weekEnd').value=META.weekEnd;
  $('weekEnd').onchange=e=>{if(e.target.value)location.search='?w='+e.target.value+location.hash.replace(/^$/,'')};
  $('refresh').onclick=()=>boot(true);
  $('mWeek').textContent=short(parseISO(META.d7[0]))+' – '+short(parseISO(META.d7[1]));
  let raw=null;
  if(!force){const got=await chrome.storage.local.get('run2-'+META.weekEnd);raw=got['run2-'+META.weekEnd]||null}
  if(!raw){
    $('app').hidden=true;$('loading').hidden=false;setStatus('Lightspeed','Pulling reports…');
    try{raw=await pull()}catch(e){
      dlog(['EMPTY','LOGIN'].includes(String(e.message))?'warn':'error','pull failed',e);
      $('loading').hidden=true;
      if(String(e.message)==='EMPTY')setStatus('No data','Lightspeed returned no sales for this week. Make sure you\'re signed into <a href="'+LS+'" target="_blank">Lightspeed Retail</a>, then press <b>Refresh from Lightspeed</b>.');
      else if(String(e.message)==='LOGIN')setStatus('Sign in','Lightspeed isn\'t signed in. Open <a href="'+LS+'" target="_blank">Lightspeed Retail</a>, sign in, then press <b>Refresh from Lightspeed</b>.');
      else setStatus('Error','Couldn\'t read Lightspeed: '+String(e.message).slice(0,200)+'. Press <b>Refresh from Lightspeed</b> to try again.');
      return;
    }
    if(force){location.reload();return}
  }
  if(!raw.cats||!raw.cats.pw){raw=null;return boot(true)}
  const out=compute(raw);window.DATA=out.DATA;window.COST=out.COST;window.MONEY=out.MONEY;
  $('mPulled').textContent=new Date(raw.pulledAt).toLocaleString('en-US',{timeZone:'America/Los_Angeles',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  setStatus('Read only',`Pulled from Lightspeed. ${fmt(DATA.neg)} of ${fmt(DATA.count)} selling items show negative stock; those use <b>replace what sold</b> (buy back last week's units, rounded up to whole cases). Nothing is ordered or sent until you do it.`);
  $('loading').hidden=true;$('app').hidden=false;
  renderAll();
}

/* ---------- render (same page as the Weekly Order Run artifact) ---------- */

const METHOD={portal:"Order online",email:"Email",store:"Store run",none:"No vendor"};
const GROUPS=[['portal','Order online'],['email','Email the rep'],['store','Store run'],['none','Needs a vendor in Lightspeed']];
const CAT={ALC:"Alcohol",NA:"Non-alcoholic",SNK:"Snacks",MER:"Merch"};
var fmt=n=>n.toLocaleString('en-US');var usd=n=>'$'+Math.round(n).toLocaleString('en-US');
var esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));


function renderAll(){
const WEEK_OF=META.nextMonday;const KEY='orderRun-'+META.weekEnd;
const items=DATA.items.map((a,i)=>{const it={id:i,n:a[0],v:a[1],c:a[2],s:a[3],w4:a[4],d7:a[5],par:a[6],rep:a[8],t:a[9],pk:a[10],wk:Math.round(a[4]/4*10)/10};it.keg=/KEG/.test(it.n);
 let need=it.rep?Math.min(it.par,Math.max(it.d7,Math.round(it.wk))):it.par-it.s;let cs=0;
 if(need>0){cs=Math.ceil(need/it.pk);if(!it.rep&&need<0.3*it.pk)cs=0;cs=Math.min(cs,Math.max(1,Math.floor(4*it.wk/it.pk)))}
 it.ord=cs;return it}).filter(i=>i.ord>0);
let st={};try{st=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){}};
const q=i=>st['q'+i.id]!=null?st['q'+i.id]:i.ord;
const done=v=>!!st['d_'+v];
const lines=v=>items.filter(i=>i.v===v&&q(i)>0).sort((a,b)=>b.w4-a.w4);
const allLines=v=>items.filter(i=>i.v===v).sort((a,b)=>b.w4-a.w4);
const vendors=Object.keys(V).filter(v=>allLines(v).length);
const caseWord=(n,i)=>i.keg?(n===1?'keg':'kegs'):(n===1?'case':'cases');
const orderText=v=>lines(v).map(i=>`${q(i)} ${caseWord(q(i),i)} - ${i.n}${i.keg?'':' ('+i.pk+'pk)'}`).join('\n');
const email=v=>{const x=V[v];return {to:x.e||'',subject:`Skylinks order – week of ${WEEK_OF}`,body:`Hi ${x.c||'there'},\n\nHere is Skylinks at Buchanan Fields' order for the week of ${WEEK_OF}:\n\n${orderText(v)}\n\nPlease reply to confirm availability and your delivery day.\n\nThanks,\nLC Torres\nOperations Lead, Skylinks Golf\nlc@skylinksgolf.com`}};
const smsText=v=>`Hi ${V[v].c||'there'}, it's LC from Skylinks at Buchanan Fields. Order for the week of ${WEEK_OF}:\n${orderText(v)}\nCan you confirm and let me know the delivery day? Thanks!`;
const gmail=m=>'https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(m.to)+'&su='+encodeURIComponent(m.subject)+'&body='+encodeURIComponent(m.body);
const open={};
const est=v=>lines(v).reduce((a,i)=>a+(COST[i.n]||0)*i.pk*q(i),0);
const estTxt=v=>{const e=est(v);return e>0?'≈ '+usd(e):''};

/* tabs */
function show(p){document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.p===p));document.querySelectorAll('section.panel').forEach(s=>s.hidden=s.id!=='p-'+p);window.scrollTo(0,0);}
document.querySelectorAll('nav.tabs button').forEach(b=>b.onclick=()=>show(b.dataset.p));

/* order */

function detailHtml(v){const x=V[v];let em='';
 if(x.m==='email'){const m=email(v);em=`<div class="emailbox" style="padding:12px 0">${x.p?`<div class="emf"><span class="lab">Text</span><span><b>${esc(x.p)}</b> <span class="note">· ${esc(x.c||'rep')}</span></span><button class="btn ghost sm" data-sms="${v}">Copy text message</button></div>`:''}<div class="emf"><span class="lab">To</span><span>${m.to?esc(m.to):'<span class="neg">No email on file yet</span>'}</span><span></span></div><div class="emf"><span class="lab">Subject</span><span>${esc(m.subject)}</span><span></span></div><textarea class="embody" readonly aria-label="Email">${esc(m.body)}</textarea><div class="emfoot"><a class="btn go" href="${gmail(m)}" target="_blank" rel="noopener">Open in Gmail</a><button class="btn ghost" data-copy="${v}">Copy email</button><span class="note">Review it in Gmail and press Send yourself.</span></div></div>`}
 return `${em}<div class="tbl-wrap"><table><thead><tr><th>Item</th><th class="num">Last wk</th><th class="num">Avg/wk</th><th class="num">Cases</th></tr></thead><tbody>${allLines(v).map(i=>`<tr><td class="item">${esc(i.n)} <span class="note">${i.keg?'keg':i.pk+'pk'}</span></td><td class="num">${i.d7}</td><td class="num">${i.wk}</td><td class="num"><input class="qty" type="number" min="0" id="q-${i.id}" data-id="${i.id}" value="${q(i)}" aria-label="Cases"></td></tr>`).join('')}</tbody></table></div>`}
const inc=v=>st['x_'+v]!=null?st['x_'+v]:(V[v].m==='portal'||V[v].m==='email');
function render(){const el=document.getElementById('vlist');let h='';
 for(const [g,label] of GROUPS){const vs=vendors.filter(v=>V[v].m===g);if(!vs.length)continue;h+=`<div class="grp">${label}</div>`;
  for(const v of vs){const x=V[v];const n=lines(v).reduce((a,i)=>a+q(i),0);const what=g==='portal'?'Add to cart':g==='email'?'Draft email':'';
   h+=`<div class="vrow ${inc(v)?'':'off'}" data-v="${v}"><div class="vline"><div class="nm"><span class="dot ${g}"></span>${esc(x.n)}<small>${lines(v).length} items${x.cad&&x.cad!=='—'?' · '+esc(x.cad):''}${x.m==='email'&&x.p?' · '+esc(x.p):''}</small></div><div class="cs"><b>${n}</b> ${n===1?'case':'cases'}<br><span class="est" data-est="${v}">${estTxt(v)}</span></div><div class="acts"><button class="lnk" data-tog="${v}">${open[v]?'Hide items':'See items'}</button>${what?`<label class="placed"><input type="checkbox" data-inc="${v}" ${inc(v)?'checked':''}> ${what}</label>`:''}</div></div><div class="detail" ${open[v]?'':'hidden'}>${open[v]?detailHtml(v):''}</div></div>`}}
 el.innerHTML=h;summary();
 el.querySelectorAll('[data-tog]').forEach(b=>b.onclick=()=>{open[b.dataset.tog]=!open[b.dataset.tog];render()});
 el.querySelectorAll('[data-inc]').forEach(c=>c.onchange=()=>{st['x_'+c.dataset.inc]=c.checked;save();render()});
 el.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copy(email(b.dataset.copy).body,b));
 el.querySelectorAll('[data-sms]').forEach(b=>b.onclick=()=>copy(smsText(b.dataset.sms),b));
 el.querySelectorAll('input.qty').forEach(inp=>inp.onchange=()=>{st['q'+inp.dataset.id]=Math.max(0,parseInt(inp.value||'0',10));save();const v=items.find(i=>i.id==inp.dataset.id).v;const row=el.querySelector(`.vrow[data-v="${v}"]`);row.querySelector('.cs b').textContent=lines(v).reduce((a,i)=>a+q(i),0);row.querySelector('[data-est]').textContent=estTxt(v);summary()});}
function picked(){return vendors.filter(v=>inc(v)&&lines(v).length&&(V[v].m==='portal'||V[v].m==='email'))}
function summary(){const P=picked();const tot=P.reduce((s,v)=>s+lines(v).reduce((a,i)=>a+q(i),0),0);const $t=P.reduce((s,v)=>s+est(v),0);
 const pc=P.filter(v=>V[v].m==='portal').length,ec=P.filter(v=>V[v].m==='email').length;
 document.getElementById('sumBig').textContent=`${pc} carts · ${ec} emails`;
 document.getElementById('sumSub').textContent=`${fmt(tot)} cases · about ${usd($t)} at cost`;
 document.getElementById('goBtn').disabled=!P.length}
const TRIGGER_ID='trig_01SrVuzLnSXubNnWhqiZKi9R';
function payload(){return {weekOf:WEEK_OF,vendors:picked().map(v=>{const x=V[v];return {code:v,name:x.n,method:x.m,url:x.url||'',rep:x.c||'',email:x.e||'',phone:x.p||'',lines:lines(v).map(i=>({item:i.n,cases:q(i),pack:i.keg?'keg':i.pk}))}})}}
async function go(){const btn=document.getElementById('goBtn'),msg=document.getElementById('goMsg');const P=payload();if(!P.vendors.length)return;btn.disabled=true;
 const portals=P.vendors.filter(v=>v.method==='portal'&&v.url),mails=P.vendors.filter(v=>v.method==='email');
 for(const v of portals)await chrome.tabs.create({url:v.url,active:false});
 for(const v of mails){const m=email(v.code);await chrome.tabs.create({url:gmail(m),active:false})}
 const t='Fill this week\'s Pro Shop carts (I am signed in to the vendor tabs):\n'+JSON.stringify(P);
 try{await navigator.clipboard.writeText(t)}catch(e){}
 msg.className='gomsg ok';msg.innerHTML=`<b>Opened ${portals.length} vendor tabs and ${mails.length} Gmail emails.</b> Sign into each vendor tab, review and send each email yourself. To have Claude fill the carts, paste into your Claude chat (the order is copied) or use the <b>Yes, add items to cart</b> button on the Weekly Order Run page in Claude. <button class="btn ghost sm" id="fbCopy">Copy order again</button>`;
 document.getElementById('fbCopy').onclick=e=>copy(t,e.target);btn.disabled=false}
document.addEventListener('click',e=>{if(e.target&&e.target.id==='goBtn')go()});
function copy(t,btn,keepLabel){const done_=()=>{if(keepLabel)return;const o=btn.textContent;btn.textContent='Copied';setTimeout(()=>btn.textContent=o,1500)};const fb=()=>{const w=document.getElementById('copyWrap');w.hidden=false;const b=document.getElementById('copybox');b.value=t;b.focus();b.select()};try{navigator.clipboard.writeText(t).then(done_,fb)}catch(e){fb()}}
render();


/* pies: last week vs week before (shop sales by category, before tax) */
(function(){const G=['ALC','NA','SNK','MER'];const COL={ALC:'var(--gold)',NA:'var(--fg)',SNK:'var(--muted)',MER:'var(--line)'};
 const a=MONEY.cats.d7,b=MONEY.cats.pw;const tot=o=>G.reduce((s,g)=>s+o[g].net,0);
 const donut=(o)=>{const T=tot(o);let ang=-Math.PI/2;const R=80,r=48,cx=90,cy=90;let paths='';G.forEach(g=>{const f=o[g].net/T;const a2=ang+f*2*Math.PI;const L=f>0.5?1:0;const p=(rad,x)=>[cx+x*Math.cos(rad),cy+x*Math.sin(rad)];const [x1,y1]=p(ang,R),[x2,y2]=p(a2,R),[x3,y3]=p(a2,r),[x4,y4]=p(ang,r);paths+=`<path d="M${x1} ${y1}A${R} ${R} 0 ${L} 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 ${L} 0 ${x4} ${y4}Z" fill="${COL[g]}" stroke="var(--bg)" stroke-width="2"><title>${CAT[g]}: ${usd(o[g].net)} (${Math.round(f*100)}%)</title></path>`;ang=a2});return `<svg viewBox="0 0 180 180" role="img">${paths}<text x="90" y="88" text-anchor="middle" font-size="15" font-weight="800" fill="var(--fg)">${usd(T)}</text><text x="90" y="106" text-anchor="middle" font-size="10" fill="var(--muted)">shop sales</text></svg>`};
 const ch=pct=>`<span class="dlt ${pct>=0?'up':'down'}">${pct>=0?'▲':'▼'} ${Math.abs(pct)}%</span>`;const pc=(x,y)=>y?Math.round((x/y-1)*100):0;
 document.getElementById('pies').innerHTML=`<div class="pie">${donut(a)}<div class="t">Last week</div><div class="d">${META.d7lbl}</div></div><div class="pie">${donut(b)}<div class="t">Week before</div><div class="d">${META.pwlbl}</div></div><div class="leg">${G.map(g=>`<div><i style="background:${COL[g]};border:1px solid var(--line)"></i><span>${CAT[g]}</span><b>${usd(a[g].net)}</b>${ch(pc(a[g].net,b[g].net))}</div>`).join('')}<div style="border-top:1px solid var(--line);padding-top:8px"><i></i><span><b>Total</b></span><b>${usd(tot(a))}</b>${ch(pc(tot(a),tot(b)))}</div></div>`;})();

/* sales */
(function(){const k=document.getElementById('kpis');['ALC','NA','SNK','MER'].forEach(c=>{const t=DATA.cats[c];const avg=t.r4/4;const d=Math.round((t.r7/avg-1)*100);k.insertAdjacentHTML('beforeend',`<div class="kpi"><div class="l">${CAT[c]}</div><div class="v">${usd(t.r7)}</div><div class="s">${fmt(t.u7)} sold · avg week ${usd(avg)}</div><div class="s delta ${d>=0?'up':'down'}">${d>=0?'▲':'▼'} ${Math.abs(d)}% vs avg</div></div>`)});
 const tp=document.getElementById('tops');['ALC','NA','SNK'].forEach(c=>tp.insertAdjacentHTML('beforeend',`<div><h3>Top 5 · ${CAT[c]}</h3><ol class="top short">${DATA.top[c].slice(0,5).map((r,i)=>`<li><span class="rk">${i+1}</span><span>${esc(r[0])}</span><span class="q">${r[1]} sold</span></li>`).join('')}</ol></div>`))})();

/* ideas */
(function(){const b=DATA.bs;const per=k=>b[k]&&b[k].n?Math.round(b[k].u/b[k].n):0;
 const recs=buildRecs(items,b,per);
 document.getElementById('recs').innerHTML=recs.map(r=>`<li><span class="k ${r[0]}">${r[1]}</span><span>${esc(r[2])}</span></li>`).join('');
 const list=(title,why,rows)=>`<div><h3 style="margin-bottom:2px">${title}</h3><p class="note" style="margin:0 0 8px">${why}</p><ol class="top short">${rows.join('')}</ol></div>`;
 const li=(n,q)=>`<li><span class="rk">•</span><span>${esc(n)}</span><span class="q">${q}</span></li>`;
 document.getElementById('ideaLists').innerHTML=
  list('Selling faster','Give more space or order extra.',DATA.up.slice(0,5).map(r=>li(r[0],`${r[2]} last wk`)))+
  list('Check the shelf','Usually sells but barely sold last week. Probably out of stock.',DATA.down.slice(0,5).map(r=>li(r[0],`${r[2]} vs ${r[3]}/wk`)))+
  list('Consider cutting','Sold 2 or fewer in 4 weeks.',DATA.slow.filter(r=>!/^(TITL|VWGO)$/.test(r[1])).slice(0,5).map(r=>li(r[0],`${r[3]} sold`)));})();

(function(){const M=MONEY,G=['ALC','NA','SNK','MER'];const sum=(o,k)=>G.reduce((a,g)=>a+o[g][k],0);
 const d7=M.cats.d7,w4=M.cats.w4,pv=M.cats.prev,ly=M.cats.ly,pw=M.cats.pw;
 const net=sum(d7,'net'),cost=sum(d7,'cost'),gp=net-cost;const avgNet=sum(w4,'net')/4;
 const spg=o=>o.rounds?G.reduce((a,g)=>a+o[g].net,0)/o.rounds:0;
 const pct=(a,b)=>b?Math.round((a/b-1)*100):0;const dl=x=>`<span class="dlt ${x>=0?'up':'down'}">${x>=0?'▲':'▼'} ${Math.abs(x)}%</span>`;
 const k=document.getElementById('mk');
 k.innerHTML=`<div class="kpi"><div class="l">Shop sales</div><div class="v">${usd(net)}</div><div class="s">${dl(pct(net,sum(pw,'net')))} vs last week · ${dl(pct(net,avgNet))} vs avg week</div></div>
 <div class="kpi"><div class="l">Gross profit</div><div class="v">${usd(gp)}</div><div class="s">${dl(pct(gp,sum(pw,'net')-sum(pw,'cost')))} vs last week · ${Math.round(gp/net*100)}% margin</div></div>
 <div class="kpi"><div class="l">Spend per round</div><div class="v">$${spg(d7).toFixed(2)}</div><div class="s">${dl(pct(spg(d7),spg(pw)))} vs last week ($${spg(pw).toFixed(2)}) · ${fmt(d7.rounds)} rounds</div></div>
 <div class="kpi"><div class="l">Discounts &amp; comps</div><div class="v">${usd(M.disc.d7.total)}</div><div class="s"><span class="dlt ${M.disc.d7.total<=M.disc.pw.total?'up':'down'}">${M.disc.d7.total>=M.disc.pw.total?'▲':'▼'} ${Math.abs(pct(M.disc.d7.total,M.disc.pw.total))}%</span> vs last week · ${usd(M.disc.d7.comp)} at 100%</div></div>`;
 document.getElementById('mcat').innerHTML=G.map(g=>{const a=d7[g];const p=a.net-a.cost;return `<tr><td>${CAT[g]}</td><td class="num">${usd(a.net)}</td><td class="num">${usd(p)}</td><td class="num">${a.net?Math.round(p/a.net*100):0}%</td><td class="num">${dl(pct(a.net,pw[g].net))}</td><td class="num">${dl(pct(a.net,w4[g].net/4))}</td><td class="num">${dl(pct(a.net,ly[g].net))}</td></tr>`}).join('')+`<tr><td><b>Total</b></td><td class="num"><b>${usd(net)}</b></td><td class="num"><b>${usd(gp)}</b></td><td class="num"><b>${Math.round(gp/net*100)}%</b></td><td class="num">${dl(pct(net,sum(pw,'net')))}</td><td class="num">${dl(pct(net,avgNet))}</td><td class="num">${dl(pct(net,sum(ly,'net')))}</td></tr>`;
 const mx=Math.max(...M.days.map(d=>d[2]/d[1]));document.getElementById('mday').innerHTML=M.days.map(d=>{const v=d[2]/d[1];return `<div class="bar"><span>${d[0]} · ${d[1]} rounds</span><span class="track"><span class="fill" style="width:${(v/mx*100).toFixed(1)}%"></span></span><span class="val">$${v.toFixed(2)}</span></div>`}).join('');
 document.getElementById('mdisc').innerHTML=M.disc.d7.top.slice(0,6).map((r,i)=>`<li><span class="rk">${i+1}</span><span>${esc(r[0])}${/Test/.test(r[0])?' <span class="pill rep">test rule in use</span>':''}</span><span class="q">${usd(r[1])} · ${r[2]}×</span></li>`).join('');
 document.getElementById('mdiscNote').textContent=`Includes range and golf discounts, not just the shop. Last 4 weeks: ${usd(M.disc.w4.total)} total, ${usd(M.disc.w4.comp)} at 100%.`;
 document.getElementById('mshelf').textContent=`${usd(M.assets.inv)} in stock at cost (items with a positive count). ${usd(M.assets.dead)} of that is in ${M.assets.deadN} items that didn't sell once in 4 weeks. Counts are off, so treat these as estimates.`;
 document.getElementById('mdead').innerHTML=M.assets.deadTop.map((r,i)=>`<li><span class="rk">${i+1}</span><span>${esc(r[0])} <span class="note">· ${r[1]} on hand</span></span><span class="q">${usd(r[2])}</span></li>`).join('');
 document.getElementById('mbelow').innerHTML=M.belowCost.map((r,i)=>`<li><span class="rk">${i+1}</span><span>${esc(r[0])} <span class="note">· ${r[1]} sold</span></span><span class="q neg">$${r[2].toFixed(2)} vs $${r[3].toFixed(2)}</span></li>`).join('');
 document.getElementById('mven').innerHTML=M.vendors.map(r=>`<tr><td>${esc(r[0])}</td><td class="num">${usd(r[1])}</td><td class="num">${usd(r[1]-r[2])}</td><td class="num">${Math.round((r[1]-r[2])/r[1]*100)}%</td></tr>`).join('');
 document.getElementById('mtop').innerHTML=M.topProfit.map((r,i)=>`<li><span class="rk">${i+1}</span><span>${esc(r[0])}</span><span class="q">${usd(r[1])} · ${r[2]}%</span></li>`).join('');
})();
show(['sales','money','ideas','order'].includes((location.hash||'').slice(1))?location.hash.slice(1):'sales');

}

boot(false);
