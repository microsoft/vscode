/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IModifiedFileEntry } from '../common/editing/chatEditingService.js';

export function editingEntriesContainResource(entries: readonly IModifiedFileEntry[], resourceUri: URI): boolean {
	for (const entry of entries) {
		if (isEqual(entry.modifiedURI, resourceUri) || isEqual(entry.originalURI, resourceUri)) {
			return true;
		}
	}

	return false;
}
