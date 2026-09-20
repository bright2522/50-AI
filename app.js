// app.js — ตรรกะหน้าเว็บ 50-AI (ใช้ window.PERSONAS จาก personas.js)
const personas = window.PERSONAS || [];
const $ = (id) => document.getElementById(id);
const selected = new Set([8, 6, 22, 11, 24, 43]); // ตัวอย่างเริ่มต้น: ตาบอด ผู้สูงอายุ เบาหวาน หูหนวก มะเร็ง กะดึก
let activeGroup = null;

// ---------- theme ----------
try {
  const saved = localStorage.getItem("theme");
  if (saved) document.documentElement.dataset.theme = saved;
} catch {}
$("themeBtn").onclick = () => {
  const cur = document.documentElement.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch {}
};

// ---------- personas ----------
function renderFilters() {
  const groups = [...new Set(personas.map((p) => p.group))];
  const box = $("filters");
  box.innerHTML = "";
  [null, ...groups].forEach((g) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.setAttribute("aria-pressed", String(g === activeGroup));
    b.textContent = g ?? `ทั้งหมด ${personas.length}`;
    b.onclick = () => { activeGroup = g; renderFilters(); renderGrid(); };
    box.appendChild(b);
  });
}

function renderGrid() {
  const grid = $("grid");
  grid.innerHTML = "";
  personas.filter((p) => !activeGroup || p.group === activeGroup).forEach((p) => {
    const c = document.createElement("button");
    c.className = "card";
    c.setAttribute("aria-pressed", String(selected.has(p.id)));
    c.innerHTML = `<span class="tick">✓</span><div class="emoji">${p.emoji}</div><h3>${p.name}</h3><p>${p.condition}</p><span class="tag">${p.group}</span>`;
    c.onclick = () => {
      selected.has(p.id) ? selected.delete(p.id) : selected.add(p.id);
      c.setAttribute("aria-pressed", String(selected.has(p.id)));
      updateSelection();
    };
    grid.appendChild(c);
  });
}

function updateSelection() {
  $("selCount").textContent = selected.size;
  const list = personas.filter((p) => selected.has(p.id));
  $("picked").innerHTML = list.length
    ? list.map((p) => `<span>${p.emoji} ${p.name}</span>`).join("")
    : `<span style="background:none;color:var(--muted)">ยังไม่ได้เลือก — กลับไปเลือกด้านบน</span>`;
}

$("randomBtn").onclick = () => {
  selected.clear();
  [...personas].sort(() => Math.random() - 0.5).slice(0, 6).forEach((p) => selected.add(p.id));
  renderGrid(); updateSelection();
};
$("clearSel").onclick = () => { selected.clear(); renderGrid(); updateSelection(); };

renderFilters(); renderGrid(); updateSelection();

// ---------- run ----------
function buildPrompt(p, url, content) {
  return `คุณคือ "${p.name}" (${p.condition})
สิ่งที่คุณให้ความสำคัญเป็นพิเศษเวลาทดลองใช้เว็บ/แอป: ${p.focus.join(", ")}
บุคลิกของคุณ: ${p.voice}

คุณกำลังทดลองเข้าใช้งานเว็บไซต์: ${url || "(ไม่ระบุลิงก์)"}
เนื้อหา/บริบทของหน้านั้นที่ผู้ทดสอบสรุปมาให้: """${content}"""

จงเขียน feedback สั้นๆ (3-5 ประโยค) ในน้ำเสียงของ "${p.name}" เอง ว่าใช้งานแล้วรู้สึกอย่างไร
เจอปัญหาอะไรที่กระทบกับสภาพร่างกาย/สถานการณ์/ความเชี่ยวชาญของตัวเอง และให้คะแนนความใช้งานง่าย (1-5)
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
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? "(ไม่มีข้อความตอบกลับ)";
}

$("runBtn").onclick = async () => {
  const apiKey = $("apiKey").value.trim();
  const url = $("url").value.trim();
  const content = $("content").value.trim();
  const status = $("status");
  if (selected.size === 0) return (status.textContent = "กรุณาเลือกผู้ทดสอบอย่างน้อย 1 ตัว");
  if (!content) return (status.textContent = "กรุณาอธิบายหน้าเว็บที่จะทดสอบ");
  if (!apiKey) return (status.textContent = "กรุณาใส่ API key");

  const list = personas.filter((p) => selected.has(p.id));
  const results = $("results");
  results.innerHTML = "";
  $("runBtn").disabled = true;

  for (const [i, p] of list.entries()) {
    status.textContent = `กำลังทดสอบ ${i + 1}/${list.length}: ${p.name}`;
    const card = document.createElement("article");
    card.className = "res";
    card.innerHTML = `<header><h4>${p.emoji} ${p.name}</h4><span class="score"></span></header><p>กำลังคิด...</p>`;
    results.appendChild(card);
    try {
      const text = await callClaude(apiKey, buildPrompt(p, url, content));
      const m = text.match(/คะแนน:\s*(\d)/);
      if (m) card.querySelector(".score").textContent = `${m[1]}/5`;
      card.querySelector("p").textContent = text.replace(/\n*คะแนน:.*$/s, "").trim();
    } catch (e) {
      card.querySelector("p").textContent = `เกิดข้อผิดพลาด: ${e.message}`;
    }
  }
  status.textContent = `เสร็จแล้ว ${list.length} ตัว`;
  $("runBtn").disabled = false;
};

// ---------- code tabs ----------
const files = { engine: "engine/persona-review.mjs", pkg: "engine/package.json", personas: "personas.json" };
const codeEl = $("codeContent");

async function loadTab(tab) {
  document.querySelectorAll(".tabs .chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === tab)));
  codeEl.textContent = "กำลังโหลด...";
  try {
    const r = await fetch(files[tab]);
    if (!r.ok) throw new Error(r.status);
    codeEl.textContent = await r.text();
  } catch {
    codeEl.textContent = `โหลด ${files[tab]} ไม่ได้ — กรุณาเปิดผ่านเว็บเซิร์ฟเวอร์ (เช่น npx serve .) แทนการเปิดไฟล์ตรงๆ`;
  }
}
document.querySelectorAll(".tabs .chip").forEach((b) => (b.onclick = () => loadTab(b.dataset.tab)));

$("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(codeEl.textContent);
    $("copyBtn").textContent = "คัดลอกแล้ว ✓";
  } catch { $("copyBtn").textContent = "คัดลอกไม่สำเร็จ"; }
  setTimeout(() => ($("copyBtn").textContent = "คัดลอก"), 1500);
};
loadTab("engine");
