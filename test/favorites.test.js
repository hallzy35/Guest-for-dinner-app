import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autocheck, dishSuitability, mergeDishes, mergeGuests, setFavorite, validateBackup } from '../js/logic.js';

const state = {
  guests: [
    { id: 'jane', name: 'Jane', allergies: [], dislikes: [], favorites: ['pie'] },
    { id: 'tom', name: 'Tom', allergies: [], dislikes: [], favorites: [] },
  ],
  dishes: [
    { id: 'pie', name: 'Pecan Pie', ingredients: [] },
    { id: 'pie2', name: 'Pecan pie (old)', ingredients: [] },
    { id: 'tart', name: 'Lemon tart', ingredients: [] },
  ],
  events: [
    { id: 'a', date: '2024-03-01', guestIds: ['jane'], dishes: [{ dishId: 'pie' }] },
    { id: 'b', date: '2025-03-01', guestIds: ['jane', 'tom'], dishes: [{ dishId: 'pie' }, { dishId: 'tart' }] },
  ],
};

test('favourites show up in the planning data with their past events', () => {
  const s = dishSuitability(state, { id: 'new', guestIds: ['jane', 'tom'], dishes: [] });
  const fav = s.get('pie').favOf;
  assert.deepEqual(fav.map(f => f.guest.id), ['jane']);
  assert.deepEqual(fav[0].events.map(e => e.id), ['b', 'a']);
  assert.equal(s.get('tart').favOf.length, 0);
});

test('autocheck marks favourites, including ones never served to that guest', () => {
  const st = { ...state, guests: [state.guests[0], { ...state.guests[1], favorites: ['pie2'] }] };
  const r = autocheck(st, { id: 'new', guestIds: ['jane', 'tom'], dishes: [{ dishId: 'pie' }, { dishId: 'tart' }, { dishId: 'pie2' }] });
  const flags = r.served.map(s => [s.guest.id, s.dish.id, s.favorite, s.events.length]);
  assert.deepEqual(flags, [
    ['jane', 'pie', true, 2],
    ['tom', 'pie', false, 1],
    ['jane', 'tart', false, 1],
    ['tom', 'tart', false, 1],
    ['tom', 'pie2', true, 0],
  ]);
});

test('setFavorite only returns guests that change', () => {
  const on = setFavorite(state.guests, 'pie', true);
  assert.deepEqual(on.map(g => [g.id, g.favorites]), [['tom', ['pie']]]);
  const off = setFavorite(state.guests, 'pie', false);
  assert.deepEqual(off.map(g => [g.id, g.favorites]), [['jane', []]]);
});

test('merging keeps favourites pointing at the surviving records', () => {
  const st = { ...state, guests: [state.guests[0], { ...state.guests[1], favorites: ['pie2'] }] };
  const d = mergeDishes(st, 'pie', 'pie2');
  assert.deepEqual(d.guests.map(g => [g.id, g.favorites]), [['tom', ['pie']]]);
  const g = mergeGuests(st, 'jane', 'tom');
  assert.deepEqual(g.guest.favorites, ['pie', 'pie2']);
});

test('old backups get an empty favourites list', () => {
  const r = validateBackup({ guests: [{ id: 'x', name: 'X' }], dishes: [], events: [] });
  assert.deepEqual(r.guests[0].favorites, []);
});
