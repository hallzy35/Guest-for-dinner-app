// Pure data logic: no DOM, no storage. Shared by the app and the Node tests.
//
// State shape:
//   guests: [{ id, name, drinks, likes, dislikes: [], allergies: [], notes }]
//   dishes: [{ id, name, course, ingredients: [], notes }]
//   events: [{ id, date: 'YYYY-MM-DD', title, guestIds: [],
//              dishes: [{ dishId, reception: ''|'hit'|'ok'|'miss', note }],
//              beverages, worked, didnt, notes }]

export const COURSES = ['Cocktail / appetizer', 'Starter', 'Soup', 'Salad', 'Main', 'Side', 'Cheese', 'Dessert', 'Sauces & Dressings'];

// The recipe-card fields, matching the chef's printed recipe pages.
export const CATEGORIES = ['Appy', 'Pasta', 'Starch', 'Entrée', 'Veggie', 'Dessert', 'Snack', 'Other'];
export const STYLES = { 1: 'Plain', 2: 'Day to day', 3: 'Elegant' };
export const COMPLEXITY = { 1: 'Simple', 2: 'A bit of work', 3: 'Whoa, nellie!' };

export function emptyDish(name = '', course = '') {
  return {
    id: newId(),
    name,
    course,
    category: '',
    mainIngredient: '',
    style: 0,
    complexity: 0,
    prep: '',
    cook: '',
    total: '',
    ingredients: [],
    instructions: '',
    cuisine: '',
    source: '',
    stars: 0,
    notes: '',
  };
}

export const RECEPTION = {
  hit: 'Loved it',
  ok: 'Fine',
  miss: 'Fell flat',
};

export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function emptyState() {
  return { guests: [], dishes: [], events: [], deleted: [] };
}

export function byId(list, id) {
  return list.find(x => x.id === id);
}

export function findByName(list, name) {
  const n = norm(name);
  if (!n) return undefined;
  return list.find(x => norm(x.name) === n);
}

// Autocomplete: prefix-of-name matches first, then prefix-of-any-word, then substring.
export function suggest(list, query, limit = 8, excludeIds = []) {
  const q = norm(query);
  if (!q) return [];
  const exclude = new Set(excludeIds);
  const scored = [];
  for (const item of list) {
    if (exclude.has(item.id)) continue;
    const n = norm(item.name);
    let score;
    if (n.startsWith(q)) score = 0;
    else if (n.split(' ').some(w => w.startsWith(q))) score = 1;
    else if (n.includes(q)) score = 2;
    else continue;
    scored.push({ item, score });
  }
  scored.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name));
  return scored.slice(0, limit).map(s => s.item);
}

export function sortEventsDesc(events) {
  return [...events].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function guestHistory(state, guestId, excludeEventId) {
  return sortEventsDesc(
    state.events.filter(e => e.id !== excludeEventId && e.guestIds.includes(guestId)),
  );
}

// Every time a dish was served: when, to whom, and what else was on the menu.
export function dishHistory(state, dishId) {
  return sortEventsDesc(state.events.filter(e => e.dishes.some(d => d.dishId === dishId))).map(event => ({
    event,
    entry: event.dishes.find(d => d.dishId === dishId),
    guests: event.guestIds.map(id => byId(state.guests, id)).filter(Boolean),
    otherDishes: event.dishes
      .filter(d => d.dishId !== dishId)
      .map(d => byId(state.dishes, d.dishId))
      .filter(Boolean),
  }));
}

// Word-level match tolerant of simple plurals ("mushroom" ~ "mushrooms", "nut" ~ "nuts").
// Deliberately errs toward false positives, since it is used for allergy warnings.
function wordsMatch(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short) && long.length - short.length <= 2;
}

export function termMatches(term, text) {
  const termWords = norm(term).split(' ').filter(Boolean);
  const textWords = norm(text).split(' ').filter(Boolean);
  if (!termWords.length) return false;
  return termWords.every(tw => textWords.some(w => wordsMatch(tw, w)));
}

// Which of a guest's allergies/dislikes appear in a dish's name or listed ingredients.
export function dishConflicts(guest, dish) {
  const haystacks = [dish.name, dish.mainIngredient || '', ...(dish.ingredients || [])];
  const out = [];
  for (const [kind, terms] of [['allergy', guest.allergies || []], ['dislike', guest.dislikes || []]]) {
    for (const term of terms) {
      if (haystacks.some(h => termMatches(term, h))) out.push({ kind, term });
    }
  }
  return out;
}

