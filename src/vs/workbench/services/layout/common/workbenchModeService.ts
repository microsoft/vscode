/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IWorkbenchModeService = createDecorator<IWorkbenchModeService>('workbenchModeService');

export interface IWorkbenchModeConfiguration {
	readonly id: string;
	readonly name: string;
	readonly settings: IStringDictionary<unknown>;
}

export interface IWorkbenchModeService {
	readonly _serviceBrand: undefined;

	/**
	 * The currently active workbench mode id, or undefined if using default settings
	 */
	readonly workbenchMode: string | undefined;

	/**
	 * Event fired when the workbench mode changes
	 */
	readonly onDidChangeWorkbenchMode: Event<string | undefined>;

	/**
	 * Resolve a workbench mode by its id
	 * @param id The id of the workbench mode to resolve
	 */
	getWorkbenchModeConfiguration(id: string): Promise<IWorkbenchModeConfiguration | undefined>;

	/**
	 * Get all workbench modes
	 */
	getWorkbenchModeConfigurations(): Promise<IWorkbenchModeConfiguration[]>;

	/**
	 * Set the active workbench mode. Pass undefined to clear the mode and return to defaults.
	 */
	setWorkbenchMode(workbenchMode: string | undefined): Promise<void>;
}

export class DefaultWorkbenchModeService implements IWorkbenchModeService {

	readonly _serviceBrand: undefined;
	readonly workbenchMode: string | undefined = undefined;
	readonly onDidChangeWorkbenchMode: Event<string | undefined> = Event.None;

	getWorkbenchModeConfiguration(_id: string): Promise<IWorkbenchModeConfiguration | undefined> {
		return Promise.resolve(undefined);
	}

	getWorkbenchModeConfigurations(): Promise<IWorkbenchModeConfiguration[]> {
		return Promise.resolve([]);
	}

	setWorkbenchMode(_workbenchMode: string | undefined): Promise<void> {
		return Promise.resolve();
	}
}
