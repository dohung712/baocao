
export const OWNER = "dohung712@gmail.com";
export function scopedStaff(all, member) {
  return all.nhanSu.filter(n=>member.role==="owner" || (member.role==="employee" ? n.id===member.staff_id : member.stores.includes(n.group)));
}
export function scopeData(all, member, snapshot) {
  if(member.role==="owner")return all;
  const staff=scopedStaff(all,member), ids=new Set(staff.map(n=>n.id)), groups=new Set(staff.map(n=>n.group));
  const out={...all,nhanSu:staff,thiDua:all.thiDua.filter(t=>t.store==="Chung"||groups.has(t.store)||staff.some(n=>n.assignedItems.includes(t.name)))};
  for(const k of ["ketQua","deXuat","tiktok","veSinh","lichBan","roadshow","lateLogs"])out[k]=(all[k]||[]).filter(r=>ids.has(r.staffId));
  out.storeContestData=(all.storeContestData||[]).filter(r=>member.stores.includes(r.branch));
  out.config={...all.config,MANAGER_EMAIL:"",ALLOW_STAFF_EDIT_STREAK:"OFF"};
  // Rules contain other staff IDs; keep only the rules applicable to this scope.
  try {out.config.ITEM_RULES=JSON.stringify(JSON.parse(out.config.ITEM_RULES||"[]").filter(r=>!r.staffIds?.length||r.staffIds.some(id=>ids.has(id))).map(r=>({...r,staffIds:(r.staffIds||[]).filter(id=>ids.has(id))})));}catch{out.config.ITEM_RULES="[]";}
  return out;
}
const EMPLOYEE = new Set(["SUBMIT_DAILY_BATCH","REGISTER_CLEAN","UPLOAD_CLEAN_PHOTOS","SUBMIT_TIKTOK_LINK","REGISTER_BUSY","REGISTER_RS","UPLOAD_RS_PHOTOS","NOTE_OPEN","NOTE_CONFIRM","NOTE_SUBMIT"]);
const MANAGER = new Set([...EMPLOYEE,"DELETE_SINGLE_LOG_RECORD","DELETE_STAFF_DAILY_REPORTS","APPROVE_EXTRA_PROPOSAL","RESET_STREAK","ASSIGN_SPECIFIC_ITEMS","DELETE_CLEAN","DELETE_TIKTOK","EXCUSE_TIKTOK","DELETE_BUSY","DELETE_RS","ASSIGN_RS","NOTE_REVIEW","POST_NOTE","UPDATE_NOTE","DELETE_NOTE","CLASSIFY_NOTE","VERIFY_MANAGER"]);
const OWNER_ACTIONS = new Set([...MANAGER,"AUTO_SAVE_SETTINGS","UPDATE_STAFF_STARS","DELETE_STAFF","HIDE_STAFF","SAVE_STORE_RAW_DATA"]);
export function authorize(data,all,member,snapshot) {
  const allowed=member.role==="owner"?OWNER_ACTIONS:member.role==="manager"?MANAGER:EMPLOYEE;
  if(!allowed.has(data.action))throw Error("Bạn không có quyền thực hiện chức năng này.");
  if(member.role==="owner")return;
  const canSee=new Set(scopedStaff(all,member).map(n=>n.id));
  const targets=[];
  if(data.staffId!=null)targets.push(String(data.staffId));
  if(data.staffIds)targets.push(...data.staffIds.map(String));
  if(data.staffs)targets.push(...data.staffs.map(s=>String(s.id)));
  if(data.action==="APPROVE_EXTRA_PROPOSAL"){const r=snapshot.sheets.Data_DeXuat?.[Number(data.rowIdx)-1];if(!r)throw Error("Đề xuất không tồn tại.");targets.push(String(r[1]));}
  if(data.action==="DELETE_CLEAN"){const r=all.veSinh.find(r=>r.date===data.date);if(!r)throw Error("Không tìm thấy đăng ký.");targets.push(r.staffId);}
  if(data.action==="DELETE_TIKTOK"){const r=all.tiktok.find(r=>r.row===Number(data.rowIdx));if(r)targets.push(r.staffId);else if(!data.staffId)throw Error("Thiếu nhân viên.");}
  if(targets.some(id=>!canSee.has(id)))throw Error("Bản ghi nằm ngoài phạm vi của bạn.");
  if(EMPLOYEE.has(data.action) && !data.staffId)throw Error("Chưa gắn tài khoản với mã nhân viên.");
  if(data.action.includes("NOTE") && (data.noteId||data.id)){
    const scopes=snapshot.noteScopes?.[data.noteId||data.id];
    if(scopes?.length&&!scopes.some(s=>member.stores.includes(s)))throw Error("Nội dung nằm ngoài phạm vi của bạn.");
    if(["UPDATE_NOTE","DELETE_NOTE"].includes(data.action)&&!scopes?.length)throw Error("Chỉ chủ quản được sửa nội dung chung.");
  }
}
export function trustedReport(data,all,now=new Date()) {
  const staff=all.nhanSu.find(n=>n.id===String(data.staffId));
  if(!staff)throw Error("Nhân viên không tồn tại.");
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data.date)||data.date>day)throw Error("Ngày báo cáo không hợp lệ.");
  const cfg=all.config||{}, num=(k,d)=>{const n=Number(cfg[k]);return cfg[k]!==""&&cfg[k]!=null&&Number.isFinite(n)&&n>=0?n:d;};
  let items=all.thiDua.filter(t=>staff.assignedItems.length?staff.assignedItems.includes(t.name):(t.store==="Chung"||t.store.toLowerCase()===staff.group.toLowerCase()));
  const map=new Map();for(const t of items){if(!map.has(t.name)||t.store===staff.group)map.set(t.name,t);}items=[...map.values()];
  if(!items.length)throw Error("Nhân viên chưa có môn thi đua.");
  const input=new Map();for(const r of data.reports||[]){if(["PHAT_TRE","TIKTOK_PHAT"].includes(r.compensation))continue;if(input.has(r.itemName)||!map.has(r.itemName))throw Error("Môn thi đua không hợp lệ hoặc bị trùng.");if(!Number.isFinite(Number(r.actual))||Number(r.actual)<0)throw Error("Thực đạt phải là số không âm.");input.set(r.itemName,r);}
  if(input.size!==items.length)throw Error("Cần gửi đầy đủ các môn được giao.");
  let rules=[];try{rules=JSON.parse(cfg.ITEM_RULES||"[]");}catch{}
  const reports=items.map(t=>{const r=input.get(t.name),rate=Number(r.actual)/(Number(t.target)||1);return{itemName:t.name,actual:Number(r.actual),rate:Math.round(rate*100)+"%",starChange:rate>=1?(Number(t.bonusStar)||200)*(t.isX2&&rate>=num("DOUBLE_BONUS_RATE",150)/100?2:1):0,status:rate>=1?"Về số":"Chưa về",compensation:rate>=1?"DUNG_SAO":r.compensation==="TANG_CA"?"TANG_CA":"DUNG_SAO"};});
  const old=all.ketQua.filter(r=>r.staffId===staff.id&&r.date===data.date).reduce((s,r)=>s+Number(r.starChange||0),0);
  let pool=Number(staff.totalStar||0)-old+reports.reduce((s,r)=>s+Math.max(0,r.starChange),0);
  for(let i=0;i<items.length;i++){
    const t=items[i],r=reports[i];if(r.status==="Về số")continue;
    let streak=0;const records=all.ketQua.filter(k=>k.staffId===staff.id&&k.itemName===t.name&&k.date<data.date&&(!staff.resetDate||k.date>staff.resetDate)).sort((a,b)=>b.date.localeCompare(a.date));
    if(cfg.AUTO_STREAK_ENABLED!=="OFF")for(const k of records){if(k.status==="Về số")break;if(k.status==="Chưa về"&&k.compensation!=="TANG_CA")streak++;}
    const score=x=>(x.staffIds?.length?100:0)+(x.stores?.length?10:0)+(x.item!=="*"?1:0);
    const rule=rules.filter(x=>(x.item==="*"||x.item===t.name)&&(!x.staffIds?.length||x.staffIds.includes(staff.id))&&(!x.stores?.length||x.stores.includes(staff.group))).sort((a,b)=>score(b)-score(a))[0];
    const ot=rule?.ot!==""&&rule?.ot!=null?Number(rule.ot):num("STREAK_OVERTIME",3);
    const pen=rule?.noPen?Infinity:rule?.pen!==""&&rule?.pen!=null?Number(rule.pen):num("STREAK_PENALTY_STAR",5);
    let multiplier=num("PEN_M1",1);
    if(streak>=num("PEN_T4_MIN",8))multiplier=num("PEN_M4",5);else if(streak>=num("PEN_T3_MIN",6))multiplier=num("PEN_M3",2);else if(streak>=num("PEN_T2_MIN",4))multiplier=num("PEN_M2",1.5);
    const needed=Math.round((Number(t.penaltyStar)||100)*multiplier);
    if(streak<ot&&streak<pen)r.compensation="GHI_NHAN";
    else if(streak<pen)r.compensation="TANG_CA";
    else {if(streak<ot)r.compensation="DUNG_SAO";if(r.compensation==="DUNG_SAO"){if(pool>=needed){r.starChange=-needed;pool-=needed;}else r.compensation="TANG_CA";}}
  }
  const hm=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
  const existingLate=all.ketQua.find(r=>r.staffId===staff.id&&r.date===data.date&&r.compensation==="PHAT_TRE");
  if(existingLate)reports.push(existingLate);
  else if(data.date<day||hm>"22:20"){const count=1+all.ketQua.filter(r=>r.staffId===staff.id&&r.date!==data.date&&r.date.startsWith(data.date.slice(0,7))&&r.compensation==="PHAT_TRE").length;reports.push({itemName:"[Kỷ Luật] Báo cáo sau 22h20 (Lần "+count+")",actual:1,rate:"Trễ ca",starChange:-100*count,status:"Nộp trễ",compensation:"PHAT_TRE"});}
  return {...data,staffId:staff.id,staffName:staff.name,reports,extraItem:String(data.extraItem||"").replace(/[<>]/g,""),extraStars:Math.max(0,Math.min(100000,Number(data.extraStars)||0))};
}
export function afterCutoff(date,now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now).map(p=>[p.type,p.value]));
 const today=p.year+"-"+p.month+"-"+p.day;
 return date<today||(date===today&&p.hour+":"+p.minute>"22:20");
}