// The lexer of Python. It reads comments (# to the end of the line), strings with their prefixes (r, b, u, f, t and
// their pairs, in any case) in single, double and triple quotes, numbers, names and punctuators. The code inside the
// braces of an f-string is not read as code: an f-string is one string token, and docs/inputs.md says so.

import { LexError, NAME, isLineEnd, numberValue, tokenStore } from './lexbase.js';

const PUNCTUATORS = ['**=', '//=', '>>=', '<<=', '...', '->', ':=', '==', '!=', '<=', '>=', '**', '//', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '@='];
const SINGLE = new Set('()[]{},:;.=+-*/%<>&|^~@!'.split(''));
const NUMBER = /(?:0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9][0-9_]*)(?:[eE][+-]?[0-9][0-9_]*)?)[jJ]?/y;
const PREFIX = /(?:[rR][bBfFtT]?|[bBfFtT][rR]?|[uU])(?=['"])/y;

const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', a: '\x07', 0: '\0', '\\': '\\', "'": "'", '"': '"' };

// The value of a string body: escapes are read unless the string is raw; an unknown escape keeps its backslash, as
// Python does.
function cookPython(body, raw) {
  if (raw || !body.includes('\\')) return body;
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const e = body[i + 1];
    if (e === undefined) {
      out += c;
      break;
    }
    if (e === '\n') i += 1;
    else if (e === '\r') i += body[i + 2] === '\n' ? 2 : 1;
    else if (Object.hasOwn(ESCAPES, e)) {
      out += ESCAPES[e];
      i += 1;
    } else if (e === 'x' && /^[0-9a-fA-F]{2}$/.test(body.slice(i + 2, i + 4))) {
      out += String.fromCharCode(parseInt(body.slice(i + 2, i + 4), 16));
      i += 3;
    } else if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(body.slice(i + 2, i + 6))) {
      out += String.fromCharCode(parseInt(body.slice(i + 2, i + 6), 16));
      i += 5;
    } else out += c;
  }
  return out;
}

export function lexPython(text, { limits }) {
  const store = tokenStore(limits);
  const n = text.length;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (isLineEnd(c)) {
      store.lineEnd();
      i += 1;
      continue;
    }
    if (c === 32 || c === 9 || c === 12) {
      i += 1;
      continue;
    }
    if (c === 92 && isLineEnd(text.charCodeAt(i + 1))) {
      i += text.charCodeAt(i + 1) === 13 && text.charCodeAt(i + 2) === 10 ? 3 : 2;
      continue;
    }
    if (c === 35) {
      let j = i + 1;
      while (j < n && !isLineEnd(text.charCodeAt(j))) j += 1;
      store.comment(text.slice(i + 1, j), i, j, false);
      i = j;
      continue;
    }
    PREFIX.lastIndex = i;
    const prefix = PREFIX.exec(text);
    const q = prefix ? i + prefix[0].length : i;
    if (text[q] === "'" || text[q] === '"') {
      const raw = prefix ? /[rR]/.test(prefix[0]) : false;
      const quote = text[q];
      const triple = text.startsWith(quote.repeat(3), q);
      const open = triple ? 3 : 1;
      let j = q + open;
      for (;;) {
        if (j >= n) throw new LexError(triple ? 'a triple-quoted string that is not closed' : 'a string that is not closed', i);
        const d = text.charCodeAt(j);
        if (d === 92) {
          j += 2;
          continue;
        }
        if (!triple && isLineEnd(d)) throw new LexError('a string that is not closed before the end of its line', i);
        if (text[j] === quote && (!triple || text.startsWith(quote.repeat(3), j))) break;
        j += 1;
      }
      store.push('str', cookPython(text.slice(q + open, j), raw), i, j + open);
      i = j + open;
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
    if (name) {
      store.push('name', name[0], i, i + name[0].length);
      i += name[0].length;
      continue;
    }
    let p = PUNCTUATORS.find((candidate) => text.startsWith(candidate, i)) ?? null;
    if (!p && SINGLE.has(text[i])) p = text[i];
    if (!p) {
      const cp = text.codePointAt(i);
      throw new LexError(`a character that Python does not allow here (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`, i);
    }
    store.push('punct', p, i, i + p.length);
    i += p.length;
  }
  return { tokens: store.tokens, comments: store.comments };
}
