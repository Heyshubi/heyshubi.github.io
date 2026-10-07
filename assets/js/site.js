// KEYBO website: theme toggle, header, demos, and KEYBO's hero loop.
// Kept small and passive so scrolling never waits on it.

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Theme: white and lime, or dark and lime. The choice is remembered.
  const themeBtn = $(".theme-btn");
  const themeColor = $('meta[name="theme-color"]');
  const applyTheme = t => {
    root.setAttribute("data-theme", t);
    themeColor.setAttribute("content", t === "dark" ? "#0A0A0A" : "#FFFFFF");
    themeBtn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  };
  applyTheme(root.getAttribute("data-theme") || "light");
  themeBtn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("keybo-theme", next); } catch (e) {}
  });

  // Header: a hairline once the page scrolls (one class flip, no work per frame).
  const header = $(".site-header");
  const sentinel = document.createElement("div");
  sentinel.style.cssText = "position:absolute;top:0;height:1px;width:1px";
  document.body.prepend(sentinel);
  new IntersectionObserver(([e]) => header.classList.toggle("scrolled", !e.isIntersecting)).observe(sentinel);

  // Phone menu.
  const menuBtn = $(".menu-btn");
  menuBtn.addEventListener("click", () => {
    const open = header.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  $$(".nav-links a").forEach(a => a.addEventListener("click", () => {
    header.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  }));

  // Sections fade in once as they arrive.
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { rootMargin: "0px 0px -6% 0px" });
  $$(".reveal").forEach(el => io.observe(el));

  // KEYBO's hero loop: large screens only, after the page has loaded, and
  // paused whenever it is off screen. Phones keep the still, which is the
  // loop's own first frame, so the swap never shows.
  const art = $("#hero-art");
  if (art && !reduce && matchMedia("(min-width: 901px)").matches) {
    addEventListener("load", () => {
      const v = document.createElement("video");
      v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      v.setAttribute("aria-hidden", "true");
      v.width = 1080; v.height = 1080;
      v.innerHTML = '<source src="assets/keybo/hero-loop.mov" type=\'video/mp4; codecs="hvc1"\'>' +
                    '<source src="assets/keybo/hero-loop.webm" type="video/webm">';
      v.addEventListener("playing", () => {
        const still = art.querySelector("img");
        if (still) still.style.visibility = "hidden";
      }, { once: true });
      art.appendChild(v);
      new IntersectionObserver(([e]) => { e.isIntersecting ? v.play().catch(() => {}) : v.pause(); }).observe(art);
    }, { once: true });
  }

  // Reply: tap an answer and it is sent into the thread.
  const thread = $("#reply-thread");
  $$("#reply-demo .reply").forEach(btn => btn.addEventListener("click", () => {
    $$("#reply-demo .reply").forEach(b => b.classList.toggle("picked", b === btn));
    $$(".bubble.out", thread).forEach(b => b.remove());
    const out = document.createElement("div");
    out.className = "bubble out";
    out.textContent = btn.lastChild.textContent.trim();
    thread.appendChild(out);
  }));

  // Tones: the same message, said several ways.
  const tones = {
    original: "hey can we move the meeting to tomorrow, something came up",
    friendly: "Hey! Would it be okay to move our meeting to tomorrow? Something came up on my end 😊",
    professional: "Hi, would it be possible to reschedule our meeting to tomorrow? Something unexpected has come up. Apologies for the short notice.",
    polite: "Hi, I'm so sorry to ask, but could we please move the meeting to tomorrow? Something has come up.",
    hinglish: "Hey, kya hum meeting kal shift kar sakte hain? Kuch urgent aa gaya hai yaar",
    funny: "Plot twist: life happened 🙃 Any chance we can move the meeting to tomorrow?",
    concise: "Can we move the meeting to tomorrow? Something came up."
  };
  const field = $("#tone-field");
  $$("#tone-demo [data-tone]").forEach(btn => btn.addEventListener("click", () => {
    $$("#tone-demo [data-tone]").forEach(b => b.classList.toggle("on", b === btn));
    field.textContent = tones[btn.dataset.tone];
  }));

  // Translate: one line, many languages.
  const out = $("#translation");
  $$("#translate-demo [data-t]").forEach(btn => btn.addEventListener("click", () => {
    $$("#translate-demo [data-t]").forEach(b => b.classList.toggle("on", b === btn));
    out.textContent = btn.dataset.t;
    out.dir = /[؀-ۿ]/.test(btn.dataset.t) ? "rtl" : "ltr";
  }));

  // Setup: iPhone or Android, picked for the visitor's phone.
  const tabs = $$('[role="tab"]');
  const pick = tab => tabs.forEach(t => {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    $("#" + t.getAttribute("aria-controls")).hidden = !on;
  });
  tabs.forEach(tab => tab.addEventListener("click", () => pick(tab)));
  if (/android/i.test(navigator.userAgent)) pick($("#tab-android"));

  // FAQ: one answer open at a time.
  $$(".faq details").forEach(d => d.addEventListener("toggle", () => {
    if (d.open) $$(".faq details").forEach(o => { if (o !== d) o.open = false; });
  }));

  // The App Store page opens once KEYBO is out (18 Oct 2026, 10:30 IST).
  // Before that the buttons lead to the download section.
  const released = Date.now() >= Date.UTC(2026, 9, 18, 5, 0);
  $$("[data-appstore]").forEach(a => { if (!released) a.setAttribute("href", "#download"); });
  if (released) $$("[data-release-note]").forEach(p => { p.innerHTML = "<b>iPhone &amp; iPad:</b> available now &nbsp;·&nbsp; <b>Android:</b> coming soon"; });

  $("#year").textContent = new Date().getFullYear();
})();
