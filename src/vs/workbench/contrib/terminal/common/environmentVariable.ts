/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IEnvironmentVariableService = createDecorator<IEnvironmentVariableService>('environmentVariableService');

export interface IEnvironmentVariableMutator {
	readonly value: string;
	readonly type: 'replace' | 'append' | 'prepend';
}

export interface IEnvironmentVariableCollection {
	readonly entries: Map<string, IEnvironmentVariableMutator>;
}

/**
 * Tracks and persists environment variable collections as defined by extensions.
 */
export interface IEnvironmentVariableService {
	/**
	 * Gets a single collection constructed by merging all collections into one.
	 */
	readonly mergedCollection: IEnvironmentVariableCollection;

	set(extensionIdentifier: string, collection: IEnvironmentVariableCollection): void;
	delete(extensionIdentifier: string): void;
}
