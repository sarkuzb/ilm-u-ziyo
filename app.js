/* =====================================================================
   SOZLAMALAR — kerak bo'lsa faqat shu yerni o'zgartiring
   ===================================================================== */
const CONFIG = {
  brandName: "Video kurslar",          // ilova nomi (yuqori panelda)
  onelink: "https://onelink.to/gkdygk", // App Store / Play Market yo'naltiruvchi link
  freeSeconds: 80,                      // raqam so'ralgunga qadar umumiy ko'rish vaqti (soniya)
  reminderSeconds: 30,                  // shu vaqtdan keyin ikkinchi namuna dars eslatiladi
  nudgeSeconds: 8,                      // fan tanlanmasa shu vaqtdan keyin "Qaysi fanni tanlaysiz?" chiqadi
  testMode: true,                       // TEST: har refreshda hammasi boshidan. Saytni ishga tushirishdan oldin false qiling!
  // O'zbekiston mobil operator kodlari
  operatorCodes: ["20", "33", "50", "55", "77", "88", "90", "91", "93", "94", "95", "97", "98", "99"],
};

const SUBJECT_ICONS = { matematika: "📐", kimyo: "🧪", biologiya: "🧬" };

/* Test rejimi: raqam hech qayerga yuborilmaydi.
   Keyinchalik Telegram bot / CRM ga ulash uchun faqat shu funksiyani to'ldirasiz. */
function sendLead(lead) {
  console.log("[LEAD]", lead);
}

/* =====================================================================
   Yordamchilar
   ===================================================================== */
const $ = (sel, el = document) => el.querySelector(sel);
const STORE_KEYS = ["watched", "submitted", "leads", "choice", "seen", "reminded"];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  clear() { try { STORE_KEYS.forEach(k => localStorage.removeItem(k)); } catch {} },
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const COURSES = window.COURSES || [];
const findSubject = id => COURSES.find(s => s.id === id);
const findSection = (subj, id) => subj && subj.sections.find(s => s.id === id);
const freeOf = sec => sec.lessons.filter(l => l.video);

/* ?reset — testni qaytadan boshlash (taymer, tanlov, raqam tozalanadi) */
(function handleReset() {
  const p = new URLSearchParams(location.search);
  if (CONFIG.testMode) {
    store.clear();
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }
  if (!p.has("reset")) return;
  store.clear();
  p.delete("reset");
  const q = p.toString();
  history.replaceState(null, "", location.pathname + (q ? "?" + q : ""));
})();

/* =====================================================================
   Holat
   ===================================================================== */
let watched = Number(store.get("watched", 0)) || 0;
let submitted = !!store.get("submitted", false);
let choice = store.get("choice", {}) || {};      // { fan, bolim } — bir marta tanlanadi, o'zgarmaydi
let seen = store.get("seen", []) || [];           // ko'rilgan namuna darslar ("fan/bolim/id")
let reminded = store.get("reminded", []) || [];   // eslatma ko'rsatilgan bo'limlar ("fan/bolim")
let route = { fan: null, bolim: null, dars: null };
let video = null;          // joriy <video>
let lessonWatched = 0;     // joriy darsda ko'rilgan vaqt (eslatma uchun)
let lastTick = null;

if (!findSubject(choice.fan)) choice = {};
if (choice.bolim && !findSection(findSubject(choice.fan), choice.bolim)) delete choice.bolim;

document.getElementById("brandName").textContent = CONFIG.brandName;

/* =====================================================================
   Faqat oldinga: fan → bo'lim → dars.
   Tanlangan fan/bo'lim saqlanadi; "orqaga" tugmasi ham, URL'ni o'zgartirish ham
   tanlovni almashtira olmaydi.
   ===================================================================== */
function parseHash() {
  const [fan, bolim, dars] = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/");
  return { fan, bolim, dars: dars !== undefined && dars !== "" ? Number(dars) : null };
}
function hashOf(r) { return "#" + [r.fan, r.bolim, r.dars].filter(x => x !== null && x !== undefined && x !== "").join("/"); }

