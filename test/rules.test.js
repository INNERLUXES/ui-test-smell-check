import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, RULE_IDS, RULE_ORDER, detectFrameworks, lex, meetsLevel, runRules, structure, defaultSettings } from '../src/index.js';
import { CY, ONLY, PW, PW_PY, SE_JAVA, SE_JS, SE_PY, analyse, find, ids, where } from './helpers.js';

// Every rule, for every framework it reads: a case that is reported, at its line and column, and near misses that are
// not: the same text in a comment and in a string, the same name on another receiver, the same call in a file of
// another framework.

const one = (r, rule) => {
  const list = find(r, rule);
  assert.equal(list.length, 1, `${rule}: ${JSON.stringify(r.findings.map((f) => [f.rule, f.line, f.column, f.message]))}`);
  return list[0];
};
const at = (f, code, needle, n) => assert.deepEqual({ line: f.line, column: f.column }, where(code, needle, n));

test('frameworks: found from the imports, the cy globals and the Java imports; a file with none is not checked', () => {
  const fw = (code, language) => detectFrameworks(lex(code, language).tokens, language);
  assert.deepEqual(fw("import { test } from '@playwright/test';", 'typescript'), ['playwright']);
  assert.deepEqual(fw("const { test } = require('@playwright/test');", 'javascript'), ['playwright']);
  assert.deepEqual(fw("import type { Page } from 'playwright-core';", 'typescript'), ['playwright']);
  assert.deepEqual(fw("import { mount } from '@playwright/experimental-ct-react/hooks';", 'typescript'), ['playwright']);
  assert.deepEqual(fw("cy.visit('/');", 'javascript'), ['cypress']);
  assert.deepEqual(fw("Cypress.Commands.add('x', () => {});", 'javascript'), ['cypress']);
  assert.deepEqual(fw("import 'cypress';", 'javascript'), ['cypress']);
  assert.deepEqual(fw("const { By } = require('selenium-webdriver');", 'javascript'), ['selenium']);
  assert.deepEqual(fw("import { By } from 'selenium-webdriver/lib/by.js';", 'javascript'), ['selenium']);
  assert.deepEqual(fw('from selenium import webdriver', 'python'), ['selenium']);
  assert.deepEqual(fw('import playwright.sync_api', 'python'), ['playwright']);
  assert.deepEqual(fw('import static org.openqa.selenium.By.id;', 'java'), ['selenium']);
  assert.deepEqual(fw("// import { test } from '@playwright/test'\nconst s = 'cy.get(x)'; x.cy.y;", 'javascript'), [], 'a comment, a string and a member named cy are not imports');
  assert.deepEqual(fw('import org.openqa.other;', 'java'), []);
  const none = analyse("export const products = [{ wait: 1 }];\nsetTimeout(() => {}, 100);\npage.waitForTimeout(500);", 'data.ts');
  assert.deepEqual(none.frameworks, []);
  assert.deepEqual(none.findings, []);
});

test('fixed-wait, Playwright: waitForTimeout with its time; a comment, a string and minMs are near misses', () => {
  const code = `${PW}test('a', async ({ page }) => {\n  await page.waitForTimeout(3000);\n  await frame.waitForTimeout(ms);\n  // await page.waitForTimeout(500);\n  const s = 'page.waitForTimeout(500)';\n});\n`;
  const r = analyse(code);
  const list = find(r, 'fixed-wait');
  assert.equal(list.length, 2);
  at(list[0], code, 'waitForTimeout(3000)');
  assert.equal(list[0].message, 'waitForTimeout(3000) waits a fixed 3,000 ms; wait for a condition the page shows instead');
  assert.equal(list[0].severity, 'error');
  assert.equal(list[0].framework, 'playwright');
  assert.equal(list[0].code, 'await page.waitForTimeout(3000);');
  assert.deepEqual(list[0].basis.map((b) => b.key), ['pwWaitFlaky', 'pwWaitNever']);
  assert.equal(list[1].message, 'waitForTimeout(ms) waits a fixed time; wait for a condition the page shows instead');
  const higher = analyse(code, 'a.spec.ts', { 'fixed-wait': { options: { minMs: 3001 } } });
  assert.deepEqual(find(higher, 'fixed-wait').map((f) => f.message.split(' ')[0]), ['waitForTimeout(ms)'], 'a known wait under minMs is left out, an unknown one stays');
  const py = `${PW_PY}def test_a(page: Page):\n    page.wait_for_timeout(500)\n`;
  at(one(analyse(py, 'test_a.py'), 'fixed-wait'), py, 'wait_for_timeout');
});

