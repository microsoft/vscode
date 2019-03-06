/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILayoutService = createDecorator<ILayoutService>('layoutService');

export interface IDimension {
	width: number;
	height: number;
}

export interface ILayoutService {

	_serviceBrand: any;

	/**
	 * The dimensions of the container.
	 */
	readonly dimension: IDimension;

	/**
	 * An event that is emitted when the container is layed out. The
	 * event carries the dimensions of the container as part of it.
	 */
	readonly onLayout: Event<IDimension>;
}