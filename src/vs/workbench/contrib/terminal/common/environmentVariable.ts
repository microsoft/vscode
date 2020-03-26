/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { IProcessEnvironment } from 'vs/base/common/platform';

export const IEnvironmentVariableService = createDecorator<IEnvironmentVariableService>('environmentVariableService');

export enum EnvironmentVariableMutatorType {
	Replace = 1,
	Append = 2,
	Prepend = 3
}

export interface IEnvironmentVariableMutator {
	readonly value: string;
	readonly type: EnvironmentVariableMutatorType;
}

export interface IEnvironmentVariableCollection {
	readonly entries: ReadonlyMap<string, IEnvironmentVariableMutator>;

	/**
	 * Get's additions when compared to another collection. This only gets additions rather than
	 * doing a full diff because we can only reliably add entries to an environment, not remove
	 * them.
	 */
	getNewAdditions(other: IEnvironmentVariableCollection): ReadonlyMap<string, IEnvironmentVariableMutator> | undefined;

	/**
	 * Applies this collection to a process environment.
	 */
	applyToProcessEnvironment(env: IProcessEnvironment): void;
}

/**
 * Tracks and persists environment variable collections as defined by extensions.
 */
export interface IEnvironmentVariableService {
	_serviceBrand: undefined;

	/**
	 * Gets a single collection constructed by merging all collections into one.
	 */
	readonly mergedCollection: IEnvironmentVariableCollection;

	onDidChangeCollections: Event<IEnvironmentVariableCollection>;

	set(extensionIdentifier: string, collection: IEnvironmentVariableCollection): void;
	delete(extensionIdentifier: string): void;
}
