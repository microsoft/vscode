/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';

export const INextStorage2Service = createDecorator<INextStorage2Service>('nextStorage2Service');

export interface INextStorage2Service {
	_serviceBrand: any;

	/**
	 * Emitted whenever data is updated or deleted.
	 */
	readonly onDidChangeStorage: Event<IWorkspaceStorageChangeEvent>;

	/**
	 * Emitted when the storage is about to close. This is the right time
	 * to persist data to ensure it is stored before the application shuts
	 * down.
	 */
	readonly onWillClose: Event<ShutdownReason>;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	get(key: string, scope: StorageScope, fallbackValue?: string): string;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a boolean.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a number using parseInt with a base of 10.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	getInteger(key: string, scope: StorageScope, fallbackValue?: number): number;

	/**
	 * Store a string value under the given key to storage. The value will
	 * be converted to a string.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	set(key: string, value: any, scope: StorageScope): Promise<void>;

	/**
	 * Delete an element stored under the provided key from storage.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	delete(key: string, scope: StorageScope): Promise<void>;
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

export const NullNextStorage2Service: INextStorage2Service = {
	_serviceBrand: undefined,

	onDidChangeStorage: Event.None,
	onWillClose: Event.None,

	get(key: string, scope: StorageScope, fallbackValue?: string): string {
		return fallbackValue;
	},

	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean {
		return fallbackValue;
	},

	getInteger(key: string, scope: StorageScope, fallbackValue?: number): number {
		return fallbackValue;
	},

	set(key: string, value: any, scope: StorageScope): Promise<void> {
		return Promise.resolve();
	},

	delete(key: string, scope: StorageScope): Promise<void> {
		return Promise.resolve();
	}
};