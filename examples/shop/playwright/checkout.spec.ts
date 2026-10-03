import { test, expect } from '@playwright/test';

let orderNumber: string;

test.describe('checkout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cart');
  });

  test('applies a discount code', async ({ page }) => {
    await page.getByLabel('Discount code').fill('SPRING10');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByTestId('cart-total')).toHaveText('$45.00');
  });

  test('places an order', async ({ page }) => {
    await page.locator('#checkout-form > div:nth-child(3) > button').click();
    await page.waitForTimeout(3000);
    await page.locator('.css-1q2w3e4').click({ force: true });
    orderNumber = await page.getByTestId('order-number').innerText();
  });

  test('shows the order in the history', async ({ page }) => {
    await page.goto('https://shop.example.test/account/orders');
    await expect(page.getByRole('row').nth(1)).toContainText(orderNumber);
  });

  test.skip('prints the receipt', async ({ page }) => {
    // The printer service is not in the test environment.
    await page.getByRole('button', { name: 'Print receipt' }).click();
  });
});
