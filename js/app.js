import * as db from './db.js';
import {
  CATEGORIES, COMPLEXITY, COURSES, INDEX_MODES, RECEPTION, STYLES, buildIndex, applyRecipe, autocheck, emptyDish, normalizeDish, planRecipeImport, buildICS, byId, dishHistory, emptyState, findByName, googleCalendarUrl, guestHistory,
  mergeDishes, mergeGuests, newId, norm, parseDishList, search, sortEventsDesc, splitList, suggest, validateBackup,
} from './logic.js';

const APP_NAME = 'From My Table';
let state = emptyState();
const main = document.getElementById('main');

// ---------- helpers ----------

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso) {
  if (!iso) return 'No date';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const ICON = path =>
  `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
// Drawn in the text colour so it stays legible on any background (the 🥂 emoji is too pale).
const DRINK_ICON = ICON('<path d="M7 3h10l-1 6a4 4 0 0 1-8 0z"/><path d="M12 13v8M8 21h8"/>').replace('width="18" height="18"', 'class="inline-icon"');

const guestName = id => byId(state.guests, id)?.name ?? '(deleted guest)';
const dishName = id => byId(state.dishes, id)?.name ?? '(deleted dish)';
const isPlanned = e => (e.date || '') > today();
const plannedTag = e => (isPlanned(e) ? ' <span class="tag planned">Planned</span>' : '');
const eventLabel = e => `${fmtDate(e.date)}${e.title ? ' · ' + esc(e.title) : ''}${plannedTag(e)}`;
// Most recent event that has actually happened (planned dinners don't count as a visit yet).
const lastPast = events => events.find(e => !isPlanned(e));
function visitSummary(events) {
  const past = events.filter(e => !isPlanned(e));
  const planned = events.length - past.length;
  const parts = [past.length ? `${plural(past.length, 'visit')}, last ${fmtDate(past[0].date)}` : 'never visited'];
  if (planned) parts.push(`${planned} planned`);
  return parts.join(' · ');
}
const plural = (n, w) => `${n} ${n === 1 ? w : /(s|sh|ch|x)$/.test(w) ? w + 'es' : w + 's'}`;
const courseRank = c => (COURSES.indexOf(c) === -1 ? COURSES.length : COURSES.indexOf(c));

function sortedMenu(event) {
  return [...event.dishes].sort(
    (a, b) => courseRank(byId(state.dishes, a.dishId)?.course) - courseRank(byId(state.dishes, b.dishId)?.course),
  );
}

function receptionTag(r) {
  return r ? `<span class="tag rec-${r}">${esc(RECEPTION[r])}</span>` : '';
}

function prefTags(g) {
  const out = [];
  if (g.drinks) out.push(`<span class="tag drink">${DRINK_ICON} ${esc(g.drinks)}</span>`);
  for (const a of g.allergies || []) out.push(`<span class="tag allergy">⚠︎ Allergy: ${esc(a)}</span>`);
  for (const d of g.dislikes || []) out.push(`<span class="tag dislike">✗ ${esc(d)}</span>`);
  if (g.likes) out.push(`<span class="tag like">♥ ${esc(g.likes)}</span>`);
  return out.join(' ');
}

function menuLine(event) {
  return sortedMenu(event)
    .map(d => `<a href="#/dish/${d.dishId}">${esc(dishName(d.dishId))}</a>${d.reception ? ' ' + receptionTag(d.reception) : ''}`)
    .join(', ') || '<span class="muted">No dishes recorded</span>';
}

function guestLinks(ids, exclude) {
  return ids
    .filter(id => id !== exclude)
    .map(id => `<a href="#/guest/${id}">${esc(guestName(id))}</a>`)
    .join(', ') || '<span class="muted">nobody else</span>';
}

function debounce(fn, ms) {
  let t;
  let pending = null;
  const run = () => {
    clearTimeout(t);
    if (pending) {
      const a = pending;
      pending = null;
      fn(...a);
    }
  };
  const d = (...a) => {
    pending = a;
    clearTimeout(t);
    t = setTimeout(run, ms);
  };
  d.flush = run;
  return d;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

// Hands a generated file to the person: the share sheet where available (iPad), else a download.
async function deliverFile(name, type, content) {
  const file = new File([content], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: name });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Calendar files download rather than share: on iPad, opening a downloaded .ics shows Calendar's
// "Add" screen, which the share sheet does not offer.
function downloadCalendar(name, ics) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Appearance follows the iPad's Light/Dark setting. Clear any override saved by an earlier test build.
try {
  localStorage.removeItem('theme');
} catch {}

// ---------- persistence ----------

async function save(store, record) {
  const list = state[store];
  const i = list.findIndex(x => x.id === record.id);
  if (i === -1) list.push(record);
  else list[i] = record;
  try {
    await db.put(store, record);
  } catch (err) {
    alert('Could not save: ' + err.message);
  }
}

async function removeRecord(store, id) {
  state[store] = state[store].filter(x => x.id !== id);
  await db.remove(store, id);
}

async function createGuest(name) {
  const g = { id: newId(), name: name.trim(), drinks: '', likes: '', dislikes: [], allergies: [], notes: '' };
  await save('guests', g);
  return g;
}

async function createDish(name, course = '') {
  const d = emptyDish(name.trim(), course);
  await save('dishes', d);
  return d;
}

// ---------- autocomplete ----------

// Wires a text input to a dropdown of existing records, with an "Add new" option.
function autocomplete(input, { list, exclude = () => [], describe = () => '', onPick, onCreate, allowCreate = true }) {
  const box = document.createElement('div');
  box.className = 'ac-list';
  box.hidden = true;
  input.after(box);
  let options = [];
  let active = 0;

  function refresh() {
    const q = input.value.trim();
    if (!q) {
      box.hidden = true;
      return;
    }
    const items = suggest(list(), q, 8, exclude());
    options = items.map(item => ({ item }));
    if (allowCreate && !findByName(list(), q)) options.push({ create: q });
    active = 0;
    box.innerHTML = options
      .map((o, i) =>
        o.create
          ? `<div class="ac-opt ac-new" data-i="${i}">＋ Add new “${esc(o.create)}”</div>`
          : `<div class="ac-opt" data-i="${i}"><strong>${esc(o.item.name)}</strong><span class="muted"> ${describe(o.item)}</span></div>`,
      )
      .join('');
    box.hidden = !options.length;
    highlight();
  }

  function highlight() {
    box.querySelectorAll('.ac-opt').forEach((el, i) => el.classList.toggle('active', i === active));
  }

  async function choose(i) {
    const o = options[i];
    if (!o) return;
    box.hidden = true;
    input.value = '';
    if (o.create) await onCreate(o.create);
    else await onPick(o.item);
  }

  input.addEventListener('input', refresh);
  input.addEventListener('focus', refresh);
  input.addEventListener('blur', () => setTimeout(() => (box.hidden = true), 150));
  input.addEventListener('keydown', e => {
    if (box.hidden) {
      if (e.key === 'Enter') e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') active = Math.min(active + 1, options.length - 1);
    else if (e.key === 'ArrowUp') active = Math.max(active - 1, 0);
    else if (e.key === 'Enter') choose(active);
    else if (e.key === 'Escape') box.hidden = true;
    else return;
    e.preventDefault();
    highlight();
  });
  // pointerdown + preventDefault keeps the input focused (and the iPad keyboard up) while tapping.
  box.addEventListener('pointerdown', e => {
    const opt = e.target.closest('.ac-opt');
    if (!opt) return;
    e.preventDefault();
    choose(Number(opt.dataset.i));
  });
}

// ---------- views ----------

function setTitle(t) {
  document.title = t ? `${t} · ${APP_NAME}` : APP_NAME;
}

function backupReminder() {
  let last;
  try {
    last = localStorage.getItem('lastBackup');
  } catch {}
  const total = state.events.length + state.guests.length;
  if (!total) return '';
  const days = last ? (Date.now() - Number(last)) / 86400000 : Infinity;
  if (days < 30) return '';
  return `<div class="notice">Your records live only on this iPad. ${last ? `Last backup was ${Math.floor(days)} days ago.` : 'You have never made a backup.'} <a href="#/settings">Back up now</a></div>`;
}

function viewHome() {
  setTitle('');
  main.innerHTML = `
    ${backupReminder()}
    <div class="search-row">
      <input id="q" type="search" placeholder="Search a guest, dish, drink, note…" autocomplete="off" autocapitalize="off">
      <a class="btn primary" href="#/event/new">＋ Plan an event</a>
    </div>
    <div id="results"></div>`;
  const q = document.getElementById('q');
  const results = document.getElementById('results');
  const run = () => (results.innerHTML = q.value.trim() ? searchResults(q.value) : homeDefault());
  q.value = sessionStorage.getItem('q') || '';
  q.addEventListener('input', () => {
    sessionStorage.setItem('q', q.value);
    run();
  });
  run();
}

function homeDefault() {
  if (!state.events.length && !state.guests.length) {
    return `<div class="empty">
      <h2>Welcome</h2>
      <p>Start by recording a past dinner from your journal, or planning the next one. Guests and dishes you type are saved automatically, so they autocomplete next time.</p>
      <p class="btn-row center"><a class="btn primary" href="#/event/new">＋ Add your first event</a> <a class="btn" href="#/settings">Add dishes from your cookbook</a></p>
    </div>`;
  }
  const t = today();
  const upcoming = state.events.filter(e => e.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const recent = sortEventsDesc(state.events.filter(e => !(e.date >= t))).slice(0, 8);
  return `
    ${upcoming.length ? `<h2>Upcoming</h2>${upcoming.map(eventCard).join('')}` : ''}
    <h2>Recent</h2>${recent.map(eventCard).join('') || '<p class="muted">Nothing yet.</p>'}
    ${state.events.length > recent.length + upcoming.length ? '<p><a href="#/events">All events →</a></p>' : ''}`;
}

function eventCard(e) {
  return `<a class="card link-card" href="#/event/${e.id}">
    <div class="card-title">${eventLabel(e)}</div>
    <div><span class="label">Guests</span> ${e.guestIds.map(id => esc(guestName(id))).join(', ') || '<span class="muted">none</span>'}</div>
    <div><span class="label">Menu</span> ${sortedMenu(e).map(d => esc(dishName(d.dishId))).join(', ') || '<span class="muted">none</span>'}</div>
  </a>`;
}

function searchResults(q) {
  const r = search(state, q);
  if (!r.guests.length && !r.dishes.length && !r.events.length) return `<p class="muted">Nothing matches “${esc(q)}”.</p>`;
  let html = '';
  if (r.guests.length) {
    html += `<h2>Guests</h2>` + r.guests.map(guestSummary).join('');
  }
  if (r.dishes.length) {
    html += `<h2>Dishes</h2>` + r.dishes.map(dishSummary).join('');
  }
  if (r.events.length) {
    html += `<h2>Events</h2>` + r.events.map(eventCard).join('');
  }
  return html;
}

function guestSummary(g) {
  const hist = guestHistory(state, g.id);
  return `<div class="card">
    <div class="card-title"><a href="#/guest/${g.id}">${esc(g.name)}</a>
      <span class="muted">· ${visitSummary(hist)}</span></div>
    <div class="tags">${prefTags(g)}</div>
    ${g.notes ? `<div class="note">${esc(g.notes)}</div>` : ''}
    ${hist.length ? `<table class="hist"><tbody>${hist
      .map(
        e => `<tr><td class="nowrap"><a href="#/event/${e.id}">${fmtDate(e.date)}</a>${plannedTag(e)}</td>
          <td>${menuLine(e)}${e.beverages ? `<div class="muted">${DRINK_ICON} ${esc(e.beverages)}</div>` : ''}</td></tr>`,
      )
      .join('')}</tbody></table>` : ''}
  </div>`;
}

function dishSummary(d) {
  const hist = dishHistory(state, d.id);
  return `<div class="card">
    <div class="card-title"><a href="#/dish/${d.id}">${esc(d.name)}</a>
      <span class="muted">· ${d.course ? esc(d.course) + ' · ' : ''}served ${plural(hist.length, 'time')}</span></div>
    ${hist.length ? `<table class="hist"><tbody>${hist
      .map(
        h => `<tr><td class="nowrap"><a href="#/event/${h.event.id}">${fmtDate(h.event.date)}</a>${plannedTag(h.event)} ${receptionTag(h.entry.reception)}</td>
          <td><span class="label">To</span> ${guestLinks(h.event.guestIds)}<br>
          <span class="label">With</span> ${h.otherDishes.map(o => `<a href="#/dish/${o.id}">${esc(o.name)}</a>`).join(', ') || '<span class="muted">nothing else</span>'}</td></tr>`,
      )
      .join('')}</tbody></table>` : ''}
  </div>`;
}

// ----- lists -----

function viewList(kind) {
  const conf = {
    events: { title: 'Events', add: ['#/event/new', '＋ Plan an event'] },
    guests: { title: 'Guests', add: null },
    dishes: { title: 'Dishes', add: null },
  }[kind];
  const upcoming = state.events.filter(e => e.date >= today()).sort((a, b) => a.date.localeCompare(b.date));
  const extraBtn =
    kind === 'events' && upcoming.length
        ? `<button class="btn" id="cal-all">📅 Add ${plural(upcoming.length, 'upcoming event')} to Calendar</button>`
        : '';
  setTitle(conf.title);
  main.innerHTML = `
    <div class="search-row">
      <input id="filter" type="search" placeholder="Filter ${conf.title.toLowerCase()}…" autocomplete="off">
      ${conf.add ? `<a class="btn primary" href="${conf.add[0]}">${conf.add[1]}</a>` : `<button class="btn primary" id="add">＋ Add</button>`}
      ${extraBtn}
    </div>
    <div id="list"></div>`;
  const filter = document.getElementById('filter');
  const listEl = document.getElementById('list');
  const draw = () => {
    const q = norm(filter.value);
    if (kind === 'events') {
      const items = sortEventsDesc(state.events).filter(
        e => !q || norm([e.date, e.title, ...e.guestIds.map(guestName), ...e.dishes.map(d => dishName(d.dishId))].join(' ')).includes(q),
      );
      listEl.innerHTML = items.map(eventCard).join('') || '<p class="muted">No events.</p>';
    } else {
      const items = [...state[kind]].filter(x => !q || norm(x.name).includes(q)).sort((a, b) => a.name.localeCompare(b.name));
      listEl.innerHTML =
        `<ul class="plain">${items
          .map(x => {
            const n = kind === 'guests' ? guestHistory(state, x.id).length : dishHistory(state, x.id).length;
            const extra = kind === 'guests' ? prefTags(x) : esc(x.course || '');
            return `<li><a href="#/${kind === 'guests' ? 'guest' : 'dish'}/${x.id}"><strong>${esc(x.name)}</strong></a>
              <span class="muted">· ${kind === 'guests' ? visitSummary(guestHistory(state, x.id)) : `served ${plural(n, 'time')}`}</span> <span class="tags">${extra}</span></li>`;
          })
          .join('')}</ul>` + (items.length ? '' : '<p class="muted">None yet.</p>');
    }
  };
  filter.addEventListener('input', draw);
  document.getElementById('cal-all')?.addEventListener('click', () => {
    downloadCalendar('upcoming-dinners.ics', buildICS(state, upcoming));
  });
  document.getElementById('add')?.addEventListener('click', async () => {
    const name = prompt(kind === 'guests' ? 'Guest name' : 'Dish name');
    if (!name?.trim()) return;
    const existing = findByName(state[kind], name);
    if (existing) return (location.hash = `#/${kind === 'guests' ? 'guest' : 'dish'}/${existing.id}`);
    const rec = kind === 'guests' ? await createGuest(name) : await createDish(name);
    location.hash = `#/${kind === 'guests' ? 'guest' : 'dish'}/${rec.id}`;
  });
  draw();
}

