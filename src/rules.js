// The rules. Each one looks at the tokens of a file (src/lex.js), never at its raw text, so nothing in a comment or a
// string is taken for code, and a selector is always the value of a string. docs/method.md gives every rule with exactly
// what it reports, for which framework, and the sentence of a saved page that it rests on. Nothing here opens a file,
// runs a test or imports the code it reads.

import { JS_MODULES } from './data.js';
import { analyseSelector, SUBSTITUTION } from './selector.js';
import { grouped } from './size.js';
import { lineStarts, positionOf, safeText } from './text.js';

export const SEVERITIES = ['error', 'warning', 'info'];
export const RANK = { error: 0, warning: 1, info: 2 };
export const meetsLevel = (severity, level) => RANK[severity] <= RANK[level];

// Every rule, in report order. facts are the keys of the sentences of src/data.js that a finding quotes, for the
// framework of the file (any is used when the framework has none of its own). options are the numbers a rule takes,
// with their defaults; the configuration file can change every one.
export const RULES = [
  { id: 'fixed-wait', severity: 'error', what: 'A wait for a fixed time: page.waitForTimeout, cy.wait with a number, driver.sleep, time.sleep, Thread.sleep and a sleep built from setTimeout', options: { minMs: 0 }, facts: { playwright: ['pwWaitFlaky', 'pwWaitNever'], cypress: ['cyWaitAnti', 'cyWaitNever'], selenium: ['seSleep', 'seFlakyCause'] } },
  { id: 'mixed-waits', severity: 'warning', what: 'A Selenium test file that sets an implicit wait and also uses an explicit wait', options: {}, facts: { selenium: ['seMix', 'seUnpredictable'] } },
  { id: 'position-selector', severity: 'warning', what: 'A selector that picks an element by its position: :nth-child and its relatives, the jQuery :eq and its relatives, nth= of Playwright, an XPath index such as [2], position() or last(), and an absolute XPath', options: {}, facts: { playwright: ['pwTiedToDom', 'pwDomChange'], cypress: ['cySelectorAnti', 'cySelectorBest'], selenium: ['seAbsoluteXpath', 'pwTiedToDom'] } },
  { id: 'nth-locator', severity: 'info', what: 'A Playwright locator narrowed to one element by its place among the matches: .first(), .last() and .nth()', options: {}, facts: { playwright: ['pwNthNotRecommended', 'pwNthCaution'] } },
  { id: 'styling-selector', severity: 'warning', what: 'A selector that picks an element by its class names, or uses a class name that a build tool made (a hash)', options: { hashMinLength: 5 }, facts: { playwright: ['pwClassChange', 'pwUserFacing'], cypress: ['cyVolatile', 'cySelectorBest'], selenium: ['seIds', 'seClassName'] } },
  { id: 'force-action', severity: 'warning', what: 'An action with force: true (force=True in Python), which turns the actionability checks off', options: {}, facts: { playwright: ['pwForce', 'pwAutoWaits'], cypress: ['cyForceSkips', 'cyForcePass'] } },
  { id: 'only-left', severity: 'error', what: 'A focused test or group left in the file: test.only, it.only, describe.only, context.only and the like', options: {}, facts: { playwright: ['pwFocused', 'pwForbidOnly'], cypress: ['cyOnly'], any: ['cyOnly'] } },
  { id: 'skipped-test', severity: 'info', what: 'A test or group declared as skipped: test.skip with a title, it.skip, describe.skip, test.fixme with a title, test.describe.fixme', options: {}, facts: { playwright: ['pwSkippedNever', 'pwSkippedGroup'], cypress: ['cySkip'], any: ['cySkip'] } },
  { id: 'order-dependence', severity: 'warning', what: 'Tests made to run in a fixed order or to share the browser: test.describe.serial, mode serial, testIsolation false, TestNG dependsOnMethods, JUnit @TestMethodOrder, pytest order and dependency marks', options: {}, facts: { playwright: ['pwSerialNotRecommended', 'pwSerialIsolated'], cypress: ['cyIndependent', 'cyDependState'], selenium: ['seAnyOrder'] } },
  { id: 'shared-state', severity: 'warning', what: 'A test that assigns a variable declared at the top of the file (let or var), or a Python test that assigns a module variable through global', options: {}, facts: { playwright: ['pwIsolation', 'pwNoRelies'], cypress: ['cyQuietlyDepend'], selenium: ['seIsolated', 'seNoShare'] } },
  { id: 'absolute-url', severity: 'info', what: 'A full http or https address passed to page.goto, cy.visit or cy.request, where a base URL in the configuration and a path would do', options: {}, facts: { playwright: ['pwBaseUrl', 'pwBaseUrlPath'], cypress: ['cyBaseUrlAnti', 'cyBaseUrlRemoves'] } }
];

export const RULE_IDS = RULES.map((r) => r.id);
export const RULE_ORDER = Object.fromEntries(RULES.map((r, i) => [r.id, i]));
const BY_ID = Object.fromEntries(RULES.map((r) => [r.id, r]));

// The facts a finding of this rule quotes for this framework.
export function factsFor(ruleId, framework) {
  const rule = BY_ID[ruleId];
  return rule.facts[framework] ?? rule.facts.any ?? Object.values(rule.facts)[0];
}

