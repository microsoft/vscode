/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint no-multi-assign: "error" */
export interface Node<T> {
	payload: T;
	parent: Node<T> | undefined;
}
export function grandparentOfEmpty(leaf: Node<string>) {
	let node, child, grandchild;
	node = child = grandchild = leaf;
	while (node) {
		if (node.payload === '' && grandchild.payload) {
			return [node, grandchild];
		}
		grandchild = child;
		child = node;
		node = node.parent;
	}
	return undefined;

}