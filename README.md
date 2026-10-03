# ui-test-smell-check

Lists the patterns that make UI tests flaky or brittle in Playwright, Cypress and Selenium WebDriver test files: fixed waits, selectors tied to the position of an element or to the classes that style it, forced actions, focused and skipped tests left in, tests that depend on their order or share state, implicit and explicit waits mixed, and full addresses where a base URL would do. Each finding has its file, line, column, rule id, a one-line reason, and the sentence of the framework's own documentation that it rests on. It reads JavaScript and TypeScript (`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`), Python (`.py`) and Java (`.java`).

A flaky UI test is rarely a mystery. It waits three seconds because the page was slow once, it clicks the third `div` because that was where the button was, it forces a click through an overlay, or it needs the test before it to have run. The documentation of each framework names these patterns and says why they break. Playwright: "Tests that wait for time are inherently flaky." Cypress: "Anti-Pattern: Using highly brittle selectors that are subject to change." Selenium: "Do not mix implicit and explicit waits." This tool finds them in the code, on every change, before they show up as a red build that passes on a rerun.

- **It reads, it never runs.** The files are lexed by the tool's own small lexers: comments, strings, template literals, regular expressions, JSX, Python strings and Java text blocks are read as what they are. So `// page.waitForTimeout(500)` in a comment is not reported, and a selector is always read from the value of a string. No test is run, no file is imported or evaluated, no link inside a folder is followed, and no connection is opened.
- **Every rule says exactly what it reports.** [docs/method.md](docs/method.md) lists, for each rule and framework, the calls and the patterns that are reported and the near misses that are not.
- **Every finding says where the advice comes from.** `--explain` shows the line of code and the sentences of the Playwright, Cypress or Selenium documentation the finding rests on. The pages are saved in [research/sources](research/sources), and a test compares every quoted sentence with them.
- **You decide what matters.** A JSON configuration turns rules off, sets their severity and every number they use, and leaves files out with patterns. An ignore comment turns a rule off for one line, and only with a reason, which the report shows. Unknown keys and keys named twice are refused.
- Reports as text, Markdown and JSON, with an exit code for a pipeline gate: `0` no finding at the fail level, `1` such a finding, `2` usage or input error.
- Plain JavaScript, no dependencies; the same files always give the same report, with LF or CRLF line ends.

```
npm test
```

```
tests 123
pass 119
fail 0
skipped 4
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a system other than Windows: a symbolic link out of a test folder and in a loop, a folder named through a link, a device behind a link, and a file name with a control character. They are guarded with `process.platform`, and run on Linux and macOS; the one test that needs Windows is skipped elsewhere. None of them asserts a line or a column.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/ui-test-smell-check.git
cd ui-test-smell-check
node bin/ui-test-smell-check.js examples/shop --config examples/config.json
```

Or without a clone, on the tests of your own project:

```
npx --yes github:INNERLUXES/ui-test-smell-check tests e2e cypress
```

`examples/shop` holds the made-up UI tests of a small web shop that sells rain jackets and boots: Playwright tests in TypeScript with a page object, Cypress tests in JavaScript and TypeScript, and Selenium tests in Python, Java and JavaScript. Some tests are written well, and some hold the patterns the tool looks for. `examples/config.json` raises two rules to warnings and leaves the `legacy` folder out.

## Usage

```
node bin/ui-test-smell-check.js examples/shop --config examples/config.json
```

The report starts with what was read and the count of findings, then the findings of each file, in the order of their lines. The first part of it:

