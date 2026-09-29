/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimulationStorage, SimulationStorageValue } from './simulationStorage';

/**
 * Persisted inputs for the "Adhoc request sender" mode in the simulation workbench.
 */
export class AdhocRequestOptions {

	/** The system message to send. */
	public readonly systemMessage: SimulationStorageValue<string>;

	/** The user message to send. */
	public readonly userMessage: SimulationStorageValue<string>;

	/** The model name (e.g. `gpt-4.1`) to send the request to. */
	public readonly model: SimulationStorageValue<string>;

	constructor(storage: SimulationStorage) {
		this.systemMessage = new SimulationStorageValue(storage, 'adhocRequestSystemMessage', '');
		this.userMessage = new SimulationStorageValue(storage, 'adhocRequestUserMessage', '');
		this.model = new SimulationStorageValue(storage, 'adhocRequestModel', '');
	}
}
