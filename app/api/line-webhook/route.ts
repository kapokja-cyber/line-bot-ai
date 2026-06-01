import { NextRequest, NextResponse } from "next/server";
import { validateSignature, messagingApi } from "@line/bot-sdk";
import { fetchFAQ } from "@/lib/sheet";
import { generateReply, DEFAULT_REPLY } from "@/lib/gemini";
import { shouldHandoff, notifyAdmin } from "@/lib/handoff";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 30;

function getLineClient() {
  return new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  });
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
      const message = event.message as Record<string, unknown>;
      if (message?.type !== "text") return;

      // ตอบเฉพาะแชทส่วนตัว (1:1)
      const source = event.source as Record<string, unknown>;
      if (source?.type !== "user") return;

      const userMessage = message.text as string;
      const replyToken = event.replyToken as string;
      const userId = (source.userId as string) || "unknown";
      const startTime = Date.now();

      try {
        // 2. Smart Handoff — check ก่อน call Gemini
        if (shouldHandoff(userMessage)) {
          await notifyAdmin(userId, userMessage);
          await replyWithRetry(client, replyToken, "ขอแอดมินติดต่อกลับนะคะ 🙏");
          log.info("handoff.routed", { userId, latencyMs: Date.now() - startTime });
          return;
        }

        // 3. Fetch FAQ (cached 60 นาที)
        const faqText = await fetchFAQ();

        // 4. Call Gemini with 8s timeout
        const reply = await Promise.race([
          generateReply(userMessage, faqText),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("gemini_timeout")), 8000)
          ),
        ]).catch((err) => {
          log.error("gemini.failed", { err: (err as Error).message });
          return DEFAULT_REPLY;
        });

        // 5. Reply LINE
        await replyWithRetry(client, replyToken, reply);

        log.info("reply.sent", {
          userId,
          latencyMs: Date.now() - startTime,
          replyLength: reply.length,
        });
      } catch (err) {
        log.error("webhook.error", { err: (err as Error).message, userId });
        try {
          await client.replyMessage({
            replyToken,
            messages: [{ type: "text", text: DEFAULT_REPLY }],
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
