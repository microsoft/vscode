/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';

export const IStorageService = createDecorator<IStorageService>('storageService');

export interface IStorageService {
	_serviceBrand: any;

	/**
	 * Emitted whenever data is updated or deleted.
	 */
	readonly onDidChangeStorage: Event<IWorkspaceStorageChangeEvent>;

	/**
	 * Emitted when the storage is about to persist. This is the right time
	 * to persist data to ensure it is stored before the application shuts
	 * down.
	 */
	readonly onWillSaveState: Event<void>;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	get<R extends string | undefined>(key: string, scope: StorageScope, fallbackValue?: R): R;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a boolean.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	getBoolean<R extends boolean | undefined>(key: string, scope: StorageScope, fallbackValue?: R): R;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a number using parseInt with a base of 10.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	getInteger<R extends number | undefined>(key: string, scope: StorageScope, fallbackValue?: R): R;

	/**
	 * Store a string value under the given key to storage. The value will
	 * be converted to a string.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	store(key: string, value: any, scope: StorageScope): void;

	/**
	 * Delete an element stored under the provided key from storage.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	remove(key: string, scope: StorageScope): void;
}

export const enum StorageScope {

	/**
	 * The stored data will be scoped to all workspaces.
	 */
	GLOBAL,

	/**
	 * The stored data will be scoped to the current workspace.
	 */
	WORKSPACE
}

export interface IWorkspaceStorageChangeEvent {
	key: string;
	scope: StorageScope;
}

export const NullStorageService: IStorageService = {
	_serviceBrand: undefined,

	onDidChangeStorage: Event.None,
	onWillSaveState: Event.None,

	get<R extends string | undefined>(key: string, scope: StorageScope, fallbackValue?: R): R {
		return fallbackValue as R;
	},

	getBoolean<R extends boolean | undefined>(key: string, scope: StorageScope, fallbackValue?: R): R {
		return fallbackValue as R;
	},

	getInteger<R extends number | undefined>(key: string, scope: StorageScope, fallbackValue?: R): R {
		return fallbackValue as R;
	},

	store(key: string, value: any, scope: StorageScope): Promise<void> {
		return Promise.resolve();
	},

	remove(key: string, scope: StorageScope): Promise<void> {
		return Promise.resolve();
	}
};