/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProcessEnvironment } from 'vs/base/common/platform';
import { IWorkspaceFolderData } from 'vs/platform/workspace/common/workspace';

export enum EnvironmentVariableMutatorType {
	Replace = 1,
	Append = 2,
	Prepend = 3
}
// export enum EnvironmentVariableMutatorTiming {
// 	AtSpawn = 1,
// 	AfterShellIntegration = 2
// 	// TODO: Do we need a both?
// }
export interface IEnvironmentVariableMutator {
	readonly variable: string;
	readonly value: string;
	readonly type: EnvironmentVariableMutatorType;
	readonly scope?: EnvironmentVariableScope;
	// readonly timing?: EnvironmentVariableMutatorTiming;
}

export type EnvironmentVariableScope = {
	workspaceFolder?: IWorkspaceFolderData;
};

export interface IEnvironmentVariableCollection {
	readonly map: ReadonlyMap<string, IEnvironmentVariableMutator>;
}

/** [variable, mutator] */
export type ISerializableEnvironmentVariableCollection = [string, IEnvironmentVariableMutator][];

/** [extension, collection] */
export type ISerializableEnvironmentVariableCollections = [string, ISerializableEnvironmentVariableCollection][];

export interface IExtensionOwnedEnvironmentVariableMutator extends IEnvironmentVariableMutator {
	readonly extensionIdentifier: string;
}

export interface IMergedEnvironmentVariableCollectionDiff {
	added: ReadonlyMap<string, IExtensionOwnedEnvironmentVariableMutator[]>;
	changed: ReadonlyMap<string, IExtensionOwnedEnvironmentVariableMutator[]>;
	removed: ReadonlyMap<string, IExtensionOwnedEnvironmentVariableMutator[]>;
}

type VariableResolver = (str: string) => Promise<string>;

/**
 * Represents an environment variable collection that results from merging several collections
 * together.
 */
export interface IMergedEnvironmentVariableCollection {
	readonly collections: ReadonlyMap<string, IEnvironmentVariableCollection>;
	/**
	 * Gets the variable map for a given scope.
	 * @param scope The scope to get the variable map for. If undefined, the global scope is used.
	 */
	getVariableMap(scope: EnvironmentVariableScope | undefined): Map<string, IExtensionOwnedEnvironmentVariableMutator[]>;
	/**
	 * Applies this collection to a process environment.
	 * @param variableResolver An optional function to use to resolve variables within the
	 * environment values.
	 */
	applyToProcessEnvironment(env: IProcessEnvironment, scope: EnvironmentVariableScope | undefined, variableResolver?: VariableResolver): Promise<void>;

	/**
	 * Generates a diff of this collection against another. Returns undefined if the collections are
	 * the same.
	 */
	diff(other: IMergedEnvironmentVariableCollection, scope: EnvironmentVariableScope | undefined): IMergedEnvironmentVariableCollectionDiff | undefined;
}
