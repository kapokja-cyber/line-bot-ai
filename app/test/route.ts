import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { csvToFaqText } from "@/lib/sheet";
import { generateReply, DEFAULT_REPLY } from "@/lib/gemini";
import { shouldHandoff } from "@/lib/handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
// This project has Vercel Authentication enabled for previews. Keep it enabled.
// Fail closed on production and on other projects connected to this repository.
function enabled() {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_PROJECT_ID === "prj_87JYGnloVhJfn1WBNDVg7LWNgsse";
}
const source = "https://docs.google.com/spreadsheets/d/1W8KnqelYbWFLgmlhxcpeO-Y1tN024TDj01keUWpyXjo/export?format=csv&gid=1125779856";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(req: NextRequest) {
  if (!enabled()) return new Response("Not found", { status: 404 });
  // Match the masked key label in AI Studio without exposing the credential.
  // This diagnostic inherits the project's authenticated-preview protection.
  if (req.nextUrl.searchParams.get("connection") === "1") {
    const key = process.env.GEMINI_API_KEY?.trim();
    return NextResponse.json({ keyConfigured: Boolean(key), keySuffix: key && key.length > 12 ? key.slice(-4) : null }, { headers });
  }
  const nonce = randomBytes(18).toString("base64");
  return new Response(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ลองคุยกับน้องณดี</title>
<style nonce="${nonce}">*{box-sizing:border-box}body{font:18px/1.7 system-ui,sans-serif;background:#f5f7f5;color:#213c35;margin:0;padding:24px}main{max-width:760px;margin:30px auto;background:white;padding:32px;border-radius:20px}h1{margin:0;font-size:30px}.note{color:#53675f}textarea{width:100%;font:inherit;padding:14px;border:1px solid #9db1a7;border-radius:10px}button{font:inherit;border:0;background:#21684e;color:white;border-radius:10px;padding:10px 20px;cursor:pointer;margin:8px 4px 8px 0}button:disabled{opacity:.5}article{border-top:1px solid #ddd;margin-top:20px;padding-top:14px;white-space:pre-wrap}small{display:block;color:#65736e}#status{min-height:30px}</style>
<main><h1>ลองคุยกับน้องณดี</h1><p class="note">ระบบทดสอบ · ข้อมูล FAQ Auto V2<br>ใช้คำถามสมมติเท่านั้น ข้อความจะส่งให้ Gemini เพื่อสร้างคำตอบ ไม่ส่งเข้า LINE และไม่บันทึกเป็นประวัติคนไข้</p><p>ทดสอบครั้งละหนึ่งคำถาม บอทยังไม่จำคำถามก่อนหน้า</p>
<form id="form"><label for="question">อยากถามน้องณดีว่าอะไรคะ?</label><textarea id="question" maxlength="1000" rows="3" required placeholder="เช่น คลินิกเปิดกี่โมงคะ"></textarea><button id="send">ลองถาม</button><button type="button" id="clear">ล้างผลบนหน้านี้</button></form><p id="status" role="status" aria-live="polite"></p><section id="results" aria-label="ผลการทดสอบ"></section></main>
<script nonce="${nonce}">const form=document.getElementById('form'),q=document.getElementById('question'),send=document.getElementById('send'),status=document.getElementById('status'),results=document.getElementById('results');document.getElementById('clear').onclick=()=>{results.replaceChildren();status.textContent='';};form.onsubmit=async e=>{e.preventDefault();const question=q.value.trim();if(!question)return;send.disabled=true;status.textContent='กำลังให้น้องณดีตอบ…';try{const res=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});const data=await res.json();if(!res.ok)throw Error(data.error||'ทดสอบไม่สำเร็จ');const row=document.createElement('article'),title=document.createElement('strong'),answer=document.createElement('p'),meta=document.createElement('small');title.textContent='คำถาม: '+question;answer.textContent=data.reply;meta.textContent=data.note+' · '+(data.elapsedMs/1000).toFixed(1)+' วินาที';row.append(title,answer,meta);results.prepend(row);status.textContent='ได้คำตอบแล้ว — กรุณาเทียบกับคำตอบที่คุณหมอรับรองในชีท';}catch(err){status.textContent=err.message||'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่';}finally{send.disabled=false;}};</script></html>`, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'` } });
}

export async function POST(req: NextRequest) {
  if (!enabled()) return new Response("Not found", { status: 404 });
  if (req.headers.get("origin") !== new URL(req.url).origin || !req.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "ไม่อนุญาตให้ส่งจากหน้าอื่น" }, { status: 403, headers });
  }
  const started = Date.now();
  let question: unknown;
  try {
    const body = await req.text();
    if (body.length > 6000) throw new Error("large");
    question = JSON.parse(body).question;
  } catch {
    return NextResponse.json({ error: "กรุณาส่งคำถามสั้น ๆ" }, { status: 400, headers });
  }
  if (typeof question !== "string" || !question.trim() || question.length > 1000) {
    return NextResponse.json({ error: "กรุณากรอกคำถามไม่เกิน 1,000 ตัวอักษร" }, { status: 400, headers });
  }
  if (shouldHandoff(question)) return NextResponse.json({ reply: "ขอแอดมินติดต่อกลับนะคะ 🙏", note: "เข้าเงื่อนไขส่งต่อ — การทดสอบนี้ไม่ได้แจ้งเจ้าหน้าที่จริง", elapsedMs: Date.now() - started }, { headers });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stage: "sheet" | "ai" = "sheet";
  try {
    const res = await fetch(source, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("sheet");
    const faq = csvToFaqText(await res.text());
    stage = "ai";
    const reply = await Promise.race([
      generateReply(question.trim(), faq),
      new Promise<string>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 8000); }),
    ]);
    return NextResponse.json({ reply, note: reply === DEFAULT_REPLY ? "คำตอบสำรอง — ต้องตรวจสาเหตุก่อนถือว่าผ่าน" : "คำตอบจาก AI · FAQ Auto V2", elapsedMs: Date.now() - started }, { headers });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || error.message === "timeout");
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : undefined;
    console.error(JSON.stringify({ event: "test.failed", stage, timeout, upstreamStatus: status, elapsedMs: Date.now() - started }));
    const detail = stage === "sheet" ? "อ่านข้อมูล FAQ จากชีทไม่สำเร็จ" : timeout ? "AI ใช้เวลาตอบเกินกำหนด" : status === 429 ? "บริการ AI จำกัดการใช้งาน ต้องตรวจโควตา" : status === 401 || status === 403 ? "บริการ AI ปฏิเสธสิทธิ์การเชื่อมต่อ" : "AI สร้างคำตอบไม่สำเร็จ";
    return NextResponse.json({ error: detail + " กรุณาลองใหม่ (ยังไม่ถือว่าทดสอบผ่าน)" }, { status: 502, headers });
  } finally { if (timer) clearTimeout(timer); }
}
