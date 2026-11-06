'use strict';
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  /* ---------- Constants ---------- */
  const STORE_KEY = 'sarati.v1';
  const MEALS = [
    { id: 'b', name: 'الفطور' },
    { id: 'l', name: 'الغداء' },
    { id: 'd', name: 'العشاء' },
    { id: 's', name: 'سناك' },
  ];
  const MACROS = [['p', 'بروتين'], ['c', 'كارب'], ['f', 'دهون']];
  const ACTIVITY = [
    [1.2, 'قليل الحركة', 'عمل مكتبي بدون تمارين'],
    [1.375, 'نشاط خفيف', 'تمرين 1–3 أيام بالأسبوع'],
    [1.55, 'نشاط متوسط', 'تمرين 3–5 أيام بالأسبوع'],
    [1.725, 'نشاط عالي', 'تمرين 6–7 أيام بالأسبوع'],
    [1.9, 'نشاط عالي جداً', 'تمرين مكثف يومياً أو عمل بدني'],
  ];
  const GOALS = [
    [-0.75, 'تنشيف سريع', '−0.75 كجم بالأسبوع'],
    [-0.5, 'تنشيف', '−0.5 كجم بالأسبوع'],
    [-0.25, 'تنشيف خفيف', '−0.25 كجم بالأسبوع'],
    [0, 'ثبات الوزن', 'المحافظة على الوزن'],
    [0.25, 'زيادة نظيفة', '+0.25 كجم بالأسبوع'],
    [0.5, 'زيادة', '+0.5 كجم بالأسبوع'],
  ];
  const KCAL_PER_KG_WEEK = 1100; // ≈ 7700 kcal per kg of body weight ÷ 7 days
  const TITLES = { today: 'اليوم', foods: 'الأطعمة', progress: 'التقدم', profile: 'حسابي' };
  const ICON = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5h9l1-12.5M9.5 7V4.5h5V7"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5V4.5m0 0L7.5 9M12 4.5 16.5 9M5 19.5h14"/></svg>',
  };

  /* ---------- Helpers ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => {
    if (typeof v === 'number') return v;
    const s = String(v ?? '').trim()
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
      .replace(/[٫,،]/g, '.');
    return s === '' ? NaN : Number(s);
  };
  const r0 = (x) => Math.round(x);
  const r1 = (x) => Math.round(x * 10) / 10;
  const n0 = (x) => Math.round(x).toLocaleString('en-US');
  const g = (x) => (x > 0 && x < 10 ? r1(x) : r0(x));
  const fmtQty = (x) => String(Math.round(x * 100) / 100);
  const signed = (x, d = 1) => {
    const v = Number(x.toFixed(d));
    return `<bdi dir="ltr">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}</bdi>`;
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const unitName = (u) => (u === 'ml' ? 'مل' : 'غ');
  const mealName = (id) => (MEALS.find((m) => m.id === id) || MEALS[0]).name;
  const norm = (s) => String(s ?? '').toLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ').trim();

  /* ---------- Dates (local time, not UTC) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayKey = () => keyOf(new Date());
  const addDays = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const dayDiff = (a, b) => Math.round((dateOf(b) - dateOf(a)) / 86400000);
  const LOCALE = 'ar-u-ca-gregory-nu-latn';
  const fmtLong = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtDM = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' });
  const fmtShort = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
  const fmtWeekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' });
  const relDay = (k) => {
    const t = todayKey();
    if (k === t) return 'اليوم';
    if (k === addDays(t, -1)) return 'أمس';
    if (k === addDays(t, 1)) return 'بكرة';
    return null;
  };

  /* ---------- Built-in foods ---------- */
  const BUILTIN = [];
  const CATS = [];
  for (const group of window.SARATI_FOODS || []) {
    const items = group.items.map(([id, name, alt, kcal, p, c, f, unit = 'g', servingName, servingSize]) => (
      { id: 'b:' + id, name, alt, kcal, p, c, f, unit, servingName, servingSize, builtin: true, cat: group.cat }
    ));
    CATS.push({ name: group.cat, items });
    BUILTIN.push(...items);
  }

  /* ---------- State & storage ---------- */
  const blank = () => ({
    v: 1, profile: null, useManual: false, manual: null,
    foods: [], log: {}, weights: [], recent: [], lastAmt: {}, lastBackup: null,
  });
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

  function normalize(d) {
    const b = blank();
    if (!isObj(d)) return b;
    const log = {};
    if (isObj(d.log)) {
      for (const [k, list] of Object.entries(d.log)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !Array.isArray(list)) continue;
        const clean = list.filter((e) => isObj(e) && Number.isFinite(e.kcal)).map((e) => ({
          ...e, id: String(e.id || uid()), name: String(e.name || 'طعام'),
          meal: MEALS.some((m) => m.id === e.meal) ? e.meal : 's',
          p: Number(e.p) || 0, c: Number(e.c) || 0, f: Number(e.f) || 0,
        }));
        if (clean.length) log[k] = clean;
      }
    }
    return {
      ...b,
      profile: isObj(d.profile) ? d.profile : null,
      useManual: !!d.useManual,
      manual: isObj(d.manual) ? d.manual : null,
      foods: Array.isArray(d.foods) ? d.foods.filter((f) => isObj(f) && f.id && f.name && Number.isFinite(f.kcal)) : [],
      log,
      weights: Array.isArray(d.weights)
        ? d.weights.filter((w) => isObj(w) && /^\d{4}-\d{2}-\d{2}$/.test(w.d) && w.kg > 0).sort((a, b2) => (a.d < b2.d ? -1 : 1))
        : [],
      recent: Array.isArray(d.recent) ? d.recent.filter((x) => typeof x === 'string') : [],
      lastAmt: isObj(d.lastAmt) ? d.lastAmt : {},
      lastBackup: typeof d.lastBackup === 'string' ? d.lastBackup : null,
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* storage unavailable or corrupt */ }
    return blank();
  }
  let state = load();
  let persistAsked = false;
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('تعذّر الحفظ على هذا الجهاز');
      return false;
    }
    if (!persistAsked && navigator.storage && navigator.storage.persist) {
      persistAsked = true;
      navigator.storage.persist().catch(() => {});
    }
    return true;
  }

  /* ---------- Targets ---------- */
  const PROFILE_LIMITS = { age: [13, 100], height: [120, 230], weight: [30, 300] };
  function profileValid(p) {
    if (!p) return false;
    return Object.entries(PROFILE_LIMITS).every(([k, [lo, hi]]) => Number.isFinite(p[k]) && p[k] >= lo && p[k] <= hi)
      && Number.isFinite(p.activity) && Number.isFinite(p.goal);
  }
  function computed(p = state.profile) {
    if (!profileValid(p)) return null;
    const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5);
    const tdee = bmr * p.activity;
    const kcal = Math.round((tdee + p.goal * KCAL_PER_KG_WEEK) / 10) * 10;
    const prot = Math.round((p.proteinPerKg || 2) * p.weight);
    const fat = Math.round((kcal * (p.fatPct || 25)) / 100 / 9);
    const carbs = Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4));
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, p: prot, c: carbs, f: fat };
  }
  function targets() {
    if (state.useManual && state.manual && state.manual.kcal > 0) return state.manual;
    const c = computed();
    return c && { kcal: c.kcal, p: c.p, c: c.c, f: c.f };
  }

  /* ---------- Food math ---------- */
  const allFoods = () => state.foods.concat(BUILTIN);
  const foodById = (id) => state.foods.find((f) => f.id === id) || BUILTIN.find((f) => f.id === id);
  function calc(food, qty, u) {
    let k;
    if (food.unit === 'srv') k = qty;
    else k = (u === 'srv' ? qty * food.servingSize : qty) / 100;
    return { kcal: food.kcal * k, p: food.p * k, c: food.c * k, f: food.f * k };
  }
  const totals = (list) => list.reduce(
    (t, e) => ({ kcal: t.kcal + e.kcal, p: t.p + e.p, c: t.c + e.c, f: t.f + e.f }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  const snap = (f) => {
    const s = { id: f.id, name: f.name, kcal: f.kcal, p: f.p, c: f.c, f: f.f, unit: f.unit };
    if (f.servingName) s.servingName = f.servingName;
    if (f.servingSize) s.servingSize = f.servingSize;
    return s;
  };
  const hasServing = (f) => f.unit !== 'srv' && f.servingSize > 0 && !!f.servingName;
  const baseLabel = (f) => (f.unit === 'srv' ? `لكل ${f.servingName || 'حصة'}` : `لكل 100 ${unitName(f.unit)}`);
  function amountLabel(e) {
    if (!e.food) return 'إضافة سريعة';
    const f = e.food;
    if (f.unit === 'srv') return `${fmtQty(e.qty)} × ${f.servingName || 'حصة'}`;
    if (e.u === 'srv') return `${fmtQty(e.qty)} × ${f.servingName} (${fmtQty(e.qty * f.servingSize)} ${unitName(f.unit)})`;
    return `${fmtQty(e.qty)} ${unitName(f.unit)}`;
  }
  function defaultAmount(f) {
    const last = state.lastAmt[f.id];
    if (last && last.qty > 0 && (last.u === 'base' || (last.u === 'srv' && hasServing(f)))) return { ...last };
    if (f.unit === 'srv') return { qty: 1, u: 'base' };
    if (hasServing(f)) return { qty: 1, u: 'srv' };
    return { qty: 100, u: 'base' };
  }
  function searchFoods(q) {
    const words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return allFoods();
    const out = [];
    for (const f of allFoods()) {
      const name = norm(f.name);
      const hay = name + ' ' + norm(f.alt || '');
      if (!words.every((w) => hay.includes(w))) continue;
      const score = (name.startsWith(words[0]) ? 0 : name.includes(words[0]) ? 1 : 2) + (f.builtin ? 0.5 : 0);
      out.push([score, f]);
    }
    return out.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  }
  const mm = (o) => `<span class="mm">${MACROS.map(([k, name]) => `<i class="m-${k}" title="${name}">${name[0]} ${g(o[k])}</i>`).join('')}</span>`;
  function pushRecent(id) {
    state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 24);
  }
  const guessMeal = () => {
    const h = new Date().getHours();
    return h >= 4 && h < 11 ? 'b' : h >= 11 && h < 16 ? 'l' : h >= 18 && h < 23 ? 'd' : 's';
  };

  /* ---------- App shell ---------- */
  let cur = todayKey();
  let lastToday = cur;
  let tab = 'today';

  function setTab(t) {
    tab = t;
    for (const b of $$('.tab')) {
      if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    for (const v of $$('.view')) v.hidden = v.id !== 'view-' + t;
    $('#daynav').hidden = t !== 'today';
    const title = $('#hdr-title');
    title.hidden = t === 'today';
    title.textContent = TITLES[t];
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    if (tab === 'today') renderToday();
    else if (tab === 'foods') renderFoods();
    else if (tab === 'progress') renderProgress();
    else renderProfile();
  }

  /* ---------- Today ---------- */
  function renderToday() {
    const d = dateOf(cur);
    const rel = relDay(cur);
    $('#day-main').textContent = rel || fmtWeekday.format(d);
    $('#day-sub').textContent = rel ? fmtLong.format(d) : fmtDM.format(d);
    $('#day-input').value = cur;

    const t = targets();
    const list = state.log[cur] || [];
    const parts = [];
    if (cur !== todayKey()) parts.push('<button type="button" class="back-today" data-act="go-today">العودة إلى اليوم</button>');
    if (!t) parts.push(setupCard());
    parts.push(summaryCard(totals(list), t));
    for (const m of MEALS) parts.push(mealCard(m, list.filter((e) => e.meal === m.id)));
    $('#view-today').innerHTML = parts.join('');
  }

  const setupCard = () => `<section class="card setup">
      <h2>ابدأ بحساب احتياجك</h2>
      <p>أدخل عمرك وطولك ووزنك ونشاطك وهدفك، ويحسب لك التطبيق السعرات والبروتين والكارب والدهون المطلوبة يومياً.</p>
      <button type="button" class="btn primary" data-act="tab" data-tab="profile">أدخل بياناتي</button>
    </section>`;

  function summaryCard(tot, t) {
    const R = 52;
    const C = 2 * Math.PI * R;
    const goal = t ? t.kcal : 0;
    const frac = goal ? Math.min(tot.kcal / goal, 1) : 0;
    const over = goal > 0 && tot.kcal > goal;
    const left = goal - tot.kcal;
    const center = !t
      ? `<b>${n0(tot.kcal)}</b><span>سعرة</span>`
      : over ? `<b>${n0(-left)}</b><span>زيادة</span>` : `<b>${n0(left)}</b><span>متبقي</span>`;
    const label = t ? `أكلت ${n0(tot.kcal)} من ${n0(goal)} سعرة` : `أكلت ${n0(tot.kcal)} سعرة`;
    return `<section class="card summary" aria-label="ملخص اليوم">
      <div class="sum-top">
        <div class="ring-wrap" role="img" aria-label="${label}">
          <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle class="ring-track" cx="60" cy="60" r="${R}"/>
            <circle class="ring-fill${over ? ' over' : ''}${frac <= 0 ? ' zero' : ''}" cx="60" cy="60" r="${R}"
              stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 60 60)"/>
          </svg>
          <div class="ring-center${over ? ' over' : ''}" aria-hidden="true">${center}</div>
        </div>
        <dl class="kpis">
          <div><dt>الهدف</dt><dd>${t ? n0(goal) : '—'}</dd></div>
          <div><dt>أكلت</dt><dd>${n0(tot.kcal)}</dd></div>
          <div><dt>${over ? 'الزيادة' : 'المتبقي'}</dt><dd class="${over ? 'warn' : ''}">${t ? n0(Math.abs(left)) : '—'}</dd></div>
        </dl>
      </div>
      <div class="macros">${MACROS.map(([k, name]) => macroCell(k, name, tot[k], t ? t[k] : 0)).join('')}</div>
    </section>`;
  }

  function macroCell(k, name, eaten, goal) {
    const pct = goal ? Math.min((eaten / goal) * 100, 100) : 0;
    const over = goal > 0 && r0(eaten) > goal;
    const left = goal - eaten;
    const note = !goal ? '&nbsp;' : over ? `زيادة ${r0(-left)} غ` : `متبقي ${r0(Math.max(left, 0))} غ`;
    return `<div class="macro m-${k}${over ? ' over' : ''}">
        <div class="macro-name">${name}</div>
        <div class="macro-val"><b>${r0(eaten)}</b><span> / ${goal ? r0(goal) : '—'} غ</span></div>
        <div class="mbar"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div class="macro-left">${note}</div>
      </div>`;
  }

  function mealCard(m, items) {
    let body;
    if (items.length) {
      body = `<ul class="entries">${items.map(entryRow).join('')}</ul>`;
    } else {
      const y = (state.log[addDays(cur, -1)] || []).filter((e) => e.meal === m.id);
      body = `<div class="meal-empty">${y.length
        ? `<button type="button" class="link-btn" data-act="copy-meal" data-meal="${m.id}">كرّر ${m.name} من أمس (${n0(totals(y).kcal)} سعرة)</button>`
        : 'لا يوجد شيء بعد'}</div>`;
    }
    return `<section class="card meal">
      <div class="meal-head">
        <h2>${m.name}</h2>
        <span class="meal-kcal">${items.length ? `${n0(totals(items).kcal)} سعرة` : ''}</span>
        <button type="button" class="add-btn" data-act="add" data-meal="${m.id}" aria-label="إضافة إلى ${m.name}">${ICON.plus}<span>إضافة</span></button>
      </div>
      ${body}
    </section>`;
  }

  const entryRow = (e) => `<li><button type="button" class="entry" data-act="edit-entry" data-id="${esc(e.id)}">
      <span class="e-name">${esc(e.name)}</span>
      <span class="e-sub"><span>${esc(amountLabel(e))}</span>${mm(e)}</span>
      <span class="e-kcal">${n0(e.kcal)} <small>سعرة</small></span>
    </button></li>`;

  function copyMeal(meal) {
    const src = (state.log[addDays(cur, -1)] || []).filter((e) => e.meal === meal);
    if (!src.length) return;
    const day = cur;
    const copies = src.map((e) => ({ ...e, id: uid() }));
    (state.log[day] = state.log[day] || []).push(...copies);
    save(); render();
    const ids = new Set(copies.map((e) => e.id));
    toast(`تمت إضافة ${mealName(meal)}`, 'تراجع', () => {
      state.log[day] = (state.log[day] || []).filter((e) => !ids.has(e.id));
      if (!state.log[day].length) delete state.log[day];
      save(); render();
    });
  }

  function deleteEntry(day, id) {
    const list = state.log[day] || [];
    const i = list.findIndex((e) => e.id === id);
    if (i < 0) return;
    const [removed] = list.splice(i, 1);
    if (!list.length) delete state.log[day];
    save(); render();
    toast(`حُذف: ${removed.name}`, 'تراجع', () => {
      const l = (state.log[day] = state.log[day] || []);
      l.splice(Math.min(i, l.length), 0, removed);
      save(); render();
    });
  }

  /* ---------- Sheet (add / edit) ---------- */
  const sheet = $('#sheet');
  const sheetBody = $('#sheet-body');
  const sheetTitle = $('#sheet-title');
  let sx = null;
  let sxStack = [];

  function openSheet(ctx, push = false) {
    if (push && sx) sxStack.push(sx); else sxStack = [];
    sx = ctx;
    renderSheet();
    if (!sheet.open) {
      if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
    }
    sheetBody.scrollTop = 0;
  }
  function closeSheet() {
    if (!sheet.open) return;
    if (typeof sheet.close === 'function') sheet.close(); else { sheet.removeAttribute('open'); onSheetClosed(); }
  }
  function onSheetClosed() { sx = null; sxStack = []; sheetBody.innerHTML = ''; }
  function sheetBack() {
    if (sxStack.length) { sx = sxStack.pop(); renderSheet(); sheetBody.scrollTop = 0; } else closeSheet();
  }
  function renderSheet() {
    $('#sheet-back').hidden = !sxStack.length;
    sheet.classList.toggle('tall', sx.mode === 'pick');
    sheetBody.classList.toggle('pick', sx.mode === 'pick');
    if (sx.mode === 'pick') renderPick();
    else if (sx.mode === 'amount') renderAmount();
    else if (sx.mode === 'quick') renderQuick();
    else if (sx.mode === 'food') renderFoodForm();
  }
  const dayNote = (day) => (day === todayKey() ? ''
    : `<p class="target-day">يُضاف إلى: ${relDay(day) ? relDay(day) + ' — ' : ''}${fmtLong.format(dateOf(day))}</p>`);
  const mealSeg = (id, selected) => `<div class="field"><span>الوجبة</span><div class="seg" id="${id}" role="group" aria-label="الوجبة">${
    MEALS.map((m) => `<button type="button" data-v="${m.id}" aria-pressed="${m.id === selected}">${m.name}</button>`).join('')}</div></div>`;
  const numField = (id, label, val, ph = '') => `<label class="field"><span>${label}</span><input class="input" id="${id}" inputmode="decimal" autocomplete="off" value="${Number.isFinite(val) ? fmtQty(val) : ''}" placeholder="${ph}"></label>`;

  // Pick a food
  function renderPick() {
    sheetTitle.textContent = `إضافة إلى ${mealName(sx.meal)}`;
    sheetBody.innerHTML = `
      ${dayNote(sx.date)}
      <div class="pick-tools">
        <input class="input" type="search" id="pick-q" placeholder="ابحث… دجاج، رز، بيض" value="${esc(sx.q || '')}" autocomplete="off" enterkeyhint="search" aria-label="ابحث عن طعام">
        <div class="pick-actions">
          <button type="button" class="btn small" data-act="quick-open">${ICON.bolt} إضافة سريعة</button>
          <button type="button" class="btn small" data-act="food-new">${ICON.plus} طعام جديد</button>
        </div>
      </div>
      <div id="pick-results"></div>`;
    renderPickResults();
  }
  function renderPickResults() {
    const q = (sx.q || '').trim();
    let html = '';
    if (!q) {
      const rec = state.recent.map(foodById).filter(Boolean).slice(0, 10);
      if (rec.length) html += `<h3 class="list-h">آخر ما أضفت</h3><ul class="flist">${rec.map((f) => foodItem(f)).join('')}</ul>`;
      if (state.foods.length) html += `<h3 class="list-h">أطعمتي</h3><ul class="flist">${state.foods.map((f) => foodItem(f)).join('')}</ul>`;
      for (const cat of CATS) html += `<h3 class="list-h">${esc(cat.name)}</h3><ul class="flist">${cat.items.map((f) => foodItem(f)).join('')}</ul>`;
    } else {
      const res = searchFoods(q);
      html = res.length
        ? `<ul class="flist">${res.slice(0, 60).map((f) => foodItem(f)).join('')}</ul>`
        : `<div class="empty-box"><p>لا توجد نتائج لـ «${esc(q)}»</p>
            <button type="button" class="btn primary" data-act="food-new">${ICON.plus} أضفه كطعام جديد</button></div>`;
    }
    $('#pick-results').innerHTML = html;
  }
  function foodItem(f, { act = 'pick-food', edit = false } = {}) {
    return `<li>
      <button type="button" class="fitem" data-act="${act}" data-id="${esc(f.id)}">
        <span class="fi-main">
          <span class="fi-name">${esc(f.name)}${f.builtin ? '' : '<span class="badge">طعامي</span>'}</span>
          <span class="fi-sub"><span>${esc(baseLabel(f))}</span>${mm(f)}</span>
        </span>
        <span class="fi-kcal">${n0(f.kcal)} <small>سعرة</small></span>
      </button>
      ${edit ? `<button type="button" class="icon-btn fi-edit" data-act="food-edit" data-id="${esc(f.id)}" aria-label="تعديل ${esc(f.name)}">${ICON.edit}</button>` : ''}
    </li>`;
  }

  // Amount for a chosen food
  function openAmount(food, extra = {}, push = false) {
    const amt = defaultAmount(food);
    openSheet({ mode: 'amount', date: cur, meal: guessMeal(), food: snap(food), qty: amt.qty, u: amt.u, ...extra }, push);
  }
  function unitsFor(f) {
    if (f.unit === 'srv') return [['base', f.servingName || 'حصة']];
    const u = [['base', unitName(f.unit)]];
    if (hasServing(f)) u.push(['srv', f.servingName]);
    return u;
  }
  function renderAmount() {
    const f = sx.food;
    const units = unitsFor(f);
    sheetTitle.textContent = sx.entryId ? 'تعديل الكمية' : 'الكمية';
    sheetBody.innerHTML = `
      <div class="food-head">
        <h3>${esc(f.name)}</h3>
        <p><span>${esc(baseLabel(f))}: ${n0(f.kcal)} سعرة</span>${mm(f)}</p>
      </div>
      ${dayNote(sx.date)}
      <div class="amount-row">
        <label class="field"><span>الكمية</span><input class="input big" id="amt-qty" inputmode="decimal" autocomplete="off" enterkeyhint="done" value="${fmtQty(sx.qty)}"></label>
        ${units.length > 1
          ? `<div class="seg" id="amt-unit" role="group" aria-label="الوحدة">${units.map(([u, l]) => `<button type="button" data-v="${u}" aria-pressed="${sx.u === u}">${esc(l)}</button>`).join('')}</div>`
          : `<span class="unit-tag">${esc(units[0][1])}</span>`}
      </div>
      <div class="chips" id="amt-chips"></div>
      ${mealSeg('amt-meal', sx.meal)}
      <div class="preview" id="amt-preview" aria-live="polite"></div>
      <div class="btn-row">
        ${sx.entryId ? '<button type="button" class="btn danger" data-act="entry-delete">حذف</button>' : ''}
        <button type="button" class="btn primary" data-act="amount-save">${sx.entryId ? 'حفظ' : 'إضافة'}</button>
      </div>`;
    renderChips();
    updatePreview();
  }
  function renderChips() {
    const f = sx.food;
    const servings = f.unit === 'srv' || sx.u === 'srv';
    const vals = servings ? [0.5, 1, 1.5, 2, 3] : f.unit === 'ml' ? [100, 200, 250, 330, 500] : [25, 50, 100, 150, 200, 250];
    $('#amt-chips').innerHTML = vals.map((v) => `<button type="button" class="chip" data-v="${v}">${v}</button>`).join('');
  }
  function updatePreview() {
    const q = num($('#amt-qty').value);
    const ok = q > 0 && q < 100000;
    const n = ok ? calc(sx.food, q, sx.u) : { kcal: 0, p: 0, c: 0, f: 0 };
    $('#amt-preview').innerHTML = `<div><b>${n0(n.kcal)}</b><span>سعرة</span></div>${
      MACROS.map(([k, name]) => `<div class="m-${k}"><b>${g(n[k])}</b><span class="dot">${name}</span></div>`).join('')}`;
    const btn = $('[data-act="amount-save"]', sheetBody);
    if (btn) btn.disabled = !ok;
  }
  function saveAmount() {
    const q = num($('#amt-qty').value);
    if (!(q > 0 && q < 100000)) return;
    const { food, u, meal, date, entryId } = sx;
    const n = calc(food, q, u);
    const entry = { id: entryId || uid(), meal, name: food.name, qty: q, u, food, kcal: r0(n.kcal), p: r1(n.p), c: r1(n.c), f: r1(n.f) };
    const list = (state.log[date] = state.log[date] || []);
    const i = entryId ? list.findIndex((e) => e.id === entryId) : -1;
    if (i >= 0) list[i] = entry; else list.push(entry);
    if (food.id) {
      pushRecent(food.id);
      state.lastAmt[food.id] = { qty: q, u };
    }
    save();
    closeSheet();
    if (tab === 'today') render();
    toast(entryId ? 'تم الحفظ' : `أُضيف إلى ${mealName(meal)}: ${food.name}`);
  }

  // Quick add (calories / macros directly)
  function renderQuick() {
    const e = sx.init || {};
    sheetTitle.textContent = sx.entryId ? 'تعديل' : 'إضافة سريعة';
    sheetBody.innerHTML = `
      <p class="hint">لما ما تعرف المكونات بالضبط (مطعم مثلاً) — اكتب السعرات والماكروز مباشرة. لو تركت السعرات فاضية تنحسب من الماكروز.</p>
      ${dayNote(sx.date)}
      <label class="field"><span>الاسم (اختياري)</span><input class="input" id="q-name" autocomplete="off" value="${esc(e.name || '')}" placeholder="مثلاً: غداء مطعم"></label>
      <div class="grid4">
        ${numField('q-kcal', 'السعرات', e.kcal)}
        ${numField('q-p', 'بروتين (غ)', e.p, '0')}
        ${numField('q-c', 'كارب (غ)', e.c, '0')}
        ${numField('q-f', 'دهون (غ)', e.f, '0')}
      </div>
      <p class="hint" id="q-calc"></p>
      ${mealSeg('q-meal', sx.meal)}
      <div class="btn-row">
        ${sx.entryId ? '<button type="button" class="btn danger" data-act="entry-delete">حذف</button>' : ''}
        <button type="button" class="btn primary" data-act="quick-save">${sx.entryId ? 'حفظ' : 'إضافة'}</button>
      </div>`;
    updateQuickCalc();
  }
  function readMacroInputs(prefix) {
    const v = (id) => { const x = num($(`#${prefix}-${id}`).value); return Number.isFinite(x) && x >= 0 ? x : 0; };
    const p = v('p'); const c = v('c'); const f = v('f');
    const typed = num($(`#${prefix}-kcal`).value);
    const fromMacros = p * 4 + c * 4 + f * 9;
    return { p, c, f, fromMacros, kcal: Number.isFinite(typed) && typed > 0 ? typed : fromMacros, typed: Number.isFinite(typed) && typed > 0 };
  }
  function updateQuickCalc() {
    const m = readMacroInputs('q');
    $('#q-calc').textContent = m.fromMacros > 0 ? `السعرات من الماكروز: ${n0(m.fromMacros)}` : '';
  }
  function saveQuick() {
    const m = readMacroInputs('q');
    if (!(m.kcal > 0)) { toast('اكتب السعرات أو الماكروز'); $('#q-kcal').focus(); return; }
    const { meal, date, entryId } = sx;
    const name = $('#q-name').value.trim() || 'إضافة سريعة';
    const entry = { id: entryId || uid(), meal, name, kcal: r0(m.kcal), p: r1(m.p), c: r1(m.c), f: r1(m.f) };
    const list = (state.log[date] = state.log[date] || []);
    const i = entryId ? list.findIndex((e) => e.id === entryId) : -1;
    if (i >= 0) list[i] = entry; else list.push(entry);
    save();
    closeSheet();
    render();
    toast(entryId ? 'تم الحفظ' : `أُضيف إلى ${mealName(meal)}`);
  }

  // Custom food form
  function renderFoodForm() {
    const f = sx.foodId ? state.foods.find((x) => x.id === sx.foodId) : null;
    const v = f || { name: sx.name || '', unit: 'g' };
    sx.unit = sx.unit || v.unit;
    sheetTitle.textContent = f ? 'تعديل طعام' : 'طعام جديد';
    sheetBody.innerHTML = `
      <p class="hint">انسخ القيم من الملصق الغذائي على المنتج.</p>
      <label class="field"><span>اسم الطعام</span><input class="input" id="f-name" autocomplete="off" value="${esc(v.name)}" placeholder="مثلاً: زبادي بروتين"></label>
      <div class="field"><span>القيم الغذائية</span>
        <div class="seg" id="f-unit" role="group" aria-label="أساس القيم">
          ${[['g', 'لكل 100 غ'], ['ml', 'لكل 100 مل'], ['srv', 'لكل حصة']].map(([u, l]) => `<button type="button" data-v="${u}" aria-pressed="${sx.unit === u}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="grid4">
        ${numField('f-kcal', 'السعرات', v.kcal)}
        ${numField('f-p', 'بروتين (غ)', v.p, '0')}
        ${numField('f-c', 'كارب (غ)', v.c, '0')}
        ${numField('f-f', 'دهون (غ)', v.f, '0')}
      </div>
      <p class="hint" id="f-calc"></p>
      <div class="grid2">
        <label class="field"><span id="f-sn-label"></span><input class="input" id="f-sn" autocomplete="off" value="${esc(v.servingName || '')}" placeholder="حبة، علبة، سكوب"></label>
        <label class="field" id="f-ss-wrap"><span id="f-ss-label"></span><input class="input" id="f-ss" inputmode="decimal" autocomplete="off" value="${v.servingSize ? fmtQty(v.servingSize) : ''}" placeholder="مثلاً 30"></label>
      </div>
      <div class="btn-row">
        ${f ? '<button type="button" class="btn danger" data-act="food-delete">حذف</button>' : ''}
        <button type="button" class="btn primary" data-act="food-save">${f || !sx.meal ? 'حفظ' : 'حفظ واختيار الكمية'}</button>
      </div>`;
    updateFoodForm();
  }
  function updateFoodForm() {
    const u = sx.unit;
    $('#f-sn-label').textContent = u === 'srv' ? 'اسم الحصة' : 'اسم الحصة (اختياري)';
    $('#f-ss-label').textContent = `وزن الحصة (${unitName(u)})`;
    $('#f-ss-wrap').hidden = u === 'srv';
    const m = readMacroInputs('f');
    $('#f-calc').textContent = m.fromMacros > 0 ? `السعرات من الماكروز: ${n0(m.fromMacros)}` : '';
  }
  function saveFood() {
    const name = $('#f-name').value.trim();
    if (!name) { toast('اكتب اسم الطعام'); $('#f-name').focus(); return; }
    const m = readMacroInputs('f');
    if (!(m.kcal > 0)) { toast('اكتب السعرات أو الماكروز'); $('#f-kcal').focus(); return; }
    const unit = sx.unit;
    const servingName = $('#f-sn').value.trim();
    const ss = num($('#f-ss').value);
    if (unit !== 'srv' && servingName && !(ss > 0)) { toast('اكتب وزن الحصة'); $('#f-ss').focus(); return; }
    const food = {
      id: sx.foodId || 'c:' + uid(), name, unit,
      kcal: r1(m.kcal), p: r1(m.p), c: r1(m.c), f: r1(m.f),
    };
    if (servingName) food.servingName = servingName;
    if (unit !== 'srv' && servingName && ss > 0) food.servingSize = ss;
    const i = state.foods.findIndex((x) => x.id === food.id);
    if (i >= 0) state.foods[i] = food; else state.foods.unshift(food);
    save();
    if (sx.meal && !sx.foodId) {
      // came from the add flow: go straight to choosing the amount
      const { meal, date } = sx;
      const amt = defaultAmount(food);
      sx = { mode: 'amount', date, meal, food: snap(food), qty: amt.qty, u: amt.u };
      renderSheet();
    } else {
      closeSheet();
      render();
      toast('تم حفظ الطعام');
    }
  }
  function deleteFood(id) {
    const f = state.foods.find((x) => x.id === id);
    if (!f || !confirm(`حذف «${f.name}» من أطعمتي؟ السجلات السابقة لن تتأثر.`)) return;
    state.foods = state.foods.filter((x) => x.id !== id);
    state.recent = state.recent.filter((x) => x !== id);
    delete state.lastAmt[id];
    save();
    closeSheet();
    render();
    toast('تم الحذف');
  }

  /* ---------- Foods tab ---------- */
  function renderFoods() {
    const el = $('#view-foods');
    if (!el.dataset.built) {
      el.innerHTML = `
        <div class="foods-tools">
          <input class="input" type="search" id="foods-q" placeholder="ابحث في الأطعمة…" autocomplete="off" aria-label="ابحث في الأطعمة">
          <button type="button" class="btn primary" data-act="food-new">${ICON.plus} جديد</button>
        </div>
        <div class="view" id="foods-list"></div>`;
      el.dataset.built = '1';
    }
    renderFoodsList();
  }
  function renderFoodsList() {
    const q = $('#foods-q').value.trim();
    const opts = (f) => ({ act: 'log-food', edit: !f.builtin });
    let html;
    if (q) {
      const res = searchFoods(q);
      html = `<section class="card">${res.length
        ? `<ul class="flist">${res.map((f) => foodItem(f, opts(f))).join('')}</ul>`
        : `<div class="empty-box"><p>لا توجد نتائج لـ «${esc(q)}»</p><button type="button" class="btn primary" data-act="food-new">${ICON.plus} أضفه كطعام جديد</button></div>`}</section>`;
    } else {
      html = `<section class="card"><h2>أطعمتي</h2>${state.foods.length
        ? `<ul class="flist">${state.foods.map((f) => foodItem(f, opts(f))).join('')}</ul>`
        : '<p class="hint">أضف الأطعمة والمنتجات اللي تاكلها كثير بقيمها من الملصق الغذائي، عشان تسجلها بضغطة.</p>'}</section>`;
      html += CATS.map((cat) => `<details class="card cat">
          <summary>${esc(cat.name)} <span>${cat.items.length}</span></summary>
          <ul class="flist">${cat.items.map((f) => foodItem(f, opts(f))).join('')}</ul>
        </details>`).join('');
      html += '<p class="hint">القيم تقريبية (أغلبها من USDA). الأطباق الشعبية تختلف حسب الطبخ — للمنتجات المغلفة اعتمد على الملصق.</p>';
    }
    $('#foods-list').innerHTML = html;
  }

  /* ---------- Progress tab ---------- */
  function renderProgress() {
    const today = todayKey();
    const todayW = state.weights.find((w) => w.d === today);
    const last = state.weights[state.weights.length - 1];
    $('#view-progress').innerHTML = `
      <section class="card">
        <h2>الوزن</h2>
        <form class="weigh" id="weigh-form" novalidate>
          <label class="field"><span>الوزن (كجم)</span><input class="input big" id="w-kg" inputmode="decimal" autocomplete="off" enterkeyhint="done" value="${todayW ? todayW.kg : ''}" placeholder="${last ? last.kg : '75.0'}"></label>
          <label class="field"><span>التاريخ</span><input class="input" type="date" id="w-date" value="${today}" max="${today}"></label>
          <button type="submit" class="btn primary">حفظ الوزن</button>
        </form>
        ${weightStats()}
        ${weightChart()}
        ${weightList()}
      </section>
      <section class="card">
        <h2>آخر 7 أيام</h2>
        ${weekAverages()}
        <h3>السعرات — آخر 14 يوم</h3>
        ${kcalBars()}
      </section>`;
  }
  function weeklyRate() {
    const w = state.weights;
    if (w.length < 3) return null;
    const lastD = w[w.length - 1].d;
    const pts = w.filter((p) => dayDiff(p.d, lastD) <= 28);
    if (pts.length < 3 || dayDiff(pts[0].d, lastD) < 6) return null;
    const xs = pts.map((p) => dayDiff(pts[0].d, p.d));
    const ys = pts.map((p) => p.kg);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num1 = 0; let den = 0;
    xs.forEach((x, i) => { num1 += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
    return den ? (num1 / den) * 7 : null;
  }
  function weightStats() {
    const w = state.weights;
    if (!w.length) return '<p class="hint">سجّل وزنك بانتظام — الأفضل الصبح بعد الحمام وقبل الأكل — عشان تشوف الاتجاه الحقيقي.</p>';
    const last = w[w.length - 1];
    const rate = weeklyRate();
    const goal = state.profile && Number.isFinite(state.profile.goal) ? state.profile.goal : null;
    return `<dl class="stats">
        <div><dt>آخر وزن</dt><dd>${last.kg} <small>كجم</small></dd></div>
        <div><dt>منذ البداية</dt><dd>${signed(last.kg - w[0].kg)} <small>كجم</small></dd></div>
        <div><dt>المعدل الأسبوعي</dt><dd>${rate == null ? '—' : `${signed(rate, 2)} <small>كجم</small>`}</dd></div>
      </dl>
      ${rate != null && goal != null ? `<p class="hint" style="margin-top:8px">هدفك ${signed(goal, 2)} كجم بالأسبوع. ${rateAdvice(rate, goal)}</p>` : ''}`;
  }
  function rateAdvice(rate, goal) {
    const diff = rate - goal;
    if (Math.abs(diff) <= 0.15) return 'ماشي على الهدف تقريباً.';
    if (goal < 0) return diff > 0 ? 'النزول أبطأ من المخطط — جرّب تنقص 100–200 سعرة.' : 'النزول أسرع من المخطط — ممكن تزيد 100–200 سعرة.';
    if (goal > 0) return diff < 0 ? 'الزيادة أبطأ من المخطط — جرّب تزيد 100–200 سعرة.' : 'الزيادة أسرع من المخطط — ممكن تنقص 100–200 سعرة.';
    return diff > 0 ? 'الوزن يزيد — جرّب تنقص 100–200 سعرة.' : 'الوزن ينزل — جرّب تزيد 100–200 سعرة.';
  }
  function weightChart() {
    const all = state.weights;
    if (all.length < 2) return all.length ? '<p class="hint" style="margin-top:10px">سجّل وزنك يوم ثاني عشان يظهر الرسم.</p>' : '';
    const lastD = all[all.length - 1].d;
    const pts = all.filter((p) => dayDiff(p.d, lastD) <= 90);
    const series = pts.length >= 2 ? pts : all.slice(-2);
    const W = 340; const H = 160; const top = 12; const bottom = 24; const sideR = 36; const sideL = 10;
    const t0 = dateOf(series[0].d).getTime(); const t1 = dateOf(series[series.length - 1].d).getTime();
    let lo = Math.min(...series.map((p) => p.kg)); let hi = Math.max(...series.map((p) => p.kg));
    if (hi - lo < 1) { const mid = (hi + lo) / 2; lo = mid - 0.5; hi = mid + 0.5; }
    const padY = (hi - lo) * 0.12; lo -= padY; hi += padY;
    // Time runs right → left (RTL): oldest on the right.
    const X = (k) => { const fr = t1 === t0 ? 0.5 : (dateOf(k).getTime() - t0) / (t1 - t0); return W - sideR - fr * (W - sideR - sideL); };
    const Y = (v) => top + ((hi - v) / (hi - lo)) * (H - top - bottom);
    const line = series.map((p) => `${X(p.d).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(' ');
    const area = `${X(series[0].d).toFixed(1)},${(H - bottom).toFixed(1)} ${line} ${X(series[series.length - 1].d).toFixed(1)},${(H - bottom).toFixed(1)}`;
    const ticks = [0.15, 0.5, 0.85].map((fr) => lo + (hi - lo) * fr);
    const grid = ticks.map((v) => `<line class="gridline" x1="${sideL}" x2="${W - sideR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>
      <text x="${W - sideR + 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="start">${v.toFixed(1)}</text>`).join('');
    const dots = series.length <= 40 ? series.map((p) => `<circle class="wdot" cx="${X(p.d).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="3"/>`).join('') : '';
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="رسم الوزن من ${series[0].kg} إلى ${series[series.length - 1].kg} كجم" direction="ltr" style="direction:ltr">
        ${grid}
        <polygon class="warea" points="${area}"/>
        <polyline class="wline" points="${line}"/>
        ${dots}
        <text x="${W - sideR}" y="${H - 6}" text-anchor="end">${fmtShort.format(dateOf(series[0].d))}</text>
        <text x="${sideL}" y="${H - 6}" text-anchor="start">${fmtShort.format(dateOf(series[series.length - 1].d))}</text>
      </svg>`;
  }
  function weightList() {
    const w = state.weights.slice(-8).reverse();
    if (!w.length) return '';
    return `<h3>آخر التسجيلات</h3><ul class="wlist">${w.map((p) => `<li>
        <b>${p.kg} كجم</b><span>${relDay(p.d) || fmtLong.format(dateOf(p.d))}</span>
        <button type="button" class="icon-btn" data-act="weight-delete" data-d="${p.d}" aria-label="حذف وزن ${esc(p.d)}">${ICON.trash}</button>
      </li>`).join('')}</ul>`;
  }
  function saveWeight(kg, d) {
    if (!(kg >= 30 && kg <= 300)) { toast('اكتب وزن صحيح بالكيلو'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) d = todayKey();
    kg = r1(kg);
    state.weights = state.weights.filter((w) => w.d !== d);
    state.weights.push({ d, kg });
    state.weights.sort((a, b) => (a.d < b.d ? -1 : 1));
    let msg = 'تم حفظ الوزن';
    const isLatest = state.weights[state.weights.length - 1].d === d;
    if (isLatest && state.profile) {
      state.profile.weight = kg;
      if (!state.useManual && computed()) msg = 'تم حفظ الوزن وتحديث أهدافك';
    }
    save();
    renderProgress();
    toast(msg);
  }
  function deleteWeight(d) {
    const i = state.weights.findIndex((w) => w.d === d);
    if (i < 0) return;
    const [removed] = state.weights.splice(i, 1);
    save(); renderProgress();
    toast('تم حذف الوزن', 'تراجع', () => {
      state.weights.push(removed);
      state.weights.sort((a, b) => (a.d < b.d ? -1 : 1));
      save(); renderProgress();
    });
  }
  function weekAverages() {
    const today = todayKey();
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
    const logged = days.filter((d) => (state.log[d] || []).length);
    if (!logged.length) return '<p class="hint">لا توجد تسجيلات في آخر 7 أيام.</p>';
    const tot = totals(logged.flatMap((d) => state.log[d]));
    const avg = { kcal: tot.kcal / logged.length, p: tot.p / logged.length, c: tot.c / logged.length, f: tot.f / logged.length };
    const t = targets();
    const cell = (cls, label, val, goal, unit) => `<div><dt class="${cls}">${label}</dt><dd><b>${n0(val)}</b> <span>${goal ? `/ ${n0(goal)} ` : ''}${unit}</span></dd></div>`;
    return `<p class="hint" style="margin-bottom:10px">متوسط الأيام اللي سجلت فيها (${logged.length} من 7).</p>
      <dl class="avg-grid">
        ${cell('', 'السعرات', avg.kcal, t && t.kcal, 'سعرة')}
        ${cell('m-p dot', 'بروتين', avg.p, t && t.p, 'غ')}
        ${cell('m-c dot', 'كارب', avg.c, t && t.c, 'غ')}
        ${cell('m-f dot', 'دهون', avg.f, t && t.f, 'غ')}
      </dl>`;
  }
  function kcalBars() {
    const t = targets();
    const today = todayKey();
    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)); // oldest → newest
    const vals = days.map((d) => totals(state.log[d] || []).kcal);
    const goal = t ? t.kcal : 0;
    const max = Math.max(goal * 1.2, ...vals, 500);
    const W = 340; const H = 160; const top = 10; const bottom = 24; const side = 4;
    const slot = (W - side * 2) / days.length; const bw = slot * 0.6;
    const Y = (v) => top + (1 - v / max) * (H - top - bottom);
    const bars = days.map((d, i) => {
      const v = vals[i];
      const cx = W - side - slot * (i + 0.5); // oldest on the right
      const h = v > 0 ? Math.max(H - bottom - Y(v), 2) : 3;
      const cls = v <= 0 ? 'bar-none' : goal && v > goal * 1.05 ? 'bar-over' : 'bar-ok';
      const day = dateOf(d).getDate();
      return `<rect class="${cls}" x="${(cx - bw / 2).toFixed(1)}" y="${(H - bottom - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${fmtShort.format(dateOf(d))}: ${n0(v)} سعرة</title></rect>
        <text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" class="${d === today ? 'today-label' : ''}">${day}</text>`;
    }).join('');
    const goalLine = goal ? `<line class="goal-line" x1="${side}" x2="${W - side}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}"/>
      <text x="${side + 2}" y="${(Y(goal) - 5).toFixed(1)}" text-anchor="start">الهدف ${n0(goal)}</text>` : '';
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="السعرات اليومية لآخر 14 يوم" style="direction:ltr">${bars}${goalLine}</svg>`;
  }

  /* ---------- Profile tab ---------- */
  function renderProfile() {
    const p = state.profile || {};
    const sex = p.sex || 'm';
    const activity = Number.isFinite(p.activity) ? p.activity : 1.375;
    const goal = Number.isFinite(p.goal) ? p.goal : -0.5;
    const m = state.manual || {};
    $('#view-profile').innerHTML = `
      <section class="card">
        <h2>بياناتي</h2>
        <div class="form">
          <div class="field"><span>الجنس</span>
            <div class="seg" id="p-sex" role="group" aria-label="الجنس">
              ${[['m', 'ذكر'], ['f', 'أنثى']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${sex === v}">${l}</button>`).join('')}
            </div>
          </div>
          <div class="grid3">
            ${numField('p-age', 'العمر', p.age, 'سنة')}
            ${numField('p-height', 'الطول (سم)', p.height, '175')}
            ${numField('p-weight', 'الوزن (كجم)', p.weight, '80')}
          </div>
          <label class="field"><span>مستوى النشاط</span>
            <select class="input" id="p-activity">${ACTIVITY.map(([v, l, d]) => `<option value="${v}"${v === activity ? ' selected' : ''}>${l} — ${d}</option>`).join('')}</select>
          </label>
          <label class="field"><span>الهدف</span>
            <select class="input" id="p-goal">${GOALS.map(([v, l, d]) => `<option value="${v}"${v === goal ? ' selected' : ''}>${l} (${d})</option>`).join('')}</select>
          </label>
        </div>
      </section>

      <section class="card">
        <h2>توزيع الماكروز</h2>
        <div class="form">
          <label class="field"><span>البروتين: <b id="p-prot-out"></b> غ لكل كجم من وزنك</span>
            <input type="range" id="p-prot" min="1.2" max="3" step="0.1" value="${p.proteinPerKg || 2}">
          </label>
          <label class="field"><span>الدهون: <b id="p-fat-out"></b>% من السعرات</span>
            <input type="range" id="p-fat" min="15" max="40" step="1" value="${p.fatPct || 25}">
          </label>
          <p class="hint">الكارب ياخذ باقي السعرات. للتنشيف وبناء العضل يُنصح غالباً بـ 1.6–2.2 غ بروتين لكل كجم.</p>
        </div>
      </section>

      <section class="card results" id="p-results" aria-live="polite"></section>

      <section class="card">
        <label class="switch"><input type="checkbox" id="p-manual"${state.useManual ? ' checked' : ''}> أحدد أهدافي يدوياً</label>
        <div class="form" id="p-manual-box"${state.useManual ? '' : ' hidden'}>
          <p class="hint">مفيد لو عندك خطة من مدرب أو أخصائي تغذية. لو تركت السعرات فاضية تنحسب من الماكروز.</p>
          <div class="grid4">
            ${numField('m-kcal', 'السعرات', m.kcal)}
            ${numField('m-p', 'بروتين (غ)', m.p)}
            ${numField('m-c', 'كارب (غ)', m.c)}
            ${numField('m-f', 'دهون (غ)', m.f)}
          </div>
          <p class="hint" id="m-calc"></p>
        </div>
      </section>

      <section class="card">
        <h2>النسخ الاحتياطي</h2>
        <div class="stack">
          <p class="hint">بياناتك محفوظة على هذا الجهاز فقط ولا تُرسل لأي مكان. صدّر نسخة بين فترة وثانية — تقدر ترجعها لو غيرت جوالك أو انمسحت بيانات المتصفح.</p>
          <p class="small muted" id="backup-info"></p>
          <div class="btn-row">
            <button type="button" class="btn" data-act="export">${ICON.download} تصدير</button>
            <label class="btn file-btn">${ICON.upload} استيراد<input type="file" id="import-file" accept="application/json,.json"></label>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>عن سعراتي</h2>
        <div class="stack">
          <p class="hint" id="install-hint"></p>
          <button type="button" class="btn primary" id="install-btn" data-act="install" hidden>تثبيت التطبيق</button>
          <button type="button" class="btn danger block" data-act="wipe">حذف كل البيانات</button>
        </div>
      </section>`;
    updateRangeOutputs();
    renderResults();
    updateManualCalc();
    renderBackupInfo();
    renderInstall();
  }
  function updateRangeOutputs() {
    $('#p-prot-out').textContent = Number($('#p-prot').value).toFixed(1);
    $('#p-fat-out').textContent = $('#p-fat').value;
  }
  function readProfile() {
    const v = (id) => num($('#' + id).value);
    return {
      sex: $('#p-sex [aria-pressed="true"]').dataset.v,
      age: v('p-age'), height: v('p-height'), weight: v('p-weight'),
      activity: Number($('#p-activity').value), goal: Number($('#p-goal').value),
      proteinPerKg: Number($('#p-prot').value), fatPct: Number($('#p-fat').value),
    };
  }
  function onProfileInput() {
    state.profile = readProfile();
    save();
    updateRangeOutputs();
    renderResults();
  }
  function renderResults() {
    const box = $('#p-results');
    const p = state.profile;
    const c = computed();
    if (!c) {
      const bad = p && Object.entries(PROFILE_LIMITS).some(([k, [lo, hi]]) => Number.isFinite(p[k]) && (p[k] < lo || p[k] > hi));
      box.innerHTML = `<h2>احتياجك اليومي</h2><p class="hint">${bad
        ? 'تأكد من القيم: العمر 13–100، الطول 120–230 سم، الوزن 30–300 كجم.'
        : 'أكمل العمر والطول والوزن عشان تظهر النتائج.'}</p>`;
      return;
    }
    const min = p.sex === 'f' ? 1200 : 1500;
    const pct = (k) => Math.round(((c[k] * (k === 'f' ? 9 : 4)) / c.kcal) * 100);
    const delta = c.kcal - c.tdee;
    const goalLabel = (GOALS.find(([v]) => v === p.goal) || GOALS[3])[1];
    box.innerHTML = `
      <h2>احتياجك اليومي</h2>
      <div class="big-kcal"><b>${n0(c.kcal)}</b>سعرة باليوم</div>
      <div class="res-macros">${MACROS.map(([k, name]) => `<div class="m-${k}"><span>${name}</span><b>${c[k]} غ</b><small>${pct(k)}% من السعرات</small></div>`).join('')}</div>
      <dl class="stats">
        <div><dt>الحرق الأساسي (BMR)</dt><dd>${n0(c.bmr)}</dd></div>
        <div><dt>الحرق اليومي مع النشاط (TDEE)</dt><dd>${n0(c.tdee)}</dd></div>
        <div><dt>${esc(goalLabel)}</dt><dd>${Math.abs(delta) < 5 ? '0' : signed(delta, 0)}</dd></div>
      </dl>
      ${c.kcal < min ? `<p class="warn-box">السعرات أقل من ${n0(min)} — عجز كبير. فكّر بهدف أبطأ عشان ما تخسر عضل وطاقة.</p>` : ''}
      ${c.c === 0 ? '<p class="warn-box">البروتين والدهون أخذوا كل السعرات — خفف البروتين أو الدهون.</p>' : ''}
      ${state.useManual ? '<p class="hint">أنت تستخدم أهدافاً يدوية الآن، وهذه الأرقام للمقارنة فقط.</p>' : ''}
      <p class="hint">معادلة Mifflin-St Jeor. الأرقام تقديرية — تابع وزنك أسبوعين وعدّل حسب النتيجة.</p>`;
  }
  function onManualToggle(on) {
    state.useManual = on;
    $('#p-manual-box').hidden = !on;
    if (on && !(state.manual && state.manual.kcal > 0)) {
      const c = computed();
      if (c) {
        state.manual = { kcal: c.kcal, p: c.p, c: c.c, f: c.f };
        $('#m-kcal').value = c.kcal; $('#m-p').value = c.p; $('#m-c').value = c.c; $('#m-f').value = c.f;
      }
    }
    save();
    updateManualCalc();
    renderResults();
  }
  function onManualInput() {
    const m = readMacroInputs('m');
    state.manual = { kcal: r0(m.kcal), p: r0(m.p), c: r0(m.c), f: r0(m.f) };
    save();
    updateManualCalc();
  }
  function updateManualCalc() {
    const box = $('#m-calc');
    if (!box || !state.useManual) return;
    const m = readMacroInputs('m');
    const diff = m.typed ? m.kcal - m.fromMacros : 0;
    box.textContent = m.fromMacros > 0
      ? `مجموع الماكروز = ${n0(m.fromMacros)} سعرة${Math.abs(diff) > 50 ? ` (يختلف عن السعرات بـ ${n0(Math.abs(diff))})` : ''}`
      : '';
  }
  function renderBackupInfo() {
    const el = $('#backup-info');
    if (!el) return;
    const days = Object.keys(state.log).length;
    const last = state.lastBackup ? fmtLong.format(new Date(state.lastBackup)) : 'لم تُصدّر نسخة بعد';
    el.textContent = `${days} يوم مسجل · ${state.foods.length} طعام خاص · آخر نسخة: ${last}`;
  }

  /* ---------- Backup ---------- */
  async function exportData() {
    const json = JSON.stringify({ app: 'sarati', exportedAt: new Date().toISOString(), ...state });
    const name = `sarati-backup-${todayKey()}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    let shared = false;
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'نسخة سعراتي الاحتياطية' });
        shared = true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    if (!shared) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    state.lastBackup = new Date().toISOString();
    save();
    renderBackupInfo();
    toast('تم تصدير النسخة');
  }
  async function importData(file) {
    let d;
    try {
      d = JSON.parse(await file.text());
      if (!isObj(d) || !isObj(d.log)) throw new Error('bad file');
    } catch (e) {
      toast('الملف غير صالح');
      return;
    }
    const days = Object.keys(d.log).length;
    if (!confirm(`استيراد نسخة فيها ${days} يوم؟ ستُستبدل بياناتك الحالية على هذا الجهاز.`)) return;
    state = normalize(d);
    save();
    renderProfile();
    toast('تم الاستيراد');
  }
  function wipe() {
    if (!confirm('حذف كل البيانات من هذا الجهاز؟ لا يمكن التراجع — صدّر نسخة أولاً لو تبيها.')) return;
    state = blank();
    save();
    renderProfile();
    toast('تم حذف كل البيانات');
  }

  /* ---------- Install (PWA) ---------- */
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; renderInstall(); });
  window.addEventListener('appinstalled', () => { installEvt = null; renderInstall(); });
  function renderInstall() {
    const hint = $('#install-hint');
    if (!hint) return;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    $('#install-btn').hidden = !installEvt || standalone;
    hint.textContent = standalone
      ? 'التطبيق مثبت على جهازك ويشتغل بدون إنترنت.'
      : ios
        ? 'لتثبيته على الآيفون: افتح الصفحة في Safari، اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية». يشتغل بعدها مثل أي تطبيق وبدون إنترنت.'
        : 'تقدر تثبته على جوالك: من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». يشتغل بعدها بدون إنترنت.';
  }

  /* ---------- Toast ---------- */
  let toastTimer = 0;
  function toast(msg, actionLabel, action) {
    const el = $('#toast');
    // A modal dialog sits in the top layer, so show the toast inside it while it is open.
    const host = sheet.open ? sheet : document.body;
    if (el.parentElement !== host) host.appendChild(el);
    el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
    if (actionLabel) $('button', el).addEventListener('click', () => { hideToast(); action(); }, { once: true });
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 5000 : 2400);
  }
  function hideToast() { $('#toast').classList.remove('show'); }

  /* ---------- Events ---------- */
  function setPressed(btn) {
    for (const b of $$('button', btn.parentElement)) b.setAttribute('aria-pressed', String(b === btn));
  }

  document.addEventListener('click', (e) => {
    const segBtn = e.target.closest('.seg button');
    if (segBtn) { onSeg(segBtn); return; }
    const chip = e.target.closest('#amt-chips .chip');
    if (chip) { $('#amt-qty').value = chip.dataset.v; updatePreview(); return; }

    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'tab': setTab(b.dataset.tab); break;
      case 'day-prev': cur = addDays(cur, -1); renderToday(); break;
      case 'day-next': cur = addDays(cur, 1); renderToday(); break;
      case 'go-today': cur = todayKey(); renderToday(); break;
      case 'add': openSheet({ mode: 'pick', date: cur, meal: b.dataset.meal, q: '' }); break;
      case 'copy-meal': copyMeal(b.dataset.meal); break;
      case 'edit-entry': {
        const en = (state.log[cur] || []).find((x) => x.id === id);
        if (!en) break;
        if (en.food) openSheet({ mode: 'amount', date: cur, meal: en.meal, entryId: en.id, food: en.food, qty: en.qty, u: en.u || 'base' });
        else openSheet({ mode: 'quick', date: cur, meal: en.meal, entryId: en.id, init: en });
        break;
      }
      case 'pick-food': {
        const f = foodById(id);
        if (f) openAmount(f, { date: sx.date, meal: sx.meal }, true);
        break;
      }
      case 'log-food': {
        const f = foodById(id);
        if (f) openAmount(f, { date: cur });
        break;
      }
      case 'quick-open': openSheet({ mode: 'quick', date: sx.date, meal: sx.meal }, true); break;
      case 'quick-save': saveQuick(); break;
      case 'amount-save': saveAmount(); break;
      case 'entry-delete': { const { date, entryId } = sx; closeSheet(); deleteEntry(date, entryId); break; }
      case 'food-new': {
        const fromPick = sx && sx.mode === 'pick';
        openSheet({ mode: 'food', name: fromPick ? (sx.q || '').trim() : ($('#foods-q') ? $('#foods-q').value.trim() : ''), meal: fromPick ? sx.meal : null, date: fromPick ? sx.date : cur }, fromPick);
        break;
      }
      case 'food-edit': openSheet({ mode: 'food', foodId: id }); break;
      case 'food-save': saveFood(); break;
      case 'food-delete': deleteFood(sx.foodId); break;
      case 'sheet-close': closeSheet(); break;
      case 'sheet-back': sheetBack(); break;
      case 'weight-delete': deleteWeight(b.dataset.d); break;
      case 'export': exportData(); break;
      case 'wipe': wipe(); break;
      case 'install':
        if (installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; renderInstall(); }); }
        break;
      default: break;
    }
  });

  function onSeg(btn) {
    const seg = btn.parentElement;
    const v = btn.dataset.v;
    setPressed(btn);
    switch (seg.id) {
      case 'amt-unit': {
        if (v === sx.u) break;
        const f = sx.food;
        const q = num($('#amt-qty').value);
        if (q > 0) {
          const next = v === 'srv' ? q / f.servingSize : q * f.servingSize;
          $('#amt-qty').value = fmtQty(v === 'srv' ? Math.round(next * 4) / 4 || 0.25 : Math.round(next));
        }
        sx.u = v;
        renderChips();
        updatePreview();
        break;
      }
      case 'amt-meal': case 'q-meal': sx.meal = v; break;
      case 'f-unit': sx.unit = v; updateFoodForm(); break;
      case 'p-sex': onProfileInput(); break;
      default: break;
    }
  }

  sheetBody.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'pick-q') { sx.q = t.value; renderPickResults(); $('#pick-results').scrollTop = 0; }
    else if (t.id === 'amt-qty') updatePreview();
    else if (t.id.startsWith('q-')) updateQuickCalc();
    else if (t.id.startsWith('f-')) updateFoodForm();
  });
  sheetBody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || !sx) return;
    if (e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    if (sx.mode === 'pick') {
      const first = $('#pick-results .fitem');
      if (first && (sx.q || '').trim()) first.click(); else e.target.blur();
    } else if (sx.mode === 'amount') saveAmount();
    else if (sx.mode === 'quick') saveQuick();
    else if (sx.mode === 'food') saveFood();
  });
  sheet.addEventListener('close', onSheetClosed);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); }); // backdrop tap

  $('#view-foods').addEventListener('input', (e) => { if (e.target.id === 'foods-q') renderFoodsList(); });

  $('#view-progress').addEventListener('submit', (e) => {
    if (e.target.id !== 'weigh-form') return;
    e.preventDefault();
    saveWeight(num($('#w-kg').value), $('#w-date').value);
  });

  const profileView = $('#view-profile');
  profileView.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id.startsWith('p-') && t.id !== 'p-manual') onProfileInput();
    else if (t.id.startsWith('m-')) onManualInput();
  });
  profileView.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'p-manual') onManualToggle(t.checked);
    else if (t.id === 'p-activity' || t.id === 'p-goal') onProfileInput();
    else if (t.id === 'import-file' && t.files && t.files[0]) { importData(t.files[0]); t.value = ''; }
  });

  const dayInput = $('#day-input');
  dayInput.addEventListener('click', () => { try { dayInput.showPicker(); } catch (e) { /* not supported */ } });
  dayInput.addEventListener('change', () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayInput.value)) { cur = dayInput.value; renderToday(); }
  });

  // When the app comes back after midnight, move "today" forward.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const t = todayKey();
    if (t !== lastToday) {
      if (cur === lastToday) cur = t;
      lastToday = t;
      if (!sheet.open) render();
    }
  });
  // Keep two open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY) return;
    state = load();
    if (!sheet.open) render();
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  setTab('today');
})();
