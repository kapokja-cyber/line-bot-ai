import { NextRequest, NextResponse } from "next/server";
import { database, historyConfigured, recordingEnabled, requireOwner, signIn, SESSION_COOKIE, isSameOrigin, validId, containsObviousPersonalData, weekBounds } from "@/lib/history";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
function json(data: unknown, status=200) { return NextResponse.json(data,{status,headers}); }
function bounded(value: unknown, max: number) { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
async function audit(ownerId: string, action: string) { await database("history_audit","POST",{ owner_id: ownerId, action }); }
export async function GET(req: NextRequest) {
 try {
  if (!historyConfigured()) return json({ setupRequired:true, recording:false },503);
  const owner=await requireOwner(req);
  if (!owner) return json({ error:"กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าของ" },401);
  const params=req.nextUrl.searchParams;
  const view=params.get("view") || "conversations";
  const offset=Number(params.get("offset") || 0);
  if (!Number.isInteger(offset)||offset<0||offset>100000) return json({error:"หน้าที่ขอไม่ถูกต้อง"},400);
  await audit(owner.id,`view:${view}`);
  if(view==="session") return json({email:owner.email,recording:recordingEnabled()});
  if(view==="conversations") {
   const rows=await database(`history_conversations?select=id,label,created_at&order=created_at.desc&limit=101&offset=${offset}`);
   return json({rows:rows.slice(0,100),hasMore:rows.length>100});
  }
  if(view==="patients") {
   const rows=await database(`history_patients?select=*&order=created_at.desc&limit=101&offset=${offset}`);
   return json({rows:rows.slice(0,100),hasMore:rows.length>100});
  }
  if(view==="events") {
   const id=params.get("conversation"); if(!validId(id))return json({error:"กรุณาเลือกบทสนทนา"},400);
   const rows=await database(`history_events?select=*&conversation_id=eq.${id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc,event_id.desc&limit=101&offset=${offset}`);
   const links=await database(`history_patient_links?select=patient_id,history_patients(id,name)&conversation_id=eq.${id}`);
   return json({rows:rows.slice(0,100),hasMore:rows.length>100,links});
  }
  if(view==="weekly") {
   const {start,end}=weekBounds(params.get("start")||"");
   const rows=await database(`history_events?select=event_id,question,reply,outcome,delivered,reviewed,created_at&created_at=gte.${encodeURIComponent(start)}&created_at=lt.${encodeURIComponent(end)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc,event_id.desc&limit=101&offset=${offset}`);
   return json({rows:rows.slice(0,100),hasMore:rows.length>100,start,end});
  }
  if(view==="drafts") return json({rows:await database("history_faq_drafts?order=created_at.desc&limit=200")});
  return json({error:"ไม่พบรายการ"},404);
 }catch{return json({error:"โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่"},503);}
}
export async function POST(req: NextRequest) {
 if(!isSameOrigin(req)) return json({error:"ไม่อนุญาต"},403);
 if(!req.headers.get("content-type")?.startsWith("application/json"))return json({error:"รูปแบบข้อมูลไม่ถูกต้อง"},415);
 try {
  const raw=await req.text(); if(raw.length>16000)return json({error:"ข้อมูลยาวเกินไป"},413);
  let body;try{body=JSON.parse(raw);}catch{return json({error:"ข้อมูลไม่ถูกต้อง"},400);}
  if(!body || typeof body!=="object")return json({error:"ข้อมูลไม่ถูกต้อง"},400);
  if(body.action==="logout") {
   const token=req.cookies.get(SESSION_COOKIE)?.value;
   if(token && historyConfigured()) {
    await fetch(`${new URL(process.env.SUPABASE_URL!).origin}/auth/v1/logout`,{method:"POST",headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY!,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(3000)}).catch(()=>undefined);
   }
   const res=json({ok:true});res.cookies.set(SESSION_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/api/history",maxAge:0});return res;
  }
  if(!historyConfigured())return json({setupRequired:true,error:"ยังไม่ได้เชื่อมฐานข้อมูลและบัญชีเจ้าของ"},503);
  if(body.action==="login") {
   if(!bounded(body.email,254)||!bounded(body.password,1024))return json({error:"อีเมลหรือรหัสผ่านไม่ถูกต้อง"},401);
   const session=await signIn(body.email,body.password);
   if(!session)return json({error:"อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชีนี้ไม่มีสิทธิ์"},401);
   const res=json({ok:true});res.cookies.set(SESSION_COOKIE,session.token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/api/history",maxAge:session.expires});return res;
  }
  const owner=await requireOwner(req);if(!owner)return json({error:"กรุณาเข้าสู่ระบบด้วยบัญชีเจ้าของ"},401);
  if(body.action==="patient") {
   if(!bounded(body.name,200)||typeof body.phone!=="string"||body.phone.length>40||typeof body.notes!=="string"||body.notes.length>3000)return json({error:"กรุณาตรวจข้อมูลคนไข้"},400);
   const birth=body.birth_date||null;
   if(birth && (!/^\d{4}-\d{2}-\d{2}$/.test(birth)||Number.isNaN(Date.parse(birth))||Date.parse(birth)>Date.now()))return json({error:"วันเกิดไม่ถูกต้อง"},400);
   await audit(owner.id,"create_patient");
   return json({rows:await database("history_patients","POST",{name:body.name.trim(),birth_date:birth,phone:body.phone.trim(),notes:body.notes.trim()})});
  }
  if(body.action==="link") {
   if(!validId(body.patient_id)||!validId(body.conversation_id))return json({error:"กรุณาเลือกคนไข้และบทสนทนา"},400);
   await audit(owner.id,"link_patient");
   await database("history_patient_links","POST",{patient_id:body.patient_id,conversation_id:body.conversation_id});return json({ok:true});
  }
  if(body.action==="review") {
   if(!bounded(body.event_id,200))return json({error:"ข้อมูลไม่ถูกต้อง"},400);
   await audit(owner.id,"review_event");
   await database(`history_events?event_id=eq.${encodeURIComponent(body.event_id)}`,"PATCH",{reviewed:true});return json({ok:true});
  }
  if(body.action==="draft") {
   if(!bounded(body.question,1000)||!bounded(body.answer,5000)||body.deidentified_confirmed!==true)return json({error:"กรุณากรอกคำถาม คำตอบ และยืนยันว่าลบข้อมูลระบุตัวบุคคลแล้ว"},400);
   if(containsObviousPersonalData(body.question))return json({error:"คำถามยังมีลักษณะของเบอร์โทร อีเมล หรือเลขระบุตัวบุคคล กรุณาลบก่อน"},400);
   await audit(owner.id,"create_faq_draft");
   return json({rows:await database("history_faq_drafts","POST",{question:body.question.trim(),answer:body.answer.trim(),deidentified_confirmed:true})});
  }
  if(body.action==="approve") {
   if(!validId(body.id))return json({error:"ข้อมูลไม่ถูกต้อง"},400);
   await audit(owner.id,"approve_faq");
   await database(`history_faq_drafts?id=eq.${body.id}&status=eq.draft&deidentified_confirmed=eq.true`,"PATCH",{status:"approved",approved_at:new Date().toISOString()});return json({ok:true});
  }
  return json({error:"ไม่รองรับคำสั่งนี้"},400);
 }catch{return json({error:"บันทึกไม่สำเร็จ กรุณาตรวจข้อมูลหรือลองใหม่"},503);}
}
