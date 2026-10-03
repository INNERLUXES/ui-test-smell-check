import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('finds a product by its name', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Search the shop').fill('rain jacket');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Rain jacket' })).toBeVisible();
});

test('opens the filter panel', async ({ page }) => {
  await page.goto('/search?q=jacket');
  await page.getByRole('button', { name: 'Filters' }).click();
  // ui-test-smell-check-ignore fixed-wait -- the panel slides in with a CSS transition that fires no event to wait for
  await page.waitForTimeout(300);
  await page.locator('.filter-panel .price-range').click(); // ui-test-smell-check-ignore styling-selector
});
