# Rules and sources

Every sentence that the tool quotes comes from a page that is saved in [research/sources](../research/sources), with its address on the first line. `src/data.js` holds them, and `test/data.test.js` compares each one with the saved text. Nothing was added from memory. Change a sentence only after saving the new page text and updating this file.

## The saved pages

| File | Address | What it is used for |
| --- | --- | --- |
| `playwright-best-practices.txt` | https://playwright.dev/docs/best-practices | test isolation, user-facing attributes over CSS classes and the DOM structure |
| `playwright-locators.txt` | https://playwright.dev/docs/locators | the recommended locators, CSS and XPath tied to the DOM structure, first, last and nth |
| `playwright-page-wait-for-timeout.txt` | https://playwright.dev/docs/api/class-page#page-wait-for-timeout | waiting for a fixed time is flaky and only for debugging |
| `playwright-auto-waiting.txt` | https://playwright.dev/docs/actionability | the actionability checks, and the force option that turns them off |
| `playwright-serial-mode.txt` | https://playwright.dev/docs/test-parallel#serial-mode | serial mode is not recommended |
| `playwright-test-api.txt` | https://playwright.dev/docs/api/class-test | test.only, test.describe.only, test.skip, test.describe.skip, test.describe.serial |
| `playwright-forbid-only.txt` | https://playwright.dev/docs/api/class-testconfig#test-config-forbid-only | the option that fails a run on a focused test |
| `playwright-annotations.txt` | https://playwright.dev/docs/test-annotations | skip and fixme, focusing a test |
| `playwright-test-use-options.txt` | https://playwright.dev/docs/test-use-options#basic-options | the base URL |
| `cypress-best-practices.txt` | https://docs.cypress.io/app/core-concepts/best-practices | selecting elements, tests that rely on each other, unnecessary waiting, a global baseUrl |
| `cypress-interacting-with-elements.txt` | https://docs.cypress.io/app/core-concepts/interacting-with-elements | the action commands, and forcing them |
| `cypress-writing-and-organizing-tests.txt` | https://docs.cypress.io/app/core-concepts/writing-and-organizing-tests | .only and .skip, test isolation |
| `cypress-test-isolation.txt` | https://docs.cypress.io/app/core-concepts/test-isolation | tests that depend on the state of an earlier test |
| `selenium-waiting-strategies.txt` | https://www.selenium.dev/documentation/webdriver/waits/ | sleep statements, implicit and explicit waits, not mixing them |
| `selenium-locator-tips.txt` | https://www.selenium.dev/documentation/test_practices/encouraged/locators/ | which locators to prefer |
| `selenium-locator-strategies.txt` | https://www.selenium.dev/documentation/webdriver/elements/locators/ | the locator strategies, the class name locator, absolute XPath |
| `selenium-test-dependency.txt` | https://www.selenium.dev/documentation/test_practices/discouraged/test_dependency/ | tests that rely on their order |
| `selenium-avoid-sharing-state.txt` | https://www.selenium.dev/documentation/test_practices/encouraged/avoid_sharing_state/ | isolated tests, no shared test data |
| `rfc8259-json-objects.txt` | https://www.rfc-editor.org/rfc/rfc8259 | names that appear twice in a JSON object (the configuration file) |

The pages were fetched once and saved as plain text, from the heading of each kept section to its end, with the navigation, the dates, the footers and the code tabs of other languages left out. Typographic quotes and dashes are written as plain ASCII, the emoji in front of some code examples are left out, an accented letter in one example is written without its accent, an e-mail address that the page hides is written as a made-up one, and tables are written with one row a line. Sentences that hold a word the repository checks do not allow are left out: on the Selenium waits page these are the sentences about the duration and the scope of the browser connection, and on the Playwright best practices page the sentence that lists the kinds of browser storage. The API pages keep only the sections that are quoted.

The pages say what a framework recommends, not how a tool should judge a test file. The severities, the patterns of hashed class names, the rule for what counts as the body of a test, and the receivers and names each rule looks for are the tool's own; docs/method.md says so where each is used.

## The sentences that the findings quote

