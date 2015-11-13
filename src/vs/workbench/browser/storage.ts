/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {EventEmitter} from 'vs/base/common/eventEmitter';
import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import strings = require('vs/base/common/strings');
import {IStorageService, StorageScope, StorageEvent, StorageEventType} from 'vs/platform/storage/common/storage';
import {IWorkspaceContextService, IWorkspace} from 'vs/platform/workspace/common/workspace';

// Browser localStorage interface
export interface IStorage {
	length: number;
	key(index: number): string;
	clear(): void;
	setItem(key: string, value: any): void;
	getItem(key: string): string;
	removeItem(key: string): void;
}

export class Storage extends EventEmitter implements IStorageService {
	public serviceId = IStorageService;
	private static COMMON_PREFIX = 'storage://';
	private static GLOBAL_PREFIX = Storage.COMMON_PREFIX + 'global/';
	private static WORKSPACE_PREFIX = Storage.COMMON_PREFIX + 'workspace/';
	private static WORKSPACE_IDENTIFIER = 'workspaceIdentifier';
	private static NO_WORKSPACE_IDENTIFIER = '__$noWorkspace__';

	private workspaceStorage: IStorage;
	private globalStorage: IStorage;

	private toUnbind: { (): void; }[];
	private workspaceKey: string;

	constructor(contextService: IWorkspaceContextService, storageImpl?: IStorage) {
		super();

		let workspace = contextService.getWorkspace();

		// Take provided storage impl if any
		if (!!storageImpl) {
			this.globalStorage = storageImpl;
			this.workspaceStorage = storageImpl;
		}

		// Otherwise use browser storage
		else {
			this.globalStorage = window.localStorage;

			if (!workspace && !contextService.getConfiguration().env.pluginDevelopmentPath) {
				this.workspaceStorage = inMemoryLocalStorageInstance; // without workspace, we use inMemory storage unless we develop a plugin where we want to preserve state
			} else {
				this.workspaceStorage = window.localStorage;
			}
		}

		this.toUnbind = [];

		// Calculate workspace storage key
		this.workspaceKey = this.getWorkspaceKey(workspace);

		// Make sure to delete all workspace storage if the workspace has been recreated meanwhile
		let workspaceUniqueId: number = workspace ? workspace.uid : null;
		if (types.isNumber(workspaceUniqueId)) {
			this.cleanupWorkspaceScope(workspaceUniqueId, workspace.name);
		}
	}

	private getWorkspaceKey(workspace?: IWorkspace): string {
		let workspaceUri: string = null;
		if (workspace && workspace.resource) {
			workspaceUri = workspace.resource.toString();
		}

		return workspaceUri ? Storage.calculateWorkspaceKey(workspaceUri) : Storage.NO_WORKSPACE_IDENTIFIER;
	}

	private cleanupWorkspaceScope(workspaceId: number, workspaceName: string): void {

		// Get stored identifier from storage
		let id = this.getInteger(Storage.WORKSPACE_IDENTIFIER, StorageScope.WORKSPACE);

		// If identifier differs, assume the workspace got recreated and thus clean all storage for this workspace
		if (types.isNumber(id) && workspaceId !== id) {
			let keyPrefix = this.toStorageKey('', StorageScope.WORKSPACE);
			let toDelete: string[] = [];
			let length = this.workspaceStorage.length;

			for (let i = 0; i < length; i++) {
				let key = this.workspaceStorage.key(i);
				if (key.indexOf(Storage.WORKSPACE_PREFIX) < 0) {
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
			this.store(Storage.WORKSPACE_IDENTIFIER, workspaceId, StorageScope.WORKSPACE);
		}
	}

	public clear(): void {
		this.globalStorage.clear();
		this.workspaceStorage.clear();
	}

	public store(key: string, value: any, scope = StorageScope.GLOBAL): void {
		let storage = (scope === StorageScope.GLOBAL) ? this.globalStorage : this.workspaceStorage;

		if (types.isUndefinedOrNull(value)) {
			this.remove(key, scope); // we cannot store null or undefined, in that case we remove the key
			return;
		}

		let storageKey = this.toStorageKey(key, scope);
		let before = storage.getItem(storageKey);
		let after = value.toString();

		// Store
		try {
			storage.setItem(storageKey, value);
		} catch (error) {
			errors.onUnexpectedError(error);
		}

		// Emit Event
		if (before !== after) {
			this.emit(StorageEventType.STORAGE, new StorageEvent(key, before, after));
		}
	}

	public get(key: string, scope = StorageScope.GLOBAL, defaultValue?: any): string {
		let storage = (scope === StorageScope.GLOBAL) ? this.globalStorage : this.workspaceStorage;

		let value = storage.getItem(this.toStorageKey(key, scope));
		if (types.isUndefinedOrNull(value)) {
			return defaultValue;
		}

		return value;
	}

	public remove(key: string, scope = StorageScope.GLOBAL): void {
		let storage = (scope === StorageScope.GLOBAL) ? this.globalStorage : this.workspaceStorage;

		let storageKey = this.toStorageKey(key, scope);
		let before = storage.getItem(storageKey);
		let after: any = null;

		// Remove
		storage.removeItem(storageKey);

		// Emit Event
		if (before !== after) {
			this.emit(StorageEventType.STORAGE, new StorageEvent(key, before, after));
		}
	}

	public swap(key: string, valueA: any, valueB: any, scope = StorageScope.GLOBAL, defaultValue?: any): void {
		let value = this.get(key, scope);
		if (types.isUndefinedOrNull(value) && defaultValue) {
			this.store(key, defaultValue, scope);
		} else if (value === valueA.toString()) { // Convert to string because store is string based
			this.store(key, valueB, scope);
		} else {
			this.store(key, valueA, scope);
		}
	}

	public getInteger(key: string, scope = StorageScope.GLOBAL, defaultValue?: number): number {
		let value = this.get(key, scope, defaultValue);

		if (types.isUndefinedOrNull(value)) {
			return defaultValue;
		}

		return parseInt(value, 10);
	}

	public getBoolean(key: string, scope = StorageScope.GLOBAL, defaultValue?: boolean): boolean {
		let value = this.get(key, scope, defaultValue);

		if (types.isUndefinedOrNull(value)) {
			return defaultValue;
		}

		if (types.isString(value)) {
			return value.toLowerCase() === 'true' ? true : false;
		}

		return value ? true : false;
	}

	public dispose(): void {
		super.dispose();

		while (this.toUnbind.length) {
			this.toUnbind.pop()();
		}
	}

	private toStorageKey(key: string, scope: StorageScope): string {
		if (scope === StorageScope.GLOBAL) {
			return Storage.GLOBAL_PREFIX + key.toLowerCase();
		}

		return Storage.WORKSPACE_PREFIX + this.workspaceKey + key.toLowerCase();
	}

	private static calculateWorkspaceKey(workspaceUrl: string): string {
		let root = window.location.protocol + '//' + window.location.host + '/';
		let index = workspaceUrl.indexOf(root);
		if (index === 0) {
			return strings.rtrim(workspaceUrl.substr(root.length), '/') + '/';
		}

		return workspaceUrl;
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
		let keys = Object.keys(this.store);
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
		let item = this.store[key];
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