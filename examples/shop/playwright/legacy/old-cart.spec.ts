import { test } from '@playwright/test';

// An old test kept for reference. The configuration leaves this folder out, so its findings are not reported.
test.only('old cart', async ({ page }) => {
  await page.goto('/cart');
  await page.waitForTimeout(5000);
});
