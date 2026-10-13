import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Every file the offline cache needs must exist and be copied by the deploy workflow.
// (A missing one breaks the page that uses it and stops the new version installing offline.)
test('deploy publishes every file the service worker caches', () => {
  const sw = readFileSync('sw.js', 'utf8');
  const shell = sw.slice(sw.indexOf('const SHELL = ['), sw.indexOf('];', sw.indexOf('const SHELL = [')));
  // Plain entries like 'js/app.js', plus a spread like ...['a', 'b'].map(n => `help/${n}.jpg`).
  const spread = /\.\.\.\[([^\]]+)\]\.map\(n => `([^`$]*)\$\{n\}([^`]*)`\)/.exec(shell);
  const plain = spread ? shell.replace(spread[0], '') : shell;
  const files = [...plain.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './');
  if (spread) for (const n of spread[1].matchAll(/'([^']+)'/g)) files.push(spread[2] + n[1] + spread[3]);

  const workflow = readFileSync('.github/workflows/pages.yml', 'utf8');
  const copied = /cp -r ([^\n]+) _site\//.exec(workflow)[1].trim().split(/\s+/);
  for (const f of files) {
    assert.ok(existsSync(f), `${f} is cached by sw.js but doesn't exist`);
    assert.ok(copied.includes(f.split('/')[0]), `${f} is cached by sw.js but the deploy doesn't copy "${f.split('/')[0]}"`);
  }
  assert.ok(files.includes('help/guide.pdf') && files.some(f => f.endsWith('.jpg')), 'help files are in the cache list');
});

test('every screenshot the Help topics use exists', async () => {
  const { HELP_TOPICS } = await import('../js/help.js');
  for (const t of HELP_TOPICS.filter(t => t.shot)) assert.ok(existsSync(`help/${t.shot}.jpg`), `help/${t.shot}.jpg missing`);
});
