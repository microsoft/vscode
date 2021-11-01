/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from 'vs/base/common/platform';
import type { IExperimentationTelemetry, IExperimentationFilterProvider, ExperimentationService as TASClient } from 'tas-client-umd';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProductService } from 'vs/platform/product/common/productService';
import { getTelemetryLevel } from 'vs/platform/telemetry/common/telemetryUtils';

export interface IAssignmentService {
	readonly _serviceBrand: undefined;
	getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined>;
	getCurrentExperiments(): Promise<string[] | undefined>;
}

const storageKey = 'VSCode.ABExp.FeatureData';
const refetchInterval = 0; // no polling

// class MementoKeyValueStorage implements IKeyValueStorage {
// 	private mementoObj: MementoObject;
// 	constructor(private memento: Memento) {
// 		this.mementoObj = memento.getMemento(StorageScope.GLOBAL, StorageTarget.MACHINE);
// 	}

// 	async getValue<T>(key: string, defaultValue?: T | undefined): Promise<T | undefined> {
// 		const value = await this.mementoObj[key];
// 		return value || defaultValue;
// 	}

// 	setValue<T>(key: string, value: T): void {
// 		this.mementoObj[key] = value;
// 		this.memento.saveMemento();
// 	}
//}

class AssignmentServiceTelemetry implements IExperimentationTelemetry {
	private _lastAssignmentContext: string | undefined;
	constructor(
		private productService: IProductService
	) { }

	get assignmentContext(): string[] | undefined {
		return this._lastAssignmentContext?.split(';');
	}

	setSharedProperty(name: string, value: string): void {
		if (name === this.productService.tasConfig?.assignmentContextTelemetryPropertyName) {
			this._lastAssignmentContext = value;
		}
	}

	postEvent(eventName: string, props: Map<string, string>): void {
		// noop due to lack of telemetry service
	}
}

class ExperimentServiceFilterProvider implements IExperimentationFilterProvider {
	constructor(
		private version: string,
		private appName: string,
		private machineId: string,
		private targetPopulation: TargetPopulation
	) { }

	getFilterValue(filter: string): string | null {
		switch (filter) {
			case Filters.ApplicationVersion:
				return this.version; // productService.version
			case Filters.Build:
				return this.appName; // productService.nameLong
			case Filters.ClientId:
				return this.machineId;
			case Filters.Language:
				return platform.language;
			case Filters.ExtensionName:
				return 'vscode-core'; // always return vscode-core for exp service
			case Filters.TargetPopulation:
				return this.targetPopulation;
			default:
				return '';
		}
	}

	getFilters(): Map<string, any> {
		let filters: Map<string, any> = new Map<string, any>();
		let filterValues = Object.values(Filters);
		for (let value of filterValues) {
			filters.set(value, this.getFilterValue(value));
		}

		return filters;
	}
}

/*
Based upon the official VSCode currently existing filters in the
ExP backend for the VSCode cluster.
https://experimentation.visualstudio.com/Analysis%20and%20Experimentation/_git/AnE.ExP.TAS.TachyonHost.Configuration?path=%2FConfigurations%2Fvscode%2Fvscode.json&version=GBmaster
"X-MSEdge-Market": "detection.market",
"X-FD-Corpnet": "detection.corpnet",
"X-VSCode–AppVersion": "appversion",
"X-VSCode-Build": "build",
"X-MSEdge-ClientId": "clientid",
"X-VSCode-ExtensionName": "extensionname",
"X-VSCode-TargetPopulation": "targetpopulation",
"X-VSCode-Language": "language"
*/

enum Filters {
	/**
	 * The market in which the extension is distributed.
	 */
	Market = 'X-MSEdge-Market',

	/**
	 * The corporation network.
	 */
	CorpNet = 'X-FD-Corpnet',

	/**
	 * Version of the application which uses experimentation service.
	 */
	ApplicationVersion = 'X-VSCode-AppVersion',

	/**
	 * Insiders vs Stable.
	 */
	Build = 'X-VSCode-Build',

	/**
	 * Client Id which is used as primary unit for the experimentation.
	 */
	ClientId = 'X-MSEdge-ClientId',

	/**
	 * Extension header.
	 */
	ExtensionName = 'X-VSCode-ExtensionName',

	/**
	 * The language in use by VS Code
	 */
	Language = 'X-VSCode-Language',

	/**
	 * The target population.
	 * This is used to separate internal, early preview, GA, etc.
	 */
	TargetPopulation = 'X-VSCode-TargetPopulation',
}

enum TargetPopulation {
	Team = 'team',
	Internal = 'internal',
	Insiders = 'insider',
	Public = 'public',
}

export class AssignmentService implements IAssignmentService {
	_serviceBrand: undefined;
	private tasClient: Promise<TASClient> | undefined;
	private telemetry: AssignmentServiceTelemetry | undefined;
	// private static MEMENTO_ID = 'experiment.service.memento';
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
		const targetPopulation = this.productService.quality === 'stable' ? TargetPopulation.Public : TargetPopulation.Insiders;
		const machineId = this.machineId;
		const filterProvider = new ExperimentServiceFilterProvider(
			this.productService.version,
			this.productService.nameLong,
			machineId,
			targetPopulation
		);

		//const keyValueStorage = new MementoKeyValueStorage(new Memento(AssignmentService.MEMENTO_ID, this.storageService));

		this.telemetry = new AssignmentServiceTelemetry(this.productService);

		const tasConfig = this.productService.tasConfig!;
		const tasClient = new (await import('tas-client-umd')).ExperimentationService({
			filterProviders: [filterProvider],
			telemetry: this.telemetry,
			storageKey: storageKey,
			keyValueStorage: undefined,
			featuresTelemetryPropertyName: tasConfig.featuresTelemetryPropertyName,
			assignmentContextTelemetryPropertyName: tasConfig.assignmentContextTelemetryPropertyName,
			telemetryEventName: tasConfig.telemetryEventName,
			endpoint: tasConfig.endpoint,
			refetchInterval: refetchInterval,
		});

		await tasClient.initializePromise;

		tasClient.initialFetch.then(() => this.networkInitialized = true);
		return tasClient;
	}
}
