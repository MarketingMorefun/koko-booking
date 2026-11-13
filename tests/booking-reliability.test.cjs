const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const root=path.join(__dirname,'..');
function lambda(file,index=0){
  const source=fs.readFileSync(path.join(root,file+'.txt'),'utf8');
  const codes=[...source.matchAll(/^\s*code\s*=\s*(?:"""([\s\S]*?)"""|("(?:[^"\\]|\\.)*"))/gm)];
  const code=codes[index][1]===undefined?JSON.parse(codes[index][2]):codes[index][1];
  return new AsyncFunction('$var','$input','$env','crypto',code);
}
const verify=lambda('StripeWebhook');
const decide=lambda('apply_stripe_checkout');
const delivery=lambda('ResendWebhook',1);
const now=Math.floor(Date.now()/1000);
const secret='whsec_test_only';
const keys=[{location_id:1,is_active:true,webhook_secret_live:secret},{location_id:11,is_active:true,webhook_secret_live:secret}];
const raw='{ "id": "evt_example", "livemode": true }';
function sign(body=raw,time=now,key=secret){return 't='+time+',v1='+crypto.createHmac('sha256',key).update(time+'.'+body).digest('hex');}
function check(body,signature,overrides={}){return verify({raw_body:body,StripeKeys:keys}, {}, {$http_headers:{'Stripe-Signature':signature},...overrides},crypto);}
test('accepts exact original bytes, case insensitive headers and shared account venues',async()=>{
  const r=await check(raw,sign());assert.equal(r.ok,true);assert.deepEqual(r.location_ids,[1,11]);
  assert.equal((await check(raw,null,{$http_headers:{'stripe-signature':sign()}})).ok,true);
});
test('rejects missing signatures, forged bodies and re-encoded JSON',async()=>{
  assert.equal((await check(raw,undefined)).ok,false);
  assert.equal((await check(raw,sign(raw,now,'wrong'))).ok,false);
  assert.equal((await check(JSON.stringify(JSON.parse(raw)),sign())).ok,false);
  assert.equal((await check(raw+' ',sign())).ok,false);
});
test('rejects stale, future, malformed and unconfigured signatures',async()=>{
  for(const h of [sign(raw,now-360),sign(raw,now+360),'t=abc,v1=123','t='+now+',v1=123'])assert.equal((await check(raw,h)).ok,false);
  assert.equal((await verify({raw_body:raw,StripeKeys:[]},{},{$http_headers:{'Stripe-Signature':sign()}},crypto)).ok,false);
});
test('accepts any valid v1 signature during Stripe signing-key rotation',async()=>{
  assert.equal((await check(raw,'t='+now+',v1='+'0'.repeat(64)+','+sign().split(',')[1])).ok,true);
});
const booking={id:7,location_id:1,status:'pending_payment',stripe_session_id:'cs_current',grand_total_cents:38000,discount_cents:3000,checkout_payment_cents:5000,checkout_total_cents:5150,checkout_payment_type:'deposit'};
const session={id:'cs_current',mode:'payment',livemode:true,currency:'aud',status:'complete',payment_status:'paid',amount_total:5150,client_reference_id:'7',metadata:{booking_id:'7',location_id:'1',payment_type:'deposit',deposit_cents:'5000',surcharge_cents:'150'}};
function evaluate(b={},s={},event={}){return decide({Booking:{...booking,...b}},{session:{...session,...s},event_id:'evt_1',event_type:'checkout.session.completed',...event},{},crypto);}
test('settles only verified paid amount and computes net balance',async()=>{
  const r=await evaluate();assert.equal(r.action,'settle');assert.equal(r.payment_cents,5000);assert.equal(r.balance_cents,30000);assert.match(r.referral_code,/^KOKO-7-/);
});
test('does not fulfil completed sessions whose payment is still unpaid',async()=>{
  assert.equal((await evaluate({},{payment_status:'unpaid'})).action,'ignore');
});
test('rejects altered amount, currency, account mode and booking identity',async()=>{
  for(const patch of [{amount_total:100},{currency:'usd'},{livemode:false},{mode:'subscription'},{client_reference_id:'8'},{metadata:{...session.metadata,booking_id:'8'}},{metadata:{...session.metadata,location_id:'2'}},{metadata:{...session.metadata,deposit_cents:'100'}}])assert.equal((await evaluate({},patch)).action,'review');
});
test('deduplicates by both event and checkout session',async()=>{
  assert.equal((await evaluate({payment_event_log:[{id:'evt_1'}]})).action,'duplicate');
  assert.equal((await evaluate({payment_processed_session_id:'cs_current'})).action,'duplicate');
  assert.equal((await evaluate({status:'deposit_paid'}, {}, {event_id:'evt_other'})).action,'duplicate');
});
test('preserves an existing referral code and paid/refunded state',async()=>{
  assert.equal((await evaluate({referral_code:'KOKO-EXISTING'})).referral_code,'KOKO-EXISTING');
  assert.equal((await evaluate({status:'refunded'})).action,'review');
  assert.equal((await evaluate({status:'deposit_paid'},{status:'expired',payment_status:'unpaid'})).action,'ignore');
});
test('old checkout expiry cannot expire a replacement or issue rewards',async()=>{
  assert.equal((await evaluate({},{id:'cs_old',status:'expired',payment_status:'unpaid'})).action,'ignore');
  assert.equal((await evaluate({},{id:'cs_old'})).action,'review');
  assert.equal((await evaluate({},{status:'expired',payment_status:'unpaid'})).action,'expire');
});
test('records full group payment using stored expectation',async()=>{
  const b={checkout_payment_type:'full',checkout_payment_cents:35000,checkout_total_cents:35150};
  const s={amount_total:35150,metadata:{...session.metadata,payment_type:'full',deposit_cents:'35000'}};
  const r=await evaluate(b,s);assert.equal(r.action,'settle');assert.equal(r.balance_cents,0);
});
test('legacy sessions still require independently computed deposit and fee',async()=>{
  const b={checkout_payment_type:null,checkout_payment_cents:null,checkout_total_cents:null};
  assert.equal((await evaluate(b)).action,'settle');
  assert.equal((await evaluate(b,{amount_total:1})).action,'review');
});
test('email delivery events cannot move status backwards or affect another resend',async()=>{
  const ts=Date.now();
  const b={confirmation_email_status:'delivered',confirmation_email_event_at:ts};
  function update(type,at){return delivery({Booking:b,Verified:{event:{type,created_at:new Date(at).toISOString(),data:{}}}},{},{},crypto);}
  assert.equal(await update('email.delivery_delayed',ts+1000),null);
  assert.equal(await update('email.bounced',ts-1000),null);
  assert.equal((await update('email.bounced',ts+1000)).status,'bounced');
});
test('signed Resend/Svix callback verifies the original body',async()=>{
  const verifyMail=lambda('ResendWebhook');
  const key=Buffer.from('test-key').toString('base64');
  const id='msg_test',ts=String(now),body=JSON.stringify({type:'email.delivered'});
  const signature=crypto.createHmac('sha256',Buffer.from(key,'base64')).update(id+'.'+ts+'.'+body).digest('base64');
  const vars={raw_body:body,Settings:{webhook_secret:'whsec_'+key}};
  const env={$http_headers:{'svix-id':id,'svix-timestamp':ts,'svix-signature':'v1,'+signature}};
  assert.equal((await verifyMail(vars,{},env,crypto)).ok,true);
  assert.equal((await verifyMail({...vars,raw_body:body+' '},{},env,crypto)).ok,false);
});
test('confirmation email uses canonical package quantities',async()=>{
  const includes=lambda('send_booking_confirmation');
  const html=await includes({Package:{free_play_minutes:100,claw_games:10,feature_games:8,preloaded_tickets:1000}},{},{},crypto);
  assert.match(html,/8x Feature Games/);assert.match(html,/1000 KOKO Tickets/);
});
