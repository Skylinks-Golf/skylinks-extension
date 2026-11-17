/* Vendor cart fill, one module per ordering portal.
   Each portal: where to open, how to tell signed-in from signed-out, the Lightspeed -> portal item map,
   and a fill function that runs inside the vendor's page (self-contained, no closures).
   Scope (Notion Ordering Sources + Agent Permissions "LC — ordering module vendor portals, edit live"):
   add approved items from the vendor's saved list / order guide to the cart, then stop.
   Never checkout, submit, "add whole list", type a login, or change account/payment/delivery settings. */

// Shared: Lightspeed name -> lookup key (drops the type prefix and " - Single").
function portalKey(n){return String(n).replace(/^(Beer|Seltzer|Cider|Malt|Hard Tea|Hard Kombucha|Wine Cocktail|Cocktail)\s*-\s*/i,'').replace(/\s*-\s*(Single|Serving)\b.*$/i,'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function portalMap(obj){const m={};for(const [k,v] of Object.entries(obj))m[portalKey(k)]=v;return n=>m[portalKey(n)]||null}

/* ---------- SF Naturals (pepr) ---------- */
// Lightspeed item -> SF Naturals Order Guide case code ("Case • 1126").
const SF_CODES={
 'Crystal Geyser 16.9oz':'702','Coke - 12oz':'626','Coke - Diet - 12oz':'627','Sprite - 12oz':'628','Dr Pepper - 12oz':'2985','Cactus Cooler - 12oz':'38',
 'Caprisun - 6oz':'546','Simply - Lemonade - 11.5oz':'3464','Simply - Orange Juice - 11.5 oz':'3463','Langers - Apple Juice - 15.2oz':'2026',
 'Doritos - Nacho Cheese - 2.5oz':'1087','Doritos - Cool Ranch - 2.5oz':'1086','Chester - Hot Fries - 2.58oz':'1091','Lays - Classic - 2.25oz':'1068','Lays - BBQ - 2.25oz':'1069',
 'Cheetos - Flamin Hot':'1080','Cheetos - Jumbo Puffs - 2.125oz':'1081','Cheetos - Crunchy Regular - 2.75oz':'1079','Ruffles - Cheddar & Sour Cream - 2.25oz':'1075',
 'Kettle - Sea Salt & Vinegar - 2oz':'1832','Barcel - Takis - Fuego - 3.25oz':'3696',
 'Gatorade - Cool Blue - 28oz':'1129','Gatorade - Fruit Punch - 28oz':'1127','Gatorade - Orange - 28oz':'1124','Gatorade - Lemon Lime - 28oz':'1123','Gatorade - Glacier Freeze - 28oz':'1131',
 'Gatorade - Glacier Cherry - 28oz':'1128','Gatorade - Strawberry - 28oz':'1126','Gatorade - Zero - Cool Blue - 28oz':'1132','Gatorade - Zero - Orange - 28oz':'1137',
 'Gatorade - Zero - Fruit Punch - 28oz':'5318','Gatorade - Zero - Glacier Cherry - 28oz':'1134','Gatorade - Zero - Cool Blue - 20oz':'5817',
 'Arizona - Mucho Mango - 22oz':'211','Arizona - Watermelon - 22oz':'210',
 'Liquid Death - Slice of Lime - 19.2oz':'6031','Liquid Death - Sparkling Water - 19.2oz':'5938',
 'Poppi - Raspberry Rose - 12oz':'3033','Poppi - Root Beer - 12oz':'4847','Olipop - Vintage Cola - 12oz':'2878','La Croix - Peach Pear - 12oz':'2008',
 'Pure Leaf - Lemon - 18.5oz':'3097','Pure Leaf - Unsweetened - 18.5oz':'3100','Pure Leaf - Green Tea - 18.5oz':'3096',
 'Itoen - Unsweetened Green - 16.9oz':'1658','Itoen - Bold Green Tea - 16.9oz':'1659','Nesquik - Chocolate - 14oz':'2497',
 'Pocky - Chocolate Cream - 2.47oz':'3011','Pocky - Cookies & Cream - 2.47oz':'3013','Pocky - Strawberry Cream - 2.47oz':'3012',
 'Hostess - Mini Donuts Powdered - 3oz':'1560','Tillamook - Beef Stick - Teriyaki - 1.44oz':'3789','Solely - Fruit Jerky - Pineapple':'3594',
 'Off The Farm Bar - Dark Chocolate - 3.3oz':'2830','Off The Farm Bar - Apple Cinnamon - 3.3oz':'2835',
 'CLIF Bar - Chocolate Chip':'599','CLIF Bar - Crunchy Peanut Butter':'596','Clif Builders - Chocolate Peanut Butter':'446','Clif Builders - Chocolate':'447'
};
function sfState(){
  if(document.querySelector('input[type=password]'))return {state:'signin'};
  if(document.querySelector('input[placeholder="Search Order Guide"]'))return {state:'list'};
  return {state:/login|sign/i.test(location.pathname)?'signin':'loading'};
}
async function sfFill(lines){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const setVal=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};
  const search=async q=>{const i=document.querySelector('input[placeholder="Search Order Guide"]');if(!i)return false;setVal(i,q);i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));return true};
  const rowOf=b=>{let r=b;for(let i=0;i<8&&r;i++){r=r.parentElement;if(/Case\s*•\s*\d+/.test(r.innerText||''))return r}return null};
  const findRow=code=>{for(const b of document.querySelectorAll('button[aria-label="Increase quantity"]')){const r=rowOf(b);if(r&&new RegExp('Case\\s*•\\s*'+code+'\\b').test(r.innerText))return {r,b}}return null};
  const cardText=r=>{let c=r;for(let i=0;i<6&&c;i++){c=c.parentElement;if(/Quantity Available|Out of Stock/i.test(c.innerText))return c.innerText}return ''};
  const total=()=>{const b=[...document.querySelectorAll('button')].find(x=>/View .*cart/i.test(x.getAttribute('aria-label')||''));return b?(b.innerText.match(/\$[\d,]+\.\d\d/)||[''])[0]:''};
  const out={added:[],skipped:[]};
  for(const l of lines){
    const code=String(l.sku).replace(/\D/g,'');
    if(!(await search(code))){out.skipped.push([l.item,'Order Guide search not found']);continue}
    let hit=null;for(let w=0;w<20&&!hit;w++){await sleep(300);hit=findRow(code)}
    if(!hit){out.skipped.push([l.item,'not in the Order Guide (case '+code+')']);continue}
    if(/Out of Stock/i.test(cardText(hit.r))){out.skipped.push([l.item,'out of stock']);continue}
    const q=()=>{const h=findRow(code);const i=h&&h.r.querySelector('input');return i?(+i.value||0):0};
    if(q()>0){out.skipped.push([l.item,'already in cart ('+q()+')']);continue}
    for(let n=0;n<l.cases;n++){const h=findRow(code);if(!h)break;h.b.click();await sleep(600)}
    if(q()===l.cases)out.added.push([l.item,l.cases,code]);else out.skipped.push([l.item,'could not set '+l.cases+' cases (shows '+q()+'); check the cart']);
  }
  await search('');await sleep(800);
  out.total=total();
  return out;
}

/* ---------- registry ---------- */
const PORTALS={
  GOLD:{name:'GoldenBrands',site:'SipMarket',start:SIPMARKET.orderList,sku:n=>SIPMARKET.skuFor(n),state:smState,fill:smFill,
        // signed in but on another page: go to the Order List (the only page we fill on)
        relist:st=>st==='dashboard'||st==='other'?SIPMARKET.orderList:null},
  SFNA:{name:'SF Naturals',site:'SF Naturals',start:'https://sfnaturals.pepr.app/',sku:portalMap(SF_CODES),state:sfState,fill:sfFill,relist:()=>null,
        note:r=>{const t=parseFloat(String(r.total||'').replace(/[$,]/g,''));return t&&t<350?' Cart is under the $350 delivery minimum.':''}}
};
