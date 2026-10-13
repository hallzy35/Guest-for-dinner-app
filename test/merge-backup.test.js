import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeBackup, validateBackup } from '../js/logic.js';

const T1 = '2026-10-01T10:00:00.000Z';
const T2 = '2026-10-02T10:00:00.000Z';
const T3 = '2026-10-03T10:00:00.000Z';
const base = () => ({
  guests: [{ id: 'g1', name: 'Jane', notes: 'old', favorites: [], updatedAt: T1 }],
  dishes: [{ id: 'd1', name: 'Pecan Pie', updatedAt: T1 }],
  events: [{ id: 'e1', date: '2026-09-01', guestIds: ['g1'], dishes: [{ dishId: 'd1' }], updatedAt: T1 }],
  deleted: [],
});

test('newer edit wins on either side; records on one side are kept', () => {
  const mine = base();
  const theirs = base();
  theirs.guests[0] = { ...theirs.guests[0], notes: 'from iPad 2', updatedAt: T2 };
  mine.dishes[0] = { ...mine.dishes[0], stars: 5, updatedAt: T3 };
  theirs.dishes[0] = { ...theirs.dishes[0], stars: 3, updatedAt: T2 };
  theirs.events.push({ id: 'e2', date: '2026-10-05', guestIds: ['g1'], dishes: [], updatedAt: T2 });
  const { state, summary } = mergeBackup(mine, theirs);
  assert.equal(state.guests[0].notes, 'from iPad 2');
  assert.equal(state.dishes[0].stars, 5);
  assert.deepEqual(state.events.map(e => e.id), ['e1', 'e2']);
  assert.deepEqual(summary.guests, { added: 0, updated: 1, removed: 0 });
  assert.deepEqual(summary.dishes, { added: 0, updated: 0, removed: 0 });
  assert.deepEqual(summary.events, { added: 1, updated: 0, removed: 0 });
});

test('deletions stick unless the record was edited afterwards', () => {
  const mine = base();
  mine.events = [];
  mine.deleted = [{ id: 'e1', store: 'events', deletedAt: T2 }];
  const theirs = base(); // still has e1, last edited before the delete
  let r = mergeBackup(mine, theirs);
  assert.equal(r.state.events.length, 0);
  assert.equal(r.summary.events.added, 0);

  theirs.events[0].updatedAt = T3; // edited on the other device after it was deleted here
  r = mergeBackup(mine, theirs);
  assert.equal(r.state.events.length, 1);

  // and a deletion made on the other device removes it here
  r = mergeBackup(base(), { ...base(), dishes: [], deleted: [{ id: 'd1', store: 'dishes', deletedAt: T2 }] });
  assert.equal(r.state.dishes.length, 0);
  assert.equal(r.summary.dishes.removed, 1);
  assert.deepEqual(r.state.events[0].dishes, [], 'menu no longer points at the deleted dish');
});

test('same name, different id: treated as one record and references follow', () => {
  const mine = base();
  const theirs = {
    guests: [{ id: 'gX', name: 'jane', favorites: ['dX'], updatedAt: T2 }],
    dishes: [{ id: 'dX', name: 'Pecan pie', updatedAt: T1 }],
    events: [{ id: 'e9', date: '2026-10-09', guestIds: ['gX'], dishes: [{ dishId: 'dX' }], updatedAt: T2 }],
    deleted: [],
  };
  const { state, summary } = mergeBackup(mine, theirs);
  assert.equal(state.guests.length, 1);
  assert.equal(state.dishes.length, 1);
  assert.equal(summary.matchedByName, 2);
  assert.deepEqual(state.guests[0].favorites, ['d1']);
  const e9 = state.events.find(e => e.id === 'e9');
  assert.deepEqual(e9.guestIds, ['g1']);
  assert.deepEqual(e9.dishes.map(d => d.dishId), ['d1']);
});

test('old backups without timestamps or deletions still merge, and this device wins ties', () => {
  const mine = validateBackup({ guests: [{ id: 'g1', name: 'Jane', notes: 'here' }], dishes: [], events: [] });
  const theirs = validateBackup({ guests: [{ id: 'g1', name: 'Jane', notes: 'there' }, { id: 'g2', name: 'Tom' }], dishes: [], events: [] });
  const { state } = mergeBackup(mine, theirs);
  assert.deepEqual(state.guests.map(g => [g.id, g.notes]), [['g1', 'here'], ['g2', '']]);
  assert.deepEqual(state.deleted, []);
});

test('merging is repeatable: merging the same backup twice changes nothing more', () => {
  const theirs = base();
  theirs.events.push({ id: 'e2', date: '2026-10-05', guestIds: ['g1'], dishes: [], updatedAt: T2 });
  const once = mergeBackup(base(), theirs).state;
  const twice = mergeBackup(once, theirs);
  assert.deepEqual(twice.state, once);
  assert.deepEqual(twice.summary.events, { added: 0, updated: 0, removed: 0 });
});

test('identical records saved at different times are not reported as updates', () => {
  const theirs = base();
  theirs.dishes[0] = { ...theirs.dishes[0], updatedAt: T3 };
  const { state, summary } = mergeBackup(base(), theirs);
  assert.deepEqual(summary.dishes, { added: 0, updated: 0, removed: 0 });
  assert.equal(state.dishes[0].updatedAt, T1);
});
