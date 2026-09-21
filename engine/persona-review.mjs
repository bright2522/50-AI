// persona-review.mjs
//
// Snap: ผู้ใช้จำลอง 50 แบบ (เด็ก/ผู้สูงอายุ/ผู้พิการ/ผู้ป่วยโรคเรื้อรัง ฯลฯ)
// เข้าไปเปิดเว็บไซต์หรือแอปจริงด้วย Playwright แล้วให้ Claude วิเคราะห์และเขียน
// ความเห็นในมุมมองของแต่ละคน แล้วบันทึกผลเป็นไฟล์ Markdown/JSON
//
// วิธีใช้:
//   1. npm install
//   2. npx playwright install chromium
//   3. ตั้งค่า API key อย่างใดอย่างหนึ่ง (Claude หรือ OpenAI):
//        set ANTHROPIC_API_KEY=sk-ant-...     (Windows)   export ANTHROPIC_API_KEY=sk-ant-...  (macOS/Linux)
//        set OPENAI_API_KEY=sk-...            (Windows)   export OPENAI_API_KEY=sk-...         (macOS/Linux)
//      ค่ายอื่น (Gemini, Groq, OpenRouter, Ollama ฯลฯ): ตั้ง LLM_BASE_URL, LLM_MODEL, LLM_API_KEY
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
เวลาลองใช้เว็บหรือแอป คุณใส่ใจเรื่อง: ${persona.focus.join(", ")}
ลักษณะของคุณ: ${persona.voice}

คุณกำลังลองใช้เว็บ: ${url}
ชื่อหน้า: ${pageData.title}

สิ่งที่ระบบตรวจเจอเบื้องต้น (ใช้ประกอบได้ ไม่ต้องเล่าซ้ำทั้งหมด):
- รูปภาพที่ไม่มี alt text: ${pageData.imagesMissingAlt} รูป
- ปุ่ม/ลิงก์ที่ไม่มีชื่อสำหรับโปรแกรมอ่านหน้าจอ: ${pageData.buttonsWithoutLabel} จุด
- ปุ่มที่มีขนาดเล็กกว่ามาตรฐานการแตะ (44x44px): ${pageData.smallTapTargets} จุด

ข้อความบนหน้าเว็บ (ตัดมาบางส่วน): """${pageData.visibleText.slice(0, 1500)}"""

เขียนความเห็นสั้นๆ 4-6 ประโยค ด้วยน้ำเสียงของ "${persona.name}" เอง เล่าว่าใช้เว็บนี้แล้วรู้สึกยังไง
เจอปัญหาอะไรที่เกี่ยวกับสภาพหรือสถานการณ์ของตัวเอง แล้วให้คะแนนความใช้ง่าย 1-5
ตอบเป็นภาษาไทยที่พูดกันตามปกติ ลงท้ายด้วยบรรทัด "คะแนน: X/5"`;
}

// เลือกค่ายตาม key ที่ตั้งไว้ (ถ้ามีทั้งคู่ใช้ Claude)
function makeModel() {
  if (process.env.ANTHROPIC_API_KEY) {
    const askModel = makeModel();
    return async (prompt) => {
      const m = await client.messages.create({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      });
      return m.content[0].text;
    };
  }
  // ค่ายอื่น: ตั้ง LLM_BASE_URL (.../chat/completions), LLM_MODEL, LLM_API_KEY  (ไม่ตั้ง = ใช้ OpenAI)
  const url = process.env.LLM_BASE_URL || "https://api.openai.com/v1/chat/completions";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const key = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  return async (prompt) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key && { authorization: `Bearer ${key}` }) },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).choices[0].message.content;
  };
}

async function reviewWithPersona(askModel, persona, pageData, url) {
  return askModel(buildPrompt(persona, pageData, url));
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("ใช้งาน: node persona-review.mjs <URL>");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY && !process.env.LLM_BASE_URL) {
    console.error("ตั้งค่า ANTHROPIC_API_KEY, OPENAI_API_KEY หรือ LLM_BASE_URL ก่อนรันนะ");
    process.exit(1);
  }

  const askModel = makeModel();
  const personas = await loadPersonas();

  console.log(`กำลังเปิดเว็บ ${url} ...`);
  const pageData = await capturePage(url);
  console.log(`ตรวจเจอเบื้องต้น: รูปไม่มี alt ${pageData.imagesMissingAlt}, ปุ่มไม่มีชื่อ ${pageData.buttonsWithoutLabel}, ปุ่มเล็กเกินไป ${pageData.smallTapTargets}`);

  const results = [];
  for (const persona of personas) {
    process.stdout.write(`ให้ ${persona.name} ลองใช้... `);
    try {
      const feedback = await reviewWithPersona(askModel, persona, pageData, url);
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
    `# รายงานจาก Snap: ผู้ใช้จำลอง 50 แบบ`,
    `เว็บไซต์: ${url}`,
    `วันที่: ${stamp}`,
    "",
    ...results.map((r) => `## ${r.persona} — ${r.condition}\n\n${r.feedback ?? `(มีปัญหา: ${r.error})`}\n`),
  ].join("\n");
  await fs.writeFile(mdPath, md, "utf-8");

  console.log(`\nบันทึกรายงานไว้ที่:\n- ${jsonPath}\n- ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
