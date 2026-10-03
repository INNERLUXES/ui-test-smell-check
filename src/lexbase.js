// What the three lexers share: the error with the offset of the problem, the limits, and the reading of names, numbers
// and escapes. A token is { type, value, start, end, nl }: type is name, num, str, tmpl, tmpl-head, tmpl-middle,
// tmpl-tail, regex, jsx, jsx-end or punct; value is the name, the number, the value of the string after its escapes, or
// the punctuator; start and end are offsets into the text; nl is true when a line ends between the token and the one
// before it. A comment is { text, start, end, block }.

export const LEX_LIMITS = { maxTokens: 1000000, maxDepth: 128, maxComments: 200000 };

export class LexError extends Error {
  constructor(reason, offset) {
    super(reason);
    this.reason = reason;
    this.offset = offset;
  }
}

// The line and paragraph separators, and the two joiners a name may hold, built from their code points so that this file
// holds only ASCII.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const JOINERS = String.fromCharCode(0x200c, 0x200d);
const LINE_END = new RegExp(`[\n\r${LS}${PS}]`);

// A name: a letter, $ or _ first (or any Unicode letter), then letters, digits, $ and _.
export const NAME = new RegExp(`[$_\\p{ID_Start}][$${JOINERS}\\p{ID_Continue}]*`, 'uy');

export const isLineEnd = (c) => c === 10 || c === 13 || c === 0x2028 || c === 0x2029;
export const isSpace = (c) => c === 32 || c === 9 || c === 11 || c === 12 || c === 0xa0 || c === 0xfeff || (c >= 0x2000 && c <= 0x200a) || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0x1680;

// The value of a number as written, or NaN when it cannot be read as one (a big integer keeps its value as a number).
// The suffixes are the n of a big integer, the l of a Java long, the j of a Python complex number and the f and d of a
// Java floating point number; a hexadecimal number keeps its f and d, which are digits there.
export function numberValue(raw) {
  const plain = raw.replace(/_/g, '');
  const s = /^0[xX]/.test(plain) ? plain.replace(/[nNlL]$/, '') : plain.replace(/[nNlLjJfFdD]$/, '');
  return Number(s);
}

const SIMPLE_ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

// The value of the body of a string with backslash escapes: \n, \t, \xHH, \uHHHH, \u{H...}, a backslash before a line end
// (which joins the lines), and any other character for itself. Used by the JavaScript and Java lexers; an escape the
// tool does not know keeps its character, so the value is never shorter than what a reader sees.
export function cook(body) {
  if (!body.includes('\\')) return body;
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const e = body[i + 1];
    if (e === undefined) break;
    if (Object.hasOwn(SIMPLE_ESCAPES, e) && !(e === '0' && /[0-9]/.test(body[i + 2] ?? ''))) {
      out += SIMPLE_ESCAPES[e];
      i += 1;
    } else if (e === 'x' && /^[0-9a-fA-F]{2}$/.test(body.slice(i + 2, i + 4))) {
      out += String.fromCharCode(parseInt(body.slice(i + 2, i + 4), 16));
      i += 3;
    } else if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(body.slice(i + 2, i + 6))) {
      out += String.fromCharCode(parseInt(body.slice(i + 2, i + 6), 16));
      i += 5;
    } else if (e === 'u' && body[i + 2] === '{') {
      const close = body.indexOf('}', i + 3);
      const hex = close > 0 ? body.slice(i + 3, close) : '';
      const cp = /^[0-9a-fA-F]{1,6}$/.test(hex) ? parseInt(hex, 16) : -1;
      if (cp >= 0 && cp <= 0x10ffff) {
        out += String.fromCodePoint(cp);
        i = close;
      } else {
        out += 'u';
        i += 1;
      }
    } else if (e === '\r') {
      i += body[i + 2] === '\n' ? 2 : 1;
    } else if (e === '\n' || e === LS || e === PS) {
      i += 1;
    } else {
      out += e;
      i += 1;
    }
  }
  return out;
}

// A token store with the limits of the input: too many tokens or comments stop the reading with a LexError.
export function tokenStore(limits) {
  const tokens = [];
  const comments = [];
  let nl = false;
  return {
    tokens,
    comments,
    lineEnd() {
      nl = true;
    },
    push(type, value, start, end) {
      if (tokens.length >= limits.maxTokens) throw new LexError(`more than ${limits.maxTokens.toLocaleString('en-US')} tokens`, start);
      tokens.push({ type, value, start, end, nl });
      nl = false;
      return tokens[tokens.length - 1];
    },
    comment(text, start, end, block) {
      if (comments.length >= limits.maxComments) throw new LexError(`more than ${limits.maxComments.toLocaleString('en-US')} comments`, start);
      comments.push({ text, start, end, block });
      if (block && LINE_END.test(text)) nl = true;
    },
    // Rolls the store back to an earlier length, when a tentative reading (an element of JSX) did not work out.
    mark() {
      return { t: tokens.length, c: comments.length, nl };
    },
    reset(m) {
      tokens.length = m.t;
      comments.length = m.c;
      nl = m.nl;
    }
  };
}
