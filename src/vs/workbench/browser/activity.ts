/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/platform';
import { IConstructorSignature0 } from 'vs/platform/instantiation/common/instantiation';

export interface IActivity {
	id: string;
	name: string;
	cssClass: string;
}

export const Extensions = {
	Activities: 'workbench.contributions.activities'
};

export interface IActivityRegistry {
	registerActivity(descriptor: IConstructorSignature0<IActivity>): void;
	getActivities(): IConstructorSignature0<IActivity>[];
}

export class ActivityRegistry implements IActivityRegistry {

	private activityDescriptors = new Set<IConstructorSignature0<IActivity>>();

	registerActivity(descriptor: IConstructorSignature0<IActivity>): void {
		this.activityDescriptors.add(descriptor);
	}

	getActivities(): IConstructorSignature0<IActivity>[] {
		const result: IConstructorSignature0<IActivity>[] = [];
		this.activityDescriptors.forEach(d => result.push(d));
		return result;
	}
}

Registry.add(Extensions.Activities, new ActivityRegistry());