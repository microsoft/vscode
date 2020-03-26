/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableService, IEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { Event, Emitter } from 'vs/base/common/event';
import { debounce, throttle } from 'vs/base/common/decorators';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { EnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariableCollection';

const ENVIRONMENT_VARIABLE_COLLECTIONS_KEY = 'terminal.integrated.environmentVariableCollections';

interface ISerializableEnvironmentVariableCollection {
	variables: string[];
	values: string[];
	types: number[];
}

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
	private _mergedCollection: IEnvironmentVariableCollection;

	private readonly _onDidChangeCollections = new Emitter<IEnvironmentVariableCollection>();
	get onDidChangeCollections(): Event<IEnvironmentVariableCollection> { return this._onDidChangeCollections.event; }

	constructor(
		@IExtensionService private _extensionService: IExtensionService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		const serializedPersistedCollections = this._storageService.get(ENVIRONMENT_VARIABLE_COLLECTIONS_KEY, StorageScope.WORKSPACE);
		if (serializedPersistedCollections) {
			const collectionsJson: ISerializableExtensionEnvironmentVariableCollection[] = JSON.parse(serializedPersistedCollections);
			collectionsJson.forEach(c => {
				const extCollection = new EnvironmentVariableCollection(c.collection.variables, c.collection.values, c.collection.types);
				this._collections.set(c.extensionIdentifier, extCollection);
			});
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

	get mergedCollection(): IEnvironmentVariableCollection {
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

	private _resolveMergedCollection(): IEnvironmentVariableCollection {
		// TODO: Currently this will replace any entry but it's more complex; we need to apply multiple PATH transformations for example
		const result = new EnvironmentVariableCollection();
		this._collections.forEach(collection => {
			collection.entries.forEach((mutator, variable) => {
				if (!result.entries.has(variable)) {
					result.entries.set(variable, mutator);
				}
			});
		});
		return result;
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

function serializeEnvironmentVariableCollection(collection: IEnvironmentVariableCollection): ISerializableEnvironmentVariableCollection {
	const entries = [...collection.entries.entries()];
	const result: ISerializableEnvironmentVariableCollection = {
		variables: entries.map(e => e[0]),
		values: entries.map(e => e[1].value),
		types: entries.map(e => e[1].type),
	};
	return result;
}
