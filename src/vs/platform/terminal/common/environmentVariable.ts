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
export interface IEnvironmentVariableMutator {
	readonly variable: string;
	readonly value: string;
	readonly type: EnvironmentVariableMutatorType;
	readonly scope?: EnvironmentVariableScope;
	readonly options?: IEnvironmentVariableMutatorOptions;
}

export interface IEnvironmentVariableCollectionDescription {
	readonly description: string | undefined;
	readonly scope?: EnvironmentVariableScope;
}

export interface IEnvironmentVariableMutatorOptions {
	applyAtProcessCreation?: boolean;
	applyAtShellIntegration?: boolean;
}

export type EnvironmentVariableScope = {
	workspaceFolder?: IWorkspaceFolderData;
};

export interface IEnvironmentVariableCollection {
	readonly map: ReadonlyMap<string, IEnvironmentVariableMutator>;
	readonly descriptionMap?: ReadonlyMap<string, IEnvironmentVariableCollectionDescription>;
}

/** [variable, mutator] */
export type ISerializableEnvironmentVariableCollection = [string, IEnvironmentVariableMutator][];

export type ISerializableEnvironmentDescriptionMap = [string, IEnvironmentVariableCollectionDescription][];
export interface IExtensionOwnedEnvironmentDescriptionMutator extends IEnvironmentVariableCollectionDescription {
	readonly extensionIdentifier: string;
}

/** [extension, collection, description] */
export type ISerializableEnvironmentVariableCollections = [string, ISerializableEnvironmentVariableCollection, ISerializableEnvironmentDescriptionMap][];

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
	 * Gets the description map for a given scope.
	 * @param scope The scope to get the description map for. If undefined, description map for the
	 * global scope is returned.
	 */
	getDescriptionMap(scope: EnvironmentVariableScope | undefined): Map<string, string | undefined>;
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
