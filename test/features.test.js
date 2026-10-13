import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildICS, courseForHeading, eventTimes, googleCalendarUrl, mergeDishes, mergeGuests, parseDishList } from '../js/logic.js';

const state = () => ({
  guests: [
    { id: 'jim', name: 'Jim Smith', drinks: 'G&T', likes: '', dislikes: ['mushrooms'], allergies: [], notes: 'Wife is Ann' },
    { id: 'james', name: 'James Smith', drinks: 'gin and tonic', likes: 'cheese', dislikes: ['Mushrooms', 'olives'], allergies: ['shellfish'], notes: '' },
    { id: 'ann', name: 'Ann Smith', drinks: '', likes: '', dislikes: [], allergies: [], notes: '' },
  ],
  dishes: [
    { id: 'w1', name: 'Beef Wellington', course: 'Main', ingredients: ['beef'], notes: '' },
    { id: 'w2', name: 'Beef wellington (mine)', course: '', ingredients: ['mushrooms'], notes: 'p. 112' },
  ],
  events: [
    { id: 'e1', date: '2024-01-01', guestIds: ['jim', 'ann'], dishes: [{ dishId: 'w1', reception: '', note: 'rare' }] },
    { id: 'e2', date: '2024-06-01', guestIds: ['james', 'jim'], dishes: [{ dishId: 'w1', reception: '', note: '' }, { dishId: 'w2', reception: 'hit', note: 'too salty' }] },
    { id: 'e3', date: '2024-09-01', guestIds: ['ann'], dishes: [{ dishId: 'w2', reception: 'ok', note: '' }] },
  ],
});

test('mergeGuests unions preferences and rewrites events without duplicates', () => {
  const { guest, events } = mergeGuests(state(), 'jim', 'james');
  assert.deepEqual(guest.dislikes, ['mushrooms', 'olives']);
  assert.deepEqual(guest.allergies, ['shellfish']);
  assert.equal(guest.drinks, 'G&T, gin and tonic');
  assert.equal(guest.likes, 'cheese');
  assert.equal(guest.notes, 'Wife is Ann');
  assert.deepEqual(events.map(e => [e.id, e.guestIds]), [['e2', ['jim']]]);
  assert.throws(() => mergeGuests(state(), 'jim', 'jim'));
});

test('mergeDishes repoints menus and collapses a dish listed twice on one menu', () => {
  const { dish, events } = mergeDishes(state(), 'w1', 'w2');
  assert.deepEqual(dish.ingredients, ['beef', 'mushrooms']);
  assert.equal(dish.course, 'Main');
  assert.equal(dish.notes, 'p. 112');
  const e2 = events.find(e => e.id === 'e2');
  assert.deepEqual(e2.dishes, [{ dishId: 'w1', reception: 'hit', note: 'too salty' }]);
  const e3 = events.find(e => e.id === 'e3');
  assert.deepEqual(e3.dishes, [{ dishId: 'w1', reception: 'ok', note: '' }]);
  assert.equal(events.length, 2);
});

test('courseForHeading matches headings and plurals only', () => {
  assert.equal(courseForHeading('DESSERTS'), 'Dessert');
  assert.equal(courseForHeading('Side Dishes'), 'Side');
  assert.equal(courseForHeading('Entrées'), 'Main');
  assert.equal(courseForHeading("Hors d'oeuvres"), 'Cocktail / appetizer');
  assert.equal(courseForHeading('Chocolate dessert'), '');
});

test('parseDishList cleans a contents page and follows course headings', () => {
  const text = `CONTENTS
STARTERS
  Gravlax with dill ........ 12
  • Chilled pea soup   14
MAINS
1. Beef Wellington, p. 22
2) Roast chicken with lemon 24
DESSERTS
LEMON TART............30
Lemon tart 30

Pavlova`;
  assert.deepEqual(parseDishList(text), [
    { name: 'Gravlax with dill', course: 'Starter' },
    { name: 'Chilled pea soup', course: 'Starter' },
    { name: 'Beef Wellington', course: 'Main' },
    { name: 'Roast chicken with lemon', course: 'Main' },
    { name: 'Lemon Tart', course: 'Dessert' },
    { name: 'Pavlova', course: 'Dessert' },
  ]);
});

test('eventTimes handles all-day and timed events, including crossing midnight', () => {
  assert.deepEqual(eventTimes({ date: '2026-12-31' }), { allDay: true, start: '20261231', end: '20270101' });
  assert.deepEqual(eventTimes({ date: '2026-12-31', time: '22:30' }), { allDay: false, start: '20261231T223000', end: '20270101T013000' });
});

test('buildICS produces a valid, escaped, folded calendar file', () => {
  const s = state();
  const ev = { id: 'e9', date: '2026-11-01', time: '19:00', title: 'Supper; friends, family', guestIds: ['james'], dishes: [{ dishId: 'w1' }], beverages: '' };
  const ics = buildICS(s, [ev], new Date('2026-10-13T00:00:00Z'));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /DTSTART:20261101T190000\r\n/);
  assert.match(ics, /SUMMARY:Supper\; friends\\, family\r\n/);
  assert.match(ics.replace(/\r\n /g, ''), /James Smith is allergic to shellfish/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.match(googleCalendarUrl(s, ev), /dates=20261101T190000%2F20261101T220000/);
});
