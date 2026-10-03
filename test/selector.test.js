import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUBSTITUTION, analyseSelector, hashedClass } from '../src/index.js';

// The selector readers: what in a selector ties a test to a position or to a styling class, and the near misses that
// do not.

const pos = (value, kind) => analyseSelector(value, kind).position.map((p) => p.text);
const style = (value, kind, options) => analyseSelector(value, kind, options).styling;

test('css: the position pseudo-classes are found, inside :not() and :has() too; :only-child is not a position', () => {
  assert.deepEqual(pos('ul > li:nth-child(2)', 'css'), [':nth-child(2)']);
  assert.deepEqual(pos('tr:nth-last-of-type(odd) td:first-child', 'css'), [':nth-last-of-type(odd)', ':first-child']);
  assert.deepEqual(pos('li:not(:last-child)', 'css'), [':last-child']);
  assert.deepEqual(pos('div:has(> span:first-of-type)', 'css'), [':first-of-type']);
  assert.deepEqual(pos('li:only-child, p:only-of-type, a:hover, input:checked', 'css'), []);
  assert.deepEqual(pos('[data-test="li:nth-child(2)"]', 'css'), [], 'a pseudo-class inside an attribute value is text');
});

test('jquery: the position pseudo-classes of jQuery count for Cypress, and only there', () => {
  assert.deepEqual(pos('li:eq(2)', 'jquery'), [':eq(2)']);
  assert.deepEqual(pos('tr:first, tr:odd, td:gt(1)', 'jquery'), [':first', ':odd', ':gt(1)']);
  assert.deepEqual(pos('li:eq(2)', 'css'), []);
  assert.deepEqual(pos('li:contains("first")', 'jquery'), []);
});

test('playwright: nth=, css= and xpath= parts, chains with >>, text and other engines are not CSS', () => {
  assert.deepEqual(pos('.list >> nth=1', 'playwright'), ['nth=1']);
  assert.deepEqual(pos('css=li:nth-child(3)', 'playwright'), [':nth-child(3)']);
  assert.deepEqual(pos('xpath=//li[2]', 'playwright'), ['[2]']);
  assert.deepEqual(pos('//li[2] >> text=Buy', 'playwright'), ['[2]']);
  assert.deepEqual(pos('text=nth-child(2) >> role=button', 'playwright'), []);
  assert.deepEqual(pos('"li:nth-child(2)"', 'playwright'), [], 'a quoted part is a text selector');
  assert.deepEqual(pos('data-testid=cart >> li:nth-match(3)', 'playwright'), [':nth-match(3)']);
  assert.deepEqual(pos('internal:role=button', 'playwright'), []);
});

test('xpath: whole-number predicates, position() and last(), and an absolute path; not a quoted bracket or an attribute test', () => {
  assert.deepEqual(pos('//ul/li[3]', 'xpath'), ['[3]']);
  assert.deepEqual(pos('(//button)[last()]', 'xpath'), ['[last()]']);
  assert.deepEqual(pos('//tr[position() > 1]', 'xpath'), ['[position() > 1]']);
  assert.deepEqual(pos('/html/body/form', 'xpath'), ['/html/body/form']);
  assert.equal(analyseSelector('/html/body/div[2]', 'xpath').position[0].why, 'absolute', 'the absolute path is named first');
  assert.deepEqual(pos('//a[@title="see [2]"]', 'xpath'), []);
  assert.deepEqual(pos('//a[@data-pos="2"]', 'xpath'), []);
  assert.deepEqual(pos('//li[lastName="x"]', 'xpath'), [], 'a name that starts with last is not last()');
  assert.deepEqual(pos(`//li[${SUBSTITUTION}]`, 'xpath'), [`[${SUBSTITUTION}]`], 'an index from code is a position');
});

test('styling: a subject picked by class only is reported; an id, an attribute or text in the subject is not', () => {
  assert.equal(style('.btn.btn-large', 'css').text, '.btn.btn-large');
  assert.equal(style('#main .item', 'css').why, 'class');
  assert.equal(style('div[class="card"]', 'css').why, 'class');
  assert.equal(style('.cart [data-test=item]', 'css'), null);
  assert.equal(style('button.primary#submit', 'css'), null);
  assert.equal(style('.row:has-text("Total")', 'playwright'), null);
  assert.equal(style('.row:contains("Total")', 'jquery'), null);
  assert.equal(style('button', 'css'), null);
  assert.equal(style('[data-cy=submit], .legacy', 'jquery').text, '.legacy');
  assert.equal(style('//div[@class="x"]/span', 'xpath').why, 'xpath-class');
  assert.equal(style('btn-primary', 'class').why, 'class-locator');
  assert.equal(style('text=.not-a-class', 'playwright'), null);
});

test('styling: class names made by a build tool are found anywhere in a selector, with hashMinLength', () => {
  assert.equal(style('[data-test=x] .css-1q2w3e4', 'css').hashed, true);
  assert.equal(style('div.css-1q2w3e4-Button', 'css').text, 'css-1q2w3e4-Button');
  assert.equal(style('.sc-bdVaJa', 'css').hashed, true);
  assert.equal(style('.Button_primary__3xYz1', 'css').hashed, true);
  assert.equal(style('.jss42', 'css').hashed, true);
  assert.equal(style('//div[contains(@class, "css-9z8y7x6")]', 'xpath').hashed, true);
  assert.equal(style('.css-1q2w3e4', 'css', { hashMinLength: 8 }).hashed, false, 'a hash shorter than hashMinLength is an ordinary class');
  assert.equal(hashedClass('css-header', 5), null, 'a hash needs a digit');
  assert.equal(hashedClass('sc-header', 5), null, 'a styled-components hash has upper and lower case');
  assert.equal(hashedClass('card__title', 5), null, 'BEM is not a hash');
  assert.equal(hashedClass('card__title2x', 5) !== null, true);
  assert.equal(hashedClass('makeStyles-root-12', 5) !== null, true);
  assert.equal(hashedClass(`css-${SUBSTITUTION}`, 1), null, 'a class from code is never a hash');
});

test('selectors: a template substitution is neither a class nor a number, and long or broken selectors end in one pass', () => {
  assert.deepEqual(pos(`li:nth-child(${SUBSTITUTION})`, 'css'), [`:nth-child(${SUBSTITUTION})`]);
  assert.equal(style(`[data-id="${SUBSTITUTION}"]`, 'css'), null);
  const start = Date.now();
  for (const v of ['('.repeat(5000), '['.repeat(5000), ':'.repeat(5000), '.a'.repeat(5000), '"'.repeat(5001), `//a${'['.repeat(3000)}`]) {
    analyseSelector(v, 'css');
    analyseSelector(v, 'xpath');
    analyseSelector(v, 'playwright');
  }
  assert.ok(Date.now() - start < 3000, `took ${Date.now() - start} ms`);
});
