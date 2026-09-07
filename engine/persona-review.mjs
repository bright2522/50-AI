// persona-review.mjs
//
// เครื่องมือให้ "AI 50 บุคลิก" (เด็ก/ผู้สูงอายุ/ผู้พิการ/ผู้ป่วยโรคเรื้อรัง ฯลฯ)
// เข้าไปเปิดเว็บไซต์หรือแอปจริงด้วย Playwright แล้วให้ Claude วิเคราะห์และเขียน
// feedback ในมุมมองของแต่ละบุคลิก บันทึกผลเป็นไฟล์ Markdown/JSON
//
// วิธีใช้:
//   1. npm install
//   2. npx playwright install chromium
//   3. ตั้งค่า API key:  set ANTHROPIC_API_KEY=sk-ant-...   (Windows)
//                        export ANTHROPIC_API_KEY=sk-ant-... (macOS/Linux)
//   4. node persona-review.mjs https://example.com
//
// ผลลัพธ์จะถูกบันทึกไว้ที่ ./reports/<โดเมน>-<เวลา>.json และ .md

import { chromium } from "playwright";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODEL = "claude-sonnet-4-5-20250929";

async function loadPersonas() {
  const raw = await fs.readFile(path.join(__dirname, "..", "personas.json"), "utf-8");
  return JSON.parse(raw);
}

// เปิดเว็บไซต์เป้าหมายจริงด้วย Playwright แล้วดึงข้อมูลที่ AI แต่ละบุคลิกต้องใช้ประเมิน
async function capturePage(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // จำลองจอมือถือ
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

  const title = await page.title();
  const visibleText = await page.evaluate(() =>
    document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 6000)
  );
  const imagesMissingAlt = await page.$$eval("img", (imgs) =>
    imgs.filter((img) => !img.alt || img.alt.trim() === "").length
  );
  const buttonsWithoutLabel = await page.$$eval(
    "button, a[role=button], [role=button]",
    (els) =>
      els.filter((el) => !el.innerText.trim() && !el.getAttribute("aria-label")).length
  );
  const smallTapTargets = await page.$$eval("button, a", (els) =>
    els.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.width < 44 || r.height < 44);
    }).length
  );
  const screenshot = await page.screenshot({ fullPage: false });

  await browser.close();

  return { title, visibleText, imagesMissingAlt, buttonsWithoutLabel, smallTapTargets, screenshot };
}

function buildPrompt(persona, pageData, url) {
  return `คุณคือ "${persona.name}" (${persona.condition})
สิ่งที่คุณให้ความสำคัญเป็นพิเศษเวลาทดลองใช้เว็บ/แอป: ${persona.focus.join(", ")}
บุคลิกของคุณ: ${persona.voice}

คุณกำลังทดลองเข้าใช้งานเว็บไซต์: ${url}
ชื่อหน้า: ${pageData.title}

ข้อมูลเชิงเทคนิคที่ตรวจพบอัตโนมัติ (ใช้ประกอบการให้ความเห็น ไม่ต้องท่องซ้ำทั้งหมด):
- รูปภาพที่ไม่มี alt text: ${pageData.imagesMissingAlt} รูป
- ปุ่ม/ลิงก์ที่ไม่มีชื่อสำหรับโปรแกรมอ่านหน้าจอ: ${pageData.buttonsWithoutLabel} จุด
- ปุ่มที่มีขนาดเล็กกว่ามาตรฐานการแตะ (44x44px): ${pageData.smallTapTargets} จุด

เนื้อหาบนหน้าเว็บ (ตัดมาบางส่วน): """${pageData.visibleText.slice(0, 1500)}"""

จงเขียน feedback สั้นๆ (4-6 ประโยค) ในน้ำเสียงของ "${persona.name}" เอง เล่าว่าใช้งานเว็บนี้แล้วรู้สึกอย่างไร
เจอปัญหาอะไรที่กระทบกับสภาพร่างกาย/สถานการณ์ของตัวเอง และให้คะแนนความใช้งานง่าย (1-5)
ตอบเป็นภาษาไทย ลงท้ายด้วยบรรทัด "คะแนน: X/5"`;
}

async function reviewWithPersona(client, persona, pageData, url) {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{ role: "user", content: buildPrompt(persona, pageData, url) }],
  });
  return message.content[0].text;
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("ใช้งาน: node persona-review.mjs <URL>");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("กรุณาตั้งค่า ANTHROPIC_API_KEY ก่อนรัน");
    process.exit(1);
  }

  const client = new Anthropic();
  const personas = await loadPersonas();

  console.log(`กำลังเปิดเว็บไซต์ ${url} ...`);
  const pageData = await capturePage(url);
  console.log(`พบปัญหาเบื้องต้น: alt text ขาด ${pageData.imagesMissingAlt}, ปุ่มไม่มีชื่อ ${pageData.buttonsWithoutLabel}, ปุ่มเล็กเกินไป ${pageData.smallTapTargets}`);

  const results = [];
  for (const persona of personas) {
    process.stdout.write(`ให้ ${persona.name} (${persona.condition}) ทดลองใช้... `);
    try {
      const feedback = await reviewWithPersona(client, persona, pageData, url);
      console.log("เสร็จ");
      results.push({ persona: persona.name, condition: persona.condition, feedback });
    } catch (err) {
      console.log("ล้มเหลว:", err.message);
      results.push({ persona: persona.name, condition: persona.condition, feedback: null, error: err.message });
    }
  }

  const domain = new URL(url).hostname.replace(/\W+/g, "-");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(__dirname, "..", "reports");
  await fs.mkdir(outDir, { recursive: true });

  const jsonPath = path.join(outDir, `${domain}-${stamp}.json`);
  await fs.writeFile(jsonPath, JSON.stringify({ url, capturedAt: stamp, technicalFindings: {
    imagesMissingAlt: pageData.imagesMissingAlt,
    buttonsWithoutLabel: pageData.buttonsWithoutLabel,
    smallTapTargets: pageData.smallTapTargets,
  }, results }, null, 2), "utf-8");

  const mdPath = path.join(outDir, `${domain}-${stamp}.md`);
  const md = [
    `# รายงาน feedback จาก AI 50 บุคลิก`,
    `เว็บไซต์: ${url}`,
    `วันที่: ${stamp}`,
    "",
    ...results.map((r) => `## ${r.persona} — ${r.condition}\n\n${r.feedback ?? `(เกิดข้อผิดพลาด: ${r.error})`}\n`),
  ].join("\n");
  await fs.writeFile(mdPath, md, "utf-8");

  console.log(`\nบันทึกรายงานแล้วที่:\n- ${jsonPath}\n- ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
