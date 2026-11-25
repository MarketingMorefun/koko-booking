// Runs the exact discount code inside evaluate_promo.txt.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','evaluate_promo.txt'),'utf8').match(/code = """([\s\S]*?)"""/)[1];
const fn=new Function('$var','$input','Date',src);
const S=1795611600000,E=1796043600000;
const base={label:'Black Friday',is_active:true,starts_at_ms:S,ends_at_ms:E,min_guests:10};
const RULES=[{...base,booking_type:'group_booking',location_ids:[1,3,4,5],package_ids:[2,3],kind:'percent_capped',percent:25,cap_cents:10000,min_package_cents:30000},
  {...base,booking_type:'birthday_party',location_ids:[1,4,5],package_ids:[1],kind:'upgrade_price',base_package_id:5,min_package_cents:0}];
const Prices=[[5,2800],[1,3200],[2,3000],[3,3800]].map(([package_id,price_pp_cents])=>({package_id,price_pp_cents}));
const run=(code,booking_type,location_id,package_id,guests,now=S)=>fn({PromoRows:code==='BLACKFRIDAY'?RULES:code==='GROUPONLY'?[RULES[0]]:[],code_clean:code,Prices},{booking_type,location_id,package_id,guests},{now:()=>now});
const G='group_booking',B='birthday_party';
test('BLACKFRIDAY group: 25% of the package, max $100',()=>{for(const [p,g,off] of [[2,10,7500],[2,13,9750],[2,14,10000],[3,10,9500],[3,11,10000],[3,30,10000]])assert.equal(run('BLACKFRIDAY',G,1,p,g).discount_cents,off)});
test('BLACKFRIDAY birthday: Party Max at the Party Fun price',()=>{assert.equal(run('BLACKFRIDAY',B,1,1,10).discount_cents,4000);assert.equal(run('BLACKFRIDAY',B,5,1,16).discount_cents,6400);const r=run('BLACKFRIDAY',B,1,5,10);assert.equal(r.ok,false);assert.equal(r.needs_package_id,1)});
test('refused: time, place, package, guests, type, unknown',()=>{for(const a of [['BLACKFRIDAY',G,1,2,10,S-1],['BLACKFRIDAY',G,1,2,10,E],['BLACKFRIDAY',G,6,8,10],['BLACKFRIDAY',G,1,2,9],['GROUPONLY',B,1,1,10],['BLACKFRIDAY',G,1,1,10],['BLACKFRIDAY',B,3,1,10],['NOPE',G,1,2,10],['',G,1,2,10]]){const r=run(...a);assert.equal(r.ok,false);assert.equal(r.discount_cents,0);assert.ok(r.message)}});
test('window is open to the last millisecond',()=>assert.equal(run('BLACKFRIDAY',G,1,2,10,E-1).ok,true));
