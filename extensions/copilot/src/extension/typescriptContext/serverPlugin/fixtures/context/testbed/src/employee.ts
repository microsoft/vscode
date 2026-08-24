import { Person, type Age } from './person';

export class Employee extends Person {
	private employeeId: number;

	constructor(name: string, age: Age, employeeId: number) {
		super(name, age);
		this.employeeId = employeeId;
	}

	getEmployeeDetails(): string {
		return `ID: ${this.employeeId}, Name: ${this.getName()}, Age: ${this.getAge().value}`;
	}
}