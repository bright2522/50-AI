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

// ค่ายที่รู้จัก: ค่ายส่วนใหญ่รับรูปแบบเดียวกับ OpenAI (chat/completions) ยกเว้น Claude
const PROVIDERS = {
  anthropic: { name: "Claude", url: "https://api.anthropic.com/v1/messages", model: "claude-sonnet-4-5-20250929" },
  openai: { name: "OpenAI", url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  gemini: { name: "Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-2.0-flash" },
  openrouter: { name: "OpenRouter", url: "https://openrouter.ai/api/v1/chat/completions", model: "openai/gpt-4o-mini" },
  groq: { name: "Groq", url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
  deepseek: { name: "DeepSeek", url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
};

// เดาค่ายจากหน้าตาของ key (ถ้าเดาไม่ได้ให้เลือกเอง)
function detectProvider(key) {
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("gsk_")) return "groq";
  if (key.startsWith("AIza")) return "gemini";
  if (key.startsWith("sk-")) return "openai";
  return null;
}

// สรุปว่าจะเรียกที่ไหน ด้วยโมเดลอะไร (คืน null ถ้าข้อมูลยังไม่พอ)
function resolveTarget(apiKey) {
  const choice = $("provider").value;
  if (choice === "custom") {
    const url = $("baseUrl").value.trim();
    const model = $("modelName").value.trim();
    return url && model ? { name: "ค่ายที่ระบุ", url, model, anthropic: false } : null;
  }
  const id = choice === "auto" ? detectProvider(apiKey) : choice;
  const p = PROVIDERS[id];
  return p ? { ...p, anthropic: id === "anthropic" } : null;
}

async function callModel(apiKey, prompt, target) {
  let res, pick;
  if (target.anthropic) {
    res = await fetch(target.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model: target.model, max_tokens: 350, messages: [{ role: "user", content: prompt }] }),
    });
    pick = (d) => d.content?.[0]?.text;
  } else {
    const headers = { "content-type": "application/json" };
    if (apiKey) headers.authorization = "Bearer " + apiKey;
    res = await fetch(target.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: target.model, max_tokens: 350, messages: [{ role: "user", content: prompt }] }),
    });
    pick = (d) => d.choices?.[0]?.message?.content;
  }
  if (!res.ok) {
    const err = new Error(`${res.status}: ${(await res.text()).slice(0, 160)}`);
    err.status = res.status;
    throw err;
  }
  return pick(await res.json()) ?? "(ไม่มีข้อความตอบกลับ)";
}

// แสดงช่องกรอกเพิ่มเมื่อเลือก "ค่ายอื่น"
$("provider").onchange = () => {
  const custom = $("provider").value === "custom";
  $("customBox").hidden = !custom;
  const p = PROVIDERS[$("provider").value];
  $("providerHint").textContent = custom
    ? "ใส่ URL แบบ .../chat/completions และชื่อโมเดล ถ้าเป็นโมเดลในเครื่อง (เช่น Ollama) เว้นช่อง key ว่างได้"
    : p ? `จะเรียก ${p.name} ด้วยโมเดล ${p.model}`
    : "ใช้ได้กับค่ายที่รับรูปแบบเดียวกับ OpenAI เกือบทุกค่าย key ใช้ในเบราว์เซอร์นี้เท่านั้น ไม่ถูกเก็บ และส่งไปที่ค่ายที่เลือกเท่านั้น";
};

$("runBtn").onclick = async () => {
  const apiKey = $("apiKey").value.trim();
  const url = $("url").value.trim();
  const content = $("content").value.trim();
  const status = $("status");
  if (selected.size === 0) return (status.textContent = "กรุณาเลือกอย่างน้อย 1 คนก่อนนะ");
  if (!content) return (status.textContent = "ช่วยเล่าหน่อยว่าหน้าเว็บที่จะทดสอบเป็นยังไง");
  const custom = $("provider").value === "custom";
  if (!apiKey && !custom) return (status.textContent = "ใส่ API key ก่อนนะ");
  const target = resolveTarget(apiKey);
  if (!target) {
    return (status.textContent = custom
      ? "ใส่ URL และชื่อโมเดลของค่ายที่ใช้ให้ครบก่อนนะ"
      : "เดาค่ายจาก key นี้ไม่ได้ ช่วยเลือกค่าย AI จากรายการด้านบนหน่อย");
  }

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
      const text = await callModel(apiKey, buildPrompt(p, url, content), target);
      const m = text.match(/คะแนน:\s*(\d)/);
      if (m) card.querySelector(".score").textContent = `${m[1]}/5`;
      card.querySelector("p").textContent = text.replace(/\n*คะแนน:.*$/s, "").trim();
    } catch (e) {
      const friendly = {
        401: "key ไม่ถูกต้อง ลองเช็คว่าคัดลอกครบ และเลือกค่ายให้ตรงกับ key",
        403: "key นี้ไม่มีสิทธิ์ใช้งาน ลองเช็คสิทธิ์หรือยอดเงินในบัญชี",
        429: "ใช้ถี่เกินหรือโควตาหมด รอสักครู่หรือเช็คยอดเงินในบัญชี",
      }[e.status];
      if (friendly && e.status !== 429) {
        card.remove();
        status.textContent = friendly;
        $("runBtn").disabled = false;
        return; // key ผิด ไม่ต้องลองต่อกับคนอื่น
      }
      card.querySelector("p").textContent = `มีปัญหา: ${friendly || e.message}`;
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