// ---- tokens --------------------------------------------------------------------------------------------------------

const isP = (t, v) => t !== undefined && t.type === 'punct' && t.value === v;
const isN = (t, v) => t !== undefined && t.type === 'name' && (v === undefined || t.value === v);
const isDot = (t) => isP(t, '.') || isP(t, '?.');
const isText = (t) => t !== undefined && (t.type === 'str' || t.type === 'tmpl');

const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = { ')': '(', ']': '[', '}': '{' };

// The brackets of a file: for each opener the index of its closer (or -1), for each token the index of the innermost
// opener around it (or -1), and the commas directly inside each opener. One pass, with an explicit stack. Template
// literals with ${...} and elements of JSX count as brackets too, so a comma inside them belongs to them.
export function structure(tokens) {
  const n = tokens.length;
  const match = new Int32Array(n).fill(-1);
  const parent = new Int32Array(n).fill(-1);
  const commas = new Map();
  const stack = [];
  const kindOf = (t) => (t.type === 'punct' ? t.value : t.type);
  for (let i = 0; i < n; i += 1) {
    const t = tokens[i];
    parent[i] = stack.length ? stack[stack.length - 1] : -1;
    const isOpen = (t.type === 'punct' && Object.hasOwn(OPEN, t.value)) || t.type === 'tmpl-head' || t.type === 'jsx';
    const closes = t.type === 'punct' && Object.hasOwn(CLOSE, t.value) ? CLOSE[t.value] : t.type === 'tmpl-tail' ? 'tmpl-head' : t.type === 'jsx-end' ? 'jsx' : null;
    if (closes !== null) {
      const top = stack.length ? stack[stack.length - 1] : -1;
      if (top >= 0 && kindOf(tokens[top]) === closes) {
        stack.pop();
        match[top] = i;
        match[i] = top;
        parent[i] = stack.length ? stack[stack.length - 1] : -1;
      }
    }
    if (isOpen) stack.push(i);
    if (t.type === 'punct' && t.value === ',' && parent[i] >= 0) {
      if (!commas.has(parent[i])) commas.set(parent[i], []);
      commas.get(parent[i]).push(i);
    }
  }
  return { match, parent, commas };
}

// The arguments of a call whose ( is at open: [{ from, to }] token ranges, and the index of the ). An empty call has no
// argument.
function argsOf(tokens, s, open) {
  const close = s.match[open] >= 0 ? s.match[open] : tokens.length;
  if (close === open + 1) return { args: [], close };
  const args = [];
  let from = open + 1;
  for (const c of s.commas.get(open) ?? []) {
    args.push({ from, to: c });
    from = c + 1;
  }
  if (from < close) args.push({ from, to: close });
  return { args, close };
}

// The value of an argument that is one string or one template literal: { value, at } with the token it starts at; the
// ${...} of a template are written as SUBSTITUTION. null for anything else.
function textArg(tokens, s, arg) {
  if (!arg) return null;
  const t = tokens[arg.from];
  if (arg.to - arg.from === 1 && isText(t)) return { value: t.value, at: t };
  if (t && t.type === 'tmpl-head' && s.match[arg.from] === arg.to - 1) {
    let value = t.value;
    for (let k = arg.from + 1; k < arg.to; k += 1) {
      const u = tokens[k];
      if ((u.type === 'tmpl-middle' && s.parent[k] === arg.from) || k === arg.to - 1) value += SUBSTITUTION + u.value;
    }
    return { value, at: t };
  }
  return null;
}

const numberArg = (tokens, arg) => (arg && arg.to - arg.from === 1 && tokens[arg.from].type === 'num' ? tokens[arg.from].value : null);

// The source text of an argument, cut short, for a message.
function argText(text, tokens, arg) {
  if (!arg || arg.to <= arg.from) return '';
  return safeText(text.slice(tokens[arg.from].start, tokens[arg.to - 1].end).replace(/\s+/g, ' '), 60);
}

// A call of a member: tokens[i] is the name after a dot, and a ( follows.
const memberCall = (tokens, i) => isN(tokens[i]) && isDot(tokens[i - 1]) && isP(tokens[i + 1], '(');
// The name the member is called on, when it is one plain name (page in page.click), else null.
const receiver = (tokens, i) => (isN(tokens[i - 2]) && !isDot(tokens[i - 3]) ? tokens[i - 2].value : null);
// A plain name that is not a member of anything.
const plainName = (tokens, i, v) => isN(tokens[i], v) && !isDot(tokens[i - 1]);

// ---- frameworks ----------------------------------------------------------------------------------------------------

