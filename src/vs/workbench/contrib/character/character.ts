export class Character {
	speed: number;
	attack: number;

	constructor(speed: number, attack: number) {
		this.speed = speed;
		this.attack = attack;
	}

	increaseSpeed(amount: number): void {
		this.speed += amount;
	}

	increaseAttack(amount: number): void {
		this.attack += amount;
	}
}
