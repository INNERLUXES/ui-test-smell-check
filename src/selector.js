// The selectors a test passes to a locator: what in them ties the test to the position of an element or to the classes
// that style it. A selector is read from the value of a string, never from the source text, and every reader here goes
// through the selector once, from left to right, with no regular expression that can run long. docs/method.md lists
// exactly what is reported.
//
// The kinds of selector:
//   css         a CSS selector (Selenium By.css, By.cssSelector, By.CSS_SELECTOR)
//   jquery      a CSS selector that also has the jQuery position pseudo-classes (Cypress cy.get and its relatives)
//   playwright  a Playwright selector: CSS, XPath, text and other engines, chained with >>
//   xpath       an XPath expression
//   class       one class name (Selenium By.className, By.CLASS_NAME, @FindBy(className))

// The character that stands for a ${...} of a template literal inside a selector: from the Private Use Area, so it is
// in no real selector.
export const SUBSTITUTION = String.fromCharCode(0xe000);

// Pseudo-classes that pick an element by its place among its siblings. :only-child and :only-of-type are left out:
// they ask that there is one element, not which one.
const CSS_POSITION = new Set(['nth-child', 'nth-last-child', 'nth-of-type', 'nth-last-of-type', 'first-child', 'last-child', 'first-of-type', 'last-of-type', 'nth-match']);
// The jQuery pseudo-classes that Cypress also reads, which pick an element by its place in the list of matches.
const JQUERY_POSITION = new Set(['eq', 'first', 'last', 'gt', 'lt', 'even', 'odd']);
// Pseudo-classes that hold selectors of their own.
const NESTED = new Set(['not', 'is', 'where', 'has', 'matches', '-webkit-any', '-moz-any']);
// Pseudo-classes of Playwright and jQuery that match the text of an element, which is what a user sees.
const TEXT_PSEUDO = new Set(['has-text', 'text', 'text-is', 'text-matches', 'contains']);
// The engines of a Playwright selector part (name=body).
const PW_ENGINES = new Set(['css', 'xpath', 'text', 'id', 'data-testid', 'data-test-id', 'data-test', 'role', 'nth', 'visible', 'alt', 'placeholder', 'title', 'label', '_react', '_vue']);

const isNameChar = (c) => /[A-Za-z0-9_-]/.test(c) || c === SUBSTITUTION || c.charCodeAt(0) > 127;

// A class name that looks made by a build tool rather than written by a person, with the reason; null otherwise. min is
// the shortest hash that counts (hashMinLength). The patterns are listed in docs/method.md.
export function hashedClass(name, min) {
  if (name.includes(SUBSTITUTION)) return null;
  const hasDigit = (s) => /[0-9]/.test(s);
  const hasLetter = (s) => /[A-Za-z]/.test(s);
  let m = /^css-([a-z0-9]+)(?:-[A-Za-z0-9_]+)?$/i.exec(name);
  if (m && m[1].length >= min && hasDigit(m[1])) return 'a CSS-in-JS class name of the form css-<hash> (Emotion and others)';
  m = /^sc-([A-Za-z]+)$/.exec(name);
  if (m && m[1].length >= min && /[a-z]/.test(m[1]) && /[A-Z]/.test(m[1])) return 'a styled-components class name of the form sc-<hash>';
  m = /^[A-Za-z][A-Za-z0-9-]*(?:_[A-Za-z0-9-]+)?__+([A-Za-z0-9-]+)$/.exec(name);
  if (m && m[1].length >= min && hasDigit(m[1]) && hasLetter(m[1])) return 'a CSS Modules class name of the form <name>__<hash>';
  if (/^jss[0-9]+$/.test(name) || /^makeStyles-[A-Za-z0-9-]+-[0-9]+$/.test(name)) return 'a JSS class name with a counter (jss<number>, makeStyles-<name>-<number>)';
  return null;
}

// Splits text at a separator that is outside quotes, brackets and parentheses. Returns the parts with their offsets.
function splitTop(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let from = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0 && text.startsWith(separator, i)) {
      parts.push({ text: text.slice(from, i), at: from });
      from = i + separator.length;
      i += separator.length - 1;
    }
  }
  parts.push({ text: text.slice(from), at: from });
  return parts;
}

// The end of a bracket or parenthesis group that opens at i (the offset after its closer), with quotes skipped.
function groupEnd(text, i, open, close) {
  let depth = 0;
  let quote = null;
  for (let j = i; j < text.length; j += 1) {
    const c = text[j];
    if (quote) {
      if (c === '\\') j += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
  }
  return text.length;
}

// Reads a CSS selector (a list of complex selectors). Returns { position: [text], classes: [name], subjects: [{ text,
// byClass }] }: the position pseudo-classes, every class name, and for each selector of the list whether its subject
// (the last compound, the element that is selected) is picked by class only.
function readCss(text, jquery, depth = 0) {
  const out = { position: [], classes: [], subjects: [] };
  if (depth > 8) return out;
  for (const alternative of splitTop(text, ',')) {
    let compound = { cls: false, other: false };
    let i = 0;
    const s = alternative.text;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '>' || c === '+' || c === '~') {
        // A combinator: the next compound starts.
        while (i < s.length && ' \t\n\r>+~'.includes(s[i])) i += 1;
        if (i < s.length) compound = { cls: false, other: false };
        continue;
      }
      if (c === '.') {
        let j = i + 1;
        while (j < s.length && (isNameChar(s[j]) || (s[j] === '\\' && j + 1 < s.length))) j += s[j] === '\\' ? 2 : 1;
        const name = s.slice(i + 1, j).replace(/\\(.)/g, '$1');
        if (name) {
          out.classes.push(name);
          compound.cls = true;
        }
        i = Math.max(j, i + 1);
        continue;
      }
      if (c === '#') {
        compound.other = true;
        i += 1;
        while (i < s.length && isNameChar(s[i])) i += 1;
        continue;
      }
      if (c === '[') {
        const end = groupEnd(s, i, '[', ']');
        const body = s.slice(i + 1, end - 1).trim();
        const attr = /^[A-Za-z_:][A-Za-z0-9_:.-]*/.exec(body);
        if (attr && attr[0].toLowerCase() === 'class') {
          compound.cls = true;
          const value = /=\s*(["']?)([^"'\]]*)\1/.exec(body);
          if (value) for (const word of value[2].split(/\s+/)) if (word) out.classes.push(word);
        } else compound.other = true;
        i = end;
        continue;
      }
      if (c === ':') {
        let j = i + 1;
        if (s[j] === ':') j += 1;
        const nameStart = j;
        while (j < s.length && /[A-Za-z0-9-]/.test(s[j])) j += 1;
        const name = s.slice(nameStart, j).toLowerCase();
        let args = null;
        let end = j;
        if (s[j] === '(') {
          end = groupEnd(s, j, '(', ')');
          args = s.slice(j + 1, end - 1);
        }
        const shown = s.slice(i, end);
        if (CSS_POSITION.has(name) || (jquery && JQUERY_POSITION.has(name))) out.position.push(shown);
        if (TEXT_PSEUDO.has(name)) compound.other = true;
        if (NESTED.has(name) && args !== null) {
          const inner = readCss(args, jquery, depth + 1);
          out.position.push(...inner.position);
          out.classes.push(...inner.classes);
        }
        i = Math.max(end, i + 1);
        continue;
      }
      if (c === '"' || c === "'") {
        // A quoted string outside brackets is not CSS; it is read as text (Playwright reads it as a text selector).
        compound.other = true;
        const close = s.indexOf(c, i + 1);
        i = close < 0 ? s.length : close + 1;
        continue;
      }
      // A type selector, the universal selector or a character the tool does not know: part of the compound.
      i += 1;
    }
    out.subjects.push({ text: alternative.text.trim(), byClass: compound.cls && !compound.other });
  }
  return out;
}

// Reads an XPath expression. Returns { position: [text], classes: [name], byClass, absolute }.
function readXpath(text) {
  const out = { position: [], classes: [], byClass: false, absolute: false };
  const t = text.trim();
  if (t.startsWith('/') && !t.startsWith('//')) out.absolute = true;
  let quote = null;
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c !== '[') continue;
    const end = groupEnd(t, i, '[', ']');
    const body = t.slice(i + 1, end - 1).trim();
    if (/^[0-9]+$/.test(body) || body === SUBSTITUTION || /(?:^|[^A-Za-z0-9_-])(?:position|last)\s*\(\s*\)/.test(body)) out.position.push(`[${body}]`);
    if (/@class\b/.test(body)) {
      out.byClass = true;
      for (const m of body.matchAll(/(["'])([^"']*)\1/g)) for (const word of m[2].split(/\s+/)) if (word) out.classes.push(word);
    }
  }
  return out;
}

// What a selector shows. Returns { position: [{ text, why }], styling: { text, why, hashed } | null }.
// options.hashMinLength is the shortest hash that counts.
export function analyseSelector(value, kind, { hashMinLength = 5 } = {}) {
  const position = [];
  let byClass = null;
  const classes = [];
  const add = (r) => {
    for (const p of r.position) position.push({ text: p, why: 'position' });
    classes.push(...r.classes);
  };
  const css = (text, jquery) => {
    const r = readCss(text, jquery);
    add(r);
    const subject = r.subjects.find((x) => x.byClass);
    if (subject && !byClass) byClass = subject.text;
  };
  let byClassWhy = 'class';
  const xpath = (text) => {
    const r = readXpath(text);
    if (r.absolute) position.push({ text: text.trim(), why: 'absolute' });
    add(r);
    if (r.byClass && !byClass) {
      byClass = text.trim();
      byClassWhy = 'xpath-class';
    }
  };
  const v = String(value);
  if (kind === 'class') {
    classes.push(...v.trim().split(/\s+/).filter(Boolean));
    byClass = v.trim();
  } else if (kind === 'xpath') xpath(v);
  else if (kind === 'css' || kind === 'jquery') css(v, kind === 'jquery');
  else if (kind === 'playwright') {
    for (const part of splitTop(v, '>>')) {
      const p = part.text.trim();
      const engine = /^([A-Za-z_][A-Za-z0-9_-]*(?::[A-Za-z-]+)?)\s*=/.exec(p);
      const name = engine ? engine[1].toLowerCase() : null;
      if (name && (PW_ENGINES.has(name) || name.startsWith('internal:'))) {
        const body = p.slice(engine[0].length).trim();
        if (name === 'css') css(body, false);
        else if (name === 'xpath') xpath(body);
        else if (name === 'nth') position.push({ text: p, why: 'position' });
        continue;
      }
      if (p.startsWith('//') || p.startsWith('..') || p.startsWith('(')) xpath(p);
      else if (p.startsWith('"') || p.startsWith("'")) continue;
      else css(p, false);
    }
  }
  let styling = null;
  for (const name of classes) {
    const why = hashedClass(name, hashMinLength);
    if (why) {
      styling = { text: name, why, hashed: true };
      break;
    }
  }
  if (!styling && byClass) styling = { text: byClass, why: kind === 'class' ? 'class-locator' : byClassWhy, hashed: false };
  return { position, styling };
}
