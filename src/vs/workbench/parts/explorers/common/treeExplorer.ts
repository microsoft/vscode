/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export function toViewletId(viewletId: string): string {
	return `workbench.view.extension.${viewletId}`;
}

export function toViewletActionId(viewletId: string): string {
	return `workbench.action.extension.${viewletId}`;
}

export function toViewletCSSClass(viewletId: string): string {
	return `extensionViewlet-${viewletId}`;
}

export function isValidViewletId(viewletId: string): boolean {
	return /^[a-z0-9_-]+$/i.test(viewletId); // Only allow alphanumeric letters, `_` and `-`.
}
