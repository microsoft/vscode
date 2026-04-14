import type { Employee } from './employee';
import type { Name } from './entity';
import type { EventProvider } from './eventProvider';
import { LegalEntity, type RegistrationNumber } from './legalEntity';
import type { Age } from './person';

export class Company extends LegalEntity {

	private employees: Employee[] = [];

	constructor(companyName: Name, registrationNumber: RegistrationNumber) {
		super(companyName, registrationNumber);
	}

	public listen(eventProvider: EventProvider): void {
		eventProvider.onEmployeeAdded((employee: Employee) => {
			this.addEmployee(employee);
			
		});
	}

	public addEmployee(employee: Employee): void {
		this.employees.push(employee);

	}

	public getEmployee(name: string): Employee | undefined {
		return this.employees.find(emp => emp.getName() === name);
	}

	public getAllEmployees(): Employee[] {
		return this.employees;
	}

	public averageEmployeeAge(): number {
		let totalAge = 0;
		for (const employee of this.employees) {
			const age: Age = employee.getAge();
			totalAge += age.value;
		}
		return this.employees.length === 0 ? 0 : totalAge / this.employees.length;
	}
}