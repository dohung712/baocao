
(() => {
"use strict";
const BASE="https://iauxgnnybhzqeirnqaen.supabase.co", PUBLIC_KEY="sb_publishable_NRvEe2l11DFIHjQZzQinIQ_ASSaVsyX", API=BASE+"/functions/v1/thi-dua";
const rawFetch=window.fetch.bind(window),get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem,KEY="CF_SESSION_V20";
let session;try{session=JSON.parse(get.call(localStorage,KEY)||"null");}catch{}
let account=session?.user?.email||"NOSESSION",readyResolve,refreshing;
const CF=window.CF={member:null,media:{},dirty:false,API,ready:new Promise(r=>readyResolve=r)};
const scopedKey=k=>/^(APP_|BZ_|PENDING_)/.test(k)?"CF_USER_"+account.toLowerCase()+"_"+k:k;
Storage.prototype.getItem=function(k){return get.call(this,this===localStorage?scopedKey(k):k);};
Storage.prototype.setItem=function(k,v){return set.call(this,this===localStorage?scopedKey(k):k,v);};
Storage.prototype.removeItem=function(k){return remove.call(this,this===localStorage?scopedKey(k):k);};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function saveSession(s){session=s;account=s.user?.email||"NOSESSION";set.call(localStorage,KEY,JSON.stringify(s));}
async function auth(path,data,token){
 const r=await rawFetch(BASE+"/auth/v1/"+path,{method:path==="user"?"PUT":"POST",headers:{apikey:PUBLIC_KEY,"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{})},body:JSON.stringify(data)});
 const j=await r.json();if(!r.ok)throw Error(j.msg||j.error_description||j.message||"Không đăng nhập được.");return j;
}
async function accessToken(){
 if(!session?.access_token)throw Error("Vui lòng đăng nhập.");
 if(!session.expires_at||Date.now()/1000>session.expires_at-90){
  refreshing??=auth("token?grant_type=refresh_token",{refresh_token:session.refresh_token}).then(j=>{j.expires_at=Date.now()/1000+j.expires_in;saveSession(j);}).finally(()=>refreshing=null);
  await refreshing;
 }return session.access_token;
}
CF.request=async(action,data={})=>{
 const r=await rawFetch(API,{method:"POST",headers:{"Content-Type":"application/json",apikey:PUBLIC_KEY,Authorization:"Bearer "+await accessToken()},body:JSON.stringify({...data,action})});
 const j=await r.json();if(j.mediaUrls)Object.assign(CF.media,j.mediaUrls);
 if(r.status===401||r.status===403)CF.lock(j.message);
 if(!r.ok||["error","conflict"].includes(j.status))throw Error(j.message||"Không thực hiện được.");return j;
};
window.fetch=async(input,options={})=>{
 const url=String(typeof input==="string"?input:input.url);if(!url.startsWith(API))return rawFetch(input,options);
 await CF.ready;const headers=new Headers(options.headers||{});headers.set("Authorization","Bearer "+await accessToken());headers.set("apikey",PUBLIC_KEY);if(options.body)headers.set("Content-Type","application/json");
 const r=await rawFetch(input,{...options,signal:options.signal?.aborted?undefined:options.signal,headers});let j;try{j=await r.clone().json();if(j.mediaUrls)Object.assign(CF.media,j.mediaUrls);}catch{}
 if(r.status===401||r.status===403)CF.lock(j?.message||"Phiên đăng nhập không hợp lệ.");return r;
};
function message(text,error=false){const el=document.getElementById("cf-auth-msg");if(el){el.textContent=text;el.style.color=error?"#be123c":"#047857";}}
CF.lock=text=>{document.documentElement.classList.remove("cf-authenticated");document.getElementById("cf-panel")?.classList.add("cf-hide");document.getElementById("cf-login")?.classList.remove("cf-hide");message(text,true);};
CF.logout=async()=>{
 try{if(session?.access_token)await rawFetch(BASE+"/auth/v1/logout",{method:"POST",headers:{apikey:PUBLIC_KEY,Authorization:"Bearer "+session.access_token}});}catch{}
 const prefix="CF_USER_"+account.toLowerCase()+"_";for(const k of Object.keys(localStorage))if(k.startsWith(prefix))remove.call(localStorage,k);
 remove.call(localStorage,KEY);history.replaceState(null,"",location.pathname);location.reload();
};
async function completeLogin(){
 const j=await CF.request("me");CF.member=j.member;document.getElementById("cf-login").classList.add("cf-hide");document.documentElement.classList.add("cf-authenticated");
 document.getElementById("cf-account").textContent=j.member.email+" · "+({owner:"Chủ quản",manager:"Quản lý",employee:"Nhân viên"}[j.member.role]);
 document.getElementById("cf-users").hidden=j.member.role!=="owner";readyResolve();CF.installLegacy();
}
CF.editing=()=>CF.dirty||["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName);
async function signIn(ev){
 ev.preventDefault();const btn=document.getElementById("cf-signin");btn.disabled=true;
 try{
  const email=document.getElementById("cf-email").value.trim().toLowerCase(),password=document.getElementById("cf-password").value;
  if(password){const j=await auth("token?grant_type=password",{email,password});j.expires_at=Date.now()/1000+j.expires_in;saveSession(j);await completeLogin();}
  else{await auth("otp",{email,create_user:true});message("Mở email, sao chép đường dẫn của nút đăng nhập rồi dán vào ô xác thực bên dưới. Chỉ email được cấp quyền mới xem được dữ liệu.");}
 }catch(e){message(e.message,true);}finally{btn.disabled=false;}
}
async function verifyLink(ev){
 ev.preventDefault();try{
  const link=new URL(document.getElementById("cf-link").value.trim());if(link.origin!==BASE)throw Error("Liên kết phải thuộc hệ thống này.");
  const token_hash=link.searchParams.get("token")||link.searchParams.get("token_hash");if(!token_hash)throw Error("Không tìm thấy mã xác thực.");
  const j=await auth("verify",{token_hash,type:link.searchParams.get("type")||"email"});j.expires_at=Date.now()/1000+j.expires_in;saveSession(j);document.getElementById("cf-link").value="";await completeLogin();CF.passwordPanel(true);
 }catch(e){message(e.message,true);}
}
CF.panel=(title,html)=>{document.getElementById("cf-panel-title").textContent=title;document.getElementById("cf-panel-body").innerHTML=html;document.getElementById("cf-panel").classList.remove("cf-hide");};
CF.close=()=>document.getElementById("cf-panel").classList.add("cf-hide");
CF.passwordPanel=(first=false)=>{
 CF.panel(first?"Đặt mật khẩu đăng nhập":"Đổi mật khẩu",'<p>Đặt mật khẩu để lần sau đăng nhập nhanh bằng email. Tối thiểu 10 ký tự.</p><form id="cf-setpass" class="cf-stack"><label>Mật khẩu mới<input id="cf-newpass" type="password" autocomplete="new-password" minlength="10" required></label><label>Nhập lại mật khẩu<input id="cf-repeatpass" type="password" autocomplete="new-password" minlength="10" required></label><button class="cf-primary">Lưu mật khẩu</button></form><p id="cf-pass-msg"></p>');
 document.getElementById("cf-setpass").onsubmit=async ev=>{ev.preventDefault();const a=document.getElementById("cf-newpass").value,b=document.getElementById("cf-repeatpass").value;const msg=document.getElementById("cf-pass-msg");if(a!==b){msg.textContent="Mật khẩu không khớp.";return;}try{await auth("user",{password:a},await accessToken());document.getElementById("cf-newpass").value="";document.getElementById("cf-repeatpass").value="";msg.textContent="Đã lưu mật khẩu."; }catch(e){msg.textContent=e.message;}};
};
CF.openMembers=async()=>{
 try{
  const j=await CF.request("MEMBERS_LIST");
  CF.panel("Cấp quyền sử dụng",'<p>Chủ quản '+esc(CF.member.email)+' giữ toàn quyền. Nhân viên chỉ xem dữ liệu của mình; quản lý xem các siêu thị được gán.</p><form id="cf-member-form" class="cf-stack"><label>Email<input id="cf-member-email" type="email" required></label><label>Vai trò<select id="cf-member-role"><option value="employee">Nhân viên</option><option value="manager">Quản lý</option></select></label><label>Gắn nhân viên<select id="cf-member-staff"><option value="">Quản lý không gắn mã NV</option>'+j.staff.map(n=>'<option value="'+esc(n.id)+'">'+esc(n.id+" · "+n.name+" · "+n.group)+'</option>').join("")+'</select></label><fieldset><legend>Siêu thị được phép</legend>'+j.stores.map(s=>'<label class="cf-check"><input type="checkbox" name="cf-stores" value="'+esc(s)+'">'+esc(s)+'</label>').join("")+'</fieldset><label class="cf-check"><input id="cf-member-active" type="checkbox" checked>Đang hoạt động</label><button class="cf-primary">Lưu quyền</button></form><div id="cf-members-list"></div><p id="cf-member-msg" role="status"></p><label>Liên kết kích hoạt một lần<textarea id="cf-invite-link" readonly placeholder="Chọn Tạo liên kết, rồi gửi riêng cho đúng email."></textarea></label>');
  const list=document.getElementById("cf-members-list");
  j.members.forEach(m=>{const row=document.createElement("div");row.className="cf-member";const t=document.createElement("span");t.textContent=m.email+" · "+({owner:"Chủ quản",manager:"Quản lý",employee:"Nhân viên"}[m.role])+" · "+(m.active?"Hoạt động":"Đã khóa");row.append(t);
   if(m.role!=="owner"){
    const edit=document.createElement("button");edit.textContent="Sửa";edit.onclick=()=>{document.getElementById("cf-member-email").value=m.email;document.getElementById("cf-member-role").value=m.role;document.getElementById("cf-member-staff").value=m.staff_id||"";document.getElementById("cf-member-active").checked=m.active;document.querySelectorAll('[name="cf-stores"]').forEach(el=>el.checked=m.stores.includes(el.value));};row.append(edit);
    const invite=document.createElement("button");invite.textContent="Tạo liên kết";invite.disabled=!m.active;invite.onclick=async()=>{try{const r=await CF.request("MEMBER_LINK",{email:m.email});document.getElementById("cf-invite-link").value=r.url;document.getElementById("cf-member-msg").textContent=r.message;}catch(e){alert(e.message);}};row.append(invite);
   }list.append(row);
  });
  document.getElementById("cf-member-staff").onchange=ev=>{const n=j.staff.find(n=>n.id===ev.target.value);if(n)document.querySelectorAll('[name="cf-stores"]').forEach(el=>el.checked=el.value===n.group);};
  document.getElementById("cf-member-form").onsubmit=async ev=>{ev.preventDefault();try{await CF.request("MEMBERS_SAVE",{member:{email:document.getElementById("cf-member-email").value,role:document.getElementById("cf-member-role").value,staff_id:document.getElementById("cf-member-staff").value||null,stores:[...document.querySelectorAll('[name="cf-stores"]:checked')].map(x=>x.value),active:document.getElementById("cf-member-active").checked}});await CF.openMembers();}catch(e){alert(e.message);}};
 }catch(e){alert(e.message);}
};
CF.openRequests=async()=>{
 try{const j=await CF.request("REQUESTS");CF.panel("Yêu cầu sửa sau giờ chốt",'<p>Báo cáo qua 22h20 hoặc ngày đã khóa cần quản lý duyệt trước khi cập nhật.</p><div id="cf-request-list"></div>');
  const list=document.getElementById("cf-request-list");if(!j.requests.length)list.textContent="Chưa có yêu cầu.";
  j.requests.forEach(r=>{const box=document.createElement("div");box.className="cf-member";const t=document.createElement("div");t.textContent=r.report_date+" · "+r.staff_id+" · "+r.email+" · "+r.status+"\nLý do: "+r.reason;box.append(t);
   const details=document.createElement("details"),summary=document.createElement("summary");summary.textContent="Xem số liệu đề xuất";details.append(summary);const pre=document.createElement("pre");pre.textContent=JSON.stringify(r.payload.reports?.filter(x=>!String(x.itemName).startsWith("[Kỷ Luật]")).map(x=>({mon:x.itemName,thucDat:x.actual,phuongAn:x.compensation})),null,2);details.append(pre);box.append(details);
   if(CF.member.role!=="employee"&&r.status==="pending")for(const [label,approve]of [["Duyệt",true],["Từ chối",false]]){const b=document.createElement("button");b.textContent=label;b.onclick=async()=>{try{await CF.request("REVIEW_CHANGE",{id:r.id,approve});await CF.openRequests();await loadData(true);}catch(e){alert(e.message);}};box.append(b);}
   list.append(box);
  });
 }catch(e){alert(e.message);}
};
CF.openChat=()=>{
 CF.panel("Trợ lý thống kê & báo cáo",'<p>Phân tích dữ liệu trong phạm vi tài khoản. Ghi ngày YYYY-MM-DD nếu muốn xem ngày khác. Chưa cấu hình AI thì trả thống kê trực tiếp.</p><form id="cf-chat-form" class="cf-stack"><label>Yêu cầu<textarea id="cf-question" required placeholder="TOP/BOTTOM, đạt/chưa đạt, ai chưa gửi báo cáo hôm nay?"></textarea></label><button class="cf-primary">Phân tích</button></form><p id="cf-chat-mode"></p><pre id="cf-answer" class="cf-answer"></pre>'+(CF.member.role==="owner"?'<details><summary>Kích hoạt AI trả lời tự do</summary><p>Dùng API key OpenAI của bạn; chi phí theo tài khoản API. Khóa chỉ lưu ở máy chủ.</p><input type="password" id="cf-ai-key" autocomplete="off" placeholder="OpenAI API key"><button id="cf-save-ai">Lưu cấu hình AI</button></details>':""));
 document.getElementById("cf-chat-form").onsubmit=async ev=>{ev.preventDefault();const button=ev.target.querySelector("button");button.disabled=true;document.getElementById("cf-answer").textContent="Đang phân tích...";try{const r=await CF.request("CHAT",{question:document.getElementById("cf-question").value});document.getElementById("cf-answer").textContent=r.answer;document.getElementById("cf-chat-mode").textContent=r.mode==="ai"?"Phân tích AI từ dữ liệu được cấp quyền":"Thống kê hệ thống · AI chưa kích hoạt";}catch(e){document.getElementById("cf-answer").textContent=e.message;}finally{button.disabled=false;}};
 document.getElementById("cf-save-ai")?.addEventListener("click",async()=>{try{const input=document.getElementById("cf-ai-key");await CF.request("AI_CONFIG",{key:input.value});input.value="";alert("Đã lưu cấu hình.");}catch(e){alert(e.message);}});
};
CF.installLegacy=()=>{
 if(CF.installed||typeof verifyManagerAccess!=="function")return;CF.installed=true;
 verifyManagerAccess=function(){if(["owner","manager"].includes(CF.member?.role)){isManagerUnlocked=true;managerPass="account";document.getElementById("badgeManagerActive")?.classList.remove("hidden");return true;}showToastMessage("Chức năng dành cho quản lý.");return false;};
 verifyManagerOnServer=async function(){};
 const apply=applyStateData;
 applyStateData=function(data){
  const id=document.getElementById("staffSelect")?.value,date=document.getElementById("reportDate")?.value;
  const draft=CF.dirty?[...document.querySelectorAll("#itemsTableBody tr[data-item]")].map(r=>({name:r.dataset.item,value:r.querySelector(".row-actual")?.value,comp:r.dataset.comp})):[];
  apply(data);
  if(draft.length&&id===document.getElementById("staffSelect")?.value&&date===document.getElementById("reportDate")?.value){for(const row of document.querySelectorAll("#itemsTableBody tr[data-item]")){const d=draft.find(d=>d.name===row.dataset.item);if(d){row.querySelector(".row-actual").value=d.value;row.dataset.comp=d.comp;}}calculateAllRowsRealtime();}
 };
 postReportWithVerify=async function(payload,onTry){
  try{
   if(onTry)onTry(1);const r=await CF.request("SUBMIT_DAILY_BATCH",payload);
   if(r.status==="approval_required"){const reason=prompt(r.message+"\nNhập lý do sửa:");if(!reason)return{ok:false,msg:"Chưa gửi yêu cầu sửa."};await CF.request("REQUEST_CHANGE",{payload,reason});return{ok:false,queued:true,msg:"Đã gửi yêu cầu sửa, chờ quản lý duyệt."};}
   if(r.status!=="success")return{ok:false,msg:r.message||"Chưa lưu được."};
   if(!(await pendingVerify(payload)))return{ok:false,msg:"Chưa đối chiếu được dữ liệu đã lưu."};
   CF.dirty=false;await loadData(true);return{ok:true};
  }catch(e){return{ok:false,msg:e.message};}
 };
 clThumb=function(id){return String(id).startsWith("cf_")?(CF.media[id]||""):("https://drive.google.com/thumbnail?id="+encodeURIComponent(id)+"&sz=w1000");};
 clViewUrl=function(id){return String(id).startsWith("cf_")?(CF.media[id]||"#"):("https://drive.google.com/file/d/"+encodeURIComponent(id)+"/view");};
 if(CF.member.role!=="employee")verifyManagerAccess();
};
function mount(){
 const style=document.createElement("style");style.textContent=`
 html:not(.cf-authenticated) body>.max-w-5xl{visibility:hidden}
 #cf-login,#cf-panel{position:fixed;inset:0;background:#0f172ad9;z-index:1000;display:flex;align-items:center;justify-content:center;padding:18px;font:14px system-ui;color:#172554}
 .cf-hide{display:none!important}.cf-card{background:#fff;border-radius:20px;padding:26px;width:min(100%,520px);max-height:94vh;overflow:auto;box-shadow:0 24px 80px #0003}.cf-card h2{font-size:23px;font-weight:800;margin:0 0 12px}.cf-card p{margin:12px 0;color:#475569;line-height:1.6}.cf-card input:not([type=checkbox]),.cf-card select,.cf-card textarea{border:1px solid #cbd5e1;border-radius:9px;padding:10px;width:100%;box-sizing:border-box;background:white;color:#0f172a;font:inherit}.cf-card textarea{min-height:90px}.cf-stack{display:grid;gap:12px;margin:16px 0}.cf-card label{display:grid;gap:6px}.cf-card button,#cf-toolbar button{background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:8px 12px;cursor:pointer;font:inherit}.cf-card .cf-primary{background:#4338ca;color:white;border:0;font-weight:700}.cf-card button:disabled{opacity:.5;cursor:wait}.cf-check{display:flex!important;align-items:center;gap:8px;margin:5px 0}.cf-member{padding:12px 0;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;white-space:pre-wrap}.cf-member span,.cf-member>div{flex:1;min-width:210px}.cf-member details{width:100%}.cf-answer{white-space:pre-wrap;font:14px/1.7 system-ui;background:#f8fafc;border-radius:12px;padding:16px;max-height:60vh;overflow:auto}
 #cf-toolbar{position:sticky;top:0;z-index:60;background:#fff;border-bottom:1px solid #e2e8f0;padding:9px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font:12px system-ui}#cf-account{flex:1;min-width:180px;font-weight:700}#cf-panel .cf-card{width:min(100%,820px)}.cf-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}html:not(.cf-authenticated) #cf-toolbar{visibility:hidden}.cf-card summary{cursor:pointer;font-weight:700;margin:10px 0}
 `;document.head.append(style);
 const ui=document.createElement("div");ui.id="cf-shell";ui.innerHTML=`
 <div id="cf-toolbar"><span id="cf-account">Đang kiểm tra tài khoản...</span><button id="cf-users" hidden>Cấp quyền</button><button id="cf-requests">Yêu cầu sửa</button><button id="cf-chat">Trợ lý báo cáo</button><button id="cf-password-change">Đổi mật khẩu</button><button id="cf-logout">Đăng xuất</button></div>
 <div id="cf-login"><section class="cf-card"><h2>Thi đua & BXH PRO</h2><p>Đăng nhập email đã được chủ quản cấp quyền. Dữ liệu được giới hạn theo tài khoản và siêu thị.</p><form id="cf-auth-form" class="cf-stack"><label>Email<input id="cf-email" type="email" autocomplete="username" required placeholder="Email được cấp quyền"></label><label>Mật khẩu<input id="cf-password" type="password" autocomplete="current-password" placeholder="Để trống nếu đăng nhập bằng email"></label><button id="cf-signin" class="cf-primary">Đăng nhập / Nhận liên kết email</button></form><p id="cf-auth-msg" role="status"></p><details><summary>Đăng nhập lần đầu bằng liên kết email</summary><p>Sao chép đường dẫn của nút đăng nhập trong email và dán vào đây. Nếu quản lý gửi liên kết kích hoạt của tool, chỉ cần mở trực tiếp.</p><form id="cf-link-form" class="cf-stack"><label>Liên kết xác thực<input id="cf-link" type="url" autocomplete="off"></label><button>Xác thực liên kết</button></form></details></section></div>
 <div id="cf-panel" class="cf-hide"><section class="cf-card"><div class="cf-head"><h2 id="cf-panel-title"></h2><button id="cf-close">Đóng</button></div><div id="cf-panel-body"></div></section></div>`;
 document.body.prepend(ui);
 document.getElementById("cf-auth-form").onsubmit=signIn;document.getElementById("cf-link-form").onsubmit=verifyLink;
 document.getElementById("cf-logout").onclick=CF.logout;document.getElementById("cf-password-change").onclick=()=>CF.passwordPanel();
 document.getElementById("cf-users").onclick=CF.openMembers;document.getElementById("cf-requests").onclick=CF.openRequests;document.getElementById("cf-chat").onclick=CF.openChat;document.getElementById("cf-close").onclick=CF.close;
 document.addEventListener("input",ev=>{if(ev.target.closest("#itemsTableBody")||["extraItemName","extraItemStars"].includes(ev.target.id))CF.dirty=true;});
 document.addEventListener("click",ev=>{if(ev.target.closest(".btn-comp-star,.btn-comp-ot"))CF.dirty=true;});
 (async()=>{try{
  const h=new URLSearchParams(location.hash.slice(1));
  if(h.get("token_hash")){const j=await auth("verify",{token_hash:h.get("token_hash"),type:"email"});j.expires_at=Date.now()/1000+j.expires_in;saveSession(j);history.replaceState(null,"",location.pathname);await completeLogin();CF.passwordPanel(true);}
  else if(session?.access_token)await completeLogin();
 }catch(e){message(e.message,true);}})();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);else mount();
})();