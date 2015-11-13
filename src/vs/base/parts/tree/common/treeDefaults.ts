/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import _ = require('vs/base/parts/tree/common/tree');

export class DefaultFilter implements _.IFilter {

	public isVisible(tree: _.ITree, element: any):boolean {
		return true;
	}
}

export class DefaultSorter implements _.ISorter {

	public compare(tree: _.ITree, element: any, otherElement: any):number {
		return 0;
	}
}
