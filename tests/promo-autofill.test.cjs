// Runs the promo-code section of both booking scripts with a fake page and fake CheckPromo.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const END=1796043600000;
function load(file,{search='',now=END-1,check}={}){
  const src=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const part=src.slice(src.indexOf('// ---- Promo code'),src.indexOf('function discountLabel'));
  const els={};
  const el=(tag)=>{const e={tagName:tag,style:{},value:'',textContent:'',children:[],listeners:{},
    appendChild(c){this.children.push(c);if(c.id)els[c.id]=c;for(const k of c.children||[])if(k.id)els[k.id]=k;},
    setAttribute(){},addEventListener(t,f){this.listeners[t]=f;},
    set id(v){this._id=v;els[v]=this;},get id(){return this._id;}};return e;};
  const btn=el('a');btn.id='ReviewBtn';btn.parentNode={insertBefore(n){const walk=x=>{if(x.id)els[x.id]=x;(x.children||[]).forEach(walk);};walk(n);}};
  const document={getElementById:id=>els[id]||null,createElement:el,querySelector:()=>null};
  const state={location_slug:'Townhall_614',package_id:2,guests:10};
  const calls=[];
  const apiFetch=async(url,o)=>{const body=JSON.parse(o.body);calls.push(body);const d=check(body);return {ok:true,json:async()=>d};};
  const win={groupBookingState:state,bookingState:state};
  const getQuote=async()=>{state.package_id=1;state.quote={package_id:1};};
  const fn=new Function('document','location','window','apiFetch','BASE_URL','Date','money','getQuote','PACKAGE_IDS',
    part+';return {ensurePromoField,applyPromo,promoValue,status:()=>document.getElementById("'+(file==='koko-booking.js'?'promoCodeStatus':'groupPromoCodeStatus')+'").textContent,input:()=>document.getElementById("'+(file==='koko-booking.js'?'promoCode':'groupPromoCode')+'")};');
  const api=fn(document,{search},win,apiFetch,'x',{now:()=>now},c=>'$'+(c/100).toFixed(2),getQuote,{max:1,fun:5});
  api.ensurePromoField('ReviewBtn');
  return {...api,state,calls};
}
const ok=d=>()=>({ok:true,discount_cents:d});
const no=()=>({ok:false,message:'This code does not apply to this booking.'});
for(const file of ['koko-group-booking.js','koko-booking.js']){
  test(file+': BLACKFRIDAY is filled in during the campaign, with no link needed',()=>{
    const t=load(file,{check:ok(7500)});
    assert.equal(t.promoValue(),'BLACKFRIDAY');assert.match(t.status(),/added code BLACKFRIDAY/);
  });
  test(file+': nothing is filled in from 1 Dec',()=>{
    const t=load(file,{now:END,check:ok(7500)});
    assert.equal(t.promoValue(),'');
  });
  test(file+': a ?promo= link still wins over the default',()=>{
    const t=load(file,{search:'?promo=summer10',check:ok(100)});
    assert.equal(t.promoValue(),'SUMMER10');
  });
  test(file+': a filled-in code that fits is applied',async()=>{
    const t=load(file,{check:ok(7500)});
    assert.equal(await t.applyPromo(),true);assert.equal(t.promoValue(),'BLACKFRIDAY');assert.match(t.status(),/\$75\.00 off/);
  });
  test(file+': a filled-in code that does not fit is removed and the booking goes on',async()=>{
    const t=load(file,{check:no});
    assert.equal(await t.applyPromo(),true);assert.equal(t.promoValue(),'');assert.match(t.status(),/doesn't apply.*removed/);
    assert.equal(await t.applyPromo(),true);assert.equal(t.calls.length,1);
  });
  test(file+': a ?promo= code that does not fit is also removed quietly',async()=>{
    const t=load(file,{search:'?promo=BLACKFRIDAY',check:no});
    assert.equal(await t.applyPromo(),true);assert.equal(t.promoValue(),'');
  });
  test(file+': a code the customer typed still shows the error and stops',async()=>{
    const t=load(file,{check:no});
    t.input().value='BLACKFRIDAY';t.input().listeners.input();
    assert.equal(await t.applyPromo(),false);assert.equal(t.promoValue(),'BLACKFRIDAY');assert.match(t.status(),/Remove the code/);
  });
}
test('koko-booking.js: filled-in code on Party Fun moves the party up to Party Max',async()=>{
  let n=0;
  const t=load('koko-booking.js',{check:b=>(++n===1?{ok:false,needs_package_id:1}:{ok:true,discount_cents:4000,kind:'upgrade_price'})});
  t.state.package_id=5;
  assert.equal(await t.applyPromo(),true);assert.equal(t.state.package_id,1);assert.equal(t.promoValue(),'BLACKFRIDAY');assert.match(t.status(),/Party Max at the Party Fun price/);
});