// The planning check: for the draft event's guests × dishes, report
//   - dishes each guest has been served before (with dates), and
//   - dishes that hit a guest's allergy or dislike.
export function autocheck(state, draft) {
  const guests = draft.guestIds.map(id => byId(state.guests, id)).filter(Boolean);
  const dishes = draft.dishes.map(d => byId(state.dishes, d.dishId)).filter(Boolean);
  const served = [];
  const conflicts = [];
  for (const dish of dishes) {
    for (const guest of guests) {
      const past = state.events.filter(
        e => e.id !== draft.id && e.guestIds.includes(guest.id) && e.dishes.some(d => d.dishId === dish.id),
      );
      const favorite = isFavorite(guest, dish.id);
      if (past.length || favorite) served.push({ guest, dish, events: sortEventsDesc(past), favorite });
      for (const c of dishConflicts(guest, dish)) conflicts.push({ guest, dish, ...c });
    }
  }
  return { served, conflicts };
}

export const isFavorite = (guest, dishId) => (guest.favorites || []).includes(dishId);

// Events (newest first, excluding one event) where this guest was served this dish.
export function servedEvents(state, guestId, dishId, excludeEventId) {
  return sortEventsDesc(
    state.events.filter(e => e.id !== excludeEventId && e.guestIds.includes(guestId) && e.dishes.some(d => d.dishId === dishId)),
  );
}

// Turn a dish into a favourite of every listed guest, or remove it from all of them.
// Returns only the guests that changed.
export function setFavorite(guests, dishId, on) {
  return guests
    .filter(g => isFavorite(g, dishId) !== on)
    .map(g => ({ ...g, favorites: on ? [...(g.favorites || []), dishId] : (g.favorites || []).filter(id => id !== dishId) }));
}

// Global search across guests, dishes, and event notes/beverages.
export function search(state, query) {
  const q = norm(query);
  if (!q) return { guests: [], dishes: [], events: [] };
  const hit = s => norm(s).includes(q);

  const guests = state.guests.filter(
    g => hit(g.name) || hit(g.drinks) || hit(g.likes) || hit(g.notes) ||
      (g.allergies || []).some(hit) || (g.dislikes || []).some(hit),
  );
  const dishes = state.dishes.filter(
    d => hit(d.name) || hit(d.notes) || hit(d.course) || hit(d.category) || hit(d.mainIngredient) || hit(d.cuisine) ||
      hit(d.source) || (d.ingredients || []).some(hit),
  );
  const events = sortEventsDesc(
    state.events.filter(
      e => hit(e.title) || hit(e.beverages) || hit(e.worked) || hit(e.didnt) || hit(e.notes) || hit(e.date) ||
        e.dishes.some(d => hit(d.note)),
    ),
  );

  const nameFirst = (a, b) => {
    const as = norm(a.name).startsWith(q) ? 0 : 1;
    const bs = norm(b.name).startsWith(q) ? 0 : 1;
    return as - bs || a.name.localeCompare(b.name);
  };
  return { guests: guests.sort(nameFirst), dishes: dishes.sort(nameFirst), events };
}

export function splitList(s) {
  return String(s ?? '')
    .split(/[,;\n]/)
    .map(x => x.trim())
    .filter(Boolean);
}

// Validates and normalises an imported backup. Throws on anything unusable.
export function validateBackup(data) {
  if (!data || typeof data !== 'object') throw new Error('Not a backup file.');
  for (const k of ['guests', 'dishes', 'events']) {
    if (!Array.isArray(data[k])) throw new Error(`Backup is missing "${k}".`);
    for (const r of data[k]) if (!r || typeof r.id !== 'string') throw new Error(`A record in "${k}" has no id.`);
  }
  return {
    guests: data.guests.map(g => ({ drinks: '', likes: '', notes: '', dislikes: [], allergies: [], favorites: [], ...g })),
    dishes: data.dishes.map(normalizeDish),
    events: data.events.map(e => ({
      title: '', time: '', beverages: '', worked: '', didnt: '', notes: '', guestIds: [], dishes: [], ...e,
    })),
    deleted: Array.isArray(data.deleted) ? data.deleted.filter(t => t && typeof t.id === 'string' && t.deletedAt) : [],
  };
}