// The frameworks a file uses, from its imports (and for Cypress, the cy and Cypress globals). Returns a list in the
// order of FRAMEWORKS.
export function detectFrameworks(tokens, language) {
  const found = new Set();
  if (language === 'javascript' || language === 'typescript') {
    const modules = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i];
      if (isN(t, 'from') && isText(tokens[i + 1])) modules.push(tokens[i + 1].value);
      else if ((isN(t, 'require') || isN(t, 'import')) && isP(tokens[i + 1], '(') && isText(tokens[i + 2])) modules.push(tokens[i + 2].value);
      else if (isN(t, 'import') && isText(tokens[i + 1])) modules.push(tokens[i + 1].value);
      else if ((isN(t, 'cy') || isN(t, 'Cypress')) && !isDot(tokens[i - 1]) && isDot(tokens[i + 1])) found.add('cypress');
    }
    for (const m of modules) {
      for (const [framework, names] of Object.entries(JS_MODULES)) {
        if (names.includes(m) || names.some((name) => m.startsWith(`${name}/`))) found.add(framework);
      }
    }
  } else if (language === 'python') {
    for (let i = 0; i < tokens.length; i += 1) {
      if ((isN(tokens[i], 'from') || isN(tokens[i], 'import')) && isN(tokens[i + 1])) {
        const root = tokens[i + 1].value;
        if (root === 'selenium' || root === 'seleniumbase') found.add('selenium');
        if (root === 'playwright' || root === 'pytest_playwright') found.add('playwright');
      }
    }
  } else if (language === 'java') {
    for (let i = 0; i < tokens.length; i += 1) {
      if (!isN(tokens[i], 'import')) continue;
      let j = i + 1;
      if (isN(tokens[j], 'static')) j += 1;
      if (isN(tokens[j], 'org') && isP(tokens[j + 1], '.') && isN(tokens[j + 2], 'openqa') && isP(tokens[j + 3], '.') && isN(tokens[j + 4], 'selenium')) found.add('selenium');
    }
  }
  return ['playwright', 'cypress', 'selenium'].filter((f) => found.has(f));
}

// ---- the rules -----------------------------------------------------------------------------------------------------

const PW_FORCE_ACTIONS = new Set(['check', 'clear', 'click', 'dblclick', 'dragTo', 'dragAndDrop', 'fill', 'hover', 'selectOption', 'selectText', 'setChecked', 'tap', 'uncheck']);
const PW_FORCE_ACTIONS_PY = new Set(['check', 'clear', 'click', 'dblclick', 'drag_to', 'drag_and_drop', 'fill', 'hover', 'select_option', 'select_text', 'set_checked', 'tap', 'uncheck']);
const CY_ACTIONS = new Set(['click', 'dblclick', 'rightclick', 'type', 'clear', 'check', 'uncheck', 'select', 'trigger', 'selectFile']);
const PW_SELECTOR_METHODS = new Set(['locator', '$', '$$', '$eval', '$$eval', 'waitForSelector', 'frameLocator']);
const PW_PAGE_SELECTOR_METHODS = new Set(['click', 'dblclick', 'fill', 'check', 'uncheck', 'hover', 'tap', 'type', 'press', 'selectOption', 'focus', 'textContent', 'innerText', 'innerHTML', 'getAttribute', 'inputValue', 'isChecked', 'isDisabled', 'isEditable', 'isEnabled', 'isHidden', 'isVisible', 'setInputFiles', 'dispatchEvent', 'dragAndDrop']);
const PW_SELECTOR_METHODS_PY = new Set(['locator', 'query_selector', 'query_selector_all', 'wait_for_selector', 'eval_on_selector', 'eval_on_selector_all', 'frame_locator']);
const PW_PAGE_SELECTOR_METHODS_PY = new Set(['click', 'dblclick', 'fill', 'check', 'uncheck', 'hover', 'tap', 'type', 'press', 'select_option', 'focus', 'text_content', 'inner_text', 'inner_html', 'get_attribute', 'input_value', 'is_checked', 'is_disabled', 'is_editable', 'is_enabled', 'is_hidden', 'is_visible', 'set_input_files', 'dispatch_event', 'drag_and_drop']);
const CY_SELECTOR_METHODS = new Set(['find', 'children', 'closest', 'parent', 'parents', 'parentsUntil', 'siblings', 'next', 'nextAll', 'nextUntil', 'prev', 'prevAll', 'prevUntil', 'filter', 'not']);
const TEST_ROOTS = new Set(['test', 'it', 'describe', 'context', 'specify', 'suite']);
const GROUP_ROOTS = new Set(['describe', 'context', 'suite']);
const CHAIN_MEMBERS = new Set(['describe', 'parallel', 'serial', 'fail']);
const ASSIGNMENT = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??=']);
const DECLARATION = new Set(['let', 'const', 'var', 'function', 'class']);
const TIME_UNITS = { NANOSECONDS: 1e-6, MICROSECONDS: 1e-3, MILLISECONDS: 1, SECONDS: 1000, MINUTES: 60000, HOURS: 3600000, DAYS: 86400000 };
const DURATION_UNITS = { ofMillis: 1, ofSeconds: 1000, ofMinutes: 60000, ofNanos: 1e-6 };

