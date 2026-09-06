export class Age {
	constructor(private _value: number) {
		if (_value < 0 || _value > 150) {
			throw new Error('Age must be between 0 and 150.');
		}
	}
	public get value(): number {
		return this._value;
	}
}

export class Person {
	constructor(private name: string, private age: Age) {
	}
	public getName(): string {
		return this.name;
	}
	public getAge(): Age {
		return this.age;
	}
}