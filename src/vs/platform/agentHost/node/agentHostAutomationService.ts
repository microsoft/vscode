/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { autorun, type IReader } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IFileService } from '../../files/common/files.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IAgentPluginManager } from '../common/agentPluginManager.js';
import { AgentHostAutomationCustomizations } from './agentHostAutomationCustomizations.js';
import { getAutomationTelemetryIsolation, getAutomationTelemetryMode, getAutomationTelemetryPermissionLevel, getAutomationTelemetryProvider, logAutomationCreated, logAutomationUpdated, logAutomationDeleted, logAutomationRunCreated, logAutomationRunCompleted, logAutomationRunStarted, type AutomationRunOutcome, type IAutomationConfigurationTelemetry, type IAutomationDefinitionTelemetry, type IAutomationRunTelemetry } from './agentHostAutomationTelemetry.js';
import { toTelemetryModel } from './agentHostTelemetryReporter.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AgentSession } from '../common/agent.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { ActionType, type ActionEnvelope, type AutomationCreateRequestedAction, type AutomationRemovedAction, type AutomationRunCancelRequestedAction, type AutomationRunLifecycleChangedAction, type AutomationRunPrimarySessionChangedAction, type AutomationRunSessionSetAction, type AutomationUpdateRequestedAction } from '../common/state/sessionActions.js';
import { AUTOMATION_CATALOG_URI, type AutomationState, type ErrorInfo, type Message, type SessionActiveClient } from '../common/state/sessionState.js';
import { automationReducer } from '../common/state/sessionReducers.js';
import type { AutomationCapabilities } from '../common/state/protocol/common/commands.js';
import type { FetchAutomationRunsParams, FetchAutomationRunsResult, ListAutomationTriggerDefinitionsParams, ListAutomationTriggerDefinitionsResult, RunAutomationParams, RunAutomationResult } from '../common/state/protocol/channels-automation/commands.js';
import { AutomationMisfirePolicy, AutomationOperation, AutomationTriggerKind, type AutomationDefinition, type AutomationEntry, type AutomationSessionTemplate } from '../common/state/protocol/channels-automation/state.js';
import { AutomationRunOriginKind, AutomationRunStatus, type AutomationRunLifecycle, type AutomationRunOrigin, type AutomationRunState, type AutomationRunSummary } from '../common/state/protocol/channels-automation-run/state.js';
import { MessageKind } from '../common/state/protocol/channels-chat/state.js';
import { IAgentHostStateManager, type AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostChatOwnershipService } from './agentHostChatOwnershipService.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';
import { nextAutomationCronOccurrence, validateAutomationCron } from './automationCron.js';
import { AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY, migrateLegacyAutomationSessionConfig } from '../common/automationConfig.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { getModelTelemetryContext } from './agentHostTurnTelemetryContext.js';
import { getAutomationDisableConditionsError, getAutomationAfterDate, isAutomationDisableConditions, isAutomationAfterDateExpired } from '../common/automationDisableConditions.js';
import { IAgentHostClientConnectionService } from './agentHostClientConnectionService.js';
import { IAgentHostSystemWakeService } from './agentHostSystemWakeService.js';
import { getMcpServerCustomizations } from './shared/mcpCustomizationController.js';
import { McpServerStatus, type McpAuthRequirement } from '../common/state/protocol/channels-session/state.js';
import type { IAgentHostMcpAuthenticationRequest } from '../common/agentHostExtensionProtocol.js';

const STORAGE_KEY = 'automations';
const SCHEDULE_CURSORS_META_KEY = 'vscode.scheduleCursors';
const SCHEDULE_RETRY_DELAY_MS = 60_000;
const RUN_HISTORY_PAGE_SIZE = 50;
/** Gives the network time to reconnect after a full wake before resuming a turn that sleep broke. */
const RESUME_AFTER_WAKE_DELAY_MS = 10_000;

interface IStoredManualRunRequest {
	readonly requestId: string;
	readonly automation: string;
	readonly run: string;
}

interface IStoredAutomationCatalog {
	readonly automations: readonly AutomationEntry[];
	readonly _meta?: Record<string, unknown>;
}

interface IStoredAutomations {
	readonly version?: 1;
	readonly catalog: IStoredAutomationCatalog;
	readonly runs?: readonly AutomationRunState[];
	readonly runProviders?: Readonly<Record<string, string>>;
	readonly manualRunRequests?: readonly IStoredManualRunRequest[];
}

/** Host-side session operations for executing an Automation's saved template. */
export interface IAgentHostAutomationExecution {
	isSessionTemplateAvailable(template: AutomationSessionTemplate, reader?: IReader): boolean;
	createSession(template: AutomationSessionTemplate, run: AutomationRunState, activeClient?: SessionActiveClient): Promise<URI>;
	startSession(session: URI, message: Message): Promise<void>;
	cancelSession(session: URI): Promise<boolean>;
	/** Resumes a session's latest turn if it failed with a resumable error; returns whether it resumed. */
	resumeTurn(session: URI, turnId: string): Promise<boolean>;
}

export const IAgentHostAutomationService = createDecorator<IAgentHostAutomationService>('agentHostAutomationService');

/** Host-process authority for durable Automation definitions, scheduling, execution, and run lifecycle. */
export interface IAgentHostAutomationService {
	readonly _serviceBrand: undefined;
	readonly capabilities: AutomationCapabilities | undefined;
	readonly isAvailable: boolean;
	handleCreate(action: AutomationCreateRequestedAction, clientId?: string): Promise<void>;
	handleUpdate(action: AutomationUpdateRequestedAction, clientId?: string): Promise<void>;
	handleRemove(action: AutomationRemovedAction): Promise<void>;
	handleCancel(resource: string, action: AutomationRunCancelRequestedAction): Promise<void>;
	listTriggerDefinitions(params: ListAutomationTriggerDefinitionsParams): Promise<ListAutomationTriggerDefinitionsResult>;
	runAutomation(params: RunAutomationParams): Promise<RunAutomationResult>;
	fetchAutomationRuns(params: FetchAutomationRunsParams): Promise<FetchAutomationRunsResult>;
	handleConfigurationChanged(): Promise<void>;
	handleAgentsChanged(): void;
}

/**
 * Owns durable definitions, schedules, run admission, execution, history, and restart recovery in the host process.
 * Publishes AHP state only after the corresponding mutations are durably persisted.
 */
export class AgentHostAutomationService extends Disposable implements IAgentHostAutomationService {
	declare readonly _serviceBrand: undefined;

	private _catalog: AutomationState | undefined;
	private _runs = new Map<string, AutomationRunState>();
	private _runProviders = new Map<string, string>();
	private _manualRunRequests = new Map<string, IStoredManualRunRequest>();
	private _mutationTail: Promise<void> = Promise.resolve();
	private readonly _executionAvailabilityWatcher = this._register(new MutableDisposable());
	private readonly _scheduleTimer = this._register(new MutableDisposable());
	private readonly _resumeAfterWakeTimer = this._register(new MutableDisposable());
	/** Running runs that were active while the machine was not fully awake. */
	private readonly _sleptRuns = new Set<string>();
	/** Runs whose turn failed after the machine slept, waiting to resume that turn once it is fully awake. */
	private readonly _resumesAfterWake = new Map<string, { readonly session: string; readonly turnId: string; readonly error: ErrorInfo }>();
	/** Runs already resumed after a wake; another failure ends them. */
	private readonly _resumedAfterWake = new Set<string>();
	private _didRecoverRuns = false;
	private readonly _customizations: AgentHostAutomationCustomizations;
	private readonly _startup: Promise<void>;
	private readonly _mcpAuthenticationChallenges = new Map<string, Map<string, Set<string>>>();

