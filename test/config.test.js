import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, GLOB_LIMITS, JSON_LIMITS, JsonError, LIMIT_KEYS, OPTION_RANGES, RULES, defaultSettings, globProblem, jsonProblem, matchGlob, matchesAny, parseConfig, parseJson, validateConfig } from '../src/index.js';
import { where } from './helpers.js';

// The configuration file and the readers behind it: the strict JSON reader, the checks of every key, and the globs of
// the ignore list.

const problems = (text) => {
  try {
    parseConfig(text, 'c.json');
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.problems;
  }
  assert.fail('the configuration was accepted');
};

test('config: the defaults are every rule on, at its own severity, with its own options', () => {
  const d = defaultSettings();
  assert.deepEqual(Object.keys(d), RULES.map((r) => r.id));
  assert.deepEqual(d['fixed-wait'], { on: true, severity: 'error', options: { minMs: 0 } });
  assert.deepEqual(d['styling-selector'].options, { hashMinLength: 5 });
  const empty = parseConfig('{}');
  assert.deepEqual(empty, { failOn: null, settings: d, ignore: [], limits: {} });
});

test('config: a full configuration is read into settings, the fail level, the ignore list and the limits', () => {
  const c = parseConfig(JSON.stringify({
    failOn: 'warning',
    rules: { 'nth-locator': 'warning', 'absolute-url': 'off', 'fixed-wait': { severity: 'error', minMs: 100 }, 'styling-selector': { hashMinLength: 6 }, 'skipped-test': { severity: 'off' } },
    ignore: ['./tests/legacy/**', '**/*.fixtures.ts'],
    limits: { maxFileBytes: 4096, maxFiles: 10, maxDepth: 4 }
  }));
  assert.equal(c.failOn, 'warning');
  assert.equal(c.settings['nth-locator'].severity, 'warning');
  assert.equal(c.settings['absolute-url'].on, false);
  assert.equal(c.settings['skipped-test'].on, false);
  assert.deepEqual(c.settings['fixed-wait'], { on: true, severity: 'error', options: { minMs: 100 } });
  assert.equal(c.settings['styling-selector'].options.hashMinLength, 6);
  assert.deepEqual(c.ignore, ['tests/legacy/**', '**/*.fixtures.ts']);
  assert.deepEqual(c.limits, { maxFileBytes: 4096, maxFiles: 10, maxDepth: 4 });
});

test('config: an unknown key at any level is an error with its line and the nearest known key', () => {
  const p = problems('{\n  "failOn": "error",\n  "rules": {\n    "fixed-wiat": "off",\n    "fixed-wait": { "minMS": 5 }\n  },\n  "ignored": []\n}');
  assert.deepEqual(p, [
    'c.json:7: ignored: is not a key of the configuration; did you mean ignore?',
    'c.json:4: rules.fixed-wiat: is not a rule; did you mean fixed-wait?',
    'c.json:5: rules.fixed-wait.minMS: is not a setting of fixed-wait; did you mean minMs?'
  ]);
  assert.match(problems('{"limits": {"maxBytes": 5}}')[0], /limits\.maxBytes: is not a limit; did you mean maxFiles\?/);
  assert.match(problems('{"zzzzzzzzzzzz": 1}')[0], /the keys are failOn, rules, ignore, limits/);
});

test('config: a key named twice is refused, as RFC 8259 leaves its meaning open', () => {
  const text = '{\n  "rules": { "fixed-wait": "off", "fixed-wait": "error" }\n}';
  const p = problems(text);
  const second = where(text, '"fixed-wait"', 2);
  assert.equal(p.length, 1);
  assert.ok(p[0].startsWith(`c.json: line ${second.line}, column ${second.column}: the name "fixed-wait" appears twice in one object`), p[0]);
});

