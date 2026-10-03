import { test, expect } from '@playwright/test';

// Waits for what the page shows, never for a fixed time: a comment that says page.waitForTimeout(500) is not code.
test.describe('product page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/products/rain-jacket');
  });

  test('adds the jacket to the cart', async ({ page }) => {
    await page.getByLabel('Size').selectOption('M');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByTestId('cart-count')).toHaveText('1');
  });

  test('shows the delivery note', async ({ page }) => {
    const note = page.getByText('Delivery in two to four working days');
    await expect(note).toBeVisible();
    test.info().annotations.push({ type: 'selector', description: "not a locator: div:nth-child(2) > .css-1q2w3e4" });
  });

  test('switches the colour', async ({ page }) => {
    const colours = page.getByRole('radiogroup', { name: 'Colour' });
    await colours.getByRole('radio', { name: 'Navy' }).check();
    await expect(page.getByRole('img', { name: /navy rain jacket/i })).toBeVisible();
  });
});
