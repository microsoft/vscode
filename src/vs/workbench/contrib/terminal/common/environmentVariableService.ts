/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableService, IEnvironmentVariableCollection, IEnvironmentVariableMutator } from 'vs/workbench/contrib/terminal/common/environmentVariable';

export class EnvironmentVariableCollection implements IEnvironmentVariableCollection {
	readonly entries: Map<string, IEnvironmentVariableMutator>;

	constructor(
		// TODO: Init entries via ctor if specified
	) {
		this.entries = new Map();
	}
}

/**
 * Tracks and persists environment variable collections as defined by extensions.
 */
export class EnvironmentVariableService implements IEnvironmentVariableService {
	/**
	 * The merged collection, this is set to undefined when it needs to be resolved again and is
	 * evaluated lazily as needed.
	 */
	private _mergedCollection: IEnvironmentVariableCollection | undefined;

	private _collections: Map<string, IEnvironmentVariableCollection> = new Map();

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
		this._mergedCollection = undefined;
	}

	delete(extensionIdentifier: string): void {
		this._collections.delete(extensionIdentifier);
		this._mergedCollection = undefined;
	}

	private _resolveMergedCollection(): IEnvironmentVariableCollection {
		const collection = new EnvironmentVariableCollection();
		return collection;
	}
}
