/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { autorun, type IReader } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { getAutomationTelemetryIsolation, getAutomationTelemetryMode, getAutomationTelemetryPermissionLevel, getAutomationTelemetryProvider, logAutomationCreated, logAutomationUpdated, logAutomationDeleted, logAutomationRunCreated, logAutomationRunCompleted, logAutomationRunStarted, type AutomationRunOutcome, type IAutomationConfigurationTelemetry, type IAutomationDefinitionTelemetry, type IAutomationRunTelemetry } from './agentHostAutomationTelemetry.js';
import { toTelemetryModel } from './agentHostTelemetryReporter.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AgentSession } from '../common/agent.js';
import { readAgentHostAutomationHistoryState, withAgentHostAutomationHistoryState } from '../common/meta/agentHostAutomationsMeta.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { ActionType, type ActionEnvelope, type AutomationCreateRequestedAction, type AutomationRemovedAction, type AutomationRunCancelRequestedAction, type AutomationRunLifecycleChangedAction, type AutomationRunPrimarySessionChangedAction, type AutomationRunSessionSetAction, type AutomationUpdateRequestedAction } from '../common/state/sessionActions.js';
import { AUTOMATION_CATALOG_URI, isDefaultChatUri, parseRequiredSessionUriFromChatUri, type AutomationState, type Message } from '../common/state/sessionState.js';
import { automationReducer } from '../common/state/sessionReducers.js';
import type { AutomationCapabilities } from '../common/state/protocol/common/commands.js';
import type { FetchAutomationRunsParams, FetchAutomationRunsResult, ListAutomationTriggerDefinitionsParams, ListAutomationTriggerDefinitionsResult, RunAutomationParams, RunAutomationResult } from '../common/state/protocol/channels-automation/commands.js';
import { AutomationMisfirePolicy, AutomationOperation, AutomationTriggerKind, type AutomationDefinition, type AutomationEntry, type AutomationSessionTemplate } from '../common/state/protocol/channels-automation/state.js';
import { AutomationRunOriginKind, AutomationRunStatus, type AutomationRunLifecycle, type AutomationRunOrigin, type AutomationRunState, type AutomationRunSummary } from '../common/state/protocol/channels-automation-run/state.js';
import { MessageKind } from '../common/state/protocol/channels-chat/state.js';
import { SessionOriginKind, type SessionOrigin } from '../common/state/protocol/channels-session/state.js';
import { IAgentHostStateManager, type AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';
import { nextAutomationCronOccurrence, validateAutomationCron } from './automationCron.js';
import { AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY, AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY, DEFAULT_AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES, migrateLegacyAutomationSessionConfig } from '../common/automationConfig.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { getModelTelemetryContext } from './agentHostTurnTelemetryContext.js';

const STORAGE_KEY = 'automations';
const SCHEDULE_CURSORS_META_KEY = 'vscode.scheduleCursors';
const SCHEDULE_RETRY_DELAY_MS = 60_000;
const RUN_HISTORY_PAGE_SIZE = 50;

interface IStoredManualRunRequest {
	readonly requestId: string;
	readonly automation: string;
	readonly run: string;
}

interface IStoredAutomationCatalog {
	readonly automations: readonly AutomationEntry[];
	readonly _meta?: Record<string, unknown>;
}

interface IStoredSessionCreation {
	readonly run: string;
	readonly session: string;
}

interface IStoredHistoryDeletion {
	readonly automation: string;
	readonly sessions: readonly string[];
}

interface IStoredAutomations {
	readonly version?: 1;
	readonly catalog: IStoredAutomationCatalog;
	readonly runs?: readonly AutomationRunState[];
	readonly manualRunRequests?: readonly IStoredManualRunRequest[];
	readonly sessionCreations?: readonly IStoredSessionCreation[];
	readonly historyDeletions?: readonly IStoredHistoryDeletion[];
}

/** Host-side session operations for executing an Automation's saved template. */
export interface IAgentHostAutomationExecution {
	isSessionTemplateAvailable(template: AutomationSessionTemplate, reader?: IReader): boolean;
	createSessionResource(template: AutomationSessionTemplate): URI;
	createSession(template: AutomationSessionTemplate, run: AutomationRunState, session: URI): Promise<URI>;
	hasSession(session: URI, run: AutomationRunState): Promise<boolean>;
	deleteSession(session: URI): Promise<void>;
	startSession(session: URI, message: Message): Promise<void>;
	cancelSession(session: URI): Promise<boolean>;
}

export const IAgentHostAutomationService = createDecorator<IAgentHostAutomationService>('agentHostAutomationService');

/** Host-process authority for durable Automation definitions, scheduling, execution, and run lifecycle. */
export interface IAgentHostAutomationService {
	readonly _serviceBrand: undefined;
	readonly capabilities: AutomationCapabilities | undefined;
	readonly isAvailable: boolean;
	handleCreate(action: AutomationCreateRequestedAction): Promise<void>;
	handleUpdate(action: AutomationUpdateRequestedAction): Promise<void>;
	handleRemove(action: AutomationRemovedAction): Promise<void>;
	deleteAutomation(resource: string, deleteHistory: boolean, legacySessions?: readonly URI[]): Promise<void>;
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
	private readonly _legacySessionOrigins = new Map<string, SessionOrigin>();
	private _manualRunRequests = new Map<string, IStoredManualRunRequest>();
	private _sessionCreationByRun = new Map<string, string>();
	private readonly _sessionCreationsInFlight = new Set<string>();
	private _historyDeletionByAutomation = new Map<string, IStoredHistoryDeletion>();
	private _mutationTail: Promise<void> = Promise.resolve();
	private readonly _executionAvailabilityWatcher = this._register(new MutableDisposable());
	private readonly _scheduleTimer = this._register(new MutableDisposable());
	private readonly _runTimeouts = this._register(new DisposableMap<string>());
	private readonly _cancellations = new Map<string, { readonly outcome: 'cancelled' | 'timeout' }>();
	private readonly _runsToRecover = new Set<string>();
	private readonly _runRecoveriesInFlight = new Set<string>();

	constructor(
		private readonly _execution: IAgentHostAutomationExecution,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostStorageService private readonly _storageService: IAgentHostStorageService,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
	) {
		super();
		this._register(toDisposable(() => this._cancellations.clear()));
		const stored = this._load();
		this._runs = new Map(stored?.runs?.map(run => [run.resource, run]));
		this._sessionCreationByRun = new Map(stored?.sessionCreations?.map(creation => [creation.run, creation.session]));
		this._historyDeletionByAutomation = new Map(stored?.historyDeletions?.map(deletion => [deletion.automation, deletion]));
		for (const run of this._runs.values()) {
			const origin: SessionOrigin = { kind: SessionOriginKind.Automation, automation: run.automation, run: run.resource };
			for (const session of run.sessions) {
				this._legacySessionOrigins.set(session, origin);
			}
		}
		this._catalog = stored?.catalog ? {
			entries: restoreHistoryOwners(stored.catalog.automations, this._runs).map(automation => {
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
			const owner = this._catalog?.entries.find(automation => automation.resource === run.automation);
			if (run.lifecycle.status === AutomationRunStatus.Running
				|| this._sessionCreationByRun.has(run.resource)
				|| run.lifecycle.status === AutomationRunStatus.Pending && owner !== undefined && readAgentHostAutomationHistoryState(owner) !== undefined) {
				this._runsToRecover.add(run.resource);
			}
		}
		this._register(this._stateManager.onDidEmitEnvelope(envelope => this._handleEnvelope(envelope)));
		if (this._catalog) {
			void Promise.resolve().then(() => {
				if (!this._store.isDisposed) {
					this._recoverRuns();
					this._recoverHistoryDeletions();
					this._scheduleNext();
				}
			});
		}
	}

	get isAvailable(): boolean {
		return this._catalog !== undefined;
	}

	/** Creation provenance recoverable from the full retained history at startup, before run-window projection. */
	getLegacySessionOrigin(session: string): SessionOrigin | undefined {
		return this._legacySessionOrigins.get(session);
	}

	get capabilities(): AutomationCapabilities | undefined {
		return this.isAvailable ? {
			create: {},
			schedules: {},
			runCancellation: {},
			runHistoryLimit: RUN_HISTORY_PAGE_SIZE,
		} : undefined;
	}

	private _operationsForItem(automation: AutomationEntry): AutomationOperation[] {
		if (readAgentHostAutomationHistoryState(automation) !== undefined) {
			return [AutomationOperation.Remove];
		}
		const hasPendingSession = [...this._sessionCreationByRun.keys()].some(resource => this._runs.get(resource)?.automation === automation.resource);
		return [
			AutomationOperation.Update,
			...(hasPendingSession || automation.runs.some(run => !isTerminalLifecycle(run.lifecycle)) ? [] : [AutomationOperation.Remove]),
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
		this._recoverRuns();
		this._recoverHistoryDeletions();
		if (!this._catalog || !this._isAutomationsEnabled()) {
			return;
		}
		this._scheduleNext();
	}

	async handleCreate(action: AutomationCreateRequestedAction): Promise<void> {
		return this._enqueueMutation(() => this._handleCreate(action));
	}

	private async _handleCreate(action: AutomationCreateRequestedAction): Promise<void> {
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
		const automation = this._withInitialScheduleState({
			resource: action.resource,
			definition,
			runs: [],
			operations: [
				AutomationOperation.Update,
				AutomationOperation.Remove,
				...(this._isAutomationsEnabled() ? [AutomationOperation.Run] : []),
			],
			createdAt: timestamp,
			modifiedAt: timestamp,
		}, new Date(timestamp));
		const next = automationReducer(catalog, { type: ActionType.AutomationSet, automation }, this._log);
		await this._persist(next, this._runs, this._manualRunRequests);
		this._catalog = next;
		this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation });
		logAutomationCreated(this._telemetryService, this._definitionTelemetry(automation));
		this._scheduleNext();
	}

	async handleUpdate(action: AutomationUpdateRequestedAction): Promise<void> {
		return this._enqueueMutation(() => this._handleUpdate(action));
	}

	private async _handleUpdate(action: AutomationUpdateRequestedAction): Promise<void> {
		const catalog = this._requireCatalog();
		const existing = catalog.entries.find(automation => automation.resource === action.resource);
		if (!existing) {
			throw new Error(`Automation not found: ${action.resource}`);
		}
		this._requireOperation(existing, AutomationOperation.Update);

		let automation: AutomationEntry = {
			...existing,
			definition: {
				...existing.definition,
				...action.changes,
			},
			modifiedAt: new Date().toISOString(),
		};
		this._validateDefinition(automation.definition);
		if (action.changes.triggers !== undefined || action.changes.enabled !== undefined) {
			automation = this._withInitialScheduleState(automation, new Date());
		}
		automation = { ...automation, operations: this._operationsForItem(automation) };
		const next = automationReducer(catalog, { type: ActionType.AutomationSet, automation }, this._log);
		await this._persist(next, this._runs, this._manualRunRequests);
		this._catalog = next;
		this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation });
		const enabledChanged = existing.definition.enabled !== automation.definition.enabled;
		const scheduleChanged = !equals(existing.definition.triggers, automation.definition.triggers);
		const sessionConfigurationChanged = !equals(existing.definition.session, automation.definition.session);
		const promptChanged = !equals(existing.definition.message, automation.definition.message);
		const titleChanged = existing.definition.title !== automation.definition.title;
		if (enabledChanged || scheduleChanged || sessionConfigurationChanged || promptChanged || titleChanged) {
			logAutomationUpdated(this._telemetryService, {
				...this._definitionTelemetry(automation),
				enabledChanged,
				scheduleChanged,
				sessionConfigurationChanged,
				promptChanged,
				titleChanged,
			});
		}
		this._scheduleNext();
	}

	async handleRemove(action: AutomationRemovedAction): Promise<void> {
		return this.deleteAutomation(action.resource, true);
	}

	deleteAutomation(resource: string, deleteHistory: boolean, legacySessions: readonly URI[] = []): Promise<void> {
		return this._enqueueMutation(() => this._deleteAutomation(resource, deleteHistory, legacySessions));
	}

	private async _deleteAutomation(resource: string, deleteHistory: boolean, legacySessions: readonly URI[]): Promise<void> {
		const catalog = this._requireCatalog();
		const existing = catalog.entries.find(automation => automation.resource === resource);
		if (!existing) {
			return;
		}
		this._requireOperation(existing, AutomationOperation.Remove);
		if (this._activeRunFor(resource) || [...this._sessionCreationByRun.keys()].some(run => this._runs.get(run)?.automation === resource)) {
			throw new Error(`Automation has an active run and cannot be removed: ${resource}`);
		}
		const historyState = readAgentHostAutomationHistoryState(existing);
		if (!deleteHistory) {
			if (historyState === 'retained') {
				return;
			}
			if (historyState === 'deleting') {
				throw new Error(`Automation history deletion has already started: ${resource}`);
			}
			const retained = withAgentHostAutomationHistoryState({
				...existing,
				definition: { ...existing.definition, enabled: false, triggers: [] },
				nextRunAt: undefined,
				operations: [AutomationOperation.Remove],
			}, 'retained');
			const next = automationReducer(catalog, { type: ActionType.AutomationSet, automation: retained }, this._log);
			await this._persist(next, this._runs, this._manualRunRequests);
			this._catalog = next;
			this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation: retained });
			logAutomationDeleted(this._telemetryService, this._definitionTelemetry(existing));
			this._scheduleNext();
			return;
		}

		const previousDeletion = this._historyDeletionByAutomation.get(resource);
		const deletion: IStoredHistoryDeletion = {
			automation: resource,
			sessions: [...new Set([
				...(previousDeletion?.sessions ?? []),
				...[...this._runs.values()].filter(run => run.automation === resource).flatMap(run => run.sessions),
				...legacySessions.map(session => session.toString()),
			])],
		};
		if (!equals(previousDeletion, deletion)) {
			const deleting = withAgentHostAutomationHistoryState({
				...existing,
				definition: { ...existing.definition, enabled: false, triggers: [] },
				nextRunAt: undefined,
				operations: [AutomationOperation.Remove],
			}, 'deleting');
			const pendingCatalog = automationReducer(catalog, { type: ActionType.AutomationSet, automation: deleting }, this._log);
			const pendingDeletions = new Map(this._historyDeletionByAutomation).set(resource, deletion);
			await this._persist(pendingCatalog, this._runs, this._manualRunRequests, this._sessionCreationByRun, pendingDeletions);
			this._catalog = pendingCatalog;
			this._historyDeletionByAutomation = pendingDeletions;
			this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation: deleting });
			if (historyState === undefined) {
				logAutomationDeleted(this._telemetryService, this._definitionTelemetry(existing));
			}
			this._scheduleNext();
		}
		for (const session of deletion.sessions) {
			await this._execution.deleteSession(URI.parse(session));
		}

		const action: AutomationRemovedAction = { type: ActionType.AutomationRemoved, resource };
		const next = automationReducer(this._requireCatalog(), action, this._log);
		const nextRuns = new Map([...this._runs].filter(([, run]) => run.automation !== resource));
		const nextRequests = new Map([...this._manualRunRequests].filter(([, request]) => request.automation !== resource));
		const nextDeletions = new Map(this._historyDeletionByAutomation);
		nextDeletions.delete(resource);
		await this._persist(next, nextRuns, nextRequests, this._sessionCreationByRun, nextDeletions);
		for (const run of this._runs.values()) {
			if (run.automation === resource) {
				this._stateManager.deleteAutomationRunState(run.resource);
				for (const session of run.sessions) {
					this._legacySessionOrigins.delete(session);
				}
			}
		}
		this._catalog = next;
		this._runs = nextRuns;
		this._manualRunRequests = nextRequests;
		this._historyDeletionByAutomation = nextDeletions;
		this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, action);
		this._scheduleNext();
	}

	private _recoverHistoryDeletions(): void {
		for (const resource of this._historyDeletionByAutomation.keys()) {
			void this.deleteAutomation(resource, true).catch(error => {
				this._logService.error(`[AgentHostAutomationService] Failed to resume Automation history deletion: automation=${resource}`, error);
			});
		}
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
		await this._cancelRun(resource, 'cancelled');
	}

	private async _cancelRun(resource: string, outcome: 'cancelled' | 'timeout'): Promise<void> {
		const cancellation = { outcome };
		try {
			const sessions = await this._enqueueMutation(() => this._prepareCancellation(resource, cancellation));
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
		} catch (error) {
			if (this._cancellations.get(resource) === cancellation) {
				this._cancellations.delete(resource);
			}
			throw error;
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
		return stored;
	}

	private async _persist(
		catalog: AutomationState,
		runs: ReadonlyMap<string, AutomationRunState>,
		manualRunRequests: ReadonlyMap<string, IStoredManualRunRequest>,
		sessionCreations: ReadonlyMap<string, string> = this._sessionCreationByRun,
		historyDeletions: ReadonlyMap<string, IStoredHistoryDeletion> = this._historyDeletionByAutomation,
	): Promise<void> {
		await this._storageService.setAndFlush<IStoredAutomations>(STORAGE_KEY, {
			version: 1,
			catalog: {
				automations: catalog.entries,
				...(catalog._meta ? { _meta: catalog._meta } : {}),
			},
			runs: [...runs.values()],
			manualRunRequests: [...manualRunRequests.values()],
			...(sessionCreations.size > 0 ? { sessionCreations: [...sessionCreations].map(([run, session]) => ({ run, session })) } : {}),
			...(historyDeletions.size > 0 ? { historyDeletions: [...historyDeletions.values()] } : {}),
		});
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
			if (!this._isAutomationsEnabled()) {
				return;
			}
			this._startPendingRuns(available);
			const timestamps = available
				.filter(automation => automation.definition.enabled
					&& automation.operations.includes(AutomationOperation.Run)
					&& automation.nextRunAt
					&& !this._activeRunFor(automation.resource))
				.map(automation => Date.parse(automation.nextRunAt!))
				.filter(timestamp => Number.isFinite(timestamp));
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
			if (!current.operations.includes(AutomationOperation.Run)) {
				continue;
			}
			if (this._activeRunFor(current.resource)) {
				continue;
			}
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
		for (const resource of this._runsToRecover) {
			if (this._runRecoveriesInFlight.has(resource)) {
				continue;
			}
			this._runRecoveriesInFlight.add(resource);
			void this._enqueueMutation(async () => {
				try {
					await this._failRun(resource, new Error('Automation execution was interrupted by an Agent Host restart.'), 'interrupted');
					this._runsToRecover.delete(resource);
				} catch (error) {
					this._logService.error(`[AgentHostAutomationService] Failed to recover interrupted Automation run: run=${resource}, error=${toErrorMessage(error)}`);
				} finally {
					this._runRecoveriesInFlight.delete(resource);
				}
			});
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
			const template = getExecutionSessionTemplate(definition);
			if (!this._execution.isSessionTemplateAvailable(template)) {
				this._logService.info(`[AgentHostAutomationService] Deferring Automation run until its provider is available: run=${initialRun.resource}.`);
				return;
			}
			const sessionResource = this._execution.createSessionResource(template);
			const running = await this._enqueueMutation(() => this._markRunRunning(initialRun.resource, sessionResource));
			if (!running) {
				return;
			}
			this._armRunTimeout(running.resource);
			const configuration = this._configurationTelemetry(definition.session);
			let session: URI;
			this._sessionCreationsInFlight.add(running.resource);
			try {
				session = await this._execution.createSession(template, running, sessionResource);
			} finally {
				this._sessionCreationsInFlight.delete(running.resource);
			}
			if (this._store.isDisposed) {
				return;
			}
			if (session.toString() !== sessionResource.toString()) {
				throw new Error(`Automation session creation returned an unexpected resource: ${session}`);
			}
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
			if (this._store.isDisposed) {
				this._logService.info(`[AgentHostAutomationService] Leaving interrupted session creation for recovery: run=${initialRun.resource}`);
				return;
			}
			try {
				await this._enqueueMutation(() => this._failRun(initialRun.resource, error));
			} catch (persistError) {
				this._logService.error(`[AgentHostAutomationService] Failed to persist automation run failure: run=${initialRun.resource}, error=${toErrorMessage(persistError)}`);
			}
		}
	}

	private async _markRunRunning(resource: string, session: URI): Promise<AutomationRunState | undefined> {
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
		const sessionCreations = new Map(this._sessionCreationByRun).set(resource, session.toString());
		await this._commitRun(next, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }], undefined, sessionCreations);
		return next;
	}

	private async _linkRunSession(resource: string, session: string, configuration: IAutomationConfigurationTelemetry): Promise<boolean> {
		const run = this._runs.get(resource);
		if (!run) {
			throw new Error(`Automation run not found while linking session: ${resource}`);
		}
		const sessions = run.sessions.includes(session) ? run.sessions : [...run.sessions, session];
		const next = { ...run, sessions, primarySession: session };
		const actions: Array<AutomationRunSessionSetAction | AutomationRunPrimarySessionChangedAction> = [];
		if (!run.sessions.includes(session)) {
			actions.push({ type: ActionType.AutomationRunSessionSet, session });
		}
		if (run.primarySession !== session) {
			actions.push({ type: ActionType.AutomationRunPrimarySessionChanged, primarySession: session });
		}
		await this._commitRun(next, actions);
		if (run.primarySession === undefined && !isTerminalLifecycle(next.lifecycle)) {
			logAutomationRunStarted(this._telemetryService, {
				...configuration,
				...this._runTelemetry(next),
			});
		}
		this._logService.info(`[AgentHostAutomationService] Linked automation run to session: run=${resource}, session=${session}.`);
		return !isTerminalLifecycle(next.lifecycle);
	}

	private async _prepareCancellation(resource: string, cancellation: { readonly outcome: 'cancelled' | 'timeout' }): Promise<readonly string[]> {
		this._requireAvailableCatalog();
		const run = this._runs.get(resource);
		if (!run) {
			throw new Error(`Automation run not found: ${resource}`);
		}
		if (isTerminalLifecycle(run.lifecycle)) {
			throw new Error(`Automation run is already terminal: ${resource}`);
		}
		if (run.sessions.length > 0) {
			if (!this._cancellations.has(resource)) {
				this._cancellations.set(resource, cancellation);
			}
			return run.sessions;
		}
		const lifecycle: AutomationRunLifecycle = {
			status: AutomationRunStatus.Cancelled,
			createdAt: run.lifecycle.createdAt,
			...(run.lifecycle.status === AutomationRunStatus.Running ? { startedAt: run.lifecycle.startedAt } : {}),
			completedAt: new Date().toISOString(),
		};
		await this._commitRun({ ...run, lifecycle }, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }], cancellation.outcome);
		return [];
	}

	private async _failRun(resource: string, error: unknown, outcome: AutomationRunOutcome = 'error'): Promise<void> {
		let run = this._runs.get(resource);
		const pendingSession = this._sessionCreationByRun.get(resource);
		if (!run || (isTerminalLifecycle(run.lifecycle) && pendingSession === undefined)) {
			return;
		}
		const actions: Array<AutomationRunLifecycleChangedAction | AutomationRunSessionSetAction | AutomationRunPrimarySessionChangedAction> = [];
		const sessionCreations = new Map(this._sessionCreationByRun);
		if (pendingSession !== undefined && !this._sessionCreationsInFlight.has(resource)) {
			if (await this._execution.hasSession(URI.parse(pendingSession), run)) {
				run = { ...run, sessions: [...new Set([...run.sessions, pendingSession])], primarySession: pendingSession };
				actions.push(
					{ type: ActionType.AutomationRunSessionSet, session: pendingSession },
					{ type: ActionType.AutomationRunPrimarySessionChanged, primarySession: pendingSession },
				);
			} else {
				// The intent also covers a crash before session metadata or registration was written.
				await this._execution.deleteSession(URI.parse(pendingSession));
			}
			sessionCreations.delete(resource);
		}
		const lifecycle: AutomationRunLifecycle = isTerminalLifecycle(run.lifecycle) ? run.lifecycle : {
			status: AutomationRunStatus.Failed,
			createdAt: run.lifecycle.createdAt,
			...(run.lifecycle.status === AutomationRunStatus.Running ? { startedAt: run.lifecycle.startedAt } : {}),
			completedAt: new Date().toISOString(),
			error: {
				errorType: 'automationExecution',
				message: toErrorMessage(error),
			},
		};
		actions.push({ type: ActionType.AutomationRunLifecycleChanged, lifecycle });
		await this._commitRun({ ...run, lifecycle }, actions, outcome, sessionCreations);
		this._logService.error(`[AgentHostAutomationService] Automation run failed: run=${resource}, error=${toErrorMessage(error)}`);
	}

	private _handleEnvelope(envelope: ActionEnvelope): void {
		// A rejected action never reached host state, so it must not finalize a run.
		if (envelope.rejectionReason) {
			return;
		}
		if (!isDefaultChatUri(envelope.channel)) {
			return;
		}
		const action = envelope.action;
		if (action.type !== ActionType.ChatTurnComplete
			&& action.type !== ActionType.ChatTurnCancelled
			&& action.type !== ActionType.ChatError) {
			return;
		}
		const session = parseRequiredSessionUriFromChatUri(envelope.channel);
		const run = [...this._runs.values()].find(candidate => candidate.sessions.includes(session) && !isTerminalLifecycle(candidate.lifecycle));
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
					lifecycle = {
						status: AutomationRunStatus.Cancelled,
						createdAt: current.lifecycle.createdAt,
						...(current.lifecycle.status === AutomationRunStatus.Running ? { startedAt: current.lifecycle.startedAt } : {}),
						completedAt,
					};
					break;
				case ActionType.ChatError:
					lifecycle = {
						status: AutomationRunStatus.Failed,
						createdAt: current.lifecycle.createdAt,
						...(current.lifecycle.status === AutomationRunStatus.Running ? { startedAt: current.lifecycle.startedAt } : {}),
						completedAt,
						error: action.part.error,
					};
					break;
			}
			await this._commitRun({ ...current, lifecycle }, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }]);
		}).catch(error => this._logService.error(`[AgentHostAutomationService] Failed to persist terminal automation lifecycle: run=${run.resource}, error=${toErrorMessage(error)}`));
	}

	private async _commitRun(
		run: AutomationRunState,
		actions: readonly (AutomationRunLifecycleChangedAction | AutomationRunSessionSetAction | AutomationRunPrimarySessionChangedAction)[],
		outcome?: AutomationRunOutcome,
		sessionCreations: ReadonlyMap<string, string> = this._sessionCreationByRun,
	): Promise<void> {
		const catalog = this._requireCatalog();
		const previous = this._runs.get(run.resource);
		const nextRuns = new Map(this._runs);
		nextRuns.set(run.resource, run);
		const nextSessionCreations = new Map(sessionCreations);
		const pendingSession = nextSessionCreations.get(run.resource);
		if (pendingSession !== undefined && run.sessions.includes(pendingSession)) {
			nextSessionCreations.delete(run.resource);
		}
		const nextCatalog = this._catalogWithRun(catalog, run, nextSessionCreations);
		await this._persist(nextCatalog, nextRuns, this._manualRunRequests, nextSessionCreations);
		this._catalog = nextCatalog;
		this._runs = nextRuns;
		this._sessionCreationByRun = nextSessionCreations;
		for (const action of actions) {
			this._stateManager.dispatchServerAction(run.resource, action);
		}
		this._publishAutomation(nextCatalog, run.automation);
		if (isTerminalLifecycle(run.lifecycle)) {
			if (previous && !isTerminalLifecycle(previous.lifecycle)) {
				logAutomationRunCompleted(this._telemetryService, {
					...this._runTelemetry(run),
					outcome: outcome ?? (run.lifecycle.status === AutomationRunStatus.Completed ? 'success' : run.lifecycle.status === AutomationRunStatus.Cancelled ? this._cancellations.get(run.resource)?.outcome ?? 'cancelled' : 'error'),
					durationMs: Date.parse(run.lifecycle.completedAt) - Date.parse(run.lifecycle.createdAt),
				});
			}
			this._cancellations.delete(run.resource);
			this._runTimeouts.deleteAndDispose(run.resource);
			this._scheduleNext();
		}
	}

	private _catalogWithRun(catalog: AutomationState, run: AutomationRunState, sessionCreations: ReadonlyMap<string, string> = this._sessionCreationByRun): AutomationState {
		const existing = catalog.entries.find(automation => automation.resource === run.automation);
		if (!existing) {
			throw new Error(`Automation not found for run: ${run.automation}`);
		}
		const nextRuns = new Map(this._runs);
		nextRuns.set(run.resource, run);
		let automation = withRunSummary(existing, nextRuns);
		if ([...sessionCreations.keys()].some(resource => nextRuns.get(resource)?.automation === automation.resource)) {
			automation = { ...automation, operations: automation.operations.filter(operation => operation !== AutomationOperation.Remove) };
		}
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
		return {
			automationId: run.automation,
			runId: AgentSession.id(run.resource),
			trigger: run.origin.kind === AutomationRunOriginKind.Manual ? 'manual' : run.origin.catchUp ? 'catch_up' : run.origin.scheduledFor ? 'schedule' : 'event',
			runCreatedAt: run.lifecycle.createdAt,
			provider: session ? getAutomationTelemetryProvider(AgentSession.provider(session)) : 'default',
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

	private _activeRunFor(automation: string): AutomationRunState | undefined {
		return [...this._runs.values()].find(run => run.automation === automation && !isTerminalLifecycle(run.lifecycle));
	}

	private _armRunTimeout(resource: string): void {
		const run = this._runs.get(resource);
		if (!run || isTerminalLifecycle(run.lifecycle)) {
			return;
		}
		const configured = this._stateManager.rootState.config?.values[AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY];
		const minutes = typeof configured === 'number' && Number.isFinite(configured) && configured >= 1
			? configured
			: DEFAULT_AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES;
		this._runTimeouts.set(resource, disposableTimeout(() => {
			void this._cancelRun(resource, 'timeout').catch(error => {
				void this._enqueueMutation(() => this._failRun(
					resource,
					new Error(localize('agentHostAutomation.runTimedOut', "Automation run timed out."), { cause: error }),
					'timeout',
				)).catch(persistError => {
					this._logService.error(`[AgentHostAutomationService] Failed to persist timed-out Automation run: run=${resource}, error=${toErrorMessage(persistError)}`);
				});
			});
		}, minutes * 60_000));
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

function restoreHistoryOwners(automations: readonly AutomationEntry[], runs: ReadonlyMap<string, AutomationRunState>): AutomationEntry[] {
	const owners = new Map(automations.map(automation => [automation.resource, automation]));
	for (const run of runs.values()) {
		if (owners.has(run.automation)) {
			continue;
		}
		const session = run.primarySession ?? run.sessions[0];
		owners.set(run.automation, withAgentHostAutomationHistoryState({
			resource: run.automation,
			definition: {
				title: localize('deletedAutomation', "Deleted Automation"),
				message: { text: '', origin: { kind: MessageKind.Automation } },
				session: { provider: session === undefined ? undefined : AgentSession.provider(session) },
				enabled: false,
				triggers: [],
			},
			runs: [],
			operations: [AutomationOperation.Remove],
			createdAt: run.lifecycle.createdAt,
			modifiedAt: run.lifecycle.createdAt,
		}, 'retained'));
	}
	return [...owners.values()];
}

function isStoredAutomations(value: unknown): value is IStoredAutomations {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const stored = value as Record<string, unknown>;
	return (stored['version'] === undefined || stored['version'] === 1)
		&& isStoredAutomationCatalog(stored['catalog'])
		&& (stored['runs'] === undefined || Array.isArray(stored['runs']) && stored['runs'].every(isAutomationRunState))
		&& (stored['manualRunRequests'] === undefined || Array.isArray(stored['manualRunRequests']) && stored['manualRunRequests'].every(isStoredManualRunRequest))
		&& (stored['sessionCreations'] === undefined || Array.isArray(stored['sessionCreations']) && stored['sessionCreations'].every(isStoredSessionCreation))
		&& (stored['historyDeletions'] === undefined || Array.isArray(stored['historyDeletions']) && stored['historyDeletions'].every(isStoredHistoryDeletion));
}

function isStoredSessionCreation(value: unknown): value is IStoredSessionCreation {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	return 'run' in value && typeof value.run === 'string'
		&& 'session' in value && typeof value.session === 'string';
}

function isStoredHistoryDeletion(value: unknown): value is IStoredHistoryDeletion {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	return 'automation' in value && typeof value.automation === 'string'
		&& 'sessions' in value && Array.isArray(value.sessions) && value.sessions.every(session => typeof session === 'string');
}

function isAutomationEntry(value: unknown): value is AutomationEntry {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return typeof record['resource'] === 'string'
		&& typeof record['definition'] === 'object' && record['definition'] !== null && !Array.isArray(record['definition'])
		&& Array.isArray(record['runs'])
		&& Array.isArray(record['operations'])
		&& typeof record['createdAt'] === 'string'
		&& typeof record['modifiedAt'] === 'string';
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
