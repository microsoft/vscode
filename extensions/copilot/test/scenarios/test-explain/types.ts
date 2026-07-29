/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

interface Foo {
	bar: string;
	baz?: number;
}

interface Corge {
	// This is an unrelated interface that shouldn't be included in context for `quux`
}

function quux() {
	const arr: Foo[] = [];
	arr.push({ bar: 'hello' });
	return arr;
}