// ---------- merging a backup from another device ----------

// Combine this device's data with a backup from another device.
// Every save stamps a record with updatedAt and every delete leaves a note in `deleted`, so:
//   - a record on only one side is kept; on both sides, the more recent edit wins (ties keep this device's);
//   - a deletion sticks unless the record was edited again after it was deleted.
// Guests and dishes with different ids but the same name are treated as one record, so the same
// recipe file loaded on both devices doesn't double up.
// Same record apart from when it was saved (e.g. the same recipe file loaded on both devices).
function sameContent(a, b) {
  const canon = v =>
    Array.isArray(v) ? `[${v.map(canon).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).filter(k => k !== 'updatedAt').sort().map(k => `${k}:${canon(v[k])}`).join(',')}}`
    : JSON.stringify(v);
  return canon(a) === canon(b);
}

export function mergeBackup(local, incoming) {
  const stamp = r => r?.updatedAt || '';
  const deleted = new Map();
  for (const t of [...(local.deleted || []), ...(incoming.deleted || [])]) {
    if (!deleted.has(t.id) || t.deletedAt > deleted.get(t.id).deletedAt) deleted.set(t.id, t);
  }

  // Incoming guests/dishes that are the same as a local one under a different id.
  const sameAs = { guests: new Map(), dishes: new Map() };
  for (const store of ['guests', 'dishes']) {
    for (const r of incoming[store]) {
      if (byId(local[store], r.id)) continue;
      const twin = findByName(local[store], r.name);
      if (twin && !byId(incoming[store], twin.id)) sameAs[store].set(r.id, twin.id);
    }
  }
  const gid = id => sameAs.guests.get(id) || id;
  const did = id => sameAs.dishes.get(id) || id;
  const theirs = {
    guests: incoming.guests.map(g => ({ ...g, id: gid(g.id), favorites: [...new Set((g.favorites || []).map(did))] })),
    dishes: incoming.dishes.map(d => ({ ...d, id: did(d.id) })),
    events: incoming.events.map(e => ({
      ...e,
      guestIds: [...new Set(e.guestIds.map(gid))],
      dishes: e.dishes.map(x => ({ ...x, dishId: did(x.dishId) })).filter((x, i, a) => a.findIndex(y => y.dishId === x.dishId) === i),
    })),
  };

  const out = { deleted: [...deleted.values()] };
  const summary = { matchedByName: sameAs.guests.size + sameAs.dishes.size };
  for (const store of ['guests', 'dishes', 'events']) {
    const counts = { added: 0, updated: 0, removed: 0 };
    const ids = [...new Set([...local[store].map(r => r.id), ...theirs[store].map(r => r.id)])];
    out[store] = [];
    for (const id of ids) {
      const mine = byId(local[store], id);
      const other = byId(theirs[store], id);
      const pick = !mine ? other : !other || sameContent(mine, other) || stamp(other) <= stamp(mine) ? mine : other;
      const gone = deleted.get(id);
      if (gone && gone.deletedAt >= stamp(pick)) {
        if (mine) counts.removed++;
        continue;
      }
      if (!mine) counts.added++;
      else if (pick !== mine) counts.updated++;
      out[store].push(pick);
    }
    summary[store] = counts;
  }

  // Drop references to guests and dishes that were deleted.
  const live = id => !deleted.has(id) || out.guests.some(g => g.id === id) || out.dishes.some(d => d.id === id);
  out.events = out.events.map(e =>
    e.guestIds.every(live) && e.dishes.every(x => live(x.dishId))
      ? e
      : { ...e, guestIds: e.guestIds.filter(live), dishes: e.dishes.filter(x => live(x.dishId)) },
  );
  out.guests = out.guests.map(g =>
    (g.favorites || []).every(live) ? g : { ...g, favorites: g.favorites.filter(live) },
  );
  return { state: out, summary };
}

// ---------- merging duplicates ----------

function unionList(a = [], b = []) {
  const out = [...a];
  for (const x of b) if (!out.some(y => norm(y) === norm(x))) out.push(x);
  return out;
}