test('fixed-wait, Cypress: cy.wait with a number; an alias, a list of aliases and a variable are not', () => {
  const code = "it('a', () => {\n  cy.wait(1500);\n  cy.wait('@getUsers');\n  cy.wait(['@a', '@b']);\n  cy.wait(delay);\n  cy.get('x').wait(250, { log: false });\n});\n";
  const r = analyse(code, 'a.cy.js');
  const list = find(r, 'fixed-wait');
  assert.equal(list.length, 2);
  at(list[0], code, 'wait(1500)');
  assert.equal(list[0].message, 'cy.wait(1500) waits a fixed 1,500 ms; wait for a condition the page shows instead');
  assert.equal(list[0].framework, 'cypress');
  assert.deepEqual(list[0].basis.map((b) => b.key), ['cyWaitAnti', 'cyWaitNever']);
  at(list[1], code, 'wait(250');
  assert.deepEqual(find(analyse(`${PW}await page.wait(1500);`), 'fixed-wait'), [], 'a .wait(number) in a Playwright file is not a Cypress wait');
});

test('fixed-wait, Selenium: driver.sleep, time.sleep, asyncio.sleep, an imported sleep, Thread.sleep and TimeUnit', () => {
  const jsCode = `${SE_JS}it('a', async () => {\n  await driver.sleep(1000);\n});\n`;
  const j = one(analyse(jsCode, 'a.test.mjs'), 'fixed-wait');
  at(j, jsCode, 'sleep(1000)');
  assert.deepEqual(j.basis.map((b) => b.key), ['seSleep', 'seFlakyCause']);
  const py = `${SE_PY}import time\nimport asyncio\nfrom time import sleep as pause\n\ndef test_a(driver):\n    time.sleep(2)\n    pause(0.5)\n    await asyncio.sleep(1)\n    # time.sleep(9)\n    other.sleep(3)\n\ndef sleep(x):\n    pass\n`;
  const p = find(analyse(py, 'test_a.py'), 'fixed-wait');
  assert.deepEqual(p.map((f) => f.message.split(' waits ')[0]), ['time.sleep(2)', 'pause(0.5)', 'asyncio.sleep(1)']);
  assert.deepEqual(p.map((f) => f.message.match(/fixed ([0-9,]+) ms/)[1]), ['2,000', '500', '1,000']);
  at(p[0], py, 'sleep(2)');
  at(p[1], py, 'pause(0.5)');
  const plain = `${SE_PY}def test_a(driver):\n    sleep(2)\n`;
  assert.deepEqual(find(analyse(plain, 'test_a.py'), 'fixed-wait'), [], 'a plain sleep() without from time import sleep is not known');
  const java = `${SE_JAVA}import java.util.concurrent.TimeUnit;\nclass T {\n  void a() throws Exception {\n    Thread.sleep(1500);\n    TimeUnit.SECONDS.sleep(2);\n    Thread.sleep(Duration.ofMillis(300));\n    Thread.sleep(pause);\n    // Thread.sleep(5);\n    worker.sleep(9);\n  }\n}\n`;
  const jv = find(analyse(java, 'T.java'), 'fixed-wait');
  assert.deepEqual(jv.map((f) => f.message.split(' waits ')[1].split(';')[0]), ['a fixed 1,500 ms', 'a fixed 2,000 ms', 'a fixed 300 ms', 'a fixed time']);
  at(jv[1], java, 'sleep(2)');
});

test('fixed-wait: setTimeout counts as a sleep only inside new Promise or awaited; another timer is not', () => {
  const code = `${PW}test('a', async ({ page }) => {\n  await new Promise((resolve) => setTimeout(resolve, 750));\n  await setTimeout(400);\n  setTimeout(() => controller.abort(), 5000);\n  timers.setTimeout(x, 9);\n});\n`;
  const list = find(analyse(code), 'fixed-wait');
  assert.deepEqual(list.map((f) => f.message), ['setTimeout used as a sleep waits a fixed 750 ms; wait for a condition the page shows instead', 'setTimeout used as a sleep waits a fixed 400 ms; wait for a condition the page shows instead']);
  at(list[0], code, 'setTimeout(resolve');
});

