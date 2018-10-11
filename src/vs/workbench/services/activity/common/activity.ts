/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IBadge {
	getDescription(): string;
}

export class BaseBadge implements IBadge {
	descriptorFn: (args: any) => string;

	constructor(descriptorFn: (args: any) => string) {
		this.descriptorFn = descriptorFn;
	}

	getDescription(): string {
		return this.descriptorFn(null);
	}
}

export class NumberBadge extends BaseBadge {
	number: number;

	constructor(number: number, descriptorFn: (args: any) => string) {
		super(descriptorFn);

		this.number = number;
	}

	getDescription(): string {
		return this.descriptorFn(this.number);
	}
}

export class TextBadge extends BaseBadge {
	text: string;

	constructor(text: string, descriptorFn: (args: any) => string) {
		super(descriptorFn);

		this.text = text;
	}
}

export class IconBadge extends BaseBadge {

	constructor(descriptorFn: (args: any) => string) {
		super(descriptorFn);
	}
}

export class ProgressBadge extends BaseBadge {
}

export const IActivityService = createDecorator<IActivityService>('activityService');

export interface IActivityService {
	_serviceBrand: any;

	/**
	 * Show activity in the panel for the given panel or in the activitybar for the given viewlet or global action.
	 */
	showActivity(compositeOrActionId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable;

	/**
	 * Returns id of pinned viewlets following the visual order
	 */
	getPinnedViewletIds(): string[];
}
