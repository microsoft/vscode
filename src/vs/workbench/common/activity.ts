/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IActivity {
	id: string;
	name: string;
	keybindingId?: string;
	cssClass?: string;
}

export const GLOBAL_ACTIVITY_ID = 'workbench.action.globalActivity';