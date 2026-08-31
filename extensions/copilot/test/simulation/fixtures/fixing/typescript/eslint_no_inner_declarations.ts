/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
/* eslint no-inner-declarations: "error" */
interface Node {
	position: Position
	payload: any;
	children: Node[]
}
function visitLeaves(root: Node, f: (n: Node) => void) {
	if (root.children) {
		function walk(n: Node) {
			for (const child of n.children) {
				walk(child);
			}
		}
		walk(root);
	} else {
		f(root)
	}
}