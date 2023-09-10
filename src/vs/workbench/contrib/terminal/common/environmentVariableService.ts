/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { debounce, throttle } from 'vs/base/common/decorators';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { MergedEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariableCollection';
import { deserializeEnvironmentDescriptionMap, deserializeEnvironmentVariableCollection, serializeEnvironmentDescriptionMap, serializeEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariableShared';
import { IEnvironmentVariableCollectionWithPersistence, IEnvironmentVariableService } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { TerminalStorageKeys } from 'vs/workbench/contrib/terminal/common/terminalStorageKeys';
import { IMergedEnvironmentVariableCollection, ISerializableEnvironmentDescriptionMap, ISerializableEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariable';
import { Disposable } from 'vs/base/common/lifecycle';

interface ISerializableExtensionEnvironmentVariableCollection {
	extensionIdentifier: string;
	collection: ISerializableEnvironmentVariableCollection;
	description?: ISerializableEnvironmentDescriptionMap;
}

/**
 * Tracks and persists environment variable collections as defined by extensions.
 */
export class EnvironmentVariableService extends Disposable implements IEnvironmentVariableService {
	declare readonly _serviceBrand: undefined;

	collections: Map<string, IEnvironmentVariableCollectionWithPersistence> = new Map();
	mergedCollection: IMergedEnvironmentVariableCollection;

	private readonly _onDidChangeCollections = this._register(new Emitter<IMergedEnvironmentVariableCollection>());
	get onDidChangeCollections(): Event<IMergedEnvironmentVariableCollection> { return this._onDidChangeCollections.event; }

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		super();

		this._storageService.remove(TerminalStorageKeys.DeprecatedEnvironmentVariableCollections, StorageScope.WORKSPACE);
		const serializedPersistedCollections = this._storageService.get(TerminalStorageKeys.EnvironmentVariableCollections, StorageScope.WORKSPACE);
		if (serializedPersistedCollections) {
			const collectionsJson: ISerializableExtensionEnvironmentVariableCollection[] = JSON.parse(serializedPersistedCollections);
			collectionsJson.forEach(c => this.collections.set(c.extensionIdentifier, {
				persistent: true,
				map: deserializeEnvironmentVariableCollection(c.collection),
				descriptionMap: deserializeEnvironmentDescriptionMap(c.description)
			}));

			// Asynchronously invalidate collections where extensions have been uninstalled, this is
			// async to avoid making all functions on the service synchronous and because extensions
			// being uninstalled is rare.
			this._invalidateExtensionCollections();
		}
		this.mergedCollection = this._resolveMergedCollection();

		// Listen for uninstalled/disabled extensions
		this._extensionService.onDidChangeExtensions(() => this._invalidateExtensionCollections());
	}

	set(extensionIdentifier: string, collection: IEnvironmentVariableCollectionWithPersistence): void {
		this.collections.set(extensionIdentifier, collection);
		this._updateCollections();
	}

	delete(extensionIdentifier: string): void {
		this.collections.delete(extensionIdentifier);
		this._updateCollections();
	}

	private _updateCollections(): void {
		this._persistCollectionsEventually();
		this.mergedCollection = this._resolveMergedCollection();
		this._notifyCollectionUpdatesEventually();
	}

	@throttle(1000)
	private _persistCollectionsEventually(): void {
		this._persistCollections();
	}

	protected _persistCollections(): void {
		const collectionsJson: ISerializableExtensionEnvironmentVariableCollection[] = [];
		this.collections.forEach((collection, extensionIdentifier) => {
			if (collection.persistent) {
				collectionsJson.push({
					extensionIdentifier,
					collection: serializeEnvironmentVariableCollection(this.collections.get(extensionIdentifier)!.map),
					description: serializeEnvironmentDescriptionMap(collection.descriptionMap)
				});
			}
		});
		const stringifiedJson = JSON.stringify(collectionsJson);
		this._storageService.store(TerminalStorageKeys.EnvironmentVariableCollections, stringifiedJson, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	@debounce(1000)
	private _notifyCollectionUpdatesEventually(): void {
		this._notifyCollectionUpdates();
	}

	protected _notifyCollectionUpdates(): void {
		this._onDidChangeCollections.fire(this.mergedCollection);
	}

	private _resolveMergedCollection(): IMergedEnvironmentVariableCollection {
		return new MergedEnvironmentVariableCollection(this.collections);
	}

	private async _invalidateExtensionCollections(): Promise<void> {
		await this._extensionService.whenInstalledExtensionsRegistered();
		const registeredExtensions = this._extensionService.extensions;
		let changes = false;
		this.collections.forEach((_, extensionIdentifier) => {
			const isExtensionRegistered = registeredExtensions.some(r => r.identifier.value === extensionIdentifier);
			if (!isExtensionRegistered) {
				this.collections.delete(extensionIdentifier);
				changes = true;
			}
		});
		if (changes) {
			this._updateCollections();
		}
	}
}