function joinText(a = '', b = '', sep) {
  a = a.trim();
  b = b.trim();
  if (!b || norm(a) === norm(b) || norm(a).includes(norm(b))) return a;
  if (!a || norm(b).includes(norm(a))) return b;
  return `${a}${sep}${b}`;
}

// Folds `drop` into `keep`. Returns the merged record plus every event that changed;
// the caller saves those and deletes `drop`. Nothing is lost: lists are unioned, text is joined.
export function mergeGuests(state, keepId, dropId) {
  const keep = byId(state.guests, keepId);
  const drop = byId(state.guests, dropId);
  if (!keep || !drop || keepId === dropId) throw new Error('Pick two different guests.');
  const guest = {
    ...keep,
    drinks: joinText(keep.drinks, drop.drinks, ', '),
    likes: joinText(keep.likes, drop.likes, ', '),
    notes: joinText(keep.notes, drop.notes, '\n'),
    allergies: unionList(keep.allergies, drop.allergies),
    dislikes: unionList(keep.dislikes, drop.dislikes),
    favorites: [...new Set([...(keep.favorites || []), ...(drop.favorites || [])])],
  };
  const events = state.events
    .filter(e => e.guestIds.includes(dropId))
    .map(e => ({ ...e, guestIds: [...new Set(e.guestIds.map(id => (id === dropId ? keepId : id)))] }));
  return { guest, events };
}

export function mergeDishes(state, keepId, dropId) {
  const keep = byId(state.dishes, keepId);
  const drop = byId(state.dishes, dropId);
  if (!keep || !drop || keepId === dropId) throw new Error('Pick two different dishes.');
  const dish = { ...keep };
  for (const f of ['course', 'category', 'mainIngredient', 'style', 'complexity', 'prep', 'cook', 'total', 'cuisine', 'source', 'stars']) {
    dish[f] = keep[f] || drop[f] || dish[f];
  }
  dish.ingredients = unionList(keep.ingredients, drop.ingredients);
  dish.instructions = joinText(keep.instructions || '', drop.instructions || '', '\n\n');
  dish.notes = joinText(keep.notes, drop.notes, '\n');
  const events = state.events
    .filter(e => e.dishes.some(d => d.dishId === dropId))
    .map(e => {
      const kept = e.dishes.find(d => d.dishId === keepId);
      const dropped = e.dishes.find(d => d.dishId === dropId);
      if (!kept) return { ...e, dishes: e.dishes.map(d => (d.dishId === dropId ? { ...d, dishId: keepId } : d)) };
      // Both were on the same menu: keep one entry, preserving any reception and notes.
      const merged = { ...kept, reception: kept.reception || dropped.reception, note: joinText(kept.note, dropped.note, '; ') };
      return { ...e, dishes: e.dishes.filter(d => d.dishId !== dropId).map(d => (d.dishId === keepId ? merged : d)) };
    });
  const guests = state.guests
    .filter(g => isFavorite(g, dropId))
    .map(g => ({ ...g, favorites: [...new Set((g.favorites || []).map(id => (id === dropId ? keepId : id)))] }));
  return { dish, events, guests };
}

// ---------- bulk dish import ----------

const COURSE_HEADINGS = [
  ['Cocktail / appetizer', ['appetizer', 'appetiser', 'canape', 'hors d oeuvre', 'nibble', 'small bite', 'cocktail', 'starter appetizer', 'starter and appetizer']],
  ['Starter', ['starter', 'first course']],
  ['Soup', ['soup']],
  ['Salad', ['salad']],
  ['Main', ['main', 'main course', 'entree', 'main and entree', 'meat', 'fish', 'poultry', 'seafood']],
  ['Side', ['side', 'side dish', 'vegetable', 'accompaniment', 'side and vegetable', 'side vegetable']],
  ['Cheese', ['cheese', 'cheese course']],
  ['Dessert', ['dessert', 'pudding', 'sweet', 'afters']],
  ['Sauces & Dressings', ['sauce', 'dressing', 'sauce and dressing', 'condiment', 'dip', 'rub', 'marinade']],
];

// A line is a course heading only if it is exactly a heading word or its plural ("Desserts", "Side dishes").
export function courseForHeading(line) {
  const words = norm(line).split(' ');
  const same = (a, b) => a === b || a === b + 's' || a === b + 'es';
  for (const [course, headings] of COURSE_HEADINGS) {
    for (const h of headings) {
      const hw = h.split(' ');
      if (hw.length === words.length && hw.every((w, i) => same(words[i], w))) return course;
    }
  }
  return '';
}