// Runs the rules on the tokens of one file. ctx: { text, tokens, language, frameworks, settings } where settings[id] is
// { on, severity, options }. Returns raw findings: { rule, framework, at (a token), message }.
export function runRules(ctx) {
  const { tokens, language, frameworks, settings, text } = ctx;
  const s = structure(tokens);
  const out = [];
  const main = frameworks[0];
  const has = (f) => frameworks.includes(f);
  const on = (id) => settings[id]?.on !== false;
  const report = (rule, framework, at, message) => {
    if (on(rule)) out.push({ rule, framework: framework ?? main, at, message: safeText(message, 300) });
  };
  const js = language === 'javascript' || language === 'typescript';
  const py = language === 'python';
  const java = language === 'java';

  // fixed-wait: a known duration below minMs is left out; an unknown one is reported.
  const minMs = settings['fixed-wait']?.options?.minMs ?? 0;
  const wait = (framework, at, label, ms) => {
    if (ms !== null && Number.isFinite(ms) && ms < minMs) return;
    const amount = ms !== null && Number.isFinite(ms) ? `a fixed ${grouped(Math.round(ms * 1000) / 1000)} ms` : 'a fixed time';
    report('fixed-wait', framework, at, `${label} waits ${amount}; wait for a condition the page shows instead`);
  };
  // The selectors to read: { at, value, kind, framework, label }.
  const sites = [];
  const site = (framework, arg, kind, label) => {
    const v = textArg(tokens, s, arg);
    if (v && v.value.length <= 10000) sites.push({ framework, at: v.at, value: v.value, kind, label });
  };

  // Python: from time import sleep (with an alias) makes a plain sleep() a wait.
  const sleepNames = new Set();
  if (py) {
    for (let i = 0; i < tokens.length; i += 1) {
      if (!(isN(tokens[i], 'from') && isN(tokens[i + 1], 'time') && isN(tokens[i + 2], 'import'))) continue;
      for (let j = i + 3; j < tokens.length && !(tokens[j].nl && s.parent[j] === -1); j += 1) {
        if (isN(tokens[j], 'sleep')) sleepNames.add(isN(tokens[j + 1], 'as') && isN(tokens[j + 2]) ? tokens[j + 2].value : 'sleep');
      }
    }
  }

  let implicitWait = null;
  let explicitWait = null;

  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type !== 'name' && t.type !== 'punct') continue;
    const name = t.value;
    const call = memberCall(tokens, i);
    const recv = call ? receiver(tokens, i) : null;
    const a = call ? argsOf(tokens, s, i + 1) : null;

    // ---- fixed-wait
    if (call && js && has('playwright') && name === 'waitForTimeout') wait('playwright', t, `waitForTimeout(${argText(text, tokens, a.args[0])})`, numberArg(tokens, a.args[0]));
    if (call && py && has('playwright') && name === 'wait_for_timeout') wait('playwright', t, `wait_for_timeout(${argText(text, tokens, a.args[0])})`, numberArg(tokens, a.args[0]));
    if (call && js && has('cypress') && name === 'wait' && numberArg(tokens, a.args[0]) !== null) wait('cypress', t, `cy.wait(${argText(text, tokens, a.args[0])})`, numberArg(tokens, a.args[0]));
    if (call && js && has('selenium') && name === 'sleep') wait('selenium', t, `sleep(${argText(text, tokens, a.args[0])})`, numberArg(tokens, a.args[0]));
    if (js && frameworks.length && isN(t, 'setTimeout') && isP(tokens[i + 1], '(') && (!isDot(tokens[i - 1]) || ['window', 'globalThis'].includes(receiver(tokens, i)))) {
      const sa = argsOf(tokens, s, i + 1);
      const awaited = isN(tokens[i - 1], 'await') || (isDot(tokens[i - 1]) && isN(tokens[i - 3], 'await'));
      if (awaited || insidePromise(tokens, s, i)) {
        const ms = awaited && sa.args.length <= 2 && numberArg(tokens, sa.args[0]) !== null ? numberArg(tokens, sa.args[0]) : numberArg(tokens, sa.args[1]);
        wait(main, t, 'setTimeout used as a sleep', ms);
      }
    }
    if (py && frameworks.length) {
      if (call && name === 'sleep' && (recv === 'time' || recv === 'asyncio')) wait(main, t, `${recv}.sleep(${argText(text, tokens, a.args[0])})`, secondsArg(tokens, a.args[0]));
      else if (!call && plainName(tokens, i) && sleepNames.has(name) && isP(tokens[i + 1], '(') && !isN(tokens[i - 1], 'def') && !isN(tokens[i - 1], 'import') && !isN(tokens[i - 1], 'as')) {
        const pa = argsOf(tokens, s, i + 1);
        wait(main, t, `${name}(${argText(text, tokens, pa.args[0])})`, secondsArg(tokens, pa.args[0]));
      }
    }
    if (java && frameworks.length && call && name === 'sleep') {
      const unit = isN(tokens[i - 2]) && isDot(tokens[i - 3]) && isN(tokens[i - 4], 'TimeUnit') ? TIME_UNITS[tokens[i - 2].value] : null;
      if (recv === 'Thread' || unit !== undefined && unit !== null) {
        const factor = recv === 'Thread' ? 1 : unit;
        const n = numberArg(tokens, a.args[0]);
        const ms = n !== null ? n * factor : recv === 'Thread' ? durationMs(tokens, a.args[0]) : null;
        wait(main, t, `${recv === 'Thread' ? 'Thread' : `TimeUnit.${tokens[i - 2].value}`}.sleep(${argText(text, tokens, a.args[0])})`, ms);
      }
    }

    // ---- mixed-waits (Selenium): an implicit wait that is not 0, and an explicit wait anywhere in the file.
    if (has('selenium')) {
      if (call && java && name === 'implicitlyWait' && !zeroDuration(tokens, a.args[0])) implicitWait ??= t;
      if (call && py && name === 'implicitly_wait' && numberArg(tokens, a.args[0]) !== 0) implicitWait ??= t;
      if (call && js && name === 'setTimeouts' && a.args[0] && isP(tokens[a.args[0].from], '{')) {
        for (let k = a.args[0].from + 1; k < a.args[0].to; k += 1) {
          if (isN(tokens[k], 'implicit') && isP(tokens[k + 1], ':') && s.parent[k] === a.args[0].from && !(tokens[k + 2]?.type === 'num' && tokens[k + 2].value === 0)) implicitWait ??= t;
        }
      }
      if ((java && isN(t, 'new') && (isN(tokens[i + 1], 'WebDriverWait') || isN(tokens[i + 1], 'FluentWait'))) || (py && plainName(tokens, i, 'WebDriverWait') && isP(tokens[i + 1], '(')) || (js && call && name === 'wait')) explicitWait ??= t;
    }

    // ---- selectors
    if (call && js && has('playwright') && (PW_SELECTOR_METHODS.has(name) || (PW_PAGE_SELECTOR_METHODS.has(name) && (recv === 'page' || recv === 'frame')))) {
      site('playwright', a.args[0], 'playwright', name);
      if (name === 'dragAndDrop') site('playwright', a.args[1], 'playwright', name);
    }
    if (call && py && has('playwright') && (PW_SELECTOR_METHODS_PY.has(name) || (PW_PAGE_SELECTOR_METHODS_PY.has(name) && (recv === 'page' || recv === 'frame')))) {
      site('playwright', a.args[0], 'playwright', name);
      if (name === 'drag_and_drop') site('playwright', a.args[1], 'playwright', name);
    }
    if (call && js && has('cypress')) {
      if (name === 'get' && recv === 'cy') site('cypress', a.args[0], 'jquery', 'cy.get');
      else if (name === 'contains' && a.args.length >= 2) site('cypress', a.args[0], 'jquery', 'cy.contains');
      else if (CY_SELECTOR_METHODS.has(name)) site('cypress', a.args[0], 'jquery', name);
    }
    if (call && (js || java) && has('selenium') && recv === 'By') {
      if (name === 'css' || name === 'cssSelector') site('selenium', a.args[0], 'css', `By.${name}`);
      else if (name === 'xpath') site('selenium', a.args[0], 'xpath', 'By.xpath');
      else if (name === 'className') site('selenium', a.args[0], 'class', 'By.className');
    }
    if (js && has('selenium') && ['css', 'xpath', 'className'].includes(name) && t.type === 'name' && isP(tokens[i + 1], ':') && (isP(tokens[i - 1], '{') || isP(tokens[i - 1], ','))) {
      const kind = name === 'className' ? 'class' : name;
      site('selenium', { from: i + 2, to: i + 3 }, kind, name);
    }
    if (py && has('selenium')) {
      if (isN(t, 'By') && isDot(tokens[i + 1]) && isN(tokens[i + 2]) && isP(tokens[i + 3], ',')) {
        const kind = { CSS_SELECTOR: 'css', XPATH: 'xpath', CLASS_NAME: 'class' }[tokens[i + 2].value];
        if (kind) site('selenium', { from: i + 4, to: i + 5 }, kind, `By.${tokens[i + 2].value}`);
      }
      const legacy = call ? /^find_elements?_by_(css_selector|xpath|class_name)$/.exec(name) : null;
      if (legacy) site('selenium', a.args[0], { css_selector: 'css', xpath: 'xpath', class_name: 'class' }[legacy[1]], name);
    }
    if (java && has('selenium') && isP(t, '@') && isN(tokens[i + 1], 'FindBy') && isP(tokens[i + 2], '(')) {
      const fa = argsOf(tokens, s, i + 2);
      let how = null;
      for (const arg of fa.args) {
        const key = tokens[arg.from];
        if (!isN(key) || !isP(tokens[arg.from + 1], '=')) continue;
        const valueArg = { from: arg.from + 2, to: arg.to };
        if (['css', 'xpath', 'className'].includes(key.value)) site('selenium', valueArg, key.value === 'className' ? 'class' : key.value, `@FindBy(${key.value})`);
        if (key.value === 'how' && isN(tokens[arg.to - 1])) how = { CSS: 'css', XPATH: 'xpath', CLASS_NAME: 'class' }[tokens[arg.to - 1].value] ?? null;
        if (key.value === 'using' && how) site('selenium', valueArg, how, '@FindBy(using)');
      }
    }

    // ---- nth-locator (Playwright)
    if (has('playwright') && isDot(tokens[i - 1]) && isN(t)) {
      if (js && call && ((name === 'first' || name === 'last') && a.args.length === 0)) report('nth-locator', 'playwright', t, `.${name}() picks one of several matching elements by its place`);
      else if ((js || py) && call && name === 'nth') report('nth-locator', 'playwright', t, `.nth(${argText(text, tokens, a.args[0])}) picks one of several matching elements by its place`);
      else if (py && !call && (name === 'first' || name === 'last') && !isP(tokens[i + 1], '=')) report('nth-locator', 'playwright', t, `.${name} picks one of several matching elements by its place`);
    }

    // ---- force-action
    if (call && js && ((has('playwright') && PW_FORCE_ACTIONS.has(name)) || (has('cypress') && CY_ACTIONS.has(name)))) {
      for (const arg of a.args) {
        if (!isP(tokens[arg.from], '{')) continue;
        for (let k = arg.from + 1; k < arg.to; k += 1) {
          if (s.parent[k] === arg.from && isN(tokens[k], 'force') && isP(tokens[k + 1], ':') && isN(tokens[k + 2], 'true')) {
            report('force-action', has('playwright') && PW_FORCE_ACTIONS.has(name) ? 'playwright' : 'cypress', tokens[k], `${name}({ force: true }) turns the actionability checks off`);
          }
        }
      }
    }
    if (call && py && has('playwright') && PW_FORCE_ACTIONS_PY.has(name)) {
      for (const arg of a.args) {
        if (isN(tokens[arg.from], 'force') && isP(tokens[arg.from + 1], '=') && isN(tokens[arg.from + 2], 'True')) report('force-action', 'playwright', tokens[arg.from], `${name}(force=True) turns the actionability checks off`);
      }
    }

    // ---- only-left, skipped-test and the serial groups of order-dependence (JavaScript)
    if (js && frameworks.length && plainName(tokens, i) && TEST_ROOTS.has(name)) {
      const chain = [];
      let j = i + 1;
      while (isDot(tokens[j]) && isN(tokens[j + 1]) && CHAIN_MEMBERS.has(tokens[j + 1].value)) {
        chain.push(tokens[j + 1]);
        j += 2;
      }
      const label = [name, ...chain.map((c) => c.value)].join('.');
      const serial = chain.find((c) => c.value === 'serial');
      if (serial && name === 'test' && (isP(tokens[j], '(') || (isDot(tokens[j]) && isN(tokens[j + 1], 'only')))) report('order-dependence', 'playwright', serial, `${label} makes the tests of the group run in order, each one after the one before`);
      if (isDot(tokens[j]) && isN(tokens[j + 1]) && isP(tokens[j + 2], '(')) {
        const member = tokens[j + 1];
        const group = GROUP_ROOTS.has(name) || chain.some((c) => c.value === 'describe');
        if (member.value === 'only') report('only-left', null, member, `${label}.only leaves only the focused ${group ? 'groups' : 'tests'} to run, and every other test is skipped`);
        if (member.value === 'skip' || member.value === 'fixme') {
          const ca = argsOf(tokens, s, j + 2);
          const titled = textArg(tokens, s, ca.args[0]) !== null;
          if (group || titled) report('skipped-test', null, member, `${label}.${member.value} declares a ${group ? 'group of tests' : 'test'} that is never run`);
        }
        if (member.value === 'configure' && name === 'test' && chain.some((c) => c.value === 'describe')) {
          const ca = argsOf(tokens, s, j + 2);
          const arg = ca.args[0];
          if (arg && isP(tokens[arg.from], '{')) {
            for (let k = arg.from + 1; k < arg.to; k += 1) {
              if (s.parent[k] === arg.from && isN(tokens[k], 'mode') && isP(tokens[k + 1], ':') && isText(tokens[k + 2]) && tokens[k + 2].value === 'serial') report('order-dependence', 'playwright', tokens[k + 2], "test.describe.configure({ mode: 'serial' }) makes the tests run in order, each one after the one before");
            }
          }
        }
      }
    }
    if (js && has('cypress') && isN(t, 'testIsolation') && isP(tokens[i + 1], ':') && isN(tokens[i + 2], 'false')) report('order-dependence', 'cypress', t, 'testIsolation: false keeps the state of the browser from one test to the next');
    if (java && frameworks.length && (isN(t, 'dependsOnMethods') || isN(t, 'dependsOnGroups')) && isP(tokens[i + 1], '=')) report('order-dependence', main, t, `${name} makes this test wait for other tests, and fail or skip with them`);
    if (java && frameworks.length && isP(t, '@') && isN(tokens[i + 1], 'TestMethodOrder')) report('order-dependence', main, tokens[i + 1], '@TestMethodOrder fixes the order in which the tests of the class run');
    if (py && frameworks.length && isN(t, 'pytest') && isDot(tokens[i + 1]) && isN(tokens[i + 2], 'mark') && isDot(tokens[i + 3]) && isN(tokens[i + 4]) && isP(tokens[i + 5], '(')) {
      const mark = tokens[i + 4].value;
      const ma = argsOf(tokens, s, i + 5);
      const keys = ma.args.map((arg) => (isN(tokens[arg.from]) && isP(tokens[arg.from + 1], '=') ? tokens[arg.from].value : null));
      if (mark === 'order' || (mark === 'run' && keys.includes('order')) || (mark === 'dependency' && keys.includes('depends'))) report('order-dependence', main, tokens[i + 4], `pytest.mark.${mark} makes this test depend on the order of the tests`);
    }

    // ---- absolute-url
    if (call && (js || py) && has('playwright') && name === 'goto') urlSite('playwright', a.args[0], 'goto');
    if (call && js && has('cypress') && (name === 'visit' || name === 'request') && recv === 'cy') urlSite('cypress', a.args[0], `cy.${name}`);
  }

  function urlSite(framework, arg, label) {
    const v = textArg(tokens, s, arg);
    if (v && /^https?:\/\//i.test(v.value)) report('absolute-url', framework, v.at, `${label}("${safeText(v.value.split(SUBSTITUTION).join('${...}'), 80)}") opens a full address; set the base URL in the configuration and pass the path`);
  }

  if (implicitWait && explicitWait) {
    const line = lineOf(text, explicitWait.start);
    report('mixed-waits', 'selenium', implicitWait, `${implicitWait.value} sets an implicit wait, and this file also uses an explicit wait (line ${line})`);
  }

  // Selectors: position-selector and styling-selector.
  const hashMinLength = settings['styling-selector']?.options?.hashMinLength ?? 5;
  for (const x of sites) {
    const r = analyseSelector(x.value, x.kind, { hashMinLength });
    const shown = safeText(x.value.split(SUBSTITUTION).join('${...}'), 120);
    if (r.position.length) {
      const p = r.position[0];
      const what = p.why === 'absolute' ? 'starts at the root of the document, so it follows every level of the page' : `picks the element by its position: ${safeText(p.text.split(SUBSTITUTION).join('${...}'), 60)}`;
      report('position-selector', x.framework, x.at, `${x.label} "${shown}" ${what}`);
    }
    if (r.styling) {
      const st = r.styling;
      const what = st.hashed ? `uses the class ${safeText(st.text, 60)}, ${st.why}` : st.why === 'class-locator' ? 'locates the element by a class name' : st.why === 'xpath-class' ? 'tests the class attribute (@class)' : 'picks the element by its class names';
      report('styling-selector', x.framework, x.at, `${x.label} "${shown}" ${what}`);
    }
  }

  if (js && frameworks.length) sharedStateJs(tokens, s, report);
  if (py && frameworks.length) sharedStatePython(text, tokens, s, report, main);
  return out;
}

