import { Entity, type Name } from './entity';

export class RegistrationNumber {
	constructor(private _value: string) {
		if (!/^[A-Z0-9]{8,12}$/.test(_value)) {
			throw new Error('Registration number must be 8-12 alphanumeric characters.');
		}
	}
	public get value(): string {
		return this._value;
	}
}

export class LegalEntity extends Entity {
	constructor(name: Name, private registrationNumber: RegistrationNumber) {
		super(name);
	}

	public getRegistrationNumber(): RegistrationNumber {
		return this.registrationNumber;
	}
}