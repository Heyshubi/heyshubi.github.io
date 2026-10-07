// KEYBO website: the header, the reveals, and the little demos.
// No libraries; everything degrades to a readable static page without it.

(() => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Header: a hairline once the page scrolls, and the phone menu.
  const header = $(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const menuBtn = $(".menu-btn");
  menuBtn.addEventListener("click", () => {
    const open = header.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  $$(".nav-links a").forEach(a => a.addEventListener("click", () => {
    header.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  }));

  // KEYBO's hero loop; a still of it waving for anyone who asked for less motion.
  const hero = $("#hero-keybo");
  if (hero && reduce) {
    const still = new Image();
    still.src = "assets/keybo/pose-wave.png"; still.alt = ""; still.className = "keybo";
    hero.replaceWith(still);
  }

  // The Meet KEYBO loops load and play only while they are on screen.
  const loops = $$("video.loop");
  if (!reduce) {
    const vo = new IntersectionObserver(entries => {
      for (const e of entries) {
        const v = e.target;
        if (e.isIntersecting) { v.preload = "auto"; v.play().catch(() => {}); } else v.pause();
      }
    }, { threshold: 0.25 });
    loops.forEach(v => vo.observe(v));
  }

  // Sections fade up as they arrive.
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  $$(".reveal").forEach(el => io.observe(el));

  // Reply: tap an answer and it is sent into the thread.
  const thread = $("#reply-thread");
  $$("#reply-demo .reply").forEach(btn => btn.addEventListener("click", () => {
    $$("#reply-demo .reply").forEach(b => b.classList.toggle("picked", b === btn));
    $$(".bubble.out", thread).forEach(b => b.remove());
    const out = document.createElement("div");
    out.className = "bubble out";
    out.textContent = btn.lastChild.textContent.trim();
    thread.appendChild(out);
    if (!reduce) out.animate([{ opacity: 0, transform: "translateY(8px) scale(.96)" }, { opacity: 1, transform: "none" }],
      { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
  }));

  // Tone: the same message, said eight ways.
  const tones = {
    original: "hey can we move the meeting to tomorrow, something came up",
    friendly: "Hey! Would it be okay to move our meeting to tomorrow? Something came up on my end 😊",
    professional: "Hi, would it be possible to reschedule our meeting to tomorrow? Something unexpected has come up. Apologies for the short notice.",
    hinglish: "Hey, kya hum meeting kal shift kar sakte hain? Kuch urgent aa gaya hai yaar",
    polite: "Hi, I'm so sorry to ask, but could we please move the meeting to tomorrow? Something has come up.",
    funny: "Plot twist: life happened 🙃 Any chance we can move the meeting to tomorrow?",
    confident: "Something's come up, so let's move the meeting to tomorrow. Same time works for me.",
    concise: "Can we move the meeting to tomorrow? Something came up."
  };
  const field = $("#tone-field");
  $$("#tone-demo [data-tone]").forEach(btn => btn.addEventListener("click", () => {
    $$("#tone-demo [data-tone]").forEach(b => b.classList.toggle("on", b === btn));
    field.classList.remove("swap"); void field.offsetWidth; field.classList.add("swap");
    field.innerHTML = "";
    field.append(document.createTextNode(tones[btn.dataset.tone]));
    const caret = document.createElement("span"); caret.className = "caret"; field.append(caret);
  }));

  // Hinglish: Roman letters typed, Devanagari offered, then taken.
  const pairs = [
    ["kaise ho", "कैसे हो", "kaise", "kaisa"],
    ["kal milte hain", "कल मिलते हैं", "kal", "milte"],
    ["bahut badhiya", "बहुत बढ़िया", "bahut", "badhiya"],
    ["dhanyavaad", "धन्यवाद", "dhanyavad", "dhanya"],
  ];
  const typed = $("#hi-typed"), s1 = $("#hi-s1"), s2 = $("#hi-s2"), s3 = $("#hi-s3");
  if (reduce) {
    typed.textContent = "कैसे हो";
  } else {
    let p = 0;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    (async function loop() {
      // Wait until the demo is on screen before typing.
      await new Promise(res => {
        const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { o.disconnect(); res(); } });
        o.observe(typed.closest(".demo"));
      });
      for (;;) {
        const [roman, dev, a, b] = pairs[p];
        s1.textContent = a; s2.textContent = "…"; s3.textContent = b;
        typed.textContent = "";
        for (const ch of roman) { typed.textContent += ch; await sleep(110); }
        s2.textContent = dev;
        await sleep(900);
        typed.textContent = dev;
        typed.animate([{ opacity: .3 }, { opacity: 1 }], { duration: 300 });
        await sleep(1900);
        p = (p + 1) % pairs.length;
      }
    })();
  }

  // Translate: one line, many languages.
  const out = $("#translation");
  $$(".lang-row [data-t]").forEach(btn => btn.addEventListener("click", () => {
    $$(".lang-row [data-t]").forEach(b => b.classList.toggle("on", b === btn));
    out.textContent = btn.dataset.t;
    out.dir = /[؀-ۿ]/.test(btn.dataset.t) ? "rtl" : "ltr";
    if (!reduce) out.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 280 });
  }));

  // Setup: iPhone or Android.
  const tabs = $$('[role="tab"]');
  tabs.forEach(tab => tab.addEventListener("click", () => {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
    });
  }));
  if (/android/i.test(navigator.userAgent)) $("#tab-android").click();

  // FAQ: one open at a time.
  $$(".faq details").forEach(d => d.addEventListener("toggle", () => {
    if (d.open) $$(".faq details").forEach(o => { if (o !== d) o.open = false; });
  }));

  // The App Store page opens only once KEYBO is released (18 Oct 2026, 10:30 IST).
  // Until then the buttons point at the download section; after, the "18 Oct"
  // tag comes off and they go straight to the store.
  const released = Date.now() >= Date.UTC(2026, 9, 18, 5, 0);
  $$("[data-appstore]").forEach(a => {
    if (released) a.querySelector(".soon")?.remove();
    else a.setAttribute("href", "#download");
  });

  $("#year").textContent = new Date().getFullYear();
})();
