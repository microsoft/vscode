/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import type { IKeyValueStorage, IExperimentationTelemetry, ExperimentationService as TASClient } from 'tas-client-umd';
import { MementoObject, Memento } from 'vs/workbench/common/memento';
import { ITelemetryService, TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { ITelemetryData } from 'vs/base/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProductService } from 'vs/platform/product/common/productService';
import { AssignmentFilterProvider, ASSIGNMENT_REFETCH_INTERVAL, ASSIGNMENT_STORAGE_KEY, IAssignmentService, TargetPopulation } from 'vs/platform/assignment/common/assignment';

export const ITASExperimentService = createDecorator<ITASExperimentService>('TASExperimentService');

export interface ITASExperimentService extends IAssignmentService {
	getCurrentExperiments(): Promise<string[] | undefined>;
}

class MementoKeyValueStorage implements IKeyValueStorage {
	private mementoObj: MementoObject;
	constructor(private memento: Memento) {
		this.mementoObj = memento.getMemento(StorageScope.GLOBAL, StorageTarget.MACHINE);
	}

	async getValue<T>(key: string, defaultValue?: T | undefined): Promise<T | undefined> {
		const value = await this.mementoObj[key];
		return value || defaultValue;
	}

	setValue<T>(key: string, value: T): void {
		this.mementoObj[key] = value;
		this.memento.saveMemento();
	}
}

class ExperimentServiceTelemetry implements IExperimentationTelemetry {
	private _lastAssignmentContext: string | undefined;
	constructor(
		private telemetryService: ITelemetryService,
		private productService: IProductService
	) { }

	get assignmentContext(): string[] | undefined {
		return this._lastAssignmentContext?.split(';');
	}

	// __GDPR__COMMON__ "VSCode.ABExp.Features" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	// __GDPR__COMMON__ "abexp.assignmentcontext" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	setSharedProperty(name: string, value: string): void {
		if (name === this.productService.tasConfig?.assignmentContextTelemetryPropertyName) {
			this._lastAssignmentContext = value;
		}

		this.telemetryService.setExperimentProperty(name, value);
	}

	postEvent(eventName: string, props: Map<string, string>): void {
		const data: ITelemetryData = {};
		for (const [key, value] of props.entries()) {
			data[key] = value;
		}

		/* __GDPR__
			"query-expfeature" : {
				"ABExp.queriedFeature": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog(eventName, data);
	}
}

export class ExperimentService implements ITASExperimentService {
	_serviceBrand: undefined;
	private tasClient: Promise<TASClient> | undefined;
	private telemetry: ExperimentServiceTelemetry | undefined;
	private static MEMENTO_ID = 'experiment.service.memento';
	private networkInitialized = false;

	private overrideInitDelay: Promise<void>;

	private get experimentsEnabled(): boolean {
		return this.configurationService.getValue('workbench.enableExperiments') === true;
	}

	constructor(
		@ITelemetryService private telemetryService: ITelemetryService,
		@IStorageService private storageService: IStorageService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IProductService private productService: IProductService
	) {

		if (productService.tasConfig && this.experimentsEnabled && this.telemetryService.telemetryLevel === TelemetryLevel.USAGE) {
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
			type TAASClientOverrideTreatmentData = { treatmentName: string; };
			type TAASClientOverrideTreatmentClassification = { treatmentName: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth', }; };
			this.telemetryService.publicLog2<TAASClientOverrideTreatmentData, TAASClientOverrideTreatmentClassification>('tasClientOverrideTreatment', { treatmentName: name, });
			return override;
		}

		const startSetup = Date.now();

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

		type TAASClientReadTreatmentData = {
			treatmentName: string;
			treatmentValue: string;
			readTime: number;
		};

		type TAASClientReadTreatmentCalssification = {
			treatmentValue: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth', };
			treatmentName: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth', };
			readTime: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth', isMeasurement: true };
		};
		this.telemetryService.publicLog2<TAASClientReadTreatmentData, TAASClientReadTreatmentCalssification>('tasClientReadTreatmentComplete',
			{ readTime: Date.now() - startSetup, treatmentName: name, treatmentValue: JSON.stringify(result) });

		return result;
	}

	async getCurrentExperiments(): Promise<string[] | undefined> {
		if (!this.tasClient) {
			return undefined;
		}

		if (!this.experimentsEnabled) {
			return undefined;
		}

		await this.tasClient;

		return this.telemetry?.assignmentContext;
	}

	private async setupTASClient(): Promise<TASClient> {
		const startSetup = Date.now();
		const telemetryInfo = await this.telemetryService.getTelemetryInfo();
		const targetPopulation = telemetryInfo.msftInternal ? TargetPopulation.Internal : (this.productService.quality === 'stable' ? TargetPopulation.Public : TargetPopulation.Insiders);
		const machineId = telemetryInfo.machineId;
		const filterProvider = new AssignmentFilterProvider(
			this.productService.version,
			this.productService.nameLong,
			machineId,
			targetPopulation
		);

		const keyValueStorage = new MementoKeyValueStorage(new Memento(ExperimentService.MEMENTO_ID, this.storageService));

		this.telemetry = new ExperimentServiceTelemetry(this.telemetryService, this.productService);

		const tasConfig = this.productService.tasConfig!;
		const tasClient = new (await import('tas-client-umd')).ExperimentationService({
			filterProviders: [filterProvider],
			telemetry: this.telemetry,
			storageKey: ASSIGNMENT_STORAGE_KEY,
			keyValueStorage: keyValueStorage,
			featuresTelemetryPropertyName: tasConfig.featuresTelemetryPropertyName,
			assignmentContextTelemetryPropertyName: tasConfig.assignmentContextTelemetryPropertyName,
			telemetryEventName: tasConfig.telemetryEventName,
			endpoint: tasConfig.endpoint,
			refetchInterval: ASSIGNMENT_REFETCH_INTERVAL,
		});

		await tasClient.initializePromise;

		tasClient.initialFetch.then(() => this.networkInitialized = true);

		type TAASClientSetupData = { setupTime: number; };
		type TAASClientSetupCalssification = { setupTime: { classification: 'SystemMetaData', purpose: 'PerformanceAndHealth', isMeasurement: true }; };
		this.telemetryService.publicLog2<TAASClientSetupData, TAASClientSetupCalssification>('tasClientSetupComplete', { setupTime: Date.now() - startSetup });

		return tasClient;
	}
}

registerSingleton(ITASExperimentService, ExperimentService, false);
