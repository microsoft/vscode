/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IExperimentationTelemetry, ExperimentationService as TASClient, IKeyValueStorage } from 'tas-client-umd';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProductService } from 'vs/platform/product/common/productService';
import { getTelemetryLevel } from 'vs/platform/telemetry/common/telemetryUtils';
import { AssignmentFilterProvider, ASSIGNMENT_REFETCH_INTERVAL, ASSIGNMENT_STORAGE_KEY, IAssignmentService, TargetPopulation } from 'vs/platform/assignment/common/assignment';

class NullAssignmentServiceTelemetry implements IExperimentationTelemetry {
	constructor() { }

	setSharedProperty(name: string, value: string): void {
		// noop due to lack of telemetry service
	}

	postEvent(eventName: string, props: Map<string, string>): void {
		// noop due to lack of telemetry service
	}
}

export abstract class BaseAssignmentService implements IAssignmentService {
	_serviceBrand: undefined;
	protected tasClient: Promise<TASClient> | undefined;
	private networkInitialized = false;
	private overrideInitDelay: Promise<void>;

	protected get experimentsEnabled(): boolean {
		return true;
	}

	constructor(
		private readonly getMachineId: () => Promise<string>,
		protected readonly configurationService: IConfigurationService,
		protected readonly productService: IProductService,
		protected telemetry: IExperimentationTelemetry,
		private keyValueStorage?: IKeyValueStorage
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

		// The TAS client is initialized but we need to check if the initial fetch has completed yet
		// If it is complete, return a cached value for the treatment
		// If not, use the async call with `checkCache: true`. This will allow the module to return a cached value if it is present.
		// Otherwise it will await the initial fetch to return the most up to date value.
		if (this.networkInitialized) {
			result = client.getTreatmentVariable<T>('vscode', name);
		} else {
			result = await client.getTreatmentVariableAsync<T>('vscode', name, true);
		}

		result = client.getTreatmentVariable<T>('vscode', name);
		return result;
	}

	private async setupTASClient(): Promise<TASClient> {
		const targetPopulation = this.productService.quality === 'stable' ? TargetPopulation.Public : TargetPopulation.Insiders;
		const machineId = await this.getMachineId();
		const filterProvider = new AssignmentFilterProvider(
			this.productService.version,
			this.productService.nameLong,
			machineId,
			targetPopulation
		);

		const tasConfig = this.productService.tasConfig!;
		const tasClient = new (await import('tas-client-umd')).ExperimentationService({
			filterProviders: [filterProvider],
			telemetry: this.telemetry,
			storageKey: ASSIGNMENT_STORAGE_KEY,
			keyValueStorage: this.keyValueStorage,
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

export class AssignmentService extends BaseAssignmentService {
	constructor(
		machineId: string,
		configurationService: IConfigurationService,
		productService: IProductService) {
		super(() => Promise.resolve(machineId), configurationService, productService, new NullAssignmentServiceTelemetry());
	}
}
