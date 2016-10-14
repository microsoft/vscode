/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from 'vs/base/common/arrays';
import * as paths from 'vs/base/common/paths';
import { ConfigWatcher } from 'vs/base/node/config';
import { Disposable } from 'vs/base/common/lifecycle';
import { IExtensionsRuntimeService, IExtensionsStorageData } from 'vs/platform/extensions/common/extensions';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

export class ExtensionsRuntimeService implements IExtensionsRuntimeService {

	_serviceBrand: any;

	private workspaceStorage: ExtensionsStorage;
	private globalStorage: ExtensionsStorage;

	constructor(
		@IStorageService private storageService: IStorageService
	) {
	}

	public getStoragePath(scope: StorageScope): string {
		return this.getPath(scope);
	}

	public getDisabledExtensions(scope?: StorageScope): string[] {
		if (scope) {
			return this.getData(scope).disabled || [];
		}

		const globalData = this.getData(StorageScope.GLOBAL).disabled || [];
		const workspaceData = this.getData(StorageScope.WORKSPACE).disabled || [];
		return distinct([...globalData, ...workspaceData]);
	}

	private getData(scope: StorageScope): IExtensionsStorageData {
		const extensionsStorage = this.getStorage(scope);
		return extensionsStorage ? extensionsStorage.data : {};
	}

	private getStorage(scope: StorageScope): ExtensionsStorage {
		const path = this.getPath(scope);
		if (path) {
			if (StorageScope.WORKSPACE === scope) {
				return this.getWorkspaceStorage(path);
			}
			return this.getGlobalStorage(path);
		}
		return null;
	}

	private getGlobalStorage(path: string): ExtensionsStorage {
		if (!this.globalStorage) {
			this.globalStorage = new ExtensionsStorage(path);
		}
		return this.globalStorage;
	}

	private getWorkspaceStorage(path: string): ExtensionsStorage {
		if (!this.workspaceStorage) {
			this.workspaceStorage = new ExtensionsStorage(path);
		}
		return this.workspaceStorage;
	}

	private getPath(scope: StorageScope): string {
		const path = this.storageService.getStoragePath(scope);
		return path ? paths.join(path, 'extensions.json') : void 0;
	}

	public dispose() {
		if (this.workspaceStorage) {
			this.workspaceStorage.dispose();
			this.workspaceStorage = null;
		}
		if (this.globalStorage) {
			this.globalStorage.dispose();
			this.globalStorage = null;
		}
	}
}

export class ExtensionsStorage extends Disposable {

	private _watcher: ConfigWatcher<IExtensionsStorageData>;

	constructor(path: string) {
		super();
		this._watcher = this._register(new ConfigWatcher(path, { changeBufferDelay: 300, defaultConfig: Object.create(null) }));
	}

	public get data(): IExtensionsStorageData {
		return this._watcher.getConfig();
	}
}