```
ui-test-smell-check: examples/shop
files: 10 files read, 9 with a UI test framework (Playwright 4, Cypress 2, Selenium 3), 1 without, 0 not read
rules: 11 rules on; fail level error; configuration examples/config.json
findings: 6 error, 26 warning, 2 info; 1 ignored by a comment with a reason

examples/shop/cypress/e2e/account.cy.ts (Cypress)
  1:23     WARNING  order-dependence   testIsolation: false keeps the state of the browser from one test to the next

examples/shop/cypress/e2e/cart.cy.js (Cypress)
  10:8     ERROR    fixed-wait         cy.wait(1500) waits a fixed 1,500 ms; wait for a condition the page shows instead
  11:12    WARNING  styling-selector   cy.get ".cart-badge" picks the element by its class names
  13:7     WARNING  shared-state       the test assigns cartId, a variable declared at the top of the file and shared by every test in it
  17:6     ERROR    only-left          it.only leaves only the focused tests to run, and every other test is skipped
  18:14    WARNING  absolute-url       cy.visit("http://localhost:8080/cart") opens a full address; set the base URL in the configuration and pass the path
  19:12    WARNING  position-selector  cy.get "ul.cart-items li:nth-child(2) button" picks the element by its position: :nth-child(2)
  19:60    WARNING  force-action       click({ force: true }) turns the actionability checks off

examples/shop/playwright/checkout.spec.ts (Playwright)
  17:24    WARNING  position-selector  locator "#checkout-form > div:nth-child(3) > button" picks the element by its position: :nth-child(3)
  18:16    ERROR    fixed-wait         waitForTimeout(3000) waits a fixed 3,000 ms; wait for a condition the page shows instead
  19:24    WARNING  styling-selector   locator ".css-1q2w3e4" uses the class css-1q2w3e4, a CSS-in-JS class name of the form css-<hash> (Emotion and others)
  19:48    WARNING  force-action       click({ force: true }) turns the actionability checks off
  20:5     WARNING  shared-state       the test assigns orderNumber, a variable declared at the top of the file and shared by every test in it
  24:21    WARNING  absolute-url       goto("https://shop.example.test/account/orders") opens a full address; set the base URL in the configuration and pass the path
  25:40    WARNING  nth-locator        .nth(1) picks one of several matching elements by its place
  28:8     INFO     skipped-test       test.skip declares a test that is never run
```

The whole report is in [examples/output/shop.txt](examples/output/shop.txt). It goes on with the page object, the Selenium tests in three languages, the wait that a comment ignored with its reason, and notes: an ignore comment with no reason that was not applied, the legacy file left out by the configuration, and the test data file that uses no framework. It ends with `GATE: FAIL - 6 errors (--fail-on error)`, and the exit code is `1`. The well written test file of the shop has no finding, and the comments and strings in it that look like smells are not reported: `waitForTimeout` in a comment, a selector in a test annotation.

`--explain` adds the line of code and the sentences each finding rests on:

```
examples/shop/cypress/e2e/cart.cy.js (Cypress)
  10:8     ERROR    fixed-wait         cy.wait(1500) waits a fixed 1,500 ms; wait for a condition the page shows instead
           code: cy.wait(1500);
           basis: "Anti-Pattern: Waiting for arbitrary time periods using cy.wait(Number)." (Unnecessary Waiting, https://docs.cypress.io/app/core-concepts/best-practices)
           basis: "In Cypress, you almost never need to use cy.wait() for an arbitrary amount of time." (Unnecessary Waiting, https://docs.cypress.io/app/core-concepts/best-practices)
```

A file with no finding passes:

```
node bin/ui-test-smell-check.js examples/shop/playwright/product.spec.ts
```

```
ui-test-smell-check: examples/shop/playwright/product.spec.ts
files: 1 file read, 1 with a UI test framework (Playwright 1, Cypress 0, Selenium 0), 0 without, 0 not read
rules: 11 rules on; fail level error
findings: 0 error, 0 warning, 0 info

no findings

GATE: PASS (--fail-on error)
```

[examples/output](examples/output) holds the shop as text, with `--explain`, as Markdown and as JSON, and the clean file as text.

```
ui-test-smell-check <file or folder>... [options]
```

