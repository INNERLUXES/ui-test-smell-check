import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEX_LIMITS, LexError, NAME, cook, isLineEnd, isSpace, lex, lexJava, lexJs, lexPython, numberValue, tokenStore } from '../src/index.js';
import { ONLY } from './helpers.js';

// The lexers: what is a comment, what is a string, what is code. Each test writes the code inline and looks at the
// tokens, so a mistake shows as the wrong token, not as a missing finding somewhere else.

const js = (code, jsx = false) => lex(code, 'javascript', { jsx });
const kinds = (r) => r.tokens.map((t) => `${t.type}:${t.value}`);
const names = (r) => r.tokens.filter((t) => t.type === 'name').map((t) => t.value);
const strings = (r) => r.tokens.filter((t) => t.type === 'str' || t.type === 'tmpl' || t.type.startsWith('tmpl-')).map((t) => t.value);
const throwsAt = (fn, reason, offset) => assert.throws(fn, (e) => e instanceof LexError && reason.test(e.reason) && (offset === undefined || e.offset === offset));

test('javascript: line comments, block comments and a hashbang are comments, not code', () => {
  const r = js(`#!/usr/bin/env node\na(); // page.waitForTimeout(500)\n/* cy.wait(1000)\n   test.${ONLY}( */ b();`);
  assert.deepEqual(names(r), ['a', 'b']);
  assert.deepEqual(r.comments.map((c) => c.text.trim()), ['/usr/bin/env node', 'page.waitForTimeout(500)', `cy.wait(1000)\n   test.${ONLY}(`]);
  assert.equal(r.comments[2].block, true);
  assert.equal(r.tokens.find((t) => t.value === 'b').nl, true, 'a block comment over two lines ends a line');
});

test('javascript: strings in both quotes with their escapes; a comment marker inside a string is text', () => {
  const r = js(String.raw`x('// not a comment', "it's", 'a\'b', "li:nth-child\x282)", 'A\u{42}', 'line\
joined')`);
  assert.deepEqual(strings(r), ['// not a comment', "it's", "a'b", 'li:nth-child(2)', 'AB', 'linejoined']);
  assert.equal(r.comments.length, 0);
});

test('javascript: a string not closed before the end of its line stops with its place', () => {
  throwsAt(() => js("a('open\nb')"), /not closed before the end of its line/, 2);
  throwsAt(() => js("a('open"), /not closed/, 2);
});

test('javascript: template literals: static parts are strings, the code of ${...} is code, nested as deep as written', () => {
  const r = js('`a ${ page.waitForTimeout(5) } b ${ `c ${ d } e` } f` + `plain ${"}"} g`');
  assert.deepEqual(kinds(r).slice(0, 8), ['tmpl-head:a ', 'name:page', 'punct:.', 'name:waitForTimeout', 'punct:(', 'num:5', 'punct:)', 'tmpl-middle: b ']);
  assert.deepEqual(strings(r), ['a ', ' b ', 'c ', ' e', ' f', 'plain ', '}', ' g']);
  assert.deepEqual(kinds(js('`no ${"code"} // here`')), ['tmpl-head:no ', 'str:code', 'tmpl-tail: // here']);
  assert.deepEqual(kinds(js('`just text, // and ${"x"}`')).length, 3);
  assert.deepEqual(kinds(js('`\\${not} a substitution`')), ['tmpl:${not} a substitution']);
  assert.deepEqual(kinds(js('`${ {a: 1}.a }`')), ['tmpl-head:', 'punct:{', 'name:a', 'punct::', 'num:1', 'punct:}', 'punct:.', 'name:a', 'tmpl-tail:']);
});

