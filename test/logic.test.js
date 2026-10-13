import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autocheck, dishConflicts, dishHistory, guestHistory, search, suggest, termMatches, validateBackup } from '../js/logic.js';

const state = {
  guests: [
    { id: 'jane', name: 'Jane Austen', drinks: 'G&T', likes: '', dislikes: ['mushrooms'], allergies: [], notes: '' },
    { id: 'tom', name: 'Tom Smith', drinks: 'Red wine', likes: 'chocolate', dislikes: [], allergies: ['tree nuts', 'shellfish'], notes: '' },
    { id: 'ann', name: 'Annabel Jones', drinks: '', likes: '', dislikes: [], allergies: [], notes: 'Vegetarian' },
  ],
  dishes: [
    { id: 'well', name: 'Beef Wellington', course: 'Main', ingredients: ['beef', 'mushroom duxelles', 'puff pastry'], notes: '' },
    { id: 'tart', name: 'Lemon tart', course: 'Dessert', ingredients: [], notes: '' },
    { id: 'salad', name: 'Pear & walnut salad', course: 'Salad', ingredients: ['walnuts', 'pear'], notes: '' },
  ],
  events: [
    { id: 'e1', date: '2024-03-12', title: 'Spring', guestIds: ['jane', 'tom'], dishes: [{ dishId: 'well', reception: 'hit', note: '' }, { dishId: 'tart', reception: 'ok', note: '' }], beverages: 'Chablis', worked: '', didnt: '', notes: '' },
    { id: 'e2', date: '2025-01-05', title: '', guestIds: ['tom'], dishes: [{ dishId: 'tart', reception: '', note: '' }], beverages: '', worked: '', didnt: 'Too much food', notes: '' },
  ],
};

test('suggest ranks prefix matches first and honours exclusions', () => {
  assert.deepEqual(suggest(state.guests, 'an').map(g => g.id), ['ann', 'jane']);
  assert.deepEqual(suggest(state.guests, 'jo').map(g => g.id), ['ann']); // word prefix: "Jones"
  assert.deepEqual(suggest(state.guests, 'a', 8, ['ann']).map(g => g.id), ['jane']);
});

test('guest history is newest first', () => {
  assert.deepEqual(guestHistory(state, 'tom').map(e => e.id), ['e2', 'e1']);
});

test('dish history reports guests and companion dishes', () => {
  const h = dishHistory(state, 'well');
  assert.equal(h.length, 1);
  assert.deepEqual(h[0].guests.map(g => g.id), ['jane', 'tom']);
  assert.deepEqual(h[0].otherDishes.map(d => d.id), ['tart']);
});

test('termMatches tolerates plurals but not unrelated words', () => {
  assert.ok(termMatches('mushrooms', 'mushroom duxelles'));
  assert.ok(termMatches('tree nuts', 'Tree nut praline'));
  assert.ok(!termMatches('nuts', 'nutmeg'));
  assert.ok(termMatches('walnut', 'Pear & walnut salad'));
});

test('dishConflicts finds dislikes via ingredients and allergies via name', () => {
  assert.deepEqual(dishConflicts(state.guests[0], state.dishes[0]), [{ kind: 'dislike', term: 'mushrooms' }]);
  assert.deepEqual(dishConflicts(state.guests[1], state.dishes[0]), []);
});

test('autocheck flags re-served dishes per guest and ignores the event itself', () => {
  const draft = { id: 'new', guestIds: ['jane', 'tom', 'ann'], dishes: [{ dishId: 'tart' }, { dishId: 'well' }] };
  const { served, conflicts } = autocheck(state, draft);
  const pairs = served.map(s => `${s.guest.id}:${s.dish.id}:${s.events.map(e => e.id).join(',')}`).sort();
  assert.deepEqual(pairs, ['jane:tart:e1', 'jane:well:e1', 'tom:tart:e2,e1', 'tom:well:e1']);
  assert.deepEqual(conflicts.map(c => `${c.guest.id}:${c.dish.id}:${c.kind}`), ['jane:well:dislike']);

  // Editing a past event should not flag that event against itself.
  const self = autocheck(state, state.events[1]);
  assert.deepEqual(self.served.map(s => `${s.guest.id}:${s.dish.id}`), ['tom:tart']);
  assert.deepEqual(self.served[0].events.map(e => e.id), ['e1']);
});

test('search covers guests, dishes and event notes', () => {
  const r = search(state, 'tart');
  assert.deepEqual(r.dishes.map(d => d.id), ['tart']);
  assert.deepEqual(search(state, 'g&t').guests.map(g => g.id), ['jane']);
  assert.deepEqual(search(state, 'chablis').events.map(e => e.id), ['e1']);
  assert.deepEqual(search(state, 'shellfish').guests.map(g => g.id), ['tom']);
  assert.deepEqual(search(state, 'too much').events.map(e => e.id), ['e2']);
});

test('validateBackup rejects junk and fills defaults', () => {
  assert.throws(() => validateBackup({}), /missing/);
  assert.throws(() => validateBackup({ guests: [{}], dishes: [], events: [] }), /no id/);
  const v = validateBackup({ guests: [{ id: 'x', name: 'X' }], dishes: [], events: [{ id: 'e', date: '2024-01-01' }] });
  assert.deepEqual(v.guests[0].allergies, []);
  assert.deepEqual(v.events[0].guestIds, []);
});
