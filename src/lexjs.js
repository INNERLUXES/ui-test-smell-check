// The lexer of JavaScript and TypeScript. It reads comments, strings, template literals (with the code of every ${...}
// read as code, as deep as it is nested), regular expression literals, numbers, names and punctuators, and in .jsx and
// .tsx files the elements of JSX. Whether a / starts a regular expression or is a division is decided by the token
// before it, as most tools that read JavaScript without parsing it do: after a value (a name, a number, a string, a ) or
// a ]) it is a division, anywhere else it starts a regular expression. docs/inputs.md says where that rule can be wrong.

import { LexError, NAME, cook, isLineEnd, isSpace, numberValue, tokenStore } from './lexbase.js';

// Keywords after which an expression starts, so a / starts a regular expression and a < can open JSX.
const EXPRESSION_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await', 'extends']);

// Punctuators, longest first.
const PUNCTUATORS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**'];
const SINGLE = new Set('{}()[];,<>+-*/%&|^!~?:=.@'.split(''));

const NUMBER = /(?:0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9][0-9_]*)(?:[eE][+-]?[0-9][0-9_]*)?)n?/y;
const JSX_NAME = /[A-Za-z_$][\w$.:-]*/y;

// Whether a token ends a value, so that a / after it is a division and a < after it is a comparison or a type argument.
function endsValue(t) {
  if (!t) return false;
  if (t.type === 'num' || t.type === 'str' || t.type === 'tmpl' || t.type === 'tmpl-tail' || t.type === 'regex' || t.type === 'jsx-end') return true;
  if (t.type === 'name') return !EXPRESSION_KEYWORDS.has(t.value);
  if (t.type === 'punct') return t.value === ')' || t.value === ']' || t.value === '++' || t.value === '--';
  return false;
}

// Reads the text. options.jsx: read the elements of JSX (.jsx and .tsx files). Returns { tokens, comments }.
export function lexJs(text, { jsx = false, limits }) {
  const store = tokenStore(limits);
  const n = text.length;
  // The characters that failed attempts at reading JSX may still look at; past it, a < is only a punctuator.
  let jsxBudget = jsx ? n * 4 + 1000 : 0;
  const last = () => store.tokens[store.tokens.length - 1];

  const readString = (i) => {
    const quote = text.charCodeAt(i);
    let j = i + 1;
    for (;;) {
      if (j >= n) throw new LexError('a string that is not closed', i);
      const c = text.charCodeAt(j);
      if (c === quote) break;
      if (c === 92) {
        j += text.charCodeAt(j + 1) === 13 && text.charCodeAt(j + 2) === 10 ? 3 : 2;
        continue;
      }
      if (c === 10 || c === 13) throw new LexError('a string that is not closed before the end of its line', i);
      j += 1;
    }
    store.push('str', cook(text.slice(i + 1, j)), i, j + 1);
    return j + 1;
  };

  const readRegex = (i) => {
    let j = i + 1;
    let inClass = false;
    for (;;) {
      if (j >= n) throw new LexError('a regular expression that is not closed', i);
      const c = text.charCodeAt(j);
      if (isLineEnd(c)) throw new LexError('a regular expression that is not closed before the end of its line', i);
      if (c === 92) {
        j += 2;
        continue;
      }
      if (c === 91) inClass = true;
      else if (c === 93) inClass = false;
      else if (c === 47 && !inClass) break;
      j += 1;
    }
    j += 1;
    NAME.lastIndex = j;
    const flags = NAME.exec(text);
    if (flags && flags.index === j) j += flags[0].length;
    store.push('regex', text.slice(i, j), i, j);
    return j;
  };

  // A template literal from its backquote: the static parts as tokens, the code of each ${...} read as code.
  const readTemplate = (i, depth) => {
    let j = i + 1;
    let from = j;
    let first = true;
    for (;;) {
      if (j >= n) throw new LexError('a template literal that is not closed', i);
      const c = text.charCodeAt(j);
      if (c === 92) {
        j += 2;
        continue;
      }
      if (c === 96) {
        store.push(first ? 'tmpl' : 'tmpl-tail', cook(text.slice(from, j)), first ? i : from - 1, j + 1);
        return j + 1;
      }
      if (c === 36 && text.charCodeAt(j + 1) === 123) {
        store.push(first ? 'tmpl-head' : 'tmpl-middle', cook(text.slice(from, j)), first ? i : from - 1, j + 2);
        first = false;
        j = readCode(j + 2, depth + 1, true);
        from = j;
        continue;
      }
      j += 1;
    }
  };

  // An element of JSX from its <, or -1 when the text there is not one (then the < is a punctuator). The code inside
  // { } is read as code.
  const readJsx = (i, depth) => {
    if (depth > limits.maxDepth) return -1;
    let j = i + 1;
    const fail = () => {
      jsxBudget -= j - i;
      return -1;
    };
    const skipSpace = () => {
      while (j < n && (isSpace(text.charCodeAt(j)) || isLineEnd(text.charCodeAt(j)))) j += 1;
    };
    skipSpace();
    let name = '';
    if (text[j] !== '>') {
      JSX_NAME.lastIndex = j;
      const m = JSX_NAME.exec(text);
      if (!m) return fail();
      name = m[0];
      j += name.length;
    }
    store.push('jsx', `<${name}`, i, j);
    // Attributes.
    for (;;) {
      skipSpace();
      if (j >= n) return fail();
      if (text[j] === '/' && text[j + 1] === '>') {
        store.push('jsx-end', '/>', j, j + 2);
        return j + 2;
      }
      if (text[j] === '>') {
        j += 1;
        break;
      }
      if (text[j] === '{') {
        j = readCode(j + 1, depth + 1, true);
        continue;
      }
      JSX_NAME.lastIndex = j;
      const a = JSX_NAME.exec(text);
      if (!a) return fail();
      j += a[0].length;
      skipSpace();
      if (text[j] !== '=') continue;
      j += 1;
      skipSpace();
      const q = text[j];
      if (q === '"' || q === "'") {
        const close = text.indexOf(q, j + 1);
        if (close < 0) return fail();
        j = close + 1;
      } else if (q === '{') j = readCode(j + 1, depth + 1, true);
      else if (q === '<') {
        const k = readJsx(j, depth + 1);
        if (k < 0) return fail();
        j = k;
      } else return fail();
    }
    // Children, up to the closing tag.
    for (;;) {
      while (j < n && text[j] !== '<' && text[j] !== '{') j += 1;
      if (j >= n) return fail();
      if (text[j] === '{') {
        j = readCode(j + 1, depth + 1, true);
        continue;
      }
      if (text[j + 1] === '/') {
        const close = text.indexOf('>', j + 2);
        if (close < 0) return fail();
        if (text.slice(j + 2, close).trim() !== name) return fail();
        store.push('jsx-end', `</${name}>`, j, close + 1);
        return close + 1;
      }
      const k = readJsx(j, depth + 1);
      if (k < 0) return fail();
      j = k;
    }
  };

  // Reads code from i. With untilBrace, stops after the } that closes the ${ or { the code started in, and returns the
  // offset after it; else reads to the end of the text.
  function readCode(i, depth, untilBrace) {
    if (depth > limits.maxDepth) throw new LexError(`code nested more than ${limits.maxDepth} deep in template literals or JSX`, i);
    const opened = i - 1;
    let braces = 0;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (isLineEnd(c)) {
        store.lineEnd();
        i += 1;
        continue;
      }
      if (isSpace(c)) {
        i += 1;
        continue;
      }
      // Comments.
      if (c === 47 && text.charCodeAt(i + 1) === 47) {
        let j = i + 2;
        while (j < n && !isLineEnd(text.charCodeAt(j))) j += 1;
        store.comment(text.slice(i + 2, j), i, j, false);
        i = j;
        continue;
      }
      if (c === 47 && text.charCodeAt(i + 1) === 42) {
        const close = text.indexOf('*/', i + 2);
        if (close < 0) throw new LexError('a comment that is not closed', i);
        store.comment(text.slice(i + 2, close), i, close + 2, true);
        i = close + 2;
        continue;
      }
      if (c === 35 && i === 0 && text.charCodeAt(1) === 33) {
        let j = 2;
        while (j < n && !isLineEnd(text.charCodeAt(j))) j += 1;
        store.comment(text.slice(2, j), 0, j, false);
        i = j;
        continue;
      }
      if (c === 39 || c === 34) {
        i = readString(i);
        continue;
      }
      if (c === 96) {
        i = readTemplate(i, depth);
        continue;
      }
      if ((c >= 48 && c <= 57) || (c === 46 && text.charCodeAt(i + 1) >= 48 && text.charCodeAt(i + 1) <= 57)) {
        NUMBER.lastIndex = i;
        const m = NUMBER.exec(text);
        store.push('num', numberValue(m[0]), i, i + m[0].length);
        i += m[0].length;
        continue;
      }
      NAME.lastIndex = i;
      const name = NAME.exec(text);
      if (name || (c === 92 && text[i + 1] === 'u')) {
        let j = i + (name ? name[0].length : 0);
        if (text[j] === '\\' && text[j + 1] === 'u') {
          // A name written with Unicode escapes: read the escapes and the name characters around them.
          while (j < n && (/[\w$]/.test(text[j]) || text.charCodeAt(j) > 127 || (text[j] === '\\' && text[j + 1] === 'u'))) j += text[j] === '\\' ? 2 : 1;
          store.push('name', cook(text.slice(i, j)), i, j);
        } else store.push('name', name[0], i, j);
        i = j;
        continue;
      }
      if (c === 35) {
        NAME.lastIndex = i + 1;
        const priv = NAME.exec(text);
        if (priv) {
          store.push('name', `#${priv[0]}`, i, i + 1 + priv[0].length);
          i += 1 + priv[0].length;
          continue;
        }
      }
      if (c === 47 && !endsValue(last())) {
        i = readRegex(i);
        continue;
      }
      if (c === 60 && jsx && jsxBudget > 0 && !endsValue(last()) && /[A-Za-z_$>]/.test(text[i + 1] ?? '')) {
        const mark = store.mark();
        let k;
        try {
          k = readJsx(i, depth + 1);
        } catch (error) {
          if (!(error instanceof LexError)) throw error;
          k = -1;
          jsxBudget -= n - i;
        }
        if (k >= 0) {
          i = k;
          continue;
        }
        store.reset(mark);
      }
      if (untilBrace && c === 125 && braces === 0) return i + 1;
      if (c === 123) braces += 1;
      else if (c === 125) braces -= 1;
      let p = null;
      for (const candidate of PUNCTUATORS) {
        if (text.startsWith(candidate, i)) {
          p = candidate;
          break;
        }
      }
      if (p === '?.' && /[0-9]/.test(text[i + 2] ?? '')) p = null;
      if (!p && SINGLE.has(text[i])) p = text[i];
      if (!p) {
        const cp = text.codePointAt(i);
        throw new LexError(`a character that JavaScript does not allow here (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`, i);
      }
      store.push('punct', p, i, i + p.length);
      i += p.length;
    }
    if (untilBrace) throw new LexError('a ${ or { that is not closed', opened);
    return i;
  }

  readCode(0, 0, false);
  return { tokens: store.tokens, comments: store.comments };
}
