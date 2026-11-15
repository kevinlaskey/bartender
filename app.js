'use strict';
(() => {
  const STORE_KEY = 'bartender.v1';

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const HEART = '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.2-4.4-9.2-8.8C1.5 8.7 3.4 5.5 6.6 5.5c2.1 0 3.6 1.2 4.4 2.6h2c.8-1.4 2.3-2.6 4.4-2.6 3.2 0 5.1 3.2 3.8 6.2-2 4.4-9.2 8.8-9.2 8.8z" stroke-linejoin="round"/></svg>';

  // ---------- amount scaling (1×, 2×…) ----------
  const FRAC = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
  function parseNum(t) {
    t = t.trim();
    let m;
    if ((m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
    if ((m = t.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
    if ((m = t.match(/^(\d*)([¼½¾⅓⅔])$/))) return (+m[1] || 0) + FRAC[m[2]];
    return parseFloat(t);
  }
  function fmtNum(n) {
    const whole = Math.floor(n + 1e-9), rest = n - whole;
    for (const [g, v] of Object.entries(FRAC)) {
      if (Math.abs(rest - v) < 0.02) return (whole || '') + g;
    }
    if (rest < 0.02) return String(whole);
    if (rest > 0.98) return String(whole + 1);
    return String(Math.round(n * 100) / 100);
  }
  // Multiplies every quantity in an amount like "1½ oz", "6–8 leaves", ".75 oz".
  // Leaves ratios such as "2:1 honey:water" alone.
  const NUM_RE = /(?<![\d:.\/])(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+[¼½¾⅓⅔]?|[¼½¾⅓⅔])(?![\d:\/])/g;
  function scaleAmt(amt, k) {
    if (k === 1 || !amt) return amt;
    return amt
      .replace(NUM_RE, (t) => {
        const n = parseNum(t);
        return isNaN(n) ? t : fmtNum(n * k);
      })
      .replace(/\b(\d\S*) (dash|sugar cube|egg white)\b(?!e?s)/g, (m, n, w) => (n === '1' ? m : `${n} ${w}${w === 'dash' ? 'es' : 's'}`));
  }

  // ---------- state ----------
  function normalize(s) {
    s = s || {};
    return {
      have: new Set(Array.isArray(s.have) ? s.have : []),
      favs: new Set(Array.isArray(s.favs) ? s.favs : []),
      notes: s.notes && typeof s.notes === 'object' ? s.notes : {},
      custom: Array.isArray(s.custom) ? s.custom : [],
      customIngredients: Array.isArray(s.customIngredients) ? s.customIngredients : [],
      scale: [1, 2, 3, 4].includes(s.scale) ? s.scale : 1,
      showAdv: !!s.showAdv,
    };
  }
  function serialize() {
    return {
      app: 'bartender', v: 1, savedAt: new Date().toISOString(),
      have: [...state.have], favs: [...state.favs], notes: state.notes,
      custom: state.custom, customIngredients: state.customIngredients, scale: state.scale, showAdv: state.showAdv,
    };
  }
  function load() {
    try { return normalize(JSON.parse(localStorage.getItem(STORE_KEY))); } catch { return normalize(); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(serialize())); }
    catch { toast('Couldn’t save — is private browsing on?'); }
  }

  let state = load();
  const ui = { tab: state.have.size ? 'drinks' : 'bar', q: '', vibe: 'all', showAll: false, barQ: '', sheet: null };

  // ---------- ingredients & drinks ----------
  let ING = {};
  function buildIng() {
    ING = {};
    for (const x of INGREDIENTS) ING[x.id] = x;
    for (const x of state.customIngredients) ING[x.id] = { ...x, cat: 'Other' };
  }
  const ingName = (id) => ING[id]?.name || id;
  const shortName = (id) => ING[id]?.s || ING[id]?.name || id;

  function toDrink(r, custom) {
    return {
      id: r.id || slug(r.n), name: r.n, glass: r.g || '', vibe: r.v || [], method: r.m || '', custom,
      lines: (r.i || []).map(([ids, amt, opt]) => ({ ids: String(ids).split('|'), amt: amt || '', opt: !!opt })),
    };
  }
  const BUILTIN = DRINKS.map((r) => toDrink(r, false));
  const allDrinks = () => BUILTIN.concat(state.custom.map((r) => toDrink(r, true)));
  const findDrink = (id) => allDrinks().find((d) => d.id === id);

  const hasLine = (l) => l.ids.some((id) => state.have.has(id));
  const missingOf = (d) => d.lines.filter((l) => !l.opt && !hasLine(l));
  const lineLabel = (l, short) => l.ids.map(short ? shortName : ingName).join(' or ');

  function byFavThenName(a, b) {
    const fa = state.favs.has(a.d.id), fb = state.favs.has(b.d.id);
    if (fa !== fb) return fa ? -1 : 1;
    return a.d.name.localeCompare(b.d.name);
  }

  function bucket(drinks) {
    const ready = [], one = [], rest = [];
    for (const d of drinks) {
      const m = missingOf(d);
      (m.length === 0 ? ready : m.length === 1 ? one : rest).push({ d, m });
    }
    ready.sort(byFavThenName); one.sort(byFavThenName); rest.sort((a, b) => a.m.length - b.m.length || byFavThenName(a, b));
    return { ready, one, rest };
  }

  // ---------- rendering ----------
  const TITLES = { drinks: 'Drinks', favorites: 'Favorites', bar: 'My Bar', more: 'More' };

  function render() {
    buildIng();
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
    $('#title').textContent = TITLES[ui.tab];
    const ready = allDrinks().filter((d) => !missingOf(d).length).length;
    $('#sub').textContent = ui.tab === 'bar' ? '' : state.have.size ? `${ready} you can make` : '';
    $('#view').innerHTML = { drinks: viewDrinks, favorites: viewFavs, bar: viewBar, more: viewMore }[ui.tab]();
  }

  function card({ d, m }) {
    const fav = state.favs.has(d.id);
    const sub = d.lines.filter((l) => !l.opt)
      .map((l) => shortName(l.ids.find((id) => state.have.has(id)) || l.ids[0])).join(' · ');
    const note = state.notes[d.id];
    return `<div class="card" data-open="${esc(d.id)}">
      <div class="card-main">
        <div class="card-title">${esc(d.name)}${d.custom ? '<span class="tag">mine</span>' : ''}</div>
        <div class="card-sub">${esc(sub)}</div>
        ${m.length ? `<div class="need">Need: ${m.map((l) => esc(lineLabel(l, true))).join(', ')}</div>` : ''}
        ${note ? `<div class="note-snip">“${esc(note)}”</div>` : ''}
      </div>
      <button class="heart ${fav ? 'on' : ''}" data-fav="${esc(d.id)}" aria-label="${fav ? 'Remove from' : 'Add to'} favorites">${HEART}</button>
    </div>`;
  }

  const section = (title, items) => items.length
    ? `<h2 class="section"><span>${title}</span><span class="count">${items.length}</span></h2>${items.map(card).join('')}` : '';

  // Drinks tab
  function viewDrinks() {
    return `
      <button class="surprise" data-act="surprise">🍸 Make me a cocktail
        <small>A random pick from what you can make right now — favorites come up more often</small></button>
      <div class="searchbar"><input id="q" type="search" placeholder="Search drinks or ingredients" value="${esc(ui.q)}" autocomplete="off"></div>
      <div class="chips">${['all', ...VIBES].map((v) =>
        `<button class="chip ${ui.vibe === v ? 'on' : ''}" data-vibe="${v}">${v === 'all' ? 'All' : cap(v)}</button>`).join('')}</div>
      <div id="results">${drinkResults()}</div>`;
  }

  function filterDrinks(list) {
    const q = ui.q.trim().toLowerCase();
    return list.filter((d) => {
      if (ui.vibe !== 'all' && !d.vibe.includes(ui.vibe)) return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q) ||
        d.lines.some((l) => l.ids.some((id) => ingName(id).toLowerCase().includes(q)));
    });
  }

  function drinkResults() {
    const { ready, one, rest } = bucket(filterDrinks(allDrinks()));
    let html = '';
    if (!state.have.size) {
      html += `<div class="empty"><b>What’s in your bar?</b>Check off the bottles and mixers you have, and this list will show what you can make.
        <br><button class="btn primary" data-tab="bar">Stock my bar</button></div>`;
    } else if (!ready.length && !one.length && !ui.q && ui.vibe === 'all') {
      html += `<div class="empty"><b>Nothing quite yet</b>Add a few more ingredients to your bar to unlock drinks.</div>`;
    }
    html += section('Ready to make', ready) + section('Missing just one thing', one);
    if (rest.length) {
      html += ui.showAll || ui.q
        ? section('Everything else', rest)
        : `<button class="link" data-act="showall">Show ${plural(rest.length, 'more drink')} you’re missing stuff for</button>`;
    }
    if (!ready.length && !one.length && !rest.length) html += `<div class="empty">No drinks match that search.</div>`;
    return html;
  }

  // Favorites tab
  function viewFavs() {
    const favs = allDrinks().filter((d) => state.favs.has(d.id));
    if (!favs.length) {
      return `<div class="empty"><b>No favorites yet</b>Tap the ♡ on any drink she loves and it’ll show up here — with her notes.
        <br><button class="btn primary" data-tab="drinks">Browse drinks</button></div>`;
    }
    const { ready, one, rest } = bucket(favs);
    return `
      ${ready.length ? `<button class="surprise" data-act="surprise-fav">🎲 Pick one of the favorites
        <small>Random favorite you can make right now</small></button>` : ''}
      ${section('Can make now', ready)}${section('Missing one thing', one)}${section('Need a shopping trip', rest)}`;
  }

  // Bar tab
  function viewBar() {
    return `
      <div class="searchbar"><input id="barq" type="search" placeholder="Find an ingredient" value="${esc(ui.barQ)}" autocomplete="off"></div>
      <div id="bar-results">${barResults()}</div>`;
  }

  function nextBuys() {
    const counts = {};
    for (const d of allDrinks()) {
      const m = missingOf(d);
      if (m.length === 1) for (const id of m[0].ids) counts[id] = (counts[id] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1] || ingName(a[0]).localeCompare(ingName(b[0]))).slice(0, 6);
  }

  function barResults() {
    const q = ui.barQ.trim().toLowerCase();
    const ready = allDrinks().filter((d) => !missingOf(d).length).length;
    let html = '';
    if (!q) {
      html += `<div class="bar-stats"><div><b>${state.have.size}</b>${state.have.size === 1 ? 'ingredient' : 'ingredients'} checked</div>
        <div><b>${ready}</b>${ready === 1 ? 'drink' : 'drinks'} you can make</div></div>`;
      const buys = nextBuys();
      if (buys.length && state.have.size) {
        html += `<h2 class="section"><span>Worth buying next</span></h2>
          <div class="hint">Each one unlocks the most new drinks. Tap if you actually have it.</div>
          <div class="pills">${buys.map(([id, n]) =>
            `<button class="pill buy" data-ing="${esc(id)}">${esc(ingName(id))}<span class="n">+${n}</span></button>`).join('')}</div>`;
      }
    }
    // Specialty bottles stay hidden unless asked for, searched for, or already checked.
    const visible = (x) => q ? x.name.toLowerCase().includes(q) : (!x.adv || state.showAdv || state.have.has(x.id));
    const hiddenAdv = Object.values(ING).filter((x) => x.adv && !state.have.has(x.id)).length;
    if (!q && hiddenAdv) {
      html += `<button class="link" data-act="toggle-adv">${state.showAdv
        ? 'Hide specialty ingredients'
        : `Show ${hiddenAdv} specialty ingredients <span style="font-weight:400">(absinthe, Lillet, Chartreuse…)</span>`}</button>`;
    }
    for (const cat of CATEGORIES) {
      const items = Object.values(ING).filter((x) => x.cat === cat && visible(x));
      if (!items.length) continue;
      const n = items.filter((x) => state.have.has(x.id)).length;
      html += `<h2 class="section"><span>${esc(cat)}</span><span class="count">${n ? n + ' ✓' : ''}</span></h2>
        <div class="pills">${items.map((x) =>
          `<button class="pill ${state.have.has(x.id) ? 'on' : ''}" data-ing="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>`;
    }
    if (q && !html) html = `<div class="empty">Nothing called “${esc(ui.barQ)}”. You can add custom ingredients by creating your own drink in More.</div>`;
    if (!q && state.have.size) html += `<button class="link" data-act="clear-bar">Uncheck everything</button>`;
    return html;
  }

  // More tab
  function viewMore() {
    const mine = state.custom.map((r) => toDrink(r, true)).sort((a, b) => a.name.localeCompare(b.name));
    return `
      <div class="panel"><h3>Your own recipes</h3>
        <p>Add a drink that isn’t in the list — a house special, or her favorite from that one restaurant.</p>
        <button class="btn primary block" data-act="new-drink">+ Add a drink</button>
      </div>
      ${mine.length ? section('Your drinks', mine.map((d) => ({ d, m: missingOf(d) }))) : ''}
      <div class="panel" style="margin-top:12px"><h3>Backup &amp; move to another phone</h3>
        <p>Your bar, favorites and notes are saved on this phone, in this browser. Save a backup file now and then — you can load it on another phone (or if you clear your browser data).</p>
        <div class="row"><button class="btn" data-act="export">Save backup</button>
          <button class="btn" data-act="import">Load backup</button></div>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
      </div>
      <div class="panel"><h3>About</h3>
        <p>${BUILTIN.length} classic recipes${state.custom.length ? ` + ${state.custom.length} of yours` : ''} · ${state.favs.size} favorites · ${Object.keys(state.notes).length} notes</p>
        <button class="btn danger block" data-act="reset">Erase everything on this phone</button>
      </div>`;
  }

  // ---------- drink detail sheet ----------
  function openDrink(id, opts = {}) {
    const d = findDrink(id);
    if (!d) return;
    ui.sheet = { type: 'drink', id, pool: opts.pool || null };
    const fav = state.favs.has(d.id);
    const m = missingOf(d);
    const html = `
      <div class="d-head">
        <h2>${esc(d.name)}</h2>
        <button class="heart big ${fav ? 'on' : ''}" data-fav="${esc(d.id)}" aria-label="Favorite">${HEART}</button>
      </div>
      <div class="d-meta">${esc(d.glass ? d.glass + ' glass' : '')}
        ${d.vibe.length ? `<div class="chips wrap">${d.vibe.map((v) => `<span class="chip">${cap(v)}</span>`).join('')}</div>` : ''}</div>
      <div class="status ${m.length ? 'warn' : 'ok'}">${m.length ? `Missing ${m.map((l) => esc(lineLabel(l, true))).join(', ')}` : 'You have everything ✓'}</div>
      <div class="scale-row"><span>Amounts</span><div class="seg">${[1, 2, 3, 4].map((k) =>
        `<button class="${state.scale === k ? 'on' : ''}" data-scale="${k}">${k}×</button>`).join('')}</div></div>
      <ul class="ings">${d.lines.map((l) => {
        const h = hasLine(l);
        const cls = h ? 'have' : l.opt ? 'opt' : 'miss';
        return `<li class="${cls}"><span class="mark">${h ? '✓' : l.opt ? '–' : '✕'}</span>
          <span class="amt">${esc(scaleAmt(l.amt, state.scale))}</span>
          <span class="nm">${esc(lineLabel(l))}${l.opt ? ' <em>optional</em>' : ''}</span>
          ${!h ? `<button class="mini" data-got="${esc(l.ids[0])}">Have it</button>` : ''}</li>`;
      }).join('')}</ul>
      ${d.method ? `<h3>How to make it</h3><p class="method">${esc(d.method)}</p>` : ''}
      <h3>Notes</h3>
      <textarea id="note" data-note="${esc(d.id)}" placeholder="e.g. She likes it with a little extra lime">${esc(state.notes[d.id] || '')}</textarea>
      <div class="saved" id="note-saved"></div>
      ${opts.pool ? `<button class="btn block" data-act="${opts.pool === 'fav' ? 'surprise-fav' : 'surprise'}">🎲 Pick another</button>` : ''}
      ${d.custom ? `<div class="row"><button class="btn" data-edit="${esc(d.id)}">Edit</button>
        <button class="btn danger" data-del="${esc(d.id)}">Delete</button></div>` : ''}`;
    openSheet(html);
  }

  function surprise(favOnly) {
    const pool = allDrinks().filter((d) => !missingOf(d).length && (!favOnly || state.favs.has(d.id)));
    if (!pool.length) {
      toast(favOnly ? 'No favorites you can make right now' : 'Check off a few more things in My Bar first');
      return;
    }
    const current = ui.sheet?.id;
    const choices = pool.length > 1 ? pool.filter((d) => d.id !== current) : pool;
    // Favorites are 3x more likely to come up.
    const weighted = choices.flatMap((d) => (state.favs.has(d.id) && !favOnly ? [d, d, d] : [d]));
    const pick = weighted[Math.floor(Math.random() * weighted.length)];
    openDrink(pick.id, { pool: favOnly ? 'fav' : 'all' });
  }

  // ---------- custom drink form ----------
  function formRow(name = '', amt = '', opt = false) {
    return `<div class="frow">
      <input type="text" class="f-ing" list="ing-list" placeholder="Ingredient" value="${esc(name)}">
      <input type="text" class="f-amt" placeholder="Amount" value="${esc(amt)}">
      <label class="opt"><input type="checkbox" class="f-opt" ${opt ? 'checked' : ''}>opt.</label>
      <button type="button" class="x" data-act="rm-row" aria-label="Remove">✕</button></div>`;
  }

  function openForm(id) {
    const r = id ? state.custom.find((x) => x.id === id) : null;
    ui.sheet = { type: 'form', id: id || null };
    const rows = r ? r.i.map(([ids, amt, opt]) => formRow(ingName(String(ids).split('|')[0]), amt, opt)).join('')
      : formRow() + formRow() + formRow();
    openSheet(`
      <div class="d-head"><h2>${r ? 'Edit drink' : 'Add a drink'}</h2></div>
      <label class="field">Name<input id="f-name" type="text" value="${esc(r?.n || '')}" placeholder="e.g. Sarah’s Spicy Marg"></label>
      <label class="field">Glass<input id="f-glass" type="text" value="${esc(r?.g || '')}" placeholder="Rocks, coupe, highball…"></label>
      <div class="lbl">Vibe</div>
      <div class="chips wrap">${VIBES.map((v) => `<button type="button" class="chip ${r?.v?.includes(v) ? 'on' : ''}" data-fvibe="${v}">${cap(v)}</button>`).join('')}</div>
      <div class="lbl">Ingredients <span style="font-weight:400;color:var(--faint)">— pick from the list or type something new</span></div>
      <div id="f-ings">${rows}</div>
      <button type="button" class="btn ghost block" data-act="add-row">+ Another ingredient</button>
      <label class="field">How to make it<textarea id="f-method" placeholder="Shake with ice, strain…">${esc(r?.m || '')}</textarea></label>
      <button class="btn primary block" data-act="save-drink">Save drink</button>
      <datalist id="ing-list">${Object.values(ING).map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist>`);
  }

  function resolveIng(name) {
    const lc = name.toLowerCase();
    const hit = Object.values(ING).find((x) => x.name.toLowerCase() === lc || (x.s && x.s.toLowerCase() === lc));
    if (hit) return hit.id;
    let id = 'x-' + (slug(name) || Date.now().toString(36));
    if (!state.customIngredients.some((x) => x.id === id)) state.customIngredients.push({ id, name });
    buildIng();
    return id;
  }

  function saveForm() {
    const name = $('#f-name').value.trim();
    if (!name) { toast('Give the drink a name'); $('#f-name').focus(); return; }
    const rows = $$('.frow').map((r) => ({
      nm: $('.f-ing', r).value.trim(), amt: $('.f-amt', r).value.trim(), opt: $('.f-opt', r).checked,
    })).filter((x) => x.nm);
    if (!rows.length) { toast('Add at least one ingredient'); return; }
    const editId = ui.sheet.id;
    const rec = {
      id: editId || 'c-' + Date.now().toString(36),
      n: name,
      g: $('#f-glass').value.trim(),
      v: $$('[data-fvibe].on').map((b) => b.dataset.fvibe),
      m: $('#f-method').value.trim(),
      i: rows.map((x) => [resolveIng(x.nm), x.amt, x.opt ? 1 : 0]),
    };
    const idx = state.custom.findIndex((x) => x.id === rec.id);
    if (idx >= 0) state.custom[idx] = rec; else state.custom.push(rec);
    save();
    toast(editId ? 'Saved' : 'Drink added');
    render();
    openDrink(rec.id);
  }

  // ---------- sheet ----------
  function openSheet(html) {
    $('#sheet-body').innerHTML = html;
    const s = $('#sheet');
    if (s.classList.contains('hidden')) {
      s.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      history.pushState({ sheet: 1 }, '');   // so the phone's back gesture closes the sheet
    }
    $('.sheet-panel').scrollTop = 0;
  }
  function closeSheet(fromPop) {
    const s = $('#sheet');
    if (s.classList.contains('hidden')) return;
    s.classList.add('hidden');
    document.body.style.overflow = '';
    ui.sheet = null;
    if (!fromPop && history.state?.sheet) history.back();
    render();
  }
  window.addEventListener('popstate', () => closeSheet(true));

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- actions ----------
  function toggleFav(id, btn) {
    const on = !state.favs.has(id);
    on ? state.favs.add(id) : state.favs.delete(id);
    save();
    toast(on ? 'Added to favorites ♥' : 'Removed from favorites');
    $$(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => b.classList.toggle('on', on));
    btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
    if (!ui.sheet) render();
  }

  function toggleIng(id) {
    state.have.has(id) ? state.have.delete(id) : state.have.add(id);
    save();
    if (ui.tab === 'bar' && !ui.sheet) {
      $('#bar-results').innerHTML = barResults();
    } else {
      render();
    }
  }

  function exportData() {
    const json = JSON.stringify(serialize(), null, 2);
    const name = `bartender-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Bartender backup' }).catch(() => {});
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Backup saved');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.app !== 'bartender' || !Array.isArray(data.have)) throw new Error('bad');
        if (!confirm('Replace what’s on this phone with the backup?')) return;
        state = normalize(data);
        save(); render();
        toast('Backup loaded');
      } catch { toast('That doesn’t look like a Bartender backup'); }
    };
    reader.readAsText(file);
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-close],[data-fav],[data-got],[data-ing],[data-scale],[data-vibe],[data-fvibe],[data-act],[data-tab],[data-edit],[data-del],[data-open]');
    if (!t) return;
    const ds = t.dataset;

    if ('close' in ds) return closeSheet();
    if (ds.fav) return toggleFav(ds.fav, t);
    if (ds.got) {
      state.have.add(ds.got); save();
      toast(`Added ${shortName(ds.got)} to your bar`);
      render();
      return openDrink(ui.sheet.id, { pool: ui.sheet.pool });
    }
    if (ds.ing) return toggleIng(ds.ing);
    if (ds.scale) {
      state.scale = +ds.scale; save();
      return openDrink(ui.sheet.id, { pool: ui.sheet.pool });
    }
    if (ds.vibe) { ui.vibe = ds.vibe; return render(); }
    if (ds.fvibe) return t.classList.toggle('on');
    if (ds.tab) {
      if (ui.sheet) closeSheet();
      ui.tab = ds.tab; render(); window.scrollTo(0, 0); return;
    }
    if (ds.open) return openDrink(ds.open);
    if (ds.edit) return openForm(ds.edit);
    if (ds.del) {
      const d = findDrink(ds.del);
      if (!confirm(`Delete “${d.name}”? This can’t be undone.`)) return;
      state.custom = state.custom.filter((x) => x.id !== ds.del);
      state.favs.delete(ds.del); delete state.notes[ds.del];
      save(); closeSheet(); toast('Deleted');
      return;
    }

    switch (ds.act) {
      case 'surprise': return surprise(false);
      case 'surprise-fav': return surprise(true);
      case 'showall': ui.showAll = true; $('#results').innerHTML = drinkResults(); return;
      case 'clear-bar':
        if (confirm('Uncheck every ingredient in your bar?')) { state.have.clear(); save(); render(); }
        return;
      case 'toggle-adv':
        state.showAdv = !state.showAdv; save();
        $('#bar-results').innerHTML = barResults();
        return;
      case 'new-drink': return openForm();
      case 'add-row': $('#f-ings').insertAdjacentHTML('beforeend', formRow()); $$('.f-ing').pop().focus(); return;
      case 'rm-row': {
        const rows = $$('.frow');
        if (rows.length > 1) t.closest('.frow').remove();
        else $$('input', rows[0]).forEach((i) => (i.type === 'checkbox' ? (i.checked = false) : (i.value = '')));
        return;
      }
      case 'save-drink': return saveForm();
      case 'export': return exportData();
      case 'import': return $('#import-file').click();
      case 'reset':
        if (confirm('Erase your bar, favorites, notes and custom drinks from this phone? This can’t be undone.')) {
          state = normalize(); save(); ui.tab = 'bar'; render(); toast('Erased');
        }
        return;
    }
  });

  let noteTimer;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'q') { ui.q = el.value; $('#results').innerHTML = drinkResults(); }
    else if (el.id === 'barq') { ui.barQ = el.value; $('#bar-results').innerHTML = barResults(); }
    else if (el.id === 'note') {
      const id = el.dataset.note, v = el.value.trim();
      v ? (state.notes[id] = el.value) : delete state.notes[id];
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { save(); const s = $('#note-saved'); if (s) s.textContent = 'Saved'; }, 400);
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'import-file' && e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
  });

  // ---------- go ----------
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