```
--config <file>     a JSON configuration: rules on or off, severities, options, ignore patterns, limits
--format <name>     text, markdown or json (default: text)
--fail-on <level>   exit with 1 when a finding is at this level or above: error, warning or info
                    (default: error, or failOn in the configuration)
--explain           show the line of code of each finding and the sentences of the pages it rests on
--help              show the usage
--version           show the version
```

A folder is read with its subfolders, without `node_modules` and `.git`, and only files of the languages above are opened. Paths in the report are relative to the folder you run the command in, with forward slashes on every system.

## What it finds

[docs/method.md](docs/method.md) gives every rule with exactly what it reports, for which framework, what it does not report, and why it has its severity.

| Rule | Severity | Reports |
| --- | --- | --- |
| `fixed-wait` | error | `page.waitForTimeout`, `cy.wait` with a number, `driver.sleep`, `time.sleep`, `Thread.sleep`, and `setTimeout` used as a sleep |
| `mixed-waits` | warning | a Selenium file that sets an implicit wait and also uses an explicit wait |
| `position-selector` | warning | `:nth-child()` and its relatives, the jQuery `:eq()` and its relatives, Playwright `nth=`, an XPath index such as `[2]`, `position()`, `last()`, and an absolute XPath |
| `nth-locator` | info | Playwright `.first()`, `.last()` and `.nth()` |
| `styling-selector` | warning | a selector whose element is picked by class only, an XPath on `@class`, a Selenium class name locator, and class names a build tool made, such as `css-1q2w3e4` |
| `force-action` | warning | `{ force: true }` on a Playwright or Cypress action, `force=True` in Python |
| `only-left` | error | `test.only`, `it.only`, `describe.only`, `test.describe.only` and the like |
| `skipped-test` | info | a test or group declared as skipped: `test.skip('title', ...)`, `it.skip`, `describe.skip`, `test.fixme('title', ...)` |
| `order-dependence` | warning | `test.describe.serial`, `mode: 'serial'`, `testIsolation: false`, TestNG `dependsOnMethods`, JUnit `@TestMethodOrder`, pytest order and dependency marks |
| `shared-state` | warning | a test that assigns a `let` or `var` declared at the top of the file, a Python test that assigns through `global` |
| `absolute-url` | info | a full `http` or `https` address in `page.goto`, `cy.visit` or `cy.request` |

The frameworks of a file are found from its imports: `@playwright/test`, `cypress` or the `cy` global, `selenium-webdriver`, `selenium` in Python, `org.openqa.selenium` in Java. A file with none of them is read and not checked, and a note names it.

## The configuration file

[docs/inputs.md](docs/inputs.md) has every key. The example is [examples/config.json](examples/config.json).

```json
{
  "failOn": "error",
  "rules": {
    "nth-locator": "warning",
    "absolute-url": "off",
    "fixed-wait": { "severity": "error", "minMs": 100 },
    "styling-selector": { "hashMinLength": 6 }
  },
  "ignore": ["tests/legacy/**"]
}
```

A rule is `off`, a severity, or an object with `severity` and its options. `fixed-wait` has `minMs` (default `0`: every fixed wait is reported), and `styling-selector` has `hashMinLength` (default `5`: the shortest hash in a class name that counts as made by a build tool). `limits` changes the size limits of the input. A key the tool does not know, or a key named twice, stops the run with its line and exit code `2`.

To turn a rule off for one line, write a comment with the rule and a reason, on the line before or at the end of the line:

```ts
// ui-test-smell-check-ignore fixed-wait -- the panel slides in with a CSS transition that fires no event to wait for
await page.waitForTimeout(300);
```

A comment with no reason, or with a rule the tool does not have, is not applied, and a note says why.

## Formats

- `text`: for a terminal: what was read, the counts, then the findings of each file with line, column, severity, rule and message, the findings ignored by a comment with their reasons, the notes and the gate. With `--explain` also the line of code and the sentences each finding rests on.
- `markdown`: the same for a pull request comment or the job summary, with a table of the findings. Pipes, square brackets, backticks, asterisks, underscores, line breaks and angle brackets from the input are escaped, so a selector cannot break a table, make a link or be read as HTML.
- `json`: the whole report: the inputs, the rules with their severity and options, the totals, the files with their frameworks, every finding with file, line, column, rule, severity, framework, message, code and basis, the ignored findings with their reasons, the files not read, the notes, the counts and the gate. The basis is always in the JSON.

To put the findings in the job summary of a GitHub Actions run, and stop the pipeline on an error:

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: UI test smells in the job summary
    run: npx --yes github:INNERLUXES/ui-test-smell-check tests --format markdown >> "$GITHUB_STEP_SUMMARY" || true
  - name: UI test smells
    run: npx --yes github:INNERLUXES/ui-test-smell-check tests --fail-on error
```

It needs no secrets, no browser and no network beyond the download; a Linux runner is enough.

## Exit codes

`0`: no finding at the fail level or above. `1`: at least one finding at the fail level or above that no comment ignored. `2`: a usage or input error: no path, a path that does not exist, a file of a language the tool does not read named on the command line, a configuration file with an unknown key, a key named twice or a value out of range, an input over the limits, an unknown option. With exit code `2` the tool makes no report and prints the problems on standard error. A test file that cannot be lexed is named in a note and does not change the exit code.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the files, lexes them, runs the rules, applies the ignore comments, builds the report |
| `src/lex.js`, `src/lexbase.js` | the choice of lexer, and what the lexers share: tokens, escapes, limits |
| `src/lexjs.js`, `src/lexpy.js`, `src/lexjava.js` | the lexers of JavaScript and TypeScript (with JSX), Python and Java |
| `src/rules.js` | the frameworks of a file, the brackets and arguments of calls, and every rule |
| `src/selector.js` | what a CSS, jQuery, Playwright or XPath selector shows: positions, classes, hashed class names |
| `src/ignore.js` | the ignore comments and the lines they apply to |
| `src/config.js`, `src/json.js`, `src/glob.js` | the configuration file, the strict JSON reader, the file patterns without a regular expression |
| `src/files.js` | bounded reading, the folder walk with `lstat` |
| `src/report.js`, `src/text.js`, `src/size.js` | the text, Markdown and JSON reports, the cleaning of text from the input, number formats |
| `src/data.js` | the sentences the rules rest on, compared with the saved pages in `research/sources` |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| Fixed waits, locators, CSS and XPath tied to the DOM, first, last and nth, forcing actions, serial mode, focused and skipped tests, the base URL | Playwright documentation, https://playwright.dev/docs/ |
| Selecting elements, unnecessary waiting, forcing, .only and .skip, test isolation, baseUrl | Cypress documentation, https://docs.cypress.io/app/core-concepts/ |
| Sleep statements, implicit and explicit waits, locator strategies, test dependency, shared state | Selenium documentation, https://www.selenium.dev/documentation/ |
| Repeated names in a JSON object | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |

[docs/rules-and-sources.md](docs/rules-and-sources.md) lists every quoted sentence with its page and section.

## Limits

The tool lexes; it does not parse and it does not run. It cannot follow a selector or a wait time through a variable or into another file, it relies on the usual names (`page`, `cy`, `By`, `test`), and it cannot see the page, so it cannot tell whether a position or a class is the only way to find an element there. It does not read WebdriverIO, TestCafe, Puppeteer, or Playwright for Java and .NET. A clean report means the patterns the documentation warns about are not in the code it read; it is not a proof that the suite is stable. [docs/limits.md](docs/limits.md) lists these, with the size limits.

## Background

How an automation engagement keeps UI suites stable, with selectors, waits and test isolation reviewed on every change, is described on the page [Automation Testing Services](https://innerluxes.dev/software-testing/automation).

## License

MIT
