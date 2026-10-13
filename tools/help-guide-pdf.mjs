// Builds help/guide.pdf — the printable user guide — from the same topics as the in-app Help page
// (js/help.js) and the screenshots in help/. Run after tools/help-screenshots.mjs, or whenever the
// guide's wording changes:
//
//   node tools/help-guide-pdf.mjs
//
// Needs Playwright (Chromium) and poppler-utils (pdftotext, pdfunite). Cover, contents page with
// page numbers, and "Page X of Y" footers. Page numbers in the contents are found by rendering
// once, reading back which page each topic landed on, then rendering again.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HELP_TOPICS } from '../js/help.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'help', 'guide.pdf');
const TMP = mkdtempSync(join(tmpdir(), 'guide-'));
const asset = p => pathToFileURL(join(ROOT, p)).href;
const updated = new Date().toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });

// Forest & Birch palette (light), matching css/styles.css.
const C = {
  ink: '#1c211b', muted: '#313a2f', line: '#c4c0ae', accent: '#264729', soft: '#dfe8da', brand: '#c7862a',
  allergyBg: '#f8e3df', allergyInk: '#8e1a0e', dislikeBg: '#f6e6d5', dislikeInk: '#783708',
  servedBg: '#e2e9f3', servedInk: '#1d3f7a', cream: '#f1ecdf',
};

const BASE_CSS = `
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: ${C.ink}; font: 10.5pt/1.5 Inter, "Helvetica Neue", Arial, sans-serif; }
  h1, h2, h3 { font-family: Caladea, Georgia, serif; color: ${C.accent}; font-weight: 700; }
  strong { font-weight: 600; }
  a { color: inherit; text-decoration: none; }
`;

const coverHtml = () => `<!doctype html><html><head><meta charset="utf-8"><style>
  ${BASE_CSS}
  @page { size: Letter; margin: 0; }
  .cover { width: 8.5in; height: 11in; background: ${C.accent}; color: ${C.cream}; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center; position: relative; }
  .cover img { width: 2.6in; height: 2.6in; }
  .cover h1 { color: ${C.cream}; font-size: 44pt; margin: 0.45in 0 0; letter-spacing: .01em; }
  .rule { width: 1.2in; height: 3px; background: ${C.brand}; margin: 0.22in auto; border-radius: 2px; }
  .sub { font-family: Caladea, Georgia, serif; font-size: 20pt; margin: 0; }
  .for { font-size: 11pt; opacity: .85; margin-top: 0.12in; }
  .foot { position: absolute; bottom: 0.7in; left: 0; right: 0; font-size: 9.5pt; opacity: .75; letter-spacing: .08em; text-transform: uppercase; }
</style></head><body>
  <div class="cover">
    <img src="${asset('icons/icon-512.png')}" alt="">
    <h1>Done Like Dinner</h1>
    <div class="rule"></div>
    <p class="sub">How to use the app</p>
    <p class="for">For Derek — and anyone helping him</p>
    <div class="foot">Updated ${updated}</div>
  </div>
</body></html>`;

const bodyHtml = pages => `<!doctype html><html><head><meta charset="utf-8"><style>
  ${BASE_CSS}
  .toc { break-after: page; }
  .toc h1 { font-size: 28pt; margin: 0 0 4pt; }
  .toc .rule { width: 0.9in; height: 3px; background: ${C.brand}; border-radius: 2px; margin-bottom: 14pt; }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc li { display: flex; align-items: baseline; gap: 10pt; padding: 4.5pt 0; border-bottom: 1px solid ${C.line}; font-size: 11pt; line-height: 1.3; }
  .toc .num { width: 22pt; color: ${C.brand}; font-weight: 700; font-family: Caladea, Georgia, serif; font-size: 14pt; }
  .toc .title { flex: 1; }
  .toc .why { display: block; color: ${C.muted}; font-size: 8.5pt; margin-top: 1pt; }
  .toc .pg { font-weight: 600; color: ${C.accent}; min-width: 24pt; text-align: right; }
  .toc .note { margin-top: 12pt; color: ${C.muted}; font-size: 9.5pt; }

  .topic { margin-top: 26pt; }
  .toc + .topic { margin-top: 0; }
  .kicker { font-size: 8.5pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${C.brand}; break-after: avoid; }
  .topic h2 { font-size: 21pt; margin: 2pt 0 4pt; padding-bottom: 5pt; border-bottom: 2px solid ${C.accent}; break-after: avoid; }
  .why { color: ${C.muted}; font-style: italic; margin: 6pt 0 10pt; break-after: avoid; }
  ol.steps { list-style: none; counter-reset: step; padding: 0; margin: 0 0 8pt; }
  ol.steps > li { counter-increment: step; position: relative; padding: 0 0 0 30pt; margin-bottom: 8pt; break-inside: avoid; }
  ol.steps > li::before { content: counter(step); position: absolute; left: 0; top: 0; width: 19pt; height: 19pt; border-radius: 50%;
    background: ${C.accent}; color: #fff; font-weight: 700; font-size: 9.5pt; line-height: 19pt; text-align: center; }
  .tip { background: ${C.soft}; border-left: 3px solid ${C.accent}; padding: 6pt 10pt; margin: 6pt 0; font-size: 9.5pt; break-inside: avoid; }
  .tip::before { content: "Tip  "; font-weight: 700; color: ${C.accent}; }
  h3 { font-size: 13pt; margin: 12pt 0 4pt; break-after: avoid; }
  dl { margin: 0; }
  dt { font-weight: 600; margin-top: 7pt; break-after: avoid; }
  dd { margin: 1pt 0 0 0; break-inside: avoid; }
  figure { margin: 10pt 0 0; break-inside: avoid; }
  figure img { display: block; max-width: 62%; max-height: 4.3in; border: 1px solid ${C.line}; border-radius: 6pt; }
  figcaption { font-size: 8.5pt; color: ${C.muted}; margin-top: 3pt; }
  .tag { display: inline-block; padding: 0 6pt; border-radius: 999px; font-size: 9pt; white-space: nowrap; }
  .tag.allergy { background: ${C.allergyBg}; color: ${C.allergyInk}; font-weight: 600; }
  .tag.dislike { background: ${C.dislikeBg}; color: ${C.dislikeInk}; }
  .tag.served { background: ${C.servedBg}; color: ${C.servedInk}; }
  .tag.fav { background: ${C.soft}; color: ${C.accent}; }
</style></head><body>
  <section class="toc">
    <h1>Contents</h1>
    <div class="rule"></div>
    <ol>${HELP_TOPICS.map((t, i) => `<li><span class="num">${i + 1}</span>
      <span class="title">${t.title}<span class="why">${t.why}</span></span>
      <span class="pg">${pages[t.id] ?? '00'}</span></li>`).join('')}</ol>
    <p class="note">The same guide is in the app under <strong>Help</strong>. Pictures use sample guests and recipes.</p>
  </section>
  ${HELP_TOPICS.map((t, i) => `<section class="topic">
    <div class="kicker">Topic ${i + 1}</div>
    <h2>${t.title}</h2>
    <p class="why">${t.why}</p>
    <ol class="steps">${t.steps.map(s => `<li>${s}</li>`).join('')}</ol>
    ${t.trouble ? `<h3>Troubleshooting</h3><dl>${t.trouble.map(([q, a]) => `<dt>${q}</dt><dd>${a}</dd>`).join('')}</dl>` : ''}
    ${(t.tips || []).map(tip => `<p class="tip">${tip}</p>`).join('')}
    ${t.shot ? `<figure><img src="${asset(`help/${t.shot}.jpg`)}" alt=""><figcaption>${t.title} — as it looks in the app.</figcaption></figure>` : ''}
  </section>`).join('')}
</body></html>`;

const footer = `<div style="width:100%; padding:0 0.75in; display:flex; justify-content:space-between;
  font-family:Inter, Arial, sans-serif; font-size:8pt; color:${C.muted};">
  <span>Done Like Dinner · How to use the app</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
const render = async (html, file, opts) => {
  const src = join(TMP, file.replace(/\.pdf$/, '.html'));
  writeFileSync(src, html);
  await page.goto(pathToFileURL(src).href, { waitUntil: 'load' });
  await page.pdf({ path: join(TMP, file), format: 'Letter', printBackground: true, ...opts });
  return join(TMP, file);
};
const bodyOpts = {
  margin: { top: '0.75in', bottom: '0.8in', left: '0.75in', right: '0.75in' },
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: footer,
};

try {
  const cover = await render(coverHtml(), 'cover.pdf', { margin: { top: 0, bottom: 0, left: 0, right: 0 } });

  // Pass 1: find the page each topic starts on (page numbers count from the contents page).
  const draft = await render(bodyHtml({}), 'draft.pdf', bodyOpts);
  const count = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [draft], { encoding: 'utf8' }))[1]);
  const pages = {};
  for (let n = 2; n <= count; n++) {
    const text = execFileSync('pdftotext', ['-f', String(n), '-l', String(n), '-layout', draft, '-'], { encoding: 'utf8' });
    // The kicker is letter-spaced, so pdftotext may read "TOPIC 12" as "T O P I C 1 2".
    for (const m of text.matchAll(/T\s?O\s?P\s?I\s?C\s+(\d(?: ?\d)?)(?!\s?\d)/gi)) {
      const t = HELP_TOPICS[Number(m[1].replace(/ /g, '')) - 1];
      if (t && !(t.id in pages)) pages[t.id] = n;
    }
  }
  const missing = HELP_TOPICS.filter(t => !(t.id in pages)).map(t => t.title);
  if (missing.length) throw new Error(`Couldn't find the page for: ${missing.join(', ')}`);

  // Pass 2: same layout with the real page numbers, then put the cover in front.
  const body = await render(bodyHtml(pages), 'body.pdf', bodyOpts);
  execFileSync('pdfunite', [cover, body, OUT]);
  console.log(`help/guide.pdf: cover + ${count} pages`, pages);
} finally {
  await browser.close();
  rmSync(TMP, { recursive: true, force: true });
}
