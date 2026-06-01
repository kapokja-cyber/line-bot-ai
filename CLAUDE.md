# CLAUDE.md — LINE Bot AI Project

## What we're building

LINE Official Account bot "น้องณดี" for คลินิกหมอนุ่น ภูเขียว · ตอบลูกค้า 24 ชม.
โดยใช้ Gemini 2.5 Flash อ่าน FAQ จาก Google Sheet · ส่ง reply กลับ LINE

## Stack — locked

- Next.js 14 App Router + TypeScript
- `@line/bot-sdk` v9 for LINE Messaging API
- `@google/genai` for Gemini
- Google Sheet CSV public URL for FAQ
- Vercel for hosting (Hobby tier)
- npm

## Repo conventions

- `app/api/line-webhook/route.ts` — POST handler (verify signature → process → reply)
- `lib/sheet.ts` — fetch + parse + cache CSV
- `lib/gemini.ts` — call Gemini with system prompt
- `lib/handoff.ts` — Smart Handoff trigger detection
- `lib/log.ts` — structured logging helper

## Bot identity

- Bot name: น้องณดี
- Business: คลินิกหมอนุ่น ภูเขียว
- Tone: สุภาพ อบอุ่น ใช้ "ค่ะ" ลงท้าย

## Env vars (Vercel)

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `GEMINI_API_KEY`
- `SHEET_CSV_URL`
- `ADMIN_GROUP_ID` (Smart Handoff target · optional)

## Don'ts

- ❌ Hardcode any token/key — use env vars
- ❌ Skip signature verification — security risk
- ❌ Skip timeout on Gemini calls — webhook must reply within 10s
- ❌ Cache FAQ for >60 min — owner edits Sheet should reflect
- ❌ Log full LINE message content — PII risk · log only metadata
- ❌ Reply in group/room — 1:1 only (event.source.type === "user")
