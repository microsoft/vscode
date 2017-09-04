/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

// Browser localStorage interface
export interface IStorage {
	length: number;
	key(index: number): string;
	clear(): void;
	setItem(key: string, value: any): void;
	getItem(key: string): string;
	removeItem(key: string): void;
}

export class StorageService implements IStorageService {

	public _serviceBrand: any;

	public static COMMON_PREFIX = 'storage://';
	public static GLOBAL_PREFIX = `${StorageService.COMMON_PREFIX}global/`;
	public static WORKSPACE_PREFIX = `${StorageService.COMMON_PREFIX}workspace/`;
	public static WORKSPACE_IDENTIFIER = 'workspaceidentifier';
	public static NO_WORKSPACE_IDENTIFIER = '__$noWorkspace__';

	private _workspaceStorage: IStorage;
	private _globalStorage: IStorage;

	private workspaceKey: string;

	constructor(
		globalStorage: IStorage,
		workspaceStorage: IStorage,
		private workspaceId?: string,
		legacyWorkspaceId?: number
	) {
		this._globalStorage = globalStorage;
		this._workspaceStorage = workspaceStorage || globalStorage;

		// Calculate workspace storage key
		this.workspaceKey = this.getWorkspaceKey(workspaceId);

		// Make sure to delete all workspace storage if the workspace has been recreated meanwhile
		// which is only possible if a id property is provided that we can check on
		if (types.isNumber(legacyWorkspaceId)) {
			this.cleanupWorkspaceScope(legacyWorkspaceId);
		}
	}

	public get storageId(): string {
		return this.workspaceId;
	}

	public get globalStorage(): IStorage {
		return this._globalStorage;
	}

	public get workspaceStorage(): IStorage {
		return this._workspaceStorage;
	}

	private getWorkspaceKey(id?: string): string {
		if (!id) {
			return StorageService.NO_WORKSPACE_IDENTIFIER;
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
		const id = this.getInteger(StorageService.WORKSPACE_IDENTIFIER, StorageScope.WORKSPACE);

		// If identifier differs, assume the workspace got recreated and thus clean all storage for this workspace
		if (types.isNumber(id) && workspaceUid !== id) {
			const keyPrefix = this.toStorageKey('', StorageScope.WORKSPACE);
			const toDelete: string[] = [];
			const length = this._workspaceStorage.length;

			for (let i = 0; i < length; i++) {
				const key = this._workspaceStorage.key(i);
				if (key.indexOf(StorageService.WORKSPACE_PREFIX) < 0) {
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
			this.store(StorageService.WORKSPACE_IDENTIFIER, workspaceUid, StorageScope.WORKSPACE);
		}
	}

	public clear(): void {
		this._globalStorage.clear();
		this._workspaceStorage.clear();
	}

	public store(key: string, value: any, scope = StorageScope.GLOBAL): void {
		const storage = (scope === StorageScope.GLOBAL) ? this._globalStorage : this._workspaceStorage;

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

	public get(key: string, scope = StorageScope.GLOBAL, defaultValue?: any): string {
		const storage = (scope === StorageScope.GLOBAL) ? this._globalStorage : this._workspaceStorage;

		const value = storage.getItem(this.toStorageKey(key, scope));
		if (types.isUndefinedOrNull(value)) {
			return defaultValue;
		}

		return value;
	}

	public getInteger(key: string, scope = StorageScope.GLOBAL, defaultValue?: number): number {
		const value = this.get(key, scope, defaultValue);

		if (types.isUndefinedOrNull(value)) {
			return defaultValue;
		}

		return parseInt(value, 10);
	}

	public getBoolean(key: string, scope = StorageScope.GLOBAL, defaultValue?: boolean): boolean {
		const value = this.get(key, scope, defaultValue);

		if (types.isUndefinedOrNull(value)) {
			return defaultValue;
		}

		if (types.isString(value)) {
			return value.toLowerCase() === 'true' ? true : false;
		}

		return value ? true : false;
	}

	public remove(key: string, scope = StorageScope.GLOBAL): void {
		const storage = (scope === StorageScope.GLOBAL) ? this._globalStorage : this._workspaceStorage;
		const storageKey = this.toStorageKey(key, scope);

		// Remove
		storage.removeItem(storageKey);
	}

	private toStorageKey(key: string, scope: StorageScope): string {
		if (scope === StorageScope.GLOBAL) {
			return StorageService.GLOBAL_PREFIX + key.toLowerCase();
		}

		return StorageService.WORKSPACE_PREFIX + this.workspaceKey + key.toLowerCase();
	}
}

export class InMemoryLocalStorage implements IStorage {
	private store: { [key: string]: string; };

	constructor() {
		this.store = {};
	}

	public get length() {
		return Object.keys(this.store).length;
	}

	public key(index: number): string {
		const keys = Object.keys(this.store);
		if (keys.length > index) {
			return keys[index];
		}

		return null;
	}

	public clear(): void {
		this.store = {};
	}

	public setItem(key: string, value: any): void {
		this.store[key] = value.toString();
	}

	public getItem(key: string): string {
		const item = this.store[key];
		if (!types.isUndefinedOrNull(item)) {
			return item;
		}

		return null;
	}

	public removeItem(key: string): void {
		delete this.store[key];
	}
}

export const inMemoryLocalStorageInstance = new InMemoryLocalStorage();