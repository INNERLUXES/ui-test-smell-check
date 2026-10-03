// Command line: ui-test-smell-check <file or folder>... [options]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIMITS, checkPaths } from './check.js';
import { ConfigError, defaultSettings, parseConfig } from './config.js';
import { decodeText, displayPath, readBounded } from './files.js';
import { RULES, SEVERITIES } from './rules.js';
import { toJson, toMarkdown, toText } from './report.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson };

export const USAGE = `Usage: ui-test-smell-check <file or folder>... [options]

Reads UI test files written for Playwright, Cypress or Selenium WebDriver (JavaScript and TypeScript, Python and Java)
and lists the patterns that make UI tests flaky or brittle, each with its file, line, column, rule, a one-line reason
and the page it rests on. The files are read as text by the tool's own lexers: no test is run, no file is imported or
evaluated, no symbolic link inside a folder is followed, and no network connection is opened.

Options:
  --config <file>     a JSON configuration: rules on or off, severities, options, ignore patterns, limits
  --format <name>     text, markdown or json (default: text)
  --fail-on <level>   exit with 1 when a finding is at this level or above: error, warning or info
                      (default: error, or failOn in the configuration)
  --explain           show the line of code of each finding and the sentences of the pages it rests on
  --help              show this text
  --version           show the version

Rules: ${RULES.map((r) => `${r.id} (${r.severity})`).join(', ')}.

Exit codes: 0 no finding at the fail level or above, 1 such a finding, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

export function parseArgs(argv) {
  const o = { paths: [], config: null, format: 'text', failOn: null, explain: false, help: false, version: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--format') o.format = next();
    else if (a === '--fail-on') o.failOn = next();
    else if (a === '--config') {
      if (o.config !== null) throw new Error('--config is given twice');
      o.config = next();
    } else if (a === '--explain') o.explain = true;
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file or a folder');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else o.paths.push(a);
  }
  if (!o.help && !o.version) {
    if (!o.paths.length) throw new Error('give at least one test file or folder');
    for (const p of [...o.paths, o.config].filter(Boolean)) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown or json)`);
    if (o.failOn !== null && !SEVERITIES.includes(o.failOn)) throw new Error(`--fail-on takes error, warning or info, not ${o.failOn}`);
  }
  return o;
}

const clean = (text) => safeText(text, 1500);

// Reads the configuration file named with --config.
async function loadConfig(path, base) {
  const full = resolve(base, path);
  const shown = displayPath(full, base);
  let text;
  try {
    text = decodeText(await readBounded(full, 1024 * 1024));
  } catch (error) {
    throw new ConfigError([`${shown}: ${error.reason ?? error.message}`]);
  }
  return { ...parseConfig(text, shown), shown };
}

// Exit code: 0 no finding at the fail level or above, 1 such a finding, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = LIMITS, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`ui-test-smell-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  let report;
  try {
    const config = o.config ? await loadConfig(o.config, base) : { failOn: null, settings: defaultSettings(), ignore: [], limits: {}, shown: null };
    report = await checkPaths(o.paths, {
      base,
      settings: config.settings,
      ignore: config.ignore,
      failOn: o.failOn ?? config.failOn ?? 'error',
      limits: { ...LIMITS, ...limits, ...config.limits },
      version: VERSION,
      configFile: config.shown
    });
  } catch (error) {
    const text = error instanceof ConfigError ? error.problems.map(clean).join('\n') : clean(error.message);
    io.err(`ui-test-smell-check: ${text}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report, { explain: o.explain }));
  return report.gate.pass ? 0 : 1;
}
