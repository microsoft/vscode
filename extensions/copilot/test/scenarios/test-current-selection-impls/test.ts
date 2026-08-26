/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

class Baz {
	constructor(public readonly id: number) { }
}

function foo() {
	return 42;
}

function bar() {
	foo();
	const arr: IBar[] = [];
	for (let i = 0; i < 10; i++) {
		arr.push(new Baz(i));
	}
	return arr;
}

function baz() {
	foo();
	foo();
}

interface IBar {
	id: number;
}