/* Har doim tarix yozuvini almashtiramiz (push emas) — orqaga qaytadigan joy qolmaydi */
function navigate(r) {
  history.replaceState(null, "", location.pathname + location.search + hashOf(r));
  render();
}

function chooseSubject(fan) {
  if (choice.fan || !findSubject(fan)) return;
  hideNudge();
  choice = { fan }; store.set("choice", choice);
  navigate({ fan });
}
function chooseSection(bolim) {
  if (!choice.fan || choice.bolim || !findSection(findSubject(choice.fan), bolim)) return;
  choice.bolim = bolim; store.set("choice", choice);
  navigate({ fan: choice.fan, bolim });
}
function chooseLesson(id) {
  const sec = findSection(findSubject(choice.fan), choice.bolim);
  if (!sec || !sec.lessons.some(l => l.id === id && l.video)) return;
  navigate({ fan: choice.fan, bolim: choice.bolim, dars: id });
}

window.addEventListener("hashchange", render);

function render() {
  const prev = route;
  const want = parseHash();
  // Tanlovga majburan moslash
  const subj = findSubject(choice.fan);
  const sec = findSection(subj, choice.bolim);
  const free = sec ? freeOf(sec) : [];
  route = {
    fan: subj ? choice.fan : null,
    bolim: sec ? choice.bolim : null,
    dars: sec ? (free.some(l => l.id === want.dars) ? want.dars : free[0].id) : null,
  };
  const canonical = hashOf(route);
  if ((location.hash || "#") !== canonical) history.replaceState(null, "", location.pathname + location.search + canonical);

  const step = route.bolim ? 3 : route.fan ? 2 : 1;
  $("#hero").hidden = step !== 1;
  updateStepper(step);

  const view = $("#view");
  if (step === 1) { video = null; view.innerHTML = viewSubjects(); }
  if (step === 2) { video = null; view.innerHTML = viewSections(subj); }
  if (step === 3) { view.innerHTML = viewLessons(subj, sec); mountPlayer(); }

  const sameSection = prev.bolim && prev.bolim === route.bolim;
  if (sameSection) $(".player").scrollIntoView({ behavior: "smooth", block: "start" });
  else window.scrollTo(0, 0);
}

function updateStepper(step) {
  document.querySelectorAll(".step").forEach(btn => {
    const n = Number(btn.dataset.step);
    btn.classList.toggle("is-active", n === step);
    btn.classList.toggle("is-done", n < step);
    btn.disabled = true;  // qadamlar faqat ko'rsatkich, bosib qaytib bo'lmaydi
    btn.setAttribute("aria-current", n === step ? "step" : "false");
  });
}

/* =====================================================================
   Ko'rinishlar
   ===================================================================== */
function viewSubjects() {
  return `
    <div class="view-head">
      <h2>Qaysi fanga tayyorlanyapsiz?</h2>
      <p>O'zingizga kerakli fanni tanlang va namuna darslar bilan tanishing.</p>
    </div>
    <div class="grid">
      ${COURSES.map(s => `
        <button class="card" type="button" data-subject="${s.id}">
          <span class="card-icon" aria-hidden="true">${SUBJECT_ICONS[s.id] || "📘"}</span>
          <span class="card-body">
            <span class="card-title">${esc(s.name)}</span>
            <span class="card-tags">${s.sections.map(x => `<span class="tag">${esc(x.name)}</span>`).join("")}</span>
          </span>
          <span class="card-arrow" aria-hidden="true">›</span>
        </button>`).join("")}
    </div>`;
}

function viewSections(subj) {
  return `
    <div class="view-head">
      <h2>${SUBJECT_ICONS[subj.id] || ""} ${esc(subj.name)}: bo'limni tanlang</h2>
      <p>Har bir bo'limda namuna darslar ochiq. To'liq kurs ilovada.</p>
    </div>
    <div class="grid grid-2">
      ${subj.sections.map(sec => `
        <button class="card" type="button" data-section="${sec.id}">
          <span class="card-body">
            <span class="card-title">${esc(sec.name)}</span>
            <span class="card-tags"><span class="tag tag-free">▶ ${freeOf(sec).length} ta namuna dars</span></span>
          </span>
          <span class="card-arrow" aria-hidden="true">›</span>
        </button>`).join("")}
    </div>`;
}