Each sentence is on its saved page word for word. A key used by "docs" is quoted in the documents and in no finding.

| Key | Used by | Sentence | Page and section |
| --- | --- | --- | --- |
| `pwWaitNever` | `fixed-wait` | "Never wait for timeout in production." | `playwright-page-wait-for-timeout.txt`, waitForTimeout |
| `pwWaitFlaky` | `fixed-wait` | "Tests that wait for time are inherently flaky." | `playwright-page-wait-for-timeout.txt`, waitForTimeout |
| `pwWaitDebug` | docs | "Note that page.waitForTimeout() should only be used for debugging." | `playwright-page-wait-for-timeout.txt`, waitForTimeout |
| `pwUserFacing` | `styling-selector` | "To make tests resilient, we recommend prioritizing user-facing attributes and explicit contracts." | `playwright-best-practices.txt`, Use locators |
| `pwDomChange` | `position-selector` | "Your DOM can easily change so having your tests depend on your DOM structure can lead to failing tests." | `playwright-best-practices.txt`, Prefer user-facing attributes to XPath or CSS selectors |
| `pwClassChange` | `styling-selector` | "Should the designer change something then the class might change, thus breaking your test." | `playwright-best-practices.txt`, Prefer user-facing attributes to XPath or CSS selectors |
| `pwIsolation` | `shared-state` | "Test isolation improves reproducibility, makes debugging easier and prevents cascading test failures." | `playwright-best-practices.txt`, Make tests as isolated as possible |
| `pwNoRelies` | `shared-state` | "This keeps your tests isolated as no test relies on another." | `playwright-best-practices.txt`, Make tests as isolated as possible |
| `pwTiedToDom` | `position-selector` | "XPath and CSS selectors can be tied to the DOM structure or implementation." | `playwright-locators.txt`, Locate by CSS or XPath |
| `pwCssNotRecommended` | docs | "CSS and XPath are not recommended as the DOM can often change leading to non resilient tests." | `playwright-locators.txt`, Locate by CSS or XPath |
| `pwNthCaution` | `nth-locator` | "Often times, the page might change, and the locator will point to a completely different element from the one you expected." | `playwright-locators.txt`, Get by nth item |
| `pwNthNotRecommended` | `nth-locator` | "These methods are not recommended because when your page changes, Playwright may click on an element you did not intend." | `playwright-locators.txt`, Strictness |
| `pwAutoWaits` | `force-action` | "It auto-waits for all the relevant checks to pass and only then performs the requested action." | `playwright-auto-waiting.txt`, Introduction |
| `pwForce` | `force-action` | "Some actions like locator.click() support force option that disables non-essential actionability checks, for example passing truthy force to locator.click() method will not check that the target element actually receives click events." | `playwright-auto-waiting.txt`, Forcing actions |
| `pwSerialNotRecommended` | `order-dependence` | "Using serial is not recommended." | `playwright-serial-mode.txt`, Serial mode |
| `pwSerialIsolated` | `order-dependence` | "It is usually better to make your tests isolated, so they can be run independently." | `playwright-serial-mode.txt`, Serial mode |
| `pwSerialSkipped` | docs | "If one of the serial tests fails, all subsequent tests are skipped." | `playwright-serial-mode.txt`, Serial mode |
| `pwFocused` | `only-left` | "If there are some focused tests or suites, all of them will be run but nothing else." | `playwright-test-api.txt`, test.only |
| `pwSkippedNever` | `skipped-test` | "Skipped tests are not supposed to be ever run." | `playwright-test-api.txt`, test.skip |
| `pwSkippedGroup` | `skipped-test` | "Tests in the skipped group are never run." | `playwright-test-api.txt`, test.describe.skip |
| `pwForbidOnly` | `only-left` | "Whether to exit with an error if any tests or groups are marked as test.only() or test.describe.only()." | `playwright-forbid-only.txt`, forbidOnly |
| `pwFixme` | docs | "test.fixme() marks the test as failing." | `playwright-annotations.txt`, Introduction |
| `pwBaseUrl` | `absolute-url` | "Base URL used for all pages in the context." | `playwright-test-use-options.txt`, Basic Options |
| `pwBaseUrlPath` | `absolute-url` | "Allows navigating by using just the path, for example page.goto('/settings')." | `playwright-test-use-options.txt`, Basic Options |
| `cyWaitAnti` | `fixed-wait` | "Anti-Pattern: Waiting for arbitrary time periods using cy.wait(Number)." | `cypress-best-practices.txt`, Unnecessary Waiting |
| `cyWaitNever` | `fixed-wait` | "In Cypress, you almost never need to use cy.wait() for an arbitrary amount of time." | `cypress-best-practices.txt`, Unnecessary Waiting |
| `cySelectorAnti` | `position-selector` | "Anti-Pattern: Using highly brittle selectors that are subject to change." | `cypress-best-practices.txt`, Selecting Elements |
| `cySelectorBest` | `position-selector`, `styling-selector` | "Best Practice: Use data-* attributes to provide context to your selectors and isolate them from CSS or JS changes." | `cypress-best-practices.txt`, Selecting Elements |
| `cyVolatile` | `styling-selector` | "Targeting the element above by tag, class or id is very volatile and highly subject to change." | `cypress-best-practices.txt`, Selecting Elements |
| `cyIndependent` | `order-dependence` | "Best Practice: Tests should always be able to be run independently from one another and still pass." | `cypress-best-practices.txt`, Having Tests Rely On The State Of Previous Tests |
| `cyCoupling` | docs | "Anti-Pattern: Coupling multiple tests together." | `cypress-best-practices.txt`, Having Tests Rely On The State Of Previous Tests |
| `cyBaseUrlAnti` | `absolute-url` | "Anti-Pattern: Using cy.visit() without setting a baseUrl." | `cypress-best-practices.txt`, Setting a Global baseUrl |
| `cyBaseUrlRemoves` | `absolute-url` | "This removes the need to hard-code fully qualified domain name (FQDN) URLs in commands." | `cypress-best-practices.txt`, Setting a Global baseUrl |
| `cyForcePass` | `force-action` | "You can pass { force: true } to most action commands." | `cypress-interacting-with-elements.txt`, Forcing |
| `cyForceSkips` | `force-action` | "In summary, { force: true } skips the checks, and it will always fire the event at the desired element." | `cypress-interacting-with-elements.txt`, Forcing |
| `cyOnly` | `only-left` | "To run a specified suite or test, append .only to the function." | `cypress-writing-and-organizing-tests.txt`, Focusing and skipping tests |
| `cySkip` | `skipped-test` | "To skip a specified suite or test, append .skip() to the function." | `cypress-writing-and-organizing-tests.txt`, Focusing and skipping tests |
| `cyQuietlyDepend` | `shared-state` | "Tests that quietly depend on each other are a leading cause of flaky suites: a test passes only because an earlier test left the browser in a particular state, and the moment you reorder, skip, or run them in isolation, things break." | `cypress-writing-and-organizing-tests.txt`, Test Isolation |
| `cyIsolationDefault` | docs | "Test isolation is enabled by default (testIsolation: true) and applies only to end-to-end testing." | `cypress-writing-and-organizing-tests.txt`, Test Isolation |
| `cyDependState` | `order-dependence` | "Having tests that depend on the state of an earlier test can potentially cause nondeterministic test failures which make debugging challenging." | `cypress-test-isolation.txt`, Test Isolation |
| `seFlakyCause` | `fixed-wait` | "This is one of the primary causes of flaky tests." | `selenium-waiting-strategies.txt`, Waiting Strategies |
| `seSleep` | `fixed-wait` | "Because the code can't know exactly how long it needs to wait, this can fail when it doesn't sleep long enough." | `selenium-waiting-strategies.txt`, Waiting Strategies |
| `seBetter` | docs | "Selenium provides two different mechanisms for synchronization that are better." | `selenium-waiting-strategies.txt`, Waiting Strategies |
| `seMix` | `mixed-waits` | "Do not mix implicit and explicit waits." | `selenium-waiting-strategies.txt`, Implicit waits |
| `seUnpredictable` | `mixed-waits` | "Doing so can cause unpredictable wait times." | `selenium-waiting-strategies.txt`, Implicit waits |
| `seIds` | `styling-selector` | "In general, if HTML IDs are available, unique, and consistently predictable, they are the preferred method for locating an element on a page." | `selenium-locator-tips.txt`, Tips on working with locators |
| `seCompact` | docs | "The recommendation is to keep your locators as compact and readable as possible." | `selenium-locator-tips.txt`, Tips on working with locators |
| `seAbsoluteXpath` | `position-selector` | "The XPath could be absolute xpath, which is created from the root of the document." | `selenium-locator-strategies.txt`, xpath |
| `seClassName` | `styling-selector` | "Locates elements whose class name contains the search value (compound class names are not permitted)" | `selenium-locator-strategies.txt`, Traditional Locators |
| `seAnyOrder` | `order-dependence` | "Your tests should be able to run in any order, and not rely on other tests to complete in order to be successful." | `selenium-test-dependency.txt`, Test dependency |
| `seIsolated` | `shared-state` | "We must ensure that the tests are isolated from one another." | `selenium-avoid-sharing-state.txt`, Avoid sharing state |
| `seNoShare` | `shared-state` | "Do not share test data." | `selenium-avoid-sharing-state.txt`, Avoid sharing state |
| `jsonUnique` | docs | "The names within an object SHOULD be unique." | `rfc8259-json-objects.txt`, 4. Objects |
| `jsonUnpredictable` | docs | "When the names within an object are not unique, the behavior of software that receives such an object is unpredictable." | `rfc8259-json-objects.txt`, 4. Objects |

