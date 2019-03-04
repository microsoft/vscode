/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as _ from 'vs/base/parts/tree/browser/tree';

export function collapseAll(tree: _.ITree, except?: any): void {
	const nav = tree.getNavigator();
	let cur;
	while (cur = nav.next()) {
		if (!except || !isEqualOrParent(tree, except, cur)) {
			tree.collapse(cur);
		}
	}
}

export function isEqualOrParent(tree: _.ITree, element: any, candidateParent: any): boolean {
	const nav = tree.getNavigator(element);

	do {
		if (element === candidateParent) {
			return true;
		}
	} while (element = nav.parent());

	return false;
}

export function expandAll(tree: _.ITree): void {
	const nav = tree.getNavigator();
	let cur;
	while (cur = nav.next()) {
		tree.expand(cur);
	}
}
