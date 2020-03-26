/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableCollection, IEnvironmentVariableMutator, EnvironmentVariableMutatorType, IMergedEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariable';
import { IProcessEnvironment } from 'vs/base/common/platform';

export class MergedEnvironmentVariableCollection implements IMergedEnvironmentVariableCollection {
	readonly entries: Map<string, IEnvironmentVariableMutator[]> = new Map();

	constructor(...extensionCollections: IEnvironmentVariableCollection[]) {
		extensionCollections.forEach(collection => {
			const it = collection.entries();
			let next = it.next();
			while (!next.done) {
				const variable = next.value[0];
				let entry = this.entries.get(variable);
				if (!entry) {
					entry = [];
					this.entries.set(variable, entry);
				}

				// If the first item in the entry is replace ignore any other entries as they would
				// just get replaced by this one.
				if (entry.length > 0 && entry[0].type === EnvironmentVariableMutatorType.Replace) {
					next = it.next();
					continue;
				}

				// Mutators get applied in the reverse order than they are created
				entry.unshift(next.value[1]);

				next = it.next();
			}
		});
	}

	// TODO: Consider doing a full diff, just marking the environment as stale with no action available?
	// getNewAdditions(other: IMergedEnvironmentVariableCollection): ReadonlyMap<string, IEnvironmentVariableMutator[]> | undefined {
	// 	const result = new Map<string, IEnvironmentVariableMutator[]>();
	// 	const it = other.entries.entries();
	// 	let next = it.next();
	// 	while (!next.done) {
	// 		// TODO: convert to support multiple w/ iterator
	// 		const variable = next.value[0];
	// 		const currentMutators = this.entries.get(variable);
	// 		const newMutators = next.value[1];
	// 		newMutators.forEach(newMutator => {

	// 		});
	// 	}



	// 	// other.entries.forEach((newMutator, variable) => {

	// 	// 	const currentMutator = this.entries.get(variable);
	// 	// 	if (currentMutator?.type !== newMutator.type || currentMutator.value !== newMutator.value) {
	// 	// 		result.set(variable, newMutator);
	// 	// 	}
	// 	// });
	// 	return result.size === 0 ? undefined : result;
	// }

	applyToProcessEnvironment(env: IProcessEnvironment): void {
		this.entries.forEach((mutators, variable) => {
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
}

// export class EnvironmentVariableCollection implements IEnvironmentVariableCollection {
// 	readonly entries: Map<string, IEnvironmentVariableMutator>;

// 	constructor(
// 		variables?: string[],
// 		values?: string[],
// 		types?: EnvironmentVariableMutatorType[]
// 	) {
// 		this.entries = new Map();
// 		if (variables && values && types) {
// 			if (variables.length !== values.length || variables.length !== types.length) {
// 				throw new Error('Cannot create environment collection from arrays of differing length');
// 			}
// 			for (let i = 0; i < variables.length; i++) {
// 				this.entries.set(variables[i], { value: values[i], type: types[i] });
// 			}
// 		}
// 	}

// 	// TODO: Consider doing a full diff, just marking the environment as stale with no action available?
// 	getNewAdditions(other: IEnvironmentVariableCollection): ReadonlyMap<string, IEnvironmentVariableMutator> | undefined {
// 		const result = new Map<string, IEnvironmentVariableMutator>();
// 		other.entries.forEach((newMutator, variable) => {
// 			const currentMutator = this.entries.get(variable);
// 			if (currentMutator?.type !== newMutator.type || currentMutator.value !== newMutator.value) {
// 				result.set(variable, newMutator);
// 			}
// 		});
// 		return result.size === 0 ? undefined : result;
// 	}

// 	applyToProcessEnvironment(env: IProcessEnvironment): void {
// 		this.entries.forEach((mutator, variable) => {
// 			switch (mutator.type) {
// 				case EnvironmentVariableMutatorType.Append:
// 					env[variable] = (env[variable] || '') + mutator.value;
// 					break;
// 				case EnvironmentVariableMutatorType.Prepend:
// 					env[variable] = mutator.value + (env[variable] || '');
// 					break;
// 				case EnvironmentVariableMutatorType.Replace:
// 					env[variable] = mutator.value;
// 					break;
// 			}
// 		});
// 	}
// }
