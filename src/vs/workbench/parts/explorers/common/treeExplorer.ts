/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

const CUSTOM_VIEWLET_ID_ROOT = 'workbench.view.customExplorer.';
const CUSTOM_VIEWLET_ACTION_ID_ROOT = 'workbench.action.customExplorer.';

export function toCustomViewletId(viewletId: string): string {
	return CUSTOM_VIEWLET_ID_ROOT + viewletId;
}

export function toCustomViewletActionId(viewletId: string): string {
	return CUSTOM_VIEWLET_ACTION_ID_ROOT + viewletId;
}
