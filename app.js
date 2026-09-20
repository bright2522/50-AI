// app.js — ตรรกะหน้าเว็บ Snap (ใช้ window.PERSONAS จาก personas.js)
const personas = window.PERSONAS || [];
const $ = (id) => document.getElementById(id);
const selected = new Set([8, 6, 22, 11, 24, 43]); // ตัวอย่างเริ่มต้น: ตาบอด ผู้สูงอายุ เบาหวาน หูหนวก มะเร็ง กะดึก
let activeGroup = null;
const groupList = [...new Set(personas.map((p) => p.group))];
const groupColor = (g) => `hsl(${(groupList.indexOf(g) * 47 + 14) % 360} 55% 50%)`;

// ---------- theme ----------
try {
  const saved = localStorage.getItem("theme");
  if (saved) document.documentElement.dataset.theme = saved;
} catch {}
$("themeBtn").onclick = () => {
  const cur = document.documentElement.dataset.theme || "dark";
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
    b.textContent = g ?? `ทั้งหมด (${personas.length})`;
    b.onclick = () => { if (g === activeGroup) return; activeGroup = g; renderFilters(); renderGrid(true); };
    box.appendChild(b);
  });
}

function renderGrid(animate) {
  const grid = $("grid");
  const draw = () => {
    const frag = document.createDocumentFragment();
    personas.filter((p) => !activeGroup || p.group === activeGroup).forEach((p) => {
      const c = document.createElement("button");
      c.className = "card";
      c.dataset.id = p.id;
      c.setAttribute("aria-pressed", String(selected.has(p.id)));
      c.innerHTML = `<span class="tick"></span><h3>${p.name}</h3><p>${p.condition}</p><span class="tag"><i class="dot" style="background:${groupColor(p.group)}"></i>${p.group}</span>`;
      frag.appendChild(c);
    });
    grid.replaceChildren(frag);
  };
  if (!animate) return draw();
  grid.classList.add("swap");
  setTimeout(() => { draw(); setTimeout(() => grid.classList.remove("swap"), 20); }, 160);
}

function animateCard(c, on, delay = 0) {
  c.classList.remove("pop-on", "pop-off");
  void c.offsetWidth; // restart the animation if it is still running
  c.style.animationDelay = delay ? delay + "ms" : "";
  c.classList.add(on ? "pop-on" : "pop-off");
  c.addEventListener("animationend", function done(ev) {
    if (ev.target !== c) return;
    c.classList.remove("pop-on", "pop-off");
    c.style.animationDelay = "";
    c.removeEventListener("animationend", done);
  });
}

function syncCards() {
  let n = 0;
  document.querySelectorAll(".card").forEach((c) => {
    const was = c.getAttribute("aria-pressed") === "true";
    const now = selected.has(Number(c.dataset.id));
    if (was === now) return;
    c.setAttribute("aria-pressed", String(now));
    if (now) animateCard(c, true, n++ * 45); // newly picked cards pop one after another
  });
}

$("grid").addEventListener("click", (e) => {
  const c = e.target.closest(".card");
  if (!c) return;
  const id = Number(c.dataset.id);
  const on = !selected.has(id);
  on ? selected.add(id) : selected.delete(id);
  c.setAttribute("aria-pressed", String(on));
  animateCard(c, on);
  updateSelection();
});

function updateSelection() {
  const n = $("selCount");
  n.textContent = selected.size;
  n.classList.add("bump");
  setTimeout(() => n.classList.remove("bump"), 160);
  const list = personas.filter((p) => selected.has(p.id));
  $("picked").innerHTML = list.length
    ? list.map((p) => `<span>${p.name}</span>`).join("")
    : `<span style="background:none;color:var(--muted)">ยังไม่ได้เลือกใคร กลับไปเลือกด้านบนก่อนนะ</span>`;
}

$("randomBtn").onclick = () => {
  selected.clear();
  [...personas].sort(() => Math.random() - 0.5).slice(0, 6).forEach((p) => selected.add(p.id));
  syncCards(); updateSelection();
};
$("clearSel").onclick = () => { selected.clear(); syncCards(); updateSelection(); };

renderFilters(); renderGrid(); updateSelection();

// ---------- run ----------
function buildPrompt(p, url, content) {
  return `คุณคือ "${p.name}" (${p.condition})
เวลาลองใช้เว็บหรือแอป คุณใส่ใจเรื่อง: ${p.focus.join(", ")}
ลักษณะของคุณ: ${p.voice}

คุณกำลังลองใช้เว็บ: ${url || "(ไม่ได้ระบุลิงก์)"}
รายละเอียดของหน้านั้นที่ผู้ทดสอบเล่าให้ฟัง: """${content}"""

เขียนความเห็นสั้นๆ 3-5 ประโยค ด้วยน้ำเสียงของ "${p.name}" เอง เล่าว่าใช้แล้วรู้สึกยังไง เจอปัญหาอะไรที่เกี่ยวกับสภาพหรือสถานการณ์ของตัวเอง แล้วให้คะแนนความใช้ง่าย 1-5
ตอบเป็นภาษาไทยที่พูดกันตามปกติ ไม่ต้องเป็นทางการ ลงท้ายด้วยบรรทัด "คะแนน: X/5"`;
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
  if (selected.size === 0) return (status.textContent = "กรุณาเลือกอย่างน้อย 1 คนก่อนนะ");
  if (!content) return (status.textContent = "ช่วยเล่าหน่อยว่าหน้าเว็บที่จะทดสอบเป็นยังไง");
  if (!apiKey) return (status.textContent = "ใส่ API key ก่อนนะ");

  const list = personas.filter((p) => selected.has(p.id));
  const results = $("results");
  results.innerHTML = "";
  $("runBtn").disabled = true;

  for (const [i, p] of list.entries()) {
    status.textContent = `กำลังให้ ${p.name} ลองใช้ (${i + 1}/${list.length})`;
    const card = document.createElement("article");
    card.className = "res";
    card.innerHTML = `<header><h4>${p.name}</h4><span class="score"></span></header><p>กำลังลองใช้...</p>`;
    results.appendChild(card);
    try {
      const text = await callClaude(apiKey, buildPrompt(p, url, content));
      const m = text.match(/คะแนน:\s*(\d)/);
      if (m) card.querySelector(".score").textContent = `${m[1]}/5`;
      card.querySelector("p").textContent = text.replace(/\n*คะแนน:.*$/s, "").trim();
    } catch (e) {
      card.querySelector("p").textContent = `มีปัญหา: ${e.message}`;
    }
  }
  status.textContent = `เสร็จแล้ว ทั้ง ${list.length} คน`;
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
    codeEl.textContent = `เปิดไฟล์ ${files[tab]} ไม่ได้ ลองเปิดหน้านี้ผ่านเซิร์ฟเวอร์ เช่น npx serve . แทนการดับเบิลคลิกไฟล์`;
  }
}
document.querySelectorAll(".tabs .chip").forEach((b) => (b.onclick = () => loadTab(b.dataset.tab)));

$("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(codeEl.textContent);
    $("copyBtn").textContent = "คัดลอกแล้ว";
  } catch { $("copyBtn").textContent = "คัดลอกไม่ได้"; }
  setTimeout(() => ($("copyBtn").textContent = "คัดลอก"), 1500);
};
loadTab("engine");

// ---------- gentle reveal on scroll (one observer, runs once per element) ----------
if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".sec-head, .panel, .tabs, .code-wrap, details.howto").forEach((el) => {
    el.classList.add("js-reveal");
    io.observe(el);
  });
}
