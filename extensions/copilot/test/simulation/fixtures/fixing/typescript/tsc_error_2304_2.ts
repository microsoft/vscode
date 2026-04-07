const options = [
	{ title: 'Option A', value: 'option-a' },
	{ title: 'Option B', value: 'option-b' }
];

describe('options list', () => {
	it('loads examples', () => {
		cy.visit('/options-list');
	})
});