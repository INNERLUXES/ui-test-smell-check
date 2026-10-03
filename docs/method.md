# Method

The tool reads UI test files, lexes each one, finds which framework it uses, and runs the rules below on its tokens. Every rule says exactly what it reports, for which framework, what it does not report, why it has the severity it has, its options, and the sentences of the saved pages that it rests on. The pages are saved in [research/sources](../research/sources), and a test compares every quoted sentence with the saved text. Where the tool makes a choice that the pages do not state (a severity, a pattern of hashed class names, what counts as the body of a test), the text says so.

Nothing is run: not a test, not a browser, and no file is imported or evaluated. [inputs.md](inputs.md) describes the lexers and the configuration file; [limits.md](limits.md) lists what the rules cannot see.

## How a file is read

1. The file is lexed by the lexer of its language ([inputs.md](inputs.md)). Comments and strings become what they are, so `// page.waitForTimeout(500)` is a comment and `'cy.wait(500)'` is a string, and neither is reported. The value of a string is read after its escapes, so `'li:nth-child(2)'` and `"li:nth-child\x282)"` are the same selector.
2. The frameworks of the file are found from its imports: a JavaScript or TypeScript file that imports or requires `@playwright/test`, `playwright`, `playwright-core` or a Playwright component testing package uses Playwright; one that imports `selenium-webdriver` uses Selenium; one that uses the globals `cy.` or `Cypress.`, or imports `cypress`, uses Cypress. A Python file that imports `selenium` (or `seleniumbase`) uses Selenium, and one that imports `playwright` (or `pytest_playwright`) uses Playwright. A Java file that imports a package of `org.openqa.selenium` uses Selenium. A file with no framework is read and not checked, and a note names it.
3. The rules run on the tokens. A finding has the file, the line and the column of the token it points at (both from 1; the column counts UTF-16 code units, as JavaScript strings do), the rule, the severity, a one-line message, the line of code, and the sentences it rests on, chosen for the framework of the finding.
4. Ignore comments are applied ([inputs.md](inputs.md#ignore-comments)). A finding that a comment with a reason ignores is listed apart, with the reason; it does not count for the gate.

A call is found by its tokens: a name after a `.` (or `?.`) followed by `(`. The receiver of a call is the plain name before the dot when there is one: `page` in `page.click(...)`, `cy` in `cy.get(...)`, `By` in `By.xpath(...)`. A selector is the first argument of a call when that argument is one string or one template literal; the `${...}` of a template literal stand for an unknown part, which is never a class name and never a number. A selector held in a variable is not read.

## Waits

### `fixed-wait` (error)

A wait for a fixed time:

- Playwright, JavaScript and TypeScript: any call of `.waitForTimeout(...)`. Python: any call of `.wait_for_timeout(...)`.
- Cypress: a call of `.wait(...)` whose first argument is a number literal, such as `cy.wait(1500)`. `cy.wait('@alias')` and `cy.wait(['@a', '@b'])` are not reported, and neither is `cy.wait(delay)` with a variable: the tool cannot tell a number from an alias in a variable.
- Selenium, JavaScript: any call of `.sleep(...)`, such as `driver.sleep(1000)`. Python: `time.sleep(...)`, `asyncio.sleep(...)`, and `sleep(...)` (or its alias) when the file has `from time import sleep`. Java: `Thread.sleep(...)` and `TimeUnit.<UNIT>.sleep(...)`.
- Any framework, JavaScript and TypeScript: `setTimeout(...)` used as a sleep: inside the arguments of `new Promise(...)` (six brackets out at most), or awaited directly (`await setTimeout(500)` from `node:timers/promises`). A `setTimeout` that is not awaited and not inside a promise is not reported: it may be a timer for something else.

The message gives the time in milliseconds when it is a number in the code: seconds in Python, the unit of `TimeUnit`, and `Duration.ofMillis`, `ofSeconds`, `ofMinutes` and `ofNanos` in Java are converted. A wait shorter than the option `minMs` (default `0`, so every wait) is not reported; a wait whose time the tool cannot read is always reported.

It is an error. The Playwright page of `waitForTimeout` says: "Never wait for timeout in production. Tests that wait for time are inherently flaky." and "Note that page.waitForTimeout() should only be used for debugging." Cypress lists it as an anti-pattern: "Anti-Pattern: Waiting for arbitrary time periods using cy.wait(Number)." and "In Cypress, you almost never need to use cy.wait() for an arbitrary amount of time." Selenium explains why a sleep fails: "Because the code can't know exactly how long it needs to wait, this can fail when it doesn't sleep long enough." and of the race behind it, "This is one of the primary causes of flaky tests."

### `mixed-waits` (warning)

A Selenium file that sets an implicit wait and also uses an explicit wait:

- the implicit wait: Java `.implicitlyWait(...)` unless its argument is `0`, `Duration.ZERO` or a `Duration.of...(0)`; Python `.implicitly_wait(...)` unless its argument is `0`; JavaScript `.setTimeouts({ implicit: ... })` unless the value is `0`;
- the explicit wait: Java `new WebDriverWait(...)` or `new FluentWait(...)`; Python `WebDriverWait(...)`; JavaScript any call of `.wait(...)`, such as `driver.wait(until.elementLocated(...))`.

One finding per file, at the first implicit wait, naming the line of the first explicit wait. Selenium says: "Do not mix implicit and explicit waits." and "Doing so can cause unpredictable wait times." It is a warning: the waits work, but their timeouts add up. The tool sees one file only; an implicit wait set in a fixture of another file is not seen.

## Selectors

The selectors read are the first argument of these calls, when it is one string or one template literal:

- Playwright, JavaScript and TypeScript: `.locator`, `.$`, `.$$`, `.$eval`, `.$$eval`, `.waitForSelector` and `.frameLocator` on any receiver, and the actions that take a selector on a page or a frame when the receiver is the plain name `page` or `frame`: `click`, `dblclick`, `fill`, `check`, `uncheck`, `hover`, `tap`, `type`, `press`, `selectOption`, `focus`, `textContent`, `innerText`, `innerHTML`, `getAttribute`, `inputValue`, `isChecked`, `isDisabled`, `isEditable`, `isEnabled`, `isHidden`, `isVisible`, `setInputFiles`, `dispatchEvent` and `dragAndDrop` (both selectors). On a locator these actions take a value, not a selector, so on another receiver they are not read.
- Playwright, Python: `.locator`, `.query_selector`, `.query_selector_all`, `.wait_for_selector`, `.eval_on_selector`, `.eval_on_selector_all` and `.frame_locator`, and the same page actions in their Python names when the receiver is `page` or `frame`.
- Cypress: `cy.get`, `cy.contains` with two or more arguments (the first is a selector), and `.find`, `.children`, `.closest`, `.parent`, `.parents`, `.parentsUntil`, `.siblings`, `.next`, `.nextAll`, `.nextUntil`, `.prev`, `.prevAll`, `.prevUntil`, `.filter` and `.not` with a string.
- Selenium, JavaScript: `By.css`, `By.xpath` and `By.className`, and the properties `css`, `xpath` and `className` of an object literal (`driver.findElement({ css: '...' })`). Python: the string after `By.CSS_SELECTOR,`, `By.XPATH,` or `By.CLASS_NAME,`, and the first argument of `find_element(s)_by_css_selector`, `_by_xpath` and `_by_class_name`. Java: `By.cssSelector`, `By.xpath` and `By.className`, and the `css`, `xpath`, `className` and `how`/`using` attributes of `@FindBy`.

A Playwright selector is split at `>>`. A part named `css=` or `xpath=` is read as CSS or XPath, a part that starts with `//`, `..` or `(` is XPath, a part in quotes or with another engine (`text=`, `role=`, `data-testid=`, `id=` and the rest) is not a CSS selector, and every other part is CSS. A Cypress selector is CSS with the jQuery pseudo-classes. A selector longer than 10,000 characters is not read.

### `position-selector` (warning)

A selector that picks an element by its position:

- CSS: the pseudo-classes `:nth-child()`, `:nth-last-child()`, `:nth-of-type()`, `:nth-last-of-type()`, `:first-child`, `:last-child`, `:first-of-type` and `:last-of-type`, and Playwright's `:nth-match()`, also inside `:not()`, `:is()`, `:where()` and `:has()`. `:only-child` and `:only-of-type` are not reported: they ask that there is one element, not which one.
- Cypress: also the jQuery pseudo-classes `:eq()`, `:first`, `:last`, `:gt()`, `:lt()`, `:even` and `:odd`.
- Playwright: a part `nth=<index>`.
- XPath: a predicate that is a whole number, such as `[2]`, or that holds `position()` or `last()`, and an absolute path from the root of the document, one that starts with a single `/`, such as `/html/body/div[2]`.

The message names the first one found. Playwright says: "XPath and CSS selectors can be tied to the DOM structure or implementation." and "Your DOM can easily change so having your tests depend on your DOM structure can lead to failing tests." Cypress calls brittle selectors an anti-pattern: "Anti-Pattern: Using highly brittle selectors that are subject to change." For a Selenium finding the tool quotes the Selenium page that defines an absolute XPath, "The XPath could be absolute xpath, which is created from the root of the document.", and the Playwright sentence on selectors tied to the DOM structure, which is about CSS and XPath selectors in general: the Selenium pages saved here do not speak of positions. It is a warning: a position can be the only way to tell identical elements apart.

### `nth-locator` (info)

Playwright only: a call of `.first()` or `.last()` with no argument, or of `.nth(...)`, in JavaScript and TypeScript; `.nth(...)` and the properties `.first` and `.last` (not assigned to) in Python. Playwright says of these methods: "These methods are not recommended because when your page changes, Playwright may click on an element you did not intend." and "Often times, the page might change, and the locator will point to a completely different element from the one you expected." It is info, because the same page also shows them as the way to pick from a list of identical elements. Cypress `.first()`, `.last()` and `.eq()` are not reported: the Cypress pages saved here do not speak of them.

### `styling-selector` (warning)

A selector that picks an element by the classes that style it:

- CSS: a selector of the list whose subject, its last compound (the element that is selected), has a class (`.btn`, or an attribute selector on `class`) and nothing else that names the element: no id, no other attribute such as `[data-test=...]`, and no text pseudo-class (`:has-text()`, `:text()`, `:text-is()`, `:text-matches()`, `:contains()`). So `.cart .item` is reported and `.cart [data-test=item]` is not.
- XPath: a predicate that tests `@class`.
- Selenium class name locators (`By.className`, `By.CLASS_NAME`, `@FindBy(className = ...)`): always, because they locate by a class name.
- Any selector: a class name that a build tool made rather than a person, anywhere in it. These patterns are the tool's own, and `hashMinLength` (default `5`, from 3 to 64) is the shortest hash that counts:
  - `css-<hash>` with an optional `-<label>`, where the hash has letters and digits, at least one digit, and at least `hashMinLength` characters (Emotion and other CSS-in-JS libraries), such as `css-1q2w3e4`;
  - `sc-<hash>` with at least `hashMinLength` letters in mixed case (styled-components), such as `sc-bdVaJa`;
  - `<name>__<hash>` or `<name>_<local>__<hash>` where the hash has at least `hashMinLength` characters, a digit and a letter (CSS Modules), such as `Button_primary__3xYz1`;
  - `jss<number>` and `makeStyles-<name>-<number>` (JSS).

Playwright says: "Should the designer change something then the class might change, thus breaking your test." and recommends "To make tests resilient, we recommend prioritizing user-facing attributes and explicit contracts." Cypress: "Targeting the element above by tag, class or id is very volatile and highly subject to change." and "Best Practice: Use data-* attributes to provide context to your selectors and isolate them from CSS or JS changes." For Selenium, the tool quotes the locator tips, "In general, if HTML IDs are available, unique, and consistently predictable, they are the preferred method for locating an element on a page.", and the definition of the class name locator. It is a warning: a class that a team keeps stable on purpose works, and the tool cannot see that promise.

## Actions

### `force-action` (warning)

An action with the actionability checks turned off:

- Playwright, JavaScript and TypeScript: a property `force: true` directly in an object literal that is an argument of `.check`, `.clear`, `.click`, `.dblclick`, `.dragTo`, `.dragAndDrop`, `.fill`, `.hover`, `.selectOption`, `.selectText`, `.setChecked`, `.tap` or `.uncheck`. Python: a keyword argument `force=True` of the same actions in their Python names.
- Cypress: a property `force: true` in an object literal argument of the action commands `.click`, `.dblclick`, `.rightclick`, `.type`, `.clear`, `.check`, `.uncheck`, `.select`, `.trigger` and `.selectFile`.

`force: false`, a `force` taken from a variable, and `{ force }` are not reported. Playwright: "Some actions like locator.click() support force option that disables non-essential actionability checks, for example passing truthy force to locator.click() method will not check that the target element actually receives click events.", where normally "It auto-waits for all the relevant checks to pass and only then performs the requested action." Cypress: "In summary, { force: true } skips the checks, and it will always fire the event at the desired element." It is a warning: a forced action can pass while a real user could not do the same, and it hides an overlay or a disabled control that the test should have waited for. Cypress offers it on purpose for some cases, so it is not an error.

## The suite

### `only-left` (error)

JavaScript and TypeScript, any framework: a focused test or group, `.only(` on `test`, `it`, `describe`, `context`, `specify` or `suite` (a plain name, not a member of something else), also after `.describe`, `.parallel`, `.serial` or `.fail`, such as `test.describe.only(` and `test.describe.serial.only(`. Playwright: "If there are some focused tests or suites, all of them will be run but nothing else." and its configuration has an option against it: "Whether to exit with an error if any tests or groups are marked as test.only() or test.describe.only()." Cypress: "To run a specified suite or test, append .only to the function." It is an error, because a focused test left in a file makes the rest of the suite stop running, and the run still looks green.

### `skipped-test` (info)

JavaScript and TypeScript, any framework: a test or group declared as skipped. `.skip(` and `.fixme(` on `describe`, `context` or `suite`, or after `.describe`, always; on `test`, `it` or `specify` only when the first argument is a string or a template literal, the title of a declared test. So `test.skip('title', ...)` is reported and `test.skip(browserName === 'webkit', 'reason')` and `test.skip()` inside a test, which skip at run time on a condition, are not. Playwright: "Skipped tests are not supposed to be ever run." and "Tests in the skipped group are never run." Cypress: "To skip a specified suite or test, append .skip() to the function." It is info: a skip can be right for a while, and the tool cannot see why or since when.

### `order-dependence` (warning)

Tests made to run in a fixed order, or to share the browser between them:

- Playwright, JavaScript and TypeScript: `test.describe.serial(` (and `.serial.only(`), and `test.describe.configure({ mode: 'serial' })`.
- Cypress: a property `testIsolation: false`, in the configuration of a `describe` or in a Cypress configuration file.
- Java: `dependsOnMethods =` and `dependsOnGroups =` (TestNG), and the annotation `@TestMethodOrder` (JUnit 5).
- Python: `pytest.mark.order(...)`, `pytest.mark.run(order=...)` and `pytest.mark.dependency(depends=...)`.

Playwright: "Using serial is not recommended." and "It is usually better to make your tests isolated, so they can be run independently." Cypress: "Best Practice: Tests should always be able to be run independently from one another and still pass." and "Having tests that depend on the state of an earlier test can potentially cause nondeterministic test failures which make debugging challenging." Selenium: "Your tests should be able to run in any order, and not rely on other tests to complete in order to be successful." It is a warning: some flows are written this way on purpose, and the tool cannot see why.

### `shared-state` (warning)

A test that writes a variable which every test of the file shares:

- JavaScript and TypeScript, any framework: a variable declared with `let` or `var` at the top level of the file (not inside any function, block or call), assigned inside the body of a test: the callback of `test(`, `it(` or `specify(` (also after `.only`, `.skip`, `.fixme` or `.fail`), including the functions nested in it. An assignment is `=`, a compound assignment such as `+=` or `??=`, or `++` and `--`. A variable that the test declares again (`let`, `const`, `var`, `function`, `class`), or that is a parameter of the test or of a function inside it, is its own variable and is left out. An assignment in a hook (`beforeEach`, `beforeAll` and the rest) is not reported: that is where shared setup belongs. One finding per variable per test.
- Python: a `global` statement inside a function whose name starts with `test`, one finding per name.

Playwright: "Test isolation improves reproducibility, makes debugging easier and prevents cascading test failures." Cypress: "Tests that quietly depend on each other are a leading cause of flaky suites: a test passes only because an earlier test left the browser in a particular state, and the moment you reorder, skip, or run them in isolation, things break." Selenium: "We must ensure that the tests are isolated from one another." and "Do not share test data." It is a warning: the tool cannot see whether another test reads the variable. Java fields are not checked.

## Addresses

### `absolute-url` (info)

A full address, a string or template literal that starts with `http://` or `https://`, as the first argument of `.goto(...)` in a Playwright file (JavaScript, TypeScript and Python), or of `cy.visit(...)` or `cy.request(...)` in a Cypress file. A template literal that starts with `${...}` is not reported. Playwright's configuration has a base URL: "Base URL used for all pages in the context." and "Allows navigating by using just the path, for example page.goto('/settings')." Cypress: "Anti-Pattern: Using cy.visit() without setting a baseUrl." and "This removes the need to hard-code fully qualified domain name (FQDN) URLs in commands." It is info: a test of a link to another site needs its full address. Selenium files are not checked: WebDriver's `get` takes a full address.

## The gate

Each rule has a severity: `error`, `warning` or `info`, and the configuration can change it or turn the rule off. The run fails, with exit code `1`, when a finding that is not ignored has the fail level or a higher one: `--fail-on`, else `failOn` in the configuration, else `error`. A finding ignored by a comment with a reason never counts. A file that could not be read is a note and never fails the run by itself.
