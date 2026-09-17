/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimulationStorage, SimulationStorageValue } from './simulationStorage';

/**
 * Persisted options for NES External mode in the simulation workbench.
 */
export class NesExternalOptions {

	/**
	 * Path to the directory containing NES external scenarios (e.g., `../eval/simulation/nes`).
	 */
	public readonly externalScenariosPath: SimulationStorageValue<string>;

	constructor(storage: SimulationStorage) {
		this.externalScenariosPath = new SimulationStorageValue(storage, 'nesExternalScenariosPath', '');
	}
}
