export class Name {
	constructor(private _value: string) {
		if (_value.trim().length === 0) {
			throw new Error('Name cannot be empty.');
		}
	}
	public get value(): string {
		return this._value;
	}
}

export class Entity {
	
	constructor(protected name: Name) {
	}

	getName(): Name {
		return this.name;
	}
}