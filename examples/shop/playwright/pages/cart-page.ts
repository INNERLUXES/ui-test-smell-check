import type { Locator, Page } from '@playwright/test';

// A page object: its locators are read like the ones in a test.
export class CartPage {
  readonly checkoutButton: Locator;
  readonly firstItem: Locator;

  constructor(private readonly page: Page) {
    this.checkoutButton = page.getByRole('button', { name: 'Checkout' });
    this.firstItem = page.locator('//ul[@id="cart-items"]/li[1]');
  }

  async open() {
    await this.page.goto('/cart');
  }
}
