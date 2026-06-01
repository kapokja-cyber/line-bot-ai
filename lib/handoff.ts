import { messagingApi } from "@line/bot-sdk";

const HANDOFF_TRIGGERS = [
  "คุยกับคน",
  "ขอแอดมิน",
  "ขอเจ้าของ",
  "ขอหมอ",
  "ฟ้อง",
  "ร้องเรียน",
  "ไม่พอใจ",
  "ขายส่ง",
  "wholesale",
  "อยากซื้อจำนวน",
  "franchise",
  "ติดต่อสื่อ",
];

export function shouldHandoff(message: string): boolean {
  const lower = message.toLowerCase();
  return HANDOFF_TRIGGERS.some((trigger) => lower.includes(trigger));
}

export async function notifyAdmin(userId: string, userMessage: string) {
  const adminGroupId = process.env.ADMIN_GROUP_ID;
  if (!adminGroupId) {
    console.warn("[handoff] ADMIN_GROUP_ID not set · skipping admin notify");
    return;
  }

  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  });

  await client.pushMessage({
    to: adminGroupId,
    messages: [
      {
        type: "text",
        text: `🔔 ลูกค้าต้องการคุยกับแอดมิน\n\nUserID: ${userId}\nข้อความ: ${userMessage}\n\nไปคุยที่: https://manager.line.biz/chats`,
      },
    ],
  });
}
