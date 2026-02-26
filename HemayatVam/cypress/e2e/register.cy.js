describe('register flow', () => {
  it('loads register page', () => {
    cy.visit('/');
    cy.contains('مرحله');
  });
});
