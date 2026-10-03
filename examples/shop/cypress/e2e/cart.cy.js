let cartId;

describe('cart', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('adds a product to the cart', () => {
    cy.get('[data-cy=product-card]').first().find('[data-cy=add-to-cart]').click();
    cy.wait(1500);
    cy.get('.cart-badge').should('have.text', '1');
    cy.get('[data-cy=cart-id]').invoke('text').then((text) => {
      cartId = text;
    });
  });

  it.only('removes a product from the cart', () => {
    cy.visit('http://localhost:8080/cart');
    cy.get('ul.cart-items li:nth-child(2) button').click({ force: true });
    cy.contains('[data-cy=cart-summary]', 'Your cart is empty');
  });

  it('keeps the cart after a reload', () => {
    cy.reload();
    cy.get('[data-cy=cart-id]').should('have.text', cartId);
  });
});