## The rules

A finding quotes the sentences listed for the framework of the finding; `any` is used for a file of another framework.

| Id | Severity | Sentences, by framework | Where the rule is written |
| --- | --- | --- | --- |
| `fixed-wait` | error | playwright: `pwWaitFlaky`, `pwWaitNever`; cypress: `cyWaitAnti`, `cyWaitNever`; selenium: `seSleep`, `seFlakyCause` | [method.md](method.md#fixed-wait-error) |
| `mixed-waits` | warning | selenium: `seMix`, `seUnpredictable` | [method.md](method.md#mixed-waits-warning) |
| `position-selector` | warning | playwright: `pwTiedToDom`, `pwDomChange`; cypress: `cySelectorAnti`, `cySelectorBest`; selenium: `seAbsoluteXpath`, `pwTiedToDom` | [method.md](method.md#position-selector-warning) |
| `nth-locator` | info | playwright: `pwNthNotRecommended`, `pwNthCaution` | [method.md](method.md#nth-locator-info) |
| `styling-selector` | warning | playwright: `pwClassChange`, `pwUserFacing`; cypress: `cyVolatile`, `cySelectorBest`; selenium: `seIds`, `seClassName` | [method.md](method.md#styling-selector-warning) |
| `force-action` | warning | playwright: `pwForce`, `pwAutoWaits`; cypress: `cyForceSkips`, `cyForcePass` | [method.md](method.md#force-action-warning) |
| `only-left` | error | playwright: `pwFocused`, `pwForbidOnly`; cypress: `cyOnly`; any: `cyOnly` | [method.md](method.md#only-left-error) |
| `skipped-test` | info | playwright: `pwSkippedNever`, `pwSkippedGroup`; cypress: `cySkip`; any: `cySkip` | [method.md](method.md#skipped-test-info) |
| `order-dependence` | warning | playwright: `pwSerialNotRecommended`, `pwSerialIsolated`; cypress: `cyIndependent`, `cyDependState`; selenium: `seAnyOrder` | [method.md](method.md#order-dependence-warning) |
| `shared-state` | warning | playwright: `pwIsolation`, `pwNoRelies`; cypress: `cyQuietlyDepend`; selenium: `seIsolated`, `seNoShare` | [method.md](method.md#shared-state-warning) |
| `absolute-url` | info | playwright: `pwBaseUrl`, `pwBaseUrlPath`; cypress: `cyBaseUrlAnti`, `cyBaseUrlRemoves` | [method.md](method.md#absolute-url-info) |
