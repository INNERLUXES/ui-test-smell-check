// The lexer of Java. It reads comments (// and /* */), text blocks ("""), strings and character literals with their
// escapes, numbers with their suffixes, names, annotations (an @ and a name) and punctuators.

import { LexError, NAME, cook, isLineEnd, numberValue, tokenStore } from './lexbase.js';

const PUNCTUATORS = ['>>>=', '<<=', '>>=', '>>>', '...', '->', '::', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>'];
const SINGLE = new Set('(){}[];,.@=<>!~?:+-*/&|^%'.split(''));
const NUMBER = /(?:0[xX][0-9a-fA-F_]+(?:\.[0-9a-fA-F_]*)?(?:[pP][+-]?[0-9]+)?|0[bB][01_]+|(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9][0-9_]*)(?:[eE][+-]?[0-9][0-9_]*)?)[lLfFdD]?/y;

export function lexJava(text, { limits }) {
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
    if (text.startsWith('"""', i)) {
      let j = i + 3;
      for (;;) {
        if (j >= n) throw new LexError('a text block that is not closed', i);
        if (text.charCodeAt(j) === 92) {
          j += 2;
          continue;
        }
        if (text.startsWith('"""', j)) break;
        j += 1;
      }
      // The content starts after the line end that follows the opening quotes; the indentation is kept.
      const body = text.slice(i + 3, j).replace(/^[ \t\f]*(?:\r\n|\r|\n)/, '');
      store.push('str', cook(body), i, j + 3);
      i = j + 3;
      continue;
    }
    if (c === 34 || c === 39) {
      let j = i + 1;
      for (;;) {
        if (j >= n) throw new LexError(c === 34 ? 'a string that is not closed' : 'a character literal that is not closed', i);
        const d = text.charCodeAt(j);
        if (d === 92) {
          j += 2;
          continue;
        }
        if (isLineEnd(d)) throw new LexError(c === 34 ? 'a string that is not closed before the end of its line' : 'a character literal that is not closed before the end of its line', i);
        if (d === c) break;
        j += 1;
      }
      store.push(c === 34 ? 'str' : 'char', cook(text.slice(i + 1, j)), i, j + 1);
      i = j + 1;
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
      throw new LexError(`a character that Java does not allow here (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`, i);
    }
    store.push('punct', p, i, i + p.length);
    i += p.length;
  }
  return { tokens: store.tokens, comments: store.comments };
}
