/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createServiceIdentifier } from '../../../util/common/services';
import { Emitter, Event } from '../../../util/vs/base/common/event';


/**
 * An event describing the change in treatments.
 */
export interface TreatmentsChangeEvent {

	/**
	 * List of changed treatments
	 */
	affectedTreatmentVariables: string[];
}

/**
 * Experimentation service provides A/B experimentation functionality.
 * Currently it's per design to be able to only allow querying one flight at the time.
 * This is in order for us to control events and telemetry whenever these methods are called.
 */
export interface IExperimentationService {
	readonly _serviceBrand: undefined;

	/**
	 * Emitted whenever a treatment values have changes based on user account information or refresh.
	 */
	onDidTreatmentsChange: Event<TreatmentsChangeEvent>;


	/**
	 * Promise that resolves when the experimentation service has completed
	 * its first request to the Treatment Assignment Service. If this request
	 * is successful, flights are up-to-date. Flights can change when the user
	 * changes their account.
	 */
	hasTreatments(): Promise<void>;

	/**
	 * Returns the value of the treatment variable, or undefined if not found.
	 * It uses the values currently in memory, so the experimentation service
	 * must be initialized before calling.
	 * @param name name of the treatment variable.
	 */
	getTreatmentVariable<T extends boolean | number | string>(name: string): T | undefined;

	/**
	 * Sets the filters for the completions experiments.
	 * @param filters Map of filter names to their values.
	 * @deprecated This will be removed once we have fully migrated to the new completions implementation.
	 */
	setCompletionsFilters(filters: Map<string, string>): void;
}

export const IExperimentationService = createServiceIdentifier<IExperimentationService>('IExperimentationService');


export class NullExperimentationService implements IExperimentationService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidTreatmentsChange = new Emitter<TreatmentsChangeEvent>();
	readonly onDidTreatmentsChange = this._onDidTreatmentsChange.event;

	async hasTreatments(): Promise<void> { return Promise.resolve(); }
	async hasAccountBasedTreatments(): Promise<void> { return Promise.resolve(); }
	getTreatmentVariable<T extends boolean | number | string>(_name: string): T | undefined {
		return undefined;
	}

	async setCompletionsFilters(filters: Map<string, string>): Promise<void> { }
}
