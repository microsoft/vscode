/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IExperimentationTelemetry, ExperimentationService as TASClient } from 'tas-client-umd';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProductService } from 'vs/platform/product/common/productService';
import { getTelemetryLevel } from 'vs/platform/telemetry/common/telemetryUtils';
import { AssignmentFilterProvider, ASSIGNMENT_REFETCH_INTERVAL, ASSIGNMENT_STORAGE_KEY, IAssignmentService, TargetPopulation } from 'vs/platform/assignment/common/assignment';

class AssignmentServiceTelemetry implements IExperimentationTelemetry {
	constructor(
	) { }

	setSharedProperty(name: string, value: string): void {
		// noop due to lack of telemetry service
	}

	postEvent(eventName: string, props: Map<string, string>): void {
		// noop due to lack of telemetry service
	}
}

export class AssignmentService implements IAssignmentService {
	_serviceBrand: undefined;
	private tasClient: Promise<TASClient> | undefined;
	private telemetry: AssignmentServiceTelemetry | undefined;
	private networkInitialized = false;

	private overrideInitDelay: Promise<void>;

	private get experimentsEnabled(): boolean {
		return this.configurationService.getValue('workbench.enableExperiments') === true;
	}

	constructor(
		private readonly machineId: string,
		@IConfigurationService private configurationService: IConfigurationService,
		@IProductService private productService: IProductService
	) {

		if (productService.tasConfig && this.experimentsEnabled && getTelemetryLevel(this.configurationService) === TelemetryLevel.USAGE) {
			this.tasClient = this.setupTASClient();
		}

		// For development purposes, configure the delay until tas local tas treatment ovverrides are available
		const overrideDelaySetting = this.configurationService.getValue('experiments.overrideDelay');
		const overrideDelay = typeof overrideDelaySetting === 'number' ? overrideDelaySetting : 0;
		this.overrideInitDelay = new Promise(resolve => setTimeout(resolve, overrideDelay));
	}

	async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
		// For development purposes, allow overriding tas assignments to test variants locally.
		await this.overrideInitDelay;
		const override = this.configurationService.getValue<T>('experiments.override.' + name);
		if (override !== undefined) {
			return override;
		}

		if (!this.tasClient) {
			return undefined;
		}

		if (!this.experimentsEnabled) {
			return undefined;
		}

		let result: T | undefined;
		const client = await this.tasClient;
		if (this.networkInitialized) {
			result = client.getTreatmentVariable<T>('vscode', name);
		} else {
			result = await client.getTreatmentVariableAsync<T>('vscode', name, true);
		}
		return result;
	}

	private async setupTASClient(): Promise<TASClient> {
		const targetPopulation = this.productService.quality === 'stable' ? TargetPopulation.Public : TargetPopulation.Insiders;
		const machineId = this.machineId;
		const filterProvider = new AssignmentFilterProvider(
			this.productService.version,
			this.productService.nameLong,
			machineId,
			targetPopulation
		);

		this.telemetry = new AssignmentServiceTelemetry();

		const tasConfig = this.productService.tasConfig!;
		const tasClient = new (await import('tas-client-umd')).ExperimentationService({
			filterProviders: [filterProvider],
			telemetry: this.telemetry,
			storageKey: ASSIGNMENT_STORAGE_KEY,
			keyValueStorage: undefined,
			featuresTelemetryPropertyName: tasConfig.featuresTelemetryPropertyName,
			assignmentContextTelemetryPropertyName: tasConfig.assignmentContextTelemetryPropertyName,
			telemetryEventName: tasConfig.telemetryEventName,
			endpoint: tasConfig.endpoint,
			refetchInterval: ASSIGNMENT_REFETCH_INTERVAL,
		});

		await tasClient.initializePromise;

		tasClient.initialFetch.then(() => this.networkInitialized = true);
		return tasClient;
	}
}
