/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { disposableTimeout } from '../../../base/common/async.js';
import { Disposable, DisposableMap, MutableDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { ActionType, type ActionEnvelope, type AutomationCreateRequestedAction, type AutomationRemovedAction, type AutomationRunCancelRequestedAction, type AutomationRunLifecycleChangedAction, type AutomationRunPrimarySessionChangedAction, type AutomationRunSessionSetAction, type AutomationUpdateRequestedAction } from '../common/state/sessionActions.js';
import { AUTOMATION_CATALOG_URI, isDefaultChatUri, parseRequiredSessionUriFromChatUri, type AutomationState, type Message } from '../common/state/sessionState.js';
import { automationReducer } from '../common/state/sessionReducers.js';
import type { AutomationCapabilities } from '../common/state/protocol/common/commands.js';
import type { FetchAutomationRunsParams, FetchAutomationRunsResult, ListAutomationTriggerDefinitionsParams, ListAutomationTriggerDefinitionsResult, RunAutomationParams, RunAutomationResult } from '../common/state/protocol/channels-automation/commands.js';
import { AutomationMisfirePolicy, AutomationOperation, AutomationTriggerKind, type AutomationDefinition, type AutomationEntry, type AutomationSessionTemplate } from '../common/state/protocol/channels-automation/state.js';
import { AutomationRunOriginKind, AutomationRunStatus, type AutomationRunLifecycle, type AutomationRunOrigin, type AutomationRunState, type AutomationRunSummary } from '../common/state/protocol/channels-automation-run/state.js';
import { MessageKind } from '../common/state/protocol/channels-chat/state.js';
import { IAgentHostStateManager, type AgentHostStateManager } from './agentHostStateManager.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';
import { nextAutomationCronOccurrence, validateAutomationCron } from './automationCron.js';
import { AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY, AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY, AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY } from '../common/automationMigration.js';
import { IAgentPluginManager } from '../common/agentPluginManager.js';
import { AUTOMATION_VIRTUAL_CLIENT_ID, automationCustomizationScopeKey, automationCustomizationSnapshotRevision, isAutomationCustomizationScopeSnapshot, readAutomationCustomizationSnapshotPublication, readAutomationCustomizationSnapshotReference, withAutomationCustomizationSnapshotReference, type IAutomationCustomizationScopeSnapshot, type IAutomationCustomizationSnapshotPublication } from '../common/meta/automationCustomizationSnapshotMeta.js';
import { isAgentHostLegacyAutomationImportPending } from '../common/meta/automationMeta.js';
import type { SessionActiveClient } from '../common/state/protocol/channels-session/state.js';

const STORAGE_KEY = 'automations';
const SCHEDULE_CURSORS_META_KEY = 'vscode.scheduleCursors';
const SCHEDULE_RETRY_DELAY_MS = 60_000;
const RUN_HISTORY_PAGE_SIZE = 50;
const DEFAULT_RUN_TIMEOUT_MINUTES = 30;

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
	readonly manualRunRequests?: readonly IStoredManualRunRequest[];
	readonly customizationScopes?: unknown;
	readonly runCustomizationSnapshots?: unknown;
	readonly migration?: {
		readonly status: 'complete';
		readonly completedAt: string;
	};
}

interface IStoredAutomationCustomizationScope {
	readonly key: string;
	readonly snapshot: IAutomationCustomizationScopeSnapshot;
}

interface IStoredRunCustomizationSnapshot {
	readonly run: string;
	readonly snapshot: IAutomationCustomizationScopeSnapshot;
}

interface IPreparedAutomationDefinition extends IDisposable {
	readonly definition: AutomationDefinition;
	readonly customizationScopes: ReadonlyMap<string, IAutomationCustomizationScopeSnapshot>;
}

export interface IAgentHostAutomationExecution {
	isSessionTemplateAvailable(template: AutomationSessionTemplate): boolean;
	createSession(template: AutomationSessionTemplate, run: AutomationRunState, activeClient: SessionActiveClient | undefined): Promise<URI>;
	startSession(session: URI, message: Message): Promise<void>;
	cancelSession(session: URI): Promise<boolean>;
}

export const IAgentHostAutomationService = createDecorator<IAgentHostAutomationService>('agentHostAutomationService');

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
	completeMigration(expectedResources?: readonly string[]): Promise<void>;
	handleConfigurationChanged(): Promise<void>;
	handleAgentsChanged(): void;
}

/**
 * Owns the durable automation catalogue. A mutation is persisted before its
 * corresponding AHP action is published, so a published definition always has
 * a durable recovery point after an agent-host restart.
 */
export class AgentHostAutomationService extends Disposable implements IAgentHostAutomationService {
	declare readonly _serviceBrand: undefined;

	private _catalog: AutomationState | undefined;
	private _migrationCompletedAt: string | undefined;
	private _runs = new Map<string, AutomationRunState>();
	private _manualRunRequests = new Map<string, IStoredManualRunRequest>();
	private _customizationScopes = new Map<string, IAutomationCustomizationScopeSnapshot>();
	private _runCustomizationSnapshots = new Map<string, IAutomationCustomizationScopeSnapshot>();
	private _mutationTail: Promise<void> = Promise.resolve();
	private readonly _scheduleTimer = this._register(new MutableDisposable());
	private readonly _runTimeouts = this._register(new DisposableMap<string>());
	private _didRecoverRuns = false;

	constructor(
		private readonly _execution: IAgentHostAutomationExecution,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostStorageService private readonly _storageService: IAgentHostStorageService,
		@ILogService private readonly _logService: ILogService,
		@IAgentPluginManager private readonly _pluginManager: IAgentPluginManager,
	) {
		super();
		const stored = this._load();
		this._migrationCompletedAt = stored?.migration?.completedAt;
		this._runs = new Map(stored?.runs?.map(run => [run.resource, run]));
		this._runCustomizationSnapshots = this._loadRunCustomizationSnapshots(stored?.runCustomizationSnapshots);
		const restored = this._restoreCustomizationScopes(
			stored?.catalog.automations ?? [],
			stored?.customizationScopes,
		);
		this._catalog = stored?.catalog ? {
			entries: restored.automations.map(automation => withRunWindow(automation, this._runs, RUN_HISTORY_PAGE_SIZE)),
			...(stored.catalog._meta || this._migrationCompletedAt ? {
				_meta: {
					...stored.catalog._meta,
					...(this._migrationCompletedAt ? { [AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY]: true } : {}),
				},
			} : {}),
		} : undefined;
		this._manualRunRequests = new Map(stored?.manualRunRequests?.map(request => [request.requestId, request]));
		this._setCustomizationScopes(this._pruneCustomizationScopes(
			this._catalog,
			restored.customizationScopes,
		));
		if (this._catalog) {
			this._stateManager.setAutomationCatalogState(this._catalog);
		}
		for (const run of this._runs.values()) {
			this._stateManager.setAutomationRunState(run);
			this._retainRunCustomizations(run);
		}
		this._register(this._stateManager.onDidEmitEnvelope(envelope => this._handleEnvelope(envelope)));
		if (this._migrationCompletedAt && this._isAutomationsEnabled()) {
			void Promise.resolve().then(() => {
				this._recoverRuns();
				this._scheduleNext();
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
			runCancellation: {},
			runHistoryLimit: RUN_HISTORY_PAGE_SIZE,
		} : undefined;
	}

	async completeMigration(expectedResources?: readonly string[]): Promise<void> {
		return this._enqueueMutation(async () => {
			const catalog = this._requireCatalog();
			if (!this._isAutomationsEnabled()) {
				throw new Error('Automations must be enabled before migration can complete.');
			}
			if (this._migrationCompletedAt !== undefined) {
				return;
			}
			const missing = (expectedResources ?? catalog.entries.map(automation => automation.resource))
				.filter(resource => !catalog.entries.some(automation => automation.resource === resource));
			if (missing.length > 0) {
				throw new Error(`Automation migration is incomplete; ${missing.length} expected automation resources are missing.`);
			}
			const completedAt = new Date().toISOString();
			// Set the completion marker before synthesizing operations so
			// `_canGrantRun` sees migration as complete. Roll back if persist
			// fails to preserve the pre-migration invariants.
			const priorCompletedAt = this._migrationCompletedAt;
			this._migrationCompletedAt = completedAt;
			let migratedCatalog: AutomationState;
			try {
				migratedCatalog = {
					...catalog,
					_meta: { ...catalog._meta, [AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY]: true },
					entries: catalog.entries.map(automation => ({
						...automation,
						operations: this._migrationOperationsForItem(automation),
					})),
				};
				await this._persist(migratedCatalog, this._runs, this._manualRunRequests, completedAt);
			} catch (error) {
				this._migrationCompletedAt = priorCompletedAt;
				throw error;
			}
			this._catalog = migratedCatalog;
			this._stateManager.setAutomationCatalogState(migratedCatalog);
			for (const automation of migratedCatalog.entries) {
				this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation });
			}
			this._logService.info(`[AgentHostAutomationService] Automation migration completed: discovered=${expectedResources?.length ?? migratedCatalog.entries.length}, automations=${migratedCatalog.entries.length}, runs=${this._runs.size}.`);
			this._recoverRuns();
			this._scheduleNext();
		});
	}

