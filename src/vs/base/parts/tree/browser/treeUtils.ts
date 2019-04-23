/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as _ from 'vs/base/parts/tree/browser/tree';

export function isEqualOrParent(tree: _.ITree, element: any, candidateParent: any): boolean {
	const nav = tree.getNavigator(element);

	do {
		if (element === candidateParent) {
			return true;
		}
	} while (element = nav.parent());

	return false;
}
