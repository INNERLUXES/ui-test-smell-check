// Reads the files, lexes each one (src/lex.js), finds the frameworks it uses, runs the rules of src/rules.js, applies
// the ignore comments, and returns one report: the files, the findings with their file, line, column, rule, severity,
// message and the sentences they rest on, the findings that a comment ignored with its reason, the files that could not
// be read, notes and the gate. The tool reads the files it is given; it runs nothing and opens no connection.

import { FILE_LIMITS, readInputs } from './files.js';
import { LEX_LIMITS, LexError, lex } from './lex.js';
import { FRAMEWORKS, basisOf, mayHoldJsx } from './data.js';
import { RULE_ORDER, RULES, factsFor, meetsLevel, detectFrameworks, runRules } from './rules.js';
import { defaultSettings } from './config.js';
import { readIgnores } from './ignore.js';
import { grouped, listText, plural } from './size.js';
import { lineStarts, lineText, positionOf, safeText } from './text.js';

export const LIMITS = { ...FILE_LIMITS, ...LEX_LIMITS, maxListedPerRule: 1000 };

// Lexes one file and runs the rules. Returns { frameworks, findings, ignored, problems, reason }: reason is set when the
// file could not be read, with the line and column of the problem.
export function analyseText(text, { file = 'file', language, settings = defaultSettings(), limits = LIMITS } = {}) {
  let lexed;
  const starts = lineStarts(text);
  try {
    lexed = lex(text, language, { jsx: mayHoldJsx(file), limits });
  } catch (error) {
    if (!(error instanceof LexError)) throw error;
    const pos = positionOf(starts, Math.min(error.offset, text.length));
    return { frameworks: [], findings: [], ignored: [], problems: [], reason: `line ${pos.line}, column ${pos.column}: ${error.reason}` };
  }
  const { tokens, comments } = lexed;
  const frameworks = detectFrameworks(tokens, language);
  const raw = frameworks.length ? runRules({ text, tokens, language, frameworks, settings }) : [];
  const ignores = readIgnores(comments, tokens, starts);
  const findings = [];
  const ignored = [];
  const seen = new Set();
  for (const r of raw) {
    const pos = positionOf(starts, r.at.start);
    const key = `${r.rule}:${pos.line}:${pos.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const setting = settings[r.rule];
    const finding = {
      file,
      line: pos.line,
      column: pos.column,
      rule: r.rule,
      severity: setting.severity,
      framework: r.framework,
      message: r.message,
      code: safeText(lineText(text, starts, pos.line).trim(), 200),
      basis: factsFor(r.rule, r.framework).map(basisOf)
    };
    const comment = (ignores.byLine.get(pos.line) ?? []).find((c) => c.rules.has(r.rule));
    if (comment) {
      comment.used = true;
      ignored.push({ file, line: pos.line, column: pos.column, rule: r.rule, framework: r.framework, reason: comment.reason, commentLine: comment.line });
    } else findings.push(finding);
  }
  const problems = ignores.problems.map((p) => `${file}:${p.line}:${p.column}: ${p.text}`);
  // An ignore comment that ignored nothing is named only in a file the rules ran on.
  if (frameworks.length) {
    for (const list of ignores.byLine.values()) {
      for (const c of list) if (!c.used) problems.push(`${file}:${c.line}: the ignore comment for ${[...c.rules].join(', ')} matched no finding`);
    }
  }
  return { frameworks, findings, ignored, problems, reason: null };
}

const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Builds the report from files already read: { inputs, files: [{ file, language, size, text, reason }], links, skipped,
// special, otherFiles, ignored }. options: settings, failOn, version, limits, configFile.
export function checkFiles(read, options = {}) {
  const limits = { ...LIMITS, ...(options.limits ?? {}) };
  const settings = options.settings ?? defaultSettings();
  const failOn = options.failOn ?? 'error';
  const files = [];
  const unreadable = [];
  const all = [];
  const ignored = [];
  const notes = [];
  for (const f of read.files) {
    const shown = safeText(f.file, 400);
    if (f.reason !== null) {
      unreadable.push({ file: shown, reason: safeText(f.reason, 300) });
      continue;
    }
    const r = analyseText(f.text, { file: shown, language: f.language, settings, limits });
    if (r.reason !== null) {
      unreadable.push({ file: shown, reason: safeText(r.reason, 300) });
      continue;
    }
    files.push({ file: shown, language: f.language, frameworks: r.frameworks, findings: r.findings.length, ignored: r.ignored.length });
    all.push(...r.findings);
    ignored.push(...r.ignored);
    notes.push(...r.problems);
  }
  all.sort((a, b) => order(a.file, b.file) || a.line - b.line || a.column - b.column || RULE_ORDER[a.rule] - RULE_ORDER[b.rule]);

  // The cap per rule: the first findings of a rule in file order are listed, the rest are counted.
  const perRule = {};
  const omitted = {};
  const findings = [];
  for (const f of all) {
    perRule[f.rule] = (perRule[f.rule] ?? 0) + 1;
    if (perRule[f.rule] <= limits.maxListedPerRule) findings.push(f);
    else omitted[f.rule] = (omitted[f.rule] ?? 0) + 1;
  }
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of all) counts[f.severity] += 1;

  const allNotes = [];
  for (const u of unreadable) allNotes.push(`not read: ${u.file}: ${u.reason}`);
  allNotes.push(...notes.map((n) => safeText(n, 400)));
  if (read.links?.length) allNotes.push(`${plural(read.links.length, 'symbolic link')} ${read.links.length === 1 ? 'was' : 'were'} not followed: ${listText(read.links.map((l) => safeText(l, 160)), 5)}`);
  if (read.skipped?.length) allNotes.push(`${plural(read.skipped.length, 'folder')} of tools or packages ${read.skipped.length === 1 ? 'was' : 'were'} not entered: ${listText(read.skipped.map((l) => safeText(l, 160)), 5)}`);
  if (read.special?.length) allNotes.push(`${plural(read.special.length, 'entry', 'entries')} ${read.special.length === 1 ? 'is' : 'are'} not a regular file or folder, or could not be read: ${listText(read.special.map((u) => `${safeText(u.path, 160)} (${safeText(u.reason, 80)})`), 5)}`);
  if (read.ignored?.length) allNotes.push(`${plural(read.ignored.length, 'file')} left out by the ignore patterns of the configuration: ${listText(read.ignored.map((l) => safeText(l, 160)), 5)}`);
  for (const [id, n] of Object.entries(omitted)) allNotes.push(`${grouped(n)} more findings of ${id} are counted but not listed`);
  const noFramework = files.filter((f) => !f.frameworks.length);
  if (noFramework.length) allNotes.push(`${plural(noFramework.length, 'file')} with no Playwright, Cypress or Selenium import ${noFramework.length === 1 ? 'was' : 'were'} read and not checked: ${listText(noFramework.map((f) => f.file), 5)}`);

  const byFramework = Object.fromEntries(FRAMEWORKS.map((fw) => [fw.id, files.filter((f) => f.frameworks.includes(fw.id)).length]));
  const failing = Object.entries(counts).filter(([sev, n]) => n > 0 && meetsLevel(sev, failOn));
  const reason = failing.map(([sev, n]) => plural(n, sev)).join(', ');

  return {
    tool: 'ui-test-smell-check',
    version: options.version ?? '0.0.0',
    inputs: (read.inputs ?? ['.']).map((p) => safeText(p, 300)),
    config: options.configFile ? safeText(options.configFile, 300) : null,
    failOn,
    rules: RULES.map((r) => ({ id: r.id, on: settings[r.id].on, severity: settings[r.id].severity, options: { ...settings[r.id].options } })),
    totals: {
      files: read.files.length,
      read: files.length,
      notRead: unreadable.length,
      uiTestFiles: files.length - noFramework.length,
      noFramework: noFramework.length,
      leftOut: read.ignored?.length ?? 0,
      byFramework
    },
    files: files.filter((f) => f.frameworks.length),
    findings,
    ignored: ignored.sort((a, b) => order(a.file, b.file) || a.line - b.line || a.column - b.column),
    unreadable,
    notes: allNotes.map((n) => safeText(n, 1200)),
    counts,
    gate: { failOn, pass: failing.length === 0, reason }
  };
}

// Reads the paths (files or folders) and builds the report. The paths in the report are relative to base, with forward
// slashes.
export async function checkPaths(paths, options = {}) {
  const base = options.base ?? process.cwd();
  const limits = { ...LIMITS, ...(options.limits ?? {}) };
  const read = await readInputs(paths, base, limits, options.ignore ?? []);
  return checkFiles(read, { ...options, limits });
}
