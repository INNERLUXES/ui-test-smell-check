// Ignore comments: a comment that turns one or more rules off for one line, with a reason that is required.
//
//   // ui-test-smell-check-ignore fixed-wait -- the chart animation has no event to wait for
//   await page.waitForTimeout(400);
//
//   cy.get('.legacy-grid').click(); // ui-test-smell-check-ignore styling-selector -- third-party grid, no test ids
//
// A comment alone on its line applies to the next line with code; a comment after code applies to that line. A comment
// with no reason, or that names a rule the tool does not have, is not applied, and a note says why: the finding stays.

import { IGNORE_MARKER } from './data.js';
import { RULE_IDS } from './rules.js';
import { positionOf, safeText } from './text.js';

// The index of the last token that starts before offset, or -1.
function lastBefore(tokens, offset) {
  let lo = 0;
  let hi = tokens.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid].start < offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

// Reads the ignore comments of a file. Returns { byLine: Map(line -> [{ rules, reason, line, used }]), problems: [{
// line, column, text }] }.
export function readIgnores(comments, tokens, starts) {
  const byLine = new Map();
  const problems = [];
  for (const c of comments) {
    const body = c.text.replace(/^[\s*]+/, '');
    if (!body.startsWith(IGNORE_MARKER)) continue;
    const where = positionOf(starts, c.start);
    const problem = (text) => problems.push({ line: where.line, column: where.column, text });
    const rest = body.slice(IGNORE_MARKER.length);
    if (rest !== '' && !/^\s/.test(rest)) continue;
    const dash = rest.indexOf(' -- ');
    const ids = (dash < 0 ? rest : rest.slice(0, dash)).split(',').map((x) => x.trim()).filter(Boolean);
    const reason = dash < 0 ? '' : rest.slice(dash + 4).replace(/\s+/g, ' ').replace(/\*+\s*$/, '').trim();
    if (!ids.length) {
      problem('the ignore comment names no rule; write the rule id after it');
      continue;
    }
    const unknown = ids.filter((id) => !RULE_IDS.includes(id));
    if (unknown.length) {
      problem(`the ignore comment names ${unknown.length === 1 ? 'a rule' : 'rules'} the tool does not have: ${safeText(unknown.join(', '), 120)}; it is not applied`);
      continue;
    }
    if (!/[A-Za-z]/.test(reason)) {
      problem(`the ignore comment for ${ids.join(', ')} gives no reason; write one after -- (it is not applied)`);
      continue;
    }
    // The line it applies to: the line of the comment when code comes before it there, else the next line with code.
    const before = lastBefore(tokens, c.start);
    let line = null;
    if (before >= 0 && positionOf(starts, tokens[before].start).line === where.line) line = where.line;
    else {
      const after = tokens[before + 1];
      if (after && after.start >= c.end) line = positionOf(starts, after.start).line;
    }
    if (line === null) {
      problem(`the ignore comment for ${ids.join(', ')} is followed by no code; it applies to nothing`);
      continue;
    }
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push({ rules: new Set(ids), reason: safeText(reason, 300), line: where.line, used: false });
  }
  return { byLine, problems };
}
