// Re-takes the screenshots used by the in-app Help page (help/*.jpg), using made-up sample data.
// Run after any visible change so the guide matches the app:
//
//   python3 -m http.server 8080 &          # serve the app from the repo root
//   node tools/help-screenshots.mjs [http://localhost:8080/]
//
// Needs Playwright (npm i -D playwright, or a global install). In Claude Code cloud sessions
// Chromium is preinstalled at /opt/pw-browsers/chromium and is used if present.
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://localhost:8080/';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'help');
mkdirSync(OUT, { recursive: true });

const recipe = (name, category, course, mainIngredient, total, stars, ingredients) => ({
  name, category, course, mainIngredient, total, stars, style: 2, complexity: 1, ingredients,
  instructions: 'Sample recipe for the help screenshots.',
});
const SAMPLE = {
  app: 'done-like-dinner', kind: 'recipes', version: 1,
  recipes: [
    recipe('Saganaki', 'Appy', 'Starter', 'kefalotyri cheese', '0:10', 5, ['1/2 lb kefalotyri cheese', '2 Tbsp flour', '1 lemon']),
    recipe('Poached Shrimp', 'Appy', 'Cocktail / appetizer', 'shrimp', '0:20', 4, ['2 lbs shrimp', '1 bay leaf', '1 lemon']),
    recipe('Hummus', 'Appy', 'Cocktail / appetizer', 'chickpeas', '0:15', 5, ['1 can chickpeas', '2 Tbsp tahini', '1 clove garlic']),
    recipe('Mushroom Risotto', 'Pasta', 'Main', 'arborio rice', '0:45', 4, ['1 cup arborio rice', '1/2 lb mushrooms', '4 cups stock']),
    recipe('Fettuccini Alfredo', 'Pasta', 'Main', 'fettuccini', '0:25', 4, ['fettuccini', '1 cup cream', '1/2 cup parmesan']),
    recipe('Roast Pork Loin', 'Entrée', 'Main', 'pork loin', '1:30', 5, ['3 lb pork loin', '2 Tbsp Dijon', 'fresh rosemary']),
    recipe('Cedar Plank Salmon', 'Entrée', 'Main', 'salmon', '0:40', 5, ['1 cedar plank', '2 lb salmon fillet', '2 Tbsp maple syrup', '1 Tbsp soy sauce']),
    recipe('Beef Wellington', 'Entrée', 'Main', 'beef tenderloin', '2:00', 4.5, ['2 lb beef tenderloin', '1 sheet puff pastry', '1/2 lb mushrooms']),
    recipe('Scalloped Potatoes', 'Starch', 'Side', 'potatoes', '1:15', 4, ['6 potatoes', '2 cups milk', '1 onion']),
    recipe('Green Beans Almondine', 'Veggie', 'Side', 'green beans', '0:15', 3.5, ['1 lb green beans', '1/4 cup sliced almonds', '2 Tbsp butter']),
    recipe('Pecan Pie', 'Dessert', 'Dessert', 'pecans', '1:05', 5, ['1 pie shell', '1 1/2 cups pecans', '3 eggs', '1 cup corn syrup']),
    recipe('Light Carrot Cake', 'Dessert', 'Dessert', 'carrots', '1:00', 4, ['2 cups grated carrots', '2 cups flour', 'GLAZE:', '1 cup icing sugar']),
  ],
};

const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath });
const ctx = await browser.newContext({ viewport: { width: 820, height: 1000 }, colorScheme: 'light' });
const p = await ctx.newPage();
p.on('dialog', d => d.accept());
p.on('pageerror', e => { throw e; });
const pause = (ms = 200) => p.waitForTimeout(ms);
const shot = async name => {
  await pause(300);
  await p.evaluate(() => document.getElementById('toast').classList.remove('show'));
  await pause(250);
  await p.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 80 });
  console.log('help/' + name + '.jpg');
};
const top = async selector => {
  await p.evaluate(sel => {
    const el = document.querySelector(sel);
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80);
  }, selector);
};
const pick = async (input, text) => {
  await p.fill(input, text);
  await pause(100);
  await p.keyboard.press('Enter');
  await pause(200);
};

// Sample data
await p.goto(BASE + '#/settings');
await pause(400);
await p.setInputFiles('#recipe-file', { name: 'sample-recipes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(SAMPLE)) });
await pause(300);
await p.evaluate(() => window.scrollTo(0, 0));
await shot('settings-add');
await p.click('#rf-save');
await p.waitForURL(/#\/dishes/);

await p.goto(BASE + '#/event/new');
await pause();
await p.fill('#date', '2025-03-01');
await p.dispatchEvent('#date', 'change');
await pick('#guest-in', 'Jane');
await pick('#dish-in', 'Saganaki');
await pick('#dish-in', 'Pecan Pie');
await p.click('[data-fav]'); // Saganaki becomes Jane's favourite
await pause();

await p.goto(BASE + '#/guests');
await p.click('text=Jane');
await pause();
await p.fill('input[name=drinks]', 'Pinot noir');
await p.fill('input[name=allergies]', 'shrimp');
await p.fill('input[name=dislikes]', 'mushrooms');
await p.fill('input[name=likes]', 'anything smoked');
await pause(700);
await pick('#fav-in', 'Cedar Plank Salmon');
await p.evaluate(() => document.activeElement.blur());
await p.evaluate(() => window.scrollTo(0, 0));
await shot('guest');

await p.goto(BASE + '#/event/new');
await pause();
await p.fill('#date', '2026-12-05');
await p.dispatchEvent('#date', 'change');
await p.fill('#title', 'Christmas dinner');
await pause(500);
await pick('#guest-in', 'Jane');
await pick('#guest-in', 'Tom');
for (const d of ['Saganaki', 'Poached Shrimp', 'Pecan Pie']) await pick('#dish-in', d);
const eventUrl = p.url();
await p.evaluate(() => document.activeElement.blur());
await top('.briefing');
await shot('event');

await p.click('text=Find dishes for these guests');
await pause(400);
await shot('plan');

await p.goto(eventUrl);
await pause();
await p.click('text=Shopping list');
await pause(400);
await p.check('[data-key] >> nth=1');
await shot('shop');

await p.goto(BASE + '#/dishes');
await pause();
await p.click('[data-mode="category"]');
await p.click('[data-view="list"]');
await pause();
await p.click('[data-sort="total"] >> nth=0');
await shot('index');

await p.goto(BASE + '#/settings');
await pause();
await top('#export');
await shot('merge');

await browser.close();
