/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { createDecorator, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import type { IKeyValueStorage, IExperimentationTelemetry, IExperimentationFilterProvider, ExperimentationService as TASClient } from 'tas-client';
import { Memento } from '../../../common/memento.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryData } from '../../../../base/common/actions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ASSIGNMENT_REFETCH_INTERVAL, ASSIGNMENT_STORAGE_KEY, AssignmentFilterProvider, IAssignmentService, TargetPopulation, VSCodeCoreAssignmentsFilterProvider, WindowKind } from '../../../../platform/assignment/common/assignment.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { workbenchConfigurationNodeBase } from '../../../common/configuration.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { resolveAmdNodeModulePath } from '../../../../amdX.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { timeout } from '../../../../base/common/async.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { CopilotAssignmentFilterProvider, GitHubCoreAssignmentsFilterProvider } from './assignmentFilters.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { AssignmentContextFilter } from './assignmentContextFilter.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { experimentsEnabled } from '../../telemetry/common/workbenchTelemetryUtils.js';

export interface IAssignmentFilter {
	/**
	 * Stable identifier for this filter. Used to persist and reconcile the set of
	 * assignment-context ids this filter has excluded, independently of other filters.
	 */
	readonly id: string;
	exclude(assignment: string): boolean;
	onDidChange: Event<void>;
}

export const IWorkbenchAssignmentService = createDecorator<IWorkbenchAssignmentService>('assignmentService');

/**
 * Scope prefix that the new TAS assignments endpoint (`/api/v1/assignments`) prepends to the
 * feature variable keys it returns (e.g. `/vscode/config.chat...`). The legacy endpoint and
 * VS Code both query treatments by the bare name, so this prefix must be accounted for when a
 * bare lookup misses. This is an interim workaround until tas-client strips the scope itself.
 */
const ASSIGNMENTS_SCOPE_PREFIX = '/vscode/';

/**
 * Resolves a treatment value preferring the `/vscode/`-scoped key emitted by the new TAS
 * assignments endpoint over the bare key used by the legacy endpoint, so the new endpoint wins
 * when both assign a treatment (matching the behavior once tas-client strips the scope itself).
 * Falls back to the bare key for treatments served only by the legacy endpoint.
 *
 * Exported for testing.
 */
export function resolveScopedTreatment<T extends string | number | boolean>(read: (name: string) => T | undefined, name: string): T | undefined {
	const scoped = read(`${ASSIGNMENTS_SCOPE_PREFIX}${name}`);
	return scoped !== undefined ? scoped : read(name);
}

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

	constructor(
		private readonly telemetryService: ITelemetryService,
		private readonly productService: IProductService,
		private readonly contextFilter: AssignmentContextFilter
	) {
		super();

		// Re-apply the filters whenever a filter is added or changes its exclusion decisions.
		this._register(this.contextFilter.onDidChange(() => {
			if (this._previousAssignmentContext) {
				this._setAssignmentContext(this._previousAssignmentContext);
			}
		}));
	}

	private _setAssignmentContext(value: string): void {
		const filteredValue = this.contextFilter.filter(value);
		this._lastAssignmentContext = filteredValue;
		this._onDidUpdateAssignmentContext.fire();

		if (this.productService.tasConfig?.assignmentContextTelemetryPropertyName) {
			this.telemetryService.setExperimentProperty(this.productService.tasConfig.assignmentContextTelemetryPropertyName, filteredValue);
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
		/* __GDPR__
			"assignments-validation" : {
				"owner": "sbatten",
				"comment": "Validation data for the new TAS assignments endpoint, compared against the legacy endpoint",
				"FeatureVariableCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of feature variables returned by the new assignments endpoint" },
				"AssignedVariantCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Number of assigned variants returned by the new assignments endpoint" },
				"DataVersion": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Data version returned by the new assignments endpoint" },
				"AssignmentContext": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "Assignment context returned by the new assignments endpoint" }
			}
		*/
		/* __GDPR__
			"call-assignments-error" : {
				"owner": "sbatten",
				"comment": "Logs errors when calling the new TAS assignments endpoint",
				"ErrorType": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The type of error encountered when calling the new assignments endpoint" }
			}
		*/
		/* __GDPR__
			"tas-call" : {
				"owner": "sbatten",
				"comment": "Logs each TAS call (legacy and new assignments endpoint) with its outcome, to confirm calls are made and succeeding per extension",
				"callType": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Which endpoint was called: legacy or assignments" },
				"outcome": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "Call outcome: Success, ServerError, NoResponse, or GenericError" },
				"extensionName": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "comment": "The extension/host the TAS call was made for" },
				"assignmentContext": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "comment": "The assignment context returned by this call's endpoint" }
			}
		*/
		this.telemetryService.publicLog(eventName, data);
	}
}

export class WorkbenchAssignmentService extends Disposable implements IAssignmentService {

	declare readonly _serviceBrand: undefined;

	private tasClient: Promise<TASClient> | undefined;
	private readonly tasSetupDisposables = this._register(new DisposableStore());

	private assignmentsEndpoint: string | undefined;

	private networkInitialized = false;
	private setupGeneration = 0;
	/** Revokes the current setup's storage/telemetry/fetch wrappers, neutralizing a superseded in-flight client. */
	private revokeCurrentSetup: (() => void) | undefined;
	private readonly overrideInitDelay: Promise<void>;

	private readonly contextFilter: AssignmentContextFilter;
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
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IRequestService private readonly requestService: IRequestService,
	) {
		super();

		this.experimentsEnabled = experimentsEnabled(configurationService, productService, this.environmentService);

		if (this.experimentsEnabled) {
			this.tasClient = this.setupTASClient();

			// The assignments endpoint is sourced from account entitlements, which load
			// asynchronously. The initial account load resolves the readiness barrier without
			// firing onDidChangeDefaultAccount, so proactively re-check once it is ready, and
			// again whenever the account changes later.
			this.defaultAccountService.getDefaultAccount().then(() => this.recreateTasClientIfEndpointChanged());
			this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => this.recreateTasClientIfEndpointChanged()));

			// Stop the final client's auto-polling and revoke its wrappers when the service is disposed.
			this._register(toDisposable(() => {
				this.revokeCurrentSetup?.();
				WorkbenchAssignmentService.disposeTasClient(this.tasClient);
			}));
		}

		this.contextFilter = this._register(new AssignmentContextFilter(storageService));
		this.telemetry = this._register(new WorkbenchAssignmentServiceTelemetry(telemetryService, productService, this.contextFilter));
		this._register(this.telemetry.onDidUpdateAssignmentContext(() => this._onDidRefetchAssignments.fire()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('experiments.override')) {
				this._onDidRefetchAssignments.fire();
			}
		}));

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

		const client = await this.tasClient;

		// Await the initial network fetch when it has not completed yet, so treatments are
		// available before we read them from memory. `checkCache: true` returns immediately when a
		// value is already cached, otherwise it awaits the initial fetch.
		if (!this.networkInitialized) {
			await client.getTreatmentVariableAsync<T>('vscode', `${ASSIGNMENTS_SCOPE_PREFIX}${name}`, true);
		}

		// Interim workaround: the new TAS assignments endpoint (/api/v1/assignments) namespaces its
		// returned feature variable keys with a `/vscode/` scope, whereas the legacy endpoint and
		// VS Code query treatments by the bare name. Read the scoped key first so the new endpoint
		// wins over the legacy (bare) key when both assign a treatment - matching the behavior once
		// tas-client strips the scope itself. Fall back to the bare key for treatments served only
		// by the legacy endpoint.
		return resolveScopedTreatment<T>(readName => client.getTreatmentVariable<T>('vscode', readName), name);
	}

	/**
	 * Resolves the new TAS assignments API URL from the account entitlements `exp` endpoint,
	 * or `undefined` when no account/endpoint is available.
	 */
	private getAssignmentsEndpoint(): string | undefined {
		const account = this.defaultAccountService.currentDefaultAccount;
		const endpoints = account?.entitlementsData?.endpoints;
		const exp = endpoints?.exp;
		if (!exp) {
			return undefined;
		}
		return `${exp.replace(/\/+$/, '')}/api/v1/assignments`;
	}

	/** Recreates the TAS client when the resolved assignments endpoint has changed. */
	private recreateTasClientIfEndpointChanged(): void {
		if (this._store.isDisposed) {
			return; // the service was disposed before the (async) account load resolved
		}
		const next = this.getAssignmentsEndpoint();
		if (next !== this.assignmentsEndpoint) {
			this.tasClient = this.setupTASClient();
		}
	}

	/**
	 * Transport for the new assignments endpoint, backed by the main-process request service
	 * (avoids renderer CORS). Shape matches tas-client's injectable `assignmentsFetch`.
	 */
	private readonly assignmentsFetch = async (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }): Promise<{ status: number; json(): Promise<unknown> }> => {
		const context = await this.requestService.request({
			type: init.method,
			url,
			data: init.body,
			headers: init.headers,
			disableCache: true,
			callSite: 'assignmentService.assignments',
		}, CancellationToken.None);
		return {
			status: context.res.statusCode ?? 0,
			json: async () => (await asJson(context)) ?? {},
		};
	};

	private async setupTASClient(): Promise<TASClient> {
		this.tasSetupDisposables.clear();

		// Each setup supersedes the previous client; track a generation so a stale client's
		// initialFetch cannot flip networkInitialized for a newer client.
		const generation = ++this.setupGeneration;
		this.networkInitialized = false;

		// Revoke the previous setup's wrappers, then dispose its client. Revoking neutralizes a
		// superseded, still-in-flight client: after replacement it can no longer write the shared
		// memento, emit telemetry, or hit the assignments endpoint. This is needed because the
		// tas-client's dispose() only stops its polling timer, not an already-running fetch.
		this.revokeCurrentSetup?.();
		WorkbenchAssignmentService.disposeTasClient(this.tasClient);

		let revoked = false;
		this.revokeCurrentSetup = () => { revoked = true; };

		// Reference the shared memento/telemetry/fetch lazily (at call time): they are assigned in
		// the constructor body after the initial setupTASClient() call has already started.
		const service = this;

		const keyValueStorage: IKeyValueStorage = {
			getValue<T>(key: string, defaultValue?: T): Promise<T | undefined> {
				return service.keyValueStorage.getValue<T>(key, defaultValue);
			},
			setValue<T>(key: string, value: T): void {
				if (!revoked) {
					service.keyValueStorage.setValue<T>(key, value);
				}
			},
		};

		const telemetry: IExperimentationTelemetry = {
			setSharedProperty(name: string, value: string): void {
				if (!revoked) {
					service.telemetry.setSharedProperty(name, value);
				}
			},
			postEvent(eventName: string, props: Map<string, string>): void {
				if (!revoked) {
					service.telemetry.postEvent(eventName, props);
				}
			},
		};

		const targetPopulation = this.productService.quality === 'stable' ?
			TargetPopulation.Public : (this.productService.quality === 'exploration' ?
				TargetPopulation.Exploration : TargetPopulation.Insiders);

		const filterProvider = new AssignmentFilterProvider(
			this.productService.version,
			this.productService.nameLong,
			this.telemetryService.machineId,
			this.telemetryService.devDeviceId,
			targetPopulation,
			this.productService.date ?? '',
			this.environmentService.isSessionsWindow ? WindowKind.Agents : WindowKind.Editor
		);

		const extensionsFilterProvider = this.instantiationService.createInstance(CopilotAssignmentFilterProvider);
		this.tasSetupDisposables.add(extensionsFilterProvider);
		this.tasSetupDisposables.add(extensionsFilterProvider.onDidChangeFilters(() => this.refetchAssignments()));

		// New TAS assignments API. Its endpoint is sourced from account entitlements and it
		// uses dedicated providers that emit the new userParam key names, so the legacy filter
		// keys never reach it. Its assignments are merged with the legacy provider's results.
		const assignmentsEndpoint = this.getAssignmentsEndpoint();
		this.assignmentsEndpoint = assignmentsEndpoint;
		let assignmentsFilterProviders: IExperimentationFilterProvider[] | undefined;
		if (assignmentsEndpoint) {
			const coreAssignmentsFilterProvider = new VSCodeCoreAssignmentsFilterProvider(
				this.productService.version,
				this.productService.nameLong,
				this.telemetryService.devDeviceId,
				targetPopulation,
				this.productService.date ?? '',
				this.environmentService.isSessionsWindow ? WindowKind.Agents : WindowKind.Editor
			);
			const githubAssignmentsFilterProvider = this.instantiationService.createInstance(GitHubCoreAssignmentsFilterProvider);
			this.tasSetupDisposables.add(githubAssignmentsFilterProvider);
			this.tasSetupDisposables.add(githubAssignmentsFilterProvider.onDidChangeFilters(() => this.refetchAssignments()));
			assignmentsFilterProviders = [coreAssignmentsFilterProvider, githubAssignmentsFilterProvider];
		}

		const tasConfig = this.productService.tasConfig!;

		// tas-client ships as pure ESM; load it via a runtime-resolved URL so bundlers do not
		// rewrite the import (mirrors how the editor loads the `@vscode/diff` module).
		const tasClientUrl = resolveAmdNodeModulePath('tas-client', 'dist/tas-client.min.js');
		const tasClientModule = await import(/* webpackIgnore: true */ /* @vite-ignore */ `${tasClientUrl}`) as typeof import('tas-client');

		// Measure the client-side latency of the first network call to the
		// Treatment Assignment Service. The fetch is triggered by constructing
		// the client, so start timing right before construction to exclude
		// module loading time from the measurement.
		const fetchStopWatch = StopWatch.create();
		const tasClient = new tasClientModule.ExperimentationService({
			filterProviders: [filterProvider, extensionsFilterProvider],
			telemetry,
			storageKey: ASSIGNMENT_STORAGE_KEY,
			keyValueStorage,
			assignmentContextTelemetryPropertyName: tasConfig.assignmentContextTelemetryPropertyName,
			telemetryEventName: tasConfig.telemetryEventName,
			endpoint: tasConfig.endpoint,
			extensionName: 'vscode-core',
			assignmentsEndpoint,
			assignmentsFilterProviders,
			// Route the assignments request through the main-process request service so it is
			// not subject to renderer CORS (parity with how core reaches api.github.com).
			assignmentsFetch: assignmentsEndpoint
				? (url, init) => (revoked ? Promise.resolve({ status: 0, json: async () => ({}) }) : service.assignmentsFetch(url, init))
				: undefined,
			refetchInterval: ASSIGNMENT_REFETCH_INTERVAL,
		});

		await tasClient.initializePromise;
		tasClient.initialFetch.then(() => {
			if (generation !== this.setupGeneration) {
				return; // superseded by a newer setup
			}
			this.networkInitialized = true;
			this.logFetchLatency('initial', fetchStopWatch.elapsed());
		}).catch(() => undefined);

		return tasClient;
	}

	private logFetchLatency(fetchType: 'initial' | 'refetch', durationMs: number): void {
		type TASClientFetchLatencyData = {
			fetchType: string;
			durationMs: number;
		};

		type TASClientFetchLatencyClassification = {
			owner: 'sbatten';
			comment: 'Measures the client-side latency of fetching treatment assignments from the experiment service (TAS)';
			fetchType: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether this was the initial fetch or a refetch' };
			durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds the fetch took to complete' };
		};

		this.telemetryService.publicLog2<TASClientFetchLatencyData, TASClientFetchLatencyClassification>('tasClientFetchLatency', {
			fetchType,
			durationMs
		});
	}

	private async refetchAssignments(): Promise<void> {
		if (!this.tasClient) {
			return; // Setup has not started, assignments will use latest filters
		}

		// Await the client to be setup and the initial fetch to complete
		const tasClient = await this.tasClient;
		await tasClient.initialFetch;

		// Refresh the assignments and measure the network latency of the refetch.
		const refetchStopWatch = StopWatch.create();
		await tasClient.getTreatmentVariableAsync('vscode', 'refresh', false);
		this.logFetchLatency('refetch', refetchStopWatch.elapsed());
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
		this.contextFilter.addFilter(filter);
	}

	/** Stops a TAS client's auto-polling once it resolves. Safe to call with `undefined`. */
	private static disposeTasClient(client: Promise<TASClient> | undefined): void {
		client?.then(c => c.dispose()).catch(() => undefined);
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
