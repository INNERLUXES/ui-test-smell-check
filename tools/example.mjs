// Runs the README examples, checks that they report what the README shows, and writes the reports of the example shop
// to examples/output. CI runs it and then fails if those files changed, so the example output in the repository is
// always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
async function run(argv) {
  let out = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => process.stderr.write(t) }, undefined, root);
  return { code, out };
}

const problems = [];
function expect(name, result, code, expected, unwanted) {
  const missing = expected.filter((e) => !result.out.includes(e));
  const wrong = unwanted.filter((e) => result.out.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})`);
  }
}

const shopArgs = ['examples/shop', '--config', 'examples/config.json'];
const shop = await run(shopArgs);
process.stdout.write(shop.out);
expect('example shop', shop, 1, [
  'files: 10 files read, 9 with a UI test framework (Playwright 4, Cypress 2, Selenium 3), 1 without, 0 not read',
  'findings: 6 error, 26 warning, 2 info; 1 ignored by a comment with a reason',
  'ERROR    fixed-wait         waitForTimeout(3000) waits a fixed 3,000 ms',
  'ERROR    fixed-wait         cy.wait(1500) waits a fixed 1,500 ms',
  'ERROR    fixed-wait         time.sleep(2) waits a fixed 2,000 ms',
  'ERROR    fixed-wait         Thread.sleep(1500) waits a fixed 1,500 ms',
  'ERROR    fixed-wait         sleep(1000) waits a fixed 1,000 ms',
  'ERROR    only-left          it.only leaves only the focused tests to run',
  'WARNING  mixed-waits        implicitly_wait sets an implicit wait, and this file also uses an explicit wait (line 25)',
  'WARNING  mixed-waits        setTimeouts sets an implicit wait, and this file also uses an explicit wait (line 21)',
  'WARNING  position-selector  locator "#checkout-form > div:nth-child(3) > button" picks the element by its position: :nth-child(3)',
  'WARNING  position-selector  By.XPATH "/html/body/div[2]/form/button" starts at the root of the document',
  'WARNING  styling-selector   locator ".css-1q2w3e4" uses the class css-1q2w3e4',
  'WARNING  styling-selector   By.className "btn-primary" locates the element by a class name',
  'WARNING  force-action       click({ force: true }) turns the actionability checks off',
  'WARNING  shared-state       the test assigns orderNumber',
  'WARNING  shared-state       the test assigns cartId',
  'WARNING  shared-state       the test test_place_order assigns the module variable order_id through global',
  'WARNING  order-dependence   test.describe.configure({ mode: \'serial\' })',
  'WARNING  order-dependence   testIsolation: false',
  'WARNING  order-dependence   @TestMethodOrder',
  'WARNING  order-dependence   pytest.mark.order',
  'WARNING  nth-locator        .nth(1) picks one of several matching elements by its place',
  'WARNING  absolute-url       goto("https://shop.example.test/account/orders") opens a full address',
  'INFO     skipped-test       test.skip declares a test that is never run',
  'INFO     skipped-test       it.skip declares a test that is never run',
  'examples/shop/playwright/search.spec.ts:16:14  fixed-wait  -- the panel slides in with a CSS transition that fires no event to wait for',
  'note: examples/shop/playwright/search.spec.ts:17:61: the ignore comment for styling-selector gives no reason',
  'note: 1 file left out by the ignore patterns of the configuration: examples/shop/playwright/legacy/old-cart.spec.ts',
  'note: 1 file with no Playwright, Cypress or Selenium import was read and not checked: examples/shop/playwright/data/products.ts',
  'GATE: FAIL - 6 errors (--fail-on error)'
], ['product.spec.ts', 'account.cy.ts:10', 'old-cart.spec.ts (Playwright)', 'GATE: PASS']);

process.stdout.write('\n');
const clean = await run(['examples/shop/playwright/product.spec.ts']);
process.stdout.write(clean.out);
expect('clean file', clean, 0, ['findings: 0 error, 0 warning, 0 info', 'no findings', 'GATE: PASS (--fail-on error)'], ['ERROR', 'WARNING']);

// The same shop with the fail level at warning, and with the configuration left out: the legacy test is read again.
const strict = await run([...shopArgs, '--fail-on', 'warning']);
expect('fail level warning', strict, 1, ['GATE: FAIL - 6 errors, 26 warnings (--fail-on warning)'], []);
const noConfig = await run(['examples/shop']);
expect('no configuration', noConfig, 1, ['examples/shop/playwright/legacy/old-cart.spec.ts (Playwright)', 'ERROR    only-left          test.only leaves only the focused tests to run'], ['left out by the ignore patterns']);

// The README shows the head of the shop report, the findings of one file with --explain, and the clean file.
const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
const head = shop.out.split('\n\nexamples/shop/playwright/pages/cart-page.ts')[0];
if (!readme.includes(head)) problems.push('README: the head of the sample output of the shop differs from a real run');
if (!readme.includes(clean.out)) problems.push('README: the sample output of the clean file differs from a real run');

await mkdir(resolve(root, 'examples/output'), { recursive: true });
await writeFile(resolve(root, 'examples/output/shop.txt'), shop.out);
const explain = await run([...shopArgs, '--explain']);
if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
await writeFile(resolve(root, 'examples/output/shop-explain.txt'), explain.out);
const cartExplain = explain.out.split('\n\nexamples/shop/cypress/e2e/cart.cy.js (Cypress)\n')[1]?.split('\n\n')[0];
if (!cartExplain || !readme.includes(cartExplain.split('\n').slice(0, 4).join('\n'))) problems.push('README: the --explain sample of cart.cy.js differs from a real run');
for (const [format, name] of [['markdown', 'shop.md'], ['json', 'shop.json']]) {
  const r = await run([...shopArgs, '--format', format, '--explain']);
  if (r.code !== 1) problems.push(`${format}: exit code ${r.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output', name), r.out);
}
await writeFile(resolve(root, 'examples/output/clean.txt'), clean.out);

if (problems.length) {
  for (const p of problems) console.error(`example: ${p}`);
  process.exit(1);
}
