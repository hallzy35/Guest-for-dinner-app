import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dishSuitability, isIngredientHeading, normalizeDish, shoppingList, shoppingText } from '../js/logic.js';

const state = {
  guests: [
    { id: 'jane', name: 'Jane', allergies: ['shrimp'], dislikes: [] },
    { id: 'tom', name: 'Tom', allergies: [], dislikes: ['mushrooms'] },
  ],
  dishes: [
    normalizeDish({ id: 'cake', name: 'Apple Spice Cake', ingredients: ['2 cups flour', 'GLAZE:', '3 Tbsp brown sugar', '1 tsp vanilla'] }),
    normalizeDish({ id: 'shrimp', name: 'Poached Shrimp', ingredients: ['2 lbs shrimp', '1 bay leaf'] }),
    normalizeDish({ id: 'risotto', name: 'Mushroom Pasta', ingredients: ['1 pound fresh mushrooms'] }),
    normalizeDish({ id: 'tart', name: 'Lemon tart', ingredients: [] }),
  ],
  events: [{ id: 'past', guestIds: ['tom'], dishes: [{ dishId: 'tart' }] }],
};
const ev = { id: 'new', guestIds: ['jane', 'tom'], dishes: [{ dishId: 'shrimp' }, { dishId: 'cake' }] };

test('dishSuitability flags repeats and clashes per guest', () => {
  const s = dishSuitability(state, ev);
  assert.deepEqual(s.get('tart').servedTo.map(g => g.id), ['tom']);
  assert.deepEqual(s.get('shrimp').conflicts.map(c => [c.guest.id, c.kind]), [['jane', 'allergy']]);
  assert.deepEqual(s.get('risotto').conflicts.map(c => [c.guest.id, c.kind]), [['tom', 'dislike']]);
  assert.equal(s.get('cake').servedTo.length + s.get('cake').conflicts.length, 0);
});

test('headings are recognised', () => {
  assert.ok(isIngredientHeading('GLAZE:'));
  assert.ok(!isIngredientHeading('juice of 1 lemon:'));
  assert.ok(!isIngredientHeading('2 cups flour'));
});

test('shopping text skips what you have and keeps headings only when needed', () => {
  const list = shoppingList(state, ev);
  const cake = list.find(x => x.dish.id === 'cake');
  const vanilla = cake.lines.find(l => l.text === '1 tsp vanilla').key;
  const sugar = cake.lines.find(l => l.text === '3 Tbsp brown sugar').key;
  let t = shoppingText(state, ev, [vanilla]);
  assert.match(t, /Poached Shrimp\n  ☐ 2 lbs shrimp\n  ☐ 1 bay leaf/);
  assert.match(t, /GLAZE:\n  ☐ 3 Tbsp brown sugar/);
  assert.doesNotMatch(t, /vanilla/);
  t = shoppingText(state, ev, [vanilla, sugar]);
  assert.doesNotMatch(t, /GLAZE/);
});
