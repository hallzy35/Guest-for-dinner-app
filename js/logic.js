// Pure data logic: no DOM, no storage. Shared by the app and the Node tests.
//
// State shape:
//   guests: [{ id, name, drinks, likes, dislikes: [], allergies: [], notes }]
//   dishes: [{ id, name, course, ingredients: [], notes }]
//   events: [{ id, date: 'YYYY-MM-DD', title, guestIds: [],
//              dishes: [{ dishId, reception: ''|'hit'|'ok'|'miss', note }],
//              beverages, worked, didnt, notes }]

export const COURSES = ['Cocktail / appetizer', 'Starter', 'Soup', 'Salad', 'Main', 'Side', 'Cheese', 'Dessert', 'Other'];

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
  return { guests: [], dishes: [], events: [] };
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
  const haystacks = [dish.name, ...(dish.ingredients || [])];
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
      if (past.length) served.push({ guest, dish, events: sortEventsDesc(past) });
      for (const c of dishConflicts(guest, dish)) conflicts.push({ guest, dish, ...c });
    }
  }
  return { served, conflicts };
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
    d => hit(d.name) || hit(d.notes) || hit(d.course) || (d.ingredients || []).some(hit),
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
    guests: data.guests.map(g => ({ drinks: '', likes: '', notes: '', dislikes: [], allergies: [], ...g })),
    dishes: data.dishes.map(d => ({ course: '', notes: '', ingredients: [], ...d })),
    events: data.events.map(e => ({
      title: '', beverages: '', worked: '', didnt: '', notes: '', guestIds: [], dishes: [], ...e,
    })),
  };
}
