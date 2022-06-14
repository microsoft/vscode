/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableCollection, IEnvironmentVariableMutator, ISerializableEnvironmentVariableCollection, ISerializableEnvironmentVariableCollections } from 'vs/workbench/contrib/terminal/common/environmentVariable';

// This file is shared between the renderer and extension host

export function serializeEnvironmentVariableCollection(collection: ReadonlyMap<string, IEnvironmentVariableMutator>): ISerializableEnvironmentVariableCollection {
	return [...collection.entries()];
}

export function deserializeEnvironmentVariableCollection(
	serializedCollection: ISerializableEnvironmentVariableCollection
): Map<string, IEnvironmentVariableMutator> {
	return new Map<string, IEnvironmentVariableMutator>(serializedCollection);
}

export function serializeEnvironmentVariableCollections(collections: ReadonlyMap<string, IEnvironmentVariableCollection>): ISerializableEnvironmentVariableCollections {
	return Array.from(collections.entries()).map(e => {
		return [e[0], serializeEnvironmentVariableCollection(e[1].map)];
	});
}

export function deserializeEnvironmentVariableCollections(
	serializedCollection: ISerializableEnvironmentVariableCollections
): Map<string, IEnvironmentVariableCollection> {
	return new Map<string, IEnvironmentVariableCollection>(serializedCollection.map(e => {
		return [e[0], { map: deserializeEnvironmentVariableCollection(e[1]) }];
	}));
}

// export function serializeMergedEnvironmentVariableCollection(collection: ReadonlyMap<string, IExtensionOwnedEnvironmentVariableMutator[]> | undefined): ISerializableMergedEnvironmentVariableCollection | undefined {
// 	if (!collection) {
// 		return undefined;
// 	}
// 	return [...collection.entries()];
// }

// export function deserializeMergedEnvironmentVariableCollection(
// 	serializedCollection: ISerializableMergedEnvironmentVariableCollection | undefined
// ): Map<string, IExtensionOwnedEnvironmentVariableMutator[]> | undefined {
// 	if (!serializedCollection) {
// 		return undefined;
// 	}
// 	// const entries: [string, IEnvironmentVariableCollection][] = [];
// 	// const envVariableCollections = new Map<string, IEnvironmentVariableCollection>(entries);
// 	// for (const [k, v] of envVariableCollections) {
// 	// 	entries.push([k, { map: deserializeEnvironmentVariableCollection(v) }]);
// 	// }
// 	// const mergedCollection = new MergedEnvironmentVariableCollection(envVariableCollections);
// 	return new Map<string, IExtensionOwnedEnvironmentVariableMutator[]>(serializedCollection);
// }

// export function removeExtOwned() {

// }
