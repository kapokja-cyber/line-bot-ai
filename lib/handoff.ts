import { messagingApi } from "@line/bot-sdk";
import { setFlag, hasFlag, clearFlag } from "@/lib/store";
import { log } from "@/lib/log";

// คำที่ผู้ปกครองพิมพ์แล้วส่งต่อเจ้าหน้าที่ทันที (ไม่ต้องผ่าน Gemini)
const HANDOFF_TRIGGERS = [
  "คุยกับคน",
  "คุยกับเจ้าหน้าที่",
  "ขอคุยกับเจ้าหน้าที่",
  "ขอแอดมิน",
  "คุยกับแอดมิน",
  "ขอหมอ",
  "คุยกับหมอ",
  "ขอคุยกับหมอ",
  "ปรึกษาหมอ",
  "ร้องเรียน",
  "ไม่พอใจ",
  "เลื่อนนัด",
  "ยกเลิกนัด",
];

// คำที่ผู้ปกครองพิมพ์เพื่อกลับมาคุยกับ bot ก่อนหมดเวลาพัก
const RESUME_TRIGGERS = ["คุยกับน้องณดี", "คุยกับบอท", "คุยกับbot"];

// bot เงียบกี่นาทีหลังส่งต่อเจ้าหน้าที่ (ตั้งใน Vercel ได้ · default 180 นาที)
const PAUSE_MINUTES = Number(process.env.HANDOFF_PAUSE_MINUTES) || 180;

export const HANDOFF_REPLY =
  "น้องณดีส่งเรื่องให้หมอนุ่นและเจ้าหน้าที่แล้วนะคะ 🙏 รอสักครู่ เดี๋ยวติดต่อกลับค่ะ ถ้ารีบหรือเรื่องนัดหมาย โทร 092-165-8976 ได้เลยค่ะ (ถ้าอยากคุยกับน้องณดีต่อ พิมพ์ \"คุยกับน้องณดี\" ได้เลยค่ะ)";

export const RESUME_REPLY = "น้องณดีกลับมาแล้วค่ะ 😊 สอบถามได้เลยนะคะ";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

export function shouldHandoff(message: string): boolean {
  const m = normalize(message);
  return HANDOFF_TRIGGERS.some((t) => m.includes(normalize(t)));
}

export function wantsResume(message: string): boolean {
  const m = normalize(message);
  return RESUME_TRIGGERS.some((t) => m.includes(normalize(t)));
}

const pauseKey = (userId: string) => `handoff:paused:${userId}`;

export async function isPaused(userId: string): Promise<boolean> {
  return hasFlag(pauseKey(userId));
}

export async function resume(userId: string): Promise<void> {
  await clearFlag(pauseKey(userId));
}

/** แจ้งกลุ่มแอดมิน + ให้ bot เงียบกับ user คนนี้ PAUSE_MINUTES นาที */
export async function startHandoff(userId: string, reason: string): Promise<void> {
  await setFlag(pauseKey(userId), PAUSE_MINUTES * 60);
  await notifyAdmin(userId, reason);
  log.info("handoff.started", { userId, pauseMinutes: PAUSE_MINUTES });
}

export async function notifyAdmin(userId: string, reason: string) {
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  if (!adminGroupId) {
    log.warn("handoff.no_admin_group");
    return;
  }

  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  });

  try {
    await client.pushMessage({
      to: adminGroupId,
      messages: [
        {
          type: "text",
          text: `🔔 ผู้ปกครองรอเจ้าหน้าที่ตอบ\n\nเรื่อง: ${reason}\nUserID: ${userId}\n\nน้องณดีจะเงียบกับคนนี้ ${PAUSE_MINUTES} นาที\nไปตอบที่: https://manager.line.biz/chats`,
        },
      ],
    });
  } catch (err) {
    log.error("handoff.notify_failed", { err: (err as Error).message });
  }
}
