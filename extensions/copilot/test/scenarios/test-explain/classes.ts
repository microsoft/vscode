/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export class Foo {
	bar() {
		return 1;
	}
}

export class Baz { // This class declaration is irrelevant to the implementation of quuz
	qux() {
		return 2;
	}
}

function quuz() {
	new Foo();
}