	constructor(
		private readonly _execution: IAgentHostAutomationExecution,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostChatOwnershipService private readonly _chatOwnership: IAgentHostChatOwnershipService,
		@IAgentHostStorageService private readonly _storageService: IAgentHostStorageService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@IAgentPluginManager pluginManager: IAgentPluginManager,
		@IFileService fileService: IFileService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IAgentHostClientConnectionService private readonly _clientConnections: IAgentHostClientConnectionService,
		@IAgentHostSystemWakeService private readonly _systemWake: IAgentHostSystemWakeService,
	) {
		super();
		this._customizations = new AgentHostAutomationCustomizations(pluginManager.hostPluginsPath, fileService, this._logService, environmentService.userHome);
		this._register(toDisposable(() => this._mcpAuthenticationChallenges.clear()));
		const stored = this._load();
		this._runs = new Map(stored?.runs?.map(run => [run.resource, run]));
		this._runProviders = new Map(Object.entries(stored?.runProviders ?? {}));
		this._catalog = stored?.catalog ? {
			entries: stored.catalog.automations.map(automation => {
				const restored = withRunWindow(migrateStoredAutomation(automation), this._runs, RUN_HISTORY_PAGE_SIZE);
				return { ...restored, operations: this._operationsForItem(restored) };
			}),
			...(stored.catalog._meta ? { _meta: stored.catalog._meta } : {}),
		} : undefined;
		this._manualRunRequests = new Map(stored?.manualRunRequests?.map(request => [request.requestId, request]));
		if (this._catalog) {
			this._stateManager.setAutomationCatalogState(this._catalog);
		}
		for (const run of this._runs.values()) {
			this._stateManager.setAutomationRunState(run);
		}
		this._register(this._stateManager.onDidEmitEnvelope(envelope => this._handleEnvelope(envelope)));
		this._register(this._stateManager.onDidDeleteSession(session => this._cancelRunsForDeletedSession(session)));
		this._register(autorun(reader => {
			if (this._systemWake.isFullyAwake.read(reader)) {
				this._scheduleResumesAfterWake();
				return;
			}
			this._resumeAfterWakeTimer.clear();
			for (const run of this._runs.values()) {
				if (run.lifecycle.status === AutomationRunStatus.Running) {
					this._sleptRuns.add(run.resource);
				}
			}
		}));
		this._startup = this._enqueueMutation(async () => {
			if (this._catalog) {
				await this._customizations.collectGarbage(this._catalog.entries);
			}
		});
		if (this._catalog && this._isAutomationsEnabled()) {
			void this._startup.then(() => {
				if (!this._store.isDisposed) {
					this._recoverRuns();
					this._scheduleNext();
				}
			});
		}
	}

	get isAvailable(): boolean {
		return this._catalog !== undefined;
	}

	get capabilities(): AutomationCapabilities | undefined {
		return this.isAvailable ? {
			create: {},
			schedules: {},
			customizations: {},
			runCancellation: {},
			runHistoryLimit: RUN_HISTORY_PAGE_SIZE,
		} : undefined;
	}

	private _operationsForItem(automation: AutomationEntry): AutomationOperation[] {
		return [
			AutomationOperation.Update,
			...(automation.runs.some(run => !isTerminalLifecycle(run.lifecycle)) ? [] : [AutomationOperation.Remove]),
			...(this._isAutomationsEnabled() ? [AutomationOperation.Run] : []),
		];
	}

