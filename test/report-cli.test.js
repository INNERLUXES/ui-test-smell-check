import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILE_LIMITS, LIMITS, USAGE, VERSION, checkFiles, checkPaths, decodeText, displayPath, fileError, grouped, isBinary, listText, main, mdCell, parseArgs, parseSize, plural, readBounded, readInputs, safeText, sizeText, toJson, toMarkdown, toText, lineText, lineStarts } from '../src/index.js';
import { ONLY, PW, cli, run, where, withFiles } from './helpers.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');

// Runs the tool on files of the repository, with the root of the repository as the base for relative paths.
async function inRoot(argv) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, root);
  return { code, out, err };
}

const SPEC = `${PW}test('a', async ({ page }) => {\n  await page.waitForTimeout(500);\n  await page.locator('.btn').click();\n  await rows.nth(1).click();\n});\n`;
const files = { 'tests/a.spec.ts': SPEC, 'tests/data.ts': 'export const x = 1;\n', 'tests/readme.md': '# not read\n' };

test('text report: what was read, the counts, each file with its findings, the notes and the gate', async () => {
  const r = await run(files, ['tests']);
  assert.equal(r.code, 1);
  const lines = r.out.split('\n');
  assert.equal(lines[0], 'ui-test-smell-check: tests');
  assert.equal(lines[1], 'files: 2 files read, 1 with a UI test framework (Playwright 1, Cypress 0, Selenium 0), 1 without, 0 not read');
  assert.equal(lines[2], 'rules: 11 rules on; fail level error');
  assert.equal(lines[3], 'findings: 1 error, 1 warning, 1 info');
  assert.equal(lines[5], 'tests/a.spec.ts (Playwright)');
  const w = where(SPEC, 'waitForTimeout');
  assert.equal(lines[6], `  ${`${w.line}:${w.column}`.padEnd(8)} ERROR    fixed-wait         waitForTimeout(500) waits a fixed 500 ms; wait for a condition the page shows instead`);
  assert.match(r.out, /^ {2}\S+ +WARNING  styling-selector   locator "\.btn" picks the element by its class names$/m);
  assert.match(r.out, /^ {2}\S+ +INFO     nth-locator        \.nth\(1\)/m);
  assert.match(r.out, /\nnote: 1 file with no Playwright, Cypress or Selenium import was read and not checked: tests\/data\.ts\n\nGATE: FAIL - 1 error \(--fail-on error\)\n$/);
  assert.doesNotMatch(r.out, /code:|basis:/);
});

