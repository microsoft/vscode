/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IFileStat } from 'vs/platform/files/common/files';

export function getByName(root: IFileStat, name: string): IFileStat {
	for (let i = 0; i < root.children.length; i++) {
		if (root.children[i].name === name) {
			return root.children[i];
		}
	}

	return null;
}