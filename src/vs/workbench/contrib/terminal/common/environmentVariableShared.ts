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
