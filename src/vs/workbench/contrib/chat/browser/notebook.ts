/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

/**
 * This function will be removed, but left here for now to avoid breaking changes.
 */
export function isNotebookChatSupported() {
	return false;
}

/**
 * This function will be removed, but left here for now to avoid breaking changes.
 */
export function isNotebook(_resource: URI): boolean {
	// return !!parse(resource)?.notebook;
	return false;
}
