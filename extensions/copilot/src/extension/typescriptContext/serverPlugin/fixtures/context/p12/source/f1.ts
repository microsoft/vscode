export class Person {
	private age: number;

	constructor(age: number = 10) {
		this.age = age;
	}

	public getAlter(): number {
		return this.age;
	}
}

export function getAge(person: Person): number {
	return person.getAlter();
}