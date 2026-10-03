// The names, lists and sentences the rules rest on. Each sentence comes from a page that is saved, with its address on
// the first line, in research/sources, and test/data.test.js compares this file with the saved text. Change a sentence
// here only after saving the new page text and updating docs/rules-and-sources.md. The rules in src/ use these
// constants and never write a quoted sentence of their own.

const PW = 'https://playwright.dev/docs/';
const CY = 'https://docs.cypress.io/app/core-concepts/';
const SE = 'https://www.selenium.dev/documentation/';

export const SOURCES = [
  { id: 'pw-best', file: 'playwright-best-practices.txt', url: `${PW}best-practices`, label: 'Playwright, Best Practices' },
  { id: 'pw-locators', file: 'playwright-locators.txt', url: `${PW}locators`, label: 'Playwright, Locators' },
  { id: 'pw-wait', file: 'playwright-page-wait-for-timeout.txt', url: `${PW}api/class-page#page-wait-for-timeout`, label: 'Playwright, page.waitForTimeout' },
  { id: 'pw-actionability', file: 'playwright-auto-waiting.txt', url: `${PW}actionability`, label: 'Playwright, Auto-waiting' },
  { id: 'pw-serial', file: 'playwright-serial-mode.txt', url: `${PW}test-parallel#serial-mode`, label: 'Playwright, Parallelism: Serial mode' },
  { id: 'pw-test', file: 'playwright-test-api.txt', url: `${PW}api/class-test`, label: 'Playwright, class Test' },
  { id: 'pw-forbid-only', file: 'playwright-forbid-only.txt', url: `${PW}api/class-testconfig#test-config-forbid-only`, label: 'Playwright, testConfig.forbidOnly' },
  { id: 'pw-annotations', file: 'playwright-annotations.txt', url: `${PW}test-annotations`, label: 'Playwright, Annotations' },
  { id: 'pw-use-options', file: 'playwright-test-use-options.txt', url: `${PW}test-use-options#basic-options`, label: 'Playwright, Test use options' },
  { id: 'cy-best', file: 'cypress-best-practices.txt', url: `${CY}best-practices`, label: 'Cypress, Best Practices' },
  { id: 'cy-interact', file: 'cypress-interacting-with-elements.txt', url: `${CY}interacting-with-elements`, label: 'Cypress, Interacting with Elements' },
  { id: 'cy-organize', file: 'cypress-writing-and-organizing-tests.txt', url: `${CY}writing-and-organizing-tests`, label: 'Cypress, Writing and Organizing Tests' },
  { id: 'cy-isolation', file: 'cypress-test-isolation.txt', url: `${CY}test-isolation`, label: 'Cypress, Test Isolation' },
  { id: 'se-waits', file: 'selenium-waiting-strategies.txt', url: `${SE}webdriver/waits/`, label: 'Selenium, Waiting Strategies' },
  { id: 'se-locator-tips', file: 'selenium-locator-tips.txt', url: `${SE}test_practices/encouraged/locators/`, label: 'Selenium, Tips on working with locators' },
  { id: 'se-locators', file: 'selenium-locator-strategies.txt', url: `${SE}webdriver/elements/locators/`, label: 'Selenium, Locator strategies' },
  { id: 'se-dependency', file: 'selenium-test-dependency.txt', url: `${SE}test_practices/discouraged/test_dependency/`, label: 'Selenium, Test dependency' },
  { id: 'se-sharing', file: 'selenium-avoid-sharing-state.txt', url: `${SE}test_practices/encouraged/avoid_sharing_state/`, label: 'Selenium, Avoid sharing state' },
  { id: 'rfc8259', file: 'rfc8259-json-objects.txt', url: 'https://www.rfc-editor.org/rfc/rfc8259', label: 'RFC 8259, The JSON Data Interchange Format' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// Sentences quoted in the findings and the documents. Every text is on its saved page word for word (test/data.test.js
// compares them with the white space flattened), and holds no year.
export const FACTS = {
  pwWaitNever: { source: 'pw-wait', section: 'waitForTimeout', text: 'Never wait for timeout in production.' },
  pwWaitFlaky: { source: 'pw-wait', section: 'waitForTimeout', text: 'Tests that wait for time are inherently flaky.' },
  pwWaitDebug: { source: 'pw-wait', section: 'waitForTimeout', text: 'Note that page.waitForTimeout() should only be used for debugging.' },
  pwUserFacing: { source: 'pw-best', section: 'Use locators', text: 'To make tests resilient, we recommend prioritizing user-facing attributes and explicit contracts.' },
  pwDomChange: { source: 'pw-best', section: 'Prefer user-facing attributes to XPath or CSS selectors', text: 'Your DOM can easily change so having your tests depend on your DOM structure can lead to failing tests.' },
  pwClassChange: { source: 'pw-best', section: 'Prefer user-facing attributes to XPath or CSS selectors', text: 'Should the designer change something then the class might change, thus breaking your test.' },
  pwIsolation: { source: 'pw-best', section: 'Make tests as isolated as possible', text: 'Test isolation improves reproducibility, makes debugging easier and prevents cascading test failures.' },
  pwNoRelies: { source: 'pw-best', section: 'Make tests as isolated as possible', text: 'This keeps your tests isolated as no test relies on another.' },
  pwTiedToDom: { source: 'pw-locators', section: 'Locate by CSS or XPath', text: 'XPath and CSS selectors can be tied to the DOM structure or implementation.' },
  pwCssNotRecommended: { source: 'pw-locators', section: 'Locate by CSS or XPath', text: 'CSS and XPath are not recommended as the DOM can often change leading to non resilient tests.' },
  pwNthCaution: { source: 'pw-locators', section: 'Get by nth item', text: 'Often times, the page might change, and the locator will point to a completely different element from the one you expected.' },
  pwNthNotRecommended: { source: 'pw-locators', section: 'Strictness', text: 'These methods are not recommended because when your page changes, Playwright may click on an element you did not intend.' },
  pwAutoWaits: { source: 'pw-actionability', section: 'Introduction', text: 'It auto-waits for all the relevant checks to pass and only then performs the requested action.' },
  pwForce: { source: 'pw-actionability', section: 'Forcing actions', text: 'Some actions like locator.click() support force option that disables non-essential actionability checks, for example passing truthy force to locator.click() method will not check that the target element actually receives click events.' },
  pwSerialNotRecommended: { source: 'pw-serial', section: 'Serial mode', text: 'Using serial is not recommended.' },
  pwSerialIsolated: { source: 'pw-serial', section: 'Serial mode', text: 'It is usually better to make your tests isolated, so they can be run independently.' },
  pwSerialSkipped: { source: 'pw-serial', section: 'Serial mode', text: 'If one of the serial tests fails, all subsequent tests are skipped.' },
  pwFocused: { source: 'pw-test', section: 'test.only', text: 'If there are some focused tests or suites, all of them will be run but nothing else.' },
  pwSkippedNever: { source: 'pw-test', section: 'test.skip', text: 'Skipped tests are not supposed to be ever run.' },
  pwSkippedGroup: { source: 'pw-test', section: 'test.describe.skip', text: 'Tests in the skipped group are never run.' },
  pwForbidOnly: { source: 'pw-forbid-only', section: 'forbidOnly', text: 'Whether to exit with an error if any tests or groups are marked as test.only() or test.describe.only().' },
  pwFixme: { source: 'pw-annotations', section: 'Introduction', text: 'test.fixme() marks the test as failing.' },
  pwBaseUrl: { source: 'pw-use-options', section: 'Basic Options', text: 'Base URL used for all pages in the context.' },
  pwBaseUrlPath: { source: 'pw-use-options', section: 'Basic Options', text: "Allows navigating by using just the path, for example page.goto('/settings')." },
  cyWaitAnti: { source: 'cy-best', section: 'Unnecessary Waiting', text: 'Anti-Pattern: Waiting for arbitrary time periods using cy.wait(Number).' },
  cyWaitNever: { source: 'cy-best', section: 'Unnecessary Waiting', text: 'In Cypress, you almost never need to use cy.wait() for an arbitrary amount of time.' },
  cySelectorAnti: { source: 'cy-best', section: 'Selecting Elements', text: 'Anti-Pattern: Using highly brittle selectors that are subject to change.' },
  cySelectorBest: { source: 'cy-best', section: 'Selecting Elements', text: 'Best Practice: Use data-* attributes to provide context to your selectors and isolate them from CSS or JS changes.' },
  cyVolatile: { source: 'cy-best', section: 'Selecting Elements', text: 'Targeting the element above by tag, class or id is very volatile and highly subject to change.' },
  cyIndependent: { source: 'cy-best', section: 'Having Tests Rely On The State Of Previous Tests', text: 'Best Practice: Tests should always be able to be run independently from one another and still pass.' },
  cyCoupling: { source: 'cy-best', section: 'Having Tests Rely On The State Of Previous Tests', text: 'Anti-Pattern: Coupling multiple tests together.' },
  cyBaseUrlAnti: { source: 'cy-best', section: 'Setting a Global baseUrl', text: 'Anti-Pattern: Using cy.visit() without setting a baseUrl.' },
  cyBaseUrlRemoves: { source: 'cy-best', section: 'Setting a Global baseUrl', text: 'This removes the need to hard-code fully qualified domain name (FQDN) URLs in commands.' },
  cyForcePass: { source: 'cy-interact', section: 'Forcing', text: 'You can pass { force: true } to most action commands.' },
  cyForceSkips: { source: 'cy-interact', section: 'Forcing', text: 'In summary, { force: true } skips the checks, and it will always fire the event at the desired element.' },
  cyOnly: { source: 'cy-organize', section: 'Focusing and skipping tests', text: 'To run a specified suite or test, append .only to the function.' },
  cySkip: { source: 'cy-organize', section: 'Focusing and skipping tests', text: 'To skip a specified suite or test, append .skip() to the function.' },
  cyQuietlyDepend: { source: 'cy-organize', section: 'Test Isolation', text: 'Tests that quietly depend on each other are a leading cause of flaky suites: a test passes only because an earlier test left the browser in a particular state, and the moment you reorder, skip, or run them in isolation, things break.' },
  cyIsolationDefault: { source: 'cy-organize', section: 'Test Isolation', text: 'Test isolation is enabled by default (testIsolation: true) and applies only to end-to-end testing.' },
  cyDependState: { source: 'cy-isolation', section: 'Test Isolation', text: 'Having tests that depend on the state of an earlier test can potentially cause nondeterministic test failures which make debugging challenging.' },
  seFlakyCause: { source: 'se-waits', section: 'Waiting Strategies', text: 'This is one of the primary causes of flaky tests.' },
  seSleep: { source: 'se-waits', section: 'Waiting Strategies', text: "Because the code can't know exactly how long it needs to wait, this can fail when it doesn't sleep long enough." },
  seBetter: { source: 'se-waits', section: 'Waiting Strategies', text: 'Selenium provides two different mechanisms for synchronization that are better.' },
  seMix: { source: 'se-waits', section: 'Implicit waits', text: 'Do not mix implicit and explicit waits.' },
  seUnpredictable: { source: 'se-waits', section: 'Implicit waits', text: 'Doing so can cause unpredictable wait times.' },
  seIds: { source: 'se-locator-tips', section: 'Tips on working with locators', text: 'In general, if HTML IDs are available, unique, and consistently predictable, they are the preferred method for locating an element on a page.' },
  seCompact: { source: 'se-locator-tips', section: 'Tips on working with locators', text: 'The recommendation is to keep your locators as compact and readable as possible.' },
  seAbsoluteXpath: { source: 'se-locators', section: 'xpath', text: 'The XPath could be absolute xpath, which is created from the root of the document.' },
  seClassName: { source: 'se-locators', section: 'Traditional Locators', text: 'Locates elements whose class name contains the search value (compound class names are not permitted)' },
  seAnyOrder: { source: 'se-dependency', section: 'Test dependency', text: 'Your tests should be able to run in any order, and not rely on other tests to complete in order to be successful.' },
  seIsolated: { source: 'se-sharing', section: 'Avoid sharing state', text: 'We must ensure that the tests are isolated from one another.' },
  seNoShare: { source: 'se-sharing', section: 'Avoid sharing state', text: 'Do not share test data.' },
  jsonUnique: { source: 'rfc8259', section: '4. Objects', text: 'The names within an object SHOULD be unique.' },
  jsonUnpredictable: { source: 'rfc8259', section: '4. Objects', text: 'When the names within an object are not unique, the behavior of software that receives such an object is unpredictable.' }
};

// The page of a quoted sentence.
export const factPage = (key) => source(FACTS[key].source).url;

// The basis of a finding as the reports show it: the sentence, its section and the address of its page.
export const basisOf = (key) => ({ key, text: FACTS[key].text, section: FACTS[key].section, source: factPage(key) });

// Folders that hold tools, caches, copies of packages or the output of test runs, not test code. They are not entered;
// a note names them.
export const SKIP_FOLDERS = ['.git', '.hg', '.svn', 'node_modules', '.cache'];

// The languages the tool reads, by file ending.
export const LANGUAGES = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.java': 'java'
};

// The language of a file name, or null when the tool does not read files of its ending.
export function languageOf(name) {
  const m = /\.[A-Za-z]{1,4}$/.exec(name);
  if (!m) return null;
  const ext = m[0].toLowerCase();
  return Object.hasOwn(LANGUAGES, ext) ? LANGUAGES[ext] : null;
}

// Files that may hold JSX, where < at the start of an expression opens an element.
export const mayHoldJsx = (name) => /\.[jt]sx$/i.test(name);

// The frameworks, and how a file shows that it uses one.
export const FRAMEWORKS = [
  { id: 'playwright', label: 'Playwright' },
  { id: 'cypress', label: 'Cypress' },
  { id: 'selenium', label: 'Selenium' }
];

// The module names a JavaScript or TypeScript file imports or requires to use a framework.
export const JS_MODULES = {
  playwright: ['@playwright/test', 'playwright', 'playwright-core', '@playwright/experimental-ct-react', '@playwright/experimental-ct-vue', '@playwright/experimental-ct-svelte'],
  cypress: ['cypress'],
  selenium: ['selenium-webdriver']
};

// The comment that turns a rule off for one line, with a reason.
export const IGNORE_MARKER = 'ui-test-smell-check-ignore';
