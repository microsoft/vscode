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
import { FileSystemProviderError, FileSystemProviderErrorCode, IFileService } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { isWeb } from 'vs/base/common/platform';
import { getErrorMessage } from 'vs/base/common/errors';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

@extHostNamedCustomer(MainContext.MainThreadStorage)
export class MainThreadStorage implements MainThreadStorageShape {

	private readonly _proxy: ExtHostStorageShape;
	private readonly _storageListener: IDisposable;
	private readonly _sharedStorageKeysToWatch: Map<string, boolean> = new Map<string, boolean>();

	constructor(
		extHostContext: IExtHostContext,
		@IStorageService private readonly _storageService: IStorageService,
		@IExtensionsStorageSyncService private readonly _extensionsStorageSyncService: IExtensionsStorageSyncService,
		@IFileService private readonly _fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ILogService private readonly _logService: ILogService
	) {
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
		if (isWeb && key !== key.toLowerCase()) {
			await this._migrateExtensionStorage(key.toLowerCase(), key, `extension.storage.migrateFromLowerCaseKey.${key.toLowerCase()}`);
		}
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

	private _remove(shared: boolean, key: string): void {
		this._storageService.remove(key, shared ? StorageScope.GLOBAL : StorageScope.WORKSPACE);
	}

	$registerExtensionStorageKeysToSync(extension: IExtensionIdWithVersion, keys: string[]): void {
		this._extensionsStorageSyncService.setKeysForSync(extension, keys);
	}

	private async _migrateExtensionStorage(from: string, to: string, storageMigratedKey: string): Promise<void> {
		if (from === to) {
			return;
		}

		const extUri = this.uriIdentityService.extUri;
		// Migrate Global Storage
		if (!this._storageService.getBoolean(storageMigratedKey, StorageScope.GLOBAL, false)) {
			const value = this._getValue<object>(true, from);
			if (value) {
				this.$setValue(true, to, value);
				this._remove(true, from);
			}

			const fromPath = extUri.joinPath(this.environmentService.globalStorageHome, from);
			const toPath = extUri.joinPath(this.environmentService.globalStorageHome, to.toLowerCase() /* Extension id is lower cased for global storage */);
			if (!extUri.isEqual(fromPath, toPath)) {
				try {
					await this._fileService.move(fromPath, toPath, true);
				} catch (error) {
					if ((<FileSystemProviderError>error).code !== FileSystemProviderErrorCode.FileNotFound) {
						this._logService.info(`Error while migrating global storage from '${from}' to '${to}'`, getErrorMessage(error));
					}
				}
			}

			this._storageService.store(storageMigratedKey, true, StorageScope.GLOBAL, StorageTarget.MACHINE);
		}

		// Migrate Workspace Storage
		if (!this._storageService.getBoolean(storageMigratedKey, StorageScope.WORKSPACE, false)) {
			const value = this._getValue<object>(false, from);
			if (value) {
				this.$setValue(false, to, value);
				this._remove(false, from);
			}

			const fromPath = extUri.joinPath(this.environmentService.workspaceStorageHome, this.workspaceContextService.getWorkspace().id, from);
			const toPath = extUri.joinPath(this.environmentService.workspaceStorageHome, this.workspaceContextService.getWorkspace().id, to);
			try {
				await this._fileService.move(fromPath, toPath, true);
			} catch (error) {
				if ((<FileSystemProviderError>error).code !== FileSystemProviderErrorCode.FileNotFound) {
					this._logService.info(`Error while migrating workspace storage from '${from}' to '${to}'`, getErrorMessage(error));
				}
			}

			this._storageService.store(storageMigratedKey, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}
}
