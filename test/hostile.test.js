import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIMITS, analyseText, checkFiles, main, readInputs, structure, lex, toMarkdown, toText, toJson } from '../src/index.js';
import { PW, analyse, find, run, where, withFiles } from './helpers.js';

// Hostile input: a test file that tries to run, to make the tool read another file, to exhaust the memory or the time,
// to lead the tool out of the folder or round in a loop, to rewrite the terminal, to break a table or to change how
// objects behave. Each test also checks the time, because work that grows faster than the input is a failure even when
// the answer is right. Tests that need a symbolic link, a device or a special file name are guarded with
// process.platform, and none of them asserts a line or a column: those are asserted in the tests that run everywhere.

const LIMIT = { timeout: 60000 };
const fast = async (fn, ms = 5000) => {
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < ms, `took ${Date.now() - start} ms`);
  return result;
};
const quiet = { out: () => {}, err: () => {} };

test('hostile: a test file is never run or imported, whatever its top-level code does or imports', LIMIT, async () => {
  const marker = 'ran-a-test.txt';
  const code = `import './secret.js';\nimport { test } from '@playwright/test';\nrequire('fs').writeFileSync('${marker}', 'x');\nprocess.exit(3);\ntest('a', async ({ page }) => { await page.waitForTimeout(5); });\n`;
  await withFiles({ 'tests/a.spec.js': code, 'secret.js': "export const secret = 'TOP-SECRET-CONTENT';\n" }, async (dir) => {
    let out = '';
    const exit = await main(['tests', '--format', 'json'], { out: (t) => { out += t; }, err: () => {} }, undefined, dir);
    assert.equal(exit, 1, 'the wait is found and the process did not exit with 3');
    assert.ok(!out.includes('TOP-SECRET-CONTENT'));
    await assert.rejects(access(resolve(dir, marker)), 'no file was written');
    await assert.rejects(access(resolve(dir, 'tests', marker)));
  });
});

test('hostile: a file over the size limit, a binary file and a UTF-16 file are named in a note and not read', LIMIT, async () => {
  await withFiles({ 'a.spec.ts': `${PW}${'// filler\n'.repeat(200)}`, 'b.spec.ts': PW }, async (dir) => {
    await writeFile(resolve(dir, 'bin.spec.ts'), Buffer.from([0x69, 0x6d, 0x00, 0x01]));
    await writeFile(resolve(dir, 'wide.spec.ts'), Buffer.from([0xff, 0xfe, 0x69, 0x00]));
    let out = '';
    const code = await main(['.', '--format', 'json'], { out: (t) => { out += t; }, err: () => {} }, { ...LIMITS, maxFileBytes: 1024 }, dir);
    assert.equal(code, 0);
    const r = JSON.parse(out);
    assert.deepEqual(r.unreadable.map((u) => [u.file, u.reason.replace(/[0-9,]+ bytes/, 'N bytes')]), [['a.spec.ts', 'N bytes is over the 1,024 byte limit'], ['bin.spec.ts', 'holds binary data (a null byte)'], ['wide.spec.ts', 'is UTF-16; only UTF-8 is read']]);
    assert.ok(r.notes.some((n) => n.startsWith('not read: bin.spec.ts')));
  });
});

test('hostile: the limits of the input refuse it with exit code 2 rather than read it in part', LIMIT, async () => {
  await withFiles({ 'r/a/b/c/d/e.spec.ts': PW, 'r/f.spec.ts': PW, 'r/g.spec.ts': PW }, async (dir) => {
    for (const [limits, message] of [[{ maxEntries: 3 }, /the folders hold more than 3 files and folders/], [{ maxDepth: 2 }, /has folders nested more than 2 deep/], [{ maxFiles: 2 }, /more than 2 files to read/], [{ maxTotalBytes: 10 }, /the files to read hold more than 10 byte/], [{ maxInputs: 0 }, /more than 0 paths/]]) {
      let err = '';
      assert.equal(await main(['r'], { out: () => {}, err: (t) => { err += t; } }, { ...LIMITS, ...limits }, dir), 2);
      assert.match(err, message);
    }
    let err = '';
    await writeFile(resolve(dir, 'c.json'), '{"limits": {"maxFiles": 1}}');
    assert.equal(await main(['r', '--config', 'c.json'], { out: () => {}, err: (t) => { err += t; } }, undefined, dir), 2);
    assert.match(err, /more than 1 files to read; give the test folders only, or raise limits\.maxFiles/);
  });
});

test('hostile: strings, comments, template literals and regular expressions that never end are read in one pass and named with their place', LIMIT, async () => {
  for (const [code, reason] of [[`${PW}const s = '${'x'.repeat(300000)}`, /a string that is not closed/], [`${PW}/*${'*'.repeat(300000)}`, /a comment that is not closed/], [`${PW}const t = \`${'$'.repeat(300000)}`, /a template literal that is not closed/], [`${PW}x = /${'['.repeat(300000)}`, /a regular expression that is not closed/], [`${PW}x(\`\${${'('.repeat(100000)}`, /not closed/]]) {
    const r = await fast(() => analyseText(code, { file: 'a.spec.ts', language: 'typescript' }), 3000);
    assert.match(r.reason, reason);
    assert.equal(r.findings.length, 0);
  }
  const unclosed = `${PW}test('a', () => {\n  const s = 'open;\n});\n`;
  const at = where(unclosed, "'open");
  assert.equal(analyseText(unclosed, { file: 'a.spec.ts', language: 'typescript' }).reason, `line ${at.line}, column ${at.column}: a string that is not closed before the end of its line`);
  for (const [code, language] of [[`x = '''${'a'.repeat(300000)}`, 'python'], [`String s = """${'a'.repeat(300000)}`, 'java'], [`/*${'*'.repeat(300000)}`, 'java']]) {
    const r = await fast(() => analyseText(code, { file: 'x', language }), 3000);
    assert.match(r.reason, /not closed/);
  }
});

test('hostile: nesting a hundred thousand deep is refused or read in linear time, never with a stack overflow', LIMIT, async () => {
  const templates = `${PW}${'`${'.repeat(100000)}x${'}`'.repeat(100000)}`;
  const t = await fast(() => analyseText(templates, { file: 'a.spec.ts', language: 'typescript' }), 3000);
  assert.match(t.reason, /nested more than 128 deep/);
  const brackets = `${PW}test('a', async ({ page }) => { f(${'g('.repeat(100000)}page.waitForTimeout(1)${')'.repeat(100000)}); });`;
  const b = await fast(() => analyseText(brackets, { file: 'a.spec.ts', language: 'typescript' }), 5000);
  assert.equal(b.reason, null);
  assert.equal(find(b, 'fixed-wait').length, 1);
  const tokens = lex(`f(${'['.repeat(200000)}`, 'javascript').tokens;
  const s = await fast(() => structure(tokens), 3000);
  assert.equal(s.match[1], -1);
});

test('hostile: thousands of < in a .tsx file stay linear: failed attempts at JSX have a budget', LIMIT, async () => {
  for (const body of ['<a '.repeat(60000), '<a>'.repeat(60000), `<a>${'x'.repeat(100000)}`.repeat(5), '<a b={'.repeat(20000)]) {
    await fast(() => analyseText(`${PW}const x = ${body}`, { file: 'a.spec.tsx', language: 'typescript' }), 5000);
  }
});

test('hostile: many findings of one kind are capped at 1,000 listed, and all are counted', LIMIT, async () => {
  const code = `${PW}test('a', async ({ page }) => {\n${'  await page.waitForTimeout(1);\n'.repeat(1500)}});\n`;
  const read = { inputs: ['a.spec.ts'], files: [{ file: 'a.spec.ts', language: 'typescript', size: code.length, text: code, reason: null }], links: [], skipped: [], special: [], otherFiles: 0, ignored: [] };
  const r = await fast(() => checkFiles(read), 5000);
  assert.equal(r.findings.length, 1000);
  assert.equal(r.counts.error, 1500);
  assert.ok(r.notes.includes('500 more findings of fixed-wait are counted but not listed'));
  assert.equal(r.gate.reason, '1,500 errors');
});

test('hostile: a file of a million tokens is read in linear time, and the token limit refuses a bigger one', LIMIT, async () => {
  const code = `${PW}${'a;'.repeat(400000)}`;
  const r = await fast(() => analyseText(code, { file: 'a.spec.ts', language: 'typescript' }), 10000);
  assert.equal(r.reason, null);
  const over = await fast(() => analyseText(code, { file: 'a.spec.ts', language: 'typescript', limits: { ...LIMITS, maxTokens: 1000 } }));
  assert.match(over.reason, /more than 1,000 tokens/);
});

test('hostile: a very long selector is not read as one, and a long near miss ends quickly', LIMIT, async () => {
  const long = `${PW}test('a', async ({ page }) => { await page.locator('${'.a'.repeat(6000)}:nth-child(2)').click(); });`;
  const r = await fast(() => analyse(long));
  assert.deepEqual(find(r, 'position-selector'), []);
  const near = `${PW}test('a', async ({ page }) => { await page.locator('${'['.repeat(4000)}${'('.repeat(4000)}').click(); });`;
  await fast(() => analyse(near), 3000);
});

test('hostile: control, direction and line separator characters in a file name, a selector or a line of code are cleaned in every format', LIMIT, () => {
  const bad = ['x', String.fromCharCode(27), '[31m', String.fromCharCode(0x202e), 'y', String.fromCharCode(0x2028), 'z', String.fromCharCode(0x85)].join('');
  const code = `${PW}test('a', async ({ page }) => { await page.locator('.c${bad}').click(); await page.waitForTimeout(1); });`;
  const read = { inputs: [`${bad}.spec.ts`], files: [{ file: `${bad}.spec.ts`, language: 'typescript', size: code.length, text: code, reason: null }], links: [], skipped: [], special: [], otherFiles: 0, ignored: [] };
  const r = checkFiles(read);
  assert.ok(r.findings.length >= 1);
  for (const o of [toText(r, { explain: true }), toMarkdown(r, { explain: true }), toJson(r)]) {
    for (const c of [27, 0x202e, 0x2028, 0x85]) assert.ok(!o.includes(String.fromCharCode(c)), `character ${c}`);
  }
});

test('hostile: a selector that holds a link, a tag or a pipe cannot break a Markdown table', LIMIT, () => {
  const code = `${PW}test('a', async ({ page }) => { await page.locator('.x|y <script>[click](https://evil.example.test) \`z\`').click(); });`;
  const read = { inputs: ['a.spec.ts'], files: [{ file: 'a.spec.ts', language: 'typescript', size: code.length, text: code, reason: null }], links: [], skipped: [], special: [], otherFiles: 0, ignored: [] };
  const md = toMarkdown(checkFiles(read), { explain: true });
  assert.ok(!md.includes('<script>'));
  assert.ok(!md.includes('[click]('));
  for (const row of md.split('\n').filter((l) => l.startsWith('| a.spec.ts'))) assert.equal(row.replace(/\\\|/g, '').split('|').length, 8, row.slice(0, 80));
});

test('hostile: names such as __proto__, constructor and toString in code and selectors are only names', LIMIT, () => {
  const code = `${PW}let __proto__;\nlet constructor;\ntest('a', async ({ page }) => {\n  __proto__ = 1;\n  constructor = 2;\n  await page.locator('.__proto__.constructor').click();\n  hasOwnProperty.waitForTimeout(1);\n});\n`;
  const r = analyse(code);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
  assert.deepEqual(find(r, 'shared-state').map((f) => f.message.split(',')[0]), ['the test assigns __proto__', 'the test assigns constructor']);
  assert.equal(find(r, 'styling-selector').length, 1);
  assert.equal(find(r, 'fixed-wait').length, 1);
});

test('hostile: an argument that is a URL, a very long path, or a path with control characters is refused cleanly', LIMIT, async () => {
  const url = await run({}, ['https://example.test/tests']);
  assert.equal(url.code, 2);
  assert.match(url.err, /never fetches a URL/);
  const long = await run({}, [`${'a'.repeat(5000)}.spec.ts`]);
  assert.equal(long.code, 2);
  assert.ok(long.err.length < 8000);
  const control = await run({}, [`x${String.fromCharCode(27)}[31m.spec.ts`]);
  assert.equal(control.code, 2);
  assert.ok(!control.err.includes(String.fromCharCode(27)));
});

test('hostile: a symbolic link to a folder outside, a link to a file and a link loop are listed and never followed', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('creating a symbolic link needs a privilege on Windows');
    return;
  }
  const smelly = `${PW}test('a', async ({ page }) => { await page.waitForTimeout(1); });\n`;
  await withFiles({ 'outside/secret.spec.ts': smelly, 'tests/a.spec.ts': PW }, async (dir) => {
    await symlink(resolve(dir, 'outside'), resolve(dir, 'tests/escape'));
    await mkdir(resolve(dir, 'tests/more'));
    await symlink(resolve(dir, 'outside/secret.spec.ts'), resolve(dir, 'tests/more/linked.spec.ts'));
    await symlink(resolve(dir, 'tests'), resolve(dir, 'tests/loop'));
    let out = '';
    const code = await fast(() => main(['tests', '--format', 'json'], { out: (x) => { out += x; }, err: () => {} }, undefined, dir));
    assert.equal(code, 0, 'the smelly test outside the folder was not read');
    const r = JSON.parse(out);
    assert.equal(r.totals.files, 1);
    assert.ok(r.notes.some((n) => /3 symbolic links were not followed: tests\/escape, tests\/loop and tests\/more\/linked\.spec\.ts/.test(n)));
  });
});

test('hostile: a folder or a file named on the command line may itself be a link, because the person named it', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('creating a symbolic link needs a privilege on Windows');
    return;
  }
  const smelly = `${PW}test('a', async ({ page }) => { await page.waitForTimeout(1); });\n`;
  await withFiles({ 'real/a.spec.ts': smelly }, async (dir) => {
    await symlink(resolve(dir, 'real'), resolve(dir, 'named'));
    await symlink(resolve(dir, 'real/a.spec.ts'), resolve(dir, 'one.spec.ts'));
    assert.equal(await main(['named'], quiet, undefined, dir), 1);
    assert.equal(await main(['one.spec.ts'], quiet, undefined, dir), 1);
  });
});

test('hostile: a device behind a link inside the folder is never opened', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('there is no device file to link to on Windows');
    return;
  }
  await withFiles({ 'tests/a.spec.ts': PW }, async (dir) => {
    await symlink('/dev/zero', resolve(dir, 'tests/zero.spec.ts'));
    const r = await fast(() => readInputs(['tests'], dir));
    assert.deepEqual(r.links, ['tests/zero.spec.ts']);
    assert.equal(r.files.length, 1);
  });
});

test('hostile: a file name with control characters is cleaned in the report, where the system allows such a name', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows does not allow a control character in a file name');
    return;
  }
  const name = `tests/evil${String.fromCharCode(27)}[31m.spec.ts`;
  let r;
  try {
    r = await run({ [name]: `${PW}test('a', async ({ page }) => { await page.waitForTimeout(1); });\n` }, ['tests']);
  } catch (error) {
    if (!['EINVAL', 'EILSEQ', 'ENOENT', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    t.skip(`this file system does not allow the name (${error.code})`);
    return;
  }
  assert.equal(r.code, 1);
  assert.ok(!r.out.includes(String.fromCharCode(27)));
});

test('hostile: on Windows a path written with backslashes is read and shown with forward slashes', LIMIT, async (t) => {
  if (process.platform !== 'win32') {
    t.skip('a backslash separates folders only on Windows');
    return;
  }
  await withFiles({ 'tests/e2e/a.spec.ts': `${PW}test('a', async ({ page }) => { await page.waitForTimeout(1); });\n` }, async (dir) => {
    let out = '';
    assert.equal(await main(['tests\\e2e', '--format', 'json'], { out: (x) => { out += x; }, err: () => {} }, undefined, dir), 1);
    const r = JSON.parse(out);
    assert.deepEqual(r.inputs, ['tests/e2e']);
    assert.equal(r.findings[0].file, 'tests/e2e/a.spec.ts');
  });
});
