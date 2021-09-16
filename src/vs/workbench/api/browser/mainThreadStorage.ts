/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { MainThreadStorageShape, MainContext, IExtHostContext, ExtHostStorageShape, ExtHostContext } from '../common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IExtensionIdWithVersion, IExtensionsStorageSyncService } from 'vs/platform/userDataSync/common/extensionsStorageSync';
import { ILogService } from 'vs/platform/log/common/log';

@extHostNamedCustomer(MainContext.MainThreadStorage)
export class MainThreadStorage implements MainThreadStorageShape {

	private readonly _storageService: IStorageService;
	private readonly _extensionsStorageSyncService: IExtensionsStorageSyncService;
	private readonly _proxy: ExtHostStorageShape;
	private readonly _storageListener: IDisposable;
	private readonly _sharedStorageKeysToWatch: Map<string, boolean> = new Map<string, boolean>();

	constructor(
		extHostContext: IExtHostContext,
		@IStorageService storageService: IStorageService,
		@IExtensionsStorageSyncService extensionsStorageSyncService: IExtensionsStorageSyncService,
		@ILogService private readonly _logService: ILogService
	) {
		this._storageService = storageService;
		this._extensionsStorageSyncService = extensionsStorageSyncService;
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostStorage);

		this._storageListener = this._storageService.onDidChangeValue(e => {
			const shared = e.scope === StorageScope.GLOBAL;
			if (shared && this._sharedStorageKeysToWatch.has(e.key)) {
				this._proxy.$acceptValue(shared, e.key, this._getValue(shared, e.key));
			}
		});
	}

	dispose(): void {
		this._storageListener.dispose();
	}

	async $getValue<T>(shared: boolean, key: string): Promise<T | undefined> {
		if (shared) {
			this._sharedStorageKeysToWatch.set(key, true);
		}
		return this._getValue<T>(shared, key);
	}

	private _getValue<T>(shared: boolean, key: string): T | undefined {
		const jsonValue = this._storageService.get(key, shared ? StorageScope.GLOBAL : StorageScope.WORKSPACE);
		if (jsonValue) {
			try {
				return JSON.parse(jsonValue);
			} catch (error) {
				// Do not fail this call but log it for diagnostics
				// https://github.com/microsoft/vscode/issues/132777
				this._logService.error(`[mainThreadStorage] unexpected error parsing storage contents (key: ${key}, shared: ${shared}): ${error}`);
			}
		}

		return undefined;
	}

	async $setValue(shared: boolean, key: string, value: object): Promise<void> {
		this._storageService.store(key, JSON.stringify(value), shared ? StorageScope.GLOBAL : StorageScope.WORKSPACE, StorageTarget.MACHINE /* Extension state is synced separately through extensions */);
	}

	$registerExtensionStorageKeysToSync(extension: IExtensionIdWithVersion, keys: string[]): void {
		this._extensionsStorageSyncService.setKeysForSync(extension, keys);
	}
}
