describe('account', { testIsolation: false }, () => {
  it('signs in', () => {
    cy.visit('/sign-in');
    cy.get('[data-cy=username]').type('ada');
    cy.get('[data-cy=sign-in]').click();
    cy.contains('Welcome back, Ada').should('be.visible');
  });

  it('shows the saved addresses', () => {
    cy.log('a string that says cy.wait(500) is not a call');
    cy.get('[data-cy=addresses]').click();
    cy.get('[data-cy=address-card]').should('have.length', 2);
  });
});
