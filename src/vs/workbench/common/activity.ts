/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IAction } from 'vs/base/common/actions';

export interface IActivity {
	id: string;
	name: string;
	keybindingId?: string;
	cssClass?: string;
}

export interface IGlobalActivity {
	getActions(): IAction[];
}

export const GLOBAL_ACTIVITY_ID = 'workbench.action.globalActivity';

export const GlobalActivityActionsExtensions = 'workbench.contributions.globalActivityActions';

export interface IGlobalActivityRegistry {
	registerActivity(activity: IGlobalActivity): void;
	getActivities(): IGlobalActivity[];
}

export class GlobalActivityRegistry implements IGlobalActivityRegistry {

	private readonly activities: IGlobalActivity[] = [];

	registerActivity(activity: IGlobalActivity): void {
		this.activities.push(activity);
	}

	getActivities(): IGlobalActivity[] {
		return [...this.activities];
	}
}

Registry.add(GlobalActivityActionsExtensions, new GlobalActivityRegistry());