test('javascript: a template literal or a ${ that is not closed stops with its place', () => {
  throwsAt(() => js('a(`open'), /template literal that is not closed/, 2);
  throwsAt(() => js('a(`x ${ b'), /\$\{ or \{ that is not closed/, 6);
});

test('javascript: regular expression literals hold quotes, slashes and comment markers; division is division', () => {
  const r = js("x = /['\"]/.test(s) && /https?:\\/\\//.test(u) && /[/]x/g; y = a / b / c; z = (a) / 2; w = arr[0] / 2;");
  const regex = r.tokens.filter((t) => t.type === 'regex').map((t) => t.value);
  assert.deepEqual(regex, ["/['\"]/", '/https?:\\/\\//', '/[/]x/g']);
  assert.equal(r.tokens.filter((t) => t.value === '/').length, 4);
  assert.equal(r.comments.length, 0);
  assert.deepEqual(js('return /a/.test(x)').tokens.map((t) => t.type), ['name', 'regex', 'punct', 'name', 'punct', 'name', 'punct']);
  assert.deepEqual(js('a = b\n/c/g.exec(d)').tokens.filter((t) => t.type === 'regex').length, 0, 'after a name a / is a division, as the tool documents');
  assert.equal(js('i++ / 2').tokens.filter((t) => t.type === 'regex').length, 0);
  assert.equal(js('}\n/x/.test(y)').tokens.filter((t) => t.type === 'regex').length, 1, 'after } a / starts a regular expression');
  throwsAt(() => js('x = /abc\n/'), /regular expression that is not closed before the end of its line/, 4);
});

test('javascript: numbers in every form, with their values', () => {
  const r = js('a(1_000, 0x1F, 0o17, 0b101, 1.5e3, .5, 10n, 0xFD)');
  assert.deepEqual(r.tokens.filter((t) => t.type === 'num').map((t) => t.value), [1000, 31, 15, 5, 1500, 0.5, 10, 253]);
  assert.equal(numberValue('1_500L'), 1500);
  assert.equal(numberValue('2.5f'), 2.5);
  assert.equal(numberValue('0xFFL'), 255);
  assert.equal(numberValue('3j'), 3);
});

const E = String.fromCharCode(0xe9);
const I = String.fromCharCode(0xef);

test('javascript: names: Unicode letters, $ and _, private names, and a name written with an escape', () => {
  const r = js(`const $el = _x; this.#count = 1; const caf\\u00e9 = 2; const na${I}ve = 3;`);
  assert.deepEqual(names(r), ['const', '$el', '_x', 'this', '#count', 'const', `caf${E}`, 'const', `na${I}ve`]);
  NAME.lastIndex = 0;
  assert.ok(NAME.exec('abc'));
});

test('javascript: punctuators are read longest first, so => and === and ?. stay whole', () => {
  const r = js('a ??= b?.c === d => e >>>= f ... g; x?.5:1');
  assert.deepEqual(r.tokens.filter((t) => t.type === 'punct').map((t) => t.value), ['??=', '?.', '===', '=>', '>>>=', '...', ';', '?', ':']);
  throwsAt(() => js(`a ${String.fromCharCode(0xa7)} b`), /a character that JavaScript does not allow here \(U\+00A7\)/, 2);
});

test('javascript: JSX in .jsx and .tsx files: text is not code, attributes in braces are code, a generic arrow is not an element', () => {
  const r = js("const el = <div className={`x ${y}`} data-x='it\"s'>it's {cond ? <b>ok</b> : null} <br/></div>; page.waitForTimeout(3)", true);
  assert.deepEqual(names(r), ['const', 'el', 'y', 'cond', 'null', 'page', 'waitForTimeout']);
  assert.equal(r.tokens.filter((t) => t.type === 'jsx').length, 3);
  assert.equal(r.tokens.filter((t) => t.type === 'jsx-end').length, 3);
  const generic = js('const f = <T,>(x: T) => x; if (a < b) c(); <>{`frag`}</>', true);
  assert.deepEqual(generic.tokens.slice(3, 7).map((t) => t.value), ['<', 'T', ',', '>']);
  assert.ok(generic.tokens.some((t) => t.type === 'tmpl' && t.value === 'frag'));
  throwsAt(() => js("const el = <div>it's</div>"), /not closed/, undefined);
});

test('javascript: an element of JSX that does not close falls back to code, and a run of < stays linear', () => {
  const r = js('a = <b c="d" e; f()', true);
  assert.ok(names(r).includes('f'));
  const start = Date.now();
  const many = js(`x = ${'<a>'.repeat(20000)}`, true);
  assert.ok(Date.now() - start < 5000);
  assert.ok(many.tokens.length > 0);
});

test('javascript: nesting deeper than the limit stops with a clear reason', () => {
  const deep = `${'`${'.repeat(200)}x${'}`'.repeat(200)}`;
  throwsAt(() => lexJs(deep, { jsx: false, limits: LEX_LIMITS }), /nested more than 128 deep/);
  const ok = `${'`${'.repeat(50)}x${'}`'.repeat(50)}`;
  assert.ok(lexJs(ok, { jsx: false, limits: LEX_LIMITS }).tokens.length > 100);
});

test('python: comments, strings with prefixes, triple quotes, raw strings and f-strings', () => {
  const r = lex("time.sleep(2)  # time.sleep(9)\nx = r'\\d+' + b'\\x00' + f\"{a!r} # not a comment\" + '''one\n'two'\n''' + \"\"\"it's\"\"\" + 'a\\'b' + 'tab\\tx' + u'\\q'", 'python');
  assert.deepEqual(r.comments.map((c) => c.text.trim()), ['time.sleep(9)']);
  assert.deepEqual(strings(r), ['\\d+', '\0', '{a!r} # not a comment', "one\n'two'\n", "it's", "a'b", 'tab\tx', '\\q']);
  assert.deepEqual(names(r), ['time', 'sleep', 'x']);
});

test('python: a backslash joins lines, numbers keep their values, and a string not closed stops', () => {
  const r = lex('a = 1 + \\\n    3_000\nb = 1.5e1j', 'python');
  assert.equal(r.tokens.find((t) => t.value === 3000).nl, false, 'a joined line does not end a line');
  assert.deepEqual(r.tokens.filter((t) => t.type === 'num').map((t) => t.value), [1, 3000, 15]);
  throwsAt(() => lexPython("x = 'open\ny'", { limits: LEX_LIMITS }), /not closed before the end of its line/, 4);
  throwsAt(() => lexPython('x = """open', { limits: LEX_LIMITS }), /triple-quoted string that is not closed/, 4);
  throwsAt(() => lexPython('x = 1 ? 2', { limits: LEX_LIMITS }), /Python does not allow/, 6);
});

test('java: comments, strings, character literals, text blocks, annotations and numbers with suffixes', () => {
  const r = lex('@FindBy(xpath = "//a[1]") // Thread.sleep(5)\nchar q = \'"\'; String t = """\n  hi "there"\n  """; long n = 1_500L; /* By.xpath("//b") */', 'java');
  assert.deepEqual(r.comments.map((c) => c.text.trim()), ['Thread.sleep(5)', 'By.xpath("//b")']);
  assert.deepEqual(r.tokens.filter((t) => t.type === 'str').map((t) => t.value), ['//a[1]', '  hi "there"\n  ']);
  assert.deepEqual(r.tokens.filter((t) => t.type === 'char').map((t) => t.value), ['"']);
  assert.equal(r.tokens.find((t) => t.type === 'num').value, 1500);
  assert.equal(r.tokens[0].value, '@');
  throwsAt(() => lexJava('String s = "open', { limits: LEX_LIMITS }), /string that is not closed/, 11);
  throwsAt(() => lexJava('/* open', { limits: LEX_LIMITS }), /comment that is not closed/, 0);
  throwsAt(() => lexJava('String s = """\nopen', { limits: LEX_LIMITS }), /text block that is not closed/, 11);
});

test('every lexer gives the same tokens for LF and CRLF line ends, and marks the start of a line', () => {
  const code = "a();\n// c\nb('x');\n";
  for (const [language, src] of [['javascript', code], ['python', "a()\n# c\nb('x')\n"], ['java', code]]) {
    const lf = lex(src, language);
    const crlf = lex(src.replace(/\n/g, '\r\n'), language);
    assert.deepEqual(crlf.tokens.map((t) => [t.type, t.value, t.nl]), lf.tokens.map((t) => [t.type, t.value, t.nl]), language);
  }
  assert.ok(isLineEnd(10) && isLineEnd(13) && isLineEnd(0x2028) && !isLineEnd(32));
  assert.ok(isSpace(32) && isSpace(9) && isSpace(0xa0) && !isSpace(65));
});

test('lex: an unknown language is refused; the token and comment limits stop the reading', () => {
  throwsAt(() => lex('x', 'ruby'), /the language ruby is not read/, 0);
  throwsAt(() => lex('a b c d e', 'javascript', { limits: { maxTokens: 3 } }), /more than 3 tokens/, 6);
  throwsAt(() => lex('//a\n//b\n//c', 'javascript', { limits: { maxComments: 2 } }), /more than 2 comments/, 8);
  const store = tokenStore(LEX_LIMITS);
  store.push('name', 'a', 0, 1);
  const mark = store.mark();
  store.push('name', 'b', 2, 3);
  store.reset(mark);
  assert.equal(store.tokens.length, 1);
});

test('cook: escapes are read once, and an unknown escape keeps its character', () => {
  assert.equal(cook('a\\nb'), 'a\nb');
  assert.equal(cook('\\\\n'), '\\n');
  assert.equal(cook('\\q'), 'q');
  assert.equal(cook('\\u{110000}'), 'u{110000}');
  assert.equal(cook('end\\'), 'end');
  assert.equal(cook('plain'), 'plain');
});
