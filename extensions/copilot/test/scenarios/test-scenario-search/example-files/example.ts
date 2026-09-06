/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

interface MyInterface {
	id: number;
	name: string;
	properties: string[];
}

const myObject: MyInterface = {
	id: 1,
	name: 'foo',
	properties: ['a', 'b', 'c']
};

function getValue(value: keyof MyInterface) {
	return myObject[value];
}

getValue('id'); // 1

class Employee {
	private empCode: number;
	private empName: string;

	constructor(code: number, name: string) { }

	getSalary(): number {
		return 10000;
	}
}