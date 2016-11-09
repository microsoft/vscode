/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export function toCustomExplorerViewletId(viewletId: string): string {
	return 'workbench.view.customExplorer.' + viewletId;
}

export function toCustomExplorerViewletActionId(viewletId: string): string {
	return 'workbench.action.customExplorer.' + viewletId;
}

export function toCustomExplorerViewletCSSClass(viewletId: string): string {
	return 'customExplorer-' + viewletId;
}

export function isValidViewletId(viewletId: string): boolean {
	// Only allow alphanumeric letters, `_` and `-`.
	return /^[a-z0-9_-]+$/i.test(viewletId);
}
