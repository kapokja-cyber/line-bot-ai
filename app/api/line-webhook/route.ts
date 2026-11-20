import { NextRequest, NextResponse } from "next/server";
import { validateSignature, messagingApi } from "@line/bot-sdk";
import { fetchFAQ } from "@/lib/sheet";
import { generateReply, readImage, DEFAULT_REPLY, type BotReply } from "@/lib/gemini";
import {
  shouldHandoff,
  wantsResume,
  isPaused,
  resume,
  startHandoff,
  HANDOFF_REPLY,
  RESUME_REPLY,
} from "@/lib/handoff";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 30;

const GEMINI_TIMEOUT_MS = 8000;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 4000;

const ERROR_REPLY = "ขออภัยค่ะ ระบบขัดข้องชั่วคราว รบกวนพิมพ์ใหม่อีกครั้งนะคะ 🙏";

const IMAGE_FAIL_REPLY =
  "น้องณดีอ่านรูปนี้ไม่ได้ค่ะ 🙏 รบกวนพิมพ์ชื่อน้อง วันที่ และเวลานัดมาแทนได้ไหมคะ";

function getLineClient() {
  return new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  });
}

function getBlobClient() {
  return new messagingApi.MessagingApiBlobClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), ms)),
  ]);
}

async function replyWithRetry(
  client: messagingApi.MessagingApiClient,
  replyToken: string,
  text: string,
  attempts = 3
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await client.replyMessage({ replyToken, messages: [{ type: "text", text }] });
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
}

async function downloadImage(messageId: string): Promise<Buffer> {
  const stream = await getBlobClient().getMessageContent(messageId);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** ตรวจชนิดรูปจาก magic bytes (LINE ส่งมาเป็น JPEG เกือบทั้งหมด) */
function detectMime(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return "image/jpeg";
}

const short = (text: string) => (text.length > 200 ? text.slice(0, 200) + "…" : text);

async function handleText(userId: string, text: string): Promise<string | null> {
  // ผู้ปกครองขอกลับมาคุยกับ bot
  if (wantsResume(text)) {
    await resume(userId);
    log.info("handoff.resumed", { userId });
    return RESUME_REPLY;
  }

  // ส่งต่อเจ้าหน้าที่แล้ว → bot เงียบ ไม่ตอบแทรก
  if (await isPaused(userId)) {
    log.info("handoff.paused_skip", { userId, kind: "text" });
    return null;
  }

  // คำขอคุยกับคน → ส่งต่อทันที ไม่ต้องถาม Gemini
  if (shouldHandoff(text)) {
    await startHandoff(userId, short(text));
    return HANDOFF_REPLY;
  }

  const faqText = await fetchFAQ();
  const result: BotReply = await withTimeout(
    generateReply(text, faqText),
    GEMINI_TIMEOUT_MS,
    "gemini"
  ).catch((err) => {
    log.error("gemini.failed", { err: (err as Error).message });
    return { reply: DEFAULT_REPLY, handoff: true };
  });

  if (result.handoff) await startHandoff(userId, short(text));
  return result.reply;
}

async function handleImage(userId: string, messageId: string): Promise<string | null> {
  if (await isPaused(userId)) {
    log.info("handoff.paused_skip", { userId, kind: "image" });
    return null;
  }

  try {
    const image = await withTimeout(downloadImage(messageId), IMAGE_DOWNLOAD_TIMEOUT_MS, "image_download");
    const result = await withTimeout(readImage(image, detectMime(image)), GEMINI_TIMEOUT_MS, "gemini_image");
    log.info("image.read", { userId, kind: result.kind, bytes: image.length });
    if (result.handoff) await startHandoff(userId, "ส่งรูปมา (ไม่ใช่ใบนัด) · เปิดดูรูปใน OA Manager");
    return result.reply;
  } catch (err) {
    log.error("image.failed", { err: (err as Error).message, userId });
    return IMAGE_FAIL_REPLY;
  }
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-line-signature") || "";
  const body = await req.text();

  // 1. Verify signature
  if (!validateSignature(body, process.env.LINE_CHANNEL_SECRET!, signature)) {
    log.warn("webhook.invalid_signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = JSON.parse(body).events ?? [];
  const client = getLineClient();

  await Promise.all(
    events.map(async (event: Record<string, unknown>) => {
      if (event.type !== "message") return;

      // ตอบเฉพาะแชทส่วนตัว (1:1)
      const source = event.source as Record<string, unknown>;
      if (source?.type !== "user") return;

      const message = event.message as Record<string, unknown>;
      const replyToken = event.replyToken as string;
      const userId = (source.userId as string) || "unknown";
      const startTime = Date.now();

      try {
        let reply: string | null = null;
        if (message?.type === "text") {
          reply = await handleText(userId, message.text as string);
        } else if (message?.type === "image") {
          reply = await handleImage(userId, message.id as string);
        } else {
          return; // sticker, video, file ฯลฯ → ไม่ตอบ
        }

        if (!reply) return;
        await replyWithRetry(client, replyToken, reply);

        log.info("reply.sent", {
          userId,
          type: message.type as string,
          latencyMs: Date.now() - startTime,
          replyLength: reply.length,
        });
      } catch (err) {
        log.error("webhook.error", { err: (err as Error).message, userId });
        try {
          await client.replyMessage({
            replyToken,
            messages: [{ type: "text", text: ERROR_REPLY }],
          });
        } catch {
          /* replyToken expired — swallow */
        }
      }
    })
  );

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "LINE Bot น้องณดี is running 🌸" });
}