// The line (from 1) of an offset, counted as the lines of every finding are.
const lineOf = (text, offset) => positionOf(lineStarts(text), offset).line;

// Seconds in a Python argument, as milliseconds; null when the argument is not one number.
function secondsArg(tokens, arg) {
  const n = numberArg(tokens, arg);
  return n === null ? null : n * 1000;
}

// A Java Duration.ofSeconds(n) and its relatives as milliseconds; null for anything else.
function durationMs(tokens, arg) {
  if (!arg) return null;
  const t = tokens;
  const f = arg.from;
  if (isN(t[f], 'Duration') && isDot(t[f + 1]) && isN(t[f + 2]) && Object.hasOwn(DURATION_UNITS, t[f + 2].value) && isP(t[f + 3], '(') && t[f + 4]?.type === 'num' && isP(t[f + 5], ')') && arg.to === f + 6) return t[f + 4].value * DURATION_UNITS[t[f + 2].value];
  return null;
}

// Whether a Java or JavaScript argument is a wait of zero: 0, Duration.ZERO or Duration.ofSeconds(0) and its relatives.
function zeroDuration(tokens, arg) {
  if (!arg) return false;
  if (numberArg(tokens, arg) === 0) return true;
  if (arg.to - arg.from === 3 && isN(tokens[arg.from], 'Duration') && isN(tokens[arg.from + 2], 'ZERO')) return true;
  return durationMs(tokens, arg) === 0;
}