// Turns pasted or scanned text (a contents page, a list of recipe titles) into dish names.
// Drops page numbers, dot leaders and bullets; course headings set the course of the lines after them.
export function parseDishList(text, defaultCourse = '') {
  const out = [];
  const seen = new Set();
  let course = defaultCourse;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    let line = raw
      .replace(/^\s*(?:[-•*·–—▪◦]|\d+[.)]|[a-z][.)])\s+/i, '') // bullets, "1." numbering
      .replace(/[\s.·…_-]*\b(?:p\.?\s*)?\d{1,4}\s*$/i, '') // trailing page number with dot leaders
      .replace(/^\d{1,4}\s+(?=\D)/, '') // leading page number
      .replace(/\s{2,}/g, ' ')
      .replace(/[\s,;:–—-]+$/, '')
      .trim();
    if (!line || !/[a-z]/i.test(line)) continue;
    if (/^(contents|index|table of contents|recipes?)$/i.test(line)) continue;
    const heading = courseForHeading(line);
    if (heading) {
      course = heading;
      continue;
    }
    // Title-case ALL-CAPS titles so they read naturally.
    if (line === line.toUpperCase() && /[A-Z]{3}/.test(line)) {
      line = line.toLowerCase().replace(/(^|[\s(&/-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
    }
    const key = norm(line);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: line, course });
  }
  return out;
}

// ---------- calendar ----------

function icsEscape(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545 lines are folded at 75 octets.
function icsFold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const l = new TextEncoder().encode(ch).length;
    if (len + l > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += l;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const compactDate = iso => iso.replace(/-/g, '');

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// Start/end in calendar format. Timed events are "floating" local time, so they land at the
// same clock time in whatever time zone the calendar is in.
export function eventTimes(ev, hours = 3) {
  if (!ev.time) return { allDay: true, start: compactDate(ev.date), end: compactDate(addDays(ev.date, 1)) };
  const [h, min] = ev.time.split(':').map(Number);
  const [y, m, d] = ev.date.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, d, h, min));
  const e = new Date(s.getTime() + hours * 3600000);
  const f = dt => dt.toISOString().slice(0, 16).replace(/[-:]/g, '') + '00';
  return { allDay: false, start: f(s), end: f(e) };
}

export function eventSummary(state, ev) {
  return ev.title || 'Dinner';
}

export function eventDescription(state, ev) {
  const lines = [];
  const guests = ev.guestIds.map(id => byId(state.guests, id)?.name).filter(Boolean);
  if (guests.length) lines.push(`Guests: ${guests.join(', ')}`);
  const dishes = ev.dishes.map(d => byId(state.dishes, d.dishId)?.name).filter(Boolean);
  if (dishes.length) lines.push(`Menu: ${dishes.join(', ')}`);
  if (ev.beverages) lines.push(`Drinks: ${ev.beverages}`);
  for (const id of ev.guestIds) {
    const g = byId(state.guests, id);
    if (g?.allergies?.length) lines.push(`${g.name} is allergic to ${g.allergies.join(', ')}`);
  }
  return lines.join('\n');
}

export function buildICS(state, events, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Done Like Dinner//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const ev of events) {
    const t = eventTimes(ev);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.id}@from-my-table`, // the app's old name; kept so re-exported events update instead of duplicating
      `DTSTAMP:${stamp}`,
      t.allDay ? `DTSTART;VALUE=DATE:${t.start}` : `DTSTART:${t.start}`,
      t.allDay ? `DTEND;VALUE=DATE:${t.end}` : `DTEND:${t.end}`,
      `SUMMARY:${icsEscape(eventSummary(state, ev))}`,
      `DESCRIPTION:${icsEscape(eventDescription(state, ev))}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

