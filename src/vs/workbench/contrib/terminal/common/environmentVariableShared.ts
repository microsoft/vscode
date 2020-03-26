/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentVariableCollection, IEnvironmentVariableMutator, ISerializableEnvironmentVariableCollection } from 'vs/workbench/contrib/terminal/common/environmentVariable';

// This file is shared between the renderer and extension host

export function serializeEnvironmentVariableCollection(collection: IEnvironmentVariableCollection): ISerializableEnvironmentVariableCollection {
	return [...collection.entries()];
}

export function deserializeEnvironmentVariableCollection(
	serializedCollection: ISerializableEnvironmentVariableCollection
): IEnvironmentVariableCollection {
	return new Map<string, IEnvironmentVariableMutator>(serializedCollection);
}