test('mixed-waits: an implicit wait and an explicit wait in one Selenium file, in three languages; one alone, or 0, is not', () => {
  const py = `${SE_PY}from selenium.webdriver.support.ui import WebDriverWait\n\ndef test_a(driver):\n    driver.implicitly_wait(5)\n    WebDriverWait(driver, 10).until(lambda d: d.title)\n`;
  const f = one(analyse(py, 'test_a.py'), 'mixed-waits');
  at(f, py, 'implicitly_wait');
  assert.equal(f.message, `implicitly_wait sets an implicit wait, and this file also uses an explicit wait (line ${where(py, 'WebDriverWait(driver').line})`);
  assert.deepEqual(f.basis.map((b) => b.key), ['seMix', 'seUnpredictable']);
  assert.deepEqual(find(analyse(py.replace('implicitly_wait(5)', 'implicitly_wait(0)'), 'test_a.py'), 'mixed-waits'), []);
  assert.deepEqual(find(analyse(py.replace(/ {4}WebDriverWait.*\n/, ''), 'test_a.py'), 'mixed-waits'), []);
  const java = `${SE_JAVA}class T {\n  void a() {\n    driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(5));\n    new WebDriverWait(driver, Duration.ofSeconds(10));\n  }\n}\n`;
  at(one(analyse(java, 'T.java'), 'mixed-waits'), java, 'implicitlyWait');
  assert.deepEqual(find(analyse(java.replace('Duration.ofSeconds(5)', 'Duration.ZERO'), 'T.java'), 'mixed-waits'), []);
  assert.deepEqual(find(analyse(java.replace('Duration.ofSeconds(5)', 'Duration.ofSeconds(0)'), 'T.java'), 'mixed-waits'), []);
  const js = `${SE_JS}it('a', async () => {\n  await driver.manage().setTimeouts({ implicit: 4000 });\n  await driver.wait(until.titleIs('x'), 500);\n});\n`;
  at(one(analyse(js, 'a.test.js'), 'mixed-waits'), js, 'setTimeouts');
  assert.deepEqual(find(analyse(js.replace('implicit: 4000', 'implicit: 0'), 'a.test.js'), 'mixed-waits'), []);
  assert.deepEqual(find(analyse(js.replace('implicit: 4000', 'pageLoad: 4000'), 'a.test.js'), 'mixed-waits'), []);
});

test('position-selector: Playwright locators and page actions, Cypress commands, Selenium in three languages', () => {
  const code = `${PW}test('a', async ({ page }) => {\n  await page.locator('ul > li:nth-child(2)').click();\n  await page.click('//table/tr[3]');\n  await row.click('li:first-child');\n  await page.getByRole('row').locator('css=td:last-child').fill('x');\n  const s = page.locator(sel);\n});\n`;
  const list = find(analyse(code), 'position-selector');
  assert.deepEqual(list.map((f) => f.message), [
    'locator "ul > li:nth-child(2)" picks the element by its position: :nth-child(2)',
    'click "//table/tr[3]" picks the element by its position: [3]',
    'locator "css=td:last-child" picks the element by its position: :last-child'
  ]);
  at(list[0], code, "'ul > li");
  assert.deepEqual(list[0].basis.map((b) => b.key), ['pwTiedToDom', 'pwDomChange']);
  const cy = "it('a', () => {\n  cy.get('tr:eq(1) td').click();\n  cy.get('[data-cy=list]').find('li:last').click();\n  cy.contains('li:first-child', 'Total');\n  cy.contains('li:first-child');\n});\n";
  const c = find(analyse(cy, 'a.cy.js'), 'position-selector');
  assert.deepEqual(c.map((f) => f.message.split(' picks')[0]), ['cy.get "tr:eq(1) td"', 'find "li:last"', 'cy.contains "li:first-child"']);
  assert.deepEqual(c[0].basis.map((b) => b.key), ['cySelectorAnti', 'cySelectorBest']);
  const py = `${SE_PY}def test_a(driver):\n    driver.find_element(By.XPATH, "/html/body/div[2]")\n    driver.find_element(By.CSS_SELECTOR, "li:nth-of-type(2)")\n    driver.find_element_by_xpath("//li[last()]")\n    driver.find_element(By.ID, "li:nth-child(2)")\n`;
  const p = find(analyse(py, 'test_a.py'), 'position-selector');
  assert.equal(p.length, 3);
  assert.match(p[0].message, /starts at the root of the document/);
  assert.deepEqual(p[0].basis.map((b) => b.key), ['seAbsoluteXpath', 'pwTiedToDom']);
  const java = `${SE_JAVA}class T {\n  @FindBy(xpath = "//li[2]")\n  WebElement a;\n  @FindBy(how = How.CSS, using = "li:nth-child(2)")\n  WebElement b;\n  void t() { driver.findElement(By.xpath("(//a)[1]")); driver.findElement(By.cssSelector("p:first-of-type")); }\n}\n`;
  assert.equal(find(analyse(java, 'T.java'), 'position-selector').length, 4);
  const sjs = `${SE_JS}it('a', async () => {\n  await driver.findElement(By.css('li:nth-child(2)'));\n  await driver.findElement({ xpath: '//li[2]' });\n});\n`;
  assert.equal(find(analyse(sjs, 'a.test.js'), 'position-selector').length, 2);
});

test('position-selector: a selector in a comment, a string that is not a selector, and a template substitution', () => {
  const code = `${PW}test('a', async ({ page }) => {\n  // page.locator('li:nth-child(2)')\n  console.log('li:nth-child(2)');\n  await page.getByText('li:nth-child(2)').click();\n  await page.locator(\`li:nth-child(\${i})\`).click();\n});\n`;
  const list = find(analyse(code), 'position-selector');
  assert.equal(list.length, 1);
  assert.equal(list[0].message, 'locator "li:nth-child(${...})" picks the element by its position: :nth-child(${...})');
});

test('nth-locator: Playwright first(), last() and nth() in JavaScript, and first, last and nth() in Python; not Cypress', () => {
  const code = `${PW}test('a', async ({ page }) => {\n  await page.getByRole('listitem').first().click();\n  await rows.last().click();\n  await rows.nth(2).click();\n  await rows.first(5);\n});\n`;
  const list = find(analyse(code), 'nth-locator');
  assert.deepEqual(list.map((f) => f.message), ['.first() picks one of several matching elements by its place', '.last() picks one of several matching elements by its place', '.nth(2) picks one of several matching elements by its place']);
  assert.equal(list[0].severity, 'info');
  at(list[2], code, 'nth(2)');
  const py = `${PW_PY}def test_a(page: Page):\n    page.get_by_role("row").first.click()\n    page.get_by_role("row").nth(1).click()\n    self.first = 1\n`;
  assert.equal(find(analyse(py, 'test_a.py'), 'nth-locator').length, 2);
  assert.deepEqual(find(analyse("it('a', () => { cy.get('[data-cy=row]').first().click(); });", 'a.cy.js'), 'nth-locator'), []);
});

test('styling-selector: class-only subjects, hashed classes, XPath @class and class name locators', () => {
  const code = `${PW}test('a', async ({ page }) => {\n  await page.locator('button.buttonIcon.episode-actions-later').click();\n  await page.locator('.css-1q2w3e4').click();\n  await page.locator('[data-testid=cart] .item').click();\n  await page.locator('.cart [data-testid=item]').click();\n  await page.locator('.row:has-text("Total")').click();\n});\n`;
  const list = find(analyse(code), 'styling-selector');
  assert.deepEqual(list.map((f) => f.message), [
    'locator "button.buttonIcon.episode-actions-later" picks the element by its class names',
    'locator ".css-1q2w3e4" uses the class css-1q2w3e4, a CSS-in-JS class name of the form css-<hash> (Emotion and others)',
    'locator "[data-testid=cart] .item" picks the element by its class names'
  ]);
  assert.deepEqual(list[0].basis.map((b) => b.key), ['pwClassChange', 'pwUserFacing']);
  const longer = analyse(code, 'a.spec.ts', { 'styling-selector': { options: { hashMinLength: 9 } } });
  assert.match(find(longer, 'styling-selector')[1].message, /picks the element by its class names$/);
  const cy = "it('a', () => { cy.get('.btn.btn-large').click(); cy.get('[data-cy=\"submit\"]').click(); cy.get('#main').click(); });";
  const c = one(analyse(cy, 'a.cy.js'), 'styling-selector');
  assert.deepEqual(c.basis.map((b) => b.key), ['cyVolatile', 'cySelectorBest']);
  const java = `${SE_JAVA}class T {\n  @FindBy(className = "btn-primary") WebElement a;\n  void t() { driver.findElement(By.className("sc-bdVaJa")); driver.findElement(By.id("submit")); }\n}\n`;
  const j = find(analyse(java, 'T.java'), 'styling-selector');
  assert.deepEqual(j.map((f) => f.message), ['@FindBy(className) "btn-primary" locates the element by a class name', 'By.className "sc-bdVaJa" uses the class sc-bdVaJa, a styled-components class name of the form sc-<hash>']);
  assert.deepEqual(j[0].basis.map((b) => b.key), ['seIds', 'seClassName']);
  const py = `${SE_PY}def test_a(driver):\n    driver.find_element(By.XPATH, "//div[@class='summary']")\n    driver.find_element(By.CLASS_NAME, "total")\n    driver.find_element(By.NAME, "total")\n`;
  assert.deepEqual(find(analyse(py, 'test_a.py'), 'styling-selector').map((f) => f.message.split('" ')[1]), ['tests the class attribute (@class)', 'locates the element by a class name']);
});

test('force-action: force: true on an action of Playwright or Cypress, force=True in Python; false, a variable or a nested object are not', () => {
  const code = `${PW}test('a', async ({ page }) => {\n  await page.getByRole('button').click({ force: true });\n  await page.getByLabel('x').fill('y', { timeout: 5, force: true });\n  await page.getByRole('button').click({ force: false });\n  await page.getByRole('button').click({ force });\n  await page.getByRole('button').click({ position: { force: true } });\n  await page.evaluate({ force: true });\n});\n`;
  const list = find(analyse(code), 'force-action');
  assert.deepEqual(list.map((f) => f.message), ['click({ force: true }) turns the actionability checks off', 'fill({ force: true }) turns the actionability checks off']);
  at(list[0], code, 'force: true');
  assert.deepEqual(list[0].basis.map((b) => b.key), ['pwForce', 'pwAutoWaits']);
  const cy = "it('a', () => {\n  cy.get('[data-cy=a]').type('x', { force: true });\n  cy.get('[data-cy=b]').rightclick({ force: true });\n  cy.get('[data-cy=c]').should('have.attr', { force: true });\n});\n";
  const c = find(analyse(cy, 'a.cy.js'), 'force-action');
  assert.equal(c.length, 2);
  assert.deepEqual(c[0].basis.map((b) => b.key), ['cyForceSkips', 'cyForcePass']);
  const py = `${PW_PY}def test_a(page: Page):\n    page.get_by_role("button").click(force=True)\n    page.get_by_role("button").select_option("x", force=True)\n    page.get_by_role("button").click(force=False)\n`;
  assert.equal(find(analyse(py, 'test_a.py'), 'force-action').length, 2);
});

test('only-left: every focused form in JavaScript and TypeScript; a member named only, a comment and a string are not', () => {
  const code = `${PW}test.${ONLY}('a', async () => {});\ntest.describe.${ONLY}('g', () => {});\ntest.describe.serial.${ONLY}('s', () => {});\ndescribe.${ONLY}('d', () => {});\nit.${ONLY}('i', () => {});\ncontext.${ONLY}('c', () => {});\nlist.${ONLY}('x');\n// it.${ONLY}('x')\nconst s = "test.${ONLY}(";\n`;
  const list = find(analyse(code), 'only-left');
  assert.deepEqual(list.map((f) => f.message.split(' leaves')[0]), [`test.${ONLY}`, `test.describe.${ONLY}`, `test.describe.serial.${ONLY}`, `describe.${ONLY}`, `it.${ONLY}`, `context.${ONLY}`]);
  assert.match(list[1].message, /focused groups to run/);
  assert.equal(list[0].severity, 'error');
  at(list[4], code, `${ONLY}('i'`);
  assert.deepEqual(list[0].basis.map((b) => b.key), ['pwFocused', 'pwForbidOnly']);
  const se = one(analyse(`${SE_JS}it.${ONLY}('a', async () => {});`, 'a.test.mjs'), 'only-left');
  assert.deepEqual(se.basis.map((b) => b.key), ['cyOnly']);
});