test('text report: --explain adds the line of code and the sentences with their section and page', async () => {
  const r = await run(files, ['tests', '--explain']);
  assert.match(r.out, /^ {11}code: await page\.waitForTimeout\(500\);$/m);
  assert.match(r.out, /^ {11}basis: "Tests that wait for time are inherently flaky\." \(waitForTimeout, https:\/\/playwright\.dev\/docs\/api\/class-page#page-wait-for-timeout\)$/m);
});

test('text report: no findings, ignored findings and a configuration are said', async () => {
  const clean = await run({ 'a.spec.ts': `${PW}test('a', async ({ page }) => { await page.getByRole('button').click(); });\n` }, ['a.spec.ts']);
  assert.equal(clean.code, 0);
  assert.match(clean.out, /findings: 0 error, 0 warning, 0 info\n\nno findings\n\nGATE: PASS \(--fail-on error\)\n$/);
  const spec = `${PW}test('a', async ({ page }) => {\n  await page.waitForTimeout(5); // ui-test-smell-check-ignore fixed-wait -- a reason\n});\n`;
  const w = where(spec, 'waitForTimeout');
  const ignored = await run({ 'a.spec.ts': spec, 'c.json': '{"rules": {"nth-locator": "off"}}' }, ['a.spec.ts', '--config', 'c.json']);
  assert.equal(ignored.code, 0);
  assert.match(ignored.out, /rules: 10 rules on, off: nth-locator; fail level error; configuration c\.json/);
  assert.match(ignored.out, /findings: 0 error, 0 warning, 0 info; 1 ignored by a comment with a reason/);
  assert.ok(ignored.out.includes(`\nignored by a comment:\n  a.spec.ts:${w.line}:${w.column}  fixed-wait  -- a reason\n`));
});

test('markdown report: the summary line, the table of findings, the ignored table, the notes and the gate in bold', async () => {
  const r = await run(files, ['tests', '--format', 'markdown']);
  assert.match(r.out, /^## ui-test-smell-check: 1 error, 1 warning, 1 info$/m);
  assert.match(r.out, /^Input: tests\. Files: 2 files read/m);
  assert.match(r.out, /^\| Where \| Severity \| Rule \| Message \|$/m);
  assert.match(r.out, /^\| tests\/a\.spec\.ts:\d+:\d+ \| \*\*error\*\* \| fixed-wait \| waitForTimeout\(500\)/m);
  assert.match(r.out, /\*\*Gate failed:\*\* 1 error \(--fail-on error\)\./);
  const explain = await run(files, ['tests', '--format', 'markdown', '--explain']);
  assert.match(explain.out, /^\| Where \| Severity \| Rule \| Message \| Code \| Basis \|$/m);
  assert.match(explain.out, /\| await page\.locator\('\.btn'\)\.click\(\); \|/);
  const clean = await run({ 'a.spec.ts': `${PW}\n` }, ['a.spec.ts', '--format', 'markdown']);
  assert.match(clean.out, /\nNo findings\.\n\n\*\*Gate passed\*\* \(--fail-on error\)\.\n$/);
});

test('json report: the whole report, with the basis of every finding, and the same counts as the text', async () => {
  const r = await run(files, ['tests', '--format', 'json']);
  const j = JSON.parse(r.out);
  assert.equal(j.tool, 'ui-test-smell-check');
  assert.equal(j.version, VERSION);
  assert.deepEqual(j.inputs, ['tests']);
  assert.deepEqual(j.counts, { error: 1, warning: 1, info: 1 });
  assert.deepEqual(j.totals, { files: 2, read: 2, notRead: 0, uiTestFiles: 1, noFramework: 1, leftOut: 0, byFramework: { playwright: 1, cypress: 0, selenium: 0 } });
  assert.deepEqual(j.files, [{ file: 'tests/a.spec.ts', language: 'typescript', frameworks: ['playwright'], findings: 3, ignored: 0 }]);
  assert.deepEqual(Object.keys(j.findings[0]), ['file', 'line', 'column', 'rule', 'severity', 'framework', 'message', 'code', 'basis']);
  assert.deepEqual(j.findings[0].basis[0], { key: 'pwWaitFlaky', text: 'Tests that wait for time are inherently flaky.', section: 'waitForTimeout', source: 'https://playwright.dev/docs/api/class-page#page-wait-for-timeout' });
  assert.deepEqual(j.gate, { failOn: 'error', pass: false, reason: '1 error' });
  assert.equal(j.rules.length, 11);
  assert.equal(toJson(j), r.out);
});

test('exit codes: 0 under the fail level, 1 at or above it, from --fail-on or the configuration; --fail-on wins', async () => {
  const warnOnly = { 'a.spec.ts': `${PW}test('a', async ({ page }) => { await page.locator('.btn').click(); });\n` };
  assert.equal((await run(warnOnly, ['a.spec.ts'])).code, 0);
  assert.equal((await run(warnOnly, ['a.spec.ts', '--fail-on', 'warning'])).code, 1);
  assert.equal((await run({ ...warnOnly, 'c.json': '{"failOn": "warning"}' }, ['a.spec.ts', '--config', 'c.json'])).code, 1);
  assert.equal((await run({ ...warnOnly, 'c.json': '{"failOn": "warning"}' }, ['a.spec.ts', '--config', 'c.json', '--fail-on', 'error'])).code, 0);
  const infoOnly = { 'a.spec.ts': `${PW}test('a', async ({ page }) => { await rows.first().click(); });\n` };
  assert.equal((await run(infoOnly, ['a.spec.ts', '--fail-on', 'warning'])).code, 0);
  const info = await run(infoOnly, ['a.spec.ts', '--fail-on', 'info']);
  assert.equal(info.code, 1);
  assert.match(info.out, /GATE: FAIL - 1 info \(--fail-on info\)/);
});

test('exit code 2: usage errors, a missing path, a file of another language, a bad configuration; the problems go to standard error', async () => {
  for (const [argv, message] of [
    [[], /give at least one test file or folder/],
    [['x', '--format', 'xml'], /unknown format xml/],
    [['x', '--fail-on', 'fatal'], /--fail-on takes error, warning or info, not fatal/],
    [['x', '--wat'], /unknown argument --wat/],
    [['x', '--config'], /--config needs a value/],
    [['x', '--config', 'a', '--config', 'b'], /--config is given twice/],
    [['-'], /reading from standard input is not supported/],
    [['https://example.test/tests'], /never fetches a URL/],
    [['x', '--config', 'https://example.test/c.json'], /never fetches a URL/]
  ]) {
    const r = await cli(argv, root);
    assert.equal(r.code, 2, argv.join(' '));
    assert.match(r.err, message);
    assert.equal(r.out, '');
  }
  assert.match((await run({}, ['missing'])).err, /missing: no such file or folder/);
  assert.match((await run({ 'notes.txt': 'x' }, ['notes.txt'])).err, /notes\.txt: not a file the tool reads/);
  assert.match((await run({}, ['a', '--config', 'nope.json'])).err, /nope\.json: no such file/);
  const bad = await run({ 'a.spec.ts': PW, 'c.json': '{"rules": {"fixed-wiat": "off"}}' }, ['a.spec.ts', '--config', 'c.json']);
  assert.equal(bad.code, 2);
  assert.equal(bad.err, 'ui-test-smell-check: c.json:1: rules.fixed-wiat: is not a rule; did you mean fixed-wait?\n');
});

test('help and version: the usage names every rule and the exit codes; the version is the one of package.json', async () => {
  const help = await cli(['--help'], root);
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const id of ['fixed-wait', 'mixed-waits', 'position-selector', 'nth-locator', 'styling-selector', 'force-action', 'only-left', 'skipped-test', 'order-dependence', 'shared-state', 'absolute-url']) assert.ok(USAGE.includes(id), id);
  assert.match(USAGE, /Exit codes: 0 no finding at the fail level or above, 1 such a finding, 2 usage or input error\./);
  const version = await cli(['--version'], root);
  assert.equal(version.out, `${JSON.parse(await read('package.json')).version}\n`);
  assert.deepEqual(parseArgs(['a', 'b', '--explain', '-v']), { paths: ['a', 'b'], config: null, format: 'text', failOn: null, explain: true, help: false, version: true });
});

test('paths: shown relative to the base with forward slashes; a path outside is shown in full', () => {
  const base = resolve(root, 'examples');
  assert.equal(displayPath(resolve(base, 'shop/cypress/e2e/cart.cy.js'), base), 'shop/cypress/e2e/cart.cy.js');
  assert.equal(displayPath(base, base), '.');
  assert.ok(!displayPath(resolve(root, 'README.md'), base).includes('\\'));
  assert.ok(displayPath(resolve(root, 'README.md'), base).endsWith('/README.md'));
});

test('files: a folder is walked in name order without node_modules and .git; other files are counted', async () => {
  await withFiles({ 'b/z.spec.ts': PW, 'b/a.cy.js': 'cy.visit("/");\n', 'b/node_modules/x/y.js': 'x', 'b/.git/h.js': 'x', 'b/notes.md': 'x', 'b/deep/c.py': 'x = 1\n' }, async (dir) => {
    const r = await readInputs(['b'], dir);
    assert.deepEqual(r.files.map((f) => [f.file, f.language]), [['b/a.cy.js', 'javascript'], ['b/deep/c.py', 'python'], ['b/z.spec.ts', 'typescript']]);
    assert.deepEqual(r.skipped, ['b/.git', 'b/node_modules']);
    assert.equal(r.otherFiles, 1);
    const twice = await readInputs(['b', 'b/z.spec.ts'], dir);
    assert.equal(twice.files.length, 3, 'a file named twice is read once');
    const ignored = await readInputs(['b'], dir, FILE_LIMITS, ['b/deep/**']);
    assert.deepEqual(ignored.ignored, ['b/deep/c.py']);
    assert.equal((await readBounded(resolve(dir, 'b/z.spec.ts'))).toString(), PW);
    await assert.rejects(readBounded(resolve(dir, 'b')), /not a regular file/);
    await assert.rejects(readBounded(resolve(dir, 'nope')), /no such file/);
  });
});

test('files: text is UTF-8 without a byte order mark; UTF-16 and binary data are named, not read', () => {
  assert.equal(decodeText(Buffer.from([0xef, 0xbb, 0xbf, 0x61])), 'a');
  assert.throws(() => decodeText(Buffer.from([0xff, 0xfe, 0x61, 0])), /UTF-16/);
  assert.equal(isBinary(Buffer.from([0x61, 0, 0x62])), true);
  assert.equal(isBinary(Buffer.from('text')), false);
  assert.equal(fileError('a.ts', 'why').reason, 'why');
  assert.equal(fileError('a.ts', 'why').message, 'a.ts: why');
});

test('checkFiles and checkPaths: the same report from files read in memory and from disk', async () => {
  const mem = checkFiles({ inputs: ['tests'], files: [{ file: 'tests/a.spec.ts', language: 'typescript', size: SPEC.length, text: SPEC, reason: null }], links: [], skipped: [], special: [], otherFiles: 0, ignored: [] }, { version: VERSION });
  const disk = await withFiles({ 'tests/a.spec.ts': SPEC }, (dir) => checkPaths(['tests'], { base: dir, version: VERSION }));
  assert.deepEqual(disk, mem);
  assert.equal(LIMITS.maxListedPerRule, 1000);
});

test('the findings of a file with LF and with CRLF line ends are the same, with the same lines and columns', async () => {
  for (const name of await readdir(resolve(root, 'examples/shop/cypress/e2e'))) {
    const text = await read(`examples/shop/cypress/e2e/${name}`);
    const lf = await run({ [name]: text.replace(/\r\n/g, '\n') }, [name, '--format', 'json']);
    const crlf = await run({ [name]: text.replace(/\r?\n/g, '\r\n') }, [name, '--format', 'json']);
    assert.deepEqual(JSON.parse(crlf.out).findings, JSON.parse(lf.out).findings, name);
    assert.ok(JSON.parse(lf.out).findings.length > 0, name);
  }
});

test('the examples: the output files are the real output of the tool, in every format', async () => {
  const shop = ['examples/shop', '--config', 'examples/config.json'];
  for (const [argv, file] of [[shop, 'shop.txt'], [[...shop, '--explain'], 'shop-explain.txt'], [[...shop, '--format', 'markdown', '--explain'], 'shop.md'], [[...shop, '--format', 'json', '--explain'], 'shop.json'], [['examples/shop/playwright/product.spec.ts'], 'clean.txt']]) {
    const r = await inRoot(argv);
    assert.equal(r.out, await read(`examples/output/${file}`), file);
    assert.equal(r.code, file === 'clean.txt' ? 0 : 1, file);
  }
  assert.deepEqual((await readdir(resolve(root, 'examples/output'))).sort(), ['clean.txt', 'shop-explain.txt', 'shop.json', 'shop.md', 'shop.txt']);
});

test('the examples: every rule is reported at least once in the shop, and the clean file holds comments and strings that look like smells', async () => {
  const j = JSON.parse(await read('examples/output/shop.json'));
  const rules = new Set(j.findings.map((f) => f.rule));
  for (const id of j.rules.map((r) => r.id)) assert.ok(rules.has(id), id);
  assert.deepEqual(j.totals.byFramework, { playwright: 4, cypress: 2, selenium: 3 });
  assert.equal(j.ignored.length, 1);
  const clean = await read('examples/shop/playwright/product.spec.ts');
  assert.ok(clean.includes('page.waitForTimeout(500) is not code'));
  assert.ok(clean.includes('div:nth-child(2) > .css-1q2w3e4'));
  const legacy = await read('examples/shop/playwright/legacy/old-cart.spec.ts');
  assert.ok(legacy.includes(`test.${ONLY}(`));
});

test('helpers of the reports: numbers, sizes, lists, Markdown cells, clean text and lines', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(plural(1, 'file'), '1 file');
  assert.equal(plural(2, 'entry', 'entries'), '2 entries');
  assert.equal(listText(['a']), 'a');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e'], 3), 'a, b, c and 2 more');
  assert.equal(parseSize('2M'), 2097152);
  assert.equal(parseSize('0x400'), 1024);
  assert.equal(parseSize('lots'), null);
  assert.equal(sizeText(2097152), '2 MB');
  assert.equal(sizeText(1536), '1,536 bytes');
  assert.equal(mdCell('a|b [c](d) `e` *f* _g_ <h> & \\ \n'), 'a\\|b \\[c\\](d) \\`e\\` \\*f\\* \\_g\\_ &lt;h&gt; &amp; \\\\  ');
  assert.equal(safeText(`a${String.fromCharCode(27)}b${String.fromCharCode(0x202e)}c`), 'a b c');
  assert.equal(safeText('x'.repeat(50), 10), 'xxxxxxx...');
  const t = 'one\r\ntwo\rthree\n';
  assert.deepEqual(lineStarts(t), [0, 5, 9, 15]);
  assert.equal(lineText(t, lineStarts(t), 2), 'two');
  assert.equal(lineText(t, lineStarts(t), 9), '');
  assert.ok(toText && toMarkdown);
});
