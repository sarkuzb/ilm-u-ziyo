/* =====================================================================
   SOZLAMALAR — kerak bo'lsa faqat shu yerni o'zgartiring
   ===================================================================== */
const CONFIG = {
  brandName: "Ilm-u Ziyo Online",      // ilova nomi (yuqori panelda; "Online" so'zi to'q sariq bo'ladi)
  onelink: "https://onelink.to/gkdygk", // App Store / Play Market yo'naltiruvchi link
  freeSeconds: 60,                      // raqam so'ralgunga qadar umumiy ko'rish vaqti (soniya)
  reminderSeconds: 30,                  // shu vaqtdan keyin ikkinchi namuna dars eslatiladi
  nudgeSeconds: 5,                      // fan tanlanmasa shu vaqtdan keyin "Qaysi fanni tanlaysiz?" chiqadi
  testMode: true,                       // TEST: har refreshda hammasi boshidan. Saytni ishga tushirishdan oldin false qiling!
  // O'zbekiston mobil operator kodlari
  operatorCodes: ["20", "33", "50", "55", "77", "88", "90", "91", "93", "94", "95", "97", "98", "99"],
};

/* Ikonkalar (icons.js ichidagi Lucide nomlari) */
const SUBJECT_ICONS = { matematika: "sigma", kimyo: "flask-conical", biologiya: "dna" };
const SECTION_ICONS = {
  tenglamalar: "equal", progressiya: "trending-up", funksiyalar: "chart-spline",
  gazlar: "wind", eritmalar: "droplets", kinetika: "timer", anorganik: "atom",
  botanika: "leaf", zoologiya: "bird", anatomiya: "heart-pulse", biologiya: "microscope", masalalar: "puzzle",
};
const ICONS = window.ICONS || {};
const icon = (name, cls = "") =>
  `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
/* HTML ichidagi <i data-icon="..."> belgilarini ikonkaga aylantirish */
function hydrateIcons(root = document) {
  root.querySelectorAll("i[data-icon]").forEach(el => { if (!el.firstChild) el.innerHTML = icon(el.dataset.icon); });
}

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
/* Ohista siljish: brauzerning tez "smooth" siljishi o'rniga sekin, yumshoq harakat.
   Foydalanuvchi o'zi barmog'i bilan sursa — darhol to'xtaydi. */
let scrollAnim = null;
const reduceMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
function slowScrollTo(targetY, duration = 1400) {
  cancelSlowScroll();
  const maxY = document.documentElement.scrollHeight - innerHeight;
  const to = Math.max(0, Math.min(targetY, maxY));
  const from = scrollY;
  if (Math.abs(to - from) < 2) return;
  if (reduceMotion()) { scrollTo({ top: to, behavior: "instant" }); return; }
  const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);  // sekin boshlanib, sekin to'xtaydi
  const start = performance.now();
  const step = now => {
    const t = Math.min((now - start) / duration, 1);
    scrollTo({ top: from + (to - from) * ease(t), behavior: "instant" });
    scrollAnim = t < 1 ? requestAnimationFrame(step) : null;
  };
  scrollAnim = requestAnimationFrame(step);
}
function cancelSlowScroll() { if (scrollAnim) { cancelAnimationFrame(scrollAnim); scrollAnim = null; } }
["touchstart", "wheel", "keydown"].forEach(ev => addEventListener(ev, cancelSlowScroll, { passive: true }));
/* Elementni ekranga olib kelish (block: "start" — yuqori panel ostiga, "center" — o'rtaga) */
function slowScrollToEl(el, block = "start", duration) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const header = ($(".topbar")?.offsetHeight || 0) + 12;
  const y = block === "center" ? scrollY + r.top - (innerHeight - r.height) / 2 : scrollY + r.top - header;
  slowScrollTo(y, duration);
}

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

document.getElementById("brandName").innerHTML =
  esc(CONFIG.brandName).replace(/ (Online)$/, ' <span class="brand-sub">$1</span>');
hydrateIcons();

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
  hideIntro();
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
  if (isPlayerFullscreen()) return swapLessonInPlace(sec, id);   // to'liq ekrandan chiqarmasdan almashtiramiz
  navigate({ fan: choice.fan, bolim: choice.bolim, dars: id });
}

/* To'liq ekranda dars almashganda pleyer qayta chizilmaydi — faqat video va yozuvlar yangilanadi */
function swapLessonInPlace(sec, id) {
  const l = sec.lessons.find(x => x.id === id);
  route.dars = id;
  history.replaceState(null, "", location.pathname + location.search + hashOf(route));
  hideReminder();
  $(".player").dataset.current = id;
  $(".player-missing").hidden = true;
  $(".player-missing code").textContent = l.video;
  $(".player-play").hidden = true;
  lessonWatched = 0; lastTick = null;
  video.poster = posterOf(l.video);
  video.src = l.video;
  $(".now-title").textContent = "Mavzu: " + l.title;
  document.querySelectorAll(".lesson.is-free").forEach(b => {
    const cur = Number(b.dataset.lesson) === id;
    b.classList.toggle("is-current", cur);
    b.querySelector(".lesson-tag").textContent = cur ? "Ko'rilmoqda" : "Namuna";
  });
  video.play().catch(() => {});
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
  const sameSection = prev.bolim && prev.bolim === route.bolim;
  if (step === 1) { video = null; view.innerHTML = viewSubjects(); }
  if (step === 2) { video = null; view.innerHTML = viewSections(subj); }
  if (step === 3) { view.innerHTML = viewLessons(subj, sec); mountPlayer(); }
  // Yangi qadamda elementlar ketma-ket ohista paydo bo'ladi (dars almashganda emas)
  if (!sameSection) { view.classList.remove("view-enter"); void view.offsetWidth; view.classList.add("view-enter"); }

  if (sameSection) slowScrollToEl($(".player"), "start", 1100);   // dars almashdi — pleyerga ohista
  else { cancelSlowScroll(); scrollTo({ top: 0, behavior: "instant" }); }  // yangi qadam — boshidan
}

function updateStepper(step) {
  document.querySelectorAll(".step").forEach(btn => {
    const n = Number(btn.dataset.step);
    btn.classList.toggle("is-active", n === step);
    btn.classList.toggle("is-done", n < step);
    btn.querySelector(".step-num").innerHTML = n < step ? icon("check") : String(n);  // o'tilgan qadamda ✓
    btn.disabled = true;  // qadamlar faqat ko'rsatkich, bosib qaytib bo'lmaydi
    btn.setAttribute("aria-current", n === step ? "step" : "false");
  });
}

/* =====================================================================
   Ko'rinishlar
   ===================================================================== */
const posterOf = src => src.replace(/\.(mp4|mov|webm)$/i, ".jpg");   // videoning kadri (videolar kelgach qirqiladi)

function viewSubjects() {
  return `
    <div class="view-head">
      <h2>Qaysi fanga tayyorlanyapsiz?</h2>
      <p>O'zingizga kerakli fanni tanlang va namuna darslar bilan tanishing.</p>
    </div>
    <div class="grid">
      ${COURSES.map(s => `
        <button class="card card-subject" type="button" data-subject="${s.id}">
          <span class="tile" aria-hidden="true">${icon(SUBJECT_ICONS[s.id] || "graduation-cap")}</span>
          <span class="card-body">
            <span class="card-title">${esc(s.name)}</span>
          </span>
          <span class="card-arrow" aria-hidden="true">${icon("chevron-right")}</span>
        </button>`).join("")}
    </div>`;
}

function viewSections(subj) {
  return `
    <div class="view-head">
      <span class="view-kicker"><span class="mini-tile">${icon(SUBJECT_ICONS[subj.id])}</span>${esc(subj.name)}</span>
      <h2>Bo'limni tanlang</h2>
      <p>Har bir bo'limda namuna darslar ochiq. To'liq kurs ilovada.</p>
    </div>
    <div class="grid grid-2">
      ${subj.sections.map(sec => `
        <button class="card" type="button" data-section="${sec.id}">
          <span class="tile tile-soft" aria-hidden="true">${icon(SECTION_ICONS[sec.id] || "circle-play")}</span>
          <span class="card-body">
            <span class="card-title">${esc(sec.name)}</span>
            <span class="card-tags"><span class="tag tag-free">${icon("circle-play")}${freeOf(sec).length} ta namuna dars</span></span>
          </span>
          <span class="card-arrow" aria-hidden="true">${icon("chevron-right")}</span>
        </button>`).join("")}
    </div>`;
}

function viewLessons(subj, sec) {
  const current = sec.lessons.find(l => l.id === route.dars);
  const other = freeOf(sec).find(l => l.id !== current.id);
  return `
    <div class="view-head">
      <span class="view-kicker"><span class="mini-tile">${icon(SUBJECT_ICONS[subj.id])}</span>${esc(subj.name)}</span>
      <h2>${esc(sec.name)}</h2>
    </div>

    <div class="player" data-current="${current.id}">
      <span class="player-badge">${icon("sparkles")}Namuna dars</span>
      <button class="player-fs" type="button" data-fullscreen aria-label="To'liq ekran">
        ${icon("maximize", "fs-enter")}${icon("minimize", "fs-exit")}
      </button>
      ${other ? `
      <div class="player-reminder" role="status" hidden>
        <div class="player-reminder-text">
          <p class="reminder-kicker">Yana bitta namuna dars bor</p>
          <p class="reminder-title">${esc(other.title)}</p>
        </div>
        <button class="btn btn-primary btn-sm" type="button" data-lesson="${other.id}" data-from-reminder>${icon("play")}Ko'rish</button>
        <button class="btn btn-sm player-reminder-no" type="button" data-dismiss-reminder>Kerak emas</button>
      </div>` : ""}
      <video id="video" controls playsinline webkit-playsinline preload="metadata"
             controlslist="nodownload noplaybackrate nofullscreen" disablepictureinpicture
             poster="${esc(posterOf(current.video))}" src="${esc(current.video)}"></video>
      <button class="player-play" type="button" data-play aria-label="Videoni boshlash">
        <span class="player-play-btn">${icon("play")}</span>
      </button>
      <div class="player-missing" hidden>
        <div>${icon("clapperboard")}Video hali joylanmagan
          <code>${esc(current.video)}</code>
        </div>
      </div>
    </div>

    ${other ? `
    <div class="reminder" id="reminder" role="status" hidden>
      <span class="tile reminder-tile" aria-hidden="true">${icon("sparkles")}</span>
      <div class="reminder-main">
        <p class="reminder-kicker">Bu bo'limda yana bitta namuna dars bor</p>
        <p class="reminder-title">${esc(other.title)}</p>
        <div class="reminder-actions">
          <button class="btn btn-primary" type="button" data-lesson="${other.id}" data-from-reminder>${icon("play")}Ko'rish</button>
          <button class="btn btn-ghost" type="button" data-dismiss-reminder>Kerak emas</button>
        </div>
      </div>
    </div>` : ""}

    <div class="now">
      <p class="now-kicker">${icon("circle-play")}Namuna dars · ${esc(subj.name)} › ${esc(sec.name)}</p>
      <h3 class="now-title">Mavzu: ${esc(current.title)}</h3>
      <p class="now-note">${icon("info")}Videoni istalgan joyiga o'tkazib ko'rishingiz mumkin</p>
    </div>

    <div class="list-head">
      <h3>Bo'limdagi barcha mavzular</h3>
    </div>
    <ul class="lessons">
      ${sec.lessons.map(l => {
        const isFree = !!l.video, isCur = l.id === current.id;
        return `<li><button class="lesson ${isFree ? "is-free" : "is-locked"} ${isCur ? "is-current" : ""}" type="button"
                  ${isFree ? `data-lesson="${l.id}"` : `data-locked="${esc(l.title)}"`}>
            <span class="lesson-ico" aria-hidden="true">${icon(isFree ? "play" : "lock")}</span>
            <span class="lesson-title">${esc(l.title)}</span>
            <span class="lesson-tag">${isCur ? "Ko'rilmoqda" : isFree ? "Namuna" : "Ilovada"}</span>
          </button></li>`;
      }).join("")}
    </ul>

    <div class="next-box">
      <span class="next-tile" aria-hidden="true">${icon("smartphone")}</span>
      <h3>To'liq kurs ilovada</h3>
      <p>Bu yerda faqat namuna darslar. Barcha mavzular to'liq holda Ilm-u Ziyo Online ilovasida.</p>
      <button class="btn btn-block btn-lg" type="button" data-cta>${icon("download")}To'liq kursni olish</button>
    </div>`;
}

/* Umumiy bosishlar */
document.addEventListener("click", e => {
  const t = e.target;
  const subj = t.closest("[data-subject]");
  if (subj) return chooseSubject(subj.dataset.subject);
  const sec = t.closest("[data-section]");
  if (sec) return chooseSection(sec.dataset.section);
  if (t.closest("[data-fullscreen]")) return toggleFullscreen();
  if (t.closest("[data-play]")) { if (video) video.play().catch(() => {}); return; }
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

/* Saytga kirganda: "Darslarimiz qanday o'tilishini…" pastdan sakrab chiqadi,
   "Qaysi fanni tanlaysiz?" chiqishidan oldin ohista yo'qoladi */
let introShown = false;
let introHidden = false;

setInterval(() => {
  if (nudgeShown || choice.fan || document.hidden) return;   // faqat ekran ochiq turgan vaqt sanaladi
  idleSeconds += 0.25;
  if (!introShown && idleSeconds >= 0.75) showIntro();
  if (!introHidden && idleSeconds >= CONFIG.nudgeSeconds - 1.5) hideIntro();
  if (idleSeconds >= CONFIG.nudgeSeconds) showNudge();
}, 250);

function showIntro() {
  introShown = true;
  const el = $("#intro");
  el.classList.remove("is-leaving");
  el.hidden = false;
}
function hideIntro() {
  introHidden = true;
  const el = $("#intro");
  if (el.hidden || el.classList.contains("is-leaving")) return;
  el.classList.add("is-leaving");
  setTimeout(() => { el.hidden = true; el.classList.remove("is-leaving"); }, 700);
}

function showNudge() {
  nudgeShown = true;
  hideIntro();
  const grid = $("#view .grid");
  if (!grid) return;
  // 1) avval xabar chiqadi
  const toast = $("#nudge");
  toast.classList.remove("is-leaving");
  toast.hidden = false;
  // 2) odam uni o'qib olgach — kartalarga ohista siljiymiz va nur yonadi
  setTimeout(() => {
    if (choice.fan) return;
    slowScrollToEl(grid, "center", 1800);
    grid.classList.add("is-nudge");                             // nur fan tanlanguncha yonib turadi
  }, 900);
  nudgeHideTimer = setTimeout(hideNudge, 6000);                 // xabar 6 soniyadan keyin yo'qoladi
}
function hideNudge() {
  clearTimeout(nudgeHideTimer);
  const toast = $("#nudge");
  if (toast.hidden || toast.classList.contains("is-leaving")) return;
  toast.classList.add("is-leaving");
  setTimeout(() => { toast.hidden = true; toast.classList.remove("is-leaving"); }, 600);
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
  document.querySelectorAll(".reminder, .player-reminder").forEach(el => { el.hidden = true; });
  document.querySelectorAll(".lesson.is-pulse").forEach(el => el.classList.remove("is-pulse"));
}
function maybeShowReminder() {
  const r = $("#reminder");
  if (!r || !r.hidden || submitted || watched >= CONFIG.freeSeconds) return;
  if (lessonWatched < CONFIG.reminderSeconds || reminded.includes(sectionKey())) return;
  const otherId = r.querySelector("[data-lesson]").dataset.lesson;
  if (seen.includes(lessonKey(otherId))) return;   // ikkinchisi allaqachon ko'rilgan
  // Brauzerning o'z to'liq ekrani (iPhone, yoki telefonni burganda Android) ustiga hech narsa chiqmaydi —
  // eslatmani kutib turamiz va to'liq ekrandan chiqqan zahoti ko'rsatamiz
  if (isNativeFullscreen()) return;
  r.hidden = false;
  const overlay = $(".player-reminder"); if (overlay) overlay.hidden = false;  // pleyer to'liq ekranda bo'lsa — video ustida
  markReminded();   // bir marta ko'rsatiladi
  const li = document.querySelector(`.lesson[data-lesson="${otherId}"]`);
  if (li) li.classList.add("is-pulse");
}

/* =====================================================================
   To'liq ekran: butun pleyer (video + eslatma) to'liq ekranga o'tadi.
   iPhone faqat videoning o'zini to'liq ekran qila oladi — u yerda Apple pleyeri ochiladi.
   ===================================================================== */
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const isPlayerFullscreen = () => { const el = fsElement(); return !!el && el.classList?.contains("player"); };
const isNativeFullscreen = () => !!video && (fsElement() === video || video.webkitDisplayingFullscreen === true);

function enterFullscreen() {
  const p = $(".player");
  if (!p || !video) return;
  const req = p.requestFullscreen || p.webkitRequestFullscreen;
  if (req) {
    const res = req.call(p);
    if (res && res.catch) res.catch(() => { if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); });
  } else if (video.webkitEnterFullscreen) {
    video.webkitEnterFullscreen();   // iPhone
  }
}
function exitFullscreen() {
  try {
    if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen();
    else if (document.webkitExitFullscreen && document.webkitFullscreenElement) document.webkitExitFullscreen();
    if (video && video.webkitDisplayingFullscreen) video.webkitExitFullscreen();
  } catch {}
}
function toggleFullscreen() { if (fsElement()) exitFullscreen(); else enterFullscreen(); }

// To'liq ekrandan chiqilganda kutib turgan eslatmani ko'rsatamiz
["fullscreenchange", "webkitfullscreenchange"].forEach(ev =>
  document.addEventListener(ev, () => { if (!fsElement()) maybeShowReminder(); }));

/* =====================================================================
   Video va yashirin taymer
   ===================================================================== */
function mountPlayer() {
  video = $("#video");
  lessonWatched = 0;
  lastTick = null;
  const missing = $(".player-missing");
  video.addEventListener("error", () => { missing.hidden = false; });
  video.addEventListener("webkitendfullscreen", () => maybeShowReminder());  // iPhone to'liq ekrandan chiqdi
  video.addEventListener("dblclick", e => { e.preventDefault(); toggleFullscreen(); });
  const playBtn = $(".player-play");
  video.addEventListener("error", () => { playBtn.hidden = true; });
  video.addEventListener("play", () => {
    playBtn.hidden = true;   // katta ▶ tugmasi faqat boshlanishda ko'rinadi
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
    exitFullscreen();   // raqam oynasi ko'rinishi uchun to'liq ekrandan chiqaramiz
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
  $("#leadSubmitText").textContent = "Ilovaga yo'naltirilmoqda…";
  // Yo'naltirish shu bosish ichida bajariladi — Instagram brauzeri bloklamasligi uchun
  location.href = CONFIG.onelink;
});

/* Sahifa yopilayotganda ko'rilgan vaqtni saqlab qolamiz */
document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
window.addEventListener("pagehide", flush);

render();