function viewLessons(subj, sec) {
  const current = sec.lessons.find(l => l.id === route.dars);
  const other = freeOf(sec).find(l => l.id !== current.id);
  return `
    <div class="view-head">
      <h2>${esc(sec.name)}</h2>
      <p>${esc(subj.name)}</p>
    </div>

    <div class="player" data-current="${current.id}">
      <span class="player-badge">Namuna dars</span>
      <video id="video" controls playsinline webkit-playsinline preload="metadata"
             controlslist="nodownload noplaybackrate" disablepictureinpicture
             src="${esc(current.video)}"></video>
      <div class="player-missing" hidden>
        <div>🎬 Video hali joylanmagan
          <code>${esc(current.video)}</code>
        </div>
      </div>
    </div>

    ${other ? `
    <div class="reminder" id="reminder" role="status" hidden>
      <p class="reminder-kicker">Bu bo'limda yana bitta namuna dars bor</p>
      <p class="reminder-title">${esc(other.title)}</p>
      <div class="reminder-actions">
        <button class="btn btn-primary" type="button" data-lesson="${other.id}" data-from-reminder>▶ Ko'rish</button>
        <button class="btn btn-ghost" type="button" data-dismiss-reminder>Kerak emas</button>
      </div>
    </div>` : ""}

    <div class="now">
      <p class="now-kicker">Namuna dars · ${esc(subj.name)} › ${esc(sec.name)}</p>
      <h3 class="now-title">Mavzu: ${esc(current.title)}</h3>
      <p class="now-note">Videoni istalgan joyiga o'tkazib ko'rishingiz mumkin.</p>
    </div>

    <div class="list-head">
      <h3>Bo'limdagi barcha mavzular</h3>
    </div>
    <ul class="lessons">
      ${sec.lessons.map(l => {
        const isFree = !!l.video, isCur = l.id === current.id;
        return `<li><button class="lesson ${isFree ? "is-free" : "is-locked"} ${isCur ? "is-current" : ""}" type="button"
                  ${isFree ? `data-lesson="${l.id}"` : `data-locked="${esc(l.title)}"`}>
            <span class="lesson-ico" aria-hidden="true">${isFree ? "▶" : "🔒"}</span>
            <span class="lesson-title">${esc(l.title)}</span>
            <span class="lesson-tag">${isCur ? "Ko'rilmoqda" : isFree ? "Namuna" : "Ilovada"}</span>
          </button></li>`;
      }).join("")}
    </ul>

    <div class="next-box">
      <h3>To'liq kurs ilovada</h3>
      <p>Bu yerda faqat namuna darslar. Barcha mavzular to'liq holda ilovamizda.</p>
      <button class="btn btn-block btn-lg" type="button" data-cta>To'liq kursni olish</button>
    </div>`;
}

/* Umumiy bosishlar */
document.addEventListener("click", e => {
  const t = e.target;
  const subj = t.closest("[data-subject]");
  if (subj) return chooseSubject(subj.dataset.subject);
  const sec = t.closest("[data-section]");
  if (sec) return chooseSection(sec.dataset.section);
  const lesson = t.closest("[data-lesson]");
  if (lesson) {
    if (lesson.hasAttribute("data-from-reminder")) markReminded();
    return chooseLesson(Number(lesson.dataset.lesson));
  }
  if (t.closest("[data-dismiss-reminder]")) { markReminded(); hideReminder(); return; }
  const locked = t.closest("[data-locked]");
  if (locked) {
    return openLead({
      locked: false,
      title: "Bu dars ilovada mavjud",
      text: `"${locked.dataset.locked}" darsi to'liq kursda. Raqamingizni qoldiring, biz siz bilan bog'lanamiz va ilovaga yo'naltiramiz.`,
      reason: "locked-lesson",
    });
  }
  if (t.closest("[data-cta]")) {
    openLead({
      locked: false,
      title: "To'liq kurs ilovada",
      text: "Raqamingizni qoldiring, biz siz bilan bog'lanamiz va ilovaga yo'naltiramiz.",
      reason: "cta",
    });
  }
});

