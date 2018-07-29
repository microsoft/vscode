/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as _ from 'vs/base/parts/tree/browser/tree';

export function collapseAll(tree: _.ITree): void {
	const nav = tree.getNavigator();
	let cur;
	while (cur = nav.next()) {
		tree.collapse(cur);
	}
}

export function expandAll(tree: _.ITree): void {
	const nav = tree.getNavigator();
	let cur;
	while (cur = nav.next()) {
		tree.expand(cur);
	}
}
