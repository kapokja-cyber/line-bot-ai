# PRD · LINE Bot น้องณดี — คลินิกหมอนุ่น ภูเขียว

## Goal

คลินิกหมอนุ่น ภูเขียว อยากตอบลูกค้า LINE OA 24 ชม. โดยไม่ต้องจ้างแอดมินกะดึก ·
บอท AI ตอบเองด้วย FAQ ที่เจ้าของแก้ใน Google Sheet ได้ทันที

## Users

- **ผู้ปกครอง/ผู้ป่วย** — ทักเข้า LINE OA · ถามเรื่องเวลาเปิด ค่าตรวจ วัคซีน นัดหมาย
- **หมอนุ่น** — แก้ Google Sheet จากมือถือเมื่อมีข้อมูลใหม่
- **Admin** (optional) — ตอบเอง เมื่อ AI ไม่รู้ + Smart Handoff routing เข้ากลุ่ม

## Acceptance criteria

1. ลูกค้าทักข้อความ → บอทตอบภายใน 5 วินาที (ภาษาธรรมชาติ ตรง FAQ)
2. ลูกค้าถามเรื่องไม่อยู่ใน FAQ → บอทตอบ default reply (ไม่แต่งข้อมูล)
3. ลูกค้าถามด้วย paraphrase/synonym → บอทเข้าใจและตอบจาก FAQ
4. Sheet ดึงไม่ได้ชั่วคราว → บอท fallback ตอบ default · ไม่ crash
5. Gemini timeout → บอท fallback ตอบ default · ไม่ทำให้ลูกค้ารอนาน
6. ข้อความในกลุ่ม LINE → บอทไม่ตอบ (1:1 เท่านั้น)

## Non-goals

- ❌ Multi-LINE OA — 1 channel/bot ก่อน
- ❌ Voice input — text only
- ❌ Order/appointment checkout — ใช้ Smart Handoff แทน
- ❌ Multi-language — ไทยอย่างเดียว