test('skipped-test: a declared skip or fixme with a title, and any skipped group; a skip at run time is not', () => {
  const code = `${PW}test.skip('a', async () => {});\ntest.fixme(\`b\`, async () => {});\ntest.describe.skip('g', () => {});\ntest('c', async ({ browserName }) => {\n  test.skip(browserName === 'webkit', 'not there');\n  test.skip();\n  test.fixme();\n});\n`;
  const list = find(analyse(code), 'skipped-test');
  assert.deepEqual(list.map((f) => f.message), ['test.skip declares a test that is never run', 'test.fixme declares a test that is never run', 'test.describe.skip declares a group of tests that is never run']);
  assert.equal(list[0].severity, 'info');
  const cy = "describe.skip('g', () => {});\nit.skip('a', () => {});\ncontext.skip('c', () => {});\n";
  assert.equal(find(analyse(`${CY}cy;\n${cy}`, 'a.cy.js'), 'skipped-test').length, 0, 'a file is a Cypress file only when it uses cy.');
  assert.equal(find(analyse(`cy.log('x');\n${cy}`, 'a.cy.js'), 'skipped-test').length, 3);
});

test('order-dependence: serial groups and mode, testIsolation false, TestNG, JUnit order and pytest marks', () => {
  const code = `${PW}test.describe.configure({ mode: 'serial' });\ntest.describe.configure({ mode: 'parallel' });\ntest.describe.serial('g', () => {});\nconst mode = 'serial';\n`;
  const list = find(analyse(code), 'order-dependence');
  assert.deepEqual(list.map((f) => f.message.split(' make')[0]), ["test.describe.configure({ mode: 'serial' })", 'test.describe.serial']);
  at(list[0], code, "'serial'");
  assert.deepEqual(list[0].basis.map((b) => b.key), ['pwSerialNotRecommended', 'pwSerialIsolated']);
  const cy = "describe('a', { testIsolation: false }, () => { it('b', () => { cy.visit('/'); }); });\ndescribe('c', { testIsolation: true }, () => {});\n";
  const c = one(analyse(cy, 'a.cy.js'), 'order-dependence');
  assert.deepEqual(c.basis.map((b) => b.key), ['cyIndependent', 'cyDependState']);
  const java = `${SE_JAVA}@TestMethodOrder(MethodOrderer.OrderAnnotation.class)\nclass T {\n  @Test(dependsOnMethods = "login") void a() {}\n  @Test(groups = "x") void b() {}\n}\n`;
  const j = find(analyse(java, 'T.java'), 'order-dependence');
  assert.equal(j.length, 2);
  assert.deepEqual(j[0].basis.map((b) => b.key), ['seAnyOrder']);
  const py = `${SE_PY}import pytest\n\n@pytest.mark.order(2)\ndef test_a(): pass\n\n@pytest.mark.run(order=1)\ndef test_b(): pass\n\n@pytest.mark.dependency(depends=["test_a"])\ndef test_c(): pass\n\n@pytest.mark.dependency()\ndef test_d(): pass\n\n@pytest.mark.slow\ndef test_e(): pass\n`;
  assert.deepEqual(find(analyse(py, 'test_a.py'), 'order-dependence').map((f) => f.message.split(' makes')[0]), ['pytest.mark.order', 'pytest.mark.run', 'pytest.mark.dependency']);
});

test('shared-state, JavaScript: a top-level let or var assigned inside a test; a hook, a local variable or a parameter is not', () => {
  const code = `${PW}let orderId;\nvar count = 0, total = 1;\nconst fixed = 1;\nlet page2;\n\ntest.beforeEach(async () => {\n  page2 = 1;\n});\n\ntest('a', async ({ page }) => {\n  orderId = await page.title();\n  orderId = 'again';\n  count++;\n  total += 2;\n});\n\ntest('b', async () => {\n  let orderId = 'own';\n  orderId = 'x';\n  [1].forEach((count) => { count = 2; });\n  const o = { total: 1 };\n});\n\ntest.skip('c', function () {\n  ++count;\n});\n`;
  const list = find(analyse(code), 'shared-state');
  assert.deepEqual(list.map((f) => [f.message.split(',')[0], f.line]), [['the test assigns orderId', where(code, 'orderId = await').line], ['the test assigns count', where(code, 'count++').line], ['the test assigns total', where(code, 'total += 2').line], ['the test assigns count', where(code, '++count').line]]);
  at(list[0], code, 'orderId = await');
  assert.deepEqual(list[0].basis.map((b) => b.key), ['pwIsolation', 'pwNoRelies']);
  const nested = `cy.log('x');\nlet cartId;\ndescribe('d', () => {\n  let inner;\n  it('a', () => {\n    cy.get('x').then((text) => { cartId = text; inner = text; });\n  });\n});\n`;
  const n = find(analyse(nested, 'a.cy.js'), 'shared-state');
  assert.deepEqual(n.map((f) => f.message.split(',')[0]), ['the test assigns cartId']);
  assert.deepEqual(n[0].basis.map((b) => b.key), ['cyQuietlyDepend']);
});

test('shared-state, Python: global inside a test function; global in a fixture or a helper is not', () => {
  const py = `${SE_PY}order_id = None\nseen = 0\n\ndef helper():\n    global seen\n    seen = 1\n\nclass TestOrders:\n    def test_place(self, driver):\n        global order_id, seen\n        order_id = 1\n\ndef test_other(driver):\n    x = (1,\n         2)\n    global order_id\n`;
  const list = find(analyse(py, 'test_orders.py'), 'shared-state');
  assert.deepEqual(list.map((f) => f.message.split(' assigns ')[1].split(' through')[0]), ['the module variable order_id', 'the module variable seen', 'the module variable order_id']);
  at(list[0], py, 'order_id, seen');
  assert.deepEqual(list[0].basis.map((b) => b.key), ['seIsolated', 'seNoShare']);
});

test('absolute-url: a full address in goto, cy.visit and cy.request; a path, a variable and a substitution are not', () => {
  const code = `${PW}test('a', async ({ page }) => {\n  await page.goto('https://shop.example.test/cart');\n  await page.goto('/cart');\n  await page.goto(\`\${base}/cart\`);\n  await page.goto(url);\n  await page.goto(\`http://localhost:\${port}/x\`);\n});\n`;
  const list = find(analyse(code), 'absolute-url');
  assert.deepEqual(list.map((f) => f.message), ['goto("https://shop.example.test/cart") opens a full address; set the base URL in the configuration and pass the path', 'goto("http://localhost:${...}/x") opens a full address; set the base URL in the configuration and pass the path']);
  assert.deepEqual(list[0].basis.map((b) => b.key), ['pwBaseUrl', 'pwBaseUrlPath']);
  const cy = "it('a', () => {\n  cy.visit('HTTP://localhost:8080');\n  cy.request('https://api.example.test/seed');\n  cy.visit('/');\n  win.visit('https://x.example.test');\n});\n";
  assert.equal(find(analyse(cy, 'a.cy.js'), 'absolute-url').length, 2);
  assert.deepEqual(find(analyse(`${SE_JS}it('a', async () => { await driver.get('https://x.example.test'); });`, 'a.test.js'), 'absolute-url'), [], 'Selenium files are not checked');
});

test('rules: settings turn a rule off and change its severity; the order and the levels are fixed', () => {
  const code = `${PW}test('a', async ({ page }) => { await page.waitForTimeout(100); await page.locator('.a').click(); });`;
  const off = analyse(code, 'a.spec.ts', { 'fixed-wait': { on: false } });
  assert.deepEqual(ids(off), ['styling-selector']);
  const info = analyse(code, 'a.spec.ts', { 'styling-selector': { severity: 'info' } });
  assert.equal(find(info, 'styling-selector')[0].severity, 'info');
  assert.deepEqual(RULE_IDS, RULES.map((r) => r.id));
  assert.equal(RULE_ORDER['fixed-wait'], 0);
  assert.ok(meetsLevel('error', 'warning') && meetsLevel('warning', 'warning') && !meetsLevel('info', 'warning'));
  const tokens = lex(code, 'typescript').tokens;
  const raw = runRules({ text: code, tokens, language: 'typescript', frameworks: ['playwright'], settings: defaultSettings() });
  assert.deepEqual(raw.map((r) => r.rule), ['fixed-wait', 'styling-selector']);
});

test('structure: brackets, template literals and JSX are matched once; commas belong to their own call', () => {
  const tokens = lex('f(a, `x${g(b, c)}y`, [d, e], { h: (i, j) => i })', 'javascript').tokens;
  const s = structure(tokens);
  const open = 1;
  assert.equal(tokens[s.match[open]].value, ')');
  assert.equal(s.commas.get(open).length, 3);
  const unbalanced = structure(lex('f(a]; g(', 'javascript').tokens);
  assert.equal(unbalanced.match[1], -1);
});
