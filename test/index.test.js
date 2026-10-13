import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, filterDishes, normalizeDish, sortDishes, totalMinutes } from '../js/logic.js';

const D = (o) => normalizeDish({ id: o.name, ...o });
const dishes = [
  D({ name: 'Garlic Smashed Potatoes', category: 'Starch', total: '0:45', stars: 4, cuisine: 'Traditional' }),
  D({ name: 'Texas Baked Beans', category: 'Starch', total: '4:30', stars: 3, cuisine: 'Southern' }),
  D({ name: 'Maple Ham Steaks', category: 'Entrée', total: '0:15', stars: 4, cuisine: 'Traditional' }),
  D({ name: 'Basic Steamed Lobster', category: 'Entrée', total: '0:25', stars: 5, cuisine: 'Traditional' }),
  D({ name: 'Arni Kleftiko', category: 'Entrée', total: '1:15', stars: 5, cuisine: 'Greek', style: 3 }),
  D({ name: 'Homemade Paté', category: 'Appy', total: '', stars: 4, cuisine: 'French' }),
];

test('totalMinutes parses H:MM and ignores blanks', () => {
  assert.equal(totalMinutes({ total: '1:53' }), 113);
  assert.equal(totalMinutes({ total: '' }), null);
  assert.equal(totalMinutes({ total: 'soon' }), null);
});

test('category & time: book category order, fastest first', () => {
  const idx = buildIndex(dishes, 'category');
  assert.deepEqual(idx.map(g => g.heading), ['Appy', 'Starch', 'Entrée']);
  assert.deepEqual(idx[2].items.map(d => d.name), ['Maple Ham Steaks', 'Basic Steamed Lobster', 'Arni Kleftiko']);
});

test('under 30 minutes includes recipes with no time listed', () => {
  const names = buildIndex(dishes, 'quick').flatMap(g => g.items.map(d => d.name));
  assert.deepEqual(names, ['Homemade Paté', 'Maple Ham Steaks', 'Basic Steamed Lobster']);
});

test('best rated sorts by stars within category', () => {
  const ent = buildIndex(dishes, 'stars').find(g => g.heading === 'Entrée');
  assert.deepEqual(ent.items.map(d => d.stars), [5, 5, 4]);
});

test('cooking style groups alphabetically', () => {
  assert.deepEqual(buildIndex(dishes, 'cuisine').map(g => g.heading), ['French', 'Greek', 'Southern', 'Traditional']);
});

test('filters combine', () => {
  assert.deepEqual(filterDishes(dishes, { minStars: 5, style: 3 }).map(d => d.name), ['Arni Kleftiko']);
  assert.deepEqual(filterDishes(dishes, { q: 'lobster' }).map(d => d.name), ['Basic Steamed Lobster']);
});

test('sortDishes sorts a group by column with blanks last either way', () => {
  const items = [
    { name: 'Beta', total: '1:00', stars: 4, category: 'Dessert' },
    { name: 'Alpha', total: '', stars: '', category: '' },
    { name: 'Gamma', total: '0:20', stars: 5, category: 'Appy' },
    { name: 'Delta', total: '0:20', stars: 3, category: 'Pasta' },
  ];
  const names = r => r.map(d => d.name);
  assert.deepEqual(names(sortDishes(items, 'total', 'asc')), ['Delta', 'Gamma', 'Beta', 'Alpha']);
  assert.deepEqual(names(sortDishes(items, 'total', 'desc')), ['Beta', 'Delta', 'Gamma', 'Alpha']);
  assert.deepEqual(names(sortDishes(items, 'stars', 'desc')), ['Gamma', 'Beta', 'Delta', 'Alpha']);
  assert.deepEqual(names(sortDishes(items, 'category', 'asc')), ['Gamma', 'Delta', 'Beta', 'Alpha']);
  assert.deepEqual(names(sortDishes(items, 'name', 'desc')), ['Gamma', 'Delta', 'Beta', 'Alpha']);
  assert.deepEqual(names(sortDishes(items, 'nope')), names(items));
});
