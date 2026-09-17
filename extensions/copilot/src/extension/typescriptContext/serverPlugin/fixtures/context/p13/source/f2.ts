import { Age, Street } from './f1';

export class Person {

	private age: Age;

	constructor(age: Age = { value: 10 }) {
		this.age = age;
	}

	protected getStreet(): Street {
		return new Street('Main Street');
	}

	public print(): void {
		
	}
}