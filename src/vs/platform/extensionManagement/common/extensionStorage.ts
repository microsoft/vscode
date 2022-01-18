/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IStorageService, IStorageValueChangeEvent, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { adoptToGalleryExtensionId, getExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IProductService } from 'vs/platform/product/common/productService';
import { distinct } from 'vs/base/common/arrays';
import { ILogService } from 'vs/platform/log/common/log';
import { IExtension } from 'vs/platform/extensions/common/extensions';
import { isArray, isString } from 'vs/base/common/types';
import { IStringDictionary } from 'vs/base/common/collections';
import { IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

export interface IExtensionIdWithVersion {
	id: string;
	version: string;
}

export const IExtensionStorageService = createDecorator<IExtensionStorageService>('IExtensionStorageService');

export interface IExtensionStorageService {
	readonly _serviceBrand: undefined;

	getExtensionState(extension: IExtension | IGalleryExtension | string, global: boolean): IStringDictionary<any> | undefined;
	setExtensionState(extension: IExtension | IGalleryExtension | string, state: IStringDictionary<any> | undefined, global: boolean): void;

	readonly onDidChangeExtensionStorageToSync: Event<void>;
	setKeysForSync(extensionIdWithVersion: IExtensionIdWithVersion, keys: string[]): void;
	getKeysForSync(extensionIdWithVersion: IExtensionIdWithVersion): string[] | undefined;

	addToMigrationList(from: string, to: string): void;
	getSourceExtensionToMigrate(target: string): string | undefined;
}

const EXTENSION_KEYS_ID_VERSION_REGEX = /^extensionKeys\/([^.]+\..+)@(\d+\.\d+\.\d+(-.*)?)$/;

export class ExtensionStorageService extends Disposable implements IExtensionStorageService {

	readonly _serviceBrand: undefined;

	private static toKey(extension: IExtensionIdWithVersion): string {
		return `extensionKeys/${adoptToGalleryExtensionId(extension.id)}@${extension.version}`;
	}

	private static fromKey(key: string): IExtensionIdWithVersion | undefined {
		const matches = EXTENSION_KEYS_ID_VERSION_REGEX.exec(key);
		if (matches && matches[1]) {
			return { id: matches[1], version: matches[2] };
		}
		return undefined;
	}

	private readonly _onDidChangeExtensionStorageToSync = this._register(new Emitter<void>());
	readonly onDidChangeExtensionStorageToSync = this._onDidChangeExtensionStorageToSync.event;

	private readonly extensionsWithKeysForSync = new Set<string>();

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.initialize();
		this._register(this.storageService.onDidChangeValue(e => this.onDidChangeStorageValue(e)));
	}

	private initialize(): void {
		const keys = this.storageService.keys(StorageScope.GLOBAL, StorageTarget.MACHINE);
		for (const key of keys) {
			const extensionIdWithVersion = ExtensionStorageService.fromKey(key);
			if (extensionIdWithVersion) {
				this.extensionsWithKeysForSync.add(extensionIdWithVersion.id.toLowerCase());
			}
		}
	}

	private onDidChangeStorageValue(e: IStorageValueChangeEvent): void {
		if (e.scope !== StorageScope.GLOBAL) {
			return;
		}

		// State of extension with keys for sync has changed
		if (this.extensionsWithKeysForSync.has(e.key.toLowerCase())) {
			this._onDidChangeExtensionStorageToSync.fire();
			return;
		}

		// Keys for sync of an extension has changed
		const extensionIdWithVersion = ExtensionStorageService.fromKey(e.key);
		if (extensionIdWithVersion) {
			this.extensionsWithKeysForSync.add(extensionIdWithVersion.id.toLowerCase());
			this._onDidChangeExtensionStorageToSync.fire();
			return;
		}
	}

	private getExtensionId(extension: IExtension | IGalleryExtension | string): string {
		if (isString(extension)) {
			return extension;
		}
		const publisher = (extension as IExtension).manifest ? (extension as IExtension).manifest.publisher : (extension as IGalleryExtension).publisher;
		const name = (extension as IExtension).manifest ? (extension as IExtension).manifest.name : (extension as IGalleryExtension).name;
		return getExtensionId(publisher, name);
	}

	getExtensionState(extension: IExtension | IGalleryExtension | string, global: boolean): IStringDictionary<any> | undefined {
		const extensionId = this.getExtensionId(extension);
		const jsonValue = this.storageService.get(extensionId, global ? StorageScope.GLOBAL : StorageScope.WORKSPACE);
		if (jsonValue) {
			try {
				return JSON.parse(jsonValue);
			} catch (error) {
				// Do not fail this call but log it for diagnostics
				// https://github.com/microsoft/vscode/issues/132777
				this.logService.error(`[mainThreadStorage] unexpected error parsing storage contents (extensionId: ${extensionId}, global: ${global}): ${error}`);
			}
		}

		return undefined;
	}

	setExtensionState(extension: IExtension | IGalleryExtension | string, state: IStringDictionary<any> | undefined, global: boolean): void {
		const extensionId = this.getExtensionId(extension);
		if (state === undefined) {
			this.storageService.remove(extensionId, global ? StorageScope.GLOBAL : StorageScope.WORKSPACE);
		} else {
			this.storageService.store(extensionId, JSON.stringify(state), global ? StorageScope.GLOBAL : StorageScope.WORKSPACE, StorageTarget.MACHINE /* Extension state is synced separately through extensions */);
		}
	}

	setKeysForSync(extensionIdWithVersion: IExtensionIdWithVersion, keys: string[]): void {
		this.storageService.store(ExtensionStorageService.toKey(extensionIdWithVersion), JSON.stringify(keys), StorageScope.GLOBAL, StorageTarget.MACHINE);
	}

	getKeysForSync(extensionIdWithVersion: IExtensionIdWithVersion): string[] | undefined {
		const extensionKeysForSyncFromProduct = this.productService.extensionSyncedKeys?.[extensionIdWithVersion.id.toLowerCase()];
		const extensionKeysForSyncFromStorageValue = this.storageService.get(ExtensionStorageService.toKey(extensionIdWithVersion), StorageScope.GLOBAL);
		const extensionKeysForSyncFromStorage = extensionKeysForSyncFromStorageValue ? JSON.parse(extensionKeysForSyncFromStorageValue) : undefined;

		return extensionKeysForSyncFromStorage && extensionKeysForSyncFromProduct
			? distinct([...extensionKeysForSyncFromStorage, ...extensionKeysForSyncFromProduct])
			: (extensionKeysForSyncFromStorage || extensionKeysForSyncFromProduct);
	}

	addToMigrationList(from: string, to: string): void {
		if (from !== to) {
			// remove the duplicates
			const migrationList: [string, string][] = this.migrationList.filter(entry => !entry.includes(from) && !entry.includes(to));
			migrationList.push([from, to]);
			this.migrationList = migrationList;
		}
	}

	getSourceExtensionToMigrate(toExtensionId: string): string | undefined {
		const entry = this.migrationList.find(([, to]) => toExtensionId === to);
		return entry ? entry[0] : undefined;
	}

	private get migrationList(): [string, string][] {
		const value = this.storageService.get('extensionStorage.migrationList', StorageScope.GLOBAL, '[]');
		try {
			const migrationList = JSON.parse(value);
			if (isArray(migrationList)) {
				return migrationList;
			}
		} catch (error) { /* ignore */ }
		return [];
	}

	private set migrationList(migrationList: [string, string][]) {
		if (migrationList.length) {
			this.storageService.store('extensionStorage.migrationList', JSON.stringify(migrationList), StorageScope.GLOBAL, StorageTarget.MACHINE);
		} else {
			this.storageService.remove('extensionStorage.migrationList', StorageScope.GLOBAL);
		}
	}
}
