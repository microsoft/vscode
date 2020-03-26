/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableService, IEnvironmentVariableCollection, IEnvironmentVariableMutator, EnvironmentVariableMutatorType } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { Event, Emitter } from 'vs/base/common/event';
import { debounce } from 'vs/base/common/decorators';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

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

export class EnvironmentVariableCollection implements IEnvironmentVariableCollection {
	readonly entries: Map<string, IEnvironmentVariableMutator>;

	constructor(
		variables?: string[],
		values?: string[],
		types?: EnvironmentVariableMutatorType[]
	) {
		this.entries = new Map();
		if (variables && values && types) {
			if (variables.length !== values.length || variables.length !== types.length) {
				throw new Error('Cannot create environment collection from arrays of differing length');
			}
			for (let i = 0; i < variables.length; i++) {
				this.entries.set(variables[i], { value: values[i], type: types[i] });
			}
		}
	}

	// TODO: Consider doing a full diff, just marking the environment as stale with no action available?
	getNewAdditions(other: IEnvironmentVariableCollection): ReadonlyMap<string, IEnvironmentVariableMutator> | undefined {
		const result = new Map<string, IEnvironmentVariableMutator>();
		other.entries.forEach((newMutator, variable) => {
			const currentMutator = this.entries.get(variable);
			if (currentMutator?.type !== newMutator.type || currentMutator.value !== newMutator.value) {
				result.set(variable, newMutator);
			}
		});
		return result.size === 0 ? undefined : result;
	}

	applyToProcessEnvironment(env: IProcessEnvironment): void {
		this.entries.forEach((mutator, variable) => {
			switch (mutator.type) {
				case EnvironmentVariableMutatorType.Append:
					env[variable] = (env[variable] || '') + mutator.value;
					break;
				case EnvironmentVariableMutatorType.Prepend:
					env[variable] = mutator.value + (env[variable] || '');
					break;
				case EnvironmentVariableMutatorType.Replace:
					env[variable] = mutator.value;
					break;
			}
		});
	}
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
			// TODO: Load in persisted collections
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
		this._persistCollections();
		this._mergedCollection = this._resolveMergedCollection();
		this._notifyCollectionUpdates();
	}

	@debounce(1000)
	private _persistCollections(): void {
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
	private _notifyCollectionUpdates(): void {
		this._onDidChangeCollections.fire(this._mergedCollection);
	}

	private _resolveMergedCollection(): IEnvironmentVariableCollection {
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
