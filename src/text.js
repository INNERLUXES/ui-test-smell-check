// Text helpers: the cleaning of every text that comes from an input before it reaches a report, and the line and
// column of an offset. LF, CRLF and a lone CR all end a line, so a file written on Windows and the same file written on
// Linux give the same lines and columns.

// Control characters (C0 and C1), the line and paragraph separators, the byte order mark and the Unicode direction
// controls, built from their code points so that this file holds only ASCII.
const span = (a, b) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`;
const UNSAFE_CHARACTERS = new RegExp(`[${span(0, 0x1f)}${span(0x7f, 0x9f)}${[0x200e, 0x200f, 0x2028, 0x2029, 0xfeff].map((c) => String.fromCharCode(c)).join('')}${span(0x202a, 0x202e)}${span(0x2066, 0x2069)}]`, 'g');

// Text from the input: control, line separator and direction characters replaced by a space, length capped.
export function safeText(value, max = 300) {
  const s = String(value).slice(0, max * 4).replace(UNSAFE_CHARACTERS, ' ');
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

// The offset where each line starts.
export function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c === 10) starts.push(i + 1);
    else if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) i += 1;
      starts.push(i + 1);
    }
  }
  return starts;
}

// The line and column (both from 1) of an offset, by binary search in the line starts. The column counts UTF-16 code
// units from the start of the line, as JavaScript strings do.
export function positionOf(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - starts[lo] + 1 };
}

// The text of one line (from 1), without its line end.
export function lineText(text, starts, line) {
  const from = starts[line - 1];
  if (from === undefined) return '';
  const to = line < starts.length ? starts[line] : text.length;
  return text.slice(from, to).replace(/\r?\n$|\r$/, '');
}