test('config: values out of range or of the wrong kind are errors; every problem is listed at once', () => {
  const p = problems(JSON.stringify({ failOn: 'off', rules: { 'fixed-wait': { minMs: -1 }, 'styling-selector': { hashMinLength: 2.5 }, 'only-left': 'fatal', 'nth-locator': 3, 'force-action': { severity: 'none' } }, ignore: 'x', limits: { maxDepth: 0 } }));
  assert.deepEqual(p.map((x) => x.replace(/^c\.json(?::\d+)?: /, '')), [
    'failOn: must be error, warning or info, not "off"',
    'rules.fixed-wait.minMs: must be a whole number from 0 to 86,400,000, not -1',
    'rules.styling-selector.hashMinLength: must be a whole number from 3 to 64, not 2.5',
    'rules.only-left: must be error, warning, info or off, not "fatal"',
    'rules.nth-locator: must be off, a severity or an object with severity and the options of the rule, not a number',
    'rules.force-action.severity: must be error, warning, info or off, not "none"',
    'ignore: must be a list of file patterns, not a string',
    'limits.maxDepth: must be a whole number from 1 to 256, not 0'
  ]);
  assert.match(problems('[]')[0], /must be a JSON object, not a list/);
  assert.match(problems('{"rules": []}')[0], /rules: must be an object of rule ids, not a list/);
  assert.match(problems('{"limits": null}')[0], /limits: must be an object, not null/);
  assert.match(problems('{"ignore": ["a\\\\b", "/abs", ""]}').join('\n'), /holds a backslash[\s\S]*starts with a slash[\s\S]*is empty/);
  assert.match(problems(JSON.stringify({ ignore: Array.from({ length: GLOB_LIMITS.maxPatterns + 1 }, () => 'a') }))[0], /holds more than 100 patterns/);
  assert.match(problems('{"failOn": "error",}')[0], /no trailing comma/);
  assert.deepEqual(Object.keys(OPTION_RANGES), ['minMs', 'hashMinLength']);
  assert.deepEqual(Object.keys(LIMIT_KEYS), ['maxFileBytes', 'maxFiles', 'maxDepth']);
});

test('config: __proto__ and constructor are only names', () => {
  const p = problems('{"__proto__": {"x": 1}, "rules": {"constructor": "off", "__proto__": "off"}}');
  assert.equal(p.length, 3);
  assert.equal({}.x, undefined);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
  assert.throws(() => validateConfig({ rules: { toString: 'off' } }), /rules\.toString: is not a rule/);
});

test('json: the strict reader keeps the line of every value and refuses what JSON does not have', () => {
  const { value, lines } = parseJson('{\n  "a": [1, {"b": true}],\n  "c": null\n}');
  assert.deepEqual(value, { a: [1, { b: true }], c: null });
  assert.equal(lines.get('a[1].b'), 2);
  assert.equal(lines.get('c'), 3);
  for (const [text, reason] of [['{"a": 1,}', /trailing comma/], ["{'a': 1}", /double quotes/], ['{"a": NaN}', /where a value was expected/], ['// x\n{}', /comment/], ['{"a": "\u0001"}'.replace('\\u0001', String.fromCharCode(1)), /control character/], ['{"a": 1} x', /text after the end/], ['{"a": 1e999}', /too large/], ['"\\x"', /escape \\x/]]) {
    assert.throws(() => parseJson(text), (e) => e instanceof JsonError && reason.test(e.reason), text);
  }
  assert.throws(() => parseJson(`${'['.repeat(40)}${']'.repeat(40)}`), /nested more than 32 deep/);
  assert.equal(JSON_LIMITS.maxDepth, 32);
  try {
    parseJson('{\n "a": tru }');
  } catch (error) {
    assert.equal(jsonProblem(error, '{\n "a": tru }'), 'line 2, column 7: the character "t" where a value was expected');
  }
  assert.equal(jsonProblem(new Error('plain'), ''), 'plain');
});

test('glob: *, ? and ** with forward slashes, and a reason for a pattern that cannot be used', () => {
  assert.ok(matchGlob('tests/legacy/**', 'tests/legacy/a/b.spec.ts'));
  assert.ok(matchGlob('tests/legacy/**', 'tests/legacy'));
  assert.ok(matchGlob('**/*.cy.js', 'cypress/e2e/cart.cy.js'));
  assert.ok(matchGlob('src/?.ts', 'src/a.ts'));
  assert.ok(!matchGlob('src/?.ts', 'src/ab.ts'));
  assert.ok(!matchGlob('*.ts', 'a/b.ts'));
  assert.ok(matchesAny(['x/**', '*.py'], 'test_a.py'));
  assert.equal(globProblem('ok/**'), null);
  assert.match(globProblem('a\\b'), /backslash/);
  assert.match(globProblem('x'.repeat(201)), /longer than 200/);
  assert.match(globProblem(Array(20).fill('a').join('/')), /more than 16 parts/);
  const start = Date.now();
  assert.ok(!matchGlob(`${'*a'.repeat(40)}b`, 'a'.repeat(190)));
  assert.ok(Date.now() - start < 3000);
});
