/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';

export const ID = 'nextStorageService';

export const INextStorageService = createDecorator<INextStorageService>(ID);

export interface INextStorageService {
	_serviceBrand: any;

	readonly onDidChangeStorage: Event<Set<string>>;

	get(key: string, fallbackValue?: string): string;
	getBoolean(key: string, fallbackValue?: boolean): boolean;
	getInteger(key: string, fallbackValue?: number): number;

	set(key: string, value: any): Promise<void>;
	delete(key: string): Promise<void>;
}