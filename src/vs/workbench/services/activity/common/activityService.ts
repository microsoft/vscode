/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {createDecorator} from 'vs/platform/instantiation/common/instantiation';

export interface IBadge {
	getDescription(): string;
}

export class BaseBadge implements IBadge {
	public descriptorFn: (args: any) => string;

	constructor(descriptorFn: (args: any) => string) {
		this.descriptorFn = descriptorFn;
	}

	/* protected */ public getDescription(): string {
		return this.descriptorFn(null);
	}
}

export class NumberBadge extends BaseBadge {
	public number: number;

	constructor(number: number, descriptorFn: (args: any) => string) {
		super(descriptorFn);

		this.number = number;
	}

	/* protected */ public getDescription(): string {
		return this.descriptorFn(this.number);
	}
}

export class TextBadge extends BaseBadge {
	public text: string;

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

export var IActivityService = createDecorator<IActivityService>('activityService');

export interface IActivityService {
	_serviceBrand: any;

	/**
	 * Show activity in the activitybar for the given viewlet.
	 */
	showActivity(viewletId: string, badge: IBadge, clazz?: string): void;

	/**
	 * Clears activity shown in the activitybar for the given viewlet.
	 */
	clearActivity(viewletId: string): void;
}