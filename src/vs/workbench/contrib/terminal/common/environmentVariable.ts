/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { ThemeIcon } from 'vs/base/common/themables';
import { IEnvironmentVariableCollection, IMergedEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariable';

export const IEnvironmentVariableService = createDecorator<IEnvironmentVariableService>('environmentVariableService');

/**
 * Tracks and persists environment variable collections as defined by extensions.
 */
export interface IEnvironmentVariableService {
	readonly _serviceBrand: undefined;

	/**
	 * Gets a single collection constructed by merging all environment variable collections into
	 * one.
	 */
	readonly collections: ReadonlyMap<string, IEnvironmentVariableCollection>;

	/**
	 * Gets a single collection constructed by merging all environment variable collections into
	 * one.
	 */
	readonly mergedCollection: IMergedEnvironmentVariableCollection;

	/**
	 * An event that is fired when an extension's environment variable collection changes, the event
	 * provides the new merged collection.
	 */
	onDidChangeCollections: Event<IMergedEnvironmentVariableCollection>;

	/**
	 * Sets an extension's environment variable collection.
	 */
	set(extensionIdentifier: string, collection: IEnvironmentVariableCollection): void;

	/**
	 * Deletes an extension's environment variable collection.
	 */
	delete(extensionIdentifier: string): void;
}

export interface IEnvironmentVariableCollectionWithPersistence extends IEnvironmentVariableCollection {
	readonly persistent: boolean;
}

export interface IEnvironmentVariableInfo {
	readonly requiresAction: boolean;
	getInfo(): string;
	getIcon(): ThemeIcon;
	getActions?(): {
		label: string;
		commandId: string;
		iconClass?: string;
		run(target: any): void;
	}[];
}
