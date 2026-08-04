/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

class Foo {
	bar() {
		console.log('bar');
	}

	qux() {
		console.log('qux');
	}

	baz() {
		this.bar();
	}
}
