const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
function load(file,responses){
  const src=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const start=src.indexOf('const BUSY_WAITS_MS'),end=src.indexOf('const '+(file==='koko-booking.js'?'PACKAGE_IDS={':'MIN_ADVANCE_MS='));
  const waits=[],calls=[],dom={notice:null},timers=[];
  const env={
    fetch:async(url,o)=>{calls.push([url,o]);const r=responses.length>1?responses.shift():responses[0];if(r instanceof Error)throw r;return new Response(JSON.stringify(r.body||{}),{status:r.status});},
    setTimeout:(fn,ms)=>{waits.push(ms);const t={fn,live:true};timers.push(t);if(!env.manual)queueMicrotask(()=>t.live&&fn());return t;},
    clearTimeout:t=>{t.live=false;},
    document:{getElementById:()=>dom.notice,createElement:()=>({style:{},setAttribute(){},remove(){dom.notice=null;}}),body:{appendChild:n=>{dom.notice=n;}}},
  };
  const apiFetch=new Function('fetch','setTimeout','clearTimeout','document',src.slice(start,end)+';return apiFetch;')(env.fetch,env.setTimeout,env.clearTimeout,env.document);
  return {apiFetch,waits,calls,dom,env,timers};
}
const tick=()=>new Promise(r=>setImmediate(r));
for(const file of ['koko-booking.js','koko-group-booking.js']){
  test(file+': a 429 is retried and the same request then succeeds',async()=>{
    const t=load(file,[{status:429},{status:429},{status:200,body:{id:5}}]);
    const r=await t.apiFetch('x/CreateBooking',{method:'POST',body:'b'});
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{id:5});
    assert.equal(t.calls.length,3);assert.equal(t.calls[2][1].body,'b');assert.equal(t.dom.notice,null);
  });
  test(file+': gives up after 4 tries with a customer-friendly message',async()=>{
    const t=load(file,[{status:429,body:{message:'Whoa there! Your plan only supports 10 requests'}}]);
    const r=await t.apiFetch('x/Quote',{});const d=await r.json();
    assert.equal(t.calls.length,4);assert.equal(r.status,429);assert.match(d.error_message,/very busy/);assert.doesNotMatch(d.message,/plan/);
    assert.ok(t.waits.reduce((a,b)=>a+b,0)>=24000);assert.equal(t.dom.notice,null);
  });
  test(file+': other errors and network failures are never retried',async()=>{
    for(const s of [400,500]){const t=load(file,[{status:s}]);assert.equal((await t.apiFetch('x/CreateGroupBooking',{})).status,s);assert.equal(t.calls.length,1);}
    const t=load(file,[new Error('network')]);await assert.rejects(t.apiFetch('x/CreateBooking',{}),/network/);assert.equal(t.calls.length,1);
  });
  test(file+': a newer search cancels an older waiting one; creates are not cancelled',async()=>{
    const t=load(file,[{status:429},{status:200,body:{n:2}}]);t.env.manual=true;
    const old=t.apiFetch('x/Availability',{});old.catch(()=>{});await tick();assert.ok(t.dom.notice);
    const r=await t.apiFetch('x/Availability',{});assert.deepEqual(await r.json(),{n:2});
    await assert.rejects(old,/Replaced/);assert.equal(t.dom.notice,null);assert.equal(t.calls.length,2);
    const c=load(file,[{status:429},{status:200,body:{}},{status:200,body:{ok:1}}]);c.env.manual=true;
    const first=c.apiFetch('x/CreateBooking',{});await tick();await c.apiFetch('x/CreateBooking',{});c.timers[0].fn();
    assert.equal((await first).status,200);
  });
  test(file+': the same quote is reused, a different or failed one is not',async()=>{
    const t=load(file,[{status:200,body:{error_message:'no'}},{status:200,body:{q:1}}]);
    for(const b of ['a','a','a','b','a'])await t.apiFetch('x/Quote',{method:'POST',body:b});
    assert.equal(t.calls.length,3);
    await t.apiFetch('x/CheckPromo',{body:'a'});await t.apiFetch('x/CheckPromo',{body:'a'});await t.apiFetch('x/Availability',{body:'a'});await t.apiFetch('x/Availability',{body:'a'});
    assert.equal(t.calls.length,7);
  });
  test(file+': add-on lists are fetched once, failures are not remembered',async()=>{
    const t=load(file,[{status:500},{status:200,body:{addons:[1]}}]);
    await t.apiFetch('x/addons?location_slug=A');
    await t.apiFetch('x/addons?location_slug=A');
    assert.deepEqual(await (await t.apiFetch('x/addons?location_slug=A')).json(),{addons:[1]});assert.equal(t.calls.length,2);
    await t.apiFetch('x/addons?location_slug=B');assert.equal(t.calls.length,3);
  });
}
for(const file of ['koko-booking.js','koko-group-booking.js']){
  test(file+': customers never see server wording',()=>{
    const src=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
    const s=src.indexOf('const ERROR_TRY_AGAIN'),e=src.indexOf("// Xano's free plan");
    const f=new Function('console',src.slice(s,e)+';return customerError;')({error(){}});
    for(const bad of ['Whoa there! Your plan only supports 10 requests per 20 seconds. https://docs.xano.com/api-rate-limit','Quote API returned an empty response.','Failed to fetch','Load failed','Unexpected token < in JSON at position 0','Missing param: location_slug','CreateBooking failed (500).','Please check Xano ConfirmBooking response','Payment URL not returned.',"Cannot read properties of undefined (reading 'id')"])
      assert.equal(f(bad),'Something went wrong. Please refresh the page and try again.',bad);
    for(const good of ['This time slot is no longer available.','Please choose a date at least 72 hours from now.','This promo code has expired.',"We're very busy right now. Please refresh the page and try again in a moment.",'KOKO Party Max is not available for this location and party size.',''])
      assert.equal(f(good),good);
  });
}
