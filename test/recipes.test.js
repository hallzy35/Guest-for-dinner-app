import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRecipe, dishConflicts, mergeDishes, normalizeDish, planRecipeImport, search } from '../js/logic.js';

test('normalizeDish fills defaults and coerces card values', () => {
  const d = normalizeDish({ id: 'x', name: ' Pork ', category: 4, style: '2', complexity: 9, stars: '4.4', ingredients: '1 tsp oil\n\n2 cups rice, cooked' });
  assert.equal(d.name, 'Pork');
  assert.equal(d.category, 'Entrée');
  assert.equal(d.style, 2);
  assert.equal(d.complexity, 0);
  assert.equal(d.stars, 4.5);
  assert.deepEqual(d.ingredients, ['1 tsp oil', '2 cups rice, cooked']); // commas inside a line are kept
  assert.equal(d.instructions, '');
});

test('older dishes without recipe fields still load', () => {
  const d = normalizeDish({ id: 'old', name: 'Lemon tart', course: 'Dessert', ingredients: ['lemon'], notes: '' });
  assert.equal(d.course, 'Dessert');
  assert.equal(d.category, '');
  assert.equal(d.stars, 0);
});

test('planRecipeImport marks new vs existing and rejects bad files', () => {
  const state = { dishes: [normalizeDish({ id: 'a', name: 'Sweet & Sour Pork', course: 'Main' })], guests: [], events: [] };
  const plan = planRecipeImport(state, { recipes: [{ name: 'sweet & sour pork', stars: 4.5 }, { name: 'Pavlova' }] });
  assert.equal(plan[0].existing.id, 'a');
  assert.equal(plan[1].existing, undefined);
  assert.notEqual(plan[1].recipe.id, undefined);
  assert.throws(() => planRecipeImport(state, { recipes: [] }), /No recipes/);
  assert.throws(() => planRecipeImport(state, { recipes: [{ stars: 3 }] }), /no name/);
});

test('applyRecipe updates card fields but keeps id, course and filled-in values the card lacks', () => {
  const existing = normalizeDish({ id: 'a', name: 'Sweet & Sour Pork', course: 'Main', notes: 'Mine', source: 'Old book' });
  const recipe = normalizeDish({ name: 'Sweet & Sour Pork', stars: 4.5, source: 'Betty Crocker', ingredients: ['pork'] });
  const out = applyRecipe(existing, recipe);
  assert.equal(out.id, 'a');
  assert.equal(out.course, 'Main');
  assert.equal(out.notes, 'Mine');
  assert.equal(out.source, 'Betty Crocker');
  assert.equal(out.stars, 4.5);
});

test('allergy check reads full ingredient lines and the main ingredient', () => {
  const dish = normalizeDish({ name: 'Stir fry', mainIngredient: 'shrimp', ingredients: ['1/2 green pepper, cut in strips', '2 Tbsp peanut oil'] });
  const guest = { allergies: ['peanuts', 'shrimp'], dislikes: ['green peppers'] };
  assert.deepEqual(dishConflicts(guest, dish).map(c => c.term).sort(), ['green peppers', 'peanuts', 'shrimp']);
});

test('search finds dishes by cooking style, source and main ingredient', () => {
  const state = { guests: [], events: [], dishes: [normalizeDish({ id: 'p', name: 'Sweet & Sour Pork', cuisine: 'Asian', source: 'Betty Crocker', mainIngredient: 'pork loin' })] };
  for (const q of ['asian', 'betty', 'loin']) assert.deepEqual(search(state, q).dishes.map(d => d.id), ['p']);
});

test('mergeDishes keeps card fields from either record', () => {
  const state = {
    guests: [], events: [],
    dishes: [normalizeDish({ id: 'k', name: 'Pork', stars: 0, instructions: 'Step A' }), normalizeDish({ id: 'd', name: 'Pork2', stars: 4, cuisine: 'Asian', instructions: 'Step B' })],
  };
  const { dish } = mergeDishes(state, 'k', 'd');
  assert.equal(dish.stars, 4);
  assert.equal(dish.cuisine, 'Asian');
  assert.equal(dish.instructions, 'Step A\n\nStep B');
});
