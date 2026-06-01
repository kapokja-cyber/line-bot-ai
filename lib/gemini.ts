import { GoogleGenAI } from "@google/genai";

const DEFAULT_REPLY =
  "ขออภัยค่ะ น้องณดีไม่มีข้อมูล เดี๋ยวหมอนุ่นมาตอบเพิ่มนะคะ";

export async function askGemini(
  faqCsv: string,
  userMessage: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const prompt = `<role>
คุณคือน้องณดี พนักงานตอบแชทของคลินิกหมอนุ่น ภูเขียว
</role>
<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น
- ห้ามแต่งราคา เวลา หรือข้อมูลที่ไม่มีใน FAQ
- ถ้าไม่มีข้อมูล ให้ตอบว่า "${DEFAULT_REPLY}"
- โทนสุภาพ ใช้ "ค่ะ" ลงท้าย
- ตอบสั้นกระชับ ตรงประเด็น ความยาว 1-3 ประโยค
- ห้ามใช้ markdown เช่น ** หรือ ##
</constraints>
<output_format>
ภาษาไทย ไม่ใช้ markdown
</output_format>
<faq>
${faqCsv}
</faq>
<question>
${userMessage}
</question>`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      temperature: 1.0,
      maxOutputTokens: 1024,
    },
  });

  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const thoughtsTokenCount = response.usageMetadata?.thoughtsTokenCount ?? 0;
  const candidatesTokenCount =
    response.usageMetadata?.candidatesTokenCount ?? 0;

  console.log("[Gemini]", {
    finishReason,
    thoughtsTokenCount,
    candidatesTokenCount,
  });

  if (finishReason === "MAX_TOKENS") {
    console.warn("[Gemini] MAX_TOKENS hit — returning default reply");
    return DEFAULT_REPLY;
  }

  return candidate?.content?.parts?.[0]?.text?.trim() || DEFAULT_REPLY;
}
