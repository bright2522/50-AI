// app.js — ตรรกะของหน้าเว็บ 50-AI
// ใช้ window.PERSONAS จาก personas.js

const personas = window.PERSONAS || [];
const groups = [...new Set(personas.map((p) => p.group))];

// ---------- Gallery ----------
const grid = document.getElementById("grid");
const filtersEl = document.getElementById("filters");

function renderGrid(filter) {
  grid.innerHTML = "";
  const list = filter ? personas.filter((p) => p.group === filter) : personas;
  for (const p of list) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="emoji">${p.emoji}</div>
      <div class="group-tag">${p.group}</div>
      <h3>${p.name}</h3>
      <p class="cond">${p.condition}</p>
      <div class="focus">${p.focus.map((f) => `<span>${f}</span>`).join("")}</div>
    `;
    grid.appendChild(card);
  }
}

function renderFilters() {
  const allBtn = document.createElement("button");
  allBtn.className = "filter-btn active";
  allBtn.textContent = `ทั้งหมด (${personas.length})`;
  allBtn.onclick = () => setActive(allBtn, null);
  filtersEl.appendChild(allBtn);

  for (const g of groups) {
    const count = personas.filter((p) => p.group === g).length;
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    btn.textContent = `${g} (${count})`;
    btn.onclick = () => setActive(btn, g);
    filtersEl.appendChild(btn);
  }
}

function setActive(btn, group) {
  document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderGrid(group);
}

renderFilters();
renderGrid(null);

// ---------- Persona picker (demo section) ----------
const picker = document.getElementById("personaPicker");
const defaultPicked = [8, 6, 22, 11, 24, 43]; // ตัวอย่างที่คละกันดี: ตาบอด, ผู้สูงอายุ, เบาหวาน, หูหนวก, มะเร็ง, กะดึก
for (const p of personas) {
  const label = document.createElement("label");
  label.innerHTML = `<input type="checkbox" value="${p.id}" ${defaultPicked.includes(p.id) ? "checked" : ""}/> ${p.emoji} ${p.name}`;
  picker.appendChild(label);
}

// ---------- Demo run (calls Anthropic API directly from the browser with the user's own key) ----------
const runBtn = document.getElementById("runBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

function buildPersonaPrompt(persona, url, content) {
  return `คุณคือ "${persona.name}" (${persona.condition})
สิ่งที่คุณให้ความสำคัญเป็นพิเศษเวลาทดลองใช้เว็บ/แอป: ${persona.focus.join(", ")}
บุคลิกของคุณ: ${persona.voice}

คุณกำลังทดลองเข้าใช้งานเว็บไซต์: ${url || "(ไม่ระบุลิงก์)"}
เนื้อหา/บริบทของหน้านั้นที่ผู้ทดสอบสรุปมาให้: """${content}"""

จงเขียน feedback สั้นๆ (3-5 ประโยค) ในน้ำเสียงของ "${persona.name}" เอง ว่าใช้งานแล้วรู้สึกอย่างไร
เจอปัญหาอะไรที่กระทบกับสภาพร่างกาย/สถานการณ์ของตัวเอง และให้คะแนนความใช้งานง่าย (1-5)
ตอบเป็นภาษาไทยเท่านั้น ลงท้ายด้วยบรรทัด "คะแนน: X/5"`;
}

async function callClaude(apiKey, prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 350,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? "(ไม่มีข้อความตอบกลับ)";
}

runBtn.addEventListener("click", async () => {
  const apiKey = document.getElementById("apiKey").value.trim();
  const url = document.getElementById("url").value.trim();
  const content = document.getElementById("content").value.trim();
  const checked = [...picker.querySelectorAll("input:checked")].map((i) => Number(i.value));

  if (!apiKey) return (statusEl.textContent = "กรุณาใส่ Anthropic API key ก่อน");
  if (!content) return (statusEl.textContent = "กรุณาใส่เนื้อหา/บริบทของหน้าเว็บก่อน");
  if (checked.length === 0) return (statusEl.textContent = "กรุณาเลือกอย่างน้อย 1 บุคลิก");

  runBtn.disabled = true;
  resultsEl.innerHTML = "";
  const selected = personas.filter((p) => checked.includes(p.id));

  for (const persona of selected) {
    statusEl.textContent = `กำลังให้ ${persona.name} ทดสอบ... (${selected.indexOf(persona) + 1}/${selected.length})`;
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `<h4>${persona.emoji} ${persona.name} — ${persona.condition}</h4><p>กำลังคิด...</p>`;
    resultsEl.appendChild(card);
    try {
      const feedback = await callClaude(apiKey, buildPersonaPrompt(persona, url, content));
      card.querySelector("p").textContent = feedback;
    } catch (err) {
      card.querySelector("p").textContent = `เกิดข้อผิดพลาด: ${err.message}`;
    }
  }
  statusEl.textContent = `เสร็จสิ้น (${selected.length} บุคลิก)`;
  runBtn.disabled = false;
});

clearBtn.addEventListener("click", () => {
  resultsEl.innerHTML = "";
  statusEl.textContent = "";
});

// ---------- Code showcase tabs ----------
const codeContent = document.getElementById("codeContent");
const tabButtons = document.querySelectorAll(".tab-btn");
const copyBtn = document.getElementById("copyBtn");

const fileMap = {
  engine: "engine/persona-review.mjs",
  pkg: "engine/package.json",
  personas: "personas.json",
};

async function loadTab(tab) {
  codeContent.textContent = "กำลังโหลดโค้ด...";
  try {
    const res = await fetch(fileMap[tab]);
    if (!res.ok) throw new Error("โหลดไฟล์ไม่สำเร็จ");
    codeContent.textContent = await res.text();
  } catch (err) {
    codeContent.textContent =
      `ไม่สามารถโหลดไฟล์ ${fileMap[tab]} ได้โดยตรง (${err.message})\n\n` +
      `หากเปิดไฟล์นี้แบบ local (file://) เบราว์เซอร์จะบล็อกการโหลดไฟล์ข้าม ๆ กัน\n` +
      `กรุณาเปิดผ่านเว็บเซิร์ฟเวอร์ (เช่น GitHub Pages หรือ 'npx serve') หรือดูไฟล์ต้นฉบับได้ที่ ${fileMap[tab]} ใน repo นี้โดยตรง`;
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    loadTab(btn.dataset.tab);
  });
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(codeContent.textContent);
  copyBtn.textContent = "คัดลอกแล้ว ✓";
  setTimeout(() => (copyBtn.textContent = "คัดลอกโค้ด"), 1500);
});

loadTab("engine");
