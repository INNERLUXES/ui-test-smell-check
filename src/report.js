// Report formats: text for a terminal, Markdown for a pull request or a job summary, JSON for other tools. Findings are
// grouped by file, in the order of their lines. With explain, each finding also shows its line of code and the sentences
// of the saved pages it rests on; the JSON report always holds them.

import { FRAMEWORKS } from './data.js';
import { grouped, plural } from './size.js';

const LABEL = Object.fromEntries(FRAMEWORKS.map((f) => [f.id, f.label]));

function countsLine(c) {
  return `${c.error} error, ${c.warning} warning, ${c.info} info`;
}

function filesLine(r) {
  const t = r.totals;
  const by = FRAMEWORKS.map((f) => `${f.label} ${t.byFramework[f.id]}`).join(', ');
  return `${plural(t.read, 'file')} read, ${grouped(t.uiTestFiles)} with a UI test framework (${by}), ${grouped(t.noFramework)} without, ${grouped(t.notRead)} not read`;
}

function rulesLine(r) {
  const on = r.rules.filter((x) => x.on);
  const off = r.rules.filter((x) => !x.on);
  return `${plural(on.length, 'rule')} on${off.length ? `, off: ${off.map((x) => x.id).join(', ')}` : ''}; fail level ${r.failOn}${r.config ? `; configuration ${r.config}` : ''}`;
}

const ignoredLine = (r) => (r.ignored.length ? `; ${grouped(r.ignored.length)} ignored by a comment with a reason` : '');

function gateLine(r) {
  return r.gate.pass ? `GATE: PASS (--fail-on ${r.gate.failOn})` : `GATE: FAIL - ${r.gate.reason} (--fail-on ${r.gate.failOn})`;
}

// The findings of each file, in report order.
function byFile(findings) {
  const out = new Map();
  for (const f of findings) {
    if (!out.has(f.file)) out.set(f.file, []);
    out.get(f.file).push(f);
  }
  return out;
}

function frameworkOf(r, file) {
  const entry = r.files.find((f) => f.file === file);
  return entry ? entry.frameworks.map((id) => LABEL[id]).join(', ') : '';
}

export function toText(r, { explain = false } = {}) {
  const lines = [`ui-test-smell-check: ${r.inputs.join(', ')}`, `files: ${filesLine(r)}`, `rules: ${rulesLine(r)}`, `findings: ${countsLine(r.counts)}${ignoredLine(r)}`];
  if (!r.findings.length) lines.push('', 'no findings');
  for (const [file, list] of byFile(r.findings)) {
    lines.push('', `${file} (${frameworkOf(r, file)})`);
    for (const f of list) {
      lines.push(`  ${`${f.line}:${f.column}`.padEnd(8)} ${f.severity.toUpperCase().padEnd(7)}  ${f.rule.padEnd(17)}  ${f.message}`);
      if (explain) {
        lines.push(`           code: ${f.code}`);
        for (const b of f.basis) lines.push(`           basis: "${b.text}" (${b.section}, ${b.source})`);
      }
    }
  }
  if (r.ignored.length) {
    lines.push('', 'ignored by a comment:');
    for (const x of r.ignored) lines.push(`  ${x.file}:${x.line}:${x.column}  ${x.rule}  -- ${x.reason}`);
  }
  if (r.notes.length) lines.push('');
  for (const note of r.notes) lines.push(`note: ${note}`);
  lines.push('', gateLine(r));
  return lines.join('\n') + '\n';
}

// A Markdown table cell: backslashes, pipes, square brackets, backticks, asterisks and underscores escaped, line breaks
// flattened, and <, > and & written as entities, so text from the input cannot break the table, make a link or be read
// as HTML.
export function mdCell(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[[\]`*_]/g, (c) => `\\${c}`)
    .replace(/\r?\n|\r/g, ' ');
}

export function toMarkdown(r, { explain = false } = {}) {
  const lines = [`## ui-test-smell-check: ${countsLine(r.counts)}${ignoredLine(r)}`, '', `Input: ${mdCell(r.inputs.join(', '))}. Files: ${mdCell(filesLine(r))}. Rules: ${mdCell(rulesLine(r))}.`];
  if (!r.findings.length) lines.push('', 'No findings.');
  else {
    lines.push('', explain ? '| Where | Severity | Rule | Message | Code | Basis |' : '| Where | Severity | Rule | Message |', explain ? '| --- | --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- |');
    for (const f of r.findings) {
      const sev = f.severity === 'error' ? '**error**' : f.severity;
      const row = `| ${mdCell(`${f.file}:${f.line}:${f.column}`)} | ${sev} | ${mdCell(f.rule)} | ${mdCell(f.message)} |`;
      lines.push(explain ? `${row} ${mdCell(f.code)} | ${mdCell(f.basis.map((b) => `"${b.text}" (${b.section}, ${b.source})`).join(' '))} |` : row);
    }
  }
  if (r.ignored.length) {
    lines.push('', '| Ignored | Rule | Reason |', '| --- | --- | --- |');
    for (const x of r.ignored) lines.push(`| ${mdCell(`${x.file}:${x.line}:${x.column}`)} | ${mdCell(x.rule)} | ${mdCell(x.reason)} |`);
  }
  if (r.notes.length) lines.push('');
  for (const note of r.notes) lines.push(`- ${mdCell(note)}`);
  lines.push('', r.gate.pass ? `**Gate passed** (--fail-on ${r.gate.failOn}).` : `**Gate failed:** ${mdCell(r.gate.reason)} (--fail-on ${r.gate.failOn}).`);
  return lines.join('\n') + '\n';
}

export function toJson(r) {
  return JSON.stringify(r, null, 2) + '\n';
}