export function googleCalendarUrl(state, ev) {
  const t = eventTimes(ev);
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: eventSummary(state, ev),
    dates: `${t.start}/${t.end}`,
    details: eventDescription(state, ev),
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

// ---------- recipe files ----------

const clampInt = (v, max) => {
  const n = Math.round(Number(v));
  return n >= 1 && n <= max ? n : 0;
};

// Fills in any missing recipe fields and coerces types, so older records and imported files look alike.
export function normalizeDish(d) {
  const base = emptyDish();
  const out = { ...base, ...d, id: d.id || base.id };
  out.name = String(out.name ?? '').trim();
  out.ingredients = (Array.isArray(out.ingredients) ? out.ingredients : String(out.ingredients ?? '').split(/\r?\n/))
    .map(x => String(x).trim())
    .filter(Boolean);
  out.style = clampInt(out.style, 3);
  out.complexity = clampInt(out.complexity, 3);
  const stars = Math.round(Number(out.stars) * 2) / 2;
  out.stars = stars >= 0.5 && stars <= 5 ? stars : 0;
  if (out.course === 'Other') out.course = 'Sauces & Dressings'; // renamed course
  if (!CATEGORIES.includes(out.category)) {
    const n = Number(out.category);
    out.category = n >= 1 && n <= 8 ? CATEGORIES[n - 1] : '';
  }
  for (const f of ['course', 'mainIngredient', 'prep', 'cook', 'total', 'instructions', 'cuisine', 'source', 'notes']) {
    out[f] = String(out[f] ?? '').trim();
  }
  return out;
}

// Reads a recipe file (made from scanned recipe pages) and works out, for each recipe,
// whether it is new or updates a dish already in the app (matched by name).
export function planRecipeImport(state, data) {
  const list = Array.isArray(data) ? data : data?.recipes;
  if (!Array.isArray(list) || !list.length) throw new Error('No recipes found in this file.');
  return list.map(raw => {
    const recipe = normalizeDish({ ...raw, id: undefined });
    if (!recipe.name) throw new Error('A recipe in this file has no name.');
    const existing = findByName(state.dishes, recipe.name);
    return { recipe, existing };
  });
}

// Applies an imported recipe onto an existing dish: card fields win where the card has a value,
// and the dish keeps its id, history, course and anything the card leaves blank.
export function applyRecipe(existing, recipe) {
  const out = { ...existing };
  for (const [k, v] of Object.entries(recipe)) {
    if (k === 'id') continue;
    const empty = v === '' || v === 0 || (Array.isArray(v) && !v.length);
    if (!empty) out[k] = v;
  }
  return normalizeDish(out);
}

// ---------- recipe indexes (as in the back of the printed cookbook) ----------

// "1:45" → 105 minutes; blank or unreadable → null.
export function totalMinutes(dish) {
  const m = String(dish.total ?? '').trim().match(/^(\d+):(\d{1,2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export const INDEX_MODES = {
  category: 'By category & time',
  cuisine: 'By cooking style',
  stars: 'Best rated',
  quick: 'Under 30 minutes',
  az: 'A–Z',
};

const catRank = c => (CATEGORIES.indexOf(c) === -1 ? CATEGORIES.length : CATEGORIES.indexOf(c));
const byName = (a, b) => a.name.localeCompare(b.name);
// Fastest first; recipes with no time listed go after the timed ones.
const byTime = (a, b) => {
  const x = totalMinutes(a);
  const y = totalMinutes(b);
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
};

export function filterDishes(dishes, f = {}) {
  const q = norm(f.q);
  return dishes.filter(d => {
    if (q && !norm([d.name, d.mainIngredient, d.cuisine, d.source, d.course, ...(d.ingredients || [])].join(' ')).includes(q)) return false;
    if (f.category && d.category !== f.category) return false;
    if (f.course && d.course !== f.course) return false;
    if (f.cuisine && d.cuisine !== f.cuisine) return false;
    if (f.style && d.style !== Number(f.style)) return false;
    if (f.complexity && d.complexity !== Number(f.complexity)) return false;
    if (f.minStars && d.stars < Number(f.minStars)) return false;
    // A recipe with no time listed is never excluded by a time limit.
    if (f.maxMinutes) {
      const t = totalMinutes(d);
      if (t !== null && t > Number(f.maxMinutes)) return false;
    }
    return true;
  });
}

// Returns [{ heading, items }] for the chosen index.
// Columns of the index table that can be tapped to sort, and which way the first tap goes.
export const SORT_COLUMNS = {
  name: { label: 'Name', first: 'asc' },
  mainIngredient: { label: 'Main ingredient', first: 'asc' },
  total: { label: 'Total', first: 'asc' },
  style: { label: 'Style', first: 'asc' },
  complexity: { label: 'Comp', first: 'asc' },
  category: { label: 'Cat', first: 'asc' },
  stars: { label: 'Stars', first: 'desc' },
};

// Sort one group of the index by a column. Blank values always go last; ties fall back to name.
export function sortDishes(items, key, dir = 'asc') {
  const value = {
    name: d => norm(d.name) || null,
    mainIngredient: d => norm(d.mainIngredient) || null,
    total: totalMinutes,
    style: d => Number(d.style) || null,
    complexity: d => Number(d.complexity) || null,
    category: d => (d.category && CATEGORIES.includes(d.category) ? catRank(d.category) : null),
    stars: d => Number(d.stars) || null,
  }[key];
  if (!value) return items;
  const sign = dir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null || vb === null) return (va === null) - (vb === null) || byName(a, b);
    const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
    return sign * c || byName(a, b);
  });
}

export function buildIndex(dishes, mode = 'category', filters = {}) {
  const f = { ...filters };
  if (mode === 'quick') f.maxMinutes = Math.min(Number(f.maxMinutes) || 30, 30);
  const items = filterDishes(dishes, f);
  if (mode === 'az') return items.length ? [{ heading: '', items: [...items].sort(byName) }] : [];

  const groupKey = mode === 'cuisine' ? d => d.cuisine || 'No cooking style' : d => d.category || 'No category';
  const groups = new Map();
  for (const d of items) {
    const k = groupKey(d);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  const within = {
    category: (a, b) => byTime(a, b) || byName(a, b),
    quick: (a, b) => byTime(a, b) || byName(a, b),
    stars: (a, b) => b.stars - a.stars || byName(a, b),
    cuisine: (a, b) => catRank(a.category) - catRank(b.category) || byName(a, b),
  }[mode];
  const headings = [...groups.keys()].sort((a, b) =>
    mode === 'cuisine' ? a.localeCompare(b) : catRank(a) - catRank(b),
  );
  return headings.map(heading => ({ heading, items: groups.get(heading).sort(within) }));
}

// ---------- planning helpers ----------

// For each dish: which of the event's guests have had it before, and any allergy/dislike clashes.
export function dishSuitability(state, event) {
  const guests = event.guestIds.map(id => byId(state.guests, id)).filter(Boolean);
  const past = state.events.filter(e => e.id !== event.id);
  const out = new Map();
  for (const dish of state.dishes) {
    const servedTo = guests.filter(g => past.some(e => e.guestIds.includes(g.id) && e.dishes.some(d => d.dishId === dish.id)));
    const conflicts = guests.flatMap(g => dishConflicts(g, dish).map(c => ({ guest: g, ...c })));
    const favOf = guests
      .filter(g => isFavorite(g, dish.id))
      .map(g => ({ guest: g, events: servedEvents(state, g.id, dish.id, event.id) }));
    out.set(dish.id, { servedTo, conflicts, favOf });
  }
  return out;
}

// A line like "GLAZE:" or "DIPPING THINGS:" is a heading on the card, not something to buy.
export function isIngredientHeading(line) {
  return /:\s*$/.test(line) && line === line.toUpperCase();
}

// Shopping list items for an event, grouped by dish in menu order.
// Each item has a stable key so "already have it" ticks survive edits elsewhere.
export function shoppingList(state, event) {
  return event.dishes
    .map(entry => byId(state.dishes, entry.dishId))
    .filter(Boolean)
    .map(dish => ({
      dish,
      lines: (dish.ingredients || []).map((text, i) => ({
        key: `${dish.id}|${i}|${norm(text)}`,
        text,
        heading: isIngredientHeading(text),
      })),
    }));
}

export function shoppingText(state, event, haveKeys = []) {
  const have = new Set(haveKeys);
  const parts = [];
  for (const { dish, lines } of shoppingList(state, event)) {
    const need = [];
    let pendingHeading = null;
    for (const l of lines) {
      if (l.heading) {
        pendingHeading = l.text;
        continue;
      }
      if (have.has(l.key)) continue;
      if (pendingHeading) {
        need.push(`  ${pendingHeading}`);
        pendingHeading = null;
      }
      need.push(`  ☐ ${l.text}`);
    }
    if (need.length) parts.push(`${dish.name}\n${need.join('\n')}`);
  }
  return parts.join('\n\n');
}
