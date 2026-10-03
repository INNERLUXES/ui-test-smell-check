import assert from 'node:assert/strict';
import { Builder, By, until } from 'selenium-webdriver';

const BASE_URL = process.env.SHOP_URL;

describe('wishlist', function () {
  let driver;

  before(async function () {
    driver = await new Builder().forBrowser('firefox').build();
    await driver.manage().setTimeouts({ implicit: 4000 });
  });

  after(async function () {
    await driver.quit();
  });

  it('adds a product to the wishlist', async function () {
    await driver.get(`${BASE_URL}/products/rain-jacket`);
    await driver.findElement(By.css('[data-test=add-to-wishlist]')).click();
    await driver.wait(until.elementLocated(By.css('[data-test=wishlist-count]')), 5000);
    await driver.sleep(1000);
    assert.equal(await driver.findElement(By.css('[data-test=wishlist-count]')).getText(), '1');
  });

  it.skip('shares the wishlist', async function () {
    await driver.findElement(By.xpath('(//button[@type="button"])[last()]')).click();
  });
});