// Whether the token sits inside the arguments of new Promise(...), up to four brackets out.
function insidePromise(tokens, s, i) {
  let p = s.parent[i];
  for (let depth = 0; p >= 0 && depth < 6; depth += 1) {
    if (isP(tokens[p], '(') && isN(tokens[p - 1], 'Promise') && isN(tokens[p - 2], 'new')) return true;
    p = s.parent[p];
  }
  return false;
}

// shared-state in JavaScript: the variables declared with let or var at the top of the file, and the tests (test, it,
// specify, with .only, .skip, .fixme or .fail) whose callback assigns one of them. A name that the test declares again,
// or that is a parameter inside it, is its own variable and is left out.
function sharedStateJs(tokens, s, report) {
  const shared = new Map();
  for (let i = 0; i < tokens.length; i += 1) {
    if (s.parent[i] !== -1 || !(isN(tokens[i], 'let') || isN(tokens[i], 'var'))) continue;
    let j = i + 1;
    for (;;) {
      if (isN(tokens[j]) && !shared.has(tokens[j].value)) shared.set(tokens[j].value, tokens[j]);
      j += 1;
      let next = false;
      while (j < tokens.length) {
        const u = tokens[j];
        if (s.parent[j] !== -1) {
          j += 1;
          continue;
        }
        if (isP(u, ',')) {
          next = true;
          j += 1;
          break;
        }
        if (isP(u, ';')) break;
        if (u.nl && !isP(tokens[j - 1], ',') && !isP(tokens[j - 1], '=') && u.type !== 'punct') break;
        j += 1;
      }
      if (!next) break;
    }
  }
  if (!shared.size) return;
  for (let i = 0; i < tokens.length; i += 1) {
    if (!(isN(tokens[i]) && ['test', 'it', 'specify'].includes(tokens[i].value) && !isDot(tokens[i - 1]))) continue;
    let j = i + 1;
    while (isDot(tokens[j]) && isN(tokens[j + 1]) && ['only', 'skip', 'fixme', 'fail'].includes(tokens[j + 1].value)) j += 2;
    if (!isP(tokens[j], '(')) continue;
    const { args } = argsOf(tokens, s, j);
    const last = args[args.length - 1];
    if (!last) continue;
    const body = callbackBody(tokens, s, last, j);
    if (!body) continue;
    const local = new Set(body.params);
    for (let k = body.from; k < body.to; k += 1) {
      if (DECLARATION.has(tokens[k].value) && tokens[k].type === 'name' && isN(tokens[k + 1])) local.add(tokens[k + 1].value);
      if (isP(tokens[k], '=>')) {
        if (isN(tokens[k - 1])) local.add(tokens[k - 1].value);
        else if (isP(tokens[k - 1], ')') && s.match[k - 1] >= 0) for (let m = s.match[k - 1] + 1; m < k - 1; m += 1) if (isN(tokens[m]) && (isP(tokens[m + 1], ',') || isP(tokens[m + 1], ')') || isP(tokens[m + 1], '=') || isP(tokens[m + 1], ':') || isP(tokens[m + 1], '}'))) local.add(tokens[m].value);
      }
    }
    const seen = new Set();
    for (let k = body.from; k < body.to; k += 1) {
      const u = tokens[k];
      if (!isN(u) || !shared.has(u.value) || local.has(u.value) || seen.has(u.value) || isDot(tokens[k - 1])) continue;
      const assigned = (tokens[k + 1]?.type === 'punct' && (ASSIGNMENT.has(tokens[k + 1].value) || tokens[k + 1].value === '++' || tokens[k + 1].value === '--')) || isP(tokens[k - 1], '++') || isP(tokens[k - 1], '--');
      const key = (isP(tokens[k - 1], '{') || isP(tokens[k - 1], ',')) && isP(tokens[k + 1], ':');
      if (!assigned || key) continue;
      seen.add(u.value);
      report('shared-state', null, u, `the test assigns ${u.value}, a variable declared at the top of the file and shared by every test in it`);
    }
  }
}

