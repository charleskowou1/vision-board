/* ==========================================================================
   2 Month Hiatus Vision Board — shared behaviour for every page.
   Text data lives in localStorage; pictures and voice recordings live in
   IndexedDB. Everything stays on this device (use Backup to move it).
   ========================================================================== */
(() => {
  "use strict";

  const TOTAL_DAYS = 60;
  const HOME = "index.html";
  const REVIEW = "Review.html";

  const PAGES = [
    // Daily first, then weekly, then as-needed. This order sets the nav, the home cards and the 1–6 shortcuts.
    { id: "pledge", href: "MorningPledge.html", label: "Morning Pledge", color: "#ff9f6b", desc: "Gratitude, pledge, visualize." },
    { id: "rules", href: "Rules.html", label: "Rules", color: "#6ae872", desc: "The code you live by." },
    { id: "goals", href: "Goals.html", label: "Goals", color: "#8ab4ff", desc: "Goals and the million." },
    { id: "board", href: "Board.html", label: "Board", color: "#e879f9", desc: "If you can see it, you can be it." },
    { id: "hardships", href: "Hardships.html", label: "Hardships", color: "#ff6b81", desc: "Turn setbacks into lessons." },
    { id: "resources", href: "Resources.html", label: "Resources", color: "#f7d56e", desc: "Books, people, tools." },
  ];

  const ADMIN = "Admin.html";

  // Starter quotes and pledge. Edit them on the Admin page; *stars* mark the word that glows.
  // A personal.js next to this file (kept off GitHub) can supply your own starters instead.
  const PERSONAL = window.VB_PERSONAL || {};
  const DEFAULT_QUOTES = PERSONAL.quotes || [
    { id: "q-scarface", q: "The world is *yours*.", a: "Scarface" },
    { id: "q-goggins", q: "Time to go to *war* with yourself.", a: "David Goggins" },
    { id: "q-hill", q: "Anything that is not *growing* is dead.", a: "Lauryn Hill" },
    { id: "q-jocko", q: "Discipline equals *freedom*.", a: "Jocko Willink" },
    { id: "q-ruiz", q: "Don't take anything *personally*.", a: "Don Miguel Ruiz, The Four Agreements" },
  ];

  const DEFAULT_PLEDGE =
    PERSONAL.pledge ||
    [
      "I will reach the goals I set for these 60 days.",
      "I will give up the distractions that keep me from them.",
      "I will show up every morning, keep my rules, and learn from every setback.",
      "This is who I am becoming.",
    ].join("\n");

  /* ---------- Helpers ---------- */
  const store = {
    get(key, fallback = null) {
      try {
        const v = localStorage.getItem("vb." + key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem("vb." + key, JSON.stringify(value));
      } catch {
        toast("Couldn't save — this browser's storage is full or blocked.");
      }
    },
  };

  // Tiny IndexedDB wrapper for things too big for localStorage (pictures, audio)
  const idb = (() => {
    let opening;
    const open = () =>
      (opening ||= new Promise((resolve, reject) => {
        const req = indexedDB.open("vision-board", 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore("images", { keyPath: "id" });
          req.result.createObjectStore("audio");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }));
    const run = async (name, mode, fn) => {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(name, mode);
        const req = fn(tx.objectStore(name));
        tx.oncomplete = () => resolve(req?.result);
        tx.onerror = () => reject(tx.error);
      });
    };
    return {
      all: (name) => run(name, "readonly", (s) => s.getAll()),
      count: (name) => run(name, "readonly", (s) => s.count()),
      get: (name, key) => run(name, "readonly", (s) => s.get(key)),
      put: (name, value, key) => run(name, "readwrite", (s) => (key === undefined ? s.put(value) : s.put(value, key))),
      del: (name, key) => run(name, "readwrite", (s) => s.delete(key)),
      clear: (name) => run(name, "readwrite", (s) => s.clear()),
    };
  })();

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const dateKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parseKey = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const addDays = (k, n) => {
    const d = parseKey(k);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  };
  const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 864e5);
  const fmtDate = (k, opts = { month: "short", day: "numeric" }) => parseKey(k).toLocaleDateString(undefined, opts);
  const LONG_DATE = { weekday: "short", month: "short", day: "numeric" };
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const usd = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const parseMoney = (v) => {
    const n = parseFloat(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  };
  // Money put toward a goal: what you started with plus everything added since
  const goalSaved = (g) => (g.saved || 0) + (g.payments || []).reduce((t, p) => t + p.amount, 0);

  const getQuotes = () => store.get("quotes", DEFAULT_QUOTES);
  const plainQuote = (q) => q.replace(/\*/g, "");
  // *word* glows. With no stars, the last word does.
  const quoteHtml = (q) => {
    const safe = esc(q);
    return safe.includes("*")
      ? safe.replace(/\*([^*]+)\*/g, "<em>$1</em>").replace(/\*/g, "")
      : safe.replace(/([\w'’&#;-]+)(\W*)$/, "<em>$1</em>$2");
  };

  const page = document.body.dataset.page;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Hiatus + streaks + check-ins ---------- */
  function hiatus() {
    let start = store.get("start");
    if (!start) {
      start = dateKey();
      store.set("start", start);
    }
    const day = daysBetween(start, dateKey()) + 1;
    return {
      start,
      day,
      shownDay: Math.min(Math.max(day, 0), TOTAL_DAYS),
      left: Math.min(TOTAL_DAYS, Math.max(0, TOTAL_DAYS - day)),
      pct: Math.min(1, Math.max(0, day / TOTAL_DAYS)),
      end: addDays(start, TOTAL_DAYS - 1),
    };
  }

  function dayLabel(h) {
    if (h.day < 1) return `Starts in <b>${plural(1 - h.day, "day")}</b>`;
    if (h.day > TOTAL_DAYS) return `<b>Hiatus complete</b>`;
    return `Day <b>${h.day}</b> of ${TOTAL_DAYS}`;
  }

  // Consecutive days the pledge was taken. Today not being done yet doesn't break it.
  function streak() {
    const done = new Set(store.get("pledges", []));
    let k = dateKey();
    if (!done.has(k)) k = addDays(k, -1);
    let n = 0;
    while (done.has(k)) {
      n++;
      k = addDays(k, -1);
    }
    return n;
  }

  // Hardship tags, most common first, and a 1-decimal average
  const HARDSHIP_TAGS = ["Money", "Family", "Discipline", "Business", "Health", "Mindset", "Other"];
  const tagCounts = (list) =>
    Object.entries(list.reduce((acc, it) => (it.tag ? { ...acc, [it.tag]: (acc[it.tag] || 0) + 1 } : acc), {})).sort((a, b) => b[1] - a[1]);
  const avg = (nums) => (nums.reduce((t, n) => t + n, 0) / nums.length).toFixed(1);

  // Days the full morning routine was finished (the Done button on the last section)
  const routineDays = () => new Set(store.get("routineDone", []));

  function longestStreak() {
    const days = [...new Set(store.get("pledges", []))].sort();
    let best = 0;
    let run = 0;
    days.forEach((d, i) => {
      run = i && daysBetween(days[i - 1], d) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
    });
    return best;
  }

  const checkinData = () => ({
    pledges: new Set(store.get("pledges", [])),
    rules: store.get("rules", []),
    kept: store.get("rulesKept", {}),
  });

  // 2 = pledged and every rule kept, 1 = some of it, 0 = nothing
  function dayStatus(key, c) {
    const rules = c.rules.filter((r) => r.at <= key);
    const kept = new Set(c.kept[key] || []);
    const keptCount = rules.filter((r) => kept.has(r.id)).length;
    const pledged = c.pledges.has(key);
    if (pledged && keptCount === rules.length) return 2;
    return pledged || keptCount > 0 ? 1 : 0;
  }

  function renderCheckin(el) {
    const h = hiatus();
    const c = checkinData();
    const today = dateKey();
    let complete = 0;
    let partial = 0;
    el.innerHTML = Array.from({ length: TOTAL_DAYS }, (_, i) => {
      const key = addDays(h.start, i);
      const future = key > today;
      const s = future ? 0 : dayStatus(key, c);
      if (s === 2) complete++;
      if (s === 1) partial++;
      const label = future ? "" : s === 2 ? " · Complete" : s === 1 ? " · Partial" : key === today ? " · Not yet" : " · Missed";
      return `<span class="cell s${s}${key === today ? " today" : ""}${future ? " future" : ""}" title="Day ${i + 1} · ${fmtDate(key)}${label}">${i + 1}</span>`;
    }).join("");
    return { complete, partial };
  }

  function ruleStats(rule, c, h) {
    const today = dateKey();
    const to = today < h.end ? today : h.end;
    let kept = 0;
    let total = 0;
    for (let k = rule.at > h.start ? rule.at : h.start; k <= to; k = addDays(k, 1)) {
      total++;
      if ((c.kept[k] || []).includes(rule.id)) kept++;
    }
    return { kept, total };
  }

  /* ---------- Shared chrome: background, header, footer, shortcuts ---------- */
  let installPrompt = null;
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    document.dispatchEvent(new Event("vb:installable"));
  });

  function chrome() {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<div class="bg" aria-hidden="true"></div>
      <header class="site-header">
        <a class="brand" href="${HOME}" aria-label="Vision Board home">
          <span class="brand-mark">2M</span><span class="brand-text">Hiatus Vision Board</span>
        </a>
        <nav class="nav" aria-label="Sections">
          ${PAGES.map(
            (p, i) =>
              `<a href="${p.href}"${p.id === page ? ' class="active" aria-current="page"' : ""}><kbd>${i + 1}</kbd>${p.label}</a>`
          ).join("")}
        </nav>
        <a class="day-chip" href="${HOME}#tracker">${dayLabel(hiatus())}</a>
        <a class="admin-link${page === "admin" ? " active" : ""}" href="${ADMIN}" aria-label="Admin" title="Admin">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
          </svg>
        </a>
      </header>`
    );
    // "Next" card at the bottom, to walk through the sections in morning order
    const at = PAGES.findIndex((p) => p.id === page);
    const next = page === "home" ? PAGES[0] : at >= 0 ? PAGES[at + 1] : null;
    if (next) {
      $("main")?.insertAdjacentHTML(
        "beforeend",
        `<a class="next-link reveal" href="${next.href}" style="--c:${next.color}">
          <span class="next-k">${page === "home" ? "Start your morning" : "Next"} · 0${PAGES.indexOf(next) + 1}</span>
          <span class="next-name">${next.label} <span aria-hidden="true">→</span></span>
          <span class="next-desc">${next.desc}</span>
        </a>`
      );
    } else if (at === PAGES.length - 1) {
      // Last section: mark the whole morning routine done (once per day)
      const drawDone = () => {
        const doneToday = routineDays().has(dateKey());
        const n = routineDays().size;
        const card = doneToday
          ? `<a class="next-link done-link" id="routine-done" href="${HOME}">
              <span class="next-k">Morning complete ✓</span>
              <span class="next-name">Back to home <span aria-hidden="true">→</span></span>
              <span class="next-desc">${plural(n, "morning")} done so far.</span>
            </a>`
          : `<button class="next-link done-link" id="routine-done" type="button">
              <span class="next-k">You made it through all ${PAGES.length}</span>
              <span class="next-name">Done for today <span aria-hidden="true">✓</span></span>
              <span class="next-desc">${n ? `Make it ${plural(n + 1, "morning")}.` : "Log your first full morning."}</span>
            </button>`;
        const old = $("#routine-done");
        if (old) old.outerHTML = card;
        else $("main")?.insertAdjacentHTML("beforeend", card);
      };
      drawDone();
      $("main")?.addEventListener("click", (e) => {
        if (!e.target.closest("button#routine-done")) return;
        const days = routineDays();
        days.add(dateKey());
        store.set("routineDone", [...days]);
        drawDone();
        confetti(180);
        toast(`Morning complete. That's ${plural(days.size, "morning")}.`);
      });
    }

    document.body.insertAdjacentHTML(
      "beforeend",
      `<footer class="site-footer">Press <kbd>1</kbd>–<kbd>${PAGES.length}</kbd> to jump between sections · <kbd>H</kbd> home · <kbd>R</kbd> review · <kbd>A</kbd> admin</footer>
      <div class="toast" role="status" aria-live="polite"></div>`
    );

    const active = $(".nav .active");
    if (active) active.parentElement.scrollLeft = active.offsetLeft - 16;

    document.addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      if ($(".lightbox:not([hidden])")) return;
      const n = Number(e.key);
      const key = e.key.toLowerCase();
      if (n >= 1 && n <= PAGES.length) location.href = PAGES[n - 1].href;
      else if (key === "h") location.href = HOME;
      else if (key === "r") location.href = REVIEW;
      else if (key === "a") location.href = ADMIN;
    });

    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }

    // Ask the browser not to clear our data when the site goes unused for a while
    navigator.storage?.persist?.().catch(() => {});

    // An installed app can stay open overnight. Reload on a new day so check-ins land on the right date.
    const loadedOn = dateKey();
    const freshDay = () => {
      if (document.visibilityState === "visible" && dateKey() !== loadedOn) location.reload();
    };
    document.addEventListener("visibilitychange", freshDay);
    addEventListener("pageshow", freshDay);
    addEventListener("focus", freshDay);
  }

  // A random quote from your library at the top of each section page, never the same one twice in a row.
  // Headlines marked data-fixed (the Board's purpose line) always stay as written.
  function heroQuote() {
    const h1 = $(".hero .quote:not([data-fixed])");
    const quotes = getQuotes();
    if (!h1 || !quotes.length) return;
    let last = null;
    try {
      last = sessionStorage.getItem("vb.lastQuote");
    } catch {}
    const pool = quotes.length > 1 ? quotes.filter((q) => q.id !== last) : quotes;
    const pick = pool[(Math.random() * pool.length) | 0];
    try {
      sessionStorage.setItem("vb.lastQuote", pick.id);
    } catch {}
    h1.innerHTML = `“${quoteHtml(pick.q)}”`;
    h1.classList.toggle("long", pick.q.length > 90);
    if (!$(".hero .cite")) h1.insertAdjacentHTML("afterend", '<p class="cite"></p>');
    $(".hero .cite").textContent = pick.a || "";
  }

  let toastTimer;
  function toast(msg) {
    const t = $(".toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  function reveals() {
    const els = $$(".reveal");
    if (!("IntersectionObserver" in window) || reducedMotion) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.08 }
    );
    els.forEach((el) => io.observe(el));
  }

  /* ---------- Confetti ---------- */
  function confetti(count = 140) {
    if (reducedMotion) return;
    const canvas = document.createElement("canvas");
    canvas.className = "confetti";
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = innerWidth;
    const h = innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const css = getComputedStyle(document.body);
    const colors = [css.getPropertyValue("--accent"), css.getPropertyValue("--accent-2"), "#ffffff"].map((c) => c.trim());
    const bits = Array.from({ length: count }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 120,
      y: h * 0.65,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 17 - 7,
      size: Math.random() * 6 + 5,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      color: colors[(Math.random() * colors.length) | 0],
    }));

    let frame = 0;
    (function tick() {
      ctx.clearRect(0, 0, w, h);
      for (const b of bits) {
        b.vy += 0.45;
        b.vx *= 0.99;
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.spin;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
        ctx.restore();
      }
      if (++frame < 170) requestAnimationFrame(tick);
      else canvas.remove();
    })();
  }

  /* ---------- Reusable editable list (rules, resources, goals, hardships) ---------- */
  // check:   { label, isOn(item), set(item, on) } adds a checkbox to each item
  // actions: [{ id, label(item), show(item), disabled(item), run(item) }] adds small buttons
  function makeList(root, opts) {
    const { key, fields, render, empty, numbered = false, check = null, strike = false, actions = [], button = "Add", onChange, onCheck, visible } = opts;
    let items = store.get(key, []);
    let newId = null;

    const control = (f) => {
      const common = `name="${f.name}" aria-label="${esc(f.label)}"${f.required ? " required" : ""}`;
      if (f.type === "select")
        return `<select ${common}>${f.options
          .map((o) => (typeof o === "string" ? `<option>${o}</option>` : `<option value="${o.value}">${o.label}</option>`))
          .join("")}</select>`;
      if (f.type === "textarea") return `<textarea ${common} rows="2" placeholder="${esc(f.label)}"></textarea>`;
      return `<input ${common} type="${f.type || "text"}" placeholder="${esc(f.label)}" autocomplete="off" />`;
    };

    root.innerHTML = `
      <form class="add-form" style="--cols:${fields.length}">
        ${fields.map(control).join("")}
        <button class="btn" type="submit">${button}</button>
      </form>
      <ol class="items${numbered ? " numbered" : ""}"></ol>
      <p class="empty">${empty}</p>`;

    const form = $("form", root);
    const list = $("ol", root);
    const emptyEl = $(".empty", root);

    function draw() {
      const shown = visible ? items.filter(visible) : items;
      list.innerHTML = shown
        .map((it) => {
          const on = check?.isOn(it);
          const buttons = actions
            .filter((a) => a.show(it))
            .map(
              (a) =>
                `<button class="mini" type="button" data-action="${a.id}"${a.disabled?.(it) ? " disabled" : ""}>${a.label(it)}</button>`
            )
            .join("");
          return `<li class="item${on ? (strike ? " done" : " kept") : ""}${it.id === newId ? " new" : ""}" data-id="${it.id}">
            ${check ? `<input type="checkbox" class="check" aria-label="${check.label}"${on ? " checked" : ""} />` : ""}
            <div class="item-body">${render(it)}${buttons}</div>
            <button class="del" type="button" aria-label="Delete">×</button>
          </li>`;
        })
        .join("");
      emptyEl.hidden = shown.length > 0;
      newId = null;
    }

    function save() {
      store.set(key, items);
      draw();
      onChange?.(items);
    }

    const itemFor = (el) => items.find((i) => i.id === el.closest(".item").dataset.id);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      for (const k in data) data[k] = String(data[k]).trim();
      if (!data[fields[0].name]) return;
      newId = uid();
      items.push({ id: newId, at: dateKey(), done: false, ...data });
      form.reset();
      $("input, textarea", form).focus();
      save();
    });

    // Cmd/Ctrl + Enter submits from a textarea
    form.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) form.requestSubmit();
    });

    list.addEventListener("click", (e) => {
      const actionBtn = e.target.closest("[data-action]");
      if (actionBtn) {
        actions.find((a) => a.id === actionBtn.dataset.action).run(itemFor(actionBtn));
        save();
        return;
      }
      if (!e.target.closest(".del")) return;
      const li = e.target.closest(".item");
      items = items.filter((i) => i.id !== li.dataset.id);
      li.classList.add("leaving");
      setTimeout(save, 220);
    });

    list.addEventListener("change", (e) => {
      if (!e.target.classList.contains("check")) return;
      const it = itemFor(e.target);
      check.set(it, e.target.checked);
      save();
      onCheck?.(it, e.target.checked, items);
    });

    draw();
    onChange?.(items);
    return {
      redraw() {
        draw();
        onChange?.(items);
      },
      save,
    };
  }

  /* ---------- Backup ---------- */
  const blobToDataURL = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  // Phones get the share sheet (Save Image, Save to Files, AirDrop); computers get a normal download.
  // Returns false if the person closed the share sheet without saving.
  async function saveFile(blob, name) {
    const file = new File([blob], name, { type: blob.type });
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return true;
      } catch (e) {
        if (e.name === "AbortError") return false;
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  }

  // Same seed, same "random" numbers, so a collage looks the same until you shuffle it
  const seeded = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  async function exportBackup() {
    const data = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith("vb.")) data[k] = localStorage.getItem(k);
      }
    } catch {}
    // Starters you never edited live in code, not storage, so write them in: the backup then brings them to any device
    data["vb.quotes"] ??= JSON.stringify(getQuotes());
    data["vb.pledgeText"] ??= JSON.stringify(store.get("pledgeText", DEFAULT_PLEDGE));
    let images = [];
    try {
      images = await Promise.all(
        (await idb.all("images")).map(async (im) => ({
          id: im.id,
          caption: im.caption,
          order: im.order,
          data: await blobToDataURL(im.blob),
        }))
      );
    } catch {}
    let audio = null;
    try {
      const blob = await idb.get("audio", "pledge");
      if (blob) audio = await blobToDataURL(blob);
    } catch {}
    const json = JSON.stringify({ app: "vision-board", version: 1, exportedAt: new Date().toISOString(), data, images, audio });
    const saved = await saveFile(new Blob([json], { type: "application/json" }), `vision-board-backup-${dateKey()}.json`);
    if (saved) store.set("lastBackup", dateKey());
    return saved;
  }

  async function importBackup(file) {
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      backup = null;
    }
    if (backup?.app !== "vision-board") {
      toast("That file isn't a Vision Board backup.");
      return;
    }
    const when = backup.exportedAt ? new Date(backup.exportedAt).toLocaleDateString() : "an earlier date";
    if (!confirm(`Replace everything on this device with the backup from ${when}?`)) return;

    Object.keys(localStorage)
      .filter((k) => k.startsWith("vb."))
      .forEach((k) => localStorage.removeItem(k));
    for (const [k, v] of Object.entries(backup.data || {})) {
      if (k.startsWith("vb.") && typeof v === "string") localStorage.setItem(k, v);
    }
    try {
      await idb.clear("images");
      for (const im of backup.images || []) {
        if (typeof im.data !== "string" || !im.data.startsWith("data:image/")) continue;
        const blob = await (await fetch(im.data)).blob();
        await idb.put("images", { id: im.id || uid(), caption: im.caption || "", order: im.order ?? 0, blob });
      }
    } catch {
      toast("Restored your data, but some pictures couldn't be loaded.");
    }
    try {
      await idb.del("audio", "pledge");
      if (typeof backup.audio === "string" && backup.audio.startsWith("data:audio/")) {
        await idb.put("audio", await (await fetch(backup.audio)).blob(), "pledge");
      }
    } catch {}
    const exported = new Date(backup.exportedAt);
    if (!Number.isNaN(exported.getTime())) store.set("lastBackup", dateKey(exported));
    location.reload();
  }

  // Download / restore buttons (home page and admin page)
  function backupControls() {
    const showState = () => {
      const last = store.get("lastBackup");
      const ago = last && daysBetween(last, dateKey());
      $("#backup-state").textContent = !last
        ? "No backup yet."
        : `Last backup: ${fmtDate(last)} (${ago ? `${plural(ago, "day")} ago` : "today"}).`;
    };
    showState();
    $("#export-btn").addEventListener("click", () =>
      exportBackup().then((saved) => {
        if (!saved) return;
        showState();
        $$(".today-pill[href='#app']").forEach((p) => p.remove());
        toast("Backup downloaded.");
      })
    );
    $("#import-input").addEventListener("change", (e) => {
      if (e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = "";
    });
  }

  // ---- Claude prompts. The instructions and tone are editable on the Admin page; the details come from your entries.
  const CLAUDE_TONES = [
    { label: "Claude's usual", line: "" },
    { label: "Warm", line: "Be warm and encouraging, like someone who believes in me." },
    { label: "Real talk", line: "Be real and direct, like a friend who doesn't sugarcoat anything." },
    { label: "Tough love", line: "Be tough love, like a coach pushing me to be better. Call me out where I need it." },
    { label: "Big picture", line: "Be calm and reflective, and connect this to the bigger picture of who I'm becoming." },
  ];
  const DEFAULT_PROMPTS = {
    gratitude:
      "Using what you know about me, tell me why each of these is worth being grateful for. Make it personal and specific to my life and goals, not generic. Keep it short enough to read in a minute. Then tell me: “Now go read your morning pledge.” After that, add anything else you want to say to me before I start my day.",
    hardship:
      "Using what you know about me, help me see what this taught me, what I could do differently next time, and one thing to remember when it happens again. Be honest and direct, not soft. Keep it short enough to read in a minute.",
  };
  const promptText = (kind) => store.get("claudePrompts", {})[kind]?.trim() || DEFAULT_PROMPTS[kind];
  const withTone = (prompt) => {
    const tone = store.get("claudeTone", "").trim();
    return tone ? `${prompt}\n\nTone: ${tone}` : prompt;
  };

  function gratitudePrompt(things) {
    const h = hiatus();
    return withTone(
      [
        `This morning I wrote down ${things.length === 1 ? "something" : `${things.length} things`} I'm grateful for:`,
        ...things.map((t, i) => `${i + 1}. ${t}`),
        "",
        promptText("gratitude"),
        ...(h.day >= 1 && h.day <= TOTAL_DAYS ? ["", `(For context: I'm on day ${h.day} of a ${TOTAL_DAYS}-day hiatus focused on my goals.)`] : []),
      ].join("\n")
    );
  }

  function hardshipPrompt(it) {
    return withTone(
      [
        "Something hard happened to me:",
        `“${it.what}”`,
        ...(it.hard ? [`How hard it felt: ${it.hard} out of 5.`] : []),
        ...(it.tag ? [`It's about: ${it.tag}.`] : []),
        ...(it.lesson ? [`What I've taken from it so far: “${it.lesson}”`] : []),
        "",
        promptText("hardship"),
      ].join("\n")
    );
  }

  // Open your Claude (your project, if one is set on the Admin page) with a prompt.
  // The prompt is copied too, because projects open with an empty message box.
  function openClaude(prompt) {
    const project = store.get("claudeProject", "");
    const base = project || "https://claude.ai/new";
    navigator.clipboard?.writeText(prompt).catch(() => {});
    window.open(`${base}${base.includes("?") ? "&" : "?"}q=${encodeURIComponent(prompt)}`, "_blank", "noopener");
    toast(
      project
        ? "Prompt copied. In your project, tap the message box and paste."
        : "Opening Claude. If the message box is empty, paste: it's copied."
    );
  }

  /* ---------- Pages ---------- */
  const pages = {
    home() {
      const h = hiatus();

      // Progress ring
      const bar = $(".ring .bar");
      const circumference = 2 * Math.PI * Number(bar.getAttribute("r"));
      bar.style.strokeDasharray = circumference;
      bar.style.strokeDashoffset = circumference;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => (bar.style.strokeDashoffset = circumference * (1 - h.pct)))
      );
      $("#ring-day").textContent = h.shownDay;
      $("#days-left").textContent = h.left;
      $("#end-date").textContent = fmtDate(h.end);
      $("#streak").textContent = streak();
      $("#mornings").textContent = routineDays().size;
      $("#hero-eyebrow").innerHTML = dayLabel(h).replace(/<\/?b>/g, "");
      if (h.day >= TOTAL_DAYS) $("#review-banner").hidden = false;

      const startInput = $("#start-date");
      startInput.value = h.start;
      startInput.addEventListener("change", () => {
        if (!startInput.value) return;
        store.set("start", startInput.value);
        location.reload();
      });

      // Quote of the day — changes daily, or tap for another
      const quotes = getQuotes();
      if (!quotes.length) quotes.push({ q: "Add your favorite quotes on the Admin page.", a: "" });
      let qi = ((daysBetween("2024-01-01", dateKey()) % quotes.length) + quotes.length) % quotes.length;
      const box = $("#qotd-body");
      const showQuote = () => {
        $("#qotd-text").textContent = `“${plainQuote(quotes[qi].q)}”`;
        $("#qotd-by").textContent = quotes[qi].a;
        box.classList.remove("swap");
        void box.offsetWidth;
        box.classList.add("swap");
      };
      $("#qotd-next").addEventListener("click", () => {
        qi = (qi + 1) % quotes.length;
        showQuote();
      });
      showQuote();

      // Daily check-in grid + what's left today
      const { complete, partial } = renderCheckin($("#checkin-grid"));
      $("#checkin-summary").textContent = `${plural(complete, "complete day")} · ${partial} partial`;
      const c = checkinData();
      const today = dateKey();
      const keptToday = c.rules.filter((r) => (c.kept[today] || []).includes(r.id)).length;
      const pledged = c.pledges.has(today);
      const rulesOk = c.rules.length > 0 && keptToday === c.rules.length;
      const lastBackup = store.get("lastBackup");
      const backupDue = lastBackup ? daysBetween(lastBackup, today) >= 7 : h.day >= 3;
      $("#today-list").innerHTML = `
        <a class="today-pill${pledged ? " ok" : ""}" href="MorningPledge.html"><span class="dot"></span>${pledged ? "Pledge taken" : "Take today's pledge"}</a>
        <a class="today-pill${rulesOk ? " ok" : ""}" href="Rules.html"><span class="dot"></span>${
          c.rules.length ? `Rules kept ${keptToday}/${c.rules.length}` : "Set your rules"
        }</a>
        <a class="today-pill${routineDays().has(today) ? " ok" : ""}" href="${routineDays().has(today) ? PAGES.at(-1).href : PAGES[0].href}"><span class="dot"></span>${
          routineDays().has(today) ? "Morning complete" : "Start your morning"
        }</a>${backupDue ? `<a class="today-pill" href="#app"><span class="dot"></span>Back up your data</a>` : ""}`;

      // Section cards with live stats
      const goals = store.get("goals", []);
      const stats = {
        board: `<b id="pic-count">0</b> pictures`,
        rules: `<b>${c.rules.length}</b> rules set`,
        resources: `<b>${store.get("resources", []).length}</b> saved`,
        pledge: `<b>${streak()}</b>-day streak`,
        goals: `<b>${goals.filter((g) => g.done).length}</b> of ${goals.length} done`,
        hardships: `<b>${store.get("hardships", []).length}</b> lessons logged`,
      };
      $("#cards").innerHTML = PAGES.map(
        (p, i) => `<a class="card" href="${p.href}" style="--c:${p.color}">
          <span class="arrow" aria-hidden="true">↗</span>
          <span class="k">0${i + 1}</span>
          <span class="name">${p.label}</span>
          <span class="desc">${p.desc}</span>
          <span class="stat">${stats[p.id]}</span>
        </a>`
      ).join("");
      idb.count("images").then((n) => ($("#pic-count").textContent = n)).catch(() => {});

      // Install on phone
      const hint = $("#install-hint");
      const installBtn = $("#install-btn");
      const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      if (standalone) hint.textContent = "You're using the installed app. Nice.";
      else if (location.protocol === "file:")
        hint.textContent = "Put the site online first, then open the link on your phone to add it to your home screen.";
      else if (ios) hint.innerHTML = "In Safari, tap the <b>Share</b> button, then <b>Add to Home Screen</b>.";
      else hint.innerHTML = "In Chrome, open the <b>⋮</b> menu and choose <b>Add to Home screen</b> or <b>Install app</b>.";
      const showInstall = () => {
        if (!installPrompt || standalone) return;
        installBtn.hidden = false;
        hint.textContent = "Install it to get an icon on your home screen. It works offline too.";
      };
      document.addEventListener("vb:installable", showInstall);
      showInstall();
      installBtn.addEventListener("click", async () => {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        installBtn.hidden = true;
      });

      backupControls();
    },

    board() {
      const boardEl = $("#board");
      const emptyEl = $("#board-empty");
      const lightbox = $("#lightbox");
      if (!window.indexedDB) {
        $("#board-tools").innerHTML = "<p class=\"hint\">This browser can't store pictures. Try Safari or Chrome.</p>";
        return;
      }

      let images = [];
      const urls = new Map();
      const urlFor = (im) => {
        if (!urls.has(im.id)) urls.set(im.id, URL.createObjectURL(im.blob));
        return urls.get(im.id);
      };

      const collageEl = $("#collage");
      const tools = $("#board-tools");
      const editBtn = $("#edit-btn");
      const STYLES = ["polaroid", "scrapbook", "gallery", "film"];
      let view = store.get("boardView", "collage");
      let style = store.get("collageStyle", "polaroid");
      if (!STYLES.includes(style)) style = "polaroid";
      let seed = store.get("collageSeed", 7);
      const alt = (im) => esc(im.caption || "Vision board picture");
      const deg = (rnd, spread) => `${((rnd() - 0.5) * spread).toFixed(1)}deg`;
      const FRAMES = ["#141418", "#6b4a2b", "#b08d45", "#141418", "#e9e4d8"];

      // Each style is the same pictures dressed differently; the seed keeps the tilt and sizes until you shuffle
      const STYLE_HTML = {
        polaroid: (im, rnd) => `<figure class="pol" data-id="${im.id}" style="--r:${deg(rnd, 12)};--y:${Math.round((rnd() - 0.5) * 24)}px">
            <img src="${urlFor(im)}" alt="${alt(im)}" /><figcaption>${esc(im.caption)}</figcaption>
          </figure>`,
        scrapbook: (im, rnd) => `<figure class="scrap" data-id="${im.id}" style="--w:${[26, 31, 36][(rnd() * 3) | 0]}%;--r:${deg(rnd, 8)};--t:${deg(rnd, 18)};--tx:${Math.round(rnd() * 40 + 30)}%">
            <img src="${urlFor(im)}" alt="${alt(im)}" />${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ""}
          </figure>`,
        gallery: (im, rnd) => `<figure class="frame" data-id="${im.id}" style="--w:${[24, 30, 36][(rnd() * 3) | 0]}%;--f:${FRAMES[(rnd() * FRAMES.length) | 0]}">
            <div class="frame-art"><img src="${urlFor(im)}" alt="${alt(im)}" /></div>
            ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ""}
          </figure>`,
        film: (im, rnd, i) => `<figure class="film-frame" data-id="${im.id}">
            <img src="${urlFor(im)}" alt="${alt(im)}" />
            <figcaption><span>${i + 1}A ▸</span> ${esc(im.caption)}</figcaption>
          </figure>`,
      };

      function drawCollage() {
        collageEl.className = `collage ${style}`;
        const rnd = seeded(seed);
        collageEl.innerHTML = images.map((im, i) => STYLE_HTML[style](im, rnd, i)).join("");
      }

      function syncView() {
        const has = images.length > 0;
        if (!has) view = "collage";
        $$(".needs-pics", tools).forEach((el) => (el.hidden = !has));
        $$(".collage-only", tools).forEach((el) => (el.hidden = !has || view === "edit"));
        $("#shuffle-btn").hidden = !has || view === "edit" || style === "film";
        collageEl.hidden = view === "edit" || !has;
        boardEl.hidden = view !== "edit";
        editBtn.textContent = view === "edit" ? "Done" : "Edit";
        editBtn.setAttribute("aria-pressed", view === "edit");
        $$('input[name="style"]', tools).forEach((r) => (r.checked = r.value === style));
        $("#board-count").textContent = !has
          ? ""
          : view === "edit"
            ? `${plural(images.length, "picture")} · add captions, drag to rearrange, tap × to remove`
            : style === "film"
              ? `${plural(images.length, "picture")} · swipe through, tap one to see it big`
              : `${plural(images.length, "picture")} · tap one to see it big`;
      }

      function draw() {
        drawCollage();
        syncView();
        boardEl.innerHTML = images
          .map(
            (im) => `<figure class="tile" draggable="true" data-id="${im.id}">
              <img src="${urlFor(im)}" alt="${esc(im.caption || "Vision board picture")}" />
              <figcaption class="cap"><input type="text" value="${esc(im.caption)}" placeholder="Add a caption" aria-label="Caption" maxlength="80" /></figcaption>
              <button class="x" type="button" aria-label="Remove picture">×</button>
            </figure>`
          )
          .join("");
        emptyEl.hidden = images.length > 0;
      }

      async function load() {
        images = (await idb.all("images")).sort((a, b) => a.order - b.order);
        draw();
      }

      tools.addEventListener("change", (e) => {
        if (e.target.name !== "style") return;
        store.set("collageStyle", (style = e.target.value));
        draw();
      });
      editBtn.addEventListener("click", () => {
        store.set("boardView", (view = view === "edit" ? "collage" : "edit"));
        draw();
      });
      $("#shuffle-btn").addEventListener("click", () => {
        store.set("collageSeed", (seed = (Math.random() * 1e9) | 0));
        drawCollage();
      });
      collageEl.addEventListener("click", (e) => {
        const fig = e.target.closest("[data-id]");
        if (fig) openLightbox(images.findIndex((i) => i.id === fig.dataset.id));
      });

      // ▶ Play: full-screen slideshow, each picture slowly zooming, for visualizing
      const slides = $("#show");
      const showImg = $("img", slides);
      let showAt = 0;
      let showTimer = null;
      let showLock = null;
      const showStep = (d = 1) => {
        showAt = (showAt + d + images.length) % images.length;
        const im = images[showAt];
        showImg.classList.remove("kb");
        void showImg.offsetWidth;
        showImg.src = urlFor(im);
        showImg.style.setProperty("--kx", `${Math.round((Math.random() - 0.5) * 6)}%`);
        showImg.style.setProperty("--ky", `${Math.round((Math.random() - 0.5) * 6)}%`);
        showImg.classList.add("kb");
        $(".show-cap", slides).textContent = im.caption || "";
      };
      const stopShow = () => {
        clearInterval(showTimer);
        showTimer = null;
        slides.hidden = true;
        showLock?.release().catch(() => {});
        showLock = null;
      };
      $("#play-btn").addEventListener("click", async () => {
        if (!images.length) return;
        showAt = -1;
        slides.hidden = false;
        showStep(1);
        showTimer = setInterval(showStep, 6000);
        try {
          showLock = await navigator.wakeLock?.request("screen");
        } catch {}
      });
      slides.addEventListener("click", (e) => {
        if (e.target.closest(".show-close")) return stopShow();
        clearInterval(showTimer);
        showStep(1);
        showTimer = setInterval(showStep, 6000);
      });
      document.addEventListener("keydown", (e) => {
        if (slides.hidden) return;
        if (e.key === "Escape") stopShow();
        if (e.key === "ArrowRight") showStep(1);
        if (e.key === "ArrowLeft") showStep(-1);
      });

      // Phone wallpaper: your Polaroids scattered under the lock-screen clock, with the board's line above them
      $("#wallpaper-btn").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = "Making it…";
        try {
          const W = 1179;
          const H = 2556;
          const canvas = document.createElement("canvas");
          canvas.width = W;
          canvas.height = H;
          const ctx = canvas.getContext("2d");
          const css = getComputedStyle(document.body);
          ctx.fillStyle = "#09090d";
          ctx.fillRect(0, 0, W, H);
          for (const [cx, cy, color] of [
            [0.1, 0.08, css.getPropertyValue("--accent")],
            [0.95, 0.98, css.getPropertyValue("--accent-2")],
          ]) {
            const g = ctx.createRadialGradient(W * cx, H * cy, 0, W * cx, H * cy, W * 1.1);
            g.addColorStop(0, color.trim());
            g.addColorStop(1, "transparent");
            ctx.globalAlpha = 0.32;
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
          }
          ctx.globalAlpha = 1;

          await document.fonts?.ready;
          ctx.fillStyle = "rgba(245, 242, 234, 0.9)";
          ctx.textAlign = "center";
          ctx.font = `italic 300 58px Fraunces, Georgia, serif`;
          ctx.fillText($(".hero .quote").textContent.trim(), W / 2, H * 0.335, W - 120);

          // Up to 9 Polaroids on a loose grid, each one tilted a little
          const shown = images.slice(0, 9);
          const cols = shown.length <= 2 ? 1 : shown.length <= 4 ? 2 : 3;
          const rows = Math.ceil(shown.length / cols);
          const pad = 60;
          const top = H * 0.37;
          const cellW = (W - pad * 2) / cols;
          const cellH = (H * 0.87 - top) / rows;
          const cardW = Math.min(cellW * 0.88, (cellH * 0.88) / 1.2);
          const cardH = cardW * 1.2;
          const border = cardW * 0.06;
          const photo = cardW - border * 2;
          const rnd = seeded(seed);
          for (const [i, im] of shown.entries()) {
            const row = Math.floor(i / cols);
            const inRow = Math.min(cols, shown.length - row * cols);
            const cx = pad + cellW * ((i % cols) + 0.5) + ((cols - inRow) * cellW) / 2 + (rnd() - 0.5) * cellW * 0.08;
            const cy = top + cellH * (row + 0.5) + (rnd() - 0.5) * cellH * 0.06;
            const bmp = await createImageBitmap(im.blob);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate((rnd() - 0.5) * 0.2);
            ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
            ctx.shadowBlur = 40;
            ctx.shadowOffsetY = 18;
            ctx.fillStyle = "#f5f2ea";
            ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);
            ctx.shadowColor = "transparent";
            const side = Math.min(bmp.width, bmp.height);
            ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, -cardW / 2 + border, -cardH / 2 + border, photo, photo);
            if (im.caption) {
              const size = Math.round(cardW * 0.075);
              ctx.fillStyle = "#1a1a22";
              ctx.font = `italic 400 ${size}px Fraunces, Georgia, serif`;
              ctx.fillText(im.caption, 0, -cardH / 2 + border + photo + (cardH - photo - border) / 2 + size * 0.35, photo);
            }
            ctx.restore();
            bmp.close();
          }
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
          if (await saveFile(blob, "vision-board-wallpaper.jpg"))
            toast(matchMedia("(pointer: coarse)").matches ? "Saved. Set it as your wallpaper in Photos." : "Wallpaper downloaded.");
        } catch {
          toast("Couldn't make the wallpaper on this browser.");
        }
        btn.disabled = false;
        btn.textContent = "Wallpaper";
      });

      // Shrink big photos so dozens fit comfortably on a phone
      function compress(file, max = 1600) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.naturalWidth * scale);
            canvas.height = Math.round(img.naturalHeight * scale);
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#09090d";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(img.src);
            canvas.toBlob((b) => (b ? resolve({ blob: b }) : reject()), "image/jpeg", 0.85);
          };
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });
      }

      async function addFiles(files) {
        const list = [...files].filter((f) => f.type.startsWith("image/"));
        if (!list.length) return;
        let order = images.length ? Math.max(...images.map((i) => i.order)) + 1 : 0;
        let added = 0;
        for (const file of list) {
          try {
            const { blob } = await compress(file);
            await idb.put("images", { id: uid(), blob, caption: "", order: order++ });
            added++;
          } catch {}
        }
        await load();
        toast(added === list.length ? `Added ${plural(added, "picture")}.` : `Added ${added} of ${list.length} — some couldn't be read.`);
      }

      $("#photo-input").addEventListener("change", (e) => {
        addFiles(e.target.files);
        e.target.value = "";
      });

      // Drop files anywhere on the page, or paste an image
      const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
      let dragDepth = 0;
      document.addEventListener("dragenter", (e) => {
        if (!hasFiles(e)) return;
        dragDepth++;
        document.body.classList.add("dragging");
      });
      document.addEventListener("dragleave", (e) => {
        if (hasFiles(e) && --dragDepth <= 0) document.body.classList.remove("dragging");
      });
      document.addEventListener("dragover", (e) => {
        if (hasFiles(e)) e.preventDefault();
      });
      document.addEventListener("drop", (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth = 0;
        document.body.classList.remove("dragging");
        addFiles(e.dataTransfer.files);
      });
      document.addEventListener("paste", (e) => {
        const files = [...(e.clipboardData?.files || [])];
        if (files.length) addFiles(files);
      });

      // Captions
      boardEl.addEventListener("change", async (e) => {
        if (!e.target.matches(".cap input")) return;
        const im = images.find((i) => i.id === e.target.closest(".tile").dataset.id);
        im.caption = e.target.value.trim();
        await idb.put("images", im);
        toast("Caption saved.");
      });
      boardEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.matches(".cap input")) e.target.blur();
      });

      // Remove, or open the lightbox
      boardEl.addEventListener("click", async (e) => {
        const tile = e.target.closest(".tile");
        if (!tile || e.target.closest(".cap")) return;
        if (e.target.closest(".x")) {
          await idb.del("images", tile.dataset.id);
          URL.revokeObjectURL(urls.get(tile.dataset.id));
          urls.delete(tile.dataset.id);
          await load();
          toast("Picture removed.");
          return;
        }
        openLightbox(images.findIndex((i) => i.id === tile.dataset.id));
      });

      // Drag to rearrange
      let dragId = null;
      boardEl.addEventListener("dragstart", (e) => {
        const tile = e.target.closest(".tile");
        if (!tile) return;
        dragId = tile.dataset.id;
        tile.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", dragId);
      });
      boardEl.addEventListener("dragover", (e) => {
        const tile = e.target.closest(".tile");
        if (!dragId || !tile || tile.dataset.id === dragId) return;
        e.preventDefault();
        $$(".drag-over", boardEl).forEach((t) => t.classList.remove("drag-over"));
        tile.classList.add("drag-over");
      });
      boardEl.addEventListener("drop", async (e) => {
        const tile = e.target.closest(".tile");
        if (!dragId || !tile) return;
        e.preventDefault();
        e.stopPropagation();
        const from = images.findIndex((i) => i.id === dragId);
        const [moved] = images.splice(from, 1);
        images.splice(images.findIndex((i) => i.id === tile.dataset.id), 0, moved);
        images.forEach((im, i) => (im.order = i));
        draw();
        for (const im of images) await idb.put("images", im);
      });
      boardEl.addEventListener("dragend", () => {
        dragId = null;
        $$(".dragging, .drag-over", boardEl).forEach((t) => t.classList.remove("dragging", "drag-over"));
      });

      // Lightbox
      let current = 0;
      const show = () => {
        const im = images[current];
        $("img", lightbox).src = urlFor(im);
        $("img", lightbox).alt = im.caption || "Vision board picture";
        $("figcaption", lightbox).textContent = im.caption;
      };
      const openLightbox = (i) => {
        current = i;
        show();
        lightbox.hidden = false;
        $(".lb-close", lightbox).focus();
      };
      const step = (d) => {
        current = (current + d + images.length) % images.length;
        show();
      };
      const close = () => (lightbox.hidden = true);
      lightbox.addEventListener("click", (e) => {
        if (e.target.closest(".lb-prev")) step(-1);
        else if (e.target.closest(".lb-next")) step(1);
        else if (e.target.closest(".lb-close") || e.target === lightbox) close();
      });
      document.addEventListener("keydown", (e) => {
        if (lightbox.hidden) return;
        if (e.key === "Escape") close();
        if (e.key === "ArrowLeft") step(-1);
        if (e.key === "ArrowRight") step(1);
      });
      let touchX = null;
      lightbox.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
      lightbox.addEventListener("touchend", (e) => {
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      });

      load().catch(() => toast("Couldn't load your pictures."));
    },

    rules() {
      const h = hiatus();
      const today = dateKey();
      // Any day from the start of the hiatus up to today can be looked at and fixed
      const first = h.start < today ? h.start : today;
      const asked = new URLSearchParams(location.search).get("day");
      let day = asked && asked >= first && asked <= today ? asked : today;
      const keptOn = () => store.get("rulesKept", {})[day] || [];
      // A rule counts from the day it was written, same as the check-in grid
      const activeOn = (r) => r.at <= day;
      const listRoot = $("#rules-list");
      const keptIn = (kept, k, r) => (kept[k] || []).includes(r.id);

      // Days in a row this rule was kept, up to the day being viewed. Not ticked yet today doesn't break it.
      function ruleStreak(r, kept) {
        let k = day;
        if (k === today && !keptIn(kept, k, r)) k = addDays(k, -1);
        let n = 0;
        while (keptIn(kept, k, r)) {
          n++;
          k = addDays(k, -1);
        }
        return n;
      }

      // The 7 days ending on the day being viewed: filled = kept, ring = missed
      function weekDots(r, kept) {
        let keptCount = 0;
        const dots = Array.from({ length: 7 }, (_, i) => {
          const k = addDays(day, i - 6);
          const on = keptIn(kept, k, r);
          if (on) keptCount++;
          const state = on ? "on" : k < r.at || k < h.start ? "na" : k === today ? "now" : "off";
          const label = { on: "kept", na: "before this rule", now: "not yet", off: "missed" }[state];
          return `<span class="wd ${state}" title="${fmtDate(k, LONG_DATE)} · ${label}"><i></i><small>${fmtDate(k, { weekday: "narrow" })}</small></span>`;
        }).join("");
        return `<div class="week-dots" role="img" aria-label="Last 7 days: kept ${keptCount} of 7">${dots}</div>`;
      }

      // Edit a rule's wording in place; its history stays because it keeps the same id
      let editing = null;
      function finishEdit(save) {
        if (!editing) return;
        const { item, input } = editing;
        editing = null;
        const text = input.value.trim();
        if (save && text && text !== item.text) {
          item.text = text;
          list.save();
          toast("Rule updated.");
        } else list.redraw();
      }
      listRoot.addEventListener("keydown", (e) => {
        if (!e.target.matches(".rule-edit")) return;
        if (e.key === "Enter") finishEdit(true);
        if (e.key === "Escape") finishEdit(false);
      });
      listRoot.addEventListener("focusout", (e) => {
        if (e.target.matches(".rule-edit")) finishEdit(true);
      });

      const list = makeList(listRoot, {
        key: "rules",
        numbered: true,
        visible: activeOn,
        fields: [{ name: "text", label: "Write a rule — e.g. No phone for the first hour of the day", required: true }],
        check: {
          label: "Kept",
          isOn: (it) => keptOn().includes(it.id),
          set(it, on) {
            const all = store.get("rulesKept", {});
            const ids = new Set(all[day] || []);
            on ? ids.add(it.id) : ids.delete(it.id);
            all[day] = [...ids];
            store.set("rulesKept", all);
          },
        },
        render(it) {
          if (editing?.item === it)
            return `<input class="rule-edit" type="text" value="${esc(it.text)}" aria-label="Edit rule" maxlength="200" autocomplete="off" />
              <div class="meta">Enter to save · Esc to cancel</div>`;
          const c = checkinData();
          const s = ruleStats(it, c, h);
          const inRow = ruleStreak(it, c.kept);
          const meta = s.total ? `Kept ${s.kept} of ${plural(s.total, "day")}` : "Starts counting when your hiatus does";
          return `<div class="item-title">${esc(it.text)}</div>
            <div class="meta">${meta}${inRow >= 2 ? ` · 🔥 ${inRow} days in a row` : ""}</div>
            ${s.total ? weekDots(it, c.kept) : ""}`;
        },
        actions: [
          {
            id: "edit",
            show: (it) => editing?.item !== it,
            label: () => "Edit",
            run(it) {
              editing = { item: it };
              setTimeout(() => {
                const input = $(`[data-id="${it.id}"] .rule-edit`, listRoot);
                if (!input) return;
                editing.input = input;
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
              });
            },
          },
        ],
        empty: "No rules yet. Start with the one you break most often.",
        onChange(items) {
          const shown = items.filter(activeOn);
          const kept = shown.filter((r) => keptOn().includes(r.id)).length;
          $("#rules-today").textContent = `${kept}/${shown.length}`;
          $("#rules-bar").style.width = shown.length ? (kept / shown.length) * 100 + "%" : "0";
        },
        onCheck(it, on, items) {
          const shown = items.filter(activeOn);
          if (on && shown.length && shown.every((r) => keptOn().includes(r.id))) {
            confetti(160);
            toast(day === today ? "Every rule kept today. That's discipline." : `Every rule kept on ${fmtDate(day, LONG_DATE)}.`);
          }
        },
      });

      function showDay() {
        const n = daysBetween(h.start, day) + 1;
        const isToday = day === today;
        $("#day-title").textContent = isToday ? "Today" : day === addDays(today, -1) ? "Yesterday" : fmtDate(day, { weekday: "long" });
        $("#day-date").textContent = `${n >= 1 && n <= TOTAL_DAYS ? `Day ${n} · ` : ""}${fmtDate(day, LONG_DATE)}`;
        $("#day-prev").hidden = day <= first;
        $("#day-next").hidden = isToday;
        $("#day-prev").textContent = n - 1 >= 1 && n - 1 <= TOTAL_DAYS ? `‹ Day ${n - 1}` : "‹ Back";
        $("#day-next").textContent = addDays(day, 1) === today ? "Today ›" : n + 1 >= 1 && n + 1 <= TOTAL_DAYS ? `Day ${n + 1} ›` : "Next ›";
        $("#rules-when").textContent = isToday ? "kept today" : `kept on ${fmtDate(day)}`;
        $("#past-note").hidden = isToday;
        listRoot.classList.toggle("past", !isToday);
        list.redraw();
        history.replaceState(null, "", isToday ? location.pathname : `?day=${day}`);
      }
      $("#day-prev").addEventListener("click", () => {
        day = addDays(day, -1);
        showDay();
      });
      $("#day-next").addEventListener("click", () => {
        day = addDays(day, 1);
        showDay();
      });
      // Arrow keys step through days too
      document.addEventListener("keydown", (e) => {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
        if (e.key === "ArrowLeft" && day > first) $("#day-prev").click();
        if (e.key === "ArrowRight" && day < today) $("#day-next").click();
      });
      showDay();
    },

    resources() {
      const toHref = (u) => {
        if (!u) return "";
        if (/^https?:\/\//i.test(u)) return u;
        if (/^[\w-]+(\.[\w-]+)+/.test(u)) return "https://" + u;
        return "";
      };
      makeList($("#resources-list"), {
        key: "resources",
        fields: [
          { name: "title", label: "Title — e.g. Can't Hurt Me", required: true },
          { name: "url", label: "Link (optional)" },
          { name: "kind", label: "Type", type: "select", options: ["Book", "Video", "Podcast", "Course", "Mentor", "Tool", "Other"] },
        ],
        render: (it) => {
          const href = toHref(it.url);
          const title = href
            ? `<a class="item-title" href="${esc(href)}" target="_blank" rel="noopener">${esc(it.title)} ↗</a>`
            : `<span class="item-title">${esc(it.title)}</span>`;
          return `<div class="item-row"><span class="tag">${esc(it.kind)}</span>${title}</div>`;
        },
        empty: "Nothing saved yet. What's feeding your growth right now?",
      });
    },

    goals() {
      const today = dateKey();
      const form = $("#goal-form");
      const fields = form.elements;
      const preview = $("#goal-preview");
      const listEl = $("#goal-items");
      const emptyEl = $("#goals-empty");
      let goals = store.get("goals", []);
      const asking = new Set(); // goals showing the "how much does it cost" form
      const editing = new Set();
      const openHistory = new Set(); // goals with their payment list expanded
      let newId = null;

      const fmtTarget = (k) =>
        fmtDate(k, k.slice(0, 4) === today.slice(0, 4) ? undefined : { month: "short", day: "numeric", year: "numeric" });
      const stat = (num, label, cls = "") => `<div class="${cls}"><div class="stat-num">${num}</div><div class="stat-label">${label}</div></div>`;

      // What it takes to fund a money goal by its date
      function moneyPlan(g) {
        const have = goalSaved(g);
        const left = Math.max(0, g.target - have);
        const plan = { have, left, pct: g.target ? Math.min(1, have / g.target) : 0 };
        if (!g.by || !left) return plan;
        const days = daysBetween(today, g.by);
        if (days <= 0) return { ...plan, late: true };
        plan.perMonth = Math.ceil(left / Math.max(1, days / 30.44));
        plan.perWeek = Math.ceil(left / Math.max(1, days / 7));
        // Pace: where you'd be by now if you put in the same amount every day since you set it
        const start = g.since || g.at;
        const span = daysBetween(start, g.by);
        if (span > 0) {
          const base = g.saved || 0;
          plan.pace = have - (base + (g.target - base) * Math.min(1, Math.max(0, daysBetween(start, today)) / span));
        }
        return plan;
      }

      function dueHtml(g) {
        if (!g.by) return "";
        const left = daysBetween(today, g.by);
        const when = g.done
          ? "Done"
          : left < 0
            ? `${plural(-left, "day")} overdue`
            : left === 0
              ? "Due today"
              : `${plural(left, "day")} left`;
        return `<div class="meta${!g.done && left < 0 ? " overdue" : ""}">Target ${fmtTarget(g.by)} · ${when}</div>`;
      }

      function moneyHtml(g) {
        const p = moneyPlan(g);
        let facts;
        if (!p.left) facts = stat("Paid", "Fully funded");
        else if (!g.by) facts = `<p class="hint">Add a target date (tap Edit) to see how much to put in each month.</p>`;
        else if (p.late) facts = `<p class="hint overdue">${usd(p.left)} still to go and the target date has passed. Tap Edit to set a new one.</p>`;
        else {
          facts = stat(usd(p.perMonth), "Per month") + stat(usd(p.perWeek), "Per week");
          if (p.pace != null)
            facts += p.pace >= -1 ? stat("On track", "Pace") : stat(usd(-p.pace), "Behind pace", "behind");
        }
        const pays = g.payments || [];
        return `<div class="goal-detail">
          <div class="goal-nums"><span><b>${usd(p.have)}</b> of ${usd(g.target)}</span><span>${Math.floor(p.pct * 100)}%</span></div>
          <div class="progress slim"><i style="width:${p.pct * 100}%"></i></div>
          <div class="goal-facts">${facts}</div>
          ${
            g.done || !p.left
              ? ""
              : `<form class="inline-form pay-form" data-form="pay">
                  <label class="field">Add money you've put toward it
                    <input type="text" name="amount" inputmode="decimal" placeholder="$250" autocomplete="off" required />
                  </label>
                  <button class="btn" type="submit">+ Add money</button>
                </form>`
          }
          ${
            pays.length
              ? `<details class="history pay-history"${openHistory.has(g.id) ? " open" : ""}>
                  <summary>${plural(pays.length, "payment")} · last ${usd(pays.at(-1).amount)} on ${fmtDate(pays.at(-1).date)}</summary>
                  <ul>${pays
                    .map((pay, i) => ({ pay, i }))
                    .reverse()
                    .map(
                      ({ pay, i }) => `<li><span>${fmtDate(pay.date, LONG_DATE)}</span><b>${usd(pay.amount)}</b>
                        <button class="step-del" type="button" data-act="pay-del" data-pay="${i}" aria-label="Remove this payment">×</button></li>`
                    )
                    .join("")}</ul>
                </details>`
              : ""
          }
        </div>`;
      }

      function stepsHtml(g) {
        const steps = g.steps || [];
        const done = steps.filter((s) => s.done).length;
        const left = steps.length - done;
        let pace = "";
        if (left && g.by && !g.done) {
          const every = Math.floor(daysBetween(today, g.by) / left);
          if (every > 0) pace = `${plural(left, "step")} left · about ${every === 1 ? "one a day" : `one every ${every} days`} to finish on time`;
        }
        const list = steps.length
          ? `<div class="goal-nums"><span><b>${done}</b> of ${plural(steps.length, "step")} done</span><span>${Math.round((done / steps.length) * 100)}%</span></div>
            <div class="progress slim"><i style="width:${(done / steps.length) * 100}%"></i></div>
            ${pace ? `<p class="meta">${pace}</p>` : ""}
            <ul class="steps">${steps
              .map(
                (s) => `<li class="${s.done ? "done" : ""}" data-step="${s.id}">
                  <label><input type="checkbox" class="check"${s.done ? " checked" : ""} /><span>${esc(s.text)}</span></label>
                  <button class="step-del" type="button" data-act="step-del" aria-label="Remove step">×</button>
                </li>`
              )
              .join("")}</ul>`
          : `<p class="hint">Break it into signs of progress you can check off. Try <b>the very first step</b>, <b>a sign you're halfway</b>, or <b>something to do every week</b>.</p>`;
        return `<div class="goal-detail">${list}${
          g.done
            ? ""
            : `<form class="inline-form" data-form="step">
                <input type="text" name="text" placeholder="Add a step or sign of progress" aria-label="New step" autocomplete="off" required />
                <button class="mini" type="submit">Add</button>
              </form>`
        }</div>`;
      }

      // Goals made before goal types existed get asked once
      function askHtml(g) {
        if (asking.has(g.id))
          return `<form class="inline-form" data-form="setup">
            <input type="text" name="target" inputmode="decimal" placeholder="Total cost, e.g. $18,000" aria-label="Total cost" autocomplete="off" required />
            <input type="text" name="saved" inputmode="decimal" placeholder="Already put toward it" aria-label="Already put toward it" autocomplete="off" />
            <button class="mini" type="submit">Save</button>
            <button class="mini" type="button" data-act="cancel">Cancel</button>
          </form>`;
        return `<div class="goal-ask"><span>Does this goal cost money?</span>
          <button class="mini" type="button" data-act="ask-money">Yes</button>
          <button class="mini" type="button" data-act="ask-steps">No, I'll track steps</button>
        </div>`;
      }

      function editHtml(g) {
        const money = g.kind === "money";
        return `<form class="edit-form" data-form="edit">
          <label class="field">Goal<input type="text" name="text" value="${esc(g.text)}" required /></label>
          <div class="goal-form-grid">
            ${
              money
                ? `<label class="field">Total cost<input type="text" name="target" inputmode="decimal" value="${g.target}" required /></label>
                   <label class="field">Already had toward it<input type="text" name="saved" inputmode="decimal" value="${g.saved || 0}" /></label>`
                : ""
            }
            <label class="field">Target date<input type="date" name="by" value="${g.by || ""}" /></label>
          </div>
          <div class="btn-row">
            <button class="mini" type="submit">Save</button>
            <button class="mini" type="button" data-act="cancel">Cancel</button>
            ${g.kind ? `<button class="mini" type="button" data-act="switch">${money ? "It's not a money goal" : "Make it a money goal"}</button>` : ""}
            ${picFor(g) ? `<button class="mini" type="button" data-act="pic-remove">Remove picture</button>` : ""}
          </div>
        </form>`;
      }

      function itemHtml(g) {
        const body = editing.has(g.id)
          ? editHtml(g)
          : `${picFor(g) ? `<button class="goal-pic" type="button" data-act="pic" aria-label="Change picture"><img src="${picFor(g)}" alt="" /></button>` : ""}
            <div class="item-title">${esc(g.text)}${g.kind === "money" ? ' <span class="tag">Money</span>' : ""}</div>
            ${dueHtml(g)}
            ${g.kind === "money" ? moneyHtml(g) : g.kind === "steps" ? stepsHtml(g) : askHtml(g)}
            ${
              asking.has(g.id)
                ? ""
                : `<button class="mini" type="button" data-act="edit">Edit</button>${
                    picFor(g) || !pics.length ? "" : ` <button class="mini" type="button" data-act="pic">＋ Picture</button>`
                  }`
            }`;
        return `<li class="item goal${g.done ? " done" : ""}${g.id === newId ? " new" : ""}" data-id="${g.id}">
          <input type="checkbox" class="check" data-act="done" aria-label="Mark complete"${g.done ? " checked" : ""} />
          <div class="item-body">${body}</div>
          <button class="del" type="button" data-act="delete" aria-label="Delete goal">×</button>
        </li>`;
      }

      function draw() {
        // Closest target date first; goals with no date after those, finished goals last
        const order = (g) => (g.done ? 2 : g.by ? 0 : 1);
        const sorted = [...goals].sort((a, b) => order(a) - order(b) || (a.by || "").localeCompare(b.by || ""));
        listEl.innerHTML = sorted.map(itemHtml).join("");
        emptyEl.hidden = goals.length > 0;
        newId = null;
        const done = goals.filter((g) => g.done).length;
        const pct = goals.length ? Math.round((done / goals.length) * 100) : 0;
        $("#goal-pct").textContent = pct + "%";
        $("#goal-count").textContent = `${done} of ${goals.length} complete`;
        $("#goal-bar").style.width = pct + "%";
      }

      function save(refocus) {
        store.set("goals", goals);
        draw();
        if (refocus) $(`[data-id="${refocus.id}"] [data-form="${refocus.form}"] input`)?.focus();
      }

      // ---- Board pictures on goals: the picture of what the goal is for
      let pics = [];
      const picUrls = new Map();
      const picFor = (g) => (g.pic && picUrls.get(g.pic)) || "";
      idb
        .all("images")
        .then((all) => {
          pics = all.sort((a, b) => a.order - b.order);
          pics.forEach((im) => picUrls.set(im.id, URL.createObjectURL(im.blob)));
          if (pics.length) draw();
        })
        .catch(() => {});

      document.body.insertAdjacentHTML(
        "beforeend",
        `<div class="sheet" id="pic-picker" hidden role="dialog" aria-modal="true" aria-label="Choose a picture">
          <div class="sheet-card">
            <div class="sheet-head"><b>Pick a picture for this goal</b><button class="lb-btn" type="button" data-close aria-label="Close">×</button></div>
            <div class="pic-grid"></div>
            <p class="hint">These come from your <a href="Board.html" style="color: var(--accent)">Board</a>.</p>
          </div>
        </div>
        <div class="sheet goal-win" id="goal-win" hidden role="dialog" aria-modal="true" aria-label="Goal complete">
          <div class="win-card">
            <img alt="" />
            <p class="eyebrow">Goal complete</p>
            <h2 class="win-title"></h2>
            <p class="win-sub">You saw it. Now you have it.</p>
            <button class="btn" type="button" data-close>Keep going</button>
          </div>
        </div>`
      );
      const picker = $("#pic-picker");
      const win = $("#goal-win");
      let pickingFor = null;
      function openPicker(g) {
        pickingFor = g;
        $(".pic-grid", picker).innerHTML = pics
          .map(
            (im) => `<button class="pic-opt${g.pic === im.id ? " on" : ""}" type="button" data-pic="${im.id}" aria-label="${esc(im.caption || "Board picture")}">
              <img src="${picUrls.get(im.id)}" alt="" />
            </button>`
          )
          .join("");
        picker.hidden = false;
        $(".pic-opt", picker)?.focus();
      }
      const closeSheets = () => {
        picker.hidden = true;
        win.hidden = true;
      };
      for (const sheet of [picker, win]) {
        sheet.addEventListener("click", (e) => {
          const opt = e.target.closest("[data-pic]");
          if (opt && pickingFor) {
            pickingFor.pic = opt.dataset.pic;
            closeSheets();
            return save();
          }
          if (e.target === sheet || e.target.closest("[data-close]")) closeSheets();
        });
      }
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeSheets();
      });

      function celebrate(g) {
        if (picFor(g)) {
          $("img", win).src = picFor(g);
          $(".win-title", win).textContent = g.text;
          win.hidden = false;
          $("[data-close]", win).focus();
        }
        if (goals.every((x) => x.done)) {
          confetti(220);
          toast("Every goal complete. Set bigger ones.");
        } else {
          confetti(70);
          toast(g.kind === "money" ? "Fully funded. That one's handled." : "Goal complete. Keep moving.");
        }
      }

      // ---- New goal form: just the goal at first; "Add goal" opens the questions about it
      const details = $("#goal-details");
      const nextBtn = $("#goal-next");
      const radios = $$('input[name="kind"]', form);
      function openDetails() {
        details.hidden = false;
        nextBtn.hidden = true;
        form.classList.add("open");
        radios.forEach((r) => (r.required = true));
        radios[0].focus();
      }
      function closeDetails() {
        form.reset();
        details.hidden = true;
        nextBtn.hidden = false;
        form.classList.remove("open");
        radios.forEach((r) => (r.required = false));
        syncForm();
      }
      $("#goal-cancel").addEventListener("click", closeDetails);

      // Shows the monthly number as you type
      function syncForm() {
        const money = fields.kind.value === "money";
        $$("[data-money]", form).forEach((el) => (el.hidden = !money));
        fields.target.required = money;
        const target = parseMoney(fields.target.value);
        const left = target - (parseMoney(fields.saved.value) || 0);
        const days = fields.by.value ? daysBetween(today, fields.by.value) : 0;
        let msg = "";
        if (money && target > 0 && left <= 0) msg = "Already covered. Nice.";
        else if (money && target > 0 && !fields.by.value) msg = "Pick a target date to see what to put in each month.";
        else if (money && target > 0 && days <= 0) msg = "Pick a date in the future.";
        else if (money && target > 0)
          msg = `That's ${usd(Math.ceil(left / Math.max(1, days / 30.44)))} a month (about ${usd(
            Math.ceil(left / Math.max(1, days / 7))
          )} a week) until ${fmtTarget(fields.by.value)}.`;
        else if (fields.kind.value === "steps") msg = "Next you'll add the steps that show you're getting there.";
        preview.textContent = msg;
        preview.hidden = !msg;
      }
      form.addEventListener("input", syncForm);
      form.addEventListener("change", syncForm);

      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = fields.text.value.trim();
        if (!text) return;
        if (details.hidden) return openDetails();
        const g = { id: uid(), at: today, done: false, text, by: fields.by.value, kind: fields.kind.value };
        if (g.kind === "money") {
          const target = parseMoney(fields.target.value);
          if (!(target > 0)) return fields.target.focus();
          Object.assign(g, { target, saved: parseMoney(fields.saved.value) || 0, payments: [] });
        } else g.steps = [];
        goals.push(g);
        newId = g.id;
        closeDetails();
        save(g.kind === "steps" ? { id: g.id, form: "step" } : null);
        toast(g.kind === "money" ? "Goal added. Log money toward it as you go." : "Goal added. Now list the steps.");
      });

      // ---- Goal cards
      const goalFor = (el) => goals.find((g) => g.id === el.closest(".goal").dataset.id);

      listEl.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const g = goalFor(btn);
        switch (btn.dataset.act) {
          case "delete":
            if (!confirm(`Delete “${g.text}”?`)) return;
            goals = goals.filter((x) => x !== g);
            break;
          case "edit":
            editing.add(g.id);
            draw();
            return $(`[data-id="${g.id}"] [name="text"]`)?.focus();
          case "cancel":
            editing.delete(g.id);
            asking.delete(g.id);
            return draw();
          case "ask-money":
            asking.add(g.id);
            draw();
            return $(`[data-id="${g.id}"] [name="target"]`)?.focus();
          case "ask-steps":
            g.kind = "steps";
            g.steps ||= [];
            return save({ id: g.id, form: "step" });
          case "switch":
            editing.delete(g.id);
            if (g.kind === "money") {
              g.kind = "steps";
              g.steps ||= [];
            } else {
              delete g.kind;
              asking.add(g.id);
            }
            break;
          case "pay-del": {
            const pay = g.payments[Number(btn.dataset.pay)];
            if (!pay || !confirm(`Remove the ${usd(pay.amount)} payment from ${fmtDate(pay.date)}?`)) return;
            g.payments = g.payments.filter((x) => x !== pay);
            if (g.done && goalSaved(g) < g.target) g.done = false;
            break;
          }
          case "step-del":
            g.steps = g.steps.filter((s) => s.id !== btn.closest("[data-step]").dataset.step);
            break;
          case "pic":
            return openPicker(g);
          case "pic-remove":
            delete g.pic;
            break;
        }
        save();
      });

      listEl.addEventListener(
        "toggle",
        (e) => {
          if (!e.target.matches(".pay-history")) return;
          const id = e.target.closest(".goal").dataset.id;
          e.target.open ? openHistory.add(id) : openHistory.delete(id);
        },
        true
      );

      listEl.addEventListener("change", (e) => {
        if (!e.target.classList.contains("check")) return;
        const g = goalFor(e.target);
        const stepEl = e.target.closest("[data-step]");
        if (!stepEl) {
          g.done = e.target.checked;
          save();
          if (g.done) celebrate(g);
          return;
        }
        const step = g.steps.find((s) => s.id === stepEl.dataset.step);
        step.done = e.target.checked;
        save();
        if (step.done && g.steps.every((s) => s.done)) toast("Every step done. Tick the goal off when it's real.");
      });

      listEl.addEventListener("submit", (e) => {
        e.preventDefault();
        const f = e.target;
        const g = goalFor(f);
        const v = Object.fromEntries(new FormData(f));
        switch (f.dataset.form) {
          case "pay": {
            const amount = parseMoney(v.amount);
            if (!(amount > 0)) return;
            g.payments = [...(g.payments || []), { date: today, amount }];
            const left = g.target - goalSaved(g);
            if (left <= 0) {
              g.done = true;
              save();
              return celebrate(g);
            }
            save({ id: g.id, form: "pay" });
            return toast(`${usd(amount)} added. ${usd(left)} to go.`);
          }
          case "step":
            if (!v.text.trim()) return;
            g.steps = [...(g.steps || []), { id: uid(), text: v.text.trim(), done: false }];
            return save({ id: g.id, form: "step" });
          case "setup": {
            const target = parseMoney(v.target);
            if (!(target > 0)) return;
            Object.assign(g, { kind: "money", target, saved: parseMoney(v.saved) || 0, payments: g.payments || [], since: today });
            asking.delete(g.id);
            return save();
          }
          case "edit": {
            if (!v.text.trim()) return;
            g.text = v.text.trim();
            g.by = v.by;
            if (g.kind === "money") {
              const target = parseMoney(v.target);
              if (target > 0) g.target = target;
              g.saved = parseMoney(v.saved) || 0;
            }
            editing.delete(g.id);
            return save();
          }
        }
      });

      draw();
      syncForm();

      // Millionaire by 30
      const money = store.get("money", { birthday: "", history: [] });
      const amountInput = $("#money-amount");
      const birthdayInput = $("#birthday");
      birthdayInput.value = money.birthday;

      function untilThirty(birthday) {
        const thirty = parseKey(birthday);
        thirty.setFullYear(thirty.getFullYear() + 30);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (thirty <= now) return null;
        let months = (thirty.getFullYear() - now.getFullYear()) * 12 + (thirty.getMonth() - now.getMonth());
        if (thirty.getDate() < now.getDate()) months--;
        // Whole months left, then the days after the last whole month
        const afterMonths = new Date(now.getFullYear(), now.getMonth() + months, now.getDate());
        const days = Math.max(0, Math.round((thirty - afterMonths) / 864e5));
        return { months: Math.max(months, 1), years: Math.floor(months / 12), rest: months % 12, days, date: dateKey(thirty) };
      }

      // Net worth milestones on the way to the million
      const MILESTONES = [1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5, 1e6];
      const short = (v) => (v >= 1e6 ? `$${v / 1e6}M` : `$${v / 1e3}K`);

      function renderMoney() {
        const latest = money.history.at(-1)?.amount ?? 0;
        const next = MILESTONES.find((m) => latest < m);
        $("#money-milestones").innerHTML = MILESTONES.map(
          (m) => `<span class="ms${latest >= m ? " hit" : m === next ? " next" : ""}">${latest >= m ? "✓ " : ""}${short(m)}</span>`
        ).join("");
        $("#money-next").textContent = next ? `Next milestone: ${short(next)} · ${usd(next - latest)} to go` : "Every milestone hit.";
        const pct = Math.min(1, Math.max(0, latest / 1e6));
        $("#money-now").textContent = usd(latest);
        $("#money-pct").textContent = `${(pct * 100).toFixed(pct < 0.1 ? 2 : 1)}% of the way`;
        $("#money-bar").style.width = pct * 100 + "%";

        let time = "–";
        let needed = "–";
        if (latest >= 1e6) {
          time = "Done";
          needed = "You made it";
        } else if (money.birthday) {
          const t = untilThirty(money.birthday);
          if (t) {
            time = [t.years && `${t.years}y`, (t.years || t.rest) && `${t.rest}m`, `${t.days}d`].filter(Boolean).join(" ");
            needed = usd(Math.ceil((1e6 - latest) / t.months));
          } else {
            time = "Past 30";
            needed = "Keep going";
          }
        }
        $("#money-time").textContent = time;
        $("#money-needed").textContent = needed;
        $("#money-needed-note").hidden = !needed.startsWith("$");

        const recent = money.history.slice(-5);
        const before = money.history[money.history.length - recent.length - 1];
        $("#money-log").innerHTML = recent
          .map((entry, i) => {
            const prev = i ? recent[i - 1] : before;
            const delta = prev ? entry.amount - prev.amount : null;
            const deltaHtml =
              delta == null ? "" : ` <span class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : "−"}${usd(Math.abs(delta))}</span>`;
            return `<li><span>${fmtDate(entry.date, LONG_DATE)}</span><span>${usd(entry.amount)}${deltaHtml}</span></li>`;
          })
          .reverse()
          .join("");
        drawChart();
      }

      // ---- Net worth over time: one line, your updates as the points
      const chartWrap = $("#money-chart-wrap");
      const chartEl = $("#money-chart");
      const tip = $("#chart-tip");
      const compact = (v) => {
        const a = Math.abs(v);
        const s = a >= 1e6 ? `$${+(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${+(a / 1e3).toFixed(1)}K` : `$${a}`;
        return v < 0 ? "−" + s : s;
      };
      const niceStep = (raw) => {
        const pow = 10 ** Math.floor(Math.log10(raw));
        const n = raw / pow;
        return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
      };
      let chartPts = [];
      let chartGeom = null;

      function drawChart() {
        const hist = money.history;
        $("#money-chart-note").hidden = hist.length !== 1;
        chartWrap.hidden = hist.length < 2;
        tip.hidden = true;
        if (hist.length < 2) return;

        const W = chartEl.clientWidth || 600;
        const H = 220;
        const m = { t: 18, r: 84, b: 28, l: 52 };
        const ts = hist.map((e) => parseKey(e.date).getTime());
        const vals = hist.map((e) => e.amount);
        const lowRaw = Math.min(0, ...vals);
        const highRaw = Math.max(0, ...vals);
        const step = niceStep((highRaw - lowRaw || 1000) / 4);
        const low = Math.floor(lowRaw / step) * step;
        const high = Math.max(Math.ceil(highRaw / step) * step, low + step);
        const x = (t) => m.l + ((t - ts[0]) / (ts.at(-1) - ts[0])) * (W - m.l - m.r);
        const y = (v) => m.t + ((high - v) / (high - low)) * (H - m.t - m.b);
        chartPts = hist.map((e, i) => ({ ...e, x: x(ts[i]), y: y(e.amount) }));
        chartGeom = { H, m };

        const ticks = [];
        for (let v = low; v <= high + step / 2; v += step) ticks.push(v);
        const line = chartPts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
        const area = `${line}L${chartPts.at(-1).x.toFixed(1)},${y(0)}L${chartPts[0].x.toFixed(1)},${y(0)}Z`;
        const first = chartPts[0];
        const last = chartPts.at(-1);
        const xLabels = [
          [first.x, "start", fmtDate(first.date)],
          ...(W > 480 && chartPts.length > 2 ? [[(first.x + last.x) / 2, "middle", fmtDate(dateKey(new Date((ts[0] + ts.at(-1)) / 2)))]] : []),
          [last.x, "end", fmtDate(last.date)],
        ];
        chartEl.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" tabindex="0" role="img"
            aria-label="Net worth from ${usd(first.amount)} on ${fmtDate(first.date)} to ${usd(last.amount)} on ${fmtDate(last.date)}, ${plural(hist.length, "update")}. Use the arrow keys to step through them.">
          <g class="chart-grid">${ticks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" />`).join("")}</g>
          <g class="chart-axis">
            ${ticks.map((v) => `<text x="${m.l - 10}" y="${y(v) + 4}" text-anchor="end">${compact(v)}</text>`).join("")}
            ${xLabels.map(([lx, anchor, label]) => `<text x="${lx}" y="${H - 6}" text-anchor="${anchor}">${label}</text>`).join("")}
          </g>
          <path class="chart-area" d="${area}" />
          <path class="chart-line" d="${line}" />
          <circle class="chart-dot" cx="${last.x}" cy="${last.y}" r="5" />
          <text class="chart-end" x="${last.x + 12}" y="${last.y + 4}">${compact(last.amount)}</text>
          <g class="chart-cross" visibility="hidden">
            <line y1="${m.t}" y2="${H - m.b}" />
            <circle class="chart-dot" r="5" />
          </g>
        </svg>`;
      }

      function showPoint(i) {
        const p = chartPts[i];
        const svg = $("svg", chartEl);
        if (!p || !svg) return;
        const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        const cross = $(".chart-cross", svg);
        cross.setAttribute("visibility", "visible");
        $("line", cross).setAttribute("x1", p.x);
        $("line", cross).setAttribute("x2", p.x);
        $("circle", cross).setAttribute("cx", p.x);
        $("circle", cross).setAttribute("cy", p.y);
        const prev = chartPts[i - 1];
        const delta = prev ? p.amount - prev.amount : null;
        tip.replaceChildren();
        const b = document.createElement("b");
        b.textContent = usd(p.amount);
        const sub = document.createElement("span");
        sub.textContent = fmtDate(p.date, LONG_DATE) + (delta == null ? "" : ` · ${delta >= 0 ? "+" : "−"}${usd(Math.abs(delta))}`);
        tip.append(b, sub);
        tip.hidden = false;
        const left = Math.min(Math.max(p.x * scale, 70), svg.getBoundingClientRect().width - 70);
        tip.style.left = left + "px";
        tip.style.top = Math.max(p.y * scale - 12, 0) + chartEl.offsetTop + "px";
        chartEl.dataset.focus = i;
      }
      function hidePoint() {
        tip.hidden = true;
        $(".chart-cross", chartEl)?.setAttribute("visibility", "hidden");
      }
      chartEl.addEventListener("pointermove", (e) => {
        const svg = $("svg", chartEl);
        if (!svg || !chartPts.length) return;
        const r = svg.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * svg.viewBox.baseVal.width;
        let best = 0;
        chartPts.forEach((p, i) => {
          if (Math.abs(p.x - px) < Math.abs(chartPts[best].x - px)) best = i;
        });
        showPoint(best);
      });
      chartEl.addEventListener("pointerleave", hidePoint);
      chartEl.addEventListener("focusin", () => showPoint(chartPts.length - 1));
      chartEl.addEventListener("focusout", hidePoint);
      chartEl.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const i = Number(chartEl.dataset.focus ?? chartPts.length - 1) + (e.key === "ArrowLeft" ? -1 : 1);
        showPoint(Math.min(Math.max(i, 0), chartPts.length - 1));
      });
      let chartWidth = 0;
      new ResizeObserver(() => {
        if (chartEl.clientWidth && chartEl.clientWidth !== chartWidth) {
          chartWidth = chartEl.clientWidth;
          drawChart();
        }
      }).observe(chartEl);

      birthdayInput.addEventListener("change", () => {
        money.birthday = birthdayInput.value;
        store.set("money", money);
        renderMoney();
      });
      $("#money-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const amount = Math.round(parseFloat(amountInput.value.replace(/[^\d.-]/g, "")));
        if (Number.isNaN(amount)) {
          amountInput.focus();
          return;
        }
        const today = dateKey();
        if (money.history.at(-1)?.date === today) money.history.pop();
        const before = money.history.at(-1)?.amount ?? 0;
        money.history.push({ date: today, amount });
        money.birthday = birthdayInput.value;
        // Celebrate each milestone the first time you cross it
        const crossed = MILESTONES.filter((m) => before < m && amount >= m && !(money.hit || []).includes(m));
        if (crossed.length) money.hit = [...(money.hit || []), ...crossed];
        store.set("money", money);
        amountInput.value = "";
        renderMoney();
        if (crossed.length) {
          confetti(260);
          toast(`Milestone: ${short(crossed.at(-1))} net worth. Keep stacking.`);
        } else toast("Number updated. Keep stacking.");
      });
      renderMoney();
    },

    hardships() {
      const HARD = ["", "Minor", "Rough", "Hard", "Very hard", "Brutal"];
      const dots = (n) => `<span class="hard-dots" title="How hard: ${n} of 5 (${HARD[n]})">${"●".repeat(n)}${"○".repeat(5 - n)}</span>`;

      makeList($("#hardships-list"), {
        key: "hardships",
        button: "Log it",
        fields: [
          { name: "what", label: "What happened?", type: "textarea", required: true },
          { name: "lesson", label: "What did it teach you?", type: "textarea" },
          { name: "tag", label: "Tag", type: "select", options: [{ value: "", label: "Tag it (optional)" }, ...HARDSHIP_TAGS] },
          {
            name: "hard",
            label: "How hard was it",
            type: "select",
            options: [{ value: "", label: "How hard? (optional)" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n} · ${HARD[n]}` }))],
          },
        ],
        render: (it) =>
          `<div class="meta">${fmtDate(it.at, LONG_DATE)}${it.tag ? ` · <span class="tag">${esc(it.tag)}</span>` : ""}${
            it.hard ? ` · ${dots(Number(it.hard))}` : ""
          }</div>
          <div class="item-title">${esc(it.what)}</div>
          ${it.lesson ? `<div class="lesson">${esc(it.lesson)}</div>` : ""}`,
        actions: [
          {
            id: "claude",
            show: () => true,
            label: () => "✦ Ask Claude",
            run(it) {
              openClaude(hardshipPrompt(it));
            },
          },
          {
            id: "rule",
            show: (it) => !!it.lesson,
            label: (it) => (it.ruled ? "Added to rules ✓" : "Make it a rule"),
            disabled: (it) => it.ruled,
            run(it) {
              const rules = store.get("rules", []);
              rules.push({ id: uid(), at: dateKey(), done: false, text: it.lesson });
              store.set("rules", rules);
              it.ruled = true;
              toast("Added to your rules.");
            },
          },
        ],
        empty: "Nothing logged. When something hits hard, write it here and find the lesson.",
        // Patterns: what keeps coming up, and how hard it's been, over the last 30 days
        onChange(items) {
          const since = addDays(dateKey(), -29);
          const recent = items.filter((it) => it.at >= since);
          const tags = tagCounts(recent);
          const rated = recent.filter((it) => it.hard).map((it) => Number(it.hard));
          const parts = [];
          // Only call one out as "most" when it's actually ahead
          if (tags.length && (tags.length === 1 || tags[0][1] > tags[1][1]))
            parts.push(`<b>${esc(tags[0][0])}</b> comes up most (${tags[0][1]})${tags.slice(1, 3).map(([t, n]) => ` · ${esc(t)} ${n}`).join("")}`);
          else if (tags.length) parts.push(tags.slice(0, 4).map(([t, n]) => `${esc(t)} ${n}`).join(" · "));
          if (rated.length) parts.push(`average how hard: <b>${avg(rated)}</b> / 5`);
          $("#hardship-patterns").innerHTML = parts.length ? `Last 30 days: ${parts.join(" · ")}` : "";
          $("#hardship-patterns").hidden = !parts.length;
        },
      });
    },

    pledge() {
      const today = dateKey();

      // 1. Gratitude — saved per day as you type
      const all = store.get("gratitude", {});
      const inputs = $$(".gratitude input");
      const status = $("#save-state");
      let statusTimer;

      function checkGratitude() {
        const vals = inputs.map((input) => input.value);
        claudeBtn.disabled = !vals.some((v) => v.trim());
        return vals;
      }

      // Reflect with Claude: open your own Claude (with its memory of you) with a prompt already written.
      // The prompt is also copied, in case Claude opens with an empty box.
      const claudeBtn = $("#claude-btn");
      claudeBtn.addEventListener("click", () => {
        const things = checkGratitude().map((v) => v.trim()).filter(Boolean);
        if (things.length) openClaude(gratitudePrompt(things));
      });
      // Claude projects don't fill in the message from a link, so the hint says to paste
      if (store.get("claudeProject", "")) $("#claude-hint").textContent = "Copies your prompt and opens your Claude project. Paste it in the message box and send.";

      inputs.forEach((input, i) => {
        input.value = (all[today] || [])[i] || "";
        input.addEventListener("input", () => {
          all[today] = checkGratitude();
          if (all[today].every((v) => !v.trim())) delete all[today];
          store.set("gratitude", all);
          status.textContent = "Saved";
          clearTimeout(statusTimer);
          statusTimer = setTimeout(() => (status.textContent = ""), 1500);
        });
      });
      checkGratitude();

      const past = Object.keys(all)
        .filter((d) => d !== today)
        .sort()
        .reverse()
        .slice(0, 14);
      if (past.length) {
        $("#gratitude-history").hidden = false;
        $("#gratitude-history ul").innerHTML = past
          .map(
            (d) =>
              `<li><b>${fmtDate(d, LONG_DATE)}</b>${all[d]
                .filter((v) => v.trim())
                .map(esc)
                .join(" · ")}</li>`
          )
          .join("");
      }

      // 2. Pledge — one tap a day builds the streak
      const btn = $("#pledge-btn");
      const pledges = new Set(store.get("pledges", []));
      const sync = () => {
        const done = pledges.has(today);
        btn.textContent = done ? "Pledged today ✓" : "I take this pledge";
        btn.classList.toggle("ghost", done);
        btn.disabled = done;
        $("#streak").textContent = streak();
      };
      btn.addEventListener("click", () => {
        pledges.add(today);
        store.set("pledges", [...pledges]);
        sync();
        confetti();
        toast("Pledge recorded. Now go make it real.");
      });
      sync();

      // Read it aloud, line by line
      const pledgeLines = store.get("pledgeText", DEFAULT_PLEDGE)
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      $("#pledge-text").innerHTML = pledgeLines
        .map(
          (l, i) =>
            `<span style="transition-delay:${i * 0.5}s">${i === 0 ? "“" : ""}${esc(l)}${i === pledgeLines.length - 1 ? "”" : ""}</span>`
        )
        .join("");
      const lines = $$(".pledge-text span");
      const speakBtn = $("#speak-btn");
      let speaking = false;
      const stopSpeaking = () => {
        speaking = false;
        lines.forEach((l) => l.classList.remove("speaking"));
        speakBtn.textContent = "▶ Read it to me";
      };
      const pickVoice = () => {
        const voices = speechSynthesis.getVoices();
        return (
          voices.find((v) => /^en[-_]US/i.test(v.lang) && /Samantha|Google US|Natural|Aaron|Evan/i.test(v.name)) ||
          voices.find((v) => /^en/i.test(v.lang))
        );
      };
      if (!("speechSynthesis" in window)) speakBtn.hidden = true;
      else speechSynthesis.getVoices();
      speakBtn.addEventListener("click", () => {
        speechSynthesis.cancel();
        if (speaking) return stopSpeaking();
        speaking = true;
        speakBtn.textContent = "■ Stop reading";
        const voice = pickVoice();
        lines.forEach((line, i) => {
          const u = new SpeechSynthesisUtterance(line.textContent.replace(/[“”]/g, ""));
          u.rate = 0.95;
          if (voice) u.voice = voice;
          u.onstart = () => {
            lines.forEach((l) => l.classList.remove("speaking"));
            line.classList.add("speaking");
          };
          if (i === lines.length - 1) u.onend = u.onerror = stopSpeaking;
          speechSynthesis.speak(u);
        });
      });

      // Record yourself saying it
      const recBtn = $("#rec-btn");
      const recState = $("#rec-state");
      const audio = $("#my-recording");
      let recorder = null;
      const showRecording = (blob) => {
        if (audio.src) URL.revokeObjectURL(audio.src);
        audio.src = URL.createObjectURL(blob);
        audio.hidden = false;
        recBtn.textContent = "● Record again";
      };
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) recBtn.hidden = true;
      else idb.get("audio", "pledge").then((b) => b && showRecording(b)).catch(() => {});

      recBtn.addEventListener("click", async () => {
        if (recorder) return recorder.stop();
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          toast("Microphone access was blocked.");
          return;
        }
        const chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          recorder = null;
          recState.hidden = true;
          showRecording(blob);
          try {
            await idb.put("audio", blob, "pledge");
            toast("Recording saved. Play it back any morning.");
          } catch {}
        };
        recorder.start();
        recBtn.textContent = "■ Stop recording";
        recState.hidden = false;
      });

      // 3. Visualize — 60 second breathing orb
      const orb = $("#orb");
      const label = $("#orb-label");
      const left = $("#vis-left");
      const vbtn = $("#visualize-btn");
      let timer = null;

      // The bell: Web Audio, so there's no sound file to load. iPhones only allow sound
      // that a tap started, so the Start tap unlocks it and the bell can ring 60s later.
      let bell = null;
      const unlockAudio = () => {
        try {
          bell ||= new (window.AudioContext || window.webkitAudioContext)();
          bell.resume?.();
        } catch {}
      };
      function ringBell() {
        if (bell) {
          const now = bell.currentTime;
          for (const at of [0, 1.2, 2.4]) {
            for (const [freq, vol] of [[659.25, 0.3], [987.77, 0.14], [1318.5, 0.07]]) {
              const osc = bell.createOscillator();
              const gain = bell.createGain();
              osc.frequency.value = freq;
              gain.gain.setValueAtTime(0.0001, now + at);
              gain.gain.exponentialRampToValueAtTime(vol, now + at + 0.02);
              gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 2.6);
              osc.connect(gain).connect(bell.destination);
              osc.start(now + at);
              osc.stop(now + at + 2.7);
            }
          }
        }
        navigator.vibrate?.([250, 150, 250, 150, 250]);
      }

      // Keep the screen on while your eyes are closed, so the phone doesn't lock mid-way
      let wakeLock = null;
      const keepAwake = async () => {
        try {
          wakeLock = await navigator.wakeLock?.request("screen");
        } catch {}
      };
      const letSleep = () => {
        wakeLock?.release().catch(() => {});
        wakeLock = null;
      };

      const stop = (finished) => {
        clearInterval(timer);
        timer = null;
        letSleep();
        orb.classList.remove("inhale");
        label.textContent = finished ? "Done" : "Ready";
        left.textContent = "60s";
        vbtn.textContent = "Start 60-second visualization";
        if (finished) {
          ringBell();
          confetti(90);
          toast("Hold that picture all day.");
        }
      };

      vbtn.addEventListener("click", () => {
        if (timer) return stop(false);
        unlockAudio();
        keepAwake();
        // Count from the clock, not from ticks, so a slow phone still ends at exactly 60s
        const endAt = Date.now() + 60000;
        let shown = 60;
        orb.classList.add("inhale");
        label.textContent = "Breathe in";
        left.textContent = "60s";
        vbtn.textContent = "Stop";
        timer = setInterval(() => {
          const secs = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
          if (secs === shown) return;
          shown = secs;
          left.textContent = secs + "s";
          if (secs <= 0) return stop(true);
          const inhale = Math.floor((60 - secs) / 4) % 2 === 0;
          orb.classList.toggle("inhale", inhale);
          label.textContent = inhale ? "Breathe in" : "Breathe out";
        }, 200);
      });
      // Coming back to the page re-takes the screen lock (switching apps drops it)
      document.addEventListener("visibilitychange", () => {
        if (timer && document.visibilityState === "visible") keepAwake();
      });
    },

    admin() {
      // ---- Tabs: one section at a time. The link (#claude etc.) and the last tab you used both work.
      const tabs = $$(".admin-tab");
      const panels = $$("[data-tab-panel]");
      const tabNote = (id, text) => {
        const el = $(`.admin-tab[data-tab="${id}"] .tab-note`);
        if (el) el.textContent = text;
      };
      function openTab(id) {
        if (!panels.some((pnl) => pnl.dataset.tabPanel === id)) id = "quotes";
        tabs.forEach((t) => {
          const on = t.dataset.tab === id;
          t.classList.toggle("active", on);
          t.setAttribute("aria-selected", on);
        });
        panels.forEach((pnl) => (pnl.hidden = pnl.dataset.tabPanel !== id));
        store.set("adminTab", id);
        history.replaceState(null, "", `#${id}`);
      }
      tabs.forEach((t) => t.addEventListener("click", () => openTab(t.dataset.tab)));
      addEventListener("hashchange", () => openTab(location.hash.slice(1)));

      // ---- Claude: tone and prompts, saved as you type, with a live preview
      const toneInput = $("#claude-tone");
      const promptInputs = { gratitude: $("#prompt-gratitude"), hardship: $("#prompt-hardship") };
      const preview = $("#prompt-preview");
      const claudeStatus = $("#claude-saved");
      let previewKind = "gratitude";
      let savedTimer;
      const SAMPLE_THINGS = ["My health", "My mom calling me last night", "Another day to build"];
      const SAMPLE_HARDSHIP = { what: "Skipped the gym three days in a row", hard: "3", tag: "Discipline", lesson: "" };

      function drawPreview() {
        const todays = (store.get("gratitude", {})[dateKey()] || []).map((v) => v.trim()).filter(Boolean);
        const lastHardship = store.get("hardships", []).at(-1);
        preview.textContent =
          previewKind === "gratitude" ? gratitudePrompt(todays.length ? todays : SAMPLE_THINGS) : hardshipPrompt(lastHardship || SAMPLE_HARDSHIP);
        $$("[data-preview]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.preview === previewKind));
        const tone = store.get("claudeTone", "").trim();
        $$("[data-tone]").forEach((b) => b.setAttribute("aria-pressed", CLAUDE_TONES[b.dataset.tone].line === tone));
        tabNote("claude", tone ? CLAUDE_TONES.find((t) => t.line === tone)?.label || "Custom tone" : "Usual tone");
      }
      function claudeSaved() {
        claudeStatus.textContent = "Saved";
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => (claudeStatus.textContent = ""), 1400);
        drawPreview();
      }
      $("#tone-presets").innerHTML = CLAUDE_TONES.map(
        (t, i) => `<button class="mini" type="button" data-tone="${i}" aria-pressed="false">${t.label}</button>`
      ).join("");
      $("#tone-presets").addEventListener("click", (e) => {
        const b = e.target.closest("[data-tone]");
        if (!b) return;
        toneInput.value = CLAUDE_TONES[b.dataset.tone].line;
        store.set("claudeTone", toneInput.value);
        claudeSaved();
      });
      toneInput.value = store.get("claudeTone", "");
      toneInput.addEventListener("input", () => {
        store.set("claudeTone", toneInput.value);
        claudeSaved();
      });
      for (const [kind, input] of Object.entries(promptInputs)) {
        input.value = promptText(kind);
        input.addEventListener("input", () => {
          const all = store.get("claudePrompts", {});
          all[kind] = input.value.trim() === DEFAULT_PROMPTS[kind] ? "" : input.value;
          store.set("claudePrompts", all);
          previewKind = kind;
          claudeSaved();
        });
      }
      $$("[data-reset-prompt]").forEach((b) =>
        b.addEventListener("click", () => {
          const kind = b.dataset.resetPrompt;
          const all = store.get("claudePrompts", {});
          delete all[kind];
          store.set("claudePrompts", all);
          promptInputs[kind].value = DEFAULT_PROMPTS[kind];
          previewKind = kind;
          claudeSaved();
        })
      );
      $$("[data-preview]").forEach((b) =>
        b.addEventListener("click", () => {
          previewKind = b.dataset.preview;
          drawPreview();
        })
      );
      drawPreview();

      // Quotes
      let quotes = getQuotes();
      let editingId = null;
      const qForm = $("#quote-form");
      const qList = $("#quote-items");
      const cleanQuote = (v) => v.trim().replace(/^["“”]+|["“”]+$/g, "").trim();

      function drawQuotes() {
        $("#quote-count").textContent = plural(quotes.length, "quote");
        tabNote("quotes", quotes.length);
        $("#quotes-empty").hidden = quotes.length > 0;
        qList.innerHTML = quotes
          .map((q) =>
            q.id === editingId
              ? `<li class="item" data-id="${q.id}"><form class="edit-form item-body" data-form="edit">
                  <label class="field">Quote<textarea name="q" rows="2" required>${esc(q.q)}</textarea></label>
                  <label class="field">Who said it<input type="text" name="a" value="${esc(q.a)}" autocomplete="off" /></label>
                  <div class="btn-row"><button class="mini" type="submit">Save</button><button class="mini" type="button" data-act="cancel">Cancel</button></div>
                </form></li>`
              : `<li class="item" data-id="${q.id}">
                  <div class="item-body">
                    <p class="quote-preview">“${quoteHtml(q.q)}”</p>
                    ${q.a ? `<p class="meta">— ${esc(q.a)}</p>` : ""}
                    <button class="mini" type="button" data-act="edit">Edit</button>
                  </div>
                  <button class="del" type="button" data-act="delete" aria-label="Delete quote">×</button>
                </li>`
          )
          .join("");
        $("#restore-quotes").hidden = DEFAULT_QUOTES.every((d) => quotes.some((q) => q.id === d.id));
      }
      const saveQuotes = () => {
        store.set("quotes", quotes);
        drawQuotes();
      };

      qForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = cleanQuote(qForm.elements.q.value);
        if (!q) return;
        quotes.unshift({ id: uid(), q, a: qForm.elements.a.value.trim() });
        qForm.reset();
        saveQuotes();
        toast("Quote added. It'll show up at the top of your pages.");
      });
      qForm.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) qForm.requestSubmit();
      });
      qList.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const q = quotes.find((x) => x.id === btn.closest(".item").dataset.id);
        if (btn.dataset.act === "edit") editingId = q.id;
        if (btn.dataset.act === "cancel") editingId = null;
        if (btn.dataset.act === "delete") {
          if (!confirm(`Delete “${plainQuote(q.q)}”?`)) return;
          quotes = quotes.filter((x) => x !== q);
          return saveQuotes();
        }
        drawQuotes();
        if (editingId) $(`[data-id="${editingId}"] textarea`)?.focus();
      });
      qList.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = quotes.find((x) => x.id === e.target.closest(".item").dataset.id);
        const text = cleanQuote(e.target.elements.q.value);
        if (!text) return;
        q.q = text;
        q.a = e.target.elements.a.value.trim();
        editingId = null;
        saveQuotes();
        toast("Quote saved.");
      });
      $("#restore-quotes").addEventListener("click", () => {
        quotes.push(...DEFAULT_QUOTES.filter((d) => !quotes.some((q) => q.id === d.id)));
        saveQuotes();
        toast("Starter quotes are back.");
      });
      drawQuotes();

      // Goals: quick edits to name, date and cost, or delete (tracking stays on the Goals page)
      let goals = store.get("goals", []);
      const goalsEl = $("#admin-goals");
      const goalStatus = (g) =>
        g.done
          ? "Done"
          : g.kind === "money"
            ? `${usd(goalSaved(g))} of ${usd(g.target)} put toward it`
            : g.kind === "steps"
              ? `${(g.steps || []).filter((x) => x.done).length} of ${plural((g.steps || []).length, "step")} done`
              : "Type not set yet (answer it on the Goals page)";
      function drawGoals() {
        const order = (g) => (g.done ? 2 : g.by ? 0 : 1);
        const sorted = [...goals].sort((a, b) => order(a) - order(b) || (a.by || "").localeCompare(b.by || ""));
        $("#admin-goals-empty").hidden = goals.length > 0;
        tabNote("goals", goals.length);
        goalsEl.innerHTML = sorted
          .map(
            (g) => `<li class="item admin-goal${g.done ? " done" : ""}" data-id="${g.id}">
              <div class="item-body">
                <div class="admin-goal-fields${g.kind === "money" ? " money" : ""}">
                  <label class="field">Goal<input type="text" name="text" value="${esc(g.text)}" autocomplete="off" /></label>
                  <label class="field">Target date<input type="date" name="by" value="${g.by || ""}" /></label>
                  ${
                    g.kind === "money"
                      ? `<label class="field">Total cost<input type="text" name="target" inputmode="decimal" value="${usd(g.target)}" autocomplete="off" /></label>`
                      : ""
                  }
                </div>
                <p class="meta">${goalStatus(g)}</p>
              </div>
              <button class="del" type="button" data-act="delete" aria-label="Delete goal">×</button>
            </li>`
          )
          .join("");
      }
      const saveGoals = () => store.set("goals", goals);
      goalsEl.addEventListener("change", (e) => {
        const li = e.target.closest(".admin-goal");
        const g = goals.find((x) => x.id === li.dataset.id);
        const input = e.target;
        if (input.name === "text") {
          if (!input.value.trim()) return (input.value = g.text);
          g.text = input.value.trim();
        } else if (input.name === "by") {
          g.by = input.value;
        } else if (input.name === "target") {
          const target = parseMoney(input.value);
          if (!(target > 0)) return (input.value = usd(g.target));
          g.target = target;
          input.value = usd(target);
          $(".meta", li).textContent = goalStatus(g);
        }
        saveGoals();
        toast("Goal saved.");
      });
      goalsEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.matches("input")) e.target.blur();
      });
      goalsEl.addEventListener("click", (e) => {
        if (!e.target.closest('[data-act="delete"]')) return;
        const g = goals.find((x) => x.id === e.target.closest(".admin-goal").dataset.id);
        if (!confirm(`Delete “${g.text}”? Its payments and steps go with it.`)) return;
        goals = goals.filter((x) => x !== g);
        saveGoals();
        drawGoals();
        toast("Goal deleted.");
      });
      drawGoals();

      // Pledge
      const pledgeInput = $("#pledge-input");
      pledgeInput.value = store.get("pledgeText", DEFAULT_PLEDGE);
      $("#pledge-form").addEventListener("submit", (e) => {
        e.preventDefault();
        if (!pledgeInput.value.trim()) return pledgeInput.focus();
        store.set("pledgeText", pledgeInput.value.trim());
        toast("Pledge saved.");
      });
      $("#pledge-reset").addEventListener("click", () => {
        if (!confirm("Put the original pledge back?")) return;
        pledgeInput.value = DEFAULT_PLEDGE;
        store.set("pledgeText", DEFAULT_PLEDGE);
        toast("Original pledge restored.");
      });

      // Claude project for "Reflect with Claude"
      const projectInput = $("#claude-project");
      projectInput.value = store.get("claudeProject", "");
      $("#claude-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const v = projectInput.value.trim();
        if (v && !/^https:\/\/claude\.ai\/project\/[\w-]+/.test(v)) {
          toast("That doesn't look like a Claude project link. It should start with https://claude.ai/project/");
          return projectInput.focus();
        }
        const clean = v ? v.split(/[?#]/)[0] : "";
        projectInput.value = clean;
        store.set("claudeProject", clean);
        toast(clean ? "Saved. Reflect with Claude now opens this project." : "Cleared. Reflect with Claude opens a new chat.");
      });

      // The hiatus
      const h = hiatus();
      const startInput = $("#admin-start");
      startInput.value = h.start;
      $("#admin-end").textContent = fmtDate(h.end, LONG_DATE);
      startInput.addEventListener("change", () => {
        if (!startInput.value) return;
        store.set("start", startInput.value);
        location.reload();
      });


      // Board pictures: remove the ones that no longer fit the vision
      const picsEl = $("#admin-pics");
      const picUrls = [];
      async function drawPics() {
        picUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
        let pics = [];
        try {
          pics = (await idb.all("images")).sort((a, b) => a.order - b.order);
        } catch {}
        $("#pics-empty").hidden = pics.length > 0;
        tabNote("pictures", pics.length);
        picsEl.innerHTML = pics
          .map((im) => {
            const url = URL.createObjectURL(im.blob);
            picUrls.push(url);
            return `<figure class="admin-pic" data-id="${im.id}">
              <img src="${url}" alt="${esc(im.caption || "Vision board picture")}" />
              ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ""}
              <button class="x" type="button" aria-label="Delete picture">×</button>
            </figure>`;
          })
          .join("");
      }
      picsEl.addEventListener("click", async (e) => {
        if (!e.target.closest(".x")) return;
        if (!confirm("Delete this picture from your board?")) return;
        await idb.del("images", e.target.closest("[data-id]").dataset.id);
        await drawPics();
        toast("Picture deleted.");
      });
      drawPics();

      backupControls();
      const lastBackup = store.get("lastBackup");
      tabNote("backup", lastBackup ? `${fmtDate(lastBackup)}` : "Never");
      tabNote("dates", `Day ${hiatus().shownDay}`);
      openTab(location.hash.slice(1) || store.get("adminTab", "quotes"));
    },

    review() {
      const h = hiatus();
      const c = checkinData();
      const finished = h.day >= TOTAL_DAYS;

      $("#review-eyebrow").textContent = finished ? "Day 60 · The final review" : `Day ${h.shownDay} of ${TOTAL_DAYS} · Progress review`;
      $("#review-title").innerHTML = finished ? "You <em>did</em> it." : "How it's <em>going</em>.";
      $("#review-lede").textContent = finished
        ? "Sixty days. Here's everything you built, kept and learned."
        : `${plural(h.left, "day")} to go. Here's everything so far. The full review is ready on day 60.`;

      const { complete } = renderCheckin($("#checkin-grid"));
      const goals = store.get("goals", []);
      const done = goals.filter((g) => g.done);
      const open = goals.filter((g) => !g.done);
      const hardships = store.get("hardships", []);
      const gratitude = Object.values(store.get("gratitude", {}))
        .flat()
        .map((v) => v.trim())
        .filter(Boolean);
      const money = store.get("money", { history: [] });

      let keptTotal = 0;
      let dayTotal = 0;
      const ruleRows = c.rules.map((r) => {
        const s = ruleStats(r, c, h);
        keptTotal += s.kept;
        dayTotal += s.total;
        return { r, s };
      });

      const stats = [
        [complete, "Complete days"],
        [longestStreak(), "Longest pledge streak"],
        [routineDays().size, "Full mornings done"],
        [`${done.length}/${goals.length}`, "Goals done"],
        [dayTotal ? Math.round((keptTotal / dayTotal) * 100) + "%" : "–", "Rules kept"],
        [hardships.length, "Hardships faced"],
        [gratitude.length, "Things you were grateful for"],
        ['<span id="pic-count">0</span>', "Pictures on the board"],
      ];
      if (money.history?.length) {
        const first = money.history[0].amount;
        const last = money.history.at(-1).amount;
        stats.push([usd(last), `Net worth (${last - first >= 0 ? "+" : "−"}${usd(Math.abs(last - first))})`]);
      }
      $("#stat-grid").innerHTML = stats
        .map(([n, l]) => `<div class="stat-card"><div class="stat-num">${n}</div><div class="stat-label">${l}</div></div>`)
        .join("");
      idb.count("images").then((n) => ($("#pic-count").textContent = n)).catch(() => {});

      const goalNote = (g) =>
        g.kind === "money"
          ? `${usd(goalSaved(g))} of ${usd(g.target)}`
          : g.steps?.length
            ? `${g.steps.filter((s) => s.done).length}/${g.steps.length} steps`
            : "";
      const listHtml = (arr, cls = "") =>
        `<ul class="plain-list ${cls}">${arr
          .map((g) => `<li>${esc(g.text)}${goalNote(g) ? ` <span class="muted-note">· ${goalNote(g)}</span>` : ""}</li>`)
          .join("")}</ul>`;
      $("#review-goals").innerHTML = goals.length
        ? (done.length ? `<p class="list-label">Done</p>${listHtml(done)}` : "") +
          (open.length ? `<p class="list-label">Still open</p>${listHtml(open, "open")}` : "")
        : `<p class="muted-note">No goals set yet. <a href="Goals.html">Add some →</a></p>`;

      $("#review-rules").innerHTML = ruleRows.length
        ? `<div class="bars">${ruleRows
            .map(({ r, s }) => {
              const pct = s.total ? Math.round((s.kept / s.total) * 100) : 0;
              return `<div><div class="bar-label"><span>${esc(r.text)}</span><span>${s.kept}/${s.total} days</span></div><div class="progress"><i style="width:${pct}%"></i></div></div>`;
            })
            .join("")}</div>`
        : `<p class="muted-note">No rules yet. <a href="Rules.html">Write your code →</a></p>`;

      // Hardships: what kept coming up, and whether it got easier over the 60 days
      const half = addDays(h.start, TOTAL_DAYS / 2);
      const hardIn = (list) => list.filter((x) => x.hard).map((x) => Number(x.hard));
      const early = hardIn(hardships.filter((x) => x.at < half));
      const late = hardIn(hardships.filter((x) => x.at >= half));
      const tags = tagCounts(hardships);
      const summary = [];
      if (tags.length) summary.push(`Most common: ${tags.slice(0, 3).map(([t, n]) => `<b>${esc(t)}</b> (${n})`).join(", ")}.`);
      if (early.length && late.length)
        summary.push(
          `How hard it got: <b>${avg(early)}</b> / 5 in the first ${TOTAL_DAYS / 2} days, <b>${avg(late)}</b> since. ${
            Number(avg(late)) < Number(avg(early))
              ? "It got easier, or you got tougher."
              : Number(avg(late)) > Number(avg(early))
                ? "The second half hit harder. You kept going."
                : "Steady all the way through."
          }`
        );
      else if (early.length || late.length) summary.push(`Average how hard: <b>${avg([...early, ...late])}</b> / 5 so far.`);
      $("#review-hardship-summary").innerHTML = summary.join(" ");
      $("#review-hardship-summary").hidden = !summary.length;

      const lessons = hardships.filter((x) => x.lesson);
      $("#review-lessons").innerHTML = lessons.length
        ? `<ul class="lessons">${lessons
            .map((x) => `<li><blockquote>“${esc(x.lesson)}”</blockquote><p>From: ${esc(x.what)} · ${fmtDate(x.at)}</p></li>`)
            .join("")}</ul>`
        : `<p class="muted-note">No lessons logged yet. They'll show up here from the Hardships page.</p>`;

      const sample = [...new Set(gratitude)].sort(() => Math.random() - 0.5).slice(0, 24);
      $("#review-gratitude").innerHTML = sample.length
        ? `<div class="chips">${sample.map((g) => `<span class="chip">${esc(g)}</span>`).join("")}</div>`
        : `<p class="muted-note">Your morning gratitude will collect here.</p>`;

      // Reflection — saved as you type
      const reflection = store.get("reflection", {});
      $$(".reflect textarea").forEach((ta) => {
        ta.value = reflection[ta.name] || "";
        ta.addEventListener("input", () => {
          reflection[ta.name] = ta.value;
          store.set("reflection", reflection);
        });
      });
    },
  };

  chrome();
  heroQuote();
  pages[page]?.();
  reveals();
})();
