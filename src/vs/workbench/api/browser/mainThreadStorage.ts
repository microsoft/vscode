/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope } from '../../../platform/storage/common/storage.js';
import { MainThreadStorageShape, MainContext, ExtHostStorageShape, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { isWeb } from '../../../base/common/platform.js';
import { IExtensionIdWithVersion, IExtensionStorageService } from '../../../platform/extensionManagement/common/extensionStorage.js';
import { migrateExtensionStorage } from '../../services/extensions/common/extensionStorageMigration.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';

@extHostNamedCustomer(MainContext.MainThreadStorage)
export class MainThreadStorage implements MainThreadStorageShape {

	private readonly _proxy: ExtHostStorageShape;
	private readonly _storageListener = new DisposableStore();
	private readonly _sharedStorageKeysToWatch: Map<string, boolean> = new Map<string, boolean>();

	constructor(
		extHostContext: IExtHostContext,
		@IExtensionStorageService private readonly _extensionStorageService: IExtensionStorageService,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostStorage);

		this._storageListener.add(this._storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._storageListener)(e => {
			if (this._sharedStorageKeysToWatch.has(e.key)) {
				const rawState = this._extensionStorageService.getExtensionStateRaw(e.key, true);
				if (typeof rawState === 'string') {
					this._proxy.$acceptValue(true, e.key, rawState);
				}
			}
		}));
	}

	dispose(): void {
		this._storageListener.dispose();
	}

	async $initializeExtensionStorage(shared: boolean, extensionId: string): Promise<string | undefined> {

		await this.checkAndMigrateExtensionStorage(extensionId, shared);

		if (shared) {
			this._sharedStorageKeysToWatch.set(extensionId, true);
		}
		return this._extensionStorageService.getExtensionStateRaw(extensionId, shared);
	}

	async $setValue(shared: boolean, key: string, value: object): Promise<void> {
		this._extensionStorageService.setExtensionState(key, value, shared);
	}

	$registerExtensionStorageKeysToSync(extension: IExtensionIdWithVersion, keys: string[]): void {
		this._extensionStorageService.setKeysForSync(extension, keys);
	}

	private async checkAndMigrateExtensionStorage(extensionId: string, shared: boolean): Promise<void> {
		try {
			let sourceExtensionId = this._extensionStorageService.getSourceExtensionToMigrate(extensionId);

			// TODO: @sandy081 - Remove it after 6 months
			// If current extension does not have any migration requested
			// Then check if the extension has to be migrated for using lower case in web
			// If so, migrate the extension state from lower case id to its normal id.
			if (!sourceExtensionId && isWeb && extensionId !== extensionId.toLowerCase()) {
				sourceExtensionId = extensionId.toLowerCase();
			}

			if (sourceExtensionId) {
				// TODO: @sandy081 - Remove it after 6 months
				// In Web, extension state was used to be stored in lower case extension id.
				// Hence check that if the lower cased source extension was not yet migrated in web
				// If not take the lower cased source extension id for migration
				if (isWeb && sourceExtensionId !== sourceExtensionId.toLowerCase() && this._extensionStorageService.getExtensionState(sourceExtensionId.toLowerCase(), shared) && !this._extensionStorageService.getExtensionState(sourceExtensionId, shared)) {
					sourceExtensionId = sourceExtensionId.toLowerCase();
				}
				await migrateExtensionStorage(sourceExtensionId, extensionId, shared, this._instantiationService);
			}
		} catch (error) {
			this._logService.error(error);
		}
	}
}
