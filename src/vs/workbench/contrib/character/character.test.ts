import { Character } from './character';

describe('Character', () => {
	let character: Character;

	beforeEach(() => {
		character = new Character(10, 5);
	});

	it('should increase speed', () => {
		character.increaseSpeed(5);
		assert.equal(character.speed, 15);
	});

	it('should increase attack', () => {
		character.increaseAttack(3);
		assert.equal(character.attack, 8);
	});
});
