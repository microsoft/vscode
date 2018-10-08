/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';

export const ID = 'nextWorkspaceStorageService';

export const INextWorkspaceStorageService = createDecorator<INextWorkspaceStorageService>(ID);

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
	keys: Set<string>;
	scope: StorageScope;
}

export interface INextWorkspaceStorageService {
	_serviceBrand: any;

	readonly onDidChangeStorage: Event<IWorkspaceStorageChangeEvent>;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined.
	 *
	 * The optional scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	get(key: string, scope?: StorageScope, fallbackValue?: string): string;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a boolean.
	 *
	 * The optional scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	getBoolean(key: string, scope?: StorageScope, fallbackValue?: boolean): boolean;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a number using parseInt with a base of 10.
	 *
	 * The optional scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	getInteger(key: string, scope?: StorageScope, fallbackValue?: number): number;

	/**
	 * Store a string value under the given key to storage. The value will
	 * be converted to a string.
	 *
	 * The optional scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	set(key: string, value: any, scope?: StorageScope): Promise<void>;

	/**
	 * Delete an element stored under the provided key from storage.
	 *
	 * The optional scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	delete(key: string, scope?: StorageScope): Promise<void>;
}