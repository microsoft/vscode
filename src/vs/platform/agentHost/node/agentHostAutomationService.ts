/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { Iterable } from '../../../base/common/iterator.js';
import { autorun, type IReader } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
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
import { nextAutomationCronOccurrence, validateAutomationCron } from '../common/automationCron.js';
import { AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY, migrateLegacyAutomationSessionConfig } from '../common/automationConfig.js';
import { IAgentHostProviderService } from './agentHostProviderService.js';
import { getModelTelemetryContext } from './agentHostTurnTelemetryContext.js';
import { IAgentHostClientConnectionService } from './agentHostClientConnectionService.js';
import { IAgentHostSystemWakeService } from './agentHostSystemWakeService.js';
import { AuthenticateTargetKind } from '../common/state/sessionProtocol.js';
import { getMcpServerCustomizations } from './shared/mcpCustomizationController.js';
import { McpServerStatus, SessionOriginKind, type AutomationSessionOrigin, type McpAuthRequirement } from '../common/state/protocol/channels-session/state.js';
import type { IAgentHostMcpAuthenticationRequest } from '../common/agentHostExtensionProtocol.js';
import { getAgentHostAutomationHistoryState, withAgentHostAutomationHistoryState } from '../common/meta/agentHostAutomationsMeta.js';
import { readMcpServerConnectorName } from '../common/meta/mcpCustomizationMeta.js';

const STORAGE_KEY = 'automations';
const SCHEDULE_CURSORS_META_KEY = 'vscode.scheduleCursors';
const SCHEDULE_RETRY_DELAY_MS = 60_000;
const RUN_HISTORY_PAGE_SIZE = 50;
/** Gives the network time to reconnect after a full wake before resuming a turn that sleep broke; resumes also wait until scheduled work is ready. */
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

interface IStoredSessionCreation {
	readonly run: string;
	readonly session: string;
	readonly provider: string;
}

interface IStoredHistoryDeletion {
	readonly automation: string;
	readonly requestId?: string;
	readonly requestIds?: readonly string[];
	readonly sessions: readonly { readonly session: string; readonly provider?: string }[];
	readonly deletedSessions?: readonly string[];
}

interface IStoredHistoryDeletionReceipt {
	readonly requestId: string;
	readonly automation: string;
	readonly sessions: readonly string[];
}

interface IStoredAutomations {
	readonly version?: 1;
	readonly catalog: IStoredAutomationCatalog;
	readonly runs?: readonly AutomationRunState[];
	readonly runProviders?: Readonly<Record<string, string>>;
	readonly manualRunRequests?: readonly IStoredManualRunRequest[];
	readonly sessionCreations?: readonly IStoredSessionCreation[];
	readonly historyDeletions?: readonly IStoredHistoryDeletion[];
	readonly historyDeletionReceipts?: readonly IStoredHistoryDeletionReceipt[];
}

/** Host-side session operations for executing an Automation's saved template. */
export interface IAgentHostAutomationExecution {
	isSessionTemplateAvailable(template: AutomationSessionTemplate, reader?: IReader): boolean;
	/** Chooses an unused session identity without reserving resources; callers may discard it without cleanup. */
	allocateSession(template: AutomationSessionTemplate): Promise<{ readonly session: URI; readonly provider: string }>;
	createSession(template: AutomationSessionTemplate, run: AutomationRunState, session: URI, activeClient?: SessionActiveClient): Promise<URI>;
	getRecoverableSessionProvider(session: URI, expectedProvider?: string): Promise<string | undefined>;
	deleteSession(session: URI, provider: string): Promise<void>;
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
	deleteAutomation(resource: string, deleteHistory: boolean, legacySessions?: readonly URI[], requestId?: string): Promise<readonly string[]>;
	acknowledgeAutomationDeletion(requestId: string): Promise<void>;
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
	private _sessionCreations = new Map<string, IStoredSessionCreation>();
	private _historyDeletions = new Map<string, IStoredHistoryDeletion>();
	private _historyDeletionReceipts = new Map<string, IStoredHistoryDeletionReceipt>();
	private readonly _historyDeletionPromises = new Map<string, Promise<readonly string[]>>();
	private readonly _runsToRecover = new Set<string>();
	private readonly _recoveringRuns = new Set<string>();
	private readonly _recoveringHistoryDeletions = new Set<string>();
	private _mutationTail: Promise<void> = Promise.resolve();
	private readonly _executionAvailabilityWatcher = this._register(new MutableDisposable());
	private readonly _scheduleTimer = this._register(new MutableDisposable());
	private readonly _resumeAfterWakeTimer = this._register(new MutableDisposable());
	/** Running runs that were active while the machine was not fully awake. */
	private readonly _sleptRuns = new Set<string>();
	/** Runs whose turn failed after the machine slept, waiting for the next resume delay to finish and for scheduled work to be ready. */
	private readonly _resumesAfterWake = new Map<string, { readonly session: string; readonly turnId: string; readonly error: ErrorInfo; delayElapsed: boolean }>();
	/** Runs already resumed after a wake; another failure ends them. */
	private readonly _resumedAfterWake = new Set<string>();
	/** Pending runs that a Run Now request reused; like manual runs, they start without waiting for scheduled work to be ready. */
	private readonly _manuallyRequestedRuns = new Set<string>();
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
		this._sessionCreations = new Map(stored?.sessionCreations?.map(creation => [creation.run, creation]));
		this._historyDeletions = new Map(stored?.historyDeletions?.map(deletion => [deletion.automation, deletion]));
		this._historyDeletionReceipts = new Map(stored?.historyDeletionReceipts?.map(receipt => [receipt.requestId, receipt]));
		for (const run of this._runs.values()) {
			if (run.lifecycle.status === AutomationRunStatus.Running || this._sessionCreations.has(run.resource)) {
				this._runsToRecover.add(run.resource);
			}
		}
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
			if (!this._systemWake.isFullyAwake.read(reader)) {
				this._resumeAfterWakeTimer.clear();
				for (const pending of this._resumesAfterWake.values()) {
					pending.delayElapsed = false;
				}
				for (const run of this._runs.values()) {
					if (run.lifecycle.status === AutomationRunStatus.Running) {
						this._sleptRuns.add(run.resource);
					}
				}
				return;
			}
			// Readiness implies full wake, so it is only tracked while awake.
			if (this._systemWake.isReadyForScheduledWork.read(reader)) {
				void this._resumeTurnsAfterWake();
			}
			this._scheduleResumesAfterWake();
		}));
		this._startup = this._enqueueMutation(async () => {
			if (this._catalog) {
				await this._restoreHistoryOwners();
				await this._customizations.collectGarbage(this._catalog.entries);
			}
		});
		if (this._catalog) {
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
		const historyState = getAgentHostAutomationHistoryState(automation);
		if (historyState) {
			return historyState === 'retained' ? [AutomationOperation.Remove] : [];
		}
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
			this._recoverRuns();
			this._scheduleNext();
		});
	}

	handleAgentsChanged(): void {
		if (!this._catalog) {
			return;
		}
		this._recoverRuns();
		this._scheduleNext();
	}

	getLegacySessionOrigin(session: string, provider: string): AutomationSessionOrigin | undefined {
		for (const run of this._runs.values()) {
			const creation = this._sessionCreations.get(run.resource);
			const owner = this._runProviders.get(run.resource);
			if ((owner === undefined || owner === provider) && (run.primarySession === session || run.sessions.includes(session))
				|| creation?.session === session && creation.provider === provider) {
				return { kind: SessionOriginKind.Automation, automation: run.automation, run: run.resource };
			}
		}
		return undefined;
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
		const automation = this._withInitialScheduleState({
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
		}, new Date(timestamp));
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

		let automation: AutomationEntry = {
			...existing,
			definition: {
				...existing.definition,
				...action.changes,
			},
			modifiedAt: new Date().toISOString(),
		};
		this._validateDefinition(automation.definition);
		if (action.changes.session !== undefined) {
			automation.customizations = await this._customizations.capture(clientId, action.changes.session.customizations, existing, clientId !== undefined && this._clientConnections.isLocalClient(clientId));
		}
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

	/** Runs a catalogue mutation, then reclaims copies it left unreferenced, including those of a rejected capture. */
	private async _collectingCustomizations<T>(mutation: () => Promise<T>): Promise<T> {
		try {
			return await mutation();
		} finally {
			if (this._catalog) {
				await this._customizations.collectGarbage(this._catalog.entries);
			}
		}
	}

	async handleRemove(action: AutomationRemovedAction): Promise<void> {
		await this.deleteAutomation(action.resource, true);
	}

	async deleteAutomation(resource: string, deleteHistory: boolean, legacySessions: readonly URI[] = [], requestId?: string): Promise<readonly string[]> {
		const prepared = await this._enqueueMutation(() => this._prepareAutomationDeletion(resource, deleteHistory, legacySessions, requestId));
		await this._enqueueMutation(() => this._customizations.collectGarbage(this._requireCatalog().entries));
		return prepared ?? this._runHistoryDeletion(resource);
	}

	async acknowledgeAutomationDeletion(requestId: string): Promise<void> {
		await this._enqueueMutation(async () => {
			if (!this._historyDeletionReceipts.has(requestId)) {
				return;
			}
			const receipts = new Map(this._historyDeletionReceipts);
			receipts.delete(requestId);
			await this._persist(this._requireCatalog(), this._runs, this._manualRunRequests, this._runProviders, this._sessionCreations, this._historyDeletions, receipts);
		});
	}

	private async _prepareAutomationDeletion(resource: string, deleteHistory: boolean, legacySessions: readonly URI[], requestId: string | undefined): Promise<readonly string[] | undefined> {
		const catalog = this._requireCatalog();
		const existing = catalog.entries.find(automation => automation.resource === resource);
		if (!existing) {
			const receipt = requestId ? this._historyDeletionReceipts.get(requestId) : undefined;
			return receipt?.automation === resource ? receipt.sessions : [];
		}
		if (this._historyDeletions.has(resource)) {
			if (!deleteHistory) {
				throw new Error(`Automation history deletion is already in progress: ${resource}`);
			}
			const current = this._historyDeletions.get(resource)!;
			const sessions = new Map(current.sessions.map(entry => [entry.session, entry]));
			const deletedSessions = new Set(current.deletedSessions ?? []);
			for (const session of legacySessions) {
				if (!sessions.has(session.toString()) && !deletedSessions.has(session.toString())) {
					sessions.set(session.toString(), { session: session.toString() });
				}
			}
			const requestIds = new Set(this._historyDeletionRequestIds(current));
			if (requestId) {
				requestIds.add(requestId);
			}
			if (sessions.size !== current.sessions.length || requestIds.size !== this._historyDeletionRequestIds(current).length) {
				const deletions = new Map(this._historyDeletions);
				const { requestId: _legacyRequestId, ...stored } = current;
				deletions.set(resource, { ...stored, requestIds: [...requestIds], sessions: [...sessions.values()] });
				await this._persist(catalog, this._runs, this._manualRunRequests, this._runProviders, this._sessionCreations, deletions);
			}
			return undefined;
		}
		this._requireOperation(existing, AutomationOperation.Remove);
		const runs = [...this._runs.values()].filter(run => run.automation === resource);
		if (runs.some(run => !isTerminalLifecycle(run.lifecycle) || this._sessionCreations.has(run.resource))) {
			throw new Error(`Automation has an active or recovering run and cannot be removed: ${resource}`);
		}
		const automation = this._historyOwner(existing, deleteHistory ? 'deleting' : 'retained');
		const deletions = new Map(this._historyDeletions);
		if (deleteHistory) {
			const sessions = new Map<string, { session: string; provider?: string }>();
			for (const run of runs) {
				for (const session of new Set([...run.sessions, ...(run.primarySession ? [run.primarySession] : [])])) {
					sessions.set(session, { session, provider: this._runProviders.get(run.resource) });
				}
			}
			for (const session of legacySessions) {
				if (!sessions.has(session.toString())) {
					sessions.set(session.toString(), { session: session.toString() });
				}
			}
			deletions.set(resource, {
				automation: resource,
				...(requestId ? { requestIds: [requestId] } : {}),
				sessions: [...sessions.values()],
			});
		}
		const next = automationReducer(catalog, { type: ActionType.AutomationSet, automation }, this._log);
		await this._persist(next, this._runs, this._manualRunRequests, this._runProviders, this._sessionCreations, deletions);
		this._catalog = next;
		this._publishAutomation(next, resource);
		logAutomationDeleted(this._telemetryService, this._definitionTelemetry(existing));
		this._scheduleNext();
		return deleteHistory ? undefined : [];
	}

	private _historyOwner(existing: AutomationEntry, state: 'retained' | 'deleting'): AutomationEntry {
		return withRunWindow({
			resource: existing.resource,
			definition: {
				title: existing.definition.title,
				message: { text: '', origin: { kind: MessageKind.Automation } },
				session: {},
				enabled: false,
				triggers: [],
			},
			createdAt: existing.createdAt,
			modifiedAt: existing.modifiedAt,
			operations: state === 'retained' ? [AutomationOperation.Remove] : [],
			runs: [],
			_meta: withAgentHostAutomationHistoryState(undefined, state),
		}, this._runs, RUN_HISTORY_PAGE_SIZE);
	}

	private _runHistoryDeletion(resource: string): Promise<readonly string[]> {
		const current = this._historyDeletionPromises.get(resource);
		if (current) {
			return current;
		}
		const deletion = this._enqueueMutation(() => this._markHistoryDeletionActive(resource)).then(() => this._deleteHistory(resource)).catch(async error => {
			await this._enqueueMutation(() => this._markHistoryDeletionInterrupted(resource));
			throw error;
		}).finally(() => this._historyDeletionPromises.delete(resource));
		this._historyDeletionPromises.set(resource, deletion);
		return deletion;
	}

	private async _markHistoryDeletionActive(resource: string): Promise<void> {
		const catalog = this._requireCatalog();
		const existing = catalog.entries.find(automation => automation.resource === resource);
		if (!existing || !this._historyDeletions.has(resource) || getAgentHostAutomationHistoryState(existing) !== 'deleting' || !existing.operations.includes(AutomationOperation.Remove)) {
			return;
		}
		const automation = {
			...existing,
			operations: existing.operations.filter(operation => operation !== AutomationOperation.Remove),
		};
		const next = automationReducer(catalog, { type: ActionType.AutomationSet, automation }, this._log);
		await this._persist(next, this._runs, this._manualRunRequests, this._runProviders, this._sessionCreations);
		this._catalog = next;
		this._publishAutomation(next, resource);
	}

	private async _markHistoryDeletionInterrupted(resource: string): Promise<void> {
		const catalog = this._requireCatalog();
		const existing = catalog.entries.find(automation => automation.resource === resource);
		if (!existing || !this._historyDeletions.has(resource) || getAgentHostAutomationHistoryState(existing) !== 'deleting') {
			return;
		}
		const automation = {
			...existing,
			operations: [AutomationOperation.Remove],
		};
		const next = automationReducer(catalog, { type: ActionType.AutomationSet, automation }, this._log);
		await this._persist(next, this._runs, this._manualRunRequests, this._runProviders, this._sessionCreations);
		this._catalog = next;
		this._publishAutomation(next, resource);
	}

	private async _deleteHistory(resource: string): Promise<readonly string[]> {
		while (true) {
			let failure: unknown;
			const sessions = await this._enqueueMutation(() => Promise.resolve(this._historyDeletions.get(resource)?.sessions ?? []));
			if (sessions.length === 0) {
				const completed = await this._enqueueMutation(() => this._completeHistoryDeletion(resource));
				if (completed !== undefined) {
					return completed;
				}
				continue;
			}
			for (const entry of sessions) {
				try {
					const session = URI.parse(entry.session);
					const provider = entry.provider ?? await this._execution.getRecoverableSessionProvider(session);
					if (provider === undefined) {
						throw new Error(`Cannot resolve the persisted provider for Automation history session: ${entry.session}`);
					}
					if (entry.provider === undefined) {
						await this._enqueueMutation(() => this._recordHistoryDeletionProvider(resource, entry.session, provider));
					}
					await this._execution.deleteSession(session, provider);
					await this._enqueueMutation(() => this._recordDeletedHistorySession(resource, entry.session));
				} catch (error) {
					this._logService.error(`[AgentHostAutomationService] Failed to delete Automation history session ${entry.session}`, error);
					failure = error;
				}
			}
			if (failure) {
				throw failure;
			}
		}
	}

	private async _recordHistoryDeletionProvider(resource: string, session: string, provider: string): Promise<void> {
		const current = this._historyDeletions.get(resource);
		if (!current) {
			return;
		}
		const deletions = new Map(this._historyDeletions);
		deletions.set(resource, {
			...current,
			sessions: current.sessions.map(candidate => candidate.session === session ? { ...candidate, provider } : candidate),
		});
		await this._persist(this._requireCatalog(), this._runs, this._manualRunRequests, this._runProviders, this._sessionCreations, deletions);
	}

	private async _recordDeletedHistorySession(resource: string, session: string): Promise<void> {
		const current = this._historyDeletions.get(resource);
		if (!current) {
			return;
		}
		const deletions = new Map(this._historyDeletions);
		deletions.set(resource, {
			...current,
			sessions: current.sessions.filter(candidate => candidate.session !== session),
			deletedSessions: [...new Set([...(current.deletedSessions ?? []), session])],
		});
		await this._persist(this._requireCatalog(), this._runs, this._manualRunRequests, this._runProviders, this._sessionCreations, deletions);
	}

	private async _completeHistoryDeletion(resource: string): Promise<readonly string[] | undefined> {
		const deletion = this._historyDeletions.get(resource);
		if (!deletion) {
			return [];
		}
		if (deletion.sessions.length > 0) {
			return undefined;
		}
		const deleted = deletion.deletedSessions ?? [];
		const deletions = new Map(this._historyDeletions);
		deletions.delete(resource);
		const runs = new Map([...this._runs].filter(([, run]) => run.automation !== resource));
		const requests = new Map([...this._manualRunRequests].filter(([, request]) => request.automation !== resource));
		const action: AutomationRemovedAction = { type: ActionType.AutomationRemoved, resource };
		const catalog = automationReducer(this._requireCatalog(), action, this._log);
		const receipts = new Map(this._historyDeletionReceipts);
		for (const requestId of this._historyDeletionRequestIds(deletion)) {
			receipts.set(requestId, { requestId, automation: resource, sessions: deleted });
		}
		await this._persist(catalog, runs, requests, this._runProviders, this._sessionCreations, deletions, receipts);
		this._catalog = catalog;
		this._runs = runs;
		this._manualRunRequests = requests;
		this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, action);
		return deleted;
	}

	private _historyDeletionRequestIds(deletion: IStoredHistoryDeletion): readonly string[] {
		return [...new Set([...(deletion.requestIds ?? []), ...(deletion.requestId ? [deletion.requestId] : [])])];
	}

	private async _restoreHistoryOwners(): Promise<void> {
		let catalog = this._requireCatalog();
		const providers = new Map(this._runProviders);
		for (const run of this._runs.values()) {
			let provider = providers.get(run.resource);
			if (!provider) {
				for (const resource of new Set([...(run.primarySession ? [run.primarySession] : []), ...run.sessions])) {
					try {
						provider = await this._execution.getRecoverableSessionProvider(URI.parse(resource));
					} catch (error) {
						this._logService.warn(`[AgentHostAutomationService] Failed to resolve retained run session ${resource}`, error);
					}
					if (provider) {
						providers.set(run.resource, provider);
						break;
					}
				}
			}
			if (catalog.entries.some(entry => entry.resource === run.automation)) {
				continue;
			}
			const automation = withRunWindow({
				resource: run.automation,
				definition: {
					title: localize('deletedAutomationNameUnavailable', "Deleted automation (name unavailable)"),
					message: { text: '', origin: { kind: MessageKind.Automation } },
					session: { provider },
					enabled: false,
					triggers: [],
				},
				createdAt: run.lifecycle.createdAt,
				modifiedAt: run.lifecycle.createdAt,
				operations: [AutomationOperation.Remove],
				runs: [],
				_meta: withAgentHostAutomationHistoryState(undefined, 'retained'),
			}, this._runs, RUN_HISTORY_PAGE_SIZE);
			catalog = automationReducer(catalog, { type: ActionType.AutomationSet, automation }, this._log);
		}
		if (catalog !== this._catalog || providers.size !== this._runProviders.size) {
			await this._persist(catalog, this._runs, this._manualRunRequests, providers);
			this._catalog = catalog;
			this._stateManager.setAutomationCatalogState(catalog);
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
		return stored;
	}

	private async _persist(
		catalog: AutomationState,
		runs: ReadonlyMap<string, AutomationRunState>,
		manualRunRequests: ReadonlyMap<string, IStoredManualRunRequest>,
		runProviders: ReadonlyMap<string, string> = this._runProviders,
		sessionCreations: ReadonlyMap<string, IStoredSessionCreation> = this._sessionCreations,
		historyDeletions: ReadonlyMap<string, IStoredHistoryDeletion> = this._historyDeletions,
		historyDeletionReceipts: ReadonlyMap<string, IStoredHistoryDeletionReceipt> = this._historyDeletionReceipts,
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
			...(sessionCreations.size > 0 ? { sessionCreations: [...sessionCreations.values()] } : {}),
			...(historyDeletions.size > 0 ? { historyDeletions: [...historyDeletions.values()] } : {}),
			...(historyDeletionReceipts.size > 0 ? { historyDeletionReceipts: [...historyDeletionReceipts.values()] } : {}),
		});
		this._runProviders = nextRunProviders;
		this._sessionCreations = new Map(sessionCreations);
		this._historyDeletions = new Map(historyDeletions);
		this._historyDeletionReceipts = new Map(historyDeletionReceipts);
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
			// Scheduled work waits until the machine is fully awake and reconnected; manual runs are never held.
			const readyForScheduledWork = this._systemWake.isReadyForScheduledWork.read(reader);
			this._startPendingRuns(available, readyForScheduledWork);
			if (!readyForScheduledWork) {
				return;
			}
			const timestamps = available
				.filter(automation => automation.definition.enabled
					&& automation.operations.includes(AutomationOperation.Run)
					&& automation.nextRunAt)
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
		if (!this._systemWake.isReadyForScheduledWork.get()) {
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
		for (const resource of this._runsToRecover) {
			if (this._recoveringRuns.has(resource)) {
				continue;
			}
			this._recoveringRuns.add(resource);
			void this._enqueueMutation(() => this._recoverRun(resource)).catch(error => {
				this._logService.error(`[AgentHostAutomationService] Failed to recover interrupted Automation run: run=${resource}`, error);
			}).finally(() => this._recoveringRuns.delete(resource));
		}
		for (const resource of this._historyDeletions.keys()) {
			if (this._recoveringHistoryDeletions.has(resource)) {
				continue;
			}
			this._recoveringHistoryDeletions.add(resource);
			void this._runHistoryDeletion(resource).catch(error => {
				this._logService.error(`[AgentHostAutomationService] Failed to recover Automation history deletion: ${resource}`, error);
			}).finally(() => this._recoveringHistoryDeletions.delete(resource));
		}
	}

	private async _recoverRun(resource: string, creationError?: unknown): Promise<void> {
		const creation = this._sessionCreations.get(resource);
		if (creation) {
			const session = URI.parse(creation.session);
			const provider = await this._execution.getRecoverableSessionProvider(session, creation.provider);
			if (provider) {
				await this._linkRunSession(resource, creation.session, undefined, provider);
			} else {
				await this._execution.deleteSession(session, creation.provider);
				const creations = new Map(this._sessionCreations);
				creations.delete(resource);
				await this._persist(this._requireCatalog(), this._runs, this._manualRunRequests, this._runProviders, creations);
			}
		}
		await this._failRun(resource, creationError ?? new Error('Automation execution was interrupted before its initial prompt completed.'), creationError === undefined ? 'interrupted' : 'error');
		this._runsToRecover.delete(resource);
	}

	private _startPendingRuns(availableAutomations: readonly AutomationEntry[], includeScheduledRuns: boolean): void {
		for (const run of this._runs.values()) {
			if (run.lifecycle.status !== AutomationRunStatus.Pending) {
				continue;
			}
			if (!includeScheduledRuns && run.origin.kind !== AutomationRunOriginKind.Manual && !this._manuallyRequestedRuns.has(run.resource)) {
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
			if (activeRun.lifecycle.status !== AutomationRunStatus.Pending) {
				return { run: activeRun };
			}
			// Run Now is never held, so it also starts a pending scheduled run that it reuses.
			this._manuallyRequestedRuns.add(activeRun.resource);
			return { run: activeRun, definition: automation.definition };
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
			const allocation = await this._execution.allocateSession(template);
			const running = await this._enqueueMutation(() => this._markRunRunning(initialRun.resource, allocation));
			if (!running) {
				return;
			}
			const configuration = this._configurationTelemetry(definition.session);
			const session = await this._execution.createSession({ ...template, provider: allocation.provider }, running, allocation.session, activeClient);
			const shouldStart = await this._enqueueMutation(() => this._linkRunSession(running.resource, session.toString(), configuration, allocation.provider));
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
				await this._enqueueMutation(async () => {
					if (this._sessionCreations.has(initialRun.resource)) {
						this._runsToRecover.add(initialRun.resource);
						await this._recoverRun(initialRun.resource, error);
					} else {
						await this._failRun(initialRun.resource, error);
					}
				});
			} catch (persistError) {
				this._logService.error(`[AgentHostAutomationService] Failed to persist automation run failure: run=${initialRun.resource}, error=${toErrorMessage(persistError)}`);
			}
		}
	}

	private async _markRunRunning(resource: string, allocation: { readonly session: URI; readonly provider: string }): Promise<AutomationRunState | undefined> {
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
		const creations = new Map(this._sessionCreations);
		creations.set(resource, { run: resource, session: allocation.session.toString(), provider: allocation.provider });
		await this._commitRun(next, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }], undefined, allocation.provider, creations);
		return next;
	}

	private async _linkRunSession(resource: string, session: string, configuration: IAutomationConfigurationTelemetry | undefined, provider: string): Promise<boolean> {
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
		const creations = new Map(this._sessionCreations);
		creations.delete(resource);
		await this._commitRun(next, actions, undefined, provider, creations);
		if (configuration && run.primarySession === undefined && !isTerminalLifecycle(next.lifecycle)) {
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
						this._resumesAfterWake.set(current.resource, { session, turnId: action.turnId, error: action.part.error, delayElapsed: false });
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
		if (this._resumeAfterWakeTimer.value || !this._systemWake.isFullyAwake.get() || !Iterable.some(this._resumesAfterWake.values(), pending => !pending.delayElapsed)) {
			return;
		}
		this._resumeAfterWakeTimer.value = disposableTimeout(() => {
			this._resumeAfterWakeTimer.clear();
			for (const pending of this._resumesAfterWake.values()) {
				pending.delayElapsed = true;
			}
			void this._resumeTurnsAfterWake();
		}, RESUME_AFTER_WAKE_DELAY_MS);
	}

	private async _resumeTurnsAfterWake(): Promise<void> {
		for (const resource of [...this._resumesAfterWake.keys()]) {
			const pending = this._resumesAfterWake.get(resource);
			if (!pending?.delayElapsed || !this._systemWake.isReadyForScheduledWork.get()) {
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
			// Connector-owned servers use the session credential; an MCP token can never satisfy their challenge.
			if (server.state?.kind !== McpServerStatus.AuthRequired || readMcpServerConnectorName(server) !== undefined) {
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
			void this._requestMcpAuthentication(session, { serverName: server.name, auth, target: { kind: AuthenticateTargetKind.McpServer, session, customizationId: server.id } });
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
		sessionCreations: ReadonlyMap<string, IStoredSessionCreation> = this._sessionCreations,
	): Promise<void> {
		const catalog = this._requireCatalog();
		const previous = this._runs.get(run.resource);
		const nextCatalog = this._catalogWithRun(catalog, run);
		const nextRuns = new Map(this._runs);
		nextRuns.set(run.resource, run);
		const runProviders = provider === undefined ? this._runProviders : new Map(this._runProviders).set(run.resource, provider);
		await this._persist(nextCatalog, nextRuns, this._manualRunRequests, runProviders, sessionCreations);
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
			this._manuallyRequestedRuns.delete(run.resource);
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
			provider: session ? getAutomationTelemetryProvider(snapshotProvider ?? this._stateManager.getSessionSummary(session)?.provider) : 'default',
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
		&& (stored['sessionCreations'] === undefined || Array.isArray(stored['sessionCreations']) && stored['sessionCreations'].every(isStoredSessionCreation))
		&& (stored['historyDeletions'] === undefined || Array.isArray(stored['historyDeletions']) && stored['historyDeletions'].every(isStoredHistoryDeletion))
		&& (stored['historyDeletionReceipts'] === undefined || Array.isArray(stored['historyDeletionReceipts']) && stored['historyDeletionReceipts'].every(isStoredHistoryDeletionReceipt))
		&& (stored['manualRunRequests'] === undefined || Array.isArray(stored['manualRunRequests']) && stored['manualRunRequests'].every(isStoredManualRunRequest));
}

function isStoredSessionCreation(value: unknown): value is IStoredSessionCreation {
	if (!value || typeof value !== 'object') {
		return false;
	}
	return 'run' in value && typeof value.run === 'string'
		&& 'session' in value && typeof value.session === 'string'
		&& 'provider' in value && typeof value.provider === 'string' && value.provider.length > 0;
}

function isStoredHistoryDeletion(value: unknown): value is IStoredHistoryDeletion {
	if (!value || typeof value !== 'object') {
		return false;
	}
	return 'automation' in value && typeof value.automation === 'string'
		&& (!('requestId' in value) || value.requestId === undefined || typeof value.requestId === 'string')
		&& (!('requestIds' in value) || value.requestIds === undefined || Array.isArray(value.requestIds) && value.requestIds.every(requestId => typeof requestId === 'string'))
		&& 'sessions' in value && Array.isArray(value.sessions) && value.sessions.every((entry: unknown) =>
			!!entry && typeof entry === 'object'
			&& 'session' in entry && typeof entry.session === 'string'
			&& (!('provider' in entry) || entry.provider === undefined || typeof entry.provider === 'string'))
		&& (!('deletedSessions' in value) || value.deletedSessions === undefined || Array.isArray(value.deletedSessions) && value.deletedSessions.every(session => typeof session === 'string'));
}

function isStoredHistoryDeletionReceipt(value: unknown): value is IStoredHistoryDeletionReceipt {
	return !!value && typeof value === 'object'
		&& 'requestId' in value && typeof value.requestId === 'string'
		&& 'automation' in value && typeof value.automation === 'string'
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
		operations: getAgentHostAutomationHistoryState(automation) === 'deleting' ? [] : hasActiveRun
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
