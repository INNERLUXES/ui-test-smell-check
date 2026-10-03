// The configuration file: which rules are on, at which severity, with which numbers, which files to leave out, the fail
// level and the limits of the input. It is JSON, read with the strict reader of src/json.js, which refuses an object that
// names a key twice. Every key the tool does not know is an error, so a typo such as fixed-wiat cannot leave a rule on
// that was meant to be off, or the other way round. Every number has a documented default and a range.

import { parseJson, jsonProblem } from './json.js';
import { GLOB_LIMITS, globProblem } from './glob.js';
import { RULES, RULE_IDS, SEVERITIES } from './rules.js';
import { safeText } from './text.js';

// The options of the rules and of the limits: a whole number from min to max.
export const OPTION_RANGES = {
  minMs: { min: 0, max: 86400000 },
  hashMinLength: { min: 3, max: 64 }
};
export const LIMIT_KEYS = {
  maxFileBytes: { min: 1024, max: 64 * 1024 * 1024 },
  maxFiles: { min: 1, max: 1000000 },
  maxDepth: { min: 1, max: 256 }
};
const TOP_KEYS = ['failOn', 'rules', 'ignore', 'limits'];

export class ConfigError extends Error {
  constructor(problems) {
    super(problems.join('\n'));
    this.problems = problems;
  }
}

// The edit distance of two short words, for the "did you mean" of an unknown key.
function distance(a, b) {
  if (a.length > 40 || b.length > 40) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

function suggest(name, known) {
  const best = known.map((k) => ({ k, d: distance(name.toLowerCase(), k.toLowerCase()) })).sort((x, y) => x.d - y.d)[0];
  return best && best.d <= 3 ? `; did you mean ${best.k}?` : `; the keys are ${known.join(', ')}`;
}

const kindOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v === 'object' ? 'an object' : typeof v === 'string' ? 'a string' : typeof v === 'number' ? 'a number' : 'a boolean');

// The settings of every rule with no configuration: on, at its own severity, with its default options.
export function defaultSettings() {
  return Object.fromEntries(RULES.map((r) => [r.id, { on: true, severity: r.severity, options: { ...r.options } }]));
}

// Checks a parsed configuration and builds its normal form: { failOn, settings, ignore, limits }. lines maps a path such
// as rules.fixed-wait.minMs to its line, for the messages. Throws ConfigError with every problem.
export function validateConfig(value, lines = new Map(), file = 'config') {
  const problems = [];
  const at = (path) => `${file}${lines.has(path) ? `:${lines.get(path)}` : ''}${path ? `: ${path}` : ''}`;
  const bad = (path, message) => problems.push(`${at(path)}: ${safeText(message, 300)}`);
  const out = { failOn: null, settings: defaultSettings(), ignore: [], limits: {} };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    bad('', `must be a JSON object, not ${kindOf(value)}`);
    throw new ConfigError(problems);
  }
  const whole = (v, path, range) => {
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < range.min || v > range.max) {
      bad(path, `must be a whole number from ${range.min.toLocaleString('en-US')} to ${range.max.toLocaleString('en-US')}, not ${typeof v === 'number' ? safeText(String(v), 30) : kindOf(v)}`);
      return undefined;
    }
    return v;
  };
  const level = (v, path, allowOff) => {
    const allowed = allowOff ? [...SEVERITIES, 'off'] : SEVERITIES;
    if (typeof v !== 'string' || !allowed.includes(v)) {
      bad(path, `must be ${allowed.join(', ').replace(/, ([a-z]+)$/, ' or $1')}, not ${typeof v === 'string' ? `"${safeText(v, 30)}"` : kindOf(v)}`);
      return undefined;
    }
    return v;
  };
  for (const key of Object.keys(value)) {
    if (!TOP_KEYS.includes(key)) bad(key, `is not a key of the configuration${suggest(key, TOP_KEYS)}`);
  }
  if (Object.hasOwn(value, 'failOn')) out.failOn = level(value.failOn, 'failOn', false) ?? null;
  if (Object.hasOwn(value, 'rules')) {
    const rules = value.rules;
    if (rules === null || typeof rules !== 'object' || Array.isArray(rules)) bad('rules', `must be an object of rule ids, not ${kindOf(rules)}`);
    else {
      for (const id of Object.keys(rules)) {
        const path = `rules.${id}`;
        if (!RULE_IDS.includes(id)) {
          bad(path, `is not a rule${suggest(id, RULE_IDS)}`);
          continue;
        }
        const setting = out.settings[id];
        const v = rules[id];
        if (typeof v === 'string') {
          const l = level(v, path, true);
          if (l === 'off') setting.on = false;
          else if (l) setting.severity = l;
          continue;
        }
        if (v === null || typeof v !== 'object' || Array.isArray(v)) {
          bad(path, `must be off, a severity or an object with severity and the options of the rule, not ${kindOf(v)}`);
          continue;
        }
        const known = ['severity', ...Object.keys(setting.options)];
        for (const k of Object.keys(v)) {
          const kpath = `${path}.${k}`;
          if (!known.includes(k)) {
            bad(kpath, `is not a setting of ${id}${suggest(k, known)}`);
            continue;
          }
          if (k === 'severity') {
            const l = level(v[k], kpath, true);
            if (l === 'off') setting.on = false;
            else if (l) setting.severity = l;
          } else {
            const n = whole(v[k], kpath, OPTION_RANGES[k]);
            if (n !== undefined) setting.options[k] = n;
          }
        }
      }
    }
  }
  if (Object.hasOwn(value, 'ignore')) {
    const ignore = value.ignore;
    if (!Array.isArray(ignore)) bad('ignore', `must be a list of file patterns, not ${kindOf(ignore)}`);
    else if (ignore.length > GLOB_LIMITS.maxPatterns) bad('ignore', `holds more than ${GLOB_LIMITS.maxPatterns} patterns`);
    else {
      ignore.forEach((p, i) => {
        const problem = globProblem(p);
        if (problem) bad(`ignore[${i}]`, `the pattern ${problem}`);
        else out.ignore.push(p.startsWith('./') ? p.slice(2) : p);
      });
    }
  }
  if (Object.hasOwn(value, 'limits')) {
    const limits = value.limits;
    if (limits === null || typeof limits !== 'object' || Array.isArray(limits)) bad('limits', `must be an object, not ${kindOf(limits)}`);
    else {
      for (const k of Object.keys(limits)) {
        if (!Object.hasOwn(LIMIT_KEYS, k)) {
          bad(`limits.${k}`, `is not a limit${suggest(k, Object.keys(LIMIT_KEYS))}`);
          continue;
        }
        const n = whole(limits[k], `limits.${k}`, LIMIT_KEYS[k]);
        if (n !== undefined) out.limits[k] = n;
      }
    }
  }
  if (problems.length) throw new ConfigError(problems);
  return out;
}

// Reads the configuration from its text. Throws ConfigError, with the line and column of a JSON problem.
export function parseConfig(text, file = 'config') {
  let parsed;
  try {
    parsed = parseJson(text);
  } catch (error) {
    throw new ConfigError([`${file}: ${safeText(jsonProblem(error, text), 400)}`]);
  }
  return validateConfig(parsed.value, parsed.lines, file);
}