	async handleConfigurationChanged(): Promise<void> {
		return this._enqueueMutation(async () => {
			const catalog = this._requireCatalog();
			const nextCatalog: AutomationState = {
				...catalog,
				entries: catalog.entries.map(automation => ({
					...automation,
					operations: this._operationsForItem(automation),
				})),
			};
			if (!equals(nextCatalog, catalog)) {
				await this._persist(nextCatalog, this._runs, this._manualRunRequests);
				this._catalog = nextCatalog;
				for (const automation of nextCatalog.entries) {
					this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation });
				}
			}
			if (this._isAutomationsEnabled()) {
				this._recoverRuns();
			}
			this._scheduleNext();
		});
	}

	handleAgentsChanged(): void {
		if (!this._catalog || !this._isAutomationsEnabled()) {
			return;
		}
		this._scheduleNext();
	}

	async handleCreate(action: AutomationCreateRequestedAction, clientId?: string): Promise<void> {
		return this._enqueueMutation(() => this._collectingCustomizations(() => this._handleCreate(action, clientId)));
	}

	private async _handleCreate(action: AutomationCreateRequestedAction, clientId?: string): Promise<void> {
		const catalog = this._requireCatalog();
		this._validateAutomationResource(action.resource);
		const definition = action.definition;
		this._validateDefinition(definition);
		const existing = catalog.entries.find(automation => automation.resource === action.resource);
		if (existing && equals(existing.definition, definition)) {
			this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation: existing });
			return;
		}
		if (existing) {
			throw new Error(`Automation already exists: ${action.resource}`);
		}

		const timestamp = new Date().toISOString();
		const customizations = await this._customizations.capture(clientId, definition.session.customizations, undefined, clientId !== undefined && this._clientConnections.isLocalClient(clientId));
		const automation = withDisabledSchedule(this._withInitialScheduleState({
			resource: action.resource,
			definition,
			customizations,
			runs: [],
			operations: [
				AutomationOperation.Update,
				AutomationOperation.Remove,
				...(this._isAutomationsEnabled() ? [AutomationOperation.Run] : []),
			],
			createdAt: timestamp,
			modifiedAt: timestamp,
		}, new Date(timestamp)));
		const next = automationReducer(catalog, { type: ActionType.AutomationSet, automation }, this._log);
		await this._persist(next, this._runs, this._manualRunRequests);
		this._catalog = next;
		this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation });
		logAutomationCreated(this._telemetryService, this._definitionTelemetry(automation));
		this._scheduleNext();
	}

	async handleUpdate(action: AutomationUpdateRequestedAction, clientId?: string): Promise<void> {
		return this._enqueueMutation(() => this._collectingCustomizations(() => this._handleUpdate(action, clientId)));
	}

	private async _handleUpdate(action: AutomationUpdateRequestedAction, clientId?: string): Promise<void> {
		const catalog = this._requireCatalog();
		const existing = catalog.entries.find(automation => automation.resource === action.resource);
		if (!existing) {
			throw new Error(`Automation not found: ${action.resource}`);
		}
		this._requireOperation(existing, AutomationOperation.Update);

		const definition: AutomationDefinition = {
			...existing.definition,
			...action.changes,
		};
		let automation: AutomationEntry = {
			...existing,
			definition,
			modifiedAt: new Date().toISOString(),
		};
		this._validateDefinition(automation.definition);
		if (action.changes.session !== undefined) {
			automation.customizations = await this._customizations.capture(clientId, action.changes.session.customizations, existing, clientId !== undefined && this._clientConnections.isLocalClient(clientId));
		}
		if (action.changes.triggers !== undefined || action.changes.enabled !== undefined) {
			automation = this._withInitialScheduleState(automation, new Date());
		}
		automation = withDisabledSchedule(automation);
		automation = { ...automation, operations: this._operationsForItem(automation) };
		const next = automationReducer(catalog, { type: ActionType.AutomationSet, automation }, this._log);
		await this._persist(next, this._runs, this._manualRunRequests);
		this._catalog = next;
		this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation });
		const enabledChanged = existing.definition.enabled !== automation.definition.enabled;
		const scheduleChanged = !equals(existing.definition.triggers, automation.definition.triggers);
		const disableConditionsChanged = !equals(existing.definition.disableConditions, automation.definition.disableConditions);
		const sessionConfigurationChanged = !equals(existing.definition.session, automation.definition.session);
		const promptChanged = !equals(existing.definition.message, automation.definition.message);
		const titleChanged = existing.definition.title !== automation.definition.title;
		if (enabledChanged || scheduleChanged || disableConditionsChanged || sessionConfigurationChanged || promptChanged || titleChanged) {
			logAutomationUpdated(this._telemetryService, {
				...this._definitionTelemetry(automation),
				enabledChanged,
				scheduleChanged,
				disableConditionsChanged,
				sessionConfigurationChanged,
				promptChanged,
				titleChanged,
			});
		}
		this._scheduleNext();
	}

	/** Runs a catalogue mutation, then reclaims copies it left unreferenced, including those of a rejected capture. */
	private async _collectingCustomizations(mutation: () => Promise<void>): Promise<void> {
		try {
			await mutation();
		} finally {
			if (this._catalog) {
				await this._customizations.collectGarbage(this._catalog.entries);
			}
		}
	}

	async handleRemove(action: AutomationRemovedAction): Promise<void> {
		return this._enqueueMutation(() => this._collectingCustomizations(() => this._handleRemove(action)));
	}

	private async _handleRemove(action: AutomationRemovedAction): Promise<void> {
		const catalog = this._requireCatalog();
		const existing = catalog.entries.find(automation => automation.resource === action.resource);
		if (!existing) {
			return;
		}
		this._requireOperation(existing, AutomationOperation.Remove);
		if (existing.runs.some(run => !isTerminalLifecycle(run.lifecycle))) {
			throw new Error(`Automation has an active run and cannot be removed: ${action.resource}`);
		}
		const next = automationReducer(catalog, action, this._log);
		await this._persist(next, this._runs, this._manualRunRequests);
		this._catalog = next;
		this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, action);
		logAutomationDeleted(this._telemetryService, this._definitionTelemetry(existing));
		this._scheduleNext();
	}

	async listTriggerDefinitions(_params: ListAutomationTriggerDefinitionsParams): Promise<ListAutomationTriggerDefinitionsResult> {
		this._requireAvailableCatalog();
		return { items: [] };
	}

	async runAutomation(params: RunAutomationParams): Promise<RunAutomationResult> {
		const created = await this._enqueueMutation(() => this._createManualRun(params));
		if (created.definition) {
			void this._startRun(created.run, created.definition);
		}
		return { resource: created.run.resource };
	}

	async fetchAutomationRuns(params: FetchAutomationRunsParams): Promise<FetchAutomationRunsResult> {
		return this._enqueueMutation(() => this._fetchAutomationRuns(params));
	}

	private async _fetchAutomationRuns(params: FetchAutomationRunsParams): Promise<FetchAutomationRunsResult> {
		const catalog = this._requireAvailableCatalog();
		const automation = catalog.entries.find(candidate => candidate.resource === params.automation);
		if (!automation) {
			throw new Error(`Automation not found: ${params.automation}`);
		}
		if (!automation.runsNextCursor) {
			return {};
		}
		if (params.cursor !== undefined && params.cursor !== automation.runsNextCursor) {
			throw new Error(`Automation run-history cursor is no longer available: ${params.cursor}`);
		}
		const terminalLimit = Number(automation.runsNextCursor) + RUN_HISTORY_PAGE_SIZE;
		const updated = withRunWindow(automation, this._runs, terminalLimit);
		const next = automationReducer(catalog, { type: ActionType.AutomationSet, automation: updated }, this._log);
		await this._persist(next, this._runs, this._manualRunRequests);
		this._catalog = next;
		this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation: updated });
		return {};
	}

	async handleCancel(resource: string, _action: AutomationRunCancelRequestedAction): Promise<void> {
		const sessions = await this._enqueueMutation(() => this._prepareCancellation(resource));
		if (sessions.length === 0) {
			return;
		}
		const results = await Promise.allSettled(sessions.map(session => this._execution.cancelSession(URI.parse(session))));
		let accepted = false;
		for (const result of results) {
			if (result.status === 'rejected') {
				throw result.reason;
			}
			accepted ||= result.value;
		}
		if (!accepted) {
			const terminal = await this._enqueueMutation(async () => {
				const run = this._runs.get(resource);
				return run === undefined || isTerminalLifecycle(run.lifecycle);
			});
			if (!terminal) {
				throw new Error(`Automation run cancellation was not accepted: ${resource}`);
			}
		}
	}

	private _load(): IStoredAutomations | undefined {
		if (this._storageService.loadError) {
			this._logService.error('[AgentHostAutomationService] Agent Host storage failed to load; automation state and execution remain unavailable.');
			return undefined;
		}
		const stored = this._storageService.get<IStoredAutomations>(STORAGE_KEY);
		if (stored === undefined) {
			return { catalog: { automations: [] } };
		}
		if (!isStoredAutomations(stored)) {
			this._logService.error('[AgentHostAutomationService] Automation storage is invalid; automation execution remains unavailable until it is recovered.');
			return undefined;
		}
		const automations = stored.catalog.automations.map(migrateStoredRunLimits);
		if (automations.every((automation, index) => automation === stored.catalog.automations[index])) {
			return stored;
		}
		const migrated = { ...stored, catalog: { ...stored.catalog, automations } };
		this._logService.warn('[AgentHostAutomationService] Removed obsolete stored run limits and usage. Previously capped automations remain disabled until explicitly enabled.');
		this._storageService.set(STORAGE_KEY, migrated);
		return migrated;
	}

	private async _persist(
		catalog: AutomationState,
		runs: ReadonlyMap<string, AutomationRunState>,
		manualRunRequests: ReadonlyMap<string, IStoredManualRunRequest>,
		runProviders: ReadonlyMap<string, string> = this._runProviders,
	): Promise<void> {
		const nextRunProviders = new Map([...runProviders].filter(([resource]) => runs.has(resource)));
		await this._storageService.setAndFlush<IStoredAutomations>(STORAGE_KEY, {
			version: 1,
			catalog: {
				automations: catalog.entries,
				...(catalog._meta ? { _meta: catalog._meta } : {}),
			},
			runs: [...runs.values()],
			...(nextRunProviders.size > 0 ? { runProviders: Object.fromEntries(nextRunProviders) } : {}),
			manualRunRequests: [...manualRunRequests.values()],
		});
		this._runProviders = nextRunProviders;
	}

	private _requireCatalog(): AutomationState {
		if (!this._catalog) {
			throw new Error('Automation storage is unavailable and must be recovered before automations can run.');
		}
		return this._catalog;
	}

	private _requireAvailableCatalog(): AutomationState {
		const catalog = this._requireCatalog();
		if (!this._isAutomationsEnabled()) {
			throw new Error('Automations are disabled.');
		}
		return catalog;
	}

	private _isAutomationsEnabled(): boolean {
		return this._stateManager.rootState.config?.values[AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY] === true;
	}

	private _withInitialScheduleState(automation: AutomationEntry, now: Date): AutomationEntry {
		const cursors: Record<string, string> = {};
		if (automation.definition.enabled) {
			for (const trigger of automation.definition.triggers) {
				if (trigger.kind === AutomationTriggerKind.Schedule) {
					cursors[trigger.id] = nextAutomationCronOccurrence(trigger.schedule.expression, trigger.schedule.timeZone, now).toISOString();
				}
			}
		}
		return {
			...automation,
			nextRunAt: earliestCursor(cursors),
			_meta: withScheduleCursors(automation._meta, cursors),
		};
	}

	private _scheduleNext(): void {
		this._executionAvailabilityWatcher.clear();
		this._scheduleTimer.clear();
		if (!this._catalog || !this._isAutomationsEnabled()) {
			return;
		}
		const catalog = this._catalog;
		this._executionAvailabilityWatcher.value = autorun(reader => {
			const available = catalog.entries.filter(automation => this._execution.isSessionTemplateAvailable(getExecutionSessionTemplate(automation.definition), reader));
			this._scheduleTimer.clear();
			// Work started while the machine sleeps or is in a background wake stalls when it
			// sleeps again, so due schedules and pending runs wait until it is fully awake.
			if (!this._isAutomationsEnabled() || !this._systemWake.isFullyAwake.read(reader)) {
				return;
			}
			this._startPendingRuns(available);
			const timestamps = available
				.filter(automation => automation.definition.enabled
					&& automation.operations.includes(AutomationOperation.Run)
					&& automation.nextRunAt)
				.map(automation => Date.parse(automation.nextRunAt!))
				.filter(timestamp => Number.isFinite(timestamp));
			for (const automation of catalog.entries) {
				if (automation.definition.enabled) {
					const date = getAutomationAfterDate(automation.definition.disableConditions);
					if (date !== undefined) {
						timestamps.push(Date.parse(date));
					}
				}
			}
			if (timestamps.length === 0) {
				return;
			}
			const delay = Math.min(Math.max(0, Math.min(...timestamps) - Date.now()), 0x7fffffff);
			this._scheduleTimer.value = disposableTimeout(() => {
				void this._enqueueMutation(() => this._claimDueRuns()).then(() => {
					this._scheduleNext();
				}, error => {
					this._logService.error(`[AgentHostAutomationService] Failed to claim due Automation schedules: ${toErrorMessage(error)}`);
					this._scheduleTimer.value = disposableTimeout(() => this._scheduleNext(), SCHEDULE_RETRY_DELAY_MS);
				});
			}, delay);
		});
	}

	private async _claimDueRuns(): Promise<readonly { readonly run: AutomationRunState; readonly definition: AutomationDefinition }[]> {
		const catalog = this._requireAvailableCatalog();
		if (!this._systemWake.isFullyAwake.get()) {
			return [];
		}
		const now = new Date();
		const nowTimestamp = now.getTime();
		const createdAt = now.toISOString();
		let nextCatalog = catalog;
		const nextRuns = new Map(this._runs);
		const changed = new Map<string, AutomationEntry>();
		const claimed: { run: AutomationRunState; definition: AutomationDefinition }[] = [];

		for (const current of catalog.entries) {
			if (!current.definition.enabled) {
				continue;
			}
			if (isAutomationDisabledByCondition(current, nowTimestamp)) {
				const nextAutomation = disableScheduledRuns(current);
				nextCatalog = automationReducer(nextCatalog, { type: ActionType.AutomationSet, automation: nextAutomation }, this._log);
				changed.set(nextAutomation.resource, nextAutomation);
				continue;
			}
			if (!current.operations.includes(AutomationOperation.Run)) {
				continue;
			}
			// Each occurrence gets its own run so a stalled run can never block later occurrences.
			if (!this._execution.isSessionTemplateAvailable(getExecutionSessionTemplate(current.definition))) {
				continue;
			}
			const cursors = { ...readScheduleCursors(current._meta) };
			let automation = current;
			let claimedForAutomation = false;
			for (const trigger of current.definition.triggers) {
				if (trigger.kind !== AutomationTriggerKind.Schedule) {
					continue;
				}
				let scheduledFor = cursors[trigger.id] ? new Date(cursors[trigger.id]) : undefined;
				if (!scheduledFor || !Number.isFinite(scheduledFor.getTime())) {
					scheduledFor = nextAutomationCronOccurrence(trigger.schedule.expression, trigger.schedule.timeZone, now);
				} else if (scheduledFor.getTime() <= nowTimestamp) {
					const catchUp = nowTimestamp - scheduledFor.getTime() >= 60_000;
					if (!catchUp || trigger.misfirePolicy !== AutomationMisfirePolicy.Skip) {
						if (!claimedForAutomation) {
							const run = this._createRunState(automation.resource, {
								kind: AutomationRunOriginKind.Trigger,
								triggerId: trigger.id,
								scheduledFor: scheduledFor.toISOString(),
								...(catchUp ? { catchUp: true } : {}),
							}, createdAt);
							nextRuns.set(run.resource, run);
							automation = withRunSummary(automation, nextRuns);
							claimed.push({ run, definition: automation.definition });
							claimedForAutomation = true;
						}
						// A sibling trigger already claimed this Automation this
						// tick. Coalesce this past-due firing into the earlier
						// one and let its cursor roll forward below, so we don't
						// re-fire on the next tick.
					}
					scheduledFor = nextAutomationCronOccurrence(trigger.schedule.expression, trigger.schedule.timeZone, now);
				}
				cursors[trigger.id] = scheduledFor.toISOString();
			}
			const nextAutomation: AutomationEntry = {
				...automation,
				nextRunAt: earliestCursor(cursors),
				_meta: withScheduleCursors(automation._meta, cursors),
			};
			if (!equals(nextAutomation, current)) {
				nextCatalog = automationReducer(nextCatalog, { type: ActionType.AutomationSet, automation: nextAutomation }, this._log);
				changed.set(nextAutomation.resource, nextAutomation);
			}
		}

		if (changed.size === 0) {
			return [];
		}
		await this._persist(nextCatalog, nextRuns, this._manualRunRequests);
		this._catalog = nextCatalog;
		this._runs = nextRuns;
		for (const { run, definition } of claimed) {
			this._stateManager.setAutomationRunState(run);
			logAutomationRunCreated(this._telemetryService, {
				...this._runTelemetry(run),
				...this._configurationTelemetry(definition.session),
			});
		}
		for (const automation of changed.values()) {
			this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation });
		}
		this._logService.info(`[AgentHostAutomationService] Claimed due Automation schedules: runs=${claimed.length}, automations=${changed.size}.`);
		return claimed;
	}

	private _recoverRuns(): void {
		if (this._didRecoverRuns) {
			return;
		}
		this._didRecoverRuns = true;
		for (const run of this._runs.values()) {
			if (run.lifecycle.status === AutomationRunStatus.Running) {
				void this._enqueueMutation(() => this._failRun(run.resource, new Error('Automation execution was interrupted by an Agent Host restart.'), 'interrupted')).catch(error => {
					this._logService.error(`[AgentHostAutomationService] Failed to recover interrupted Automation run: run=${run.resource}, error=${toErrorMessage(error)}`);
				});
			}
		}
	}

	private _startPendingRuns(availableAutomations: readonly AutomationEntry[]): void {
		for (const run of this._runs.values()) {
			if (run.lifecycle.status !== AutomationRunStatus.Pending) {
				continue;
			}
			const automation = availableAutomations.find(candidate => candidate.resource === run.automation);
			if (automation?.operations.includes(AutomationOperation.Run)) {
				void this._startRun(run, automation.definition);
			}
		}
	}

	private async _createManualRun(params: RunAutomationParams): Promise<{ readonly run: AutomationRunState; readonly definition?: AutomationDefinition }> {
		const catalog = this._requireAvailableCatalog();
		if (params.requestId.trim().length === 0) {
			throw new Error('Automation run requestId must not be empty.');
		}
		const previousRequest = this._manualRunRequests.get(params.requestId);
		if (previousRequest) {
			if (previousRequest.automation !== params.automation) {
				throw new Error(`Automation run requestId is already used for another automation: ${params.requestId}`);
			}
			const previousRun = this._runs.get(previousRequest.run);
			if (!previousRun) {
				throw new Error(`Automation run requestId refers to a missing run: ${params.requestId}`);
			}
			return { run: previousRun };
		}

		const automation = catalog.entries.find(candidate => candidate.resource === params.automation);
		if (!automation) {
			throw new Error(`Automation not found: ${params.automation}`);
		}
		this._requireOperation(automation, AutomationOperation.Run);
		const activeRun = this._activeRunFor(automation.resource);
		if (activeRun) {
			return { run: activeRun };
		}
		const createdAt = new Date().toISOString();
		const run = this._createRunState(automation.resource, { kind: AutomationRunOriginKind.Manual }, createdAt);
		const nextCatalog = this._catalogWithRun(catalog, run);
		const nextRuns = new Map(this._runs);
		nextRuns.set(run.resource, run);
		const nextRequests = new Map(this._manualRunRequests);
		nextRequests.set(params.requestId, { requestId: params.requestId, automation: params.automation, run: run.resource });
		await this._persist(nextCatalog, nextRuns, nextRequests);
		this._catalog = nextCatalog;
		this._runs = nextRuns;
		this._manualRunRequests = nextRequests;
		this._stateManager.setAutomationRunState(run);
		this._publishAutomation(nextCatalog, automation.resource);
		logAutomationRunCreated(this._telemetryService, {
			...this._runTelemetry(run),
			...this._configurationTelemetry(automation.definition.session),
		});
		this._logService.info(`[AgentHostAutomationService] Created durable manual automation run: automation=${automation.resource}, run=${run.resource}.`);
		return { run, definition: automation.definition };
	}

	private _createRunState(automation: string, origin: AutomationRunOrigin, createdAt: string): AutomationRunState {
		return {
			resource: URI.from({ scheme: 'ahp-automation-run', path: `/${generateUuid()}` }).toString(),
			automation,
			origin,
			lifecycle: { status: AutomationRunStatus.Pending, createdAt },
			sessions: [],
		};
	}

	private async _startRun(initialRun: AutomationRunState, definition: AutomationDefinition): Promise<void> {
		try {
			await this._startup;
			const entry = this._catalog?.entries.find(candidate => candidate.resource === initialRun.automation);
			if (!entry) {
				throw new Error(`Automation not found: ${initialRun.automation}`);
			}
			definition = entry.definition;
			const sessionTemplate = getExecutionSessionTemplate(definition);
			const template = { ...sessionTemplate, agent: this._customizations.resolveAgent(sessionTemplate, entry.customizations ?? []) };
			const activeClient = this._customizations.toRunActiveClient(entry);
			if (!this._execution.isSessionTemplateAvailable(template)) {
				this._logService.info(`[AgentHostAutomationService] Deferring Automation run until its provider is available: run=${initialRun.resource}.`);
				return;
			}
			const running = await this._enqueueMutation(() => this._markRunRunning(initialRun.resource));
			if (!running) {
				return;
			}
			const configuration = this._configurationTelemetry(definition.session);
			const session = await this._execution.createSession(template, running, activeClient);
			const shouldStart = await this._enqueueMutation(() => this._linkRunSession(running.resource, session.toString(), configuration));
			if (!shouldStart) {
				await this._execution.cancelSession(session);
				return;
			}
			// Clients restore the last turn's model configuration, not the SDK's creation defaults.
			const message: Message = definition.message.model === undefined && template.model !== undefined
				? { ...definition.message, model: template.model }
				: definition.message;
			await this._execution.startSession(session, message);
		} catch (error) {
			try {
				await this._enqueueMutation(() => this._failRun(initialRun.resource, error));
			} catch (persistError) {
				this._logService.error(`[AgentHostAutomationService] Failed to persist automation run failure: run=${initialRun.resource}, error=${toErrorMessage(persistError)}`);
			}
		}
	}

	private async _markRunRunning(resource: string): Promise<AutomationRunState | undefined> {
		const run = this._runs.get(resource);
		if (!run || run.lifecycle.status !== AutomationRunStatus.Pending) {
			return undefined;
		}
		const lifecycle: AutomationRunLifecycle = {
			status: AutomationRunStatus.Running,
			createdAt: run.lifecycle.createdAt,
			startedAt: new Date().toISOString(),
		};
		const next = { ...run, lifecycle };
		await this._commitRun(next, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }]);
		return next;
	}

	private async _linkRunSession(resource: string, session: string, configuration: IAutomationConfigurationTelemetry): Promise<boolean> {
		const run = this._runs.get(resource);
		if (!run) {
			throw new Error(`Automation run not found while linking session: ${resource}`);
		}
		const sessionProvider = this._stateManager.getSessionSummary(session)?.provider ?? AgentSession.provider(session);
		const sessions = run.sessions.includes(session) ? run.sessions : [...run.sessions, session];
		const next = { ...run, sessions, primarySession: session };
		const actions: Array<AutomationRunSessionSetAction | AutomationRunPrimarySessionChangedAction> = [];
		if (!run.sessions.includes(session)) {
			actions.push({ type: ActionType.AutomationRunSessionSet, session });
		}
		if (run.primarySession !== session) {
			actions.push({ type: ActionType.AutomationRunPrimarySessionChanged, primarySession: session });
		}
		await this._commitRun(next, actions, undefined, sessionProvider);
		if (run.primarySession === undefined && !isTerminalLifecycle(next.lifecycle)) {
			logAutomationRunStarted(this._telemetryService, {
				...configuration,
				...this._runTelemetry(next),
			});
		}
		this._logService.info(`[AgentHostAutomationService] Linked automation run to session: run=${resource}, session=${session}.`);
		return !isTerminalLifecycle(next.lifecycle);
	}

	private async _prepareCancellation(resource: string): Promise<readonly string[]> {
		this._requireAvailableCatalog();
		const run = this._runs.get(resource);
		if (!run) {
			throw new Error(`Automation run not found: ${resource}`);
		}
		if (isTerminalLifecycle(run.lifecycle)) {
			throw new Error(`Automation run is already terminal: ${resource}`);
		}
		// A run waiting to resume after a wake has no active turn to cancel.
		if (run.sessions.length > 0 && !this._resumesAfterWake.has(resource)) {
			return run.sessions;
		}
		const lifecycle = toCancelledLifecycle(run.lifecycle, new Date().toISOString());
		await this._commitRun({ ...run, lifecycle }, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }]);
		return [];
	}

	private async _failRun(resource: string, error: unknown, outcome: AutomationRunOutcome = 'error'): Promise<void> {
		const run = this._runs.get(resource);
		if (!run || isTerminalLifecycle(run.lifecycle)) {
			return;
		}
		const lifecycle: AutomationRunLifecycle = {
			status: AutomationRunStatus.Failed,
			createdAt: run.lifecycle.createdAt,
			...(run.lifecycle.status === AutomationRunStatus.Running ? { startedAt: run.lifecycle.startedAt } : {}),
			completedAt: new Date().toISOString(),
			error: {
				errorType: 'automationExecution',
				message: toErrorMessage(error),
			},
		};
		await this._commitRun({ ...run, lifecycle }, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }], outcome);
		this._logService.error(`[AgentHostAutomationService] Automation run failed: run=${resource}, error=${toErrorMessage(error)}`);
	}

	private _handleEnvelope(envelope: ActionEnvelope): void {
		// A rejected action never reached host state, so it must not finalize a run.
		if (envelope.rejectionReason) {
			return;
		}
		switch (envelope.action.type) {
			case ActionType.SessionCustomizationsChanged:
			case ActionType.SessionCustomizationUpdated:
			case ActionType.SessionCustomizationRemoved:
			case ActionType.SessionMcpServerStateChanged:
				this._handleMcpAuthentication(envelope.channel);
				break;
		}
		const action = envelope.action;
		if (action.type === ActionType.ChatTurnStarted || action.type === ActionType.ChatTurnResume) {
			// The chat is running again, whether this service or a user restarted it.
			// This service stops the run waiting before it resumes, so a run still waiting here was restarted by a user and has used its one retry.
			if (this._resumesAfterWake.size > 0) {
				const restarted = this._activeRunForChat(envelope.channel);
				if (restarted && this._resumesAfterWake.delete(restarted.resource)) {
					this._resumedAfterWake.add(restarted.resource);
				}
			}
			return;
		}
		if (action.type !== ActionType.ChatTurnComplete
			&& action.type !== ActionType.ChatTurnCancelled
			&& action.type !== ActionType.ChatError) {
			return;
		}
		const run = this._activeRunForChat(envelope.channel);
		if (!run) {
			return;
		}
		void this._enqueueMutation(async () => {
			const current = this._runs.get(run.resource);
			if (!current || isTerminalLifecycle(current.lifecycle)) {
				return;
			}
			const completedAt = new Date().toISOString();
			let lifecycle: AutomationRunLifecycle;
			switch (action.type) {
				case ActionType.ChatTurnComplete:
					lifecycle = {
						status: AutomationRunStatus.Completed,
						createdAt: current.lifecycle.createdAt,
						startedAt: current.lifecycle.status === AutomationRunStatus.Running ? current.lifecycle.startedAt : completedAt,
						completedAt,
					};
					break;
				case ActionType.ChatTurnCancelled:
					lifecycle = toCancelledLifecycle(current.lifecycle, completedAt);
					break;
				case ActionType.ChatError: {
					// A turn that broke because the machine slept may succeed once it is fully awake, so resume it once.
					const session = current.sessions.find(candidate => this._chatOwnership.getDefaultChat(candidate) === envelope.channel);
					if (session && action.part.resumable === true && !this._resumedAfterWake.has(current.resource)
						&& (this._sleptRuns.has(current.resource) || !this._systemWake.isFullyAwake.get())) {
						this._resumesAfterWake.set(current.resource, { session, turnId: action.turnId, error: action.part.error });
						this._logService.info(`[AgentHostAutomationService] Automation run will resume once the machine is fully awake: run=${current.resource}, turnId=${action.turnId}.`);
						this._scheduleResumesAfterWake();
						return;
					}
					lifecycle = toFailedLifecycle(current.lifecycle, completedAt, action.part.error);
					break;
				}
			}
			await this._commitRun({ ...current, lifecycle }, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }]);
		}).catch(error => this._logService.error(`[AgentHostAutomationService] Failed to persist terminal automation lifecycle: run=${run.resource}, error=${toErrorMessage(error)}`));
	}

	/** Matches the run's recorded sessions to their default chats, so a run still completes after its session left the registry. */
	private _activeRunForChat(chat: string): AutomationRunState | undefined {
		return [...this._runs.values()].find(candidate => !isTerminalLifecycle(candidate.lifecycle)
			&& candidate.sessions.some(session => this._chatOwnership.getDefaultChat(session) === chat));
	}

	private _scheduleResumesAfterWake(): void {
		if (this._resumesAfterWake.size === 0 || this._resumeAfterWakeTimer.value || !this._systemWake.isFullyAwake.get()) {
			return;
		}
		this._resumeAfterWakeTimer.value = disposableTimeout(() => {
			this._resumeAfterWakeTimer.clear();
			void this._resumeTurnsAfterWake();
		}, RESUME_AFTER_WAKE_DELAY_MS);
	}

	private async _resumeTurnsAfterWake(): Promise<void> {
		for (const resource of [...this._resumesAfterWake.keys()]) {
			const pending = this._resumesAfterWake.get(resource);
			if (!pending || !this._systemWake.isFullyAwake.get()) {
				continue;
			}
			this._resumesAfterWake.delete(resource);
			this._resumedAfterWake.add(resource);
			let resumed = false;
			try {
				resumed = await this._execution.resumeTurn(URI.parse(pending.session), pending.turnId);
			} catch (error) {
				this._logService.error(`[AgentHostAutomationService] Failed to resume automation turn after wake: run=${resource}, error=${toErrorMessage(error)}`);
			}
			if (resumed) {
				this._logService.info(`[AgentHostAutomationService] Resumed automation turn after wake: run=${resource}, turnId=${pending.turnId}.`);
				continue;
			}
			await this._enqueueMutation(async () => {
				const current = this._runs.get(resource);
				if (current && !isTerminalLifecycle(current.lifecycle)) {
					const lifecycle = toFailedLifecycle(current.lifecycle, new Date().toISOString(), pending.error);
					await this._commitRun({ ...current, lifecycle }, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }]);
				}
			}).catch(error => this._logService.error(`[AgentHostAutomationService] Failed to persist terminal automation lifecycle: run=${resource}, error=${toErrorMessage(error)}`));
		}
	}

	/** A deleted session can no longer report a terminal turn, so its run would otherwise remain active forever. */
	private _cancelRunsForDeletedSession(session: string): void {
		for (const run of this._runs.values()) {
			if (isTerminalLifecycle(run.lifecycle) || !run.sessions.includes(session)) {
				continue;
			}
			void this._enqueueMutation(async () => {
				const current = this._runs.get(run.resource);
				if (!current || isTerminalLifecycle(current.lifecycle)) {
					return;
				}
				const lifecycle = toCancelledLifecycle(current.lifecycle, new Date().toISOString());
				await this._commitRun({ ...current, lifecycle }, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }]);
			}).catch(error => this._logService.error(`[AgentHostAutomationService] Failed to cancel automation run after its session was deleted: run=${run.resource}, error=${toErrorMessage(error)}`));
		}
	}

	private _handleMcpAuthentication(session: string): void {
		if (!this.isAvailable || !this._isAutomationsEnabled() || this._store.isDisposed) {
			this._mcpAuthenticationChallenges.clear();
			return;
		}
		const runSessions = new Set([...this._runs.values()].flatMap(run => run.sessions));
		for (const trackedSession of this._mcpAuthenticationChallenges.keys()) {
			if (!runSessions.has(trackedSession)) {
				this._mcpAuthenticationChallenges.delete(trackedSession);
			}
		}
		if (!runSessions.has(session)) {
			return;
		}
		const servers = getMcpServerCustomizations(this._stateManager.getSessionState(session)?.customizations ?? []);
		const challenges = this._mcpAuthenticationChallenges.get(session) ?? new Map<string, Set<string>>();
		this._mcpAuthenticationChallenges.set(session, challenges);
		for (const serverName of challenges.keys()) {
			if (!servers.some(server => server.name === serverName && server.state?.kind === McpServerStatus.AuthRequired)) {
				challenges.delete(serverName);
			}
		}
		for (const server of servers) {
			if (server.state?.kind !== McpServerStatus.AuthRequired) {
				continue;
			}
			const { resource, requiredScopes, reason, oauthClient, description } = server.state;
			const auth: McpAuthRequirement = {
				resource, reason,
				...(requiredScopes !== undefined ? { requiredScopes } : {}),
				...(oauthClient !== undefined ? { oauthClient } : {}),
				...(description !== undefined ? { description } : {}),
			};
			const key = JSON.stringify([resource, requiredScopes, reason, oauthClient?.clientId]);
			const attempted = challenges.get(server.name) ?? new Set<string>();
			if (attempted.has(key)) {
				continue;
			}
			attempted.add(key);
			challenges.set(server.name, attempted);
			void this._requestMcpAuthentication(session, { serverName: server.name, auth });
		}
		if (challenges.size > 0) {
			this._mcpAuthenticationChallenges.set(session, challenges);
		} else {
			this._mcpAuthenticationChallenges.delete(session);
		}
	}

	private async _requestMcpAuthentication(session: string, request: IAgentHostMcpAuthenticationRequest): Promise<void> {
		try {
			const authenticated = await this._clientConnections.requestMcpAuthentication(request);
			this._logService.info(`[AgentHostAutomationService] MCP authentication completed: session=${session}, server=${request.serverName}, authenticated=${authenticated}.`);
		} catch (error) {
			this._logService.info(`[AgentHostAutomationService] MCP authentication failed: session=${session}, server=${request.serverName}, error=${toErrorMessage(error)}`);
		}
	}

	private async _commitRun(
		run: AutomationRunState,
		actions: readonly (AutomationRunLifecycleChangedAction | AutomationRunSessionSetAction | AutomationRunPrimarySessionChangedAction)[],
		outcome?: AutomationRunOutcome,
		provider?: string,
	): Promise<void> {
		const catalog = this._requireCatalog();
		const previous = this._runs.get(run.resource);
		const nextCatalog = this._catalogWithRun(catalog, run);
		const nextRuns = new Map(this._runs);
		nextRuns.set(run.resource, run);
		const runProviders = provider === undefined ? this._runProviders : new Map(this._runProviders).set(run.resource, provider);
		await this._persist(nextCatalog, nextRuns, this._manualRunRequests, runProviders);
		this._catalog = nextCatalog;
		this._runs = nextRuns;
		for (const action of actions) {
			this._stateManager.dispatchServerAction(run.resource, action);
		}
		this._publishAutomation(nextCatalog, run.automation);
		if (isTerminalLifecycle(run.lifecycle)) {
			if (previous && !isTerminalLifecycle(previous.lifecycle)) {
				logAutomationRunCompleted(this._telemetryService, {
					...this._runTelemetry(run),
					outcome: outcome ?? (run.lifecycle.status === AutomationRunStatus.Completed ? 'success' : run.lifecycle.status === AutomationRunStatus.Cancelled ? 'cancelled' : 'error'),
					durationMs: Date.parse(run.lifecycle.completedAt) - Date.parse(run.lifecycle.createdAt),
				});
			}
			this._sleptRuns.delete(run.resource);
			this._resumesAfterWake.delete(run.resource);
			this._resumedAfterWake.delete(run.resource);
			this._scheduleNext();
		}
	}

	private _catalogWithRun(catalog: AutomationState, run: AutomationRunState): AutomationState {
		const existing = catalog.entries.find(automation => automation.resource === run.automation);
		if (!existing) {
			throw new Error(`Automation not found for run: ${run.automation}`);
		}
		const nextRuns = new Map(this._runs);
		nextRuns.set(run.resource, run);
		const automation = withRunSummary(existing, nextRuns);
		return automationReducer(catalog, { type: ActionType.AutomationSet, automation }, this._log);
	}

	private _configurationTelemetry(template: AutomationSessionTemplate): IAutomationConfigurationTelemetry {
		const agent = this._providerService.resolveProvider(template.provider);
		const modelId = template.model?.id;
		const modelKind = modelId && agent ? getModelTelemetryContext(agent, modelId).modelTelemetryKind : modelId === 'auto' ? 'trusted' : 'unknown';
		const folderCount = template.workingDirectories?.length ?? 0;
		return {
			provider: getAutomationTelemetryProvider(template.provider),
			model: toTelemetryModel(modelId, modelKind),
			modelSelectionKind: modelId === undefined ? 'default' : modelId === 'auto' ? 'auto' : 'explicit',
			mode: getAutomationTelemetryMode(template.config?.[SessionConfigKey.Mode]),
			permissionLevel: getAutomationTelemetryPermissionLevel(template.config?.[SessionConfigKey.AutoApprove]),
			isolationMode: folderCount > 0 ? getAutomationTelemetryIsolation(template.config?.[SessionConfigKey.Isolation]) : 'none',
			targetKind: folderCount > 0 ? 'workspace' : 'quickChat',
			folderCount,
			hasCustomAgent: template.agent !== undefined,
		};
	}

	private _definitionTelemetry(automation: AutomationEntry): IAutomationDefinitionTelemetry {
		return {
			...this._configurationTelemetry(automation.definition.session),
			automationId: automation.resource,
			enabled: automation.definition.enabled,
			scheduleKind: automation.definition.triggers.length === 0 ? 'manual' : 'scheduled',
		};
	}

	private _runTelemetry(run: AutomationRunState): IAutomationRunTelemetry {
		const session = run.primarySession;
		const snapshotProvider = this._runProviders.get(run.resource);
		return {
			automationId: run.automation,
			runId: AgentSession.id(run.resource),
			trigger: run.origin.kind === AutomationRunOriginKind.Manual ? 'manual' : run.origin.catchUp ? 'catch_up' : run.origin.scheduledFor ? 'schedule' : 'event',
			runCreatedAt: run.lifecycle.createdAt,
			provider: session ? getAutomationTelemetryProvider(snapshotProvider ?? this._stateManager.getSessionSummary(session)?.provider ?? AgentSession.provider(session)) : 'default',
			agentSessionId: session ? AgentSession.id(session) : undefined,
			sessionCreated: run.sessions.length > 0,
		};
	}

	private _publishAutomation(catalog: AutomationState, resource: string): void {
		const automation = catalog.entries.find(candidate => candidate.resource === resource);
		if (automation) {
			this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation });
		}
	}

	private _validateAutomationResource(resource: string): void {
		if (URI.parse(resource).scheme !== 'ahp-automation') {
			throw new Error(`Automation resource must use the ahp-automation scheme: ${resource}`);
		}
	}

	private _validateDefinition(definition: AutomationDefinition): void {
		if (definition.title.trim().length === 0) {
			throw new Error('Automation title must not be empty.');
		}
		const conditionsError = getAutomationDisableConditionsError(definition.disableConditions);
		if (conditionsError) {
			throw new Error(conditionsError);
		}
		if (definition.message.origin.kind !== MessageKind.Automation) {
			throw new Error('Automation message must have an automation origin.');
		}
		const triggerIds = new Set<string>();
		for (const trigger of definition.triggers) {
			if (trigger.id.trim().length === 0 || triggerIds.has(trigger.id)) {
				throw new Error(`Automation trigger ids must be non-empty and unique: ${trigger.id}`);
			}
			triggerIds.add(trigger.id);
			if (trigger.kind === AutomationTriggerKind.Event) {
				throw new Error(`Automation event trigger type is not available: ${trigger.type}`);
			}
			validateAutomationCron(trigger.schedule.expression, trigger.schedule.timeZone);
		}
	}

	private _requireOperation(automation: AutomationEntry, operation: AutomationOperation): void {
		if (!automation.operations.includes(operation)) {
			throw new Error(`Automation operation '${operation}' is not available: ${automation.resource}`);
		}
	}

	/** Returns the newest non-terminal run, since scheduled runs of one Automation may overlap. */
	private _activeRunFor(automation: string): AutomationRunState | undefined {
		let newest: AutomationRunState | undefined;
		for (const run of this._runs.values()) {
			if (run.automation === automation && !isTerminalLifecycle(run.lifecycle)
				&& (!newest || Date.parse(run.lifecycle.createdAt) >= Date.parse(newest.lifecycle.createdAt))) {
				newest = run;
			}
		}
		return newest;
	}

	private _enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
		const next = this._mutationTail.then(mutation);
		this._mutationTail = next.then(() => undefined, () => undefined);
		return next;
	}

	private readonly _log = (message: string) => this._logService.warn(`[AgentHostAutomationService] ${message}`);
}

