describe('Basic UI Test', () => {
  it('visits Google and checks the title', () => {
    cy.visit('https://google.com');
    cy.title().should('include', 'Google');
  });
});