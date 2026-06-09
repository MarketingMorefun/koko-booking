(function(){
const BASE_URL="https://x8ki-letl-twmt.n7.xano.io/api:KARDPSrJ";
const DEPOSIT_CENTS=5000;
const MIN_PARTY_SIZE=10;
const MIN_ADVANCE_MS=259200000;
const PACKAGE_IDS={joy:10,fun:5,max:1};
const LOCATION_GUEST_LIMITS={Hurstville:16,Hornsby:16,Haymarket:16,Burwood:16,Townhall_614:20};
const LOCATION_NAMES={
Townhall_614:"Town Hall - 614",
Hurstville:"Hurstville",
Hornsby:"Hornsby",
KOKO_Cityheroes_Hornsby:"KOKO&Cityheroes - Hornsby",
Burwood:"Burwood",
Haymarket:"Haymarket"
};
const DEFAULT_TAGS=["Arcade","Prize Games","Birthday Parties"],DEFAULT_DESC="Family-friendly KOKO venue for arcade play, prize games and birthday groups.",DEFAULT_NOTE="Party package available at this venue.";
const LOCATION_PREVIEWS={Townhall_614:{badge:"Sydney CBD",desc:"Sydney’s largest KOKO venue featuring arcade favourites, claw machines and dedicated party spaces."},KOKO_Cityheroes_Hornsby:{badge:"Level 2",tags:["Arcade","CityHeroes","Group Play"],desc:"Level 2 kids’ entertainment venue with KOKO arcade games and CityHeroes activities. Great for birthday parties and group play.",note:"Package only valid at Level 2, not Level 4."},Hornsby:{badge:"Level 4"},Hurstville:{badge:"Hurstville"},Burwood:{badge:"Burwood"},Haymarket:{badge:"Haymarket",desc:"City KOKO venue for arcade play, prize games and birthday groups."}};
const locationNoteCache={},locationNotePending={};
window.bookingState={
location_slug:"",
date:"",
guests:0,
party_room_id:null,
start_ts:null,
end_ts:null,
package_id:null,
available_package_ids:[],
addons:[],
quote:null,
booking:null,
selected_room_name:"",
selected_slot_label:"",
customer_name:"",
customer_phone:"",
customer_email:"",
birthday_child_name:"",
birthday_child_gender:"",
average_age:"",
booking_notes:""
};
function $(id){return document.getElementById(id)}
function locLimit(slug){return LOCATION_GUEST_LIMITS[slug]||25}
function locName(slug){return LOCATION_NAMES[slug]||slug||"this location"}
function maxGuestsMessage(slug,max){
const limit=Number(max||locLimit(slug)||0);
return `${locName(slug)} can only accept up to ${limit} guests for birthday parties. Please reduce the party size or choose another location.`;
}
function unitName(t){return t?String(t).replace(/_/g," "):"item"}
function money(cents){return "$"+(Number(cents||0)/100).toFixed(2)}
function msg(text,isErr){const el=$("bookingMessage");if(!el)return;el.textContent=text||"";el.style.color=isErr?"#c24b34":"#2F8F5B"}
function show(id,scroll){const el=$(id);if(!el)return;el.style.display="block";el.style.visibility="visible";el.style.opacity="1";if(scroll)setTimeout(()=>{const y=el.getBoundingClientRect().top+window.pageYOffset-120;window.scrollTo({top:Math.max(y,0),behavior:"smooth"})},50)}
function hide(id){const el=$(id);if(el)el.style.display="none"}
function clear(el){if(!el)return;while(el.firstChild)el.removeChild(el.firstChild)}
function el(tag,text,style){const x=document.createElement(tag);if(typeof text==="string")x.textContent=text;if(style)Object.keys(style).forEach(k=>x.style[k]=style[k]);return x}
function reviewText(id,value){const x=$(id);if(x)x.textContent=value||"-"}
function packageName(id){if(id===PACKAGE_IDS.joy)return"KOKO Party Joy";if(id===PACKAGE_IDS.fun)return"KOKO Party Fun";if(id===PACKAGE_IDS.max)return"KOKO Party Max";return"-"}
function cap(type){return type.charAt(0).toUpperCase()+type.slice(1)}
function pick(o){for(let i=1;i<arguments.length;i++){const v=o&&o[arguments[i]];if(v!==undefined&&v!==null&&String(v).trim()!=="")return v}return""}
function activePackageIds(){const ids=window.bookingState.available_package_ids||[];return ids.length?ids:(window.bookingState.location_slug==="KOKO_Cityheroes_Hornsby"?[PACKAGE_IDS.joy]:[PACKAGE_IDS.fun,PACKAGE_IDS.max])}
function packageButton(type){
const direct=$("selectPackage"+cap(type))||document.querySelector("[data-koko-package='"+type+"']");
if(direct)return direct;
const label="select "+type;
const nodes=document.querySelectorAll("button,a,.w-button,input[type='button'],input[type='submit']");
for(let i=0;i<nodes.length;i++){
const text=String(nodes[i].value||nodes[i].textContent||"").trim().toLowerCase();
if(text===label)return nodes[i];
}
return null;
}
function packageCard(type){
const card=$("packageCard"+cap(type));
if(card)return card;
const btn=packageButton(type);
if(!btn)return null;
let best=null,p=btn.parentElement;
const title=("koko party "+type).toLowerCase();
while(p&&p!==document.body){
const text=(p.textContent||"").toLowerCase();
const hasTitle=text.includes(title);
const hasOther=["joy","fun","max"].some(t=>t!==type&&text.includes("koko party "+t));
if(hasTitle&&!hasOther)best=p;
if(hasTitle&&hasOther)break;
p=p.parentElement;
}
return best||btn;
}
function ensurePackageButton(type,card){
let b=packageButton(type);
if(b||!card)return b;
b=document.createElement("button");
b.type="button";
b.id="selectPackage"+cap(type);
b.setAttribute("data-koko-package",type);
b.className="w-button koko-package-btn";
b.textContent="Select "+cap(type);
Object.assign(b.style,{width:"calc(100% - 32px)",minHeight:innerWidth<=767?"50px":"54px",margin:"24px 16px 16px",padding:"12px 20px",borderRadius:"999px",fontSize:innerWidth<=767?"15px":"16px",fontWeight:"800",lineHeight:"1",textAlign:"center",display:"block",boxSizing:"border-box"});
card.appendChild(b);
return b;
}
function availablePackageIds(data){
const rows=data&&(data.available_packages||data.available_package_ids||data.package_availability||data.package_location_rules||data.packages)||[];
if(!Array.isArray(rows))return[];
return rows.filter(row=>{
if(!row)return false;
if(typeof row!=="object")return true;
const v=("is_active" in row)?row.is_active:("active" in row)?row.active:("available" in row)?row.available:true;
return v===true||v===1||v==="1"||String(v).toLowerCase()==="true";
}).map(row=>{
const raw=row.package_id||row.package||row.id||row;
if(raw&&typeof raw==="object")return Number(raw.id||raw.package_id||0);
return Number(raw||0);
}).filter(Boolean);
}
function updatePackageVisibility(){
const ids=activePackageIds();
["joy","fun","max"].forEach(type=>{
const card=packageCard(type),btn=packageButton(type),ok=ids.includes(PACKAGE_IDS[type]);
if(card)card.style.display=ok?"":"none";
if(btn)btn.style.display=ok?"block":"none";
});
layoutPackageCards();
}
function layoutPackageCards(){
const cards=["joy","fun","max"].map(packageCard).filter(Boolean);
const parent=cards[0]&&cards[0].parentElement;
if(!parent||parent===document.body)return;
const visible=cards.filter(card=>card.style.display!=="none");
const count=visible.length;
parent.classList.add("koko-package-grid");
parent.style.display="grid";
parent.style.gap=innerWidth<=767?"16px":"28px";
parent.style.alignItems="stretch";
parent.style.justifyContent=count>=3?"stretch":"center";
parent.style.gridTemplateColumns=innerWidth<=767?"1fr":count>=3?"repeat(3,minmax(0,1fr))":"repeat(2,minmax(280px,520px))";
visible.forEach(card=>{
card.style.width="100%";
card.style.maxWidth=count>=3?"":"520px";
card.style.justifySelf="stretch";
});
}
function defaultPackageType(){
const ids=activePackageIds();
if(window.bookingState.location_slug==="KOKO_Cityheroes_Hornsby"&&ids.includes(PACKAGE_IDS.joy))return"joy";
if(ids.includes(PACKAGE_IDS.fun))return"fun";
if(ids.includes(PACKAGE_IDS.joy))return"joy";
if(ids.includes(PACKAGE_IDS.max))return"max";
return null;
}
function field(){
const ids=[].slice.call(arguments);
for(let i=0;i<ids.length;i++){
const id=ids[i];if(!id)continue;
const node=$(id)||document.querySelector(`[name="${id}"]`);
if(!node)continue;
if(node.matches&&node.matches("input,select,textarea"))return node;
const nested=node.querySelector("input,select,textarea");
if(nested)return nested;
}
return null;
}
function val(){const f=field.apply(null,arguments);return f?(f.value||""):""}
function setVal(ids,value){
const f=Array.isArray(ids)?field.apply(null,ids):field(ids);
if(!f)return false;
const v=value||"";
if(f.tagName==="SELECT"){
const n=String(v).trim().toLowerCase();
const opt=[].find.call(f.options||[],o=>String(o.value||"").trim().toLowerCase()===n||String(o.textContent||"").trim().toLowerCase()===n);
f.value=opt?opt.value:v;
}else f.value=v;
f.dispatchEvent(new Event("input",{bubbles:true}));
f.dispatchEvent(new Event("change",{bubbles:true}));
return true;
}
function errorId(input){return input?(input.id||input.name||"field")+"Error":""}
function clearFieldError(){
const input=field.apply(null,arguments);
if(!input)return;
const msgEl=document.getElementById(errorId(input));
input.style.borderColor="";
input.removeAttribute("aria-invalid");
if(msgEl&&msgEl.parentNode)msgEl.parentNode.removeChild(msgEl);
}
function setFieldError(ids,message){
const input=Array.isArray(ids)?field.apply(null,ids):field(ids);
if(!input)return;
clearFieldError.apply(null,Array.isArray(ids)?ids:[ids]);
const msgEl=document.createElement("div");
msgEl.id=errorId(input);
msgEl.textContent=message;
Object.assign(msgEl.style,{marginTop:"8px",color:"#C24B34",fontSize:"13px",lineHeight:"1.4",fontWeight:"600"});
input.style.borderColor="#C24B34";
input.setAttribute("aria-invalid","true");
(input.parentElement||input).appendChild(msgEl);
}
function validatePhone(phone){
if(!phone)return"Please enter your phone number.";
if(/\s/.test(phone))return"Phone number must not contain spaces. Use format 04XXXXXXXX.";
if(!/^04\d{8}$/.test(phone))return"Please enter a valid mobile number in the format 04XXXXXXXX.";
return"";
}
function dateNorm(v){
if(!v)return"";
if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;
if(/^\d{4}\/\d{2}\/\d{2}$/.test(v))return v.replace(/\//g,"-");
const m=v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
return m?`${m[3]}-${m[2]}-${m[1]}`:v;
}
function locationData(slug,o){
const x=o||{},base=LOCATION_PREVIEWS[slug]||{},tags=[pick(x,"tag_1","tag1","Tag1"),pick(x,"tag_2","tag2","Tag2"),pick(x,"tag_3","tag3","Tag3")].filter(Boolean);
return{
title:pick(x,"Name","name","venue_name","venueName")||base.title||locName(slug),
badge:pick(x,"location_badge","locationBadge","LocationBadge","badge")||base.badge||"",
tags:tags.length?tags:(base.tags||DEFAULT_TAGS),
desc:pick(x,"short_description","shortDescription","ShortDescription","LocationNote","location_note","Note","note")||base.desc||DEFAULT_DESC,
note:pick(x,"booking_note","bookingNote","BookingNote")||base.note||DEFAULT_NOTE,
image:cleanImageUrl(pick(x,"preview_image","previewImage","location_image","locationImage","location_image_url","locationImageUrl","preview_image_url","previewImageUrl","image_url","imageUrl","image","images","image_urls","photo","photos"))
}
}
function loadLocationNote(slug){
if(!slug||locationNoteCache[slug]||locationNotePending[slug])return;
locationNotePending[slug]=1;
fetch(`${BASE_URL}/LocationNote?location_slug=${encodeURIComponent(slug)}`).then(r=>r.ok?r.json():null).then(data=>{if(data){locationNoteCache[slug]=locationData(slug,Object.assign({},data.location||{},data));locationDescription()}}).catch(()=>{}).finally(()=>{delete locationNotePending[slug]});
}
function locationDescription(){
const f=field("locationSlug","location_slug","location","quickLocation");if(!f)return;
let d=$("locationDescription");if(!d){d=document.createElement("div");d.id="locationDescription"}const p=f.parentNode,df=field("bookingDate","date","quickDate");let host=p&&p.parentNode;while(host&&(!host.contains(f)||!host.contains(df)))host=host.parentNode;if(host)host.appendChild(d);else if(p&&p.parentNode)p.parentNode.insertBefore(d,p.nextSibling);
const slug=f.value;if(!slug){clear(d);d.style.display="none";return}
loadLocationNote(slug);
const opt=f.options&&f.options[f.selectedIndex],label=opt?opt.textContent.trim():"";
const v=locationNoteCache[slug]||locationData(slug,{Name:label});clear(d);d.className="koko-location-preview"+(v.image?"":" is-no-image");d.classList.remove("is-visible");
if(v.image){const pic=el("div","");pic.className="koko-location-image";const img=document.createElement("img");img.src=v.image;img.alt=v.title||"KOKO venue";img.addEventListener("error",()=>{pic.style.display="none";d.classList.add("is-no-image")});pic.appendChild(img);d.appendChild(pic)}
const body=el("div",""),head=el("div",""),title=el("h4",v.title||locName(slug));body.className="koko-location-content";head.className="koko-location-header";head.appendChild(title);
if(v.badge){const badge=el("div",v.badge);badge.className="koko-badge";head.appendChild(badge)}
body.appendChild(head);
if(v.tags&&v.tags.length){const tags=el("div","");tags.className="koko-tags";v.tags.forEach(t=>{const s=el("span",t);tags.appendChild(s)});body.appendChild(tags)}
const desc=el("div",v.desc||""),note=el("div",v.note||"");desc.className="koko-location-desc";note.className="koko-location-note";body.appendChild(desc);body.appendChild(note);d.appendChild(body);d.style.display="";requestAnimationFrame(()=>d.classList.add("is-visible"));
}
function addonRules(addon){
let r=addon&&(addon.rules_json||addon.rules||addon.rule_json);
if(!r)return null;
if(typeof r==="object"){
if(Array.isArray(r.options))return r;
if(typeof r.rules_json==="string"){
const inner=r.rules_json.trim();
if(inner){
try{
const parsed=JSON.parse(inner);
if(!parsed.Note&&r.Note)parsed.Note=r.Note;
return parsed;
}catch(e){return r}
}
}
return r;
}
if(typeof r==="string"){
const t=r.trim();
if(!t)return null;
try{return JSON.parse(t)}catch(e){return{Note:t}}
}
return null;
}
function addonNote(addon){
const r=addonRules(addon)||{};
return addon?(addon.note||addon.notes||addon.Note||addon.description||addon.Description||addon.addon_note||addon.addon_notes||r.Note||r.note||r.notes||r.description||r.Description||""):"";
}
function addonOptions(addon){
const r=addonRules(addon);
if(!r||!Array.isArray(r.options))return[];
return r.options.filter(option=>option&&option.is_active!==false);
}
function addonPrice(addon){
const c=Number(addon.default_price_cents||addon.price_cents||addon.unit_price_cents||0);
if(c>0)return c;
return Math.round(Number(addon.default_price||addon.price||0)*100);
}
function timeAmPm(t){
if(!t)return"";
const raw=String(t).trim();
if(/am|pm/i.test(raw))return raw.toLowerCase();
const p=raw.split(":");let h=parseInt(p[0],10),m=parseInt(p[1]||"0",10);
if(Number.isNaN(h))return raw;
const s=h>=12?"pm":"am";h=h%12;if(h===0)h=12;
return m===0?`${h}${s}`:`${h}:${String(m).padStart(2,"0")}${s}`;
}
function slotLabel(slot){
return `${timeAmPm(slot.start_label||slot.start_time_label||"")} - ${timeAmPm(slot.end_label||slot.end_time_label||"")}`;
}
function setupDate(){
const d=field("bookingDate"),wrap=$("bookingDateWrap")||$("bookingDate");
if(!d)return;
const min=new Date(Date.now()+MIN_ADVANCE_MS);
const s=`${min.getFullYear()}-${String(min.getMonth()+1).padStart(2,"0")}-${String(min.getDate()).padStart(2,"0")}`;
d.setAttribute("min",s);d.style.cursor="pointer";
function open(){try{d.focus();if(typeof d.showPicker==="function")d.showPicker()}catch(e){d.focus()}}
if(wrap){wrap.style.cursor="pointer";wrap.addEventListener("click",open)}
d.addEventListener("click",e=>{e.stopPropagation();open()});
d.addEventListener("focus",()=>d.setAttribute("min",s));
}
function setupGuestInput(){
const g=field("guestCount","guests","guest","party_size");
if(!g)return;
g.type="number";
g.min=String(MIN_PARTY_SIZE);
g.step="1";
if(!g.value)g.value=String(MIN_PARTY_SIZE);
g.addEventListener("blur",()=>{
const n=parseInt(g.value||String(MIN_PARTY_SIZE),10);
g.value=String(Number.isFinite(n)?Math.max(MIN_PARTY_SIZE,n):MIN_PARTY_SIZE);
});
}
function updateSummary(){
if($("summaryLocation"))$("summaryLocation").textContent=locName(window.bookingState.location_slug)||"-";
if($("summaryDate"))$("summaryDate").textContent=window.bookingState.date||"-";
if($("summaryGuests"))$("summaryGuests").textContent=window.bookingState.guests||"-";
if($("summaryPackage"))$("summaryPackage").textContent=packageName(window.bookingState.package_id);
}
function resetAfterAvailability(){
Object.assign(window.bookingState,{party_room_id:null,start_ts:null,end_ts:null,package_id:null,available_package_ids:[],addons:[],quote:null,booking:null,selected_room_name:"",selected_slot_label:""});
hide("packageSection");hide("addonsSection");hide("contactSection");hide("reviewSection");
updatePackageVisibility();
clear($("addonsList"));
["packageTotal","addonsTotal","grandTotal"].forEach(id=>{if($(id))$(id).textContent="-"});
if($("selectedSlotText"))$("selectedSlotText").textContent="Selected slot: -";
updateSummary();
}
function chip(text,accent){
return el("div",text,{display:"inline-flex",alignItems:"center",padding:"6px 9px",borderRadius:"999px",fontSize:innerWidth<=767?"9px":"10px",fontWeight:"800",letterSpacing:"0.08em",textTransform:"uppercase",lineHeight:"1",background:accent?"#FFF3DF":"#FAF6EE",color:accent?"#B86816":"#7B6A58"});
}
function slotCols(){
if(innerWidth<=479)return"repeat(1,minmax(0,1fr))";
if(innerWidth<=767)return"repeat(2,minmax(0,1fr))";
if(innerWidth<=991)return"repeat(3,minmax(0,1fr))";
return"repeat(4,minmax(0,1fr))";
}
function slotDefault(btn){
Object.assign(btn.style,{padding:innerWidth<=767?"11px 12px":"12px 16px",borderRadius:"12px",background:"#FFF7EB",border:"1px solid rgba(242,140,40,0.22)",color:"#B86816",fontSize:innerWidth<=767?"12px":"13px",fontWeight:"700",lineHeight:"1.3",cursor:"pointer",width:"100%",minHeight:innerWidth<=767?"48px":"52px"});
}
function slotSelected(btn){
btn.style.background="#F28C28";
btn.style.border="1px solid #F28C28";
btn.style.color="#fff";
}
function selectedSlot(room,slot){
window.bookingState.selected_room_name=room||"";
window.bookingState.selected_slot_label=slot?slotLabel(slot):"";
const x=$("selectedSlotText");if(!x)return;
x.textContent=room&&slot?`Selected slot: ${room} • ${slotLabel(slot)}`:"Selected slot: -";
}
function cleanImageUrl(value){
if(!value)return"";
if(Array.isArray(value)){
for(let i=0;i<value.length;i++){
const url=cleanImageUrl(value[i]);
if(url)return url;
}
return"";
}
if(typeof value==="object")return cleanImageUrl(value.url||value.src||value.path||value.file_url||value.image_url||"");
const text=String(value).trim().replace(/[“”]/g,"");
if(!text||text==="null"||text==="undefined"||text==='""')return"";
if((text[0]==="["&&text[text.length-1]==="]")||(text[0]==="{"&&text[text.length-1]==="}")){
try{return cleanImageUrl(JSON.parse(text))}catch(e){}
}
return text;
}
function roomImageUrl(room){
return cleanImageUrl(room&& (room.image_url||room.room_image_url||room.image||room.image_urls||room.room_image_urls));
}
function addonImageUrl(addon){
const rules=addonRules(addon)||{};
return cleanImageUrl(addon&&(addon.image_url||addon.image_urls||addon.addon_image_url||addon.photo_url||addon.photo||addon.thumbnail_url||addon.image||addon.images||rules.image_url||rules.image||rules.images));
}
function makeAddonImage(addon){
const url=addonImageUrl(addon);
if(!url)return null;
const wrap=document.createElement("div");
wrap.className="koko-addon-image-wrap";
const img=document.createElement("img");
img.className="koko-addon-image";
img.src=url;
img.alt=addon.name||addon.addon_name||"Add-on";
img.addEventListener("error",()=>{wrap.style.display="none"});
wrap.appendChild(img);
return wrap;
}
function makeRoomImage(room,index){
const url=roomImageUrl(room);
if(!url)return null;
const wrap=document.createElement("div");
wrap.className="koko-room-carousel";
const img=document.createElement("img");
img.className="koko-room-carousel-img";
img.src=url;
img.alt=room.name||"Party Room";
img.addEventListener("error",()=>{wrap.style.display="none"});
wrap.appendChild(img);
return wrap;
}
function renderAvailability(data){
const c=$("availabilityResults");if(!c)return;
clear(c);Object.assign(c.style,{display:"flex",flexDirection:"column",gap:innerWidth<=767?"12px":"14px",width:"100%"});
if(!data||!Array.isArray(data.room_slots)||!data.room_slots.length){
c.appendChild(el("p","No available rooms found.",{color:"#7B6A58",margin:"0",fontSize:innerWidth<=767?"14px":"16px",lineHeight:"1.45",fontWeight:"500",width:"100%"}));return;
}
const map={};
data.room_slots.forEach(r=>{
const key=r.party_room_id||r.room_id||r.id||r.name||"room";
if(!map[key])map[key]={party_room_id:r.party_room_id||r.room_id||r.id,name:r.name||r.room_name||"Party Room",image_url:r.image_url||r.room_image_url||r.image||r.image_urls||"",capacity_min:r.capacity_min||r.min_guests||"",capacity_max:r.capacity_max||r.max_guests||"",slots:[]};
if(Array.isArray(r.slots))r.slots.forEach(s=>map[key].slots.push(s));
});
const rooms=Object.values(map).filter(r=>!Number(r.capacity_max||0)||Number(window.bookingState.guests||0)<=Number(r.capacity_max||0));
if(!rooms.length){
const roomCaps=Object.values(map).map(r=>Number(r.capacity_max||0)).filter(Boolean);
const maxAllowed=Math.min(locLimit(window.bookingState.location_slug),roomCaps.length?Math.max.apply(null,roomCaps):locLimit(window.bookingState.location_slug));
c.appendChild(el("p",maxGuestsMessage(window.bookingState.location_slug,maxAllowed),{color:"#7B6A58",margin:"0",fontSize:innerWidth<=767?"14px":"16px",lineHeight:"1.45",fontWeight:"500",width:"100%"}));return;
}
rooms.forEach((room,index)=>{
if(Array.isArray(room.slots))room.slots.sort((a,b)=>Number(a.start_ts||0)-Number(b.start_ts||0));
const card=el("div","",{width:"100%",background:"#FFFDF9",border:"1px solid #E8DDCC",borderRadius:innerWidth<=767?"18px":"22px",padding:innerWidth<=767?"16px":"20px",display:"grid",gap:innerWidth<=767?"12px":"14px",boxShadow:"0 6px 20px rgba(0,0,0,.04)",boxSizing:"border-box"});
card.appendChild(el("div",room.name||"Party Room",{fontSize:innerWidth<=767?"16px":"18px",fontWeight:"800",lineHeight:"1.2",color:"#2F241C"}));
const image=makeRoomImage(room,index);
if(image)card.appendChild(image);
const meta=el("div","",{display:"flex",flexWrap:"wrap",gap:"7px"});
meta.appendChild(chip(room.capacity_min&&room.capacity_max?`${room.capacity_min}-${room.capacity_max} guests`:"Party Room",false));
meta.appendChild(chip("Party Room",true));
const list=el("div","",{display:"grid",gridTemplateColumns:slotCols(),gap:innerWidth<=767?"10px":"12px",width:"100%"});
if(room.slots&&room.slots.length){
room.slots.forEach(slot=>{
const b=document.createElement("button");
b.type="button";
b.className="wf-slot-btn koko-slot-btn";
b.textContent=slotLabel(slot);
slotDefault(b);
b.addEventListener("click",async()=>{
Object.assign(window.bookingState,{party_room_id:room.party_room_id,start_ts:slot.start_ts,end_ts:slot.end_ts,booking:null});
hide("reviewSection");
document.querySelectorAll(".wf-slot-btn").forEach(slotDefault);
slotSelected(b);
selectedSlot(room.name,slot);
updateSummary();
show("packageSection",true);
show("contactSection",false);
msg(`Selected ${room.name} · ${slotLabel(slot)}`);
const type=defaultPackageType();
if(type)await getQuote(type,true);
else msg("No active package is available for this location and party size.",true);
});
list.appendChild(b);
});
}else{
list.appendChild(chip("No slots available",false));
}
card.appendChild(meta);
card.appendChild(list);
c.appendChild(card);
});
}
async function checkAvailability(){
const rawLoc=val("locationSlug").trim(),rawDate=val("bookingDate").trim(),d=dateNorm(rawDate),g=parseInt(val("guestCount")||"0",10);
Object.assign(window.bookingState,{location_slug:rawLoc,date:d,guests:g});
resetAfterAvailability();
if(!rawLoc)return msg("Please select a location.",true);
if(!d)return msg("Please enter a booking date.",true);
if(!g||g<1)return msg("Please enter a valid guest count.",true);
if(g<MIN_PARTY_SIZE)return msg(`Party bookings require a minimum of ${MIN_PARTY_SIZE} guests.`,true);
if(new Date(d+"T00:00:00+11:00").getTime()<Date.now()+MIN_ADVANCE_MS)return msg("Bookings must be made at least 72 hours in advance.",true);
const max=locLimit(rawLoc);
if(g>max){
show("availabilitySection",true);
const c=$("availabilityResults");
if(c){
clear(c);
c.appendChild(el("p",maxGuestsMessage(rawLoc,max),{color:"#7B6A58",margin:"0",fontSize:innerWidth<=767?"14px":"16px",lineHeight:"1.45",fontWeight:"500",width:"100%"}));
}
return msg(maxGuestsMessage(rawLoc,max),true);
}
msg("Checking availability...");
try{
const r=await fetch(`${BASE_URL}/Availability`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({payload:{location_slug:rawLoc,date:d,guests:g}})});
const text=await r.text();
if(!text.trim())return msg("Availability API returned an empty response.",true);
const data=JSON.parse(text);
if(!r.ok)return msg(data.message||data.error_message||`Availability request failed (${r.status}).`,true);
if(data.error_message)return msg(data.error_message,true);
if(data.location){
locationNoteCache[rawLoc]=locationData(rawLoc,data.location);
locationDescription();
}
window.bookingState.available_package_ids=availablePackageIds(data);
updatePackageVisibility();
show("availabilitySection",true);
window._kokoAvailData=data;
renderAvailability(data);
msg("Availability loaded. Please choose a room and slot.");
}catch(e){
msg(e.message||"Failed to load availability.",true);
}
}
function packageUI(type){
const jc=packageCard("joy"),fc=packageCard("fun"),mc=packageCard("max"),jb=ensurePackageButton("joy",jc),fb=ensurePackageButton("fun",fc),mb=ensurePackageButton("max",mc);
function setBtn(b,t,selected){if(!b)return;b.style.display="block";if(b.tagName==="INPUT")b.value=t;else b.textContent=t;b.style.background=selected?"#E9923C":"#ED963D";b.style.color="#fff";b.style.border="1px solid "+(selected?"#E9923C":"#ED963D");b.style.boxShadow="none";b.style.cursor=selected?"default":"pointer";b.style.opacity="1"}
function sel(c,b){if(c){c.style.background="#F7F0DB";c.style.border="1px solid #F2B300"}setBtn(b,"Selected",true)}
function def(c,b,t){if(c){c.style.background="#FBF8F2";c.style.border="1px solid #E8DDCC"}setBtn(b,t,false)}
if(type==="joy"){sel(jc,jb);def(fc,fb,"Select Fun");def(mc,mb,"Select Max")}
if(type==="fun"){sel(fc,fb);def(jc,jb,"Select Joy");def(mc,mb,"Select Max")}
if(type==="max"){sel(mc,mb);def(jc,jb,"Select Joy");def(fc,fb,"Select Fun")}
if(!type){def(jc,jb,"Select Joy");def(fc,fb,"Select Fun");def(mc,mb,"Select Max")}
updatePackageVisibility();
}
function currentPackage(){
return window.bookingState.package_id===PACKAGE_IDS.joy?"joy":window.bookingState.package_id===PACKAGE_IDS.fun?"fun":window.bookingState.package_id===PACKAGE_IDS.max?"max":null;
}
function quoteAddons(){
return window.bookingState.addons.map(function(i){
const out={addon_id:i.addon_id,qty:i.qty};
if(i.option)out.option=i.option;
if(i.option_label)out.option_label=i.option_label;
if(i.allergy_note)out.allergy_note=i.allergy_note;
return out;
});
}
async function loadAddons(){
const section=$("addonsSection"),list=$("addonsList");
if(!list)return;
clear(list);
if(!window.bookingState.location_slug)return msg("Please select a location first.",true);
try{
const r=await fetch(`${BASE_URL}/addons?location_slug=${encodeURIComponent(window.bookingState.location_slug)}`,{method:"GET",headers:{"Content-Type":"application/json"}});
const text=await r.text();
if(!text.trim()){
list.appendChild(el("p","No add-ons available.",{color:"#7B6A58",margin:"0"}));
if(section)section.style.display="block";
return;
}
const data=JSON.parse(text);
if(!r.ok)return msg(data&&(data.message||data.error_message)||"Failed to load add-ons.",true);
let addons=Array.isArray(data)?data:(data.addons||data.items||data.data||data.records||[]);
const seen={};
addons=addons.filter(a=>{const id=a&&(a.addon_id||a.id);if(!id||seen[id])return false;seen[id]=true;return true});
if(section)section.style.display="block";
if(!addons.length){
list.appendChild(el("p","No add-ons available for this location.",{color:"#7B6A58",margin:"0"}));
return;
}
Object.assign(list.style,{display:"grid",gridTemplateColumns:innerWidth<=767?"1fr":"1fr 1fr",gap:"16px"});
addons.forEach(addon=>{
const addonId=addon.addon_id||addon.id;
if(!addonId)return;
console.log("[KOKO addon]",addonId,addon.name||addon.addon_name);
const isGiftBag=Number(addonId)===8;
const isBirthdayBox=Number(addonId)===12;
const isPartyRoomAddon=Number(addonId)===7;
const name=addon.name||addon.addon_name||"Addon";
const price=addonPrice(addon);
const unit=addon.unit_type||"flat";
const note=addonNote(addon);
const opts=addonOptions(addon);
const existing=window.bookingState.addons.find(i=>i.addon_id===addonId);
let qty=existing?Number(existing.qty||0):0;
let selected=existing?(existing.option||""):"";
let giftBagOptionQty={};
let allergyInput=null;
let themeInput=null;
let roomExtAvailEl=null;
const card=el("div","");
card.className="koko-addon-card";
const row=el("div","");
row.className="koko-addon-title-row";
const title=el("div",name);
title.className="koko-addon-title";
row.appendChild(title);
const meta=el("div",`${money(price)} · ${unitName(unit)}`);
meta.className="koko-addon-meta";
const noteEl=note?el("div",note):null;
if(noteEl)noteEl.className="koko-addon-note";
const addonImg=makeAddonImage(addon);
let wrap=null,select=null;
const qtyRow=el("div","");
qtyRow.className="koko-addon-qty-row";
const minus=document.createElement("button");
minus.type="button";
minus.textContent="−";
minus.className="koko-addon-qty-btn koko-addon-minus";
const qtyText=el("div",String(qty));
qtyText.className="koko-addon-qty-text";
const plus=document.createElement("button");
plus.type="button";
plus.textContent="+";
plus.className="koko-addon-qty-btn koko-addon-plus";
function buildGiftBagExistingQty(optionLabel){
if(!existing||!existing.option_label)return 0;
const escaped=String(optionLabel).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const re=new RegExp(escaped+"\\s*x\\s*(\\d+)","i");
const m=String(existing.option_label).match(re);
return m?Number(m[1]||0):0;
}
function totalGiftBagQty(){return Object.keys(giftBagOptionQty).reduce((sum,key)=>sum+Number(giftBagOptionQty[key]||0),0)}
function sync(){
qtyText.textContent=String(qty);
const idx=window.bookingState.addons.findIndex(i=>i.addon_id===addonId);
if(qty<=0){
if(idx>-1)window.bookingState.addons.splice(idx,1);
return;
}
const payload={addon_id:addonId,qty:qty};
if(isGiftBag&&opts.length){
const parts=[];
opts.forEach(o=>{
const v=o.value||o.label;
const label=o.label||o.value;
const n=Number(giftBagOptionQty[v]||0);
if(n>0)parts.push(label+" x "+n);
});
payload.option="mixed";
payload.option_label=parts.join(", ");
payload.allergy_note=allergyInput?allergyInput.value.trim():"";
}else if(isBirthdayBox){
payload.allergy_note=themeInput?themeInput.value.trim():"";
}else if(opts.length&&selected){
const found=opts.find(o=>String(o.value||o.label)===String(selected));
payload.option=selected;
payload.option_label=found?(found.label||selected):selected;
}
if(idx>-1)window.bookingState.addons[idx]=payload;
else window.bookingState.addons.push(payload);
}
async function refresh(){const type=currentPackage();if(type)await getQuote(type,false)}
function checkRoomExtension(){
if(!roomExtAvailEl)return;
const{party_room_id,end_ts}=window.bookingState;
if(!party_room_id||!end_ts){roomExtAvailEl.textContent="⚠️ Please select a room and slot first.";roomExtAvailEl.style.color="#B86816";return;}
const data=window._kokoAvailData;
if(!data){roomExtAvailEl.textContent="⚠️ Please check availability first.";roomExtAvailEl.style.color="#B86816";return;}
const rooms=data.rooms||data.available_rooms||(Array.isArray(data)?data:[]);
const room=rooms.find(rm=>(rm.party_room_id||rm.room_id||rm.id)===party_room_id);
if(!room){roomExtAvailEl.textContent="⚠️ Room not found in availability.";roomExtAvailEl.style.color="#B86816";return;}
const extEnd=Number(end_ts)+3600000;
const hasSlot=(room.slots||[]).some(s=>Number(s.start_ts)<=Number(end_ts)&&Number(s.end_ts)>=extEnd);
if(hasSlot){roomExtAvailEl.textContent="✅ The extra hour is available!";roomExtAvailEl.style.color="#2E7D32";}
else{roomExtAvailEl.textContent="❌ The extra hour is not available for this slot.";roomExtAvailEl.style.color="#C62828";}
}
if(isGiftBag&&opts.length){
wrap=el("div","",{display:"grid",gap:"10px",width:"100%"});
opts.forEach(o=>{
const optionValue=o.value||o.label;
const optionLabel=o.label||o.value;
giftBagOptionQty[optionValue]=buildGiftBagExistingQty(optionLabel);
const optionRow=el("div","",{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",padding:"10px 12px",border:"1px solid #E8DDCC",borderRadius:"12px",background:"#faf6ee"});
const optionName=el("div",optionLabel,{color:"#2F241C",fontSize:"14px",fontWeight:"700"});
const controls=el("div","",{display:"flex",alignItems:"center",gap:"8px"});
const optMinus=document.createElement("button");
optMinus.type="button";
optMinus.textContent="−";
optMinus.className="koko-addon-qty-btn koko-addon-minus";
const optQty=el("div",String(giftBagOptionQty[optionValue]),{minWidth:"24px",textAlign:"center",fontWeight:"800",color:"#2F241C"});
const optPlus=document.createElement("button");
optPlus.type="button";
optPlus.textContent="+";
optPlus.className="koko-addon-qty-btn koko-addon-plus";
async function syncGiftBag(){
optQty.textContent=String(giftBagOptionQty[optionValue]);
qty=totalGiftBagQty();
qtyText.textContent=String(qty);
sync();
await refresh();
}
optMinus.addEventListener("click",async()=>{if(giftBagOptionQty[optionValue]>0){giftBagOptionQty[optionValue]-=1;await syncGiftBag()}});
optPlus.addEventListener("click",async()=>{giftBagOptionQty[optionValue]+=1;await syncGiftBag()});
controls.appendChild(optMinus);
controls.appendChild(optQty);
controls.appendChild(optPlus);
optionRow.appendChild(optionName);
optionRow.appendChild(controls);
wrap.appendChild(optionRow);
});
allergyInput=document.createElement("input");
allergyInput.type="text";
allergyInput.placeholder="Any allergies or dietary notes? e.g. no nuts";
allergyInput.value=existing&&existing.allergy_note?existing.allergy_note:"";
Object.assign(allergyInput.style,{width:"100%",minHeight:"46px",padding:"0 14px",border:"1px solid #E8DDCC",borderRadius:"12px",background:"#faf6ee",color:"#7b6a58",fontSize:"14px",outline:"none",boxSizing:"border-box"});
allergyInput.addEventListener("input",()=>{if(qty>0)sync()});
wrap.appendChild(allergyInput);
qty=totalGiftBagQty();
qtyText.textContent=String(qty);
}else if(opts.length){
wrap=el("div","");
wrap.className="koko-addon-select-wrap";
select=document.createElement("select");
select.className="koko-addon-select";
const ph=document.createElement("option");
ph.value="";
ph.textContent="Select option";
select.appendChild(ph);
opts.forEach(o=>{
const opt=document.createElement("option");
opt.value=o.value||o.label;
opt.textContent=o.label||o.value;
select.appendChild(opt);
});
select.value=selected;
const arrow=el("div","▾");
arrow.className="koko-addon-arrow";
wrap.appendChild(select);
wrap.appendChild(arrow);
}
if(select){
select.addEventListener("change",async()=>{
selected=select.value;
if(qty>0){sync();await refresh()}
});
}
minus.addEventListener("click",async()=>{if(qty>0)qty--;sync();await refresh();if(isPartyRoomAddon&&roomExtAvailEl){if(qty<=0)roomExtAvailEl.textContent="";else checkRoomExtension();}});
plus.addEventListener("click",async()=>{if(opts.length&&!isGiftBag&&!selected)return msg(`Please select an option for ${name}.`,true);qty++;sync();await refresh();if(isPartyRoomAddon&&roomExtAvailEl)checkRoomExtension();});
if(isPartyRoomAddon){
const guests=Number(window.bookingState.guests||0);
const toggleBtn=document.createElement("button");
toggleBtn.type="button";
toggleBtn.className="koko-addon-qty-btn koko-addon-plus";
Object.assign(toggleBtn.style,{width:"auto",padding:"0 18px",fontSize:"14px",fontWeight:"800"});
const setActive=(on)=>{
qty=on?guests:0;
sync();
if(on){toggleBtn.textContent=`✓ Added (${guests} guests)`;toggleBtn.style.background="#E8F5E9";toggleBtn.style.borderColor="#2E7D32";toggleBtn.style.color="#2E7D32";checkRoomExtension();}
else{toggleBtn.textContent="Add";toggleBtn.style.background="#FFF7EB";toggleBtn.style.borderColor="#F28C28";toggleBtn.style.color="#B86816";if(roomExtAvailEl)roomExtAvailEl.textContent="";}
refresh();
};
setActive(qty>0);
toggleBtn.addEventListener("click",()=>setActive(qty===0));
qtyRow.appendChild(toggleBtn);
}else{
qtyRow.appendChild(minus);
qtyRow.appendChild(qtyText);
qtyRow.appendChild(plus);
}
card.appendChild(row);
card.appendChild(meta);
if(noteEl)card.appendChild(noteEl);
if(addonImg)card.appendChild(addonImg);
if(wrap)card.appendChild(wrap);
if(!isGiftBag)card.appendChild(qtyRow);
if(isBirthdayBox){
themeInput=document.createElement("input");
themeInput.type="text";
themeInput.placeholder="Any theme preferences? e.g. favourite colours, characters or series";
themeInput.value=existing&&existing.allergy_note?existing.allergy_note:"";
Object.assign(themeInput.style,{width:"100%",minHeight:"46px",padding:"0 14px",border:"1px solid #E8DDCC",borderRadius:"12px",background:"#faf6ee",color:"#7b6a58",fontSize:"14px",outline:"none",boxSizing:"border-box"});
themeInput.addEventListener("input",()=>{if(qty>0)sync()});
card.appendChild(themeInput);
}
if(isPartyRoomAddon){
roomExtAvailEl=el("div","");
Object.assign(roomExtAvailEl.style,{fontSize:"13px",fontWeight:"700",lineHeight:"1.5",marginTop:"4px"});
if(qty>0)checkRoomExtension();
card.appendChild(roomExtAvailEl);
}
list.appendChild(card);
});
show("addonsSection",false);
}catch(e){
msg("Failed to load add-ons.",true);
}
}
async function getQuote(type,load){
if(!window.bookingState.location_slug||!window.bookingState.guests)return msg("Please select location and guests first.",true);
if(!window.bookingState.party_room_id||!window.bookingState.start_ts||!window.bookingState.end_ts)return msg("Please select a room and slot first.",true);
if(type==="joy")window.bookingState.package_id=PACKAGE_IDS.joy;
if(type==="fun")window.bookingState.package_id=PACKAGE_IDS.fun;
if(type==="max")window.bookingState.package_id=PACKAGE_IDS.max;
if(!window.bookingState.package_id)return msg("Package id is missing.",true);
if(!activePackageIds().includes(window.bookingState.package_id)){
updatePackageVisibility();
return msg(`${packageName(window.bookingState.package_id)} is not available for this location and party size.`,true);
}
try{
msg("Loading quote...");
const r=await fetch(`${BASE_URL}/Quote`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({payload:{location_slug:window.bookingState.location_slug,package_id:window.bookingState.package_id,guests:window.bookingState.guests,addons:quoteAddons()}})});
const text=await r.text();
if(!text.trim())return msg("Quote API returned an empty response.",true);
const data=JSON.parse(text);
if(!r.ok)return msg(data&&(data.message||data.error_message)||"Failed to load quote.",true);
if(data.error_message)return msg(data.error_message,true);
window.bookingState.quote=data;
window.bookingState.booking=null;
hide("reviewSection");
packageUI(type);
updateSummary();
if($("packageTotal"))$("packageTotal").textContent=money(data.package_total_cents);
if($("addonsTotal"))$("addonsTotal").textContent=money(data.addons_total_cents);
if($("grandTotal"))$("grandTotal").textContent=money(data.grand_total_cents);
if(load)await loadAddons();
show("contactSection",false);
msg(`Package selected: ${packageName(window.bookingState.package_id)}`);
}catch(e){
msg("Failed to load quote.",true);
}
}
function validateContact(){
const name=val("customerName").trim(),phone=val("customerPhone").trim(),email=val("customerEmail").trim();
const childName=val("birthdayChildName").trim();
const gender=val("birthdayChildGender").trim(),age=val("averageAge").trim(),notes=val("bookingNotes").trim();
clearFieldError("customerPhone");
if(!name)return msg("Please enter your name.",true),false;
const phoneError=validatePhone(phone);
if(phoneError){
setFieldError("customerPhone",phoneError);
msg(phoneError,true);
return false;
}
if(!email)return msg("Please enter your email address.",true),false;
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return msg("Please enter a valid email address.",true),false;
Object.assign(window.bookingState,{customer_name:name,customer_phone:phone,customer_email:email,birthday_child_name:childName,birthday_child_gender:gender,average_age:age,booking_notes:notes});
return true;
}
function compactPayload(obj){
const out={};
Object.keys(obj||{}).forEach(key=>{
const value=obj[key];
if(value===undefined||value===null)return;
if(typeof value==="string"&&!value.trim())return;
if(Array.isArray(value)&&!value.length)return;
out[key]=value;
});
return out;
}
function bookingId(b){return b&&(b.booking_id||b.id||b.record_id||(b.booking&&(b.booking.id||b.booking.booking_id))||(b.data&&(b.data.id||b.data.booking_id))||null)}
function payUrl(data){
const seen=[];
function walk(v){
if(!v||seen.indexOf(v)>-1)return"";
if(typeof v==="string")return/^https?:\/\/.+(stripe|checkout|payment)/i.test(v)?v:"";
if(typeof v!=="object")return"";
seen.push(v);
const keys=["payment_url","checkout_url","payment_link","stripe_checkout_url","url"].concat(Object.keys(v));
for(let i=0;i<keys.length;i++){
const f=walk(v[keys[i]]);
if(f)return f;
}
return"";
}
return walk(data);
}
function renderReview(){
if(!$("reviewSection"))return msg("reviewSection not found. Please add id='reviewSection' to Step 6.",true);
const q=window.bookingState.quote||{},b=window.bookingState.booking||{},id=bookingId(b);
const grand=Number(q.grand_total_cents||0),remain=Math.max(grand-DEPOSIT_CENTS,0);
reviewText("reviewStatus","Deposit required");
reviewText("reviewLocation",locName(window.bookingState.location_slug));
reviewText("reviewDate",window.bookingState.date);
reviewText("reviewGuests",String(window.bookingState.guests||"-"));
reviewText("reviewPackage",packageName(window.bookingState.package_id));
reviewText("reviewRoom",window.bookingState.selected_room_name);
reviewText("reviewTime",window.bookingState.selected_slot_label);
reviewText("reviewCustomerName",window.bookingState.customer_name);
reviewText("reviewCustomerPhone",window.bookingState.customer_phone);
reviewText("reviewCustomerEmail",window.bookingState.customer_email);
reviewText("reviewBirthdayChildName",window.bookingState.birthday_child_name);
reviewText("reviewBirthdayChildGender",window.bookingState.birthday_child_gender);
reviewText("reviewAverageAge",window.bookingState.average_age);
reviewText("reviewBookingNotes",window.bookingState.booking_notes||"-");
reviewText("reviewPackageTotal",money(q.package_total_cents));
reviewText("reviewAddonsTotal",money(q.addons_total_cents));
reviewText("reviewGrandTotal",money(q.grand_total_cents));
reviewText("reviewDepositDue",money(DEPOSIT_CENTS));
reviewText("reviewRemainingBalance",money(remain));
reviewText("reviewBookingId",id||"-");
const btn=$("confirmBookingBtn")||$("confitmBookingBtn")||document.querySelector("[data-koko-action='confirm-booking']");
if(btn)btn.textContent="Pay $50 deposit";
show("reviewSection",true);
}
async function createBooking(clickedBtn){
if(!window.bookingState.location_slug)return msg("Please select a location first.",true);
if(!window.bookingState.date)return msg("Please select a date first.",true);
if(!window.bookingState.guests)return msg("Please enter guest count first.",true);
if(!window.bookingState.party_room_id||!window.bookingState.start_ts||!window.bookingState.end_ts)return msg("Please select a room and slot first.",true);
if(!window.bookingState.package_id)return msg("Please select a package first.",true);
if(!window.bookingState.quote)return msg("Please wait for the quote to load first.",true);
if(!validateContact())return;
const btn=clickedBtn||$("createBookingBtn")||findActionButton(document,["review","create booking","review booking"],"#createBookingBtn,[data-koko-action='create-booking'],[data-koko-action='review-booking']");
if(btn){btn.style.pointerEvents="none";btn.style.opacity=".75";btn.textContent="Creating booking..."}
msg("Creating booking...");
try{
const hasPartyRoomAddon=window.bookingState.addons.some(a=>Number(a.addon_id)===7&&Number(a.qty||0)>0);
const effectiveEndTs=hasPartyRoomAddon?Number(window.bookingState.end_ts)+3600000:window.bookingState.end_ts;
const payload=compactPayload({location_slug:window.bookingState.location_slug,date:window.bookingState.date,guests:Number(window.bookingState.guests||0),party_room_id:window.bookingState.party_room_id,start_ts:window.bookingState.start_ts,end_ts:effectiveEndTs,package_id:window.bookingState.package_id,addons:quoteAddons(),customer_name:window.bookingState.customer_name,customer_phone:window.bookingState.customer_phone,customer_email:window.bookingState.customer_email,birthday_child_name:window.bookingState.birthday_child_name,birthday_child_gender:window.bookingState.birthday_child_gender,average_age:window.bookingState.average_age?Number(window.bookingState.average_age):undefined,booking_notes:window.bookingState.booking_notes});
const r=await fetch(`${BASE_URL}/CreateBooking`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({payload})});
const text=await r.text();
if(!text.trim())return msg("CreateBooking API returned an empty response.",true);
let data=null;
try{data=JSON.parse(text)}catch(_){data={raw:text}}
if(!r.ok){
console.error("CreateBooking failed",{status:r.status,payload:payload,response:data});
return msg((data&&(
data.message||
data.error_message||
data.error||
data.raw
))||`CreateBooking failed (${r.status}).`,true);
}
if(data.error_message)return msg(data.error_message,true);
window.bookingState.booking=data.booking||data;
renderReview();
msg("Booking created. Please review and pay your $50 deposit.");
}catch(e){
msg(e.message||"Failed to create booking.",true);
}finally{
if(btn){btn.style.pointerEvents="auto";btn.style.opacity="1";btn.textContent="Review"}
}
}
async function confirmBooking(){
if(!window.bookingState.booking)return msg("Please create a booking first.",true);
const id=bookingId(window.bookingState.booking);
if(!id)return msg("Booking ID not found in CreateBooking response.",true);
const btn=$("confirmBookingBtn")||$("confitmBookingBtn")||document.querySelector("[data-koko-action='confirm-booking']");
if(btn){btn.style.pointerEvents="none";btn.style.opacity=".75";btn.textContent="Redirecting to deposit payment..."}
msg("Preparing your $50 deposit payment...");
try{
const r=await fetch(`${BASE_URL}/ConfirmBooking`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({payload:{booking_id:id}})});
const text=await r.text();
if(!text.trim())throw new Error("ConfirmBooking API returned an empty response.");
const data=JSON.parse(text);
if(!r.ok||data.error_message){
msg(data.message||data.error_message||"Failed to confirm booking.",true);
if(btn){btn.style.pointerEvents="auto";btn.style.opacity="1";btn.textContent="Pay $50 deposit"}
return;
}
window.bookingState.booking=data.booking||data;
renderReview();
const url=payUrl(data);
if(url){msg("Redirecting to deposit payment...");location.assign(url);return}
msg("Booking was created, but no payment URL was returned. Please check Xano ConfirmBooking response.",true);
if(btn){btn.style.pointerEvents="auto";btn.style.opacity="1";btn.textContent="Pay $50 deposit"}
}catch(e){
msg("Failed to prepare deposit payment.",true);
if(btn){btn.style.pointerEvents="auto";btn.style.opacity="1";btn.textContent="Pay $50 deposit"}
}
}
function confirmBtn(target){
const direct=target.closest("#confirmBookingBtn,#confitmBookingBtn,[data-koko-action='confirm-booking']");
if(direct)return direct;
const b=target.closest("button,a,.w-button,input[type='submit'],input[type='button']");
if(!b)return null;
const label=(b.value||b.textContent||"").trim().toLowerCase();
return["confirm booking","pay $50 deposit","pay deposit","confirm booking with $50 deposit"].includes(label)?b:null;
}
function createBtn(target){
const direct=target.closest("#createBookingBtn,[data-koko-action='create-booking'],[data-koko-action='review-booking']");
if(direct)return direct;
const b=target.closest("button,a,.w-button,input[type='submit'],input[type='button']");
if(!b)return null;
const label=(b.value||b.textContent||"").trim().toLowerCase();
return["review","create booking","review booking"].includes(label)?b:null;
}
function findActionButton(root,labels,selector){
const scope=root&&root.querySelectorAll?root:document;
const direct=selector?scope.querySelector(selector):null;
if(direct)return direct;
const nodes=scope.querySelectorAll("button,a,.w-button,input[type='submit'],input[type='button']");
for(let i=0;i<nodes.length;i++){
const label=(nodes[i].value||nodes[i].textContent||"").trim().toLowerCase();
if(labels.includes(label))return nodes[i];
}
return null;
}
function normalizeActionButtons(){
[findActionButton(document,["review","create booking","review booking"],"#createBookingBtn,[data-koko-action='create-booking'],[data-koko-action='review-booking']"),$("confirmBookingBtn"),$("confitmBookingBtn")].forEach(btn=>{
if(btn&&btn.tagName==="BUTTON")btn.type="button";
if(btn&&btn.matches&&btn.matches("input[type='submit']"))btn.type="button";
});
}
function bindActionButtons(){
const create=findActionButton(document,["review","create booking","review booking"],"#createBookingBtn,[data-koko-action='create-booking'],[data-koko-action='review-booking']");
if(create&&!create.dataset.kokoCreateBound){
create.dataset.kokoCreateBound="1";
create.addEventListener("click",e=>{
e.preventDefault();
e.stopPropagation();
createBooking(create);
},true);
}
const confirm=$("confirmBookingBtn")||$("confitmBookingBtn")||document.querySelector("[data-koko-action='confirm-booking']");
if(confirm&&!confirm.dataset.kokoConfirmBound){
confirm.dataset.kokoConfirmBound="1";
confirm.addEventListener("click",e=>{
e.preventDefault();
e.stopPropagation();
confirmBooking();
},true);
}
}
function applyParams(){
const p=new URLSearchParams(location.search);
const loc=p.get("location")||p.get("location_slug")||p.get("locationSlug")||p.get("quickLocation")||"";
const d=dateNorm(p.get("date")||p.get("bookingDate")||p.get("quickDate")||"");
const g=p.get("guests")||p.get("guest")||p.get("party_size")||p.get("guestCount")||p.get("quickGuests")||"";
const auto=p.get("auto_check");
let checked=false;
function once(){
let a=!loc,b=!d,c=!g;
if(loc){
a=setVal(["locationSlug","location_slug","location","quickLocation"],loc);
if(a){
window.bookingState.location_slug=val("locationSlug","location_slug","location","quickLocation")||loc;
locationDescription();
updatePackageVisibility();
}
}
if(d){b=setVal(["bookingDate","date","quickDate"],d);if(b)window.bookingState.date=d}
if(g){c=setVal(["guestCount","guests","guest","party_size","quickGuests"],g);if(c)window.bookingState.guests=Number(g)}
updateSummary();
if(!checked&&loc&&d&&g&&auto==="1"&&a&&b&&c){checked=true;setTimeout(checkAvailability,500)}
return a&&b&&c;
}
[0,300,800,1500,2500,4000].forEach(t=>setTimeout(once,t));
}
function init(){
setupDate();
setupGuestInput();
const phoneField=field("customerPhone");
if(phoneField){
phoneField.placeholder="0400000000";
phoneField.inputMode="numeric";
phoneField.addEventListener("input",()=>{
if(validatePhone((phoneField.value||"").trim()))return;
clearFieldError("customerPhone");
});
phoneField.addEventListener("blur",()=>{
const phone=(phoneField.value||"").trim();
if(!phone)return;
const err=validatePhone(phone);
if(err)setFieldError("customerPhone",err);
else clearFieldError("customerPhone");
});
}
const lf=field("locationSlug","location_slug","location","quickLocation");
if(lf){
const onLoc=()=>{window.bookingState.location_slug=lf.value||"";locationDescription();updatePackageVisibility()};
lf.addEventListener("change",onLoc);
lf.addEventListener("input",onLoc);
onLoc();
}
hide("availabilitySection");
hide("packageSection");
hide("addonsSection");
hide("contactSection");
hide("reviewSection");
updateSummary();
updatePackageVisibility();
normalizeActionButtons();
bindActionButtons();
applyParams();
if($("selectedSlotText")&&!$("selectedSlotText").textContent.trim())$("selectedSlotText").textContent="Selected slot: -";
}
document.addEventListener("click",e=>{
const availability=e.target.closest("#checkAvailabilityBtn");
const joy=e.target.closest("#selectPackageJoy,[data-koko-package='joy']");
const fun=e.target.closest("#selectPackageFun,[data-koko-package='fun']");
const max=e.target.closest("#selectPackageMax,[data-koko-package='max']");
const create=createBtn(e.target);
const confirm=confirmBtn(e.target);
if(availability){e.preventDefault();e.stopPropagation();checkAvailability();return false}
if(joy){e.preventDefault();e.stopPropagation();getQuote("joy",true);return false}
if(fun){e.preventDefault();e.stopPropagation();getQuote("fun",true);return false}
if(max){e.preventDefault();e.stopPropagation();getQuote("max",true);return false}
if(create){e.preventDefault();e.stopPropagation();createBooking(create);return false}
if(confirm){e.preventDefault();e.stopPropagation();confirmBooking();return false}
},true);
document.addEventListener("submit",e=>{
const form=e.target;
const btn=form&&form.querySelector&&findActionButton(form,["review","create booking","review booking"],"#createBookingBtn,[data-koko-action='create-booking'],[data-koko-action='review-booking']");
if(btn){
e.preventDefault();
e.stopPropagation();
createBooking(btn);
}
},true);
window.addEventListener("resize",()=>{
layoutPackageCards();
document.querySelectorAll("#availabilityResults > div > div:last-child").forEach(x=>x.style.gridTemplateColumns=slotCols());
if($("addonsList"))$("addonsList").style.gridTemplateColumns=innerWidth<=767?"1fr":"1fr 1fr";
});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