function getExecutionSessionTemplate(definition: AutomationDefinition): AutomationSessionTemplate {
	return definition.message.model === undefined
		? definition.session
		: { ...definition.session, model: definition.message.model };
}

function isAutomationDisabledByCondition(automation: AutomationEntry, now = Date.now()): boolean {
	return isAutomationAfterDateExpired(automation.definition.disableConditions, now);
}

function withDisabledSchedule(automation: AutomationEntry): AutomationEntry {
	return automation.definition.enabled && isAutomationDisabledByCondition(automation)
		? disableScheduledRuns(automation)
		: automation;
}

function disableScheduledRuns(automation: AutomationEntry): AutomationEntry {
	return {
		...automation,
		definition: { ...automation.definition, enabled: false },
		nextRunAt: undefined,
		_meta: withScheduleCursors(automation._meta, {}),
	};
}

function isStoredAutomationCatalog(value: unknown): value is IStoredAutomationCatalog {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const catalog = value as Record<string, unknown>;
	const automations = catalog['automations'];
	const meta = catalog['_meta'];
	return Array.isArray(automations)
		&& automations.every(isAutomationEntry)
		&& (meta === undefined || !!meta && typeof meta === 'object' && !Array.isArray(meta));
}

function migrateStoredAutomation(automation: AutomationEntry): AutomationEntry {
	const session = automation.definition.session;
	const config = migrateLegacyAutomationSessionConfig(session.provider, session.config);
	if (config === session.config) {
		return automation;
	}
	return {
		...automation,
		definition: {
			...automation.definition,
			session: { ...session, config },
		},
	};
}

function migrateStoredRunLimits(automation: AutomationEntry): AutomationEntry {
	const hadRunLimit = automation.definition.disableConditions?.some(condition => condition.kind === 'afterRuns');
	if (!hadRunLimit && !Object.hasOwn(automation, 'runCount')) {
		return automation;
	}
	const migrated = { ...automation };
	delete migrated.runCount;
	if (!hadRunLimit) {
		return migrated;
	}
	return disableScheduledRuns({
		...migrated,
		definition: {
			...migrated.definition,
			disableConditions: migrated.definition.disableConditions?.filter(condition => condition.kind === 'afterDate'),
		},
	});
}

function isStoredAutomations(value: unknown): value is IStoredAutomations {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const stored = value as Record<string, unknown>;
	const runProviders = stored['runProviders'];
	return (stored['version'] === undefined || stored['version'] === 1)
		&& isStoredAutomationCatalog(stored['catalog'])
		&& (stored['runs'] === undefined || Array.isArray(stored['runs']) && stored['runs'].every(isAutomationRunState))
		&& (runProviders === undefined || !!runProviders && typeof runProviders === 'object' && !Array.isArray(runProviders)
			&& Object.values(runProviders).every(provider => typeof provider === 'string' && provider.length > 0))
		&& (stored['manualRunRequests'] === undefined || Array.isArray(stored['manualRunRequests']) && stored['manualRunRequests'].every(isStoredManualRunRequest));
}

function isAutomationEntry(value: unknown): value is AutomationEntry {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return typeof record['resource'] === 'string'
		&& isAutomationDefinition(record['definition'])
		&& Array.isArray(record['runs'])
		&& Array.isArray(record['operations'])
		&& typeof record['createdAt'] === 'string'
		&& typeof record['modifiedAt'] === 'string';
}

function isAutomationDefinition(value: unknown): value is AutomationDefinition {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const definition = value as Record<string, unknown>;
	const disableConditions = definition['disableConditions'];
	if (disableConditions === undefined || isAutomationDisableConditions(disableConditions)) {
		return true;
	}
	if (!Array.isArray(disableConditions)) {
		return false;
	}
	const legacyLimits = disableConditions.filter(condition => condition?.kind === 'afterRuns');
	return legacyLimits.length === 1
		&& typeof legacyLimits[0].max === 'number'
		&& Number.isSafeInteger(legacyLimits[0].max)
		&& legacyLimits[0].max > 0
		&& isAutomationDisableConditions(disableConditions.filter(condition => condition?.kind !== 'afterRuns'));
}

function isAutomationRunState(value: unknown): value is AutomationRunState {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const run = value as Record<string, unknown>;
	return typeof run['resource'] === 'string'
		&& typeof run['automation'] === 'string'
		&& typeof run['origin'] === 'object' && run['origin'] !== null
		&& typeof run['lifecycle'] === 'object' && run['lifecycle'] !== null
		&& Array.isArray(run['sessions'])
		&& run['sessions'].every(session => typeof session === 'string')
		&& (run['primarySession'] === undefined || typeof run['primarySession'] === 'string');
}

function isStoredManualRunRequest(value: unknown): value is IStoredManualRunRequest {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const request = value as Record<string, unknown>;
	return typeof request['requestId'] === 'string'
		&& typeof request['automation'] === 'string'
		&& typeof request['run'] === 'string';
}

function toRunSummary(run: AutomationRunState): AutomationRunSummary {
	return {
		resource: run.resource,
		automation: run.automation,
		origin: run.origin,
		lifecycle: run.lifecycle,
		primarySession: run.primarySession,
		sessionCount: run.sessions.length,
		_meta: run._meta,
	};
}

function withRunSummary(automation: AutomationEntry, allRuns: ReadonlyMap<string, AutomationRunState>): AutomationEntry {
	const terminalLimit = Math.max(RUN_HISTORY_PAGE_SIZE, automation.runs.filter(candidate => isTerminalLifecycle(candidate.lifecycle)).length);
	const window = withRunWindow(automation, allRuns, terminalLimit);
	const runs = window.runs;
	const hasActiveRun = runs.some(candidate => !isTerminalLifecycle(candidate.lifecycle));
	return {
		...window,
		operations: hasActiveRun
			? automation.operations.filter(operation => operation !== AutomationOperation.Remove)
			: withOperation(automation.operations, AutomationOperation.Remove),
	};
}

function withRunWindow(automation: AutomationEntry, allRuns: ReadonlyMap<string, AutomationRunState>, terminalLimit: number): AutomationEntry {
	const summaries = [...allRuns.values()]
		.filter(run => run.automation === automation.resource)
		.map(toRunSummary)
		.sort((first, second) => Date.parse(second.lifecycle.createdAt) - Date.parse(first.lifecycle.createdAt));
	const active = summaries.filter(summary => !isTerminalLifecycle(summary.lifecycle));
	const terminal = summaries.filter(summary => isTerminalLifecycle(summary.lifecycle));
	const runs = [...active, ...terminal.slice(0, terminalLimit)]
		.sort((first, second) => Date.parse(second.lifecycle.createdAt) - Date.parse(first.lifecycle.createdAt));
	return {
		...automation,
		runs,
		runsNextCursor: terminal.length > terminalLimit ? String(terminalLimit) : undefined,
	};
}

function isTerminalLifecycle(lifecycle: AutomationRunLifecycle): lifecycle is Extract<AutomationRunLifecycle, { status: AutomationRunStatus.Completed | AutomationRunStatus.Failed | AutomationRunStatus.Cancelled }> {
	return lifecycle.status === AutomationRunStatus.Completed
		|| lifecycle.status === AutomationRunStatus.Failed
		|| lifecycle.status === AutomationRunStatus.Cancelled;
}

function toCancelledLifecycle(lifecycle: AutomationRunLifecycle, completedAt: string): AutomationRunLifecycle {
	return {
		status: AutomationRunStatus.Cancelled,
		createdAt: lifecycle.createdAt,
		...(lifecycle.status === AutomationRunStatus.Running ? { startedAt: lifecycle.startedAt } : {}),
		completedAt,
	};
}

function toFailedLifecycle(lifecycle: AutomationRunLifecycle, completedAt: string, error: ErrorInfo): AutomationRunLifecycle {
	return {
		status: AutomationRunStatus.Failed,
		createdAt: lifecycle.createdAt,
		...(lifecycle.status === AutomationRunStatus.Running ? { startedAt: lifecycle.startedAt } : {}),
		completedAt,
		error,
	};
}

function withOperation(operations: readonly AutomationOperation[], operation: AutomationOperation): AutomationOperation[] {
	return operations.includes(operation) ? [...operations] : [...operations, operation];
}

function readScheduleCursors(meta: Record<string, unknown> | undefined): Readonly<Record<string, string>> {
	const value = meta?.[SCHEDULE_CURSORS_META_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}
	const cursors: Record<string, string> = {};
	for (const [triggerId, cursor] of Object.entries(value)) {
		if (typeof cursor === 'string') {
			cursors[triggerId] = cursor;
		}
	}
	return cursors;
}

function withScheduleCursors(meta: Record<string, unknown> | undefined, cursors: Readonly<Record<string, string>>): Record<string, unknown> | undefined {
	const result = { ...meta };
	if (Object.keys(cursors).length === 0) {
		delete result[SCHEDULE_CURSORS_META_KEY];
	} else {
		result[SCHEDULE_CURSORS_META_KEY] = cursors;
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

function earliestCursor(cursors: Readonly<Record<string, string>>): string | undefined {
	return Object.values(cursors)
		.filter(cursor => Number.isFinite(Date.parse(cursor)))
		.sort((first, second) => Date.parse(first) - Date.parse(second))[0];
}
