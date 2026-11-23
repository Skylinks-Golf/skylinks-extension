/* Vendor cart fill, one module per ordering portal.
   Each portal: where to open, how to tell signed-in from signed-out, the Lightspeed -> portal item map,
   and a fill function that runs inside the vendor's page (self-contained, no closures).
   Scope (Notion Ordering Sources + Agent Permissions "LC — ordering module vendor portals, edit live"):
   add approved items from the vendor's saved list / order guide to the cart, then stop.
   Never checkout, submit, "add whole list", type a login, or change account/payment/delivery settings. */

// Shared: Lightspeed name -> lookup key. Lightspeed names start with one or more category words
// ("Soda - Coke - 12oz", "Beer - Non-alcoholic - Samuel Adams - ..."); the maps below use the name without them.
// Also decodes HTML entities ("Half &amp; Half") and drops " - Single…" and a trailing " - 12pk".
const PORTAL_CATS=/^(beer|non-?alcoholic|seltzer|hard seltzer|cider|hard cider|malt|hard tea|hard kombucha|hard soda|wine cocktails?|wine|cocktail|shooter|soda|sportsdrink|sports drink|energy|energy drinks?|soft drinks?|drinks?|beverages?|water|sparkling|juice|tea|coffee|milk|protein|protein bar|bar|chips|candy|snacks?|jerky|ice cream|cookies)$/i;
function portalKey(n){
  let s=String(n).replace(/&amp;/g,'&').replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"');
  let parts=s.split(/\s+-\s+/);
  while(parts.length>2&&PORTAL_CATS.test(parts[0].trim()))parts.shift();
  s=parts.join(' - ').replace(/\s*-\s*(Single|Serving)\b.*$/i,'').replace(/\s*-\s*\d+\s?pk$/i,'');
  return s.toLowerCase().replace(/[^a-z0-9]/g,'');
}
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
 'Arizona - Mucho Mango - 22oz':'211','Arizona - Watermelon - 22oz':'210','Arizona - Kiwi Strawberry - 22oz':'212','Arizona - Iced Tea - Raspberry - 22oz':'4550',
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

/* ---------- Breakthru Bev (Breakthru Now) ---------- */
// Lightspeed item -> Breakthru Product ID on "Skylinks Weekly Reorder (Breakthru)". Matched on product, size and case pack.
// Not mapped: Salty Crew Blonde (Lightspeed 16oz, list has 19.2oz only), Dark Horse Pinot Noir (not on the list).
// Fills the Quick Order page (/bulkAdd), not the list page: adding from the list page makes Breakthru offer to delete the
// list. The saved list is only read, to check each item is on it and in stock.
const BRKT_LIST='/my-account/favoritesDetail/8878406828733';
const BRKT_IDS={
 'Almanac - Big Love Hazy - 16oz':'9704223','Almanac - Love Hazy - 16oz':'9338023','Almanac - Seaside West Coast - 16oz':'9724138',
 'Buttercup - Chardonnay - 355ml':'9680394','Clown Shoes - Space Cake Double IPA - 16oz':'9344873',
 'Dark Horse - Pinot Grigio - 375ml':'9310178','Dark Horse - Sparkling Rose Bubbles - 375ml':'9376341','Dark Horse - Sauvignon Blanc - 375ml':'9357373',
 'East Brother - Blonde Ale - 16oz':'9704183','East Brother - Bo Pilsner - 16oz':'9704184',
 'Headlands - Diablo - Double IPA - 16oz':'9766665','Headlands - Cargo Shorts New Zealand Pale Ale - 16oz':'9766651','Headlands - Hawk Hill - Hefeweizen - 16oz':'9766625',
 'Headlands - Party Wave - 16oz':'9766676','Headlands - Bonita Pilsner - 16oz':'9766666',
 'Kyla - Coconut Crush - 16oz':'9713388','Kyla - Lavender Lemonade - 16oz':'9713411','Kyla - Lychee Lemonade - 16oz':'9713412','Kyla - Sunset Trio - 16oz':'9713414',
 'North Coast - Scrimshaw Pilsner - 19.2oz':'9712463'
};
function brState(){
  if(document.querySelector('input[type=password]')||/\/login/i.test(location.pathname))return {state:'signin'};
  if(/\/bulkAdd\/?$/.test(location.pathname)&&document.querySelector('input.js-sku-input-field'))return {state:'list'};
  if(document.readyState!=='complete')return {state:'loading'};
  return {state:'other'};
}
async function brFill(lines){
  const LIST='/my-account/favoritesDetail/8878406828733';
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const setVal=(el,v)=>{el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};
  const leave=el=>{el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));el.blur()};
  const getDoc=async u=>{try{const r=await fetch(u,{credentials:'include'});return r.ok?new DOMParser().parseFromString(await r.text(),'text/html'):null}catch(e){return null}};
  // The cart page also shows product carousels (suggestions, favorites), so drop those before looking for ids.
  const cartHtml=async()=>{const d=await getDoc('/cart');if(!d||!d.body)return '';d.querySelectorAll('.c-product-carousel,header,nav,footer,script,style,template').forEach(e=>e.remove());return d.body.innerHTML};
  const inCart=(html,id)=>new RegExp('\\b'+id+'\\b').test(html);
  const rowFor=id=>[...document.querySelectorAll('tr.js-product-card')].find(tr=>new RegExp('Product ID:\\s*'+id+'\\b').test(tr.innerText));
  const out={added:[],skipped:[]};
  if(document.querySelector('.js-quick-order-cse-qty'))return {added:[],skipped:lines.map(l=>[l.item,'the Quick Order page already had products on it; nothing was added. Reload it and run again'])};
  const list=await getDoc(LIST);const onList={};
  if(list)for(const r of list.querySelectorAll('tr.js-favorite-item'))onList[r.dataset.code]={stock:r.dataset.available==='true'&&+r.dataset.availableQty>0&&!/Out Of Stock/i.test(r.textContent)};
  if(!Object.keys(onList).length)return {added:[],skipped:lines.map(l=>[l.item,'could not read the Breakthru list; nothing was added'])};
  const before=await cartHtml(),set=[];
  for(const l of lines){
    const id=String(l.sku);
    if(!onList[id]){out.skipped.push([l.item,'not on the Breakthru list (product '+id+')']);continue}
    if(!onList[id].stock){out.skipped.push([l.item,'out of stock']);continue}
    if(inCart(before,id)){out.skipped.push([l.item,'already in cart']);continue}
    const sku=[...document.querySelectorAll('input.js-sku-input-field')].find(i=>!i.value);
    if(!sku){out.skipped.push([l.item,'no empty Product ID box left']);continue}
    setVal(sku,id);sku.dispatchEvent(new KeyboardEvent('keydown',{key:id.slice(-1),keyCode:48+(+id.slice(-1)),bubbles:true}));
    let li=null;for(let w=0;w<30&&!li;w++){await sleep(200);li=[...document.querySelectorAll('.ui-autocomplete .ui-menu-item')].find(x=>x.offsetParent&&new RegExp('Product ID:\\s*'+id+'\\b').test(x.innerText))}
    if(!li){setVal(sku,'');leave(sku);out.skipped.push([l.item,'Quick Order did not find product '+id]);continue}
    const t=li.querySelector('.ui-menu-item-wrapper')||li;t.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));t.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}));t.click();
    let tr=null;for(let w=0;w<25&&!tr;w++){await sleep(200);tr=rowFor(id)}
    const q=tr&&tr.querySelector('.js-quick-order-cse-qty');
    if(!q){out.skipped.push([l.item,'row did not appear on Quick Order']);continue}
    setVal(q,String(l.cases));leave(q);await sleep(300);
    set.push([l,id]);
  }
  if(!set.length)return out;
  const btn=()=>[...document.querySelectorAll('button.js-add-to-cart-quick-order-btn-bottom')].find(b=>!b.disabled&&b.offsetParent);
  for(let w=0;w<20&&!btn();w++)await sleep(250);
  if(!btn()){for(const [l] of set)out.skipped.push([l.item,'Add to Cart stayed disabled; nothing added']);return out}
  // Add to Cart submits a form and loads the cart page, which ends this script, so press it just after returning.
  // fillPortal then runs brVerify on the cart.
  const b=btn();window.onbeforeunload=null;setTimeout(()=>b.click(),300);
  out.pending=set.map(([l,id])=>[l.item,l.cases,id]);
  return out;
}
// Runs after the cart page loads: confirms each pending line by its Product ID (ignoring the suggestion carousels).
async function brVerify(pending){
  let html='';try{const d=new DOMParser().parseFromString(await (await fetch('/cart',{credentials:'include'})).text(),'text/html');
    d.querySelectorAll('.c-product-carousel,header,nav,footer,script,style,template').forEach(e=>e.remove());html=d.body?d.body.innerHTML:''}catch(e){}
  const out={added:[],skipped:[]};
  for(const [item,cases,id] of pending){if(new RegExp('\\b'+id+'\\b').test(html))out.added.push([item,cases,id]);else out.skipped.push([item,'not confirmed in the cart; check it'])}
  return out;
}

/* ---------- Southern Wine (Proof by Southern Glazer's) ---------- */
// Lightspeed item -> Proof item number on the "Weekly Reorder List". Matched on product, size and case pack.
// Not mapped: Red Bull Watermelon, Flybird Tamarind Mango, Freixenet (not on the list); Flybird Baja Lime (Lightspeed 24pk,
// list has 750ml only); Red Bull Sea Blue (two list entries, 614098 and 614099: LC to pick).
const SOUT_LIST='https://shop.sgproof.com/sgws/en/usd/myLists/savedList/favLists_05619246';
const SOUT_IDS={
 'Red Bull - Original - 8.4oz':'201010','Red Bull - Sugarfree - 8.4oz':'409127','Red Bull - White Peach - 8.4oz':'689161',
 'Red Bull - Tropical - 8.4oz':'928515','Red Bull - Coconut Edition - 8.4oz':'928517',
 'Sabe - Grapefruit Paloma - 250ml':'536391','Sabe - Espresso Martini - 250ml':'654260','Sabe - Moscow Mule - 250ml':'536392','Sabe - Margarita - 250ml':'536388',
 'Mumm - Brut Prestige - 750ml':'606005','Josh Cellars - Cabernet Sauvignon - 375ml':'939475','Rodney Strong - Sauvignon Blanc - 750ml':'682364',
 '14 Hands - Hot To Trot - 355ml':'574119','14 Hands - Pinot Grigio - 355ml':'568203',
 'Gruet Brut Rose - 375ml':'253175','Joel Gott - Chardonnay - 750ml':'698709'
};
function soState(){
  const p=location.pathname;
  if(/\/login/i.test(p)||document.querySelector('input[type=password]'))return {state:'signin'};
  if(/favLists_05619246/.test(p)&&[...document.querySelectorAll('div.p-4')].some(c=>/Per Case/i.test(c.innerText)))return {state:'list'};
  if(document.readyState!=='complete'||/favLists_05619246/.test(p))return {state:'loading'};
  return {state:'other'};
}
// Each card has its own Cases box and Add to Cart. An item already in the cart shows "You currently have N Cases".
async function soFill(lines){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const cards=()=>[...document.querySelectorAll('div.p-4')].filter(c=>/Per Case/i.test(c.innerText));
  const cardFor=id=>cards().find(c=>new RegExp('\\b'+id+'\\s*•').test(c.innerText));
  const setVal=(el,v)=>{el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.blur()};
  const have=c=>{const m=(c.parentElement.innerText||'').match(/You currently have\s*(\d+)\s*Case/i);return m?+m[1]:0};
  // The list loads more cards as it scrolls.
  let last=-1;for(let k=0;k<30;k++){window.scrollTo(0,document.body.scrollHeight);await sleep(900);const n=cards().length;if(n===last&&k>2)break;last=n}
  window.scrollTo(0,0);
  const out={added:[],skipped:[]};
  for(const l of lines){
    const id=String(l.sku);const c=cardFor(id);
    if(!c){out.skipped.push([l.item,'not on the Weekly Reorder List (item '+id+')']);continue}
    if(/out of stock|unavailable/i.test(c.parentElement.innerText)){out.skipped.push([l.item,'out of stock']);continue}
    if(have(c)>0){out.skipped.push([l.item,'already in cart ('+have(c)+')']);continue}
    const q=c.querySelector('input[type=number]');const b=[...c.querySelectorAll('button')].find(x=>/^\s*Add to Cart\s*$/i.test(x.innerText));
    if(!q||!b){out.skipped.push([l.item,'no Cases box or Add to Cart on its card']);continue}
    c.scrollIntoView({block:'center'});await sleep(300);
    setVal(q,String(l.cases));await sleep(400);
    if(b.disabled){setVal(q,'0');out.skipped.push([l.item,'Add to Cart stayed disabled']);continue}
    b.click();
    let n=0;for(let w=0;w<30&&!n;w++){await sleep(300);const c2=cardFor(id);n=c2?have(c2):0}
    if(n===l.cases)out.added.push([l.item,l.cases,id]);else out.skipped.push([l.item,n?'cart shows '+n+' cases, not '+l.cases+'; check it':'not confirmed in the cart; check it']);
    await sleep(500);
  }
  return out;
}

/* ---------- Markstein (VIP Retailer Portal) ---------- */
// Lightspeed item -> Markstein item number on "Weekly Reorder List". Matched on product, size and units per case
// (Markstein counts packs: 2 x 12-pack = Lightspeed's 24). Firestone 805 24oz -> the loose cans (52824), not the 3-pack.
// Not mapped: Golden State Radical Pineapple (list has "Radical Paradise"). Bucked Up is filled under Muscle Foods' vendor code.
const MARK_LIST='https://apps.vtinfo.com/retailer-portal/00105/retailer/45580/my-items?listId=653';
const MARK_IDS={
 'Shooter - Fireball - 50mL':'88801','Fireball - Blazin\' Apple - 1.7oz':'88811','Shooter - Fris - Vodka - 50ml':'89003','Shooter - Southern Comfort - Whiskey - 50ml':'89601',
 'Shooter - 99 - Bananas - 50ml':'89302','Shooter - 99 - Apples - 50ml':'89301','Shooter - 99 - Watermelon - 50ml':'89305','Shooter - 99 - Peaches - 50ml':'89303',
 'Michelob - Ultra - 12oz':'15046','Stella Artois - 12oz':'42230','Bud Light - 16oz':'10271','Budweiser - 16oz':'10043',
 'Cali Squeeze - Blood Orange - 19.2oz':'33502','Kona Big Wave - Liquid Aloha - 25oz':'28064','Firestone Walker - 805 - 24oz':'52824',
 'Elysian - Space Dust - IPA - 19.2oz':'29206','Elysian - Juice Dust - Juicy IPA - 19.2oz':'29243','Elysian - Jacktail - Hazy IPA - 19.2oz':'29251',
 'Bear Republic - Juicy Hoot - 19oz':'65800','Drake\'s Brewing - Juicy Hoot - Hazy IPA - 12oz':'65804','Bear Republic - Racer 5 - 19oz':'66400','Bear Republic - Racer 7 Hazy - 12oz':'66411',
 'Mango Cart Mas - Imperial Wheat Ale - 19oz':'35519','Mango Cart - Wheat Ale - 12oz':'35543',
 'Martinelli\'s - Mango Hard - 12oz':'70321','Martinelli\'s - Original Hard Cider - 12 oz':'70301',
 'Golden State - Mighty Dry - 16oz':'71217','Golden State - Radical Pog - 16oz':'71412','Golden State - Brut - 16oz':'71202','Golden State - Jamaica - 16oz':'71212',
 'Non-Alcoholic - Cider - Golden State - Dry & Mighty - 16oz':'71502','Non-Alcoholic - Bero - Kingston - Golden Pilsner - 12oz':'82501',
 'Archer Roose - Rose - 250mL':'61311','Archer Roose - Bubbly Rose - 250mL':'61313','Archer Roose - Bubbly White Wine - 250mL':'61303',
 'Hard Soda - Cantaritos - Mandarin - 25oz':'16502','Beatbox - Blueberry Lemonade - 330ml':'43384','Beatbox - Fruit Punch - 330ml':'43382'
};
function mkState(){
  if(/login\.vtinfo\.com$/.test(location.hostname)||document.querySelector('input[type=password]'))return {state:'signin'};
  if(/\/my-items/.test(location.pathname)&&/listId=653/.test(location.search)&&document.querySelector('mat-list-item'))return {state:'list'};
  if(document.readyState!=='complete'||/\/my-items/.test(location.pathname))return {state:'loading'};
  return {state:'other'};
}
// On Markstein each "+" press puts one more case straight into the cart; the row's button then reads "Update Cart".
// Never press delete (removes the item from the list) or anything on the cart page.
async function mkFill(lines){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const rows=()=>[...document.querySelectorAll('mat-list-item')];
  const rowFor=id=>rows().find(e=>e.innerText.includes('('+id+')'));
  const qty=r=>{const i=r&&r.querySelector('input[formcontrolname=quantity]');return i?(+i.value||0):0};
  const inCart=r=>qty(r)>0||[...r.querySelectorAll('button')].some(b=>/Update Cart/i.test(b.innerText));
  let last=-1;for(let k=0;k<20;k++){const sc=document.querySelector('.mat-drawer-content,.mat-sidenav-content')||document.scrollingElement;sc.scrollTop=sc.scrollHeight;window.scrollTo(0,document.body.scrollHeight);await sleep(700);const n=rows().length;if(n===last&&k>2)break;last=n}
  window.scrollTo(0,0);
  const out={added:[],skipped:[]};
  for(const l of lines){
    const id=String(l.sku);const r=rowFor(id);
    if(!r){out.skipped.push([l.item,'not on the Weekly Reorder List (item '+id+')']);continue}
    if(/Out of Stock/i.test(r.innerText)){out.skipped.push([l.item,'out of stock']);continue}
    if(inCart(r)){out.skipped.push([l.item,'already in cart ('+qty(r)+')']);continue}
    r.scrollIntoView({block:'center'});await sleep(200);
    for(let n=0;n<l.cases;n++){const p=[...rowFor(id).querySelectorAll('item-place-order button')].find(b=>b.innerText.trim()==='+');if(!p||p.disabled)break;p.click();await sleep(700)}
    let q=0;for(let w=0;w<15&&(q=qty(rowFor(id)))!==l.cases;w++)await sleep(300);
    if(q===l.cases)out.added.push([l.item,l.cases,id]);else out.skipped.push([l.item,'could not set '+l.cases+' cases (shows '+q+'); check the cart']);
  }
  return out;
}

/* ---------- Muscle Foods USA ---------- */
// Lightspeed item -> Muscle Foods item number on the "Skylinks Weekly Reorder" wish list.
// Not mapped: Gym Weed Mango Razz (not sold). Bucked Up is filed under Muscle Foods in Lightspeed but is on Markstein's list
// (79001 Rocket Pop, 79003 White Gummy Deer, 79005 Blood Raz, 79002 Miami), so those lines need moving to Markstein.
const MUSC_LIST='https://shop.musclefoodsusa.com/wish';
const MUSC_IDS={'Gym Weed - Watermelon - 12oz':'7620004','Gym Weed - Tropical Punch - 12oz':'7620006'};
function muState(){
  if(/\/login/i.test(location.pathname)||document.querySelector('input[type=password]'))return {state:'signin'};
  if(/^\/wish/.test(location.pathname)){
    if(document.querySelector('input[name=Reorder]'))return {state:'list'};
    // The wish-list page first shows the lists; open ours.
    const row=[...document.querySelectorAll('tr.cpointer')].find(t=>/Skylinks Weekly Reorder/.test(t.innerText));if(row)row.click();
    return {state:'loading'};
  }
  return {state:document.readyState==='complete'?'other':'loading'};
}
// Each row has a case box; ADD TO CART adds the rows that have a number. One item at a time, confirmed by the
// "<item> has been added to your cart" message. The cart page renders in the browser, so it is read in a hidden frame.
async function muFill(lines){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const boxFor=id=>[...document.querySelectorAll('input[name=Reorder]')].find(x=>new RegExp('\\b'+id+'\\b').test((x.closest('tr')||x.parentElement.parentElement).innerText));
  const setVal=(el,v)=>{el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);for(const t of ['input','change','blur'])el.dispatchEvent(new Event(t,{bubbles:true}));el.blur()};
  const total=()=>{const e=[...document.querySelectorAll('*')].filter(x=>/CART - \$/.test(x.innerText||'')&&x.children.length<4).pop();return e?(e.innerText.match(/\$[\d,]+\.\d\d/)||[''])[0]:''};
  const readCart=async()=>{const f=document.createElement('iframe');f.style.cssText='position:absolute;width:1px;height:1px;left:-9999px';f.src='/viewcart';document.body.appendChild(f);
    let ids=null;for(let w=0;w<40&&!ids;w++){await sleep(300);try{const d=f.contentDocument;if(d&&d.readyState==='complete'&&/\/viewcart/.test(f.contentWindow.location.pathname)){const t=d.body.innerText;if(/\d{7}\s/.test(t)||/empty/i.test(t)||(w>15&&/Shopping Cart/i.test(d.title)))ids=(t.match(/\b\d{7}\b/g)||[])}}catch(e){}}
    f.remove();return ids};
  const out={added:[],skipped:[]};
  if([...document.querySelectorAll('input[name=Reorder]')].some(i=>i.value&&+i.value>0))return {added:[],skipped:lines.map(l=>[l.item,'the wish list already had quantities typed in; nothing was added. Reload it and run again'])};
  const inCart=await readCart();
  if(!inCart&&total()!=='$0.00')return {added:[],skipped:lines.map(l=>[l.item,'could not read the cart; nothing was added'])};
  for(const l of lines){
    const id=String(l.sku);const i=boxFor(id);
    if(!i){out.skipped.push([l.item,'not on the Skylinks Weekly Reorder list (item '+id+')']);continue}
    if(inCart&&inCart.includes(id)){out.skipped.push([l.item,'already in cart']);continue}
    if(/out of stock|unavailable|discontinued/i.test((i.closest('tr')||i.parentElement.parentElement).innerText)){out.skipped.push([l.item,'out of stock']);continue}
    setVal(i,String(l.cases));await sleep(400);
    const b=[...document.querySelectorAll('button,input[type=button],input[type=submit],a')].find(x=>x.offsetParent&&/^\s*ADD TO CART\s*$/i.test(x.innerText||x.value||''));
    if(!b){setVal(i,'');out.skipped.push([l.item,'no ADD TO CART button']);continue}
    b.click();
    let ok=false;for(let w=0;w<30&&!ok;w++){await sleep(300);ok=[...document.querySelectorAll('.alert,.toast,.toast-message,[role=alert]')].some(e=>new RegExp('item '+id+' has been added','i').test(e.innerText))}
    if(ok)out.added.push([l.item,l.cases,id]);else out.skipped.push([l.item,'not confirmed in the cart; check it']);
    await sleep(800);
  }
  out.total=total();
  return out;
}

/* ---------- registry ---------- */
const PORTALS={
  GOLD:{name:'GoldenBrands',site:'SipMarket',start:SIPMARKET.orderList,sku:n=>SIPMARKET.skuFor(n),state:smState,fill:smFill,
        // signed in but on another page: go to the Order List (the only page we fill on)
        relist:st=>st==='dashboard'||st==='other'?SIPMARKET.orderList:null},
  SFNA:{name:'SF Naturals',site:'SF Naturals',start:'https://sfnaturals.pepr.app/',sku:portalMap(SF_CODES),state:sfState,fill:sfFill,relist:()=>null,
        note:r=>{const t=parseFloat(String(r.total||'').replace(/[$,]/g,''));return t&&t<350?' Cart is under the $350 delivery minimum.':''}},
  BRKT:{name:'Breakthru Bev',site:'Breakthru Now',start:'https://now.breakthrubev.com/bulkAdd',sku:portalMap(BRKT_IDS),state:brState,fill:brFill,verify:brVerify,
        relist:st=>st==='other'?'https://now.breakthrubev.com/bulkAdd':null},
  SOUT:{name:'Southern Wine',site:'Proof',start:SOUT_LIST,sku:portalMap(SOUT_IDS),state:soState,fill:soFill,
        relist:st=>st==='other'?SOUT_LIST:null},
  MARK:{name:'Markstein',site:'Markstein Retailer Portal',start:MARK_LIST,sku:portalMap(MARK_IDS),state:mkState,fill:mkFill,
        relist:st=>st==='other'?MARK_LIST:null},
  MUSC:{name:'Muscle Foods USA',site:'Muscle Foods',start:MUSC_LIST,sku:portalMap(MUSC_IDS),state:muState,fill:muFill,
        relist:st=>st==='other'?MUSC_LIST:null}
};
