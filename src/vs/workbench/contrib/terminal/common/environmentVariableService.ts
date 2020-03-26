/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableService, IEnvironmentVariableCollection, IMergedEnvironmentVariableCollection, ISerializableEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { Event, Emitter } from 'vs/base/common/event';
import { debounce, throttle } from 'vs/base/common/decorators';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { MergedEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableCollection';
import { deserializeEnvironmentVariableCollection, serializeEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableShared';

const ENVIRONMENT_VARIABLE_COLLECTIONS_KEY = 'terminal.integrated.environmentVariableCollections';

interface ISerializableExtensionEnvironmentVariableCollection {
	extensionIdentifier: string,
	collection: ISerializableEnvironmentVariableCollection
}

/**
 * Tracks and persists environment variable collections as defined by extensions.
 */
export class EnvironmentVariableService implements IEnvironmentVariableService {
	_serviceBrand: undefined;

	private _collections: Map<string, IEnvironmentVariableCollection> = new Map();
	private _mergedCollection: IMergedEnvironmentVariableCollection;

	private readonly _onDidChangeCollections = new Emitter<IMergedEnvironmentVariableCollection>();
	get onDidChangeCollections(): Event<IMergedEnvironmentVariableCollection> { return this._onDidChangeCollections.event; }

	constructor(
		@IExtensionService private _extensionService: IExtensionService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		const serializedPersistedCollections = this._storageService.get(ENVIRONMENT_VARIABLE_COLLECTIONS_KEY, StorageScope.WORKSPACE);
		if (serializedPersistedCollections) {
			const collectionsJson: ISerializableExtensionEnvironmentVariableCollection[] = JSON.parse(serializedPersistedCollections);
			collectionsJson.forEach(c => this._collections.set(c.extensionIdentifier, deserializeEnvironmentVariableCollection(c.collection)));
			console.log('serialized from previous session', this._collections);

			// Asynchronously invalidate collections where extensions have been uninstalled, this is
			// async to avoid making all functions on the service synchronous and because extensions
			// being uninstalled is rare.
			this._invalidateExtensionCollections();
		}
		this._mergedCollection = this._resolveMergedCollection();

		// Listen for uninstalled/disabled extensions
		this._extensionService.onDidChangeExtensions(() => this._invalidateExtensionCollections());
	}

	get mergedCollection(): IMergedEnvironmentVariableCollection {
		return this._mergedCollection;
	}

	set(extensionIdentifier: string, collection: IEnvironmentVariableCollection): void {
		this._collections.set(extensionIdentifier, collection);
		this._updateCollections();
	}

	delete(extensionIdentifier: string): void {
		this._collections.delete(extensionIdentifier);
		this._updateCollections();
	}

	private _updateCollections(): void {
		this._persistCollectionsEventually();
		this._mergedCollection = this._resolveMergedCollection();
		this._notifyCollectionUpdatesEventually();
	}

	@throttle(1000)
	private _persistCollectionsEventually(): void {
		this._persistCollections();
	}

	protected _persistCollections(): void {
		const keys = [...this._collections.keys()];
		const collectionsJson: ISerializableExtensionEnvironmentVariableCollection[] = keys.map(extensionIdentifier => {
			return {
				extensionIdentifier,
				collection: serializeEnvironmentVariableCollection(this._collections.get(extensionIdentifier)!)
			};
		});
		const stringifiedJson = JSON.stringify(collectionsJson);
		console.log('storing', stringifiedJson, collectionsJson);
		this._storageService.store(ENVIRONMENT_VARIABLE_COLLECTIONS_KEY, stringifiedJson, StorageScope.WORKSPACE);
	}

	@debounce(1000)
	private _notifyCollectionUpdatesEventually(): void {
		this._notifyCollectionUpdates();
	}

	protected _notifyCollectionUpdates(): void {
		this._onDidChangeCollections.fire(this._mergedCollection);
	}

	private _resolveMergedCollection(): IMergedEnvironmentVariableCollection {
		return new MergedEnvironmentVariableCollection(...[...this._collections.values()]);
		// const result = new EnvironmentVariableCollection();
		// this._collections.forEach(collection => {
		// 	const it = collection.entries();
		// 	let next = it.next();
		// 	while (!next.done) {
		// 		const variable = next.value[0];
		// 		if (!result.entries.has(variable)) {
		// 			result.entries.set(variable, next.value[1]);
		// 		}
		// 		next = it.next();
		// 	}
		// });
		// return result;
	}

	private async _invalidateExtensionCollections(): Promise<void> {
		console.log('checking extensions');
		await this._extensionService.whenInstalledExtensionsRegistered();

		const registeredExtensions = await this._extensionService.getExtensions();
		let changes = false;
		this._collections.forEach((_, extensionIdentifier) => {
			const isExtensionRegistered = registeredExtensions.some(r => r.identifier.value === extensionIdentifier);
			if (!isExtensionRegistered) {
				console.log('invalidated ' + extensionIdentifier);
				this._collections.delete(extensionIdentifier);
				changes = true;
			}
		});
		if (changes) {
			this._updateCollections();
		}
	}
}
