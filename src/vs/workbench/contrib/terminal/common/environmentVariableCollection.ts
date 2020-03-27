/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableCollection, EnvironmentVariableMutatorType, IMergedEnvironmentVariableCollection, IMergedEnvironmentVariableCollectionDiff, IExtensionOwnedEnvironmentVariableMutator } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { IProcessEnvironment } from 'vs/base/common/platform';

export class MergedEnvironmentVariableCollection implements IMergedEnvironmentVariableCollection {
	readonly map: Map<string, IExtensionOwnedEnvironmentVariableMutator[]> = new Map();

	constructor(collections: Map<string, IEnvironmentVariableCollection>) {
		collections.forEach((collection, extensionIdentifier) => {
			const it = collection.entries();
			let next = it.next();
			while (!next.done) {
				const variable = next.value[0];
				let entry = this.map.get(variable);
				if (!entry) {
					entry = [];
					this.map.set(variable, entry);
				}

				// If the first item in the entry is replace ignore any other entries as they would
				// just get replaced by this one.
				if (entry.length > 0 && entry[0].type === EnvironmentVariableMutatorType.Replace) {
					next = it.next();
					continue;
				}

				// Mutators get applied in the reverse order than they are created
				const mutator = next.value[1];
				entry.unshift({
					extensionIdentifier,
					value: mutator.value,
					type: mutator.type
				});

				next = it.next();
			}
		});
	}

	applyToProcessEnvironment(env: IProcessEnvironment): void {
		this.map.forEach((mutators, variable) => {
			mutators.forEach(mutator => {
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
		});
	}

	diff(other: IMergedEnvironmentVariableCollection): IMergedEnvironmentVariableCollectionDiff {
		const added: Map<string, IExtensionOwnedEnvironmentVariableMutator[]> = new Map();
		const changed: Map<string, IExtensionOwnedEnvironmentVariableMutator[]> = new Map();
		const removed: Map<string, IExtensionOwnedEnvironmentVariableMutator[]> = new Map();

		// Find added
		other.map.forEach((otherMutators, variable) => {
			const currentMutators = this.map.get(variable);

			// If it doesn't exist, all are added
			if (!currentMutators) {
				added.set(variable, otherMutators);
				return;
			}

			// Create a map to help
			const currentMutatorExtensions = new Map<string, boolean>();
			currentMutators.forEach(m => currentMutatorExtensions.set(m.extensionIdentifier, true));

			// Find entries added in other
			const addedArray: IExtensionOwnedEnvironmentVariableMutator[] = [];
			otherMutators.forEach(extensionMutator => {
				if (!currentMutatorExtensions.has(extensionMutator.extensionIdentifier)) {
					addedArray.push(extensionMutator);
				}
			});

			// Set if any were found
			if (addedArray.length > 0) {
				added.set(variable, addedArray);
			}
		});

		// TODO: Factor out this and added part into a shared function

		// Find removed
		this.map.forEach((currentMutators, variable) => {
			const otherMutators = other.map.get(variable);

			// If it doesn't exist, all are removed
			if (!otherMutators) {
				removed.set(variable, currentMutators);
				return;
			}

			// Create a map to help
			const otherMutatorExtensions = new Map<string, boolean>();
			otherMutators.forEach(m => otherMutatorExtensions.set(m.extensionIdentifier, true));

			// Find entries removed from other
			const removedArray: IExtensionOwnedEnvironmentVariableMutator[] = [];
			otherMutators.forEach(extensionMutator => {
				if (!otherMutatorExtensions.has(extensionMutator.extensionIdentifier)) {
					removedArray.push(extensionMutator);
				}
			});

			// Set if any were found
			if (removedArray.length > 0) {
				removed.set(variable, removedArray);
			}
		});

		return { added, changed, removed };
	}
}
