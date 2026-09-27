import assert from "node:assert/strict";
import test from "node:test";
import { csvToFaqText } from "../lib/sheet.ts";

test("reads Auto V2 answers after the added ID column", () => {
  const text = csvToFaqText(
    "ID,หมวด,คำถาม,คำตอบ,keyword trigger,Tag,ระดับการตอบ\n" +
    "FAQ-1,ทั่วไป,เปิดกี่โมง,ดูเวลาที่ประกาศ,เวลาเปิด,เวลา,AUTO_WITH_CAVEAT"
  );
  assert.match(text, /Q: เปิดกี่โมง\nA: ดูเวลาที่ประกาศ/);
  assert.match(text, /Keywords: เวลาเปิด/);
  assert.match(text, /Response level: AUTO_WITH_CAVEAT/);
  assert.doesNotMatch(text, /A: เปิดกี่โมง/);
});

test("retains support for Sheet3 and optional video links", () => {
  const text = csvToFaqText(
    "หมวด,คำถาม,คำตอบ,keyword trigger,Tag,วิดีโอประกอบ\n" +
    "ทั่วไป,อยู่ไหน,ดูแผนที่,พิกัด,ที่ตั้ง,https://example.com/video"
  );
  assert.match(text, /Q: อยู่ไหน\nA: ดูแผนที่/);
  assert.match(text, /Video: https:\/\/example.com\/video/);
});

test("matches reordered headers with BOM and surrounding whitespace", () => {
  assert.equal(
    csvToFaqText("\uFEFF คำตอบ , หมวด ,คำถาม\r\nคำตอบจริง,ทั่วไป,คำถามจริง"),
    "Category: ทั่วไป\nQ: คำถามจริง\nA: คำตอบจริง"
  );
});

test("preserves quoted commas, quotes and multiline answers", () => {
  assert.equal(
    csvToFaqText('คำถาม,คำตอบ\r\n"ถาม,เพิ่ม","บรรทัดแรก\nบรรทัดสอง ""ข้อความ"""\r\n'),
    'Q: ถาม,เพิ่ม\nA: บรรทัดแรก\nบรรทัดสอง "ข้อความ"'
  );
});

test("rejects wrong exports and sheets with no valid answers", () => {
  for (const csv of ["", "<html>Sign in</html>", "ID,หมวด\n1,ทั่วไป"]) {
    assert.throws(() => csvToFaqText(csv), /faq_missing_question_or_answer_header/);
  }
  assert.throws(() => csvToFaqText("คำถาม,คำตอบ\nคำถาม,"), /faq_no_valid_entries/);
});

test("skips incomplete rows without shifting other answers", () => {
  assert.equal(
    csvToFaqText("คำถาม,คำตอบ\nไม่ครบ,\n,ไม่ครบ\nครบ,คำตอบครบ"),
    "Q: ครบ\nA: คำตอบครบ"
  );
});
