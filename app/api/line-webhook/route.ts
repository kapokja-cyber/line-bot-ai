import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import { messagingApi } from "@line/bot-sdk";
import { getFaqCsv } from "@/lib/sheet";
import { askGemini } from "@/lib/gemini";

const DEFAULT_REPLY =
  "ขออภัยค่ะ น้องณดีไม่มีข้อมูล เดี๋ยวหมอนุ่นมาตอบเพิ่มนะคะ";

function verifySignature(body: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET!;
  const hash = crypto
    .createHmac("SHA256", secret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") || "";

  if (!verifySignature(rawBody, signature)) {
    console.warn("[LINE] Invalid signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const events = body.events ?? [];

  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  });

  for (const event of events) {
    if (event.type !== "message" || event.message?.type !== "text") continue;

    const userMessage: string = event.message.text;
    const replyToken: string = event.replyToken;

    let replyText = DEFAULT_REPLY;
    try {
      const faqCsv = await getFaqCsv();
      replyText = await askGemini(faqCsv, userMessage);
    } catch (err) {
      console.error("[Bot] Error generating reply:", err);
      replyText = DEFAULT_REPLY;
    }

    try {
      await client.replyMessage({
        replyToken,
        messages: [{ type: "text", text: replyText }],
      });
    } catch (err) {
      console.error("[LINE] Reply failed:", err);
    }
  }

  return NextResponse.json({ status: "ok" });
}

export async function GET() {
  return NextResponse.json({ status: "LINE Bot น้องณดี is running 🌸" });
}
