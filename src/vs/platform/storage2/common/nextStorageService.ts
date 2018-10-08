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

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined.
	 */
	get(key: string, fallbackValue?: string): string;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a boolean.
	 */
	getBoolean(key: string, fallbackValue?: boolean): boolean;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a number using parseInt with a base of 10.
	 */
	getInteger(key: string, fallbackValue?: number): number;

	/**
	 * Store a string value under the given key to storage. The value will
	 * be converted to a string.
	 */
	set(key: string, value: any): Promise<void>;

	/**
	 * Delete an element stored under the provided key from storage.
	 */
	delete(key: string): Promise<void>;
}