/* =====================================================================
   Fan tanlash eslatmasi: 8 soniya hech narsa tanlanmasa
   ===================================================================== */
let idleSeconds = 0;
let nudgeShown = false;
let nudgeHideTimer = null;

setInterval(() => {
  if (nudgeShown || choice.fan || document.hidden) return;   // faqat ekran ochiq turgan vaqt sanaladi
  idleSeconds += 0.25;
  if (idleSeconds >= CONFIG.nudgeSeconds) showNudge();
}, 250);

function showNudge() {
  nudgeShown = true;
  const grid = $("#view .grid");
  if (!grid) return;
  grid.classList.add("is-nudge");                              // nur fan tanlanguncha yonib turadi
  grid.scrollIntoView({ behavior: "smooth", block: "center" }); // kartalar ekranda ko'rinsin
  const toast = $("#nudge");
  toast.classList.remove("is-leaving");
  toast.hidden = false;
  nudgeHideTimer = setTimeout(hideNudge, 5000);                 // xabar 5 soniyadan keyin yo'qoladi
}
function hideNudge() {
  clearTimeout(nudgeHideTimer);
  const toast = $("#nudge");
  if (toast.hidden || toast.classList.contains("is-leaving")) return;
  toast.classList.add("is-leaving");
  setTimeout(() => { toast.hidden = true; toast.classList.remove("is-leaving"); }, 300);
}

/* =====================================================================
   Ikkinchi namuna darsni eslatish
   ===================================================================== */
const sectionKey = () => `${route.fan}/${route.bolim}`;
const lessonKey = id => `${sectionKey()}/${id}`;

function markReminded() {
  if (!reminded.includes(sectionKey())) { reminded.push(sectionKey()); store.set("reminded", reminded); }
}
function hideReminder() {
  const r = $("#reminder"); if (r) r.hidden = true;
  document.querySelectorAll(".lesson.is-pulse").forEach(el => el.classList.remove("is-pulse"));
}
function maybeShowReminder() {
  const r = $("#reminder");
  if (!r || !r.hidden || submitted || watched >= CONFIG.freeSeconds) return;
  if (lessonWatched < CONFIG.reminderSeconds || reminded.includes(sectionKey())) return;
  const otherId = r.querySelector("[data-lesson]").dataset.lesson;
  if (seen.includes(lessonKey(otherId))) return;   // ikkinchisi allaqachon ko'rilgan
  r.hidden = false;
  markReminded();   // bir marta ko'rsatiladi
  const li = document.querySelector(`.lesson[data-lesson="${otherId}"]`);
  if (li) li.classList.add("is-pulse");
}

/* =====================================================================
   Video va yashirin taymer
   ===================================================================== */
function mountPlayer() {
  video = $("#video");
  lessonWatched = 0;
  lastTick = null;
  const missing = $(".player-missing");
  video.addEventListener("error", () => { missing.hidden = false; });
  video.addEventListener("play", () => {
    if (!submitted && watched >= CONFIG.freeSeconds) return gate();
    const key = lessonKey(route.dars);
    if (!seen.includes(key)) { seen.push(key); store.set("seen", seen); }
  });
  video.addEventListener("pause", () => { lastTick = null; flush(); });
  video.play().catch(() => {});  // brauzer ruxsat bermasa — foydalanuvchi o'zi bosadi
}

function isPlaying(v) {
  // Faqat haqiqatan o'ynayotgan vaqt sanaladi (to'xtagan / yuklanayotgan vaqt emas)
  return v && !v.paused && !v.ended && v.readyState >= 3;
}

let lastSave = 0;
function flush() { store.set("watched", Math.round(watched * 10) / 10); }

setInterval(() => {
  if (!isPlaying(video) || document.hidden) { lastTick = null; return; }
  const now = performance.now();
  if (lastTick !== null) {
    const dt = Math.min((now - lastTick) / 1000, 1);
    lessonWatched += dt;
    if (!submitted) watched += dt;
  }
  lastTick = now;
  maybeShowReminder();
  if (submitted) return;
  if (now - lastSave > 2000) { flush(); lastSave = now; }
  if (watched >= CONFIG.freeSeconds) gate();
}, 250);

function gate() {
  flush();
  hideReminder();
  if (video) {
    video.pause();
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
      if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen();  // iPhone
    } catch {}
  }
  openLead({
    locked: true,
    title: "Darsni davom ettirish uchun raqamingizni qoldiring",
    text: "To'liq dars va butun kurs ilovamizda. Raqamingizni qoldiring, biz siz bilan bog'lanamiz va ilovaga yo'naltiramiz.",
    reason: "timer",
  });
}

/* =====================================================================
   Raqam qoldirish oynasi
   ===================================================================== */
const modal = $("#leadModal");
const phone = $("#phone");
const phoneErr = $("#phoneError");
const field = phone.closest(".field");
let leadReason = "timer";

function openLead({ locked, title, text, reason }) {
  if (submitted) { location.href = CONFIG.onelink; return; }
  if (!modal.hidden && modal.classList.contains("is-locked")) return;
  leadReason = reason;
  $("#leadTitle").textContent = title;
  $("#leadText").textContent = text;
  modal.classList.toggle("is-locked", !!locked);
  modal.hidden = false;
  document.body.classList.add("modal-open");
  setError("");
  // iOS'da klaviatura sahifani siljitmasligi uchun biroz kechiktiramiz
  setTimeout(() => phone.focus({ preventScroll: true }), 250);
}
function closeLead() {
  if (modal.classList.contains("is-locked")) return;  // taymer oynasini yopib bo'lmaydi
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}
$("#leadClose").addEventListener("click", closeLead);
$(".modal-backdrop").addEventListener("click", closeLead);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeLead(); });

function digitsOf(value) {
  let d = value.replace(/\D/g, "");
  if (d.length > 9 && d.startsWith("998")) d = d.slice(3);  // +998 bilan yopishtirilsa
  return d.slice(0, 9);
}
function formatPhone(d) {
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return parts.join(" ");
}
function setError(msg) {
  phoneErr.textContent = msg;
  field.classList.toggle("has-error", !!msg);
}
phone.addEventListener("input", () => {
  phone.value = formatPhone(digitsOf(phone.value));
  if (phoneErr.textContent) setError("");
});

$("#leadForm").addEventListener("submit", e => {
  e.preventDefault();
  const d = digitsOf(phone.value);
  if (d.length < 9) return setError("Raqamni to'liq kiriting: 90 123 45 67");
  if (!CONFIG.operatorCodes.includes(d.slice(0, 2))) return setError("Operator kodi noto'g'ri. Masalan: 90, 91, 93, 94, 97, 99...");

  const lead = {
    phone: "+998" + d,
    fan: route.fan, bolim: route.bolim, dars: route.dars,
    sabab: leadReason,
    korilgan_soniya: Math.round(watched),
    vaqt: new Date().toISOString(),
    utm: Object.fromEntries(new URLSearchParams(location.search)),
  };
  sendLead(lead);
  const leads = store.get("leads", []); leads.push(lead); store.set("leads", leads);
  submitted = true; store.set("submitted", true);

  const btn = $("#leadSubmit");
  btn.disabled = true;
  btn.textContent = "Ilovaga yo'naltirilmoqda…";
  // Yo'naltirish shu bosish ichida bajariladi — Instagram brauzeri bloklamasligi uchun
  location.href = CONFIG.onelink;
});

/* Sahifa yopilayotganda ko'rilgan vaqtni saqlab qolamiz */
document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
window.addEventListener("pagehide", flush);

render();
