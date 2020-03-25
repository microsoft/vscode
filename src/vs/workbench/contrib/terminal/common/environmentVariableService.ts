/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableService, IEnvironmentVariableCollection, IEnvironmentVariableMutator, EnvironmentVariableMutatorType } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { Event, Emitter } from 'vs/base/common/event';

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

	// TODO: Implement diff method?
	equals(other: IEnvironmentVariableCollection): boolean {
		if (this.entries.size !== other.entries.size) {
			return false;
		}
		let result = true;
		this.entries.forEach((mutator, variable) => {
			const otherMutator = other.entries.get(variable);
			if (otherMutator !== mutator) {
				result = false;
			}
		});
		return result;
	}
}

/**
 * Tracks and persists environment variable collections as defined by extensions.
 */
export class EnvironmentVariableService implements IEnvironmentVariableService {
	_serviceBrand: undefined;

	/**
	 * The merged collection, this is set to undefined when it needs to be resolved again and is
	 * evaluated lazily as needed.
	 */
	private _mergedCollection: IEnvironmentVariableCollection = new EnvironmentVariableCollection();

	private _collections: Map<string, IEnvironmentVariableCollection> = new Map();

	// TODO: Debounce notifying of terminals about onDidChangeCollections
	// TODO: Generate a summary of changes inside the terminal component as it needs to be done per-terminal compared to what it started with
	protected readonly _onDidChangeCollections = new Emitter<void>();
	public get onDidChangeCollections(): Event<void> { return this._onDidChangeCollections.event; }

	// TODO: Load in persisted collections
	// TODO: Fire an event when collections have changed that the terminal component can listen to

	get mergedCollection(): IEnvironmentVariableCollection {
		if (!this._mergedCollection) {
			this._mergedCollection = this._resolveMergedCollection();
		}
		return this._mergedCollection;
	}

	set(extensionIdentifier: string, collection: IEnvironmentVariableCollection): void {
		this._collections.set(extensionIdentifier, collection);
	}

	delete(extensionIdentifier: string): void {
		this._collections.delete(extensionIdentifier);
	}

	private _resolveMergedCollection(): IEnvironmentVariableCollection {
		const collection = new EnvironmentVariableCollection();
		return collection;
	}
}
