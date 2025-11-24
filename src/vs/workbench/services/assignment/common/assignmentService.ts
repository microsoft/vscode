/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import type { IKeyValueStorage, IExperimentationTelemetry, ExperimentationService as TASClient } from 'tas-client';
import { Memento } from '../../../common/memento.js';
import { ITelemetryService, TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryData } from '../../../../base/common/actions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ASSIGNMENT_REFETCH_INTERVAL, ASSIGNMENT_STORAGE_KEY, AssignmentFilterProvider, IAssignmentService, TargetPopulation } from '../../../../platform/assignment/common/assignment.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { getTelemetryLevel } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { importAMDNodeModule } from '../../../../amdX.js';
import { timeout } from '../../../../base/common/async.js';
import { CopilotAssignmentFilterProvider } from './assignmentFilters.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';

export interface IAssignmentFilter {
	exclude(assignment: string): boolean;
	onDidChange: Event<void>;
}

export const IWorkbenchAssignmentService = createDecorator<IWorkbenchAssignmentService>('assignmentService');

export interface IWorkbenchAssignmentService extends IAssignmentService {
	getCurrentExperiments(): Promise<string[] | undefined>;
	addTelemetryAssignmentFilter(filter: IAssignmentFilter): void;
}

class MementoKeyValueStorage implements IKeyValueStorage {

	private readonly mementoObj: Record<string, unknown>;

	constructor(private readonly memento: Memento<Record<string, unknown>>) {
		this.mementoObj = memento.getMemento(StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	async getValue<T>(key: string, defaultValue?: T | undefined): Promise<T | undefined> {
		const value = await this.mementoObj[key] as T | undefined;

		return value || defaultValue;
	}

	setValue<T>(key: string, value: T): void {
		this.mementoObj[key] = value;
		this.memento.saveMemento();
	}
}

class WorkbenchAssignmentServiceTelemetry extends Disposable implements IExperimentationTelemetry {

	private readonly _onDidUpdateAssignmentContext = this._register(new Emitter<void>());
	readonly onDidUpdateAssignmentContext = this._onDidUpdateAssignmentContext.event;

	private _previousAssignmentContext: string | undefined;
	private _lastAssignmentContext: string | undefined;
	get assignmentContext(): string[] | undefined {
		return this._lastAssignmentContext?.split(';');
	}

	private _assignmentFilters: IAssignmentFilter[] = [];
	private _assignmentFilterDisposables = this._register(new DisposableStore());

	constructor(
		private readonly telemetryService: ITelemetryService,
		private readonly productService: IProductService
	) {
		super();
	}

	private _filterAssignmentContext(assignmentContext: string): string {
		const assignments = assignmentContext.split(';');

		const filteredAssignments = assignments.filter(assignment => {
			for (const filter of this._assignmentFilters) {
				if (filter.exclude(assignment)) {
					return false;
				}
			}
			return true;
		});

		return filteredAssignments.join(';');
	}

	private _setAssignmentContext(value: string): void {
		const filteredValue = this._filterAssignmentContext(value);
		this._lastAssignmentContext = filteredValue;
		this._onDidUpdateAssignmentContext.fire();

		if (this.productService.tasConfig?.assignmentContextTelemetryPropertyName) {
			this.telemetryService.setExperimentProperty(this.productService.tasConfig.assignmentContextTelemetryPropertyName, filteredValue);
		}
	}

	addAssignmentFilter(filter: IAssignmentFilter): void {
		this._assignmentFilters.push(filter);
		this._assignmentFilterDisposables.add(filter.onDidChange(() => {
			if (this._previousAssignmentContext) {
				this._setAssignmentContext(this._previousAssignmentContext);
			}
		}));
		if (this._previousAssignmentContext) {
			this._setAssignmentContext(this._previousAssignmentContext);
		}
	}

	// __GDPR__COMMON__ "abexp.assignmentcontext" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	setSharedProperty(name: string, value: string): void {
		if (name === this.productService.tasConfig?.assignmentContextTelemetryPropertyName) {
			this._previousAssignmentContext = value;
			return this._setAssignmentContext(value);
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
				"owner": "sbatten",
				"comment": "Logs queries to the experiment service by feature for metric calculations",
				"ABExp.queriedFeature": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The experimental feature being queried" }
			}
		*/
		this.telemetryService.publicLog(eventName, data);
	}
}

export class WorkbenchAssignmentService extends Disposable implements IAssignmentService {

	declare readonly _serviceBrand: undefined;

	private readonly tasClient: Promise<TASClient> | undefined;
	private readonly tasSetupDisposables = new DisposableStore();

	private networkInitialized = false;
	private readonly overrideInitDelay: Promise<void>;

	private readonly telemetry: WorkbenchAssignmentServiceTelemetry;
	private readonly keyValueStorage: IKeyValueStorage;

	private readonly experimentsEnabled: boolean;

	private readonly _onDidRefetchAssignments = this._register(new Emitter<void>());
	public readonly onDidRefetchAssignments = this._onDidRefetchAssignments.event;

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IProductService private readonly productService: IProductService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this.experimentsEnabled = getTelemetryLevel(configurationService) === TelemetryLevel.USAGE &&
			!environmentService.disableExperiments &&
			!environmentService.extensionTestsLocationURI &&
			!environmentService.enableSmokeTestDriver &&
			configurationService.getValue('workbench.enableExperiments') === true;

		if (productService.tasConfig && this.experimentsEnabled) {
			this.tasClient = this.setupTASClient();
		}

		this.telemetry = this._register(new WorkbenchAssignmentServiceTelemetry(telemetryService, productService));
		this._register(this.telemetry.onDidUpdateAssignmentContext(() => this._onDidRefetchAssignments.fire()));

		this.keyValueStorage = new MementoKeyValueStorage(new Memento<Record<string, unknown>>('experiment.service.memento', storageService));

		// For development purposes, configure the delay until tas local tas treatment ovverrides are available
		const overrideDelaySetting = configurationService.getValue('experiments.overrideDelay');
		const overrideDelay = typeof overrideDelaySetting === 'number' ? overrideDelaySetting : 0;
		this.overrideInitDelay = timeout(overrideDelay);
	}

	async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
		const result = await this.doGetTreatment<T>(name);

		type TASClientReadTreatmentData = {
			treatmentName: string;
			treatmentValue: string;
		};

		type TASClientReadTreatmentClassification = {
			owner: 'sbatten';
			comment: 'Logged when a treatment value is read from the experiment service';
			treatmentValue: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The value of the read treatment' };
			treatmentName: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The name of the treatment that was read' };
		};

		this.telemetryService.publicLog2<TASClientReadTreatmentData, TASClientReadTreatmentClassification>('tasClientReadTreatmentComplete', {
			treatmentName: name,
			treatmentValue: JSON.stringify(result)
		});

		return result;
	}

	private async doGetTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
		await this.overrideInitDelay; // For development purposes, allow overriding tas assignments to test variants locally.

		const override = this.configurationService.getValue<T>(`experiments.override.${name}`);
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
		this.tasSetupDisposables.clear();

		const targetPopulation = this.productService.quality === 'stable' ?
			TargetPopulation.Public : (this.productService.quality === 'exploration' ?
				TargetPopulation.Exploration : TargetPopulation.Insiders);

		const filterProvider = new AssignmentFilterProvider(
			this.productService.version,
			this.productService.nameLong,
			this.telemetryService.machineId,
			this.telemetryService.devDeviceId,
			targetPopulation,
			this.productService.date ?? ''
		);

		const extensionsFilterProvider = this.instantiationService.createInstance(CopilotAssignmentFilterProvider);
		this.tasSetupDisposables.add(extensionsFilterProvider);
		this.tasSetupDisposables.add(extensionsFilterProvider.onDidChangeFilters(() => this.refetchAssignments()));

		const tasConfig = this.productService.tasConfig!;
		const tasClient = new (await importAMDNodeModule<typeof import('tas-client')>('tas-client', 'dist/tas-client.min.js')).ExperimentationService({
			filterProviders: [filterProvider, extensionsFilterProvider],
			telemetry: this.telemetry,
			storageKey: ASSIGNMENT_STORAGE_KEY,
			keyValueStorage: this.keyValueStorage,
			assignmentContextTelemetryPropertyName: tasConfig.assignmentContextTelemetryPropertyName,
			telemetryEventName: tasConfig.telemetryEventName,
			endpoint: tasConfig.endpoint,
			refetchInterval: ASSIGNMENT_REFETCH_INTERVAL,
		});

		await tasClient.initializePromise;
		tasClient.initialFetch.then(() => {
			this.networkInitialized = true;
		});

		return tasClient;
	}

	private async refetchAssignments(): Promise<void> {
		if (!this.tasClient) {
			return; // Setup has not started, assignments will use latest filters
		}

		// Await the client to be setup and the initial fetch to complete
		const tasClient = await this.tasClient;
		await tasClient.initialFetch;

		// Refresh the assignments
		await tasClient.getTreatmentVariableAsync('vscode', 'refresh', false);
	}

	async getCurrentExperiments(): Promise<string[] | undefined> {
		if (!this.tasClient) {
			return undefined;
		}

		if (!this.experimentsEnabled) {
			return undefined;
		}

		await this.tasClient;

		return this.telemetry.assignmentContext;
	}

	addTelemetryAssignmentFilter(filter: IAssignmentFilter): void {
		this.telemetry.addAssignmentFilter(filter);
	}
}

registerSingleton(IWorkbenchAssignmentService, WorkbenchAssignmentService, InstantiationType.Delayed);

const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
registry.registerConfiguration({
	...workbenchConfigurationNodeBase,
	'properties': {
		'workbench.enableExperiments': {
			'type': 'boolean',
			'description': localize('workbench.enableExperiments', "Fetches experiments to run from a Microsoft online service."),
			'default': true,
			'scope': ConfigurationScope.APPLICATION,
			'restricted': true,
			'tags': ['usesOnlineServices']
		}
	}
});