// The body of the callback in an argument: the block after => or after function(...), as a token range, and the names
// of its parameters.
function callbackBody(tokens, s, arg, open) {
  for (let k = arg.from; k < arg.to; k += 1) {
    if (s.parent[k] !== open) continue;
    const t = tokens[k];
    let paramsFrom = -1;
    let paramsTo = -1;
    let bodyAt = -1;
    if (isP(t, '=>')) {
      bodyAt = k + 1;
      if (isP(tokens[k - 1], ')') && s.match[k - 1] >= 0) {
        paramsFrom = s.match[k - 1] + 1;
        paramsTo = k - 1;
      } else if (isN(tokens[k - 1])) {
        paramsFrom = k - 1;
        paramsTo = k;
      }
    } else if (isN(t, 'function')) {
      let p = k + 1;
      if (isN(tokens[p])) p += 1;
      if (!isP(tokens[p], '(') || s.match[p] < 0) continue;
      paramsFrom = p + 1;
      paramsTo = s.match[p];
      bodyAt = s.match[p] + 1;
    } else continue;
    const params = [];
    for (let m = paramsFrom; m >= 0 && m < paramsTo; m += 1) if (isN(tokens[m])) params.push(tokens[m].value);
    if (isP(tokens[bodyAt], '{') && s.match[bodyAt] > bodyAt) return { from: bodyAt + 1, to: s.match[bodyAt], params };
    return { from: bodyAt, to: arg.to, params };
  }
  return null;
}

