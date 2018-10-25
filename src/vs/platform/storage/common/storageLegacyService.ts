/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as types from 'vs/base/common/types';
import * as errors from 'vs/base/common/errors';
import * as strings from 'vs/base/common/strings';
import * as perf from 'vs/base/common/performance';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

// Browser localStorage interface
export interface IStorageLegacy {
	length: number;
	key(index: number): string | null;
	setItem(key: string, value: any): void;
	getItem(key: string): string | null;
	removeItem(key: string): void;
}

export const ID = 'storageLegacyService';

export const IStorageLegacyService = createDecorator<IStorageLegacyService>(ID);

export interface IStorageLegacyService {
	_serviceBrand: any;

	/**
	 * Store a string value under the given key to local storage.
	 *
	 * The optional scope argument allows to define the scope of the operation.
	 */
	store(key: string, value: any, scope?: StorageLegacyScope): void;

	/**
	 * Delete an element stored under the provided key from local storage.
	 *
	 * The optional scope argument allows to define the scope of the operation.
	 */
	remove(key: string, scope?: StorageLegacyScope): void;

	/**
	 * Retrieve an element stored with the given key from local storage. Use
	 * the provided defaultValue if the element is null or undefined.
	 *
	 * The optional scope argument allows to define the scope of the operation.
	 */
	get(key: string, scope?: StorageLegacyScope, defaultValue?: string): string | undefined;

	/**
	 * Retrieve an element stored with the given key from local storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a number using parseInt with a base of 10.
	 *
	 * The optional scope argument allows to define the scope of the operation.
	 */
	getInteger(key: string, scope?: StorageLegacyScope, defaultValue?: number): number | undefined;

	/**
	 * Retrieve an element stored with the given key from local storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a boolean.
	 *
	 * The optional scope argument allows to define the scope of the operation.
	 */
	getBoolean(key: string, scope?: StorageLegacyScope, defaultValue?: boolean): boolean | undefined;
}

export const enum StorageLegacyScope {

	/**
	 * The stored data will be scoped to all workspaces of this domain.
	 */
	GLOBAL,

	/**
	 * The stored data will be scoped to the current workspace.
	 */
	WORKSPACE
}


export class StorageLegacyService implements IStorageLegacyService {

	_serviceBrand: any;

	static readonly COMMON_PREFIX = 'storage://';
	static readonly GLOBAL_PREFIX = `${StorageLegacyService.COMMON_PREFIX}global/`;
	static readonly WORKSPACE_PREFIX = `${StorageLegacyService.COMMON_PREFIX}workspace/`;
	static readonly WORKSPACE_IDENTIFIER = 'workspaceidentifier';
	static readonly NO_WORKSPACE_IDENTIFIER = '__$noWorkspace__';

	private _workspaceStorage: IStorageLegacy;
	private _globalStorage: IStorageLegacy;

	private workspaceKey: string;
	private _workspaceId: string | undefined;

	constructor(
		globalStorage: IStorageLegacy,
		workspaceStorage: IStorageLegacy,
		workspaceId?: string,
		legacyWorkspaceId?: number
	) {
		this._globalStorage = globalStorage;
		this._workspaceStorage = workspaceStorage || globalStorage;

		this.setWorkspaceId(workspaceId, legacyWorkspaceId);
	}

	get workspaceId(): string | undefined {
		return this._workspaceId;
	}

	setWorkspaceId(workspaceId: string | undefined, legacyWorkspaceId?: number): void {
		this._workspaceId = workspaceId;

		// Calculate workspace storage key
		this.workspaceKey = this.getWorkspaceKey(workspaceId);

		// Make sure to delete all workspace storage if the workspace has been recreated meanwhile
		// which is only possible if a id property is provided that we can check on
		if (types.isNumber(legacyWorkspaceId)) {
			this.cleanupWorkspaceScope(legacyWorkspaceId);
		} else {
			// ensure that we always store a workspace identifier because this key
			// is used to migrate data out as needed
			const workspaceIdentifier = this.getInteger(StorageLegacyService.WORKSPACE_IDENTIFIER, StorageLegacyScope.WORKSPACE);
			if (!workspaceIdentifier) {
				this.store(StorageLegacyService.WORKSPACE_IDENTIFIER, 42, StorageLegacyScope.WORKSPACE);
			}
		}
	}

	get globalStorage(): IStorageLegacy {
		return this._globalStorage;
	}

	get workspaceStorage(): IStorageLegacy {
		return this._workspaceStorage;
	}

	private getWorkspaceKey(id?: string): string {
		if (!id) {
			return StorageLegacyService.NO_WORKSPACE_IDENTIFIER;
		}

		// Special case file:// URIs: strip protocol from key to produce shorter key
		const fileProtocol = 'file:///';
		if (id.indexOf(fileProtocol) === 0) {
			id = id.substr(fileProtocol.length);
		}

		// Always end with "/"
		return `${strings.rtrim(id, '/')}/`;
	}

	private cleanupWorkspaceScope(workspaceUid: number): void {

		// Get stored identifier from storage
		perf.mark('willReadWorkspaceIdentifier');
		const id = this.getInteger(StorageLegacyService.WORKSPACE_IDENTIFIER, StorageLegacyScope.WORKSPACE);
		perf.mark('didReadWorkspaceIdentifier');

		// If identifier differs, assume the workspace got recreated and thus clean all storage for this workspace
		if (types.isNumber(id) && workspaceUid !== id) {
			const keyPrefix = this.toStorageKey('', StorageLegacyScope.WORKSPACE);
			const toDelete: string[] = [];
			const length = this._workspaceStorage.length;

			for (let i = 0; i < length; i++) {
				const key = this._workspaceStorage.key(i);
				if (!key || key.indexOf(StorageLegacyService.WORKSPACE_PREFIX) < 0) {
					continue; // ignore stored things that don't belong to storage service or are defined globally
				}

				// Check for match on prefix
				if (key.indexOf(keyPrefix) === 0) {
					toDelete.push(key);
				}
			}

			// Run the delete
			toDelete.forEach((keyToDelete) => {
				this._workspaceStorage.removeItem(keyToDelete);
			});
		}

		// Store workspace identifier now
		if (workspaceUid !== id) {
			this.store(StorageLegacyService.WORKSPACE_IDENTIFIER, workspaceUid, StorageLegacyScope.WORKSPACE);
		}
	}

	store(key: string, value: any, scope = StorageLegacyScope.GLOBAL): void {
		const storage = (scope === StorageLegacyScope.GLOBAL) ? this._globalStorage : this._workspaceStorage;

		if (types.isUndefinedOrNull(value)) {
			this.remove(key, scope); // we cannot store null or undefined, in that case we remove the key
			return;
		}

		const storageKey = this.toStorageKey(key, scope);

		// Store
		try {
			storage.setItem(storageKey, value);
		} catch (error) {
			errors.onUnexpectedError(error);
		}
	}

	get(key: string, scope = StorageLegacyScope.GLOBAL, defaultValue?: any): string {
		const storage = (scope === StorageLegacyScope.GLOBAL) ? this._globalStorage : this._workspaceStorage;

		const value = storage.getItem(this.toStorageKey(key, scope));
		if (types.isUndefinedOrNull(value)) {
			return defaultValue;
		}

		return value;
	}

	getInteger(key: string, scope = StorageLegacyScope.GLOBAL, defaultValue: number = 0): number {
		const value = this.get(key, scope, defaultValue);

		if (types.isUndefinedOrNull(value)) {
			return defaultValue;
		}

		return parseInt(value, 10);
	}

	getBoolean(key: string, scope = StorageLegacyScope.GLOBAL, defaultValue: boolean = false): boolean {
		const value = this.get(key, scope, defaultValue);

		if (types.isUndefinedOrNull(value)) {
			return defaultValue;
		}

		if (types.isString(value)) {
			return value.toLowerCase() === 'true' ? true : false;
		}

		return value ? true : false;
	}

	remove(key: string, scope = StorageLegacyScope.GLOBAL): void {
		const storage = (scope === StorageLegacyScope.GLOBAL) ? this._globalStorage : this._workspaceStorage;
		const storageKey = this.toStorageKey(key, scope);

		// Remove
		storage.removeItem(storageKey);
	}

	private toStorageKey(key: string, scope: StorageLegacyScope): string {
		if (scope === StorageLegacyScope.GLOBAL) {
			return StorageLegacyService.GLOBAL_PREFIX + key.toLowerCase();
		}

		return StorageLegacyService.WORKSPACE_PREFIX + this.workspaceKey + key.toLowerCase();
	}
}

export class InMemoryLocalStorage implements IStorageLegacy {
	private store: { [key: string]: string; };

	constructor() {
		this.store = {};
	}

	get length() {
		return Object.keys(this.store).length;
	}

	key(index: number): string | null {
		const keys = Object.keys(this.store);
		if (keys.length > index) {
			return keys[index];
		}

		return null;
	}

	setItem(key: string, value: any): void {
		this.store[key] = value.toString();
	}

	getItem(key: string): string | null {
		const item = this.store[key];
		if (!types.isUndefinedOrNull(item)) {
			return item;
		}

		return null;
	}

	removeItem(key: string): void {
		delete this.store[key];
	}
}

export const inMemoryLocalStorageInstance = new InMemoryLocalStorage();