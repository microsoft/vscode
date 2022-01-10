/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { MainThreadStorageShape, MainContext, IExtHostContext, ExtHostStorageShape, ExtHostContext } from '../common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isWeb } from 'vs/base/common/platform';
import { IExtensionIdWithVersion, IExtensionStorageService } from 'vs/platform/extensionManagement/common/extensionStorage';
import { migrateExtensionStorage } from 'vs/workbench/services/extensions/common/extensionStorageMigration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

@extHostNamedCustomer(MainContext.MainThreadStorage)
export class MainThreadStorage implements MainThreadStorageShape {

	private readonly _proxy: ExtHostStorageShape;
	private readonly _storageListener: IDisposable;
	private readonly _sharedStorageKeysToWatch: Map<string, boolean> = new Map<string, boolean>();

	constructor(
		extHostContext: IExtHostContext,
		@IExtensionStorageService private readonly _extensionStorageService: IExtensionStorageService,
		@IStorageService private readonly _storageService: IStorageService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostStorage);

		this._storageListener = this._storageService.onDidChangeValue(e => {
			const shared = e.scope === StorageScope.GLOBAL;
			if (shared && this._sharedStorageKeysToWatch.has(e.key)) {
				this._proxy.$acceptValue(shared, e.key, this._extensionStorageService.getExtensionState(e.key, shared));
			}
		});
	}

	dispose(): void {
		this._storageListener.dispose();
	}

	async $initializeExtensionStorage(shared: boolean, extensionId: string): Promise<object | undefined> {
		if (isWeb && extensionId !== extensionId.toLowerCase()) {
			// TODO: @sandy081 - Remove it after 6 months
			await migrateExtensionStorage(extensionId.toLowerCase(), extensionId, `extension.storage.migrateFromLowerCaseKey.${extensionId.toLowerCase()}`, this._instantiationService);
		}
		if (shared) {
			this._sharedStorageKeysToWatch.set(extensionId, true);
		}
		return this._extensionStorageService.getExtensionState(extensionId, shared);
	}

	async $setValue(shared: boolean, key: string, value: object): Promise<void> {
		this._extensionStorageService.setExtensionState(key, value, shared);
	}

	$registerExtensionStorageKeysToSync(extension: IExtensionIdWithVersion, keys: string[]): void {
		this._extensionStorageService.setKeysForSync(extension, keys);
	}
}
