import * as db from './db.js';
import {
  COURSES, RECEPTION, autocheck, byId, dishHistory, emptyState, findByName, guestHistory,
  newId, norm, search, sortEventsDesc, splitList, suggest, validateBackup,
} from './logic.js';

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
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
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
  if (g.drinks) out.push(`<span class="tag drink">🥂 ${esc(g.drinks)}</span>`);
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
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}

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
  const d = { id: newId(), name: name.trim(), course, ingredients: [], notes: '' };
  await save('dishes', d);
  return d;
}

// ---------- autocomplete ----------

// Wires a text input to a dropdown of existing records, with an "Add new" option.
function autocomplete(input, { list, exclude = () => [], describe = () => '', onPick, onCreate }) {
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
    if (!findByName(list(), q)) options.push({ create: q });
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
  document.title = t ? `${t} · Hostess Diary` : 'Hostess Diary';
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
  return `<div class="notice">Your diary lives only on this iPad. ${last ? `Last backup was ${Math.floor(days)} days ago.` : 'You have never made a backup.'} <a href="#/backup">Back up now</a></div>`;
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
      <p><a class="btn primary" href="#/event/new">＋ Add your first event</a></p>
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
          <td>${menuLine(e)}${e.beverages ? `<div class="muted">🍷 ${esc(e.beverages)}</div>` : ''}</td></tr>`,
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
  setTitle(conf.title);
  main.innerHTML = `
    <div class="search-row">
      <input id="filter" type="search" placeholder="Filter ${conf.title.toLowerCase()}…" autocomplete="off">
      ${conf.add ? `<a class="btn primary" href="${conf.add[0]}">${conf.add[1]}</a>` : `<button class="btn primary" id="add">＋ Add</button>`}
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
    <p class="danger-zone"><button class="btn danger" id="del">Delete guest</button></p>`;

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

// ----- dish -----

function viewDish(id) {
  const d = byId(state.dishes, id);
  if (!d) return notFound();
  setTitle(d.name);
  const hist = dishHistory(state, d.id);
  main.innerHTML = `
    <p><a href="#/dishes">← All dishes</a></p>
    <form class="card form" id="dform">
      <label>Name <input name="name" value="${esc(d.name)}" required></label>
      <label>Course <select name="course"><option value="">—</option>${COURSES.map(
        c => `<option ${c === d.course ? 'selected' : ''}>${esc(c)}</option>`,
      ).join('')}</select></label>
      <label>Key ingredients <span class="hint">comma-separated; used to flag guests’ allergies and dislikes</span>
        <input name="ingredients" value="${esc((d.ingredients || []).join(', '))}" placeholder="e.g. mushrooms, cream, walnuts"></label>
      <label>Notes / recipe source <textarea name="notes" rows="3">${esc(d.notes)}</textarea></label>
      <p class="hint">Changes save automatically.</p>
    </form>
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
    <p class="danger-zone"><button class="btn danger" id="del">Delete dish</button></p>`;

  const form = document.getElementById('dform');
  const persist = debounce(() => {
    const f = new FormData(form);
    const name = String(f.get('name')).trim();
    if (!name) return;
    save('dishes', { ...d, name, course: String(f.get('course')), ingredients: splitList(f.get('ingredients')), notes: String(f.get('notes')).trim() });
    setTitle(name);
  }, 400);
  form.addEventListener('input', persist);
  form.addEventListener('change', persist);
  form.addEventListener('submit', e => e.preventDefault());
  document.getElementById('del').addEventListener('click', async () => {
    if (!confirm(`Delete ${d.name}? It will also be removed from ${plural(hist.length, 'menu')}.`)) return;
    for (const h of hist) await save('events', { ...h.event, dishes: h.event.dishes.filter(x => x.dishId !== d.id) });
    await removeRecord('dishes', d.id);
    location.hash = '#/dishes';
  });
}

// ----- event (plan / record) -----

function viewEvent(id) {
  let ev;
  if (id === 'new') {
    ev = { id: newId(), date: today(), title: '', guestIds: [], dishes: [], beverages: '', worked: '', didnt: '', notes: '' };
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

  const FIELDS = ['date', 'title', 'beverages', 'worked', 'didnt', 'notes'];

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
      ${saved ? '<p class="danger-zone"><button class="btn danger" id="del">Delete event</button></p>' : ''}`;

    // fields
    for (const f of FIELDS) {
      const el = document.getElementById(f);
      const persist = debounce(() => {
        ev[f] = el.value;
        commit();
        if (f === 'date') draw(); // date changes what counts as "before"
      }, f === 'date' ? 0 : 400);
      el.addEventListener(f === 'date' ? 'change' : 'input', persist);
    }

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
  setTitle('Backup');
  let last;
  try {
    last = localStorage.getItem('lastBackup');
  } catch {}
  main.innerHTML = `
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

  navigator.storage?.persisted?.().then(p => {
    document.getElementById('persist').textContent = p
      ? 'Storage is marked persistent: the browser will not clear it to free space.'
      : 'Tip: add this app to your Home Screen (Share → Add to Home Screen) so iPadOS keeps its data.';
  });

  document.getElementById('export').addEventListener('click', async () => {
    const data = { app: 'hostess-diary', version: 1, exportedAt: new Date().toISOString(), ...state };
    const json = JSON.stringify(data, null, 2);
    const name = `hostess-diary-${today()}.json`;
    const file = new File([json], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
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
  const [, page, id] = location.hash.replace(/^#/, '').split('/');
  document.querySelectorAll('nav a').forEach(a => {
    const target = a.getAttribute('href').split('/')[1];
    const map = { guest: 'guests', dish: 'dishes', event: 'events' };
    a.classList.toggle('active', target === (map[page] || page || ''));
  });
  window.scrollTo(0, 0);
  delete main.dataset.eventId;
  switch (page) {
    case 'events':
    case 'guests':
    case 'dishes':
      return viewList(page);
    case 'event':
      return viewEvent(id);
    case 'guest':
      return viewGuest(id);
    case 'dish':
      return viewDish(id);
    case 'backup':
      return viewBackup();
    default:
      return viewHome();
  }
}

async function start() {
  try {
    state = { ...emptyState(), ...(await db.loadAll()) };
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
