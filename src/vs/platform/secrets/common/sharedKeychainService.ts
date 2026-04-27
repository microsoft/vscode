/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

/**
 * Provides shared keychain access between Code and the embedded Agents app
 * via a macOS keychain access group. On non-macOS platforms the implementation
 * is a no-op (returns undefined/empty for all operations).
 */
export const ISharedKeychainService = createDecorator<ISharedKeychainService>('sharedKeychainService');

export interface ISharedKeychainService {
	readonly _serviceBrand: undefined;
	get(key: string): Promise<string | undefined>;
	set(key: string, value: string): Promise<void>;
	delete(key: string): Promise<boolean>;
	keys(): Promise<string[]>;
}

export const ISharedKeychainMainService = createDecorator<ISharedKeychainMainService>('sharedKeychainMainService');

export interface ISharedKeychainMainService extends ISharedKeychainService { }
