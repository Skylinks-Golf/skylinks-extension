/* SipMarket (GoldenBrands) cart fill.
   Scope (Agent Permissions, LC, 2026-11-10): add approved items from the SipMarket Order List to the cart by SKU,
   on /en/orders/my-order-list/ and /en/dashboard/ only, then stop. Never checkout, submit or "Add List to Cart";
   never type a login; no items outside the Order List; no substitutions, price or account changes. */
const SIPMARKET={
  orderList:'https://www.sipmarket.com/en/orders/my-order-list/',
  match:'https://www.sipmarket.com/*',
  // Lightspeed item -> SipMarket Order List SKU. Only items whose SipMarket package matches what we stock.
  // Items not here are reported as "needs your pick" and never guessed.
  SKU:{
    'Ace - Guava - 12oz':'49290',
    'Blue Moon - Belgian White - 19.2oz':'63877',
    'Buzz Ball - Berry Cherry Limeade - 187ml':'65526',
    'Cayman Jack - Strawberry Margarita - 24oz':'59610',
    'Cayman Jack - Tropical Margarita - 19.2oz':'70047',
    'Coors Banquet - Lager - 16oz':'52990',
    'Coors Light - Lager - 16oz':'17810',
    'Corona - Extra - 12oz':'27016',
    'Corona - Extra - 24oz':'14121',
    'Fall River - Numb Numb Juice - Hazy IPA - 16oz':'47166',
    'Green Flash - West Coast IPA - 12oz':'44217',
    'Guinness - Stout - 14.9oz':'10327',
    'Heineken - Lager - 24oz':'10303',
    'Lagunitas - IPA - 19.2oz':'42837',
    'Lagunitas - Lil Sumpin Sumpin - 19.2oz':'50370',
    'Lagunitas - Uncensored Punch - Tropical Fruit Punch - 19.2oz':'66023',
    "Mike's Harder - Hurricane Punch - 23.5oz":'64113',
    'Miller Lite - American Lager - 16oz':'13242',
    'Modelo - Chelada - 24oz':'21026',
    'Modelo - Especial - 12oz':'10170',
    'Modelo - Especial - 24oz':'10167',
    'Modelo - Negra - 24oz':'39110',
    'Monaco - Black Raspberry - 12oz':'70250',
    'Monaco - Blue Crush - 12oz':'65257',
    'Monaco - Lime Crush - 12oz':'65259',
    'Monaco - Watermelon Crush - 12oz':'65252',
    'Non-Alcoholic - Lagunitas - IPA - 12oz':'65991',
    'Pacifico - Clara - 12oz':'35350',
    'Pacifico - Lager - 24oz':'30491',
    'Sierra Nevada - Atomic Torpedo - Imperial IPA - 19.2oz':'54798',
    'Sierra Nevada - Big Little Thing - Hazy Imperial IPA - 19.2oz':'51486',
    'Sierra Nevada - Cosmic Little Thing - 19.2oz':'64043',
    'Sierra Nevada - Hazy Little Thing - IPA - 19.2oz':'44148',
    'Sierra Nevada - Pale Ale - 19.2oz':'51485',
    'Topo Chico - Strawberry Guava - 24oz':'52195',
    'Truly - Pineapple - 24oz':'46122',
    'Truly - Strawberry Lemonade - 24oz':'50593',
    'Truly - Wild Berry - 24oz':'46123',
    'Twisted Tea - Half & Half - 24oz':'15340',
    'Voodoo Ranger - IPA - 19.2oz':'39689',
    'Voodoo Ranger - Imperial IPA - 19.2oz':'44345',
    'Voodoo Ranger - Juicy Haze - IPA - 19.2 oz':'50136',
    'White Claw - Blackberry - 12oz':'59562',
    'White Claw - Blackberry - 19.2oz':'59849',
    'White Claw - Mango - 12oz':'45952',
    'White Claw - Peach - 12oz':'66203',
    'White Claw - Ruby Grapefruit - 12oz':'31917',
    'White Claw - Watermelon - 19.2oz':'55842'
  },
  key(n){return String(n).replace(/^(Beer|Seltzer|Cider|Malt|Hard Tea|Hard Kombucha|Wine Cocktail|Cocktail)\s*-\s*/i,'').replace(/\s*-\s*(Single|Serving)\b.*$/i,'').toLowerCase().replace(/[^a-z0-9]/g,'')},
  skuFor(n){if(!this._k){this._k={};for(const [k,v] of Object.entries(this.SKU))this._k[this.key(k)]=v}return this._k[this.key(n)]||null}
};

/* Injected into the SipMarket tab. Self-contained: no closures. */
function smState(){
  const p=location.pathname;
  if(/\/login/i.test(p)||document.querySelector('input[type=password]'))return {state:'signin'};
  if(/\/en\/orders\/my-order-list\/?$/.test(p))return {state:document.querySelector('div.card.newCard.product')?'list':'loading'};
  if(/\/en\/dashboard\/?$/.test(p))return {state:'dashboard'};
  return {state:'other'};
}
async function smFill(lines){
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<40&&!document.querySelector('div.card.newCard.product');i++)await sleep(500);
  const money=()=>{const e=document.querySelector('.po__subtotal-value');return e?parseFloat(e.textContent.replace(/[^0-9.]/g,''))||0:NaN};
  const lines_=()=>{const e=document.querySelector('.cart__counter');return e?parseInt(e.textContent,10)||0:NaN};
  const out={added:[],skipped:[]};
  for(const l of lines){
    const card=document.querySelector('div.card.newCard.product[data-sku="'+String(l.sku).replace(/\D/g,'')+'"]');
    if(!card){out.skipped.push([l.item,'not on Order List']);continue}
    const max=+card.dataset.maxQty||0,inCart=+card.dataset.unitsInCart||0;
    if(inCart>0){out.skipped.push([l.item,'already in cart ('+inCart+')']);continue}
    if(max&&l.cases>max){out.skipped.push([l.item,'only '+max+' available']);continue}
    const box=card.querySelector('.cnt-add-to-cart input'),plus=card.querySelector('.qs__btn--add-v2'),add=card.querySelector('button.js--add-to-cart');
    if(!box||!plus||!add){out.skipped.push([l.item,'page layout changed']);continue}
    card.scrollIntoView({block:'center'});
    for(let n=0;n<l.cases&&+box.value<l.cases;n++){plus.click();await sleep(150)}
    if(+box.value!==l.cases){out.skipped.push([l.item,'could not set '+l.cases+' cases']);continue}
    for(let w=0;w<10&&add.disabled;w++)await sleep(200);
    const m0=money(),c0=lines_();
    add.click();
    // SipMarket confirms an add by raising the cart subtotal / line counter and resetting the row's box to 0.
    let ok=false;for(let w=0;w<30;w++){await sleep(300);if(money()>m0||lines_()>c0||(+box.value===0&&money()!==m0)){ok=true;break}}
    if(ok)out.added.push([l.item,l.cases,card.dataset.name+' ('+card.dataset.packageName+')']);else out.skipped.push([l.item,'cart did not confirm; check the cart']);
  }
  return out;
}
