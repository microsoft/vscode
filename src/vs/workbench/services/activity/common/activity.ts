/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable2 } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';

export interface IActivity {
	readonly badge: IBadge;
	readonly clazz?: string;
	readonly priority?: number;
}

export const IActivityService = createDecorator<IActivityService>('activityService');

export interface IActivityService {

	readonly _serviceBrand: undefined;

	/**
	 * Show activity for the given view container
	 */
	showViewContainerActivity(viewContainerId: string, badge: IActivity): IDisposable2;

	/**
	 * Show activity for the given view
	 */
	showViewActivity(viewId: string, badge: IActivity): IDisposable2;

	/**
	 * Show accounts activity
	 */
	showAccountsActivity(activity: IActivity): IDisposable2;

	/**
	 * Show global activity
	 */
	showGlobalActivity(activity: IActivity): IDisposable2;
}

export interface IBadge {
	getDescription(): string;
}

class BaseBadge implements IBadge {

	constructor(readonly descriptorFn: (arg: any) => string) {
		this.descriptorFn = descriptorFn;
	}

	getDescription(): string {
		return this.descriptorFn(null);
	}
}

export class NumberBadge extends BaseBadge {

	constructor(readonly number: number, descriptorFn: (num: number) => string) {
		super(descriptorFn);

		this.number = number;
	}

	override getDescription(): string {
		return this.descriptorFn(this.number);
	}
}

export class TextBadge extends BaseBadge {

	constructor(readonly text: string, descriptorFn: () => string) {
		super(descriptorFn);
	}
}

export class IconBadge extends BaseBadge {
	constructor(readonly icon: ThemeIcon, descriptorFn: () => string) {
		super(descriptorFn);
	}
}

export class ProgressBadge extends BaseBadge { }
