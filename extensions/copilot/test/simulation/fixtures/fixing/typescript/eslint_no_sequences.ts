/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint no-sequences: ["error"] */
Math.max(1, 2)
const list = (1, 2, 3, 4, 5)
console.log(Math.max(list))

// tricky
export interface Node<T> {
	payload: T;
	parent: Node<T> | undefined;
}
function trickyIterate(node: Node<string> | undefined) {
	let cur = ""
	if (!node) return;
	while (node = node.parent, cur = node?.payload ?? "") {
		if (!node) break;
	}
}
function foo(): number {
	return 12
}