/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IAction } from 'vs/base/common/actions';
import { IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';

export interface IActivity {
	id: string;
	name: string;
	keybindingId?: string;
	cssClass?: string;
}

export interface IGlobalActivity extends IActivity {
	getActions(): IAction[];
}

export const GlobalActivityExtensions = 'workbench.contributions.globalActivities';

export interface IGlobalActivityRegistry {
	registerActivity(descriptor: IConstructorSignature0<IGlobalActivity>): void;
	getActivities(): IConstructorSignature0<IGlobalActivity>[];
}

export class GlobalActivityRegistry implements IGlobalActivityRegistry {

	private activityDescriptors = new Set<IConstructorSignature0<IGlobalActivity>>();

	registerActivity(descriptor: IConstructorSignature0<IGlobalActivity>): void {
		this.activityDescriptors.add(descriptor);
	}

	getActivities(): IConstructorSignature0<IGlobalActivity>[] {
		const result: IConstructorSignature0<IGlobalActivity>[] = [];
		this.activityDescriptors.forEach(d => result.push(d));
		return result;
	}
}

Registry.add(GlobalActivityExtensions, new GlobalActivityRegistry());