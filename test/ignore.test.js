import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IGNORE_MARKER, lex, lineStarts, readIgnores } from '../src/index.js';
import { PW, SE_PY, analyse, find, where } from './helpers.js';

// Ignore comments: one line, named rules, and a reason that is required.

test('ignore: a comment alone on its line applies to the next line with code, and the finding is listed with its reason', () => {
  const code = `${PW}test('a', async ({ page }) => {\n  // ${IGNORE_MARKER} fixed-wait -- the panel slides in with a CSS transition\n\n  await page.waitForTimeout(300);\n  await page.waitForTimeout(400);\n});\n`;
  const r = analyse(code);
  assert.equal(find(r, 'fixed-wait').length, 1);
  assert.equal(find(r, 'fixed-wait')[0].line, where(code, 'waitForTimeout(400)').line);
  assert.equal(r.ignored.length, 1);
  assert.deepEqual(r.ignored[0], { file: 'a.spec.ts', ...where(code, 'waitForTimeout(300)'), rule: 'fixed-wait', framework: 'playwright', reason: 'the panel slides in with a CSS transition', commentLine: where(code, IGNORE_MARKER).line });
  assert.deepEqual(r.problems, []);
});

test('ignore: a comment after code applies to its own line, for every rule it names and no other', () => {
  const code = `${PW}test('a', async ({ page }) => {\n  await page.locator('.grid .row:nth-child(2)').click({ force: true }); // ${IGNORE_MARKER} styling-selector, position-selector -- vendor grid with no test ids\n});\n`;
  const r = analyse(code);
  assert.deepEqual(r.findings.map((f) => f.rule), ['force-action']);
  assert.deepEqual(r.ignored.map((x) => x.rule).sort(), ['position-selector', 'styling-selector']);
});

test('ignore: a block comment works the same way, and a Python comment too', () => {
  const code = `${PW}test('a', async ({ page }) => {\n  /* ${IGNORE_MARKER} fixed-wait -- the chart has\n     no event to wait for */\n  await page.waitForTimeout(300);\n});\n`;
  const r = analyse(code);
  assert.equal(r.findings.length, 0);
  assert.equal(r.ignored[0].reason, 'the chart has no event to wait for');
  const py = `${SE_PY}import time\n\ndef test_a(driver):\n    time.sleep(1)  # ${IGNORE_MARKER} fixed-wait -- the mail stub polls once a second\n`;
  assert.equal(analyse(py, 'test_a.py').ignored.length, 1);
});

test('ignore: no reason, an unknown rule or no rule leaves the finding, and a note says why', () => {
  const code = `${PW}test('a', async ({ page }) => {\n  await page.waitForTimeout(1); // ${IGNORE_MARKER} fixed-wait\n  await page.waitForTimeout(2); // ${IGNORE_MARKER} fixed-wait -- 42\n  await page.waitForTimeout(3); // ${IGNORE_MARKER} fixed-wiat -- typo\n  await page.waitForTimeout(4); // ${IGNORE_MARKER}\n  await page.waitForTimeout(5); // ${IGNORE_MARKER}-not-the-marker fixed-wait -- x\n});\n`;
  const r = analyse(code);
  assert.equal(find(r, 'fixed-wait').length, 5);
  assert.equal(r.ignored.length, 0);
  const first = where(code, `// ${IGNORE_MARKER}`);
  assert.deepEqual(r.problems, [
    `a.spec.ts:${first.line}:${first.column}: the ignore comment for fixed-wait gives no reason; write one after -- (it is not applied)`,
    `a.spec.ts:${first.line + 1}:${first.column}: the ignore comment for fixed-wait gives no reason; write one after -- (it is not applied)`,
    `a.spec.ts:${first.line + 2}:${first.column}: the ignore comment names a rule the tool does not have: fixed-wiat; it is not applied`,
    `a.spec.ts:${first.line + 3}:${first.column}: the ignore comment names no rule; write the rule id after it`
  ]);
});

test('ignore: a comment that ignores nothing, or that no code follows, is named in a note', () => {
  const code = `${PW}// ${IGNORE_MARKER} only-left -- kept while the cart is rebuilt\ntest('a', async () => {});\n// ${IGNORE_MARKER} fixed-wait -- at the end\n`;
  const r = analyse(code);
  assert.deepEqual(r.problems, [
    `a.spec.ts:${where(code, IGNORE_MARKER, 2).line}:1: the ignore comment for fixed-wait is followed by no code; it applies to nothing`,
    `a.spec.ts:${where(code, IGNORE_MARKER).line}: the ignore comment for only-left matched no finding`
  ]);
});

test('ignore: readIgnores maps each comment to the line it applies to', () => {
  const code = `a();\n// ${IGNORE_MARKER} fixed-wait -- one\n\nb(); // ${IGNORE_MARKER} nth-locator, only-left -- two\n`;
  const { tokens, comments } = lex(code, 'javascript');
  const { byLine, problems } = readIgnores(comments, tokens, lineStarts(code));
  assert.deepEqual(problems, []);
  assert.deepEqual([...byLine.keys()], [4]);
  assert.deepEqual(byLine.get(4).map((c) => [[...c.rules], c.reason, c.line]), [[['fixed-wait'], 'one', 2], [['nth-locator', 'only-left'], 'two', 4]]);
});
