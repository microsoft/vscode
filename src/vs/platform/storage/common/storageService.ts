/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService, IWorkspace } from 'vs/platform/workspace/common/workspace';

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

	private static COMMON_PREFIX = 'storage://';
	/*private*/ static GLOBAL_PREFIX = StorageService.COMMON_PREFIX + 'global/';
	private static WORKSPACE_PREFIX = StorageService.COMMON_PREFIX + 'workspace/';
	private static WORKSPACE_IDENTIFIER = 'workspaceIdentifier';
	private static NO_WORKSPACE_IDENTIFIER = '__$noWorkspace__';

	private workspaceStorage: IStorage;
	private globalStorage: IStorage;

	private workspaceKey: string;

	constructor(
		globalStorage: IStorage,
		workspaceStorage: IStorage,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		const workspace = contextService.getWorkspace();

		this.globalStorage = globalStorage;
		this.workspaceStorage = workspaceStorage || globalStorage;

		// Calculate workspace storage key
		this.workspaceKey = this.getWorkspaceKey(workspace);

		// Make sure to delete all workspace storage if the workspace has been recreated meanwhile
		const workspaceUniqueId: number = workspace ? workspace.uid : void 0;
		if (types.isNumber(workspaceUniqueId)) {
			this.cleanupWorkspaceScope(workspaceUniqueId, workspace.name);
		}
	}

	private getWorkspaceKey(workspace?: IWorkspace): string {
		let workspaceUri: string = null;
		if (workspace && workspace.resource) {
			workspaceUri = workspace.resource.toString();
		}

		return workspaceUri ? this.calculateWorkspaceKey(workspaceUri) : StorageService.NO_WORKSPACE_IDENTIFIER;
	}

	private calculateWorkspaceKey(workspaceUrl: string): string {
		const root = 'file:///';
		const index = workspaceUrl.indexOf(root);
		if (index === 0) {
			return strings.rtrim(workspaceUrl.substr(root.length), '/') + '/';
		}

		return workspaceUrl;
	}

	private cleanupWorkspaceScope(workspaceId: number, workspaceName: string): void {

		// Get stored identifier from storage
		const id = this.getInteger(StorageService.WORKSPACE_IDENTIFIER, StorageScope.WORKSPACE);

		// If identifier differs, assume the workspace got recreated and thus clean all storage for this workspace
		if (types.isNumber(id) && workspaceId !== id) {
			const keyPrefix = this.toStorageKey('', StorageScope.WORKSPACE);
			const toDelete: string[] = [];
			const length = this.workspaceStorage.length;

			for (let i = 0; i < length; i++) {
				const key = this.workspaceStorage.key(i);
				if (key.indexOf(StorageService.WORKSPACE_PREFIX) < 0) {
					continue; // ignore stored things that don't belong to storage service or are defined globally
				}

				// Check for match on prefix
				if (key.indexOf(keyPrefix) === 0) {
					toDelete.push(key);
				}
			}

			if (toDelete.length > 0) {
				console.warn('Clearing previous version of local storage for workspace ', workspaceName);
			}

			// Run the delete
			toDelete.forEach((keyToDelete) => {
				this.workspaceStorage.removeItem(keyToDelete);
			});
		}

		// Store workspace identifier now
		if (workspaceId !== id) {
			this.store(StorageService.WORKSPACE_IDENTIFIER, workspaceId, StorageScope.WORKSPACE);
		}
	}

	public clear(): void {
		this.globalStorage.clear();
		this.workspaceStorage.clear();
	}

	public store(key: string, value: any, scope = StorageScope.GLOBAL): void {
		const storage = (scope === StorageScope.GLOBAL) ? this.globalStorage : this.workspaceStorage;

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
		const storage = (scope === StorageScope.GLOBAL) ? this.globalStorage : this.workspaceStorage;

		const value = storage.getItem(this.toStorageKey(key, scope));
		if (types.isUndefinedOrNull(value)) {
			return defaultValue;
		}

		return value;
	}

	public remove(key: string, scope = StorageScope.GLOBAL): void {
		const storage = (scope === StorageScope.GLOBAL) ? this.globalStorage : this.workspaceStorage;
		const storageKey = this.toStorageKey(key, scope);

		// Remove
		storage.removeItem(storageKey);
	}

	public swap(key: string, valueA: any, valueB: any, scope = StorageScope.GLOBAL, defaultValue?: any): void {
		const value = this.get(key, scope);
		if (types.isUndefinedOrNull(value) && defaultValue) {
			this.store(key, defaultValue, scope);
		} else if (value === valueA.toString()) { // Convert to string because store is string based
			this.store(key, valueB, scope);
		} else {
			this.store(key, valueA, scope);
		}
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

	private toStorageKey(key: string, scope: StorageScope): string {
		if (scope === StorageScope.GLOBAL) {
			return StorageService.GLOBAL_PREFIX + key.toLowerCase();
		}

		return StorageService.WORKSPACE_PREFIX + this.workspaceKey + key.toLowerCase();
	}
}

// In-Memory Local Storage Implementation
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