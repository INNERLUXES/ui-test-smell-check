import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { FACTS, FRAMEWORKS, IGNORE_MARKER, JS_MODULES, LANGUAGES, RULES, SKIP_FOLDERS, SOURCES, basisOf, factPage, factsFor, languageOf, mayHoldJsx, source } from '../src/index.js';

// These tests read the saved pages again and compare them with src/data.js: every sentence that a finding or a
// document quotes.

const text = async (id) => readFile(new URL(`../research/sources/${source(id).file}`, import.meta.url), 'utf8');
// Text compared without line breaks or runs of white space.
const flat = (t) => t.replace(/\s+/g, ' ').trim();
const has = (page, needle) => flat(page).includes(flat(needle));
// The words of a tool that wrote a text, built from pieces so that this file does not hold them.
const WRITTEN = new RegExp(`\\b(?:${['A', 'I'].join('')}|${['cha', 't'].join('')}|${['ope', 'nai'].join('')}|${['gene', 'rated'].join('')}|${['assis', 'tants?'].join('')}|${['g', 'pt'].join('')}|${['l', 'lms?'].join('')})\\b|${['clau', 'de'].join('')}|${['anthro', 'pic'].join('')}|${['ses', 'sion'].join('')}`, 'i');
const YEAR = /\b(?:19|20)\d{2}\b/;

test('sources: every saved page has its address on the first line, as listed in src/data.js, and holds text', async () => {
  for (const s of SOURCES) {
    const page = await text(s.id);
    assert.equal(page.split('\n')[0], `Source: ${s.url}`, s.file);
    assert.ok(page.length > 200, `${s.file} holds the page text`);
    assert.match(s.url, /^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9/._-]*(?:#[a-z-]+)?$/);
  }
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.url)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.file)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.id)).size);
});

test('sources: every file in research/sources is listed in src/data.js, and the other way round', async () => {
  const files = (await readdir(new URL('../research/sources/', import.meta.url))).sort();
  assert.deepEqual(files, SOURCES.map((s) => s.file).sort());
});

test('sources: nine Playwright pages, four Cypress pages, five Selenium pages and RFC 8259', () => {
  const hosts = SOURCES.map((s) => new URL(s.url).host);
  assert.equal(hosts.filter((h) => h === 'playwright.dev').length, 9);
  assert.equal(hosts.filter((h) => h === 'docs.cypress.io').length, 4);
  assert.equal(hosts.filter((h) => h === 'www.selenium.dev').length, 5);
  assert.equal(hosts.filter((h) => h === 'www.rfc-editor.org').length, 1);
});

test('sources: no saved page holds a year, a mention of a tool that wrote it, a control byte, a carriage return or a character that is not ASCII', async () => {
  for (const s of SOURCES) {
    const page = await text(s.id);
    assert.doesNotMatch(page, YEAR, s.file);
    assert.doesNotMatch(page, WRITTEN, s.file);
    assert.doesNotMatch(page, new RegExp(`[${String.fromCharCode(1)}-${String.fromCharCode(8)}]`), s.file);
    assert.ok(!page.includes('\r'), s.file);
    assert.ok([...page].every((c) => c.charCodeAt(0) < 128), s.file);
    assert.ok(page.endsWith('\n'), s.file);
  }
});

test('the saved pages show what the rules rely on: the calls, the options and the locators they name', async () => {
  assert.ok(has(await text('pw-wait'), 'await page.waitForTimeout(1000);'));
  assert.ok(has(await text('pw-locators'), "'#tsf > div:nth-child(2) > div.A8SBwf > div.RNNXgb > div > div.a4bIc > input'"));
  assert.ok(has(await text('pw-locators'), 'locator.first(), locator.last() or locator.nth()'));
  assert.ok(has(await text('pw-serial'), "test.describe.configure({ mode: 'serial' });"));
  assert.ok(has(await text('pw-test'), '- test.skip(title, body)'));
  assert.ok(has(await text('pw-test'), '- test.skip(condition, description)'));
  assert.ok(has(await text('pw-use-options'), "baseURL: 'http://localhost:3000',"));
  assert.ok(has(await text('cy-best'), "cy.get('.btn.btn-large').click()"));
  assert.ok(has(await text('cy-best'), "cy.wait('@getUsers')"));
  assert.ok(has(await text('cy-interact'), "cy.get('button').click({ force: true })"));
  for (const action of ['.click()', '.dblclick()', '.rightclick()', '.type()', '.clear()', '.check()', '.uncheck()', '.select()', '.trigger()', '.selectFile()']) assert.ok(has(await text('cy-interact'), `- ${action}`), action);
  assert.ok(has(await text('cy-organize'), "it.skip('uploads a new avatar', () => {"));
  assert.ok(has(await text('se-waits'), 'Warning: Do not mix implicit and explicit waits.'));
  assert.ok(has(await text('se-locators'), 'Example - /html/form/input[1].'));
  assert.ok(has(await text('rfc8259'), 'The names within an object SHOULD be unique.'));
});

test('facts: every quoted sentence is on its saved page, word for word, with its section, no year and no mention of a tool that wrote it', async () => {
  for (const [key, fact] of Object.entries(FACTS)) {
    assert.ok(SOURCES.some((s) => s.id === fact.source), key);
    assert.ok(has(await text(fact.source), fact.text), `${key}: "${fact.text}"`);
    assert.ok(has(await text(fact.source), fact.section), `${key}: the section ${fact.section} is on the page`);
    assert.doesNotMatch(fact.text, YEAR, key);
    assert.doesNotMatch(fact.text, WRITTEN, key);
    assert.ok(fact.text.length <= 360, `${key} is short`);
    assert.match(fact.text, /[.:)!]$/, `${key} is a whole sentence`);
    assert.equal(factPage(key), source(fact.source).url);
    assert.deepEqual(basisOf(key), { key, text: fact.text, section: fact.section, source: source(fact.source).url });
  }
});

test('facts: every rule quotes sentences of src/data.js for each framework it reads, and every source page is quoted', () => {
  for (const r of RULES) {
    assert.match(r.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, r.id);
    assert.ok(['error', 'warning', 'info'].includes(r.severity), r.id);
    assert.ok(r.what.length > 30, r.id);
    for (const [framework, keys] of Object.entries(r.facts)) {
      assert.ok(['playwright', 'cypress', 'selenium', 'any'].includes(framework), `${r.id}: ${framework}`);
      assert.ok(keys.length >= 1 && keys.length <= 2, `${r.id}: ${framework}`);
      for (const k of keys) assert.ok(FACTS[k], `${r.id}: ${k}`);
    }
    for (const f of ['playwright', 'cypress', 'selenium']) assert.ok(factsFor(r.id, f).length >= 1, `${r.id} has a basis for ${f}`);
  }
  const quoted = new Set(Object.values(FACTS).map((f) => f.source));
  for (const s of SOURCES) assert.ok(quoted.has(s.id), s.id);
  assert.deepEqual(RULES.filter((r) => r.severity === 'error').map((r) => r.id), ['fixed-wait', 'only-left']);
  assert.deepEqual(RULES.filter((r) => r.severity === 'info').map((r) => r.id), ['nth-locator', 'skipped-test', 'absolute-url']);
  assert.deepEqual(factsFor('only-left', 'selenium'), ['cyOnly'], 'a framework with no facts of its own uses any');
});

test('lists: the languages, the frameworks, the modules, the folders and the marker', () => {
  assert.deepEqual(Object.keys(LANGUAGES).sort(), ['.cjs', '.cts', '.java', '.js', '.jsx', '.mjs', '.mts', '.py', '.ts', '.tsx']);
  assert.equal(languageOf('a/b.SPEC.TS'), 'typescript');
  assert.equal(languageOf('test_x.py'), 'python');
  assert.equal(languageOf('X.java'), 'java');
  assert.equal(languageOf('a.json'), null);
  assert.equal(languageOf('Makefile'), null);
  assert.equal(mayHoldJsx('a.tsx'), true);
  assert.equal(mayHoldJsx('a.jsx'), true);
  assert.equal(mayHoldJsx('a.ts'), false);
  assert.deepEqual(FRAMEWORKS.map((f) => f.id), ['playwright', 'cypress', 'selenium']);
  assert.ok(JS_MODULES.playwright.includes('@playwright/test'));
  assert.deepEqual(JS_MODULES.selenium, ['selenium-webdriver']);
  for (const list of [SKIP_FOLDERS, JS_MODULES.playwright]) assert.equal(new Set(list).size, list.length);
  assert.equal(IGNORE_MARKER, 'ui-test-smell-check-ignore');
});

test('src writes no quoted sentence outside src/data.js', async () => {
  for (const file of await readdir(new URL('../src/', import.meta.url))) {
    if (file === 'data.js') continue;
    const code = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    for (const fact of Object.values(FACTS)) if (fact.text.length > 40) assert.ok(!code.includes(fact.text.slice(0, 40)), `${file} writes "${fact.text.slice(0, 40)}" itself`);
  }
});

test('docs: every sentence that the documents quote from a saved page is on a saved page', async () => {
  const pages = (await Promise.all(SOURCES.map((s) => text(s.id)))).map(flat).join(' ');
  let checked = 0;
  for (const file of ['docs/method.md', 'docs/rules-and-sources.md', 'docs/inputs.md', 'docs/limits.md', 'docs/threat-model.md', 'docs/decisions/0001-lex-the-files-never-run-or-import-them.md', 'README.md']) {
    const doc = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const prose = doc.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const m of prose.matchAll(/"([^"\n]{40,400})"/g)) {
      assert.ok(pages.includes(flat(m[1])), `${file}: ${m[1]}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 40, `${checked} quotes checked`);
});

test('docs: docs/rules-and-sources.md names every saved page, every quoted sentence and every rule', async () => {
  const doc = await readFile(new URL('../docs/rules-and-sources.md', import.meta.url), 'utf8');
  for (const s of SOURCES) {
    assert.ok(doc.includes(s.file), s.file);
    assert.ok(doc.includes(s.url), s.url);
  }
  for (const [key, fact] of Object.entries(FACTS)) assert.ok(doc.includes(`| \`${key}\` |`) && doc.includes(fact.text), key);
  for (const r of RULES) {
    assert.ok(doc.includes(`| \`${r.id}\` | ${r.severity} |`), r.id);
    assert.ok(doc.includes(`(method.md#${r.id}-${r.severity})`), r.id);
    for (const keys of Object.values(r.facts)) for (const k of keys) assert.ok(new RegExp(`\\| \`${k}\` \\| [^|]*\`${r.id}\``).test(doc), `${k} is used by ${r.id}`);
  }
});
