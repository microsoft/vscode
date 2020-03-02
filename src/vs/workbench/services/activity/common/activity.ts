/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IActivityService = createDecorator<IActivityService>('activityService');

export interface IActivityService {

	_serviceBrand: undefined;

	/**
	 * Show activity in the panel for the given panel or in the activitybar for the given viewlet or global action.
	 */
	showActivity(compositeOrActionId: string, badge: IBadge, clazz?: string, priority?: number): IDisposable;
}

export interface IBadge {
	getDescription(): string;
}

class BaseBadge implements IBadge {

	constructor(public readonly descriptorFn: (arg: any) => string) {
		this.descriptorFn = descriptorFn;
	}

	getDescription(): string {
		return this.descriptorFn(null);
	}
}

export class NumberBadge extends BaseBadge {

	constructor(public readonly number: number, descriptorFn: (num: number) => string) {
		super(descriptorFn);

		this.number = number;
	}

	getDescription(): string {
		return this.descriptorFn(this.number);
	}
}

export class TextBadge extends BaseBadge {

	constructor(public readonly text: string, descriptorFn: () => string) {
		super(descriptorFn);
	}
}

export class IconBadge extends BaseBadge {

	constructor(descriptorFn: () => string) {
		super(descriptorFn);
	}
}

export class ProgressBadge extends BaseBadge { }
