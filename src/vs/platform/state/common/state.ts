/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IStateService = createDecorator<IStateService>('stateService');

export interface IStateService {
	_serviceBrand: any;

	getItem<T>(key: string, defaultValue?: T): T;
	setItem(key: string, data: any): void;
	removeItem(key: string): void;
}