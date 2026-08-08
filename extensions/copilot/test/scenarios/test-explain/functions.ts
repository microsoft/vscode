/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
function foo() {
	console.log('foo');
}

function bar() {
	console.log('bar');
}

function qux() {  // this function doesn't get included in prompt context
	console.log('qux');
}

function baz() {
	foo();
	bar();
}