// shared-state in Python: a global statement inside a function whose name starts with test.
function sharedStatePython(text, tokens, s, report, framework) {
  const defs = [];
  let lineIndent = 0;
  for (let k = 0; k < tokens.length; k += 1) {
    const t = tokens[k];
    const lineStart = (k === 0 || t.nl) && s.parent[k] === -1;
    if (lineStart) {
      let from = t.start;
      while (from > 0 && text.charCodeAt(from - 1) !== 10 && text.charCodeAt(from - 1) !== 13) from -= 1;
      lineIndent = t.start - from;
      while (defs.length && defs[defs.length - 1].indent >= lineIndent) defs.pop();
    }
    if (isN(t, 'def') && isN(tokens[k + 1]) && s.parent[k] === -1) defs.push({ name: tokens[k + 1].value, indent: lineIndent });
    if (lineStart && isN(t, 'global') && defs.length && defs[defs.length - 1].name.startsWith('test')) {
      for (let j = k + 1; j < tokens.length && !(tokens[j].nl && s.parent[j] === -1); j += 1) {
        if (isN(tokens[j]) && (isP(tokens[j - 1], ',') || j === k + 1)) report('shared-state', framework, tokens[j], `the test ${defs[defs.length - 1].name} assigns the module variable ${tokens[j].value} through global, which every test in the file shares`);
        if (isP(tokens[j], ';')) break;
      }
    }
  }
}