	private _migrationOperationsForItem(automation: AutomationEntry): AutomationOperation[] {
		if (!this._canGrantRun(automation.definition)) {
			// Pending imports or disabled automations must not receive Run or
			// Remove: the browser scheduler still owns the legacy row until the
			// pending flag clears.
			return automation.operations.filter(op => op !== AutomationOperation.Run && op !== AutomationOperation.Remove);
		}
		return automation.runs.some(run => !isTerminalLifecycle(run.lifecycle))
			? withOperation(automation.operations, AutomationOperation.Run).filter(operation => operation !== AutomationOperation.Remove)
			: withOperation(withOperation(automation.operations, AutomationOperation.Run), AutomationOperation.Remove);
	}

	private _canGrantRun(definition: AutomationDefinition): boolean {
		return this._migrationCompletedAt !== undefined
			&& this._isAutomationsEnabled()
			&& !isAgentHostLegacyAutomationImportPending(definition);
	}

	async handleConfigurationChanged(): Promise<void> {
		return this._enqueueMutation(async () => {
			const catalog = this._requireCatalog();
			const nextCatalog: AutomationState = {
				...catalog,
				entries: catalog.entries.map(automation => ({
					...automation,
					operations: this._canGrantRun(automation.definition)
						? withOperation(automation.operations, AutomationOperation.Run)
						: automation.operations.filter(operation => operation !== AutomationOperation.Run
							&& (!isAgentHostLegacyAutomationImportPending(automation.definition) || operation !== AutomationOperation.Remove)),
				})),
			};
			if (!equals(nextCatalog, catalog)) {
				await this._persist(nextCatalog, this._runs, this._manualRunRequests);
				this._catalog = nextCatalog;
				for (const automation of nextCatalog.entries) {
					this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation });
				}
			}
			if (this._migrationCompletedAt !== undefined && this._isAutomationsEnabled()) {
				this._recoverRuns();
				this._scheduleNext();
			} else {
				this._scheduleTimer.clear();
			}
		});
	}

	handleAgentsChanged(): void {
		if (!this._migrationCompletedAt || !this._isAutomationsEnabled()) {
			return;
		}
		this._startPendingRuns();
		this._scheduleNext();
	}

	async handleCreate(action: AutomationCreateRequestedAction, clientId?: string): Promise<void> {
		return this._enqueueMutation(() => this._handleCreate(action, clientId));
	}

	private async _handleCreate(action: AutomationCreateRequestedAction, clientId: string | undefined): Promise<void> {
		const catalog = this._requireCatalog();
		this._validateAutomationResource(action.resource);
		const prepared = await this._prepareDefinitionCustomizations(action.definition, clientId);
		try {
			const existing = catalog.entries.find(automation => automation.resource === action.resource);
			if (existing && areEquivalentAutomationDefinitions(existing.definition, prepared.definition)) {
				this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation: existing });
				return;
			}
			if (existing) {
				throw new Error(`Automation already exists: ${action.resource}`);
			}
			const definition = prepared.definition;
			this._validateDefinition(definition);

			const timestamp = new Date().toISOString();
			const pending = isAgentHostLegacyAutomationImportPending(definition);
			const automation = this._withInitialScheduleState({
				resource: action.resource,
				definition,
				runs: [],
				operations: [
					AutomationOperation.Update,
					...(pending ? [] : [AutomationOperation.Remove]),
					...(this._canGrantRun(definition) ? [AutomationOperation.Run] : []),
				],
				createdAt: timestamp,
				modifiedAt: timestamp,
			}, new Date(timestamp));
			const next = automationReducer(catalog, { type: ActionType.AutomationSet, automation }, this._log);
			const nextCustomizationScopes = this._pruneCustomizationScopes(next, prepared.customizationScopes);
			await this._persist(next, this._runs, this._manualRunRequests, this._migrationCompletedAt, nextCustomizationScopes);
			this._catalog = next;
			this._setCustomizationScopes(nextCustomizationScopes);
			this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation });
			this._scheduleNext();
		} finally {
			prepared.dispose();
		}
	}

	async handleUpdate(action: AutomationUpdateRequestedAction, clientId?: string): Promise<void> {
		return this._enqueueMutation(() => this._handleUpdate(action, clientId));
	}

	private async _handleUpdate(action: AutomationUpdateRequestedAction, clientId: string | undefined): Promise<void> {
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
		const prepared = await this._prepareDefinitionCustomizations(automation.definition, clientId);
		try {
			automation = {
				...automation,
				definition: prepared.definition,
			};
			this._validateDefinition(automation.definition);
			if (action.changes.triggers !== undefined || action.changes.enabled !== undefined) {
				automation = this._withInitialScheduleState(automation, new Date());
			}
			let operations = automation.operations;
			if (isAgentHostLegacyAutomationImportPending(existing.definition)
				&& !isAgentHostLegacyAutomationImportPending(automation.definition)
				&& !operations.includes(AutomationOperation.Remove)) {
				// completeMigration may have stripped Remove from pending items;
				// restore it now that the browser has acknowledged legacy removal.
				operations = withOperation(operations, AutomationOperation.Remove);
			}
			if (isAgentHostLegacyAutomationImportPending(automation.definition)) {
				operations = operations.filter(operation => operation !== AutomationOperation.Run && operation !== AutomationOperation.Remove);
			} else if (this._canGrantRun(automation.definition)) {
				operations = withOperation(operations, AutomationOperation.Run);
			} else if (operations.includes(AutomationOperation.Run)) {
				operations = operations.filter(op => op !== AutomationOperation.Run);
			}
			if (operations !== automation.operations) {
				automation = { ...automation, operations };
			}
			const next = automationReducer(catalog, { type: ActionType.AutomationSet, automation }, this._log);
			const nextCustomizationScopes = this._pruneCustomizationScopes(next, prepared.customizationScopes);
			await this._persist(next, this._runs, this._manualRunRequests, this._migrationCompletedAt, nextCustomizationScopes);
			this._catalog = next;
			this._setCustomizationScopes(nextCustomizationScopes);
			this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, { type: ActionType.AutomationSet, automation });
			this._scheduleNext();
		} finally {
			prepared.dispose();
		}
	}

	async handleRemove(action: AutomationRemovedAction): Promise<void> {
		return this._enqueueMutation(() => this._handleRemove(action));
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
		const nextCustomizationScopes = this._pruneCustomizationScopes(next, this._customizationScopes);
		await this._persist(next, this._runs, this._manualRunRequests, this._migrationCompletedAt, nextCustomizationScopes);
		this._catalog = next;
		this._setCustomizationScopes(nextCustomizationScopes);
		this._stateManager.dispatchServerAction(AUTOMATION_CATALOG_URI, action);
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
		return stored;
	}

	private _restoreCustomizationScopes(
		automations: readonly AutomationEntry[],
		storedScopes: unknown,
	): { automations: AutomationEntry[]; customizationScopes: Map<string, IAutomationCustomizationScopeSnapshot> } {
		const customizationScopes = new Map<string, IAutomationCustomizationScopeSnapshot>();
		if (storedScopes !== undefined) {
			if (!Array.isArray(storedScopes)) {
				this._logService.error('[AgentHostAutomationService] Ignoring invalid stored Automation customization scopes.');
			} else {
				for (const value of storedScopes) {
					if (!isStoredAutomationCustomizationScope(value)) {
						this._logService.error('[AgentHostAutomationService] Ignoring an invalid stored Automation customization scope.');
						continue;
					}
					customizationScopes.set(value.key, value.snapshot);
				}
			}
		}
		const persistedScopeKeys = new Set(customizationScopes.keys());

		const publications = new Map<string, IAutomationCustomizationSnapshotPublication>();
		for (const automation of [...automations].sort((first, second) => first.modifiedAt.localeCompare(second.modifiedAt))) {
			try {
				const publication = readAutomationCustomizationSnapshotPublication(automation.definition._meta);
				if (!publication) {
					continue;
				}
				const key = automationCustomizationScopeKey(automation.definition.session);
				publications.set(automation.resource, publication);
				if (!persistedScopeKeys.has(key)) {
					customizationScopes.set(key, {
						revision: publication.revision,
						capturedAt: automation.modifiedAt,
						customizations: publication.customizations,
					});
				}
			} catch (error) {
				this._logService.error(`[AgentHostAutomationService] Ignoring invalid customization metadata for ${automation.resource}.`, error);
			}
		}

		return {
			automations: automations.map(automation => {
				const publication = publications.get(automation.resource);
				if (!publication) {
					return automation;
				}
				const snapshot = customizationScopes.get(automationCustomizationScopeKey(automation.definition.session));
				return {
					...automation,
					definition: {
						...automation.definition,
						_meta: withAutomationCustomizationSnapshotReference(automation.definition._meta, snapshot ? {
							captureId: publication.captureId,
							sourceRevision: publication.revision,
							snapshotRevision: snapshot.revision,
						} : undefined),
					},
				};
			}),
			customizationScopes,
		};
	}

	private _loadRunCustomizationSnapshots(value: unknown): Map<string, IAutomationCustomizationScopeSnapshot> {
		const snapshots = new Map<string, IAutomationCustomizationScopeSnapshot>();
		if (value === undefined) {
			return snapshots;
		}
		if (!Array.isArray(value)) {
			this._logService.error('[AgentHostAutomationService] Ignoring invalid stored Automation run customization snapshots.');
			return snapshots;
		}
		for (const entry of value) {
			if (!isStoredRunCustomizationSnapshot(entry)) {
				this._logService.error('[AgentHostAutomationService] Ignoring an invalid stored Automation run customization snapshot.');
				continue;
			}
			const run = this._runs.get(entry.run);
			if (run && !isTerminalLifecycle(run.lifecycle)) {
				snapshots.set(entry.run, entry.snapshot);
			}
		}
		return snapshots;
	}

	private async _persist(
		catalog: AutomationState,
		runs: ReadonlyMap<string, AutomationRunState>,
		manualRunRequests: ReadonlyMap<string, IStoredManualRunRequest>,
		migrationCompletedAt = this._migrationCompletedAt,
		customizationScopes: ReadonlyMap<string, IAutomationCustomizationScopeSnapshot> = this._customizationScopes,
		runCustomizationSnapshots: ReadonlyMap<string, IAutomationCustomizationScopeSnapshot> = this._runCustomizationSnapshots,
	): Promise<void> {
		await this._storageService.setAndFlush<IStoredAutomations>(STORAGE_KEY, {
			version: 1,
			catalog: {
				automations: catalog.entries,
				...(catalog._meta ? { _meta: catalog._meta } : {}),
			},
			runs: [...runs.values()],
			manualRunRequests: [...manualRunRequests.values()],
			customizationScopes: [...customizationScopes].map(([key, snapshot]) => ({ key, snapshot })),
			runCustomizationSnapshots: [...runCustomizationSnapshots].map(([run, snapshot]) => ({ run, snapshot })),
			...(migrationCompletedAt ? { migration: { status: 'complete', completedAt: migrationCompletedAt } } : {}),
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
		if (this._migrationCompletedAt === undefined) {
			throw new Error('Automation migration must complete before automations can be accessed or run.');
		}
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
		this._scheduleTimer.clear();
		if (!this._migrationCompletedAt || !this._catalog || !this._isAutomationsEnabled()) {
			return;
		}
		const timestamps = this._catalog.entries
			.filter(automation => automation.definition.enabled
				&& automation.operations.includes(AutomationOperation.Run)
				&& automation.nextRunAt
				&& !this._activeRunFor(automation.resource)
				&& this._execution.isSessionTemplateAvailable(automation.definition.session))
			.map(automation => Date.parse(automation.nextRunAt!))
			.filter(timestamp => Number.isFinite(timestamp));
		if (timestamps.length === 0) {
			return;
		}
		const delay = Math.min(Math.max(0, Math.min(...timestamps) - Date.now()), 0x7fffffff);
		this._scheduleTimer.value = disposableTimeout(() => {
			void this._enqueueMutation(() => this._claimDueRuns()).then(claimed => {
				this._scheduleNext();
				for (const { run, definition } of claimed) {
					void this._startRun(run, definition);
				}
			}, error => {
				this._logService.error(`[AgentHostAutomationService] Failed to claim due Automation schedules: ${toErrorMessage(error)}`);
				this._scheduleTimer.value = disposableTimeout(() => this._scheduleNext(), SCHEDULE_RETRY_DELAY_MS);
			});
		}, delay);
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
			if (!this._execution.isSessionTemplateAvailable(current.definition.session)) {
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
		for (const run of claimed.map(entry => entry.run)) {
			this._stateManager.setAutomationRunState(run);
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
				void this._enqueueMutation(() => this._failRun(run.resource, new Error('Automation execution was interrupted by an Agent Host restart.'))).catch(error => {
					this._logService.error(`[AgentHostAutomationService] Failed to recover interrupted Automation run: run=${run.resource}, error=${toErrorMessage(error)}`);
				});
			}
		}
		this._startPendingRuns();
	}

	private _startPendingRuns(): void {
		for (const run of this._runs.values()) {
			if (run.lifecycle.status !== AutomationRunStatus.Pending) {
				continue;
			}
			const automation = this._catalog?.entries.find(candidate => candidate.resource === run.automation);
			if (automation
				&& automation.operations.includes(AutomationOperation.Run)
				&& this._execution.isSessionTemplateAvailable(automation.definition.session)) {
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
			if (!this._execution.isSessionTemplateAvailable(definition.session)) {
				this._logService.info(`[AgentHostAutomationService] Deferring Automation run until its provider is available: run=${initialRun.resource}.`);
				return;
			}
			const started = await this._enqueueMutation(async () => {
				const snapshot = this._customizationScopes.get(automationCustomizationScopeKey(definition.session));
				const run = await this._markRunRunning(initialRun.resource, snapshot);
				return run ? { run, activeClient: this._virtualActiveClient(snapshot) } : undefined;
			});
			if (!started) {
				return;
			}
			const { run: running, activeClient } = started;
			this._armRunTimeout(running.resource);
			const session = await this._execution.createSession(definition.session, running, activeClient);
			const shouldStart = await this._enqueueMutation(() => this._linkRunSession(running.resource, session.toString()));
			if (!shouldStart) {
				await this._execution.cancelSession(session);
				return;
			}
			await this._execution.startSession(session, definition.message);
		} catch (error) {
			try {
				await this._enqueueMutation(() => this._failRun(initialRun.resource, error));
			} catch (persistError) {
				this._logService.error(`[AgentHostAutomationService] Failed to persist automation run failure: run=${initialRun.resource}, error=${toErrorMessage(persistError)}`);
			}
		}
	}

	private async _markRunRunning(resource: string, customizationSnapshot: IAutomationCustomizationScopeSnapshot | undefined): Promise<AutomationRunState | undefined> {
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
		const runCustomizationSnapshots = new Map(this._runCustomizationSnapshots);
		if (customizationSnapshot) {
			runCustomizationSnapshots.set(run.resource, customizationSnapshot);
		}
		await this._commitRun(next, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }], runCustomizationSnapshots);
		return next;
	}

	private async _linkRunSession(resource: string, session: string): Promise<boolean> {
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
		if (run.sessions.length > 0) {
			return run.sessions;
		}
		const lifecycle: AutomationRunLifecycle = {
			status: AutomationRunStatus.Cancelled,
			createdAt: run.lifecycle.createdAt,
			...(run.lifecycle.status === AutomationRunStatus.Running ? { startedAt: run.lifecycle.startedAt } : {}),
			completedAt: new Date().toISOString(),
		};
		await this._commitRun({ ...run, lifecycle }, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }]);
		return [];
	}

	private async _failRun(resource: string, error: unknown): Promise<void> {
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
		await this._commitRun({ ...run, lifecycle }, [{ type: ActionType.AutomationRunLifecycleChanged, lifecycle }]);
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
		runCustomizationSnapshots: ReadonlyMap<string, IAutomationCustomizationScopeSnapshot> = this._runCustomizationSnapshots,
	): Promise<void> {
		const nextRunCustomizationSnapshots = new Map(runCustomizationSnapshots);
		if (isTerminalLifecycle(run.lifecycle)) {
			nextRunCustomizationSnapshots.delete(run.resource);
		}
		const catalog = this._requireCatalog();
		const nextCatalog = this._catalogWithRun(catalog, run);
		const nextRuns = new Map(this._runs);
		nextRuns.set(run.resource, run);
		await this._persist(nextCatalog, nextRuns, this._manualRunRequests, this._migrationCompletedAt, this._customizationScopes, nextRunCustomizationSnapshots);
		this._catalog = nextCatalog;
		this._runs = nextRuns;
		this._runCustomizationSnapshots = nextRunCustomizationSnapshots;
		for (const action of actions) {
			this._stateManager.dispatchServerAction(run.resource, action);
		}
		this._publishAutomation(nextCatalog, run.automation);
		this._retainRunCustomizations(run);
		if (isTerminalLifecycle(run.lifecycle)) {
			this._runTimeouts.deleteAndDispose(run.resource);
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

	private async _prepareDefinitionCustomizations(definition: AutomationDefinition, clientId: string | undefined): Promise<IPreparedAutomationDefinition> {
		const publication = readAutomationCustomizationSnapshotPublication(definition._meta);
		const scopeKey = automationCustomizationScopeKey(definition.session);
		const current = this._customizationScopes.get(scopeKey);
		if (!publication) {
			return {
				definition: {
					...definition,
					_meta: withAutomationCustomizationSnapshotReference(definition._meta, current ? {
						captureId: readAutomationCustomizationSnapshotReference(definition._meta)?.captureId ?? 'existing',
						sourceRevision: current.revision,
						snapshotRevision: current.revision,
					} : undefined),
				},
				customizationScopes: this._customizationScopes,
				dispose: () => { },
			};
		}
		if (!clientId || publication.clientId !== clientId) {
			throw new Error('Automation customizations must be published by their active client.');
		}
		if (current?.revision === publication.revision) {
			return {
				definition: {
					...definition,
					_meta: withAutomationCustomizationSnapshotReference(definition._meta, {
						captureId: publication.captureId,
						sourceRevision: publication.revision,
						snapshotRevision: current.revision,
					}),
				},
				customizationScopes: this._customizationScopes,
				dispose: () => { },
			};
		}

		const captureOwner = `automation-capture:${publication.captureId}`;
		this._pluginManager.retainCustomizations(captureOwner, publication.customizations);
		try {
			const results = await this._pluginManager.syncCustomizations(clientId, [...publication.customizations]);
			const previousById = new Map(current?.customizations.map(customization => [customization.id, customization]));
			const customizations = results.flatMap((result, index) => result.pluginDir
				? [publication.customizations[index]]
				: previousById.get(publication.customizations[index].id) ? [previousById.get(publication.customizations[index].id)!] : []);
			const snapshot: IAutomationCustomizationScopeSnapshot = {
				revision: automationCustomizationSnapshotRevision(customizations),
				capturedAt: new Date().toISOString(),
				customizations,
			};
			const customizationScopes = new Map(this._customizationScopes);
			customizationScopes.set(scopeKey, snapshot);
			return {
				definition: {
					...definition,
					_meta: withAutomationCustomizationSnapshotReference(definition._meta, {
						captureId: publication.captureId,
						sourceRevision: publication.revision,
						snapshotRevision: snapshot.revision,
					}),
				},
				customizationScopes,
				dispose: () => this._pluginManager.retainCustomizations(captureOwner, []),
			};
		} catch (error) {
			this._pluginManager.retainCustomizations(captureOwner, []);
			throw error;
		}
	}

	private _virtualActiveClient(snapshot: IAutomationCustomizationScopeSnapshot | undefined): SessionActiveClient {
		return {
			clientId: AUTOMATION_VIRTUAL_CLIENT_ID,
			displayName: localize('agentHost.automations.activeClient', "VS Code Automations"),
			tools: [],
			customizations: [...(snapshot?.customizations ?? [])],
		};
	}

	private _pruneCustomizationScopes(
		catalog: AutomationState | undefined,
		customizationScopes: ReadonlyMap<string, IAutomationCustomizationScopeSnapshot>,
	): Map<string, IAutomationCustomizationScopeSnapshot> {
		if (!catalog) {
			return new Map();
		}
		const referenced = new Set(catalog.entries.map(automation => automationCustomizationScopeKey(automation.definition.session)));
		return new Map([...customizationScopes].filter(([key]) => referenced.has(key)));
	}

	private _setCustomizationScopes(customizationScopes: ReadonlyMap<string, IAutomationCustomizationScopeSnapshot>): void {
		for (const key of this._customizationScopes.keys()) {
			if (!customizationScopes.has(key)) {
				this._pluginManager.retainCustomizations(`automation-scope:${key}`, []);
			}
		}
		this._customizationScopes = new Map(customizationScopes);
		for (const [key, snapshot] of this._customizationScopes) {
			this._pluginManager.retainCustomizations(`automation-scope:${key}`, snapshot.customizations);
		}
	}

	private _retainRunCustomizations(run: AutomationRunState): void {
		let snapshot = this._runCustomizationSnapshots.get(run.resource);
		if (!snapshot && !isTerminalLifecycle(run.lifecycle)) {
			const automation = this._catalog?.entries.find(candidate => candidate.resource === run.automation);
			snapshot = automation
				? this._customizationScopes.get(automationCustomizationScopeKey(automation.definition.session))
				: undefined;
			if (snapshot) {
				this._runCustomizationSnapshots.set(run.resource, snapshot);
			}
		}
		this._pluginManager.retainCustomizations(`automation-run:${run.resource}`, snapshot?.customizations ?? []);
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
			: DEFAULT_RUN_TIMEOUT_MINUTES;
		this._runTimeouts.set(resource, disposableTimeout(() => {
			void this.handleCancel(resource, { type: ActionType.AutomationRunCancelRequested }).catch(error => {
				void this._enqueueMutation(() => this._failRun(
					resource,
					new Error(localize('agentHostAutomation.runTimedOut', "Automation run timed out."), { cause: error }),
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

function isStoredAutomations(value: unknown): value is IStoredAutomations {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const stored = value as Record<string, unknown>;
	return (stored['version'] === undefined || stored['version'] === 1)
		&& isStoredAutomationCatalog(stored['catalog'])
		&& (stored['runs'] === undefined || Array.isArray(stored['runs']) && stored['runs'].every(isAutomationRunState))
		&& (stored['manualRunRequests'] === undefined || Array.isArray(stored['manualRunRequests']) && stored['manualRunRequests'].every(isStoredManualRunRequest))
		&& (stored['migration'] === undefined || isCompletedMigration(stored['migration']));
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

function isStoredAutomationCustomizationScope(value: unknown): value is IStoredAutomationCustomizationScope {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const scope = value as Record<string, unknown>;
	return typeof scope['key'] === 'string' && isAutomationCustomizationScopeSnapshot(scope['snapshot']);
}

function isStoredRunCustomizationSnapshot(value: unknown): value is IStoredRunCustomizationSnapshot {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const snapshot = value as Record<string, unknown>;
	return typeof snapshot['run'] === 'string' && isAutomationCustomizationScopeSnapshot(snapshot['snapshot']);
}

function isCompletedMigration(value: unknown): value is NonNullable<IStoredAutomations['migration']> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const migration = value as Record<string, unknown>;
	return migration['status'] === 'complete' && typeof migration['completedAt'] === 'string';
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

function isTerminalLifecycle(lifecycle: AutomationRunLifecycle): boolean {
	return lifecycle.status === AutomationRunStatus.Completed
		|| lifecycle.status === AutomationRunStatus.Failed
		|| lifecycle.status === AutomationRunStatus.Cancelled;
}

function areEquivalentAutomationDefinitions(first: AutomationDefinition, second: AutomationDefinition): boolean {
	const firstReference = readAutomationCustomizationSnapshotReference(first._meta);
	const secondReference = readAutomationCustomizationSnapshotReference(second._meta);
	if (firstReference?.sourceRevision !== secondReference?.sourceRevision
		|| firstReference?.snapshotRevision !== secondReference?.snapshotRevision) {
		return false;
	}
	return equals(first, {
		...second,
		_meta: withAutomationCustomizationSnapshotReference(second._meta, firstReference),
	});
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