// ----- guest -----

function viewGuest(id) {
  const g = byId(state.guests, id);
  if (!g) return notFound();
  setTitle(g.name);
  const hist = guestHistory(state, g.id);
  main.innerHTML = `
    <p><a href="#/guests">← All guests</a></p>
    <form class="card form" id="gform">
      <label>Name <input name="name" value="${esc(g.name)}" required></label>
      <label>Drinks <input name="drinks" value="${esc(g.drinks)}" placeholder="e.g. G&T, dry white, no alcohol"></label>
      <label class="danger-label">Allergies <span class="hint">comma-separated</span>
        <input name="allergies" value="${esc((g.allergies || []).join(', '))}" placeholder="e.g. shellfish, tree nuts"></label>
      <label>Dislikes <span class="hint">comma-separated</span>
        <input name="dislikes" value="${esc((g.dislikes || []).join(', '))}" placeholder="e.g. mushrooms, coriander"></label>
      <label>Loves <input name="likes" value="${esc(g.likes)}" placeholder="e.g. anything chocolate"></label>
      <label>Notes <textarea name="notes" rows="3" placeholder="Partner, kids, dietary, seating…">${esc(g.notes)}</textarea></label>
      <p class="hint">Changes save automatically.</p>
    </form>
    <h2>${hist.length ? `Visits (${hist.length})` : 'No visits yet'}</h2>
    ${hist
      .map(
        e => `<div class="card">
          <div class="card-title"><a href="#/event/${e.id}">${eventLabel(e)}</a></div>
          <div><span class="label">With</span> ${guestLinks(e.guestIds, g.id)}</div>
          <div><span class="label">Menu</span> ${menuLine(e)}</div>
          ${e.beverages ? `<div><span class="label">Drinks</span> ${esc(e.beverages)}</div>` : ''}
          ${e.worked ? `<div><span class="label">Worked</span> ${esc(e.worked)}</div>` : ''}
          ${e.didnt ? `<div><span class="label">Didn’t</span> ${esc(e.didnt)}</div>` : ''}
        </div>`,
      )
      .join('')}
    ${mergeSection('guest')}
    <p class="danger-zone"><button class="btn danger" id="del">Delete guest</button></p>`;
  wireMerge('guest', g);

  const form = document.getElementById('gform');
  const persist = debounce(() => {
    const f = new FormData(form);
    const name = String(f.get('name')).trim();
    if (!name) return;
    save('guests', {
      ...g,
      name,
      drinks: String(f.get('drinks')).trim(),
      likes: String(f.get('likes')).trim(),
      notes: String(f.get('notes')).trim(),
      allergies: splitList(f.get('allergies')),
      dislikes: splitList(f.get('dislikes')),
    });
    setTitle(name);
  }, 400);
  form.addEventListener('input', persist);
  form.addEventListener('submit', e => e.preventDefault());
  document.getElementById('del').addEventListener('click', async () => {
    if (!confirm(`Delete ${g.name}? They will also be removed from ${plural(hist.length, 'event')}.`)) return;
    for (const e of hist) await save('events', { ...e, guestIds: e.guestIds.filter(x => x !== g.id) });
    await removeRecord('guests', g.id);
    location.hash = '#/guests';
  });
}

// ----- dishes: recipe index and recipe card -----

function starText(n) {
  if (!n) return '';
  const full = Math.floor(n);
  return `<span class="stars" aria-label="${n} stars">${'★'.repeat(full)}${n % 1 ? '½' : ''}<span class="stars-num">${n}</span></span>`;
}

// Remembered for the session so leaving a recipe and coming back keeps your place.
const dishIndexState = { mode: 'category', view: 'cards', showFilters: false, f: {} };
try {
  Object.assign(dishIndexState, JSON.parse(sessionStorage.getItem('dishIndex') || '{}'));
} catch {}

function viewDishIndex() {
  setTitle('Dishes');
  const s = dishIndexState;
  const cuisines = [...new Set(state.dishes.map(d => d.cuisine).filter(Boolean))].sort();
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur ?? '') === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  main.innerHTML = `
    <div class="search-row">
      <input id="filter" type="search" placeholder="Search name, ingredient, source…" autocomplete="off" value="${esc(s.f.q || '')}">
      <div class="segmented" role="group" aria-label="View">
        <button type="button" data-view="cards" aria-pressed="${s.view === 'cards'}">Cards</button>
        <button type="button" data-view="list" aria-pressed="${s.view === 'list'}">Index</button>
      </div>
    </div>
    <div class="index-modes" role="group" aria-label="Sort">
      ${Object.entries(INDEX_MODES).map(([k, v]) => `<button type="button" class="pill ${s.mode === k ? 'on' : ''}" data-mode="${k}" aria-pressed="${s.mode === k}">${esc(v)}</button>`).join('')}
      <button type="button" class="pill ghost" id="toggle-filters" aria-expanded="${s.showFilters}">Filters${activeFilterCount() ? ` (${activeFilterCount()})` : ''}</button>
    </div>
    <div class="card index-filters" id="filters" ${s.showFilters ? '' : 'hidden'}>
      <label>Category <select data-f="category">${opt('', 'Any')}${CATEGORIES.map(c => opt(c, c, s.f.category)).join('')}</select></label>
      <label>Course <select data-f="course">${opt('', 'Any')}${COURSES.map(c => opt(c, c, s.f.course)).join('')}</select></label>
      <label>Cooking style <select data-f="cuisine">${opt('', 'Any')}${cuisines.map(c => opt(c, c, s.f.cuisine)).join('')}</select></label>
      <label>Style <select data-f="style">${opt('', 'Any')}${Object.entries(STYLES).map(([n, l]) => opt(n, `${n} · ${l}`, s.f.style)).join('')}</select></label>
      <label>Complexity <select data-f="complexity">${opt('', 'Any')}${Object.entries(COMPLEXITY).map(([n, l]) => opt(n, `${n} · ${l}`, s.f.complexity)).join('')}</select></label>
      <label>Stars <select data-f="minStars">${opt('', 'Any')}${[5, 4.5, 4, 3.5, 3].map(n => opt(n, `${n}+`, s.f.minStars)).join('')}</select></label>
      <label>Total time <select data-f="maxMinutes">${opt('', 'Any')}${[[15, 'Up to 15 min'], [30, 'Up to 30 min'], [45, 'Up to 45 min'], [60, 'Up to 1 hour'], [120, 'Up to 2 hours']].map(([n, l]) => opt(n, l, s.f.maxMinutes)).join('')}</select></label>
      <button type="button" class="btn" id="clear-filters">Clear filters</button>
      <p class="hint">Time limits include recipes with no time listed.</p>
    </div>
    <div id="list"></div>`;

  const save = () => {
    try {
      sessionStorage.setItem('dishIndex', JSON.stringify(s));
    } catch {}
  };
  const listEl = document.getElementById('list');

  const draw = () => {
    const groups = buildIndex(state.dishes, s.mode, s.f);
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    if (!total) {
      listEl.innerHTML = `<p class="muted">${state.dishes.length ? 'No dishes match.' : 'No dishes yet. Add them from Settings → Add dishes, or type one into an event’s menu.'}</p>`;
      return;
    }
    const count = `<p class="muted small index-count">${plural(total, 'recipe')}</p>`;
    listEl.innerHTML =
      count +
      groups
        .map(g => {
          const head = g.heading ? `<h2 class="index-heading">${esc(s.mode === 'cuisine' ? g.heading : CATEGORY_HEADINGS[g.heading] || g.heading)} <span class="muted small">${g.items.length}</span></h2>` : '';
          return head + (s.view === 'list' ? indexTable(g.items) : `<div class="recipe-grid-list">${g.items.map(dishTile).join('')}</div>`);
        })
        .join('');
  };

  document.getElementById('filter').addEventListener(
    'input',
    debounce(e => {
      s.f.q = e.target.value;
      save();
      draw();
    }, 150),
  );
  main.querySelectorAll('[data-mode]').forEach(b =>
    b.addEventListener('click', () => {
      s.mode = b.dataset.mode;
      save();
      viewDishIndex();
    }),
  );
  main.querySelectorAll('[data-view]').forEach(b =>
    b.addEventListener('click', () => {
      s.view = b.dataset.view;
      save();
      viewDishIndex();
    }),
  );
  document.getElementById('toggle-filters').addEventListener('click', () => {
    s.showFilters = !s.showFilters;
    save();
    viewDishIndex();
  });
  main.querySelectorAll('[data-f]').forEach(sel =>
    sel.addEventListener('change', () => {
      if (sel.value) s.f[sel.dataset.f] = sel.value;
      else delete s.f[sel.dataset.f];
      save();
      viewDishIndex();
    }),
  );
  document.getElementById('clear-filters').addEventListener('click', () => {
    s.f = s.f.q ? { q: s.f.q } : {};
    save();
    viewDishIndex();
  });
  draw();
}

// Group names as printed in the cookbook's index pages.
const CATEGORY_HEADINGS = {
  Appy: 'Appetizers', Pasta: 'Pastas', Starch: 'Other Starches (rice & potato dishes)', 'Entrée': 'Entrées',
  Veggie: 'Veggie Dishes', Dessert: 'Desserts', Snack: 'Snacks', Other: 'Other Stuff (sauces & things)',
};

function activeFilterCount() {
  return Object.keys(dishIndexState.f).filter(k => k !== 'q').length;
}

function dishTile(d) {
  const served = dishHistory(state, d.id).length;
  const meta = [d.category, d.course].filter(Boolean).map(esc).join(' · ');
  return `<a class="card link-card recipe-tile" href="#/dish/${d.id}">
    <div class="recipe-tile-name">${esc(d.name)}</div>
    ${meta ? `<div class="muted small">${meta}</div>` : ''}
    ${d.mainIngredient ? `<div class="small">${esc(d.mainIngredient)}</div>` : ''}
    <div class="recipe-tile-foot">
      ${starText(d.stars)}
      ${d.total ? `<span class="muted small">⏱ ${esc(d.total)}</span>` : ''}
      <span class="muted small">${served ? `served ${plural(served, 'time')}` : 'not served yet'}</span>
    </div>
  </a>`;
}

// Rows laid out like the printed cookbook's index pages.
function indexTable(items) {
  return `<div class="index-scroll"><table class="index-table">
    <thead><tr><th>Name</th><th>Main ingredient</th><th class="num">Total</th><th class="num">Style</th><th class="num">Comp</th><th>Cat</th><th class="num">Stars</th></tr></thead>
    <tbody>${items
      .map(
        d => `<tr>
          <td><a href="#/dish/${d.id}">${esc(d.name)}</a></td>
          <td class="muted">${esc(d.mainIngredient)}</td>
          <td class="num">${esc(d.total) || '—'}</td>
          <td class="num">${d.style || '—'}</td>
          <td class="num">${d.complexity || '—'}</td>
          <td>${d.category ? `${CATEGORIES.indexOf(d.category) + 1}` : '—'}</td>
          <td class="num stars-cell">${d.stars || '—'}</td>
        </tr>`,
      )
      .join('')}</tbody></table></div>`;
}

function viewDish(id, editing = false) {
  const d = byId(state.dishes, id);
  if (!d) return notFound();
  setTitle(d.name);
  const hist = dishHistory(state, d.id);
  const val = (label, v) => `<div class="kv"><span class="label">${label}</span> ${v ? esc(v) : '<span class="muted">—</span>'}</div>`;
  const numbered = (map, n) => (n ? `${n} · ${map[n]}` : '');
  const paras = t =>
    t
      .split(/\n\s*\n/)
      .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
      .join('');

  const card = editing
    ? `<form class="card form recipe recipe-edit" id="dform">
        <label class="recipe-name-label">Name <input name="name" value="${esc(d.name)}" required></label>
        <div class="recipe-cols">
          <div>
            <label>Main ingredient <input name="mainIngredient" value="${esc(d.mainIngredient)}"></label>
            ${choiceGroup('Style', 'style', STYLES, d.style)}
            ${choiceGroup('Complexity', 'complexity', COMPLEXITY, d.complexity)}
            <div class="row">
              <label class="grow">Category <select name="category"><option value="">—</option>${CATEGORIES.map(
                (c, i) => `<option value="${esc(c)}" ${c === d.category ? 'selected' : ''}>${i + 1} = ${esc(c)}</option>`,
              ).join('')}</select></label>
              <label class="grow">Course <select name="course"><option value="">—</option>${COURSES.map(
                c => `<option ${c === d.course ? 'selected' : ''}>${esc(c)}</option>`,
              ).join('')}</select></label>
            </div>
            <div class="row times">
              <label>Prep <input name="prep" value="${esc(d.prep)}" placeholder="0:10"></label>
              <label>Cooking <input name="cook" value="${esc(d.cook)}" placeholder="0:20"></label>
              <label>Total <input name="total" value="${esc(d.total)}" placeholder="0:30"></label>
            </div>
            <label>Ingredients <span class="hint">one per line; also used for the allergy check</span>
              <textarea name="ingredients" rows="13">${esc((d.ingredients || []).join('\n'))}</textarea></label>
          </div>
          <div>
            <label>Instructions <span class="hint">leave a blank line between steps</span>
              <textarea name="instructions" rows="20">${esc(d.instructions)}</textarea></label>
          </div>
        </div>
        <div class="row">
          <label class="grow">Cooking style <input name="cuisine" value="${esc(d.cuisine)}" placeholder="e.g. Asian"></label>
          <label class="grow">Source <input name="source" value="${esc(d.source)}"></label>
          <label>Stars <select name="stars"><option value="0">—</option>${[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
            .map(n => `<option value="${n}" ${n === d.stars ? 'selected' : ''}>${n}</option>`)
            .join('')}</select></label>
        </div>
        <label>Chef’s notes <textarea name="notes" rows="3">${esc(d.notes)}</textarea></label>
        <div class="btn-row"><button class="btn primary" type="button" id="done">Done</button><span class="hint">Changes save as you type.</span></div>
      </form>`
    : `<article class="card recipe">
        <div class="recipe-head">
          <h1 class="recipe-title">${esc(d.name)}</h1>
          <button class="btn" type="button" id="edit">Edit recipe</button>
        </div>
        <div class="recipe-cols">
          <div>
            ${val('Main ingredient', d.mainIngredient)}
            ${val('Style', numbered(STYLES, d.style))}
            ${val('Complexity', numbered(COMPLEXITY, d.complexity))}
            ${val('Category', d.category ? `${CATEGORIES.indexOf(d.category) + 1} · ${d.category}` : '')}
            ${val('Course', d.course)}
            <div class="times-row">${val('Prep', d.prep)}${val('Cooking', d.cook)}${val('Total', d.total)}</div>
            <h2 class="recipe-sub">Ingredients</h2>
            <div class="ingredients-box">${
              d.ingredients?.length ? `<ul>${d.ingredients.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p class="muted">None listed yet.</p>'
            }</div>
          </div>
          <div>
            <h2 class="recipe-sub">Instructions</h2>
            <div class="instructions">${d.instructions ? paras(d.instructions) : '<p class="muted">None yet.</p>'}</div>
          </div>
        </div>
        <div class="recipe-foot">
          ${val('Cooking style', d.cuisine)}
          ${val('Source', d.source)}
          <div class="kv"><span class="label">Stars</span> ${d.stars ? starText(d.stars) : '<span class="muted">—</span>'}</div>
        </div>
        ${d.notes ? `<h2 class="recipe-sub">Chef’s notes</h2><p class="note">${esc(d.notes)}</p>` : ''}
      </article>`;

  main.innerHTML = `
    <p><a href="#/dishes">← All dishes</a></p>
    ${card}
    <h2>${hist.length ? `Served ${plural(hist.length, 'time')}` : 'Not served yet'}</h2>
    ${hist
      .map(
        h => `<div class="card">
          <div class="card-title"><a href="#/event/${h.event.id}">${eventLabel(h.event)}</a> ${receptionTag(h.entry.reception)}</div>
          <div><span class="label">To</span> ${guestLinks(h.event.guestIds)}</div>
          <div><span class="label">With</span> ${h.otherDishes.map(o => `<a href="#/dish/${o.id}">${esc(o.name)}</a>`).join(', ') || '<span class="muted">nothing else</span>'}</div>
          ${h.entry.note ? `<div class="note">${esc(h.entry.note)}</div>` : ''}
        </div>`,
      )
      .join('')}
    ${mergeSection('dish')}
    <p class="danger-zone"><button class="btn danger" id="del">Delete dish</button></p>`;
  wireMerge('dish', d);

  document.getElementById('edit')?.addEventListener('click', () => (location.hash = `#/dish/${id}/edit`));
  document.getElementById('done')?.addEventListener('click', () => {
    persist.flush();
    location.hash = `#/dish/${id}`;
  });

  const form = document.getElementById('dform');
  const persist = debounce(() => {
    if (!form) return;
    const f = new FormData(form);
    const name = String(f.get('name')).trim();
    if (!name) return;
    const next = normalizeDish({
      ...byId(state.dishes, id),
      name,
      mainIngredient: f.get('mainIngredient'),
      style: f.get('style'),
      complexity: f.get('complexity'),
      category: f.get('category'),
      course: f.get('course'),
      prep: f.get('prep'),
      cook: f.get('cook'),
      total: f.get('total'),
      ingredients: String(f.get('ingredients')).split('\n'),
      instructions: f.get('instructions'),
      cuisine: f.get('cuisine'),
      source: f.get('source'),
      stars: f.get('stars'),
      notes: f.get('notes'),
    });
    save('dishes', next);
    setTitle(name);
  }, 400);
  form?.addEventListener('input', persist);
  form?.addEventListener('change', persist);
  form?.addEventListener('submit', e => e.preventDefault());

  document.getElementById('del').addEventListener('click', async () => {
    if (!confirm(`Delete ${d.name}? It will also be removed from ${plural(hist.length, 'menu')}.`)) return;
    for (const h of hist) await save('events', { ...h.event, dishes: h.event.dishes.filter(x => x.dishId !== d.id) });
    await removeRecord('dishes', d.id);
    location.hash = '#/dishes';
  });
}

// Numbered choices like the printed card ("1 = Plain, 2 = Day to day, 3 = Elegant").
function choiceGroup(legend, name, map, value) {
  return `<fieldset class="choices"><legend>${legend}</legend>${Object.entries(map)
    .map(
      ([n, label]) => `<label class="choice"><input type="radio" name="${name}" value="${n}" ${Number(n) === value ? 'checked' : ''}><span>${n} = ${esc(label)}</span></label>`,
    )
    .join('')}</fieldset>`;
}

// ----- merging duplicates -----

function mergeSection(kind) {
  const what = kind === 'guest' ? 'visits and preferences' : 'history, notes and ingredients';
  return `<h2>Duplicate?</h2>
    <div class="card">
      <p class="hint">If this ${kind} is also listed under another name, find it here to combine the two. All ${what} are kept.</p>
      <div class="ac-wrap"><input id="merge-in" placeholder="Type the other name…" autocomplete="off" autocorrect="off"></div>
      <div id="merge-confirm"></div>
    </div>`;
}

function wireMerge(kind, rec) {
  const store = kind === 'guest' ? 'guests' : 'dishes';
  const count = id =>
    kind === 'guest' ? plural(guestHistory(state, id).length, 'visit') : `served ${plural(dishHistory(state, id).length, 'time')}`;
  autocomplete(document.getElementById('merge-in'), {
    list: () => state[store],
    exclude: () => [rec.id],
    allowCreate: false,
    describe: x => `· ${count(x.id)}`,
    onPick: other => {
      const box = document.getElementById('merge-confirm');
      box.innerHTML = `<div class="merge-confirm">
        <p>Combine <strong>${esc(rec.name)}</strong> (${count(rec.id)}) and <strong>${esc(other.name)}</strong> (${count(other.id)}) into one ${kind}. Which name should it keep?</p>
        <div class="btn-row">
          <button class="btn primary" data-keep="${rec.id}">Keep “${esc(rec.name)}”</button>
          <button class="btn primary" data-keep="${other.id}">Keep “${esc(other.name)}”</button>
          <button class="btn" data-cancel>Cancel</button>
        </div>
      </div>`;
      box.querySelector('[data-cancel]').addEventListener('click', () => (box.innerHTML = ''));
      box.querySelectorAll('[data-keep]').forEach(b =>
        b.addEventListener('click', async () => {
          const keepId = b.dataset.keep;
          const dropId = keepId === rec.id ? other.id : rec.id;
          const r = kind === 'guest' ? mergeGuests(state, keepId, dropId) : mergeDishes(state, keepId, dropId);
          await save(store, r.guest || r.dish);
          for (const e of r.events) await save('events', e);
          await removeRecord(store, dropId);
          toast('Merged');
          if (location.hash === `#/${kind}/${keepId}`) route();
          else location.hash = `#/${kind}/${keepId}`;
        }),
      );
    },
  });
}

// ----- bulk add dishes -----

function viewImport() {
  setTitle('Add many dishes');
  main.innerHTML = `
    <p><a href="#/settings">← Settings</a></p>
    <h2>Add many dishes at once</h2>
    <div class="card form">
      <p>Put one dish per line. Page numbers, dotted leaders and bullets are removed. Headings such as “Starters” or “Desserts” set the course for the dishes below them.</p>
      <ol class="steps">
        <li><strong>From your cookbook file:</strong> open it in Pages or Word, copy the contents page or the recipe titles, and paste them below.</li>
        <li><strong>From a printed page:</strong> tap the box below, tap it again, and choose <strong>Scan Text</strong>, then point the camera at the page.</li>
        <li><strong>From a photo:</strong> open it in Photos, press and hold on the text, choose <strong>Select All</strong>, then <strong>Copy</strong>, and paste below.</li>
      </ol>
      <label>Dishes <textarea id="bulk" rows="10" placeholder="STARTERS&#10;Gravlax with dill ........ 12&#10;MAINS&#10;Beef Wellington ........ 22"></textarea></label>
      <div class="row">
        <label>Course if there’s no heading <select id="bulk-course"><option value="">—</option>${COURSES.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
        <button class="btn primary" id="bulk-review-btn" type="button">Review list</button>
      </div>
    </div>
    <div id="bulk-review"></div>`;

  const bulk = document.getElementById('bulk');
  try {
    bulk.value = sessionStorage.getItem('bulk') || '';
  } catch {}
  bulk.addEventListener('input', () => {
    try {
      sessionStorage.setItem('bulk', bulk.value);
    } catch {}
  });

  document.getElementById('bulk-review-btn').addEventListener('click', () => {
    const rows = parseDishList(bulk.value, document.getElementById('bulk-course').value);
    const review = document.getElementById('bulk-review');
    if (!rows.length) {
      review.innerHTML = '<p class="muted">No dish names found. Paste or scan some text above first.</p>';
      return;
    }
    review.innerHTML = `
      <h2>Check the list</h2>
      <div class="card">
        <p class="hint">Fix any names, set courses, and untick anything that isn’t a dish. Dishes you already have are unticked.</p>
        <ul class="import-list">${rows
          .map((r, i) => {
            const exists = findByName(state.dishes, r.name);
            return `<li class="${exists ? 'dupe' : ''}">
              <input type="checkbox" id="imp-on-${i}" ${exists ? '' : 'checked'} aria-label="Include">
              <input type="text" id="imp-name-${i}" value="${esc(r.name)}" aria-label="Dish name">
              <select id="imp-course-${i}" aria-label="Course"><option value="">—</option>${COURSES.map(
                c => `<option ${c === r.course ? 'selected' : ''}>${esc(c)}</option>`,
              ).join('')}</select>
              ${exists ? '<span class="tag exists">Already added</span>' : ''}
            </li>`;
          })
          .join('')}</ul>
        <p class="btn-row spaced"><button class="btn primary" id="bulk-save" type="button"></button></p>
      </div>`;
    const saveBtn = document.getElementById('bulk-save');
    const checked = () => rows.map((_, i) => i).filter(i => document.getElementById(`imp-on-${i}`).checked);
    const label = () => {
      const n = checked().length;
      saveBtn.textContent = `Add ${plural(n, 'dish')}`;
      saveBtn.disabled = !n;
    };
    review.addEventListener('change', label);
    label();
    saveBtn.addEventListener('click', async () => {
      let added = 0;
      for (const i of checked()) {
        const name = document.getElementById(`imp-name-${i}`).value.trim();
        if (!name || findByName(state.dishes, name)) continue;
        await createDish(name, document.getElementById(`imp-course-${i}`).value);
        added++;
      }
      try {
        sessionStorage.removeItem('bulk');
      } catch {}
      toast(`Added ${plural(added, 'dish')}`);
      location.hash = '#/dishes';
    });
    review.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ----- event (plan / record) -----

function viewEvent(id) {
  let ev;
  if (id === 'new') {
    ev = { id: newId(), date: today(), time: '', title: '', guestIds: [], dishes: [], beverages: '', worked: '', didnt: '', notes: '' };
  } else {
    ev = byId(state.events, id);
    if (!ev) return notFound();
    ev = structuredClone(ev);
  }
  let saved = id !== 'new';

  async function commit() {
    await save('events', structuredClone(ev));
    if (!saved) {
      saved = true;
      history.replaceState(null, '', `#/event/${ev.id}`);
    }
  }

  const FIELDS = ['date', 'time', 'title', 'beverages', 'worked', 'didnt', 'notes'];

  function draw(focusId) {
    // Pick up anything typed but not yet flushed by a debounce before the DOM is rebuilt.
    if (main.dataset.eventId === ev.id) {
      for (const f of FIELDS) {
        const el = document.getElementById(f);
        if (el) ev[f] = el.value;
      }
    }
    main.dataset.eventId = ev.id;
    setTitle(ev.title || fmtDate(ev.date));
    const check = autocheck(state, ev);
    main.innerHTML = `
      <p><a href="#/events">← All events</a></p>
      <div class="card form">
        <div class="row">
          <label>Date <input type="date" id="date" value="${esc(ev.date)}"></label>
          <label>Time <input type="time" id="time" value="${esc(ev.time || '')}"></label>
          <label class="grow">Occasion <input id="title" value="${esc(ev.title)}" placeholder="e.g. Book club dinner"></label>
        </div>
      </div>

      <h2>Guests</h2>
      <div class="card">
        <div class="chips">${ev.guestIds
          .map(gid => `<span class="chip">${esc(guestName(gid))}<button data-rm-guest="${gid}" aria-label="Remove">×</button></span>`)
          .join('')}</div>
        <div class="ac-wrap"><input id="guest-in" placeholder="Type a guest’s name…" autocomplete="off" autocorrect="off"></div>
      </div>
      ${ev.guestIds.length ? `<div class="briefing">${ev.guestIds.map(briefing).join('')}</div>` : ''}

      <h2>Menu</h2>
      ${checkPanel(check)}
      <div class="card">
        ${sortedMenu(ev).map(menuRow).join('') || '<p class="muted">No dishes yet.</p>'}
        <div class="row add-dish">
          <div class="ac-wrap grow"><input id="dish-in" placeholder="Add a dish…" autocomplete="off"></div>
          <select id="dish-course" aria-label="Course for a new dish"><option value="">Course for new dish…</option>${COURSES.map(c => `<option>${esc(c)}</option>`).join('')}</select>
        </div>
      </div>

      <h2>Notes</h2>
      <div class="card form">
        <label>Beverages served <textarea id="beverages" rows="2" placeholder="e.g. G&Ts on arrival, Chablis, port with cheese">${esc(ev.beverages)}</textarea></label>
        <label>What worked <textarea id="worked" rows="2">${esc(ev.worked)}</textarea></label>
        <label>What didn’t <textarea id="didnt" rows="2">${esc(ev.didnt)}</textarea></label>
        <label>Other notes <textarea id="notes" rows="2">${esc(ev.notes)}</textarea></label>
        <p class="hint">${saved ? 'Changes save automatically.' : 'This event is saved as soon as you add something.'}</p>
      </div>
      ${saved ? `<h2>Calendar</h2>
      <div class="card">
        <div class="btn-row">
          <button class="btn" id="cal-ics" type="button">📅 Add to Calendar</button>
          <button class="btn" id="cal-google" type="button">Google Calendar</button>
        </div>
        <p class="hint">${ev.time ? 'Added as a 3-hour event.' : 'No time set, so it’s added as an all-day event.'} The guest list, menu and any allergies go in the event notes.</p>
      </div>
      <p class="danger-zone"><button class="btn danger" id="del">Delete event</button></p>` : ''}`;

    // fields
    for (const f of FIELDS) {
      const el = document.getElementById(f);
      const persist = debounce(() => {
        ev[f] = el.value;
        commit();
        if (f === 'date' || f === 'time') draw(); // date changes what counts as "before"; time changes calendar hint
      }, f === 'date' || f === 'time' ? 0 : 400);
      el.addEventListener(f === 'date' || f === 'time' ? 'change' : 'input', persist);
    }

    document.getElementById('cal-ics')?.addEventListener('click', () => {
      downloadCalendar(`${(ev.title || 'dinner').replace(/[^\w-]+/g, '-').toLowerCase()}-${ev.date}.ics`, buildICS(state, [ev]));
    });
    document.getElementById('cal-google')?.addEventListener('click', () => {
      window.open(googleCalendarUrl(state, ev), '_blank', 'noopener');
    });

    // guests
    autocomplete(document.getElementById('guest-in'), {
      list: () => state.guests,
      exclude: () => ev.guestIds,
      describe: g => {
        const last = lastPast(guestHistory(state, g.id, ev.id));
        return last ? `· last here ${fmtDate(last.date)}` : '';
      },
      onPick: async g => {
        ev.guestIds.push(g.id);
        await commit();
        draw('guest-in');
      },
      onCreate: async name => {
        const g = await createGuest(name);
        ev.guestIds.push(g.id);
        await commit();
        draw('guest-in');
        toast(`Added ${g.name} to your guest list`);
      },
    });

    // dishes
    autocomplete(document.getElementById('dish-in'), {
      list: () => state.dishes,
      exclude: () => ev.dishes.map(d => d.dishId),
      describe: d => esc(d.course || ''),
      onPick: async d => {
        ev.dishes.push({ dishId: d.id, reception: '', note: '' });
        await commit();
        draw('dish-in');
      },
      onCreate: async name => {
        const d = await createDish(name, document.getElementById('dish-course').value);
        ev.dishes.push({ dishId: d.id, reception: '', note: '' });
        await commit();
        draw('dish-in');
      },
    });

    main.querySelectorAll('[data-rm-guest]').forEach(b =>
      b.addEventListener('click', async () => {
        ev.guestIds = ev.guestIds.filter(x => x !== b.dataset.rmGuest);
        await commit();
        draw();
      }),
    );
    main.querySelectorAll('[data-rm-dish]').forEach(b =>
      b.addEventListener('click', async () => {
        ev.dishes = ev.dishes.filter(x => x.dishId !== b.dataset.rmDish);
        await commit();
        draw();
      }),
    );
    main.querySelectorAll('[data-reception]').forEach(sel =>
      sel.addEventListener('change', () => {
        ev.dishes.find(x => x.dishId === sel.dataset.reception).reception = sel.value;
        commit();
      }),
    );
    main.querySelectorAll('[data-dish-note]').forEach(inp =>
      inp.addEventListener(
        'input',
        debounce(() => {
          ev.dishes.find(x => x.dishId === inp.dataset.dishNote).note = inp.value;
          commit();
        }, 400),
      ),
    );
    document.getElementById('del')?.addEventListener('click', async () => {
      if (!confirm('Delete this event? This cannot be undone.')) return;
      await removeRecord('events', ev.id);
      location.hash = '#/events';
    });

    if (focusId) document.getElementById(focusId)?.focus();
  }

  function briefing(gid) {
    const g = byId(state.guests, gid);
    if (!g) return '';
    const prior = guestHistory(state, gid, ev.id).filter(e => !isPlanned(e) && e.date <= ev.date);
    const last = prior[0];
    const visits = prior.length;
    return `<div class="card brief">
      <div class="card-title"><a href="#/guest/${g.id}">${esc(g.name)}</a></div>
      <div class="tags">${prefTags(g) || '<span class="muted">No preferences recorded — <a href="#/guest/' + g.id + '">add some</a></span>'}</div>
      ${g.notes ? `<div class="note">${esc(g.notes)}</div>` : ''}
      <div class="muted small">${last ? `${plural(visits, 'previous visit')}. Last: ${fmtDate(last.date)} — ${sortedMenu(last).map(d => esc(dishName(d.dishId))).join(', ') || 'no menu recorded'}` : 'First visit'}</div>
    </div>`;
  }

  function menuRow(entry) {
    const d = byId(state.dishes, entry.dishId);
    return `<div class="menu-row">
      <div class="grow">
        <a href="#/dish/${entry.dishId}"><strong>${esc(d?.name ?? '(deleted dish)')}</strong></a>
        ${d?.course ? `<span class="muted small">${esc(d.course)}</span>` : ''}
        <input class="dish-note" data-dish-note="${entry.dishId}" value="${esc(entry.note)}" placeholder="Note (optional)">
      </div>
      <select data-reception="${entry.dishId}" aria-label="How it was received">
        <option value="">How did it go?</option>
        ${Object.entries(RECEPTION).map(([k, v]) => `<option value="${k}" ${entry.reception === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
      </select>
      <button class="icon-btn" data-rm-dish="${entry.dishId}" aria-label="Remove dish">×</button>
    </div>`;
  }

  draw();
}

function checkPanel({ served, conflicts }) {
  if (!served.length && !conflicts.length) return '';
  const items = [];
  for (const c of conflicts) {
    items.push(`<li class="${c.kind === 'allergy' ? 'warn-allergy' : 'warn-dislike'}">
      <strong>${c.kind === 'allergy' ? '⚠︎ Allergy' : '✗ Dislike'}:</strong>
      ${esc(c.guest.name)} — ${esc(c.term)} · <em>${esc(c.dish.name)}</em></li>`);
  }
  for (const s of served) {
    const when = s.events
      .map(e => {
        const entry = e.dishes.find(d => d.dishId === s.dish.id);
        return `<a href="#/event/${e.id}">${fmtDate(e.date)}</a>${plannedTag(e)}${entry?.reception ? ' ' + receptionTag(entry.reception) : ''}`;
      })
      .join('; ');
    items.push(`<li class="warn-served"><strong>↺ Served before:</strong> <em>${esc(s.dish.name)}</em> to ${esc(s.guest.name)} — ${when}</li>`);
  }
  return `<div class="checks card"><ul class="plain">${items.join('')}</ul>
    <p class="hint">Re-serving is fine — this is just so you know. Allergy/dislike flags match dish names and listed ingredients only, so always double-check.</p></div>`;
}

// ----- backup -----

function viewBackup() {
  setTitle('Settings');
  let last;
  try {
    last = localStorage.getItem('lastBackup');
  } catch {}
  main.innerHTML = `
    <h2>Add dishes</h2>
    <div class="card form">
      <div class="row">
        <label class="grow">One dish <input id="one-dish" placeholder="Dish name" autocomplete="off"></label>
        <button class="btn primary" type="button" id="one-dish-add">Add and open</button>
      </div>
      <div class="add-ways">
        <div>
          <strong>Many at once</strong>
          <p class="hint">Paste recipe titles from your cookbook file, or use Scan Text on a contents page.</p>
          <a class="btn" href="#/import">Add many at once</a>
        </div>
        <div>
          <strong>Recipe file</strong>
          <p class="hint">Load a recipe file made from your scanned recipe pages. You’ll see the list before anything is saved.</p>
          <label class="btn file-btn">Choose recipe file<input type="file" id="recipe-file" accept="application/json,.json"></label>
        </div>
      </div>
      <div id="recipe-review"></div>
    </div>
    <h2>Your data</h2>
    <div class="card">
      <p>${plural(state.events.length, 'event')}, ${plural(state.guests.length, 'guest')}, ${plural(state.dishes.length, 'dish')}.</p>
      <p class="muted" id="persist"></p>
    </div>
    <h2>Back up</h2>
    <div class="card">
      <p>Everything is stored only on this iPad. Save a backup file regularly (to Files, iCloud Drive, or email it to yourself).</p>
      <p>${last ? `Last backup: ${new Date(Number(last)).toLocaleString()}` : '<strong>No backup made yet.</strong>'}</p>
      <button class="btn primary" id="export">Save backup file</button>
    </div>
    <h2>Restore</h2>
    <div class="card">
      <p>Restoring <strong>replaces</strong> everything in the app with the contents of the backup file.</p>
      <input type="file" id="import" accept="application/json,.json">
    </div>`;

  const oneDish = document.getElementById('one-dish');
  const addOne = async () => {
    const name = oneDish.value.trim();
    if (!name) return oneDish.focus();
    const existing = findByName(state.dishes, name);
    const d = existing || (await createDish(name));
    location.hash = existing ? `#/dish/${d.id}` : `#/dish/${d.id}/edit`;
  };
  document.getElementById('one-dish-add').addEventListener('click', addOne);
  oneDish.addEventListener('keydown', e => e.key === 'Enter' && addOne());

  document.getElementById('recipe-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const review = document.getElementById('recipe-review');
    let plan;
    try {
      plan = planRecipeImport(state, JSON.parse(await file.text()));
    } catch (err) {
      review.innerHTML = `<p class="notice">Couldn’t read that file: ${esc(err.message)}</p>`;
      return;
    }
    review.innerHTML = `
      <h3 class="recipe-sub">Check the recipes</h3>
      <p class="hint">Recipes already in the app are updated with the card’s details; their history is kept.</p>
      <ul class="import-list">${plan
        .map(
          ({ recipe, existing }, i) => `<li>
            <input type="checkbox" id="rf-${i}" checked aria-label="Include">
            <span class="grow"><strong>${esc(recipe.name)}</strong>
              <span class="muted small">${[recipe.category, recipe.cuisine].filter(Boolean).map(esc).join(' · ')}</span></span>
            ${recipe.stars ? starText(recipe.stars) : ''}
            <span class="tag ${existing ? 'exists' : 'planned'}">${existing ? 'Updates existing' : 'New'}</span>
          </li>`,
        )
        .join('')}</ul>
      <p class="btn-row spaced"><button class="btn primary" type="button" id="rf-save">Load ${plural(plan.length, 'recipe')}</button></p>`;
    const btn = document.getElementById('rf-save');
    review.addEventListener('change', () => {
      const n = plan.filter((_, i) => document.getElementById(`rf-${i}`).checked).length;
      btn.textContent = `Load ${plural(n, 'recipe')}`;
      btn.disabled = !n;
    });
    btn.addEventListener('click', async () => {
      let added = 0;
      let updated = 0;
      for (const [i, { recipe }] of plan.entries()) {
        if (!document.getElementById(`rf-${i}`).checked) continue;
        const existing = findByName(state.dishes, recipe.name); // re-check: the file may repeat a name
        if (existing) {
          await save('dishes', applyRecipe(existing, recipe));
          updated++;
        } else {
          await save('dishes', recipe);
          added++;
        }
      }
      toast(`Loaded: ${added} new, ${updated} updated`);
      location.hash = '#/dishes';
    });
  });

  navigator.storage?.persisted?.().then(p => {
    document.getElementById('persist').textContent = p
      ? 'Storage is marked persistent: the browser will not clear it to free space.'
      : 'Tip: add this app to your Home Screen (Share → Add to Home Screen) so iPadOS keeps its data.';
  });

  document.getElementById('export').addEventListener('click', async () => {
    const data = { app: 'from-my-table', version: 1, exportedAt: new Date().toISOString(), ...state };
    try {
      await deliverFile(`from-my-table-backup-${today()}.json`, 'application/json', JSON.stringify(data, null, 2));
      try {
        localStorage.setItem('lastBackup', String(Date.now()));
      } catch {}
      toast('Backup created');
      viewBackup();
    } catch (err) {
      if (err.name !== 'AbortError') alert('Backup failed: ' + err.message);
    }
  });

  document.getElementById('import').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const next = validateBackup(JSON.parse(await file.text()));
      if (!confirm(`Replace all current data with ${plural(next.events.length, 'event')}, ${plural(next.guests.length, 'guest')} and ${plural(next.dishes.length, 'dish')} from this file?`)) return;
      await db.replaceAll(next);
      state = next;
      toast('Restored');
      viewBackup();
    } catch (err) {
      alert('Could not restore: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });
}

function notFound() {
  setTitle('Not found');
  main.innerHTML = `<p>That record no longer exists. <a href="#/">Go home</a></p>`;
}

// ---------- router ----------

function route() {
  const [, page, id, sub] = location.hash.replace(/^#/, '').split('/');
  document.querySelectorAll('nav a').forEach(a => {
    const target = a.getAttribute('href').split('/')[1];
    const map = { guest: 'guests', dish: 'dishes', event: 'events', import: 'settings', backup: 'settings' };
    a.classList.toggle('active', target === (map[page] || page || ''));
  });
  window.scrollTo(0, 0);
  delete main.dataset.eventId;
  switch (page) {
    case 'events':
    case 'guests':
      return viewList(page);
    case 'dishes':
      return viewDishIndex();
    case 'event':
      return viewEvent(id);
    case 'guest':
      return viewGuest(id);
    case 'dish':
      return viewDish(id, sub === 'edit');
    case 'settings':
    case 'backup':
      return viewBackup();
    case 'import':
      return viewImport();
    default:
      return viewHome();
  }
}

async function start() {
  try {
    state = { ...emptyState(), ...(await db.loadAll()) };
    state.dishes = state.dishes.map(normalizeDish);
  } catch (err) {
    main.innerHTML = `<p>Could not open storage: ${esc(err.message)}. Private Browsing mode may block it.</p>`;
    return;
  }
  navigator.storage?.persist?.();
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
