/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable, type IReference } from '../../../../../base/common/lifecycle.js';
import { stableStringify } from '../../../../../base/common/objects.js';
import { derived, type IObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { basename, isEqual, isEqualOrParent, joinPath, relativePath } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { AgentSession } from '../../../../../platform/agentHost/common/agent.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { type IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { getAgentHostAutomationHistoryState, supportsAgentHostAutomationHistory, supportsAgentHostAutomationHistoryReceipts, type AgentHostAutomationHistoryState } from '../../../../../platform/agentHost/common/meta/agentHostAutomationsMeta.js';
import { applyLegacyAutomationSessionConfig } from '../../../../../platform/agentHost/common/automationConfig.js';
import { isCustomizationEnabled } from '../../../../../platform/agentHost/common/customizationEnablement.js';
import { omitAutomationSessionTemplateConfigValues, pickAutomationDefinitionOwnedConfigValues, SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { type IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { AutomationMisfirePolicy, AutomationOperation, AutomationRunOriginKind, AutomationRunStatus, AutomationTriggerKind, MessageKind, type AutomationDefinition, type AutomationEntry, type AutomationRunSummary, type AutomationState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { AUTOMATION_CATALOG_URI, isAhpAutomationCatalogChannel, StateComponents, type ClientPluginCustomization } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { type IAgentCustomizationScope, IAgentHostActiveClientService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';
import { assertAutomationSessionTemplate, type AutomationTarget, type IAutomationDescriptor, type IAutomationRun, type IAutomationSchedule, type IAutomationSessionTemplate } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationUnavailableError, type AutomationCatalogueState, assertAutomationSessionTemplateAuthority, type AutomationMutationGuard, type IAutomationCustomizationChoice, type IAutomationRunRequestResult, type ICreateAutomationOptions, type IGuardedAutomationUpdateResult, serializeAutomationEditableState, type IUpdateAutomationOptions, type IDeleteAutomationOptions } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import type { ISessionsProviderAutomations } from '../../../../services/sessions/common/sessionsProvider.js';

const MUTATION_TIMEOUT_MS = 30_000;
const LEGACY_RUN_ARCHIVE_VERSION = 1;
const ARCHIVE_CLEANUP_VERSION = 1;
const HISTORY_DELETION_REQUEST_VERSION = 1;

interface IHistoryDeletionRequest {
	readonly requestId: string;
	readonly resource: string;
	readonly title: string;
	readonly rows: readonly { readonly id: string; readonly session?: string }[];
	readonly sessions: readonly string[];
}

/** The AHP connection surface for Automation catalogue subscriptions and commands. */
export type IAgentHostAutomationConnection = Pick<IAgentConnection,
	'dispatch'
	| 'initializeResult'
	| 'onDidAction'
	| 'runAutomation'
	| 'deleteAutomation'
	| 'acknowledgeAutomationDeletion'
> & {
	getSubscription(
		kind: StateComponents.AutomationCatalog,
		resource: URI,
		owner: string,
	): IReference<IAgentSubscription<AutomationState>>;
};

interface ISerializedArchivedRun extends Omit<IAutomationRun, 'sessionResource'> {
	readonly sessionResource?: string;
}

/** Translation between host-local resources and editor-facing provider identities. */
export interface IAgentHostAutomationBoundaryMapper {
	toHost(resource: URI): URI;
	fromHost(resource: URI): URI;
	resourceSchemeForProvider(provider: string): string;
	sessionResource?(resource: URI): URI | undefined;
	/** Exact advertised backend identity; undefined until this host resolves the archived session. */
	resolveBackendSession?(resource: URI): URI | undefined;
	readonly onDidChangeSessionResolution?: Event<void>;
	providerForSessionScheme?(scheme: string): string;
	providerForResourceScheme?(scheme: string): string | undefined;
}

/**
 * Connection-scoped projection of one host's Automation catalogue, forwarding definition and manual-run requests over AHP.
 * The host retains scheduling, execution, persistence, and run-lifecycle authority.
 */
export class AgentHostAutomationStore extends Disposable implements ISessionsProviderAutomations {

	private readonly _catalogReference: IReference<IAgentSubscription<AutomationState>>;
	private readonly _catalog: IAgentSubscription<AutomationState>;
	private readonly _catalogChanged;
	private readonly _catalogError;
	private readonly _runsForCache = new Map<string, IObservable<readonly IAutomationRun[]>>();
	private readonly _pendingWaits = this._register(new DisposableMap<number, DisposableStore>());
	private _pendingWaitIds = 0;
	private readonly _archiveKey: string;
	private readonly _archivedRuns;
	private readonly _cleanupKey: string;
	private readonly _deletionRequestKey: string;
	private readonly _deletingResources = new Set<string>();
	private readonly _historyDeletionPromises = new Map<string, Promise<void>>();

	readonly automations: IObservable<readonly IAutomationDescriptor[]>;
	/** Authoritative host runs, including those of retained history owners, merged with historical archive rows. */
	readonly runs: IObservable<readonly IAutomationRun[]>;
	readonly catalogueState: IObservable<AutomationCatalogueState>;
	readonly canCreateAutomation = derived(this, reader => this.catalogueState.read(reader) === 'ready'
		&& !!this._connection.initializeResult.read(reader)?.automations?.create);

	constructor(
		private readonly _providerId: string,
		private readonly _connection: IAgentHostAutomationConnection,
		private readonly _boundaryMapper: IAgentHostAutomationBoundaryMapper | undefined,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
		@IAgentHostActiveClientService private readonly _activeClientService: IAgentHostActiveClientService,
	) {
		super();
		this._archiveKey = `agentHostAutomation.legacyRunArchive.${_providerId}`;
		this._cleanupKey = `${this._archiveKey}.acknowledgedCleanup`;
		this._deletionRequestKey = `${this._archiveKey}.pendingDeletion`;
		this._archivedRuns = observableValue<readonly IAutomationRun[]>(this, this._loadArchivedRuns());
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, this._archiveKey, this._store)(() => {
			this._archivedRuns.set(this._loadArchivedRuns(), undefined);
		}));
		this._catalogReference = this._register(_connection.getSubscription(
			StateComponents.AutomationCatalog,
			URI.parse(AUTOMATION_CATALOG_URI),
			'AgentHostAutomationStore',
		));
		this._catalog = this._catalogReference.object;
		this._catalogChanged = observableSignalFromEvent(this, this._catalog.onDidChange);
		this._catalogError = observableSignalFromEvent(this, this._catalog.onDidError ?? Event.None);
		this._register(this._catalog.onDidChange(() => this._reconcileArchiveCleanup()));
		this._reconcileArchiveCleanup();
		this._resumeHistoryDeletion();
		const sessionResolutionChanged = observableSignalFromEvent(this, _boundaryMapper?.onDidChangeSessionResolution ?? Event.None);
		this.catalogueState = derived(this, reader => {
			this._catalogChanged.read(reader);
			this._catalogError.read(reader);
			return this._catalog.value instanceof Error ? 'error' : this._catalog.verifiedValue ? 'ready' : 'loading';
		});
		if (this._catalog.onDidError) {
			this._register(this._catalog.onDidError(error => this._logService.error(`[AgentHostAutomationStore] Catalogue subscription failed: ${error.message}`)));
		}
		this.automations = derived(this, reader => {
			this._catalogChanged.read(reader);
			return this._projectAutomations();
		});
		this.runs = derived(this, reader => {
			this._catalogChanged.read(reader);
			sessionResolutionChanged.read(reader);
			return distinctById([...this._projectRuns(), ...this._archivedRuns.read(reader)])
				.sort((first, second) => second.startedAt.localeCompare(first.startedAt));
		});
	}

	getAutomation(id: string): IAutomationDescriptor | undefined {
		return this._projectAutomation(this._findAutomationEntry(id));
	}

	getAutomationHistoryName(id: string): string | undefined {
		const entry = this._findAutomationEntry(id, true);
		if (entry) {
			return entry.definition.title;
		}
		const request = this._readHistoryDeletionRequests()?.find(request => this._resourceId(request.resource) === id);
		return request && this._resourceId(request.resource) === id ? request.title : undefined;
	}

	getAutomationHistoryState(id: string): AgentHostAutomationHistoryState | undefined {
		const entry = this._findAutomationEntry(id, true);
		return entry ? getAgentHostAutomationHistoryState(entry) : this._readHistoryDeletionRequests()?.some(request => this._resourceId(request.resource) === id) ? 'deleting' : undefined;
	}

	canRunAutomation(automationId: string): boolean {
		return this._operationAvailable(automationId, AutomationOperation.Run);
	}

	canUpdateAutomation(automationId: string): boolean {
		return this._operationAvailable(automationId, AutomationOperation.Update) && !this.getAutomation(automationId)?.readOnlyReason;
	}

	canDeleteAutomation(automationId: string): boolean {
		return this._operationAvailable(automationId, AutomationOperation.Remove);
	}

	canDeleteAutomationHistory(automationId: string): boolean {
		const state = this.getAutomationHistoryState(automationId);
		return this.catalogueState.get() === 'ready'
			&& this._connection.deleteAutomation !== undefined
			&& (state === 'retained' || state === 'deleting');
	}

	supportsDeleteHistoryChoice(automationId: string): boolean {
		return this._connection.deleteAutomation !== undefined
			&& supportsAgentHostAutomationHistory(this._connection.initializeResult.get())
			&& this._findAutomationEntry(automationId) !== undefined;
	}

	runsFor(automationId: string): IObservable<readonly IAutomationRun[]> {
		let result = this._runsForCache.get(automationId);
		if (!result) {
			result = derived(this, reader => this.runs.read(reader).filter(run => run.automationId === automationId));
			this._runsForCache.set(automationId, result);
		}
		return result;
	}

	async createAutomation(options: ICreateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
		if (this._store.isDisposed || !this.canCreateAutomation.get()) {
			throw new AutomationUnavailableError(localize('agentHostAutomation.createUnavailable', "The Agent Host is not ready to create automations."));
		}
		const now = new Date();
		const resource = automationResource(generateUuid());
		const descriptor: IAutomationDescriptor = {
			id: this._resourceId(resource),
			name: options.name,
			prompt: options.prompt,
			schedule: options.schedule,
			target: options.target,
			sessionTemplate: options.sessionTemplate,
			modelId: options.modelId,
			mode: options.mode,
			permissionLevel: options.permissionLevel,
			enabled: options.enabled ?? true,
			createdAt: now.toISOString(),
			updatedAt: now.toISOString(),
		};
		const state = await this._createDescriptor(resource, descriptor, mutationGuard, options.customizationIds);
		return this._requireProjectedAutomation(state);
	}

	async updateAutomation(id: string, patch: IUpdateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
		this._requireOperation(id, AutomationOperation.Update);
		const current = this._requireAutomation(id);
		if (current.readOnlyReason) {
			throw new Error(current.readOnlyReason);
		}
		const updated = this._applyPatch(current, patch);
		const state = await this._replaceDescriptor(updated, patch.sessionTemplate === null, mutationGuard, patch.customizationIds);
		return this._requireProjectedAutomation(state);
	}

	async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		const current = this.getAutomation(id);
		if (!current || serializeAutomationEditableState(current) !== serializeAutomationEditableState(expected)) {
			return { kind: 'conflict', current };
		}
		return { kind: 'updated', automation: await this.updateAutomation(id, patch, mutationGuard) };
	}

	async getCustomizationChoices(target: AutomationTarget, existingId: string | undefined, token: CancellationToken): Promise<readonly IAutomationCustomizationChoice[] | undefined> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const existing = existingId ? this._findAutomationEntry(existingId)?.definition : undefined;
		const scope = this._acquireCustomizationScope(target, target.sessionTypeId ?? existing?.session.provider);
		if (!scope) {
			return undefined;
		}
		try {
			await raceCancellationError(scope.whenResolved(), token);
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			const current = scope.customizations.get().filter(isCustomizationEnabled);
			const saved = new Map(existing?.session.customizations?.map(plugin => [plugin.id, plugin]));
			const sameTarget = existing !== undefined && this._isCustomizationTargetUnchanged(target, existing, target.sessionTypeId ?? existing.session.provider, true);
			const currentIds = new Set(current.map(plugin => plugin.id));
			return [
				...current.map(plugin => ({
					id: plugin.id,
					label: this._customizationLabel(plugin),
					description: URI.parse(plugin.uri).scheme === SYNCED_CUSTOMIZATION_SCHEME
						? localize('agentHostAutomation.syncedCustomizationDescription', "Customizations synced from VS Code.")
						: plugin.version ? localize('agentHostAutomation.customizationVersion', "Version {0}", plugin.version) : undefined,
					selected: !sameTarget || saved.has(plugin.id),
					outdated: sameTarget && saved.has(plugin.id)
						&& (saved.get(plugin.id)!.nonce !== plugin.nonce || saved.get(plugin.id)!.uri !== plugin.uri),
				})),
				...[...saved.values()].filter(plugin => !currentIds.has(plugin.id)).map(plugin => ({
					id: plugin.id,
					label: this._customizationLabel(plugin),
					description: localize('agentHostAutomation.savedCustomization', "Not available locally. The saved copy is kept."),
					selected: true,
					outdated: false,
				})),
			];
		} finally {
			scope.dispose();
		}
	}

	private _customizationLabel(plugin: ClientPluginCustomization): string {
		const uri = URI.parse(plugin.uri);
		return uri.scheme === SYNCED_CUSTOMIZATION_SCHEME
			? localize('agentHostAutomation.syncedCustomizations', "VS Code Customizations")
			: plugin.name || basename(uri);
	}

	async deleteAutomation(id: string, mutationGuard?: AutomationMutationGuard, options?: IDeleteAutomationOptions): Promise<void> {
		const supportsHistoryChoice = this.supportsDeleteHistoryChoice(id);
		if (options !== undefined && !supportsHistoryChoice) {
			throw new AutomationUnavailableError(localize('agentHostAutomation.historyUnsupported', "This Agent Host does not support choosing whether to delete Automation run history."));
		}
		if (!supportsHistoryChoice) {
			const { resource } = this._requireOperation(id, AutomationOperation.Remove);
			await this._dispatchAndWait(
				{ type: ActionType.AutomationRemoved, resource },
				catalog => !catalog.entries.some(automation => automation.resource === resource),
				mutationGuard,
			);
			this._runsForCache.delete(id);
			return;
		}
		await this._deleteWithHistoryChoice(id, options?.deleteHistory ?? true, mutationGuard);
		this._runsForCache.delete(id);
	}

	private async _deleteWithHistoryChoice(id: string, deleteHistory: boolean, mutationGuard: AutomationMutationGuard | undefined): Promise<void> {
		await this._waitForCatalog(() => true);
		mutationGuard?.();
		const { resource } = this._requireOperation(id, AutomationOperation.Remove);
		if (!deleteHistory) {
			return this._doExecuteHistoryDeletion(resource, false, undefined, undefined);
		}
		return this._coalesceHistoryDeletion(resource, async () => {
			const cleanup = this._prepareArchiveCleanup(resource);
			const pending = this._readHistoryDeletionRequests()?.find(request => request.resource === resource);
			const request = supportsAgentHostAutomationHistoryReceipts(this._connection.initializeResult.get()) && this._connection.acknowledgeAutomationDeletion
				? pending ?? this._createHistoryDeletionRequest(resource, this.getAutomationHistoryName(id) ?? localize('agentHostAutomation.deleted', "Deleted automation"), cleanup)
				: undefined;
			if (request && !pending) {
				this._writeHistoryDeletionRequests([...this._requireHistoryDeletionRequests().filter(candidate => candidate.resource !== resource), request]);
				await this._storageService.flush();
			}
			try {
				mutationGuard?.();
				if (this._store.isDisposed) {
					throw new CancellationError();
				}
			} catch (error) {
				if (request && !pending) {
					this._writeHistoryDeletionRequests(this._requireHistoryDeletionRequests().filter(candidate => candidate.requestId !== request.requestId));
					await this._storageService.flush();
				}
				throw error;
			}
			await this._doExecuteHistoryDeletion(resource, true, cleanup, request);
		});
	}

	async deleteAutomationHistory(id: string): Promise<void> {
		await this._waitForCatalog(() => true);
		const pending = this._readHistoryDeletionRequests()?.find(request => this._resourceId(request.resource) === id);
		const entry = this._findAutomationEntry(id, true);
		const resource = entry?.resource ?? (pending && this._resourceId(pending.resource) === id ? pending.resource : undefined);
		if (!resource || !this.canDeleteAutomationHistory(id)) {
			throw new AutomationUnavailableError(localize('agentHostAutomation.historyDeleteUnavailable', "This Automation's retained run history cannot currently be deleted."));
		}
		await this._coalesceHistoryDeletion(resource, async () => {
			const cleanup = pending ? undefined : this._prepareArchiveCleanup(resource);
			const request = pending ?? (
				supportsAgentHostAutomationHistoryReceipts(this._connection.initializeResult.get()) && this._connection.acknowledgeAutomationDeletion
					? this._createHistoryDeletionRequest(resource, entry?.definition.title ?? localize('agentHostAutomation.deleted', "Deleted automation"), cleanup)
					: undefined
			);
			if (request && !pending) {
				this._writeHistoryDeletionRequests([...this._requireHistoryDeletionRequests().filter(candidate => candidate.resource !== resource), request]);
				await this._storageService.flush();
			}
			await this._doExecuteHistoryDeletion(resource, true, cleanup, request);
		});
		this._runsForCache.delete(id);
	}

	private _coalesceHistoryDeletion(resource: string, operation: () => Promise<void>): Promise<void> {
		const current = this._historyDeletionPromises.get(resource);
		if (current) {
			return current;
		}
		const tracked = operation().finally(() => this._historyDeletionPromises.delete(resource));
		this._historyDeletionPromises.set(resource, tracked);
		return tracked;
	}

	private async _doExecuteHistoryDeletion(
		resource: string,
		deleteHistory: boolean,
		cleanup: ReturnType<AgentHostAutomationStore['_prepareArchiveCleanup']> | undefined,
		request: IHistoryDeletionRequest | undefined,
	): Promise<void> {
		this._deletingResources.add(resource);
		let completed = false;
		try {
			if (this._store.isDisposed) {
				throw new CancellationError();
			}
			const sessions = request?.sessions.map(session => URI.parse(session)) ?? cleanup?.sessions ?? [];
			const deleted = await this._connection.deleteAutomation!(resource, deleteHistory, sessions, request?.requestId);
			await this._waitForCatalog(catalog => {
				const entry = catalog.entries.find(automation => automation.resource === resource);
				return deleteHistory ? entry === undefined : entry !== undefined && getAgentHostAutomationHistoryState(entry) === 'retained';
			});
			const acknowledged = request
				? request.rows.filter(row => row.session === undefined || deleted.includes(row.session)).map(row => row.id)
				: cleanup?.rowIds.filter(id => {
					const session = cleanup.backendSessions.get(id);
					return session === undefined || deleted.includes(session);
				});
			if (acknowledged && acknowledged.length > 0) {
				this._recordArchiveCleanupIntent(resource, acknowledged);
				await this._storageService.flush();
			}
			if (request) {
				await this._connection.acknowledgeAutomationDeletion!(request.requestId);
				this._writeHistoryDeletionRequests(this._requireHistoryDeletionRequests().filter(candidate => candidate.requestId !== request.requestId));
				await this._storageService.flush();
			}
			completed = true;
		} finally {
			this._deletingResources.delete(resource);
			if (completed) {
				this._reconcileArchiveCleanup();
			}
		}
	}

	async runAutomation(automationId: string, token: CancellationToken = CancellationToken.None): Promise<IAutomationRunRequestResult> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const automation = this._requireOperation(automationId, AutomationOperation.Run);
		const activeRun = this.getActiveRunFor(automationId);
		if (activeRun) {
			return { kind: 'alreadyRunning', run: activeRun };
		}
		const result = await this._connection.runAutomation({
			channel: AUTOMATION_CATALOG_URI,
			automation: automation.resource,
			requestId: generateUuid(),
		});
		let cancellationForwarded = false;
		const cancel = this._connection.initializeResult.get()?.automations?.runCancellation ? () => {
			if (cancellationForwarded) {
				return;
			}
			cancellationForwarded = true;
			this._connection.dispatch(result.resource, { type: ActionType.AutomationRunCancelRequested });
		} : undefined;
		const dispatchDisposables = new DisposableStore();
		try {
			if (cancel) {
				dispatchDisposables.add(token.onCancellationRequested(cancel));
				if (token.isCancellationRequested) {
					cancel();
				}
			}
			const sessionResolutionChanged = Event.any(this._boundaryMapper?.onDidChangeSessionResolution ?? Event.None, listener => token.onCancellationRequested(listener));
			const hasResolvedSession = (run: AutomationRunSummary) => run.primarySession !== undefined && this._projectSessionResource(run.primarySession) !== undefined;
			await this._waitForCatalog(state => state.entries.some(automation => automation.runs.some(run =>
				run.resource === result.resource && (hasResolvedSession(run) || isTerminalRun(run) || token.isCancellationRequested)
			)), undefined, null, sessionResolutionChanged);
			// Session discovery can arrive after the host has already completed the run.
			const catalog = await this._waitForCatalog(state => state.entries.some(automation => automation.runs.some(run =>
				run.resource === result.resource && (run.primarySession === undefined || hasResolvedSession(run) || token.isCancellationRequested)
			)), undefined, MUTATION_TIMEOUT_MS, sessionResolutionChanged);
			const run = catalog.entries.flatMap(automation => automation.runs).find(candidate => candidate.resource === result.resource);
			if (!run) {
				throw new Error(`Automation run did not appear in the authoritative catalogue: ${result.resource}`);
			}
			return {
				kind: 'dispatched',
				run: this._projectRun(run),
				whenCompleted: this._waitForCatalog(state => state.entries.some(automation => automation.runs.some(candidate =>
					candidate.resource === result.resource && isTerminalRun(candidate)
				)), undefined, null).then(() => undefined),
				...(cancel ? { cancel } : {}),
			};
		} finally {
			dispatchDisposables.dispose();
		}
	}

	// Projects an Agent Host session resource into the editor-facing provider scheme.
	private _projectSessionResource(resource: string): URI | undefined {
		try {
			const session = URI.parse(resource);
			if (this._boundaryMapper?.sessionResource) {
				return this._boundaryMapper.sessionResource(session);
			}
			const provider = this._boundaryMapper?.providerForSessionScheme?.(session.scheme) ?? AgentSession.provider(session);
			if (!provider) {
				return undefined;
			}
			const resourceScheme = this._boundaryMapper?.resourceSchemeForProvider(provider);
			return resourceScheme ? session.with({ scheme: resourceScheme }) : session;
		} catch (error) {
			this._logService.warn('[AgentHostAutomationStore] Could not resolve an automation run session; leaving the run unlinked.', error);
			return undefined;
		}
	}

	getActiveRunFor(automationId: string): IAutomationRun | undefined {
		return this.runs.get().find(run => run.automationId === automationId && (run.status === 'pending' || run.status === 'running'));
	}

	// Projects the Agent Host catalogue into editor-facing Automation descriptors.
	private _projectAutomations(): IAutomationDescriptor[] {
		const catalog = this._catalog.value;
		if (!catalog || catalog instanceof Error) {
			return [];
		}
		return catalog.entries
			.filter(automation => getAgentHostAutomationHistoryState(automation) === undefined)
			.map(automation => this._projectAutomation(automation))
			.filter((automation): automation is IAutomationDescriptor => automation !== undefined)
			.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
	}

	// Projects Agent Host run summaries into editor-facing Automation runs.
	private _projectRuns(): IAutomationRun[] {
		const catalog = this._catalog.value;
		if (!catalog || catalog instanceof Error) {
			return [];
		}
		return catalog.entries
			.flatMap(automation => automation.runs)
			.map(run => this._projectRun(run))
			.sort((first, second) => second.startedAt.localeCompare(first.startedAt));
	}

	// Projects Agent Host Automation state into the editor-facing Automation model.
	private _projectAutomation(state: AutomationEntry | undefined): IAutomationDescriptor | undefined {
		if (!state) {
			return undefined;
		}
		const target = this._projectTarget(state.definition);
		if (!target) {
			this._logService.warn(`[AgentHostAutomationStore] Cannot project Automation with no provider: resource=${state.resource}.`);
			return undefined;
		}
		const modelId = this._projectModelId(state.definition.session.model?.id, state.definition.session.provider);
		const newestRun = state.runs[0];
		const schedule = projectSchedule(state.definition.triggers);
		return {
			id: this._resourceId(state.resource),
			name: state.definition.title,
			prompt: state.definition.message.text,
			schedule,
			...(schedule.interval === 'custom' ? { readOnlyReason: localize('agentHostAutomation.customSchedule', "This automation uses a schedule that cannot be edited in VS Code.") } : {}),
			target,
			sessionTemplate: projectAutomationSessionTemplate(state.definition, modelId),
			enabled: state.definition.enabled,
			createdAt: state.createdAt,
			updatedAt: state.modifiedAt,
			lastRunAt: newestRun?.lifecycle.createdAt,
			nextRunAt: state.nextRunAt,
		};
	}

	// Projects an Agent Host session template into an editor-facing Automation target.
	private _projectTarget(definition: AutomationDefinition): AutomationTarget | undefined {
		const provider = definition.session.provider;
		const directory = definition.session.workingDirectories?.[0];
		if (!directory) {
			return provider ? { kind: 'quickChat', providerId: this._providerId, sessionTypeId: provider } : undefined;
		}
		const config = definition.session.config;
		const isolation = config?.[SessionConfigKey.Isolation];
		return {
			kind: 'workspace',
			folderUri: this._boundaryMapper?.fromHost(URI.parse(directory)) ?? URI.parse(directory),
			providerId: this._providerId,
			sessionTypeId: provider,
			isolation: isolation === 'worktree'
				? { kind: 'worktree', branch: readString(config?.[SessionConfigKey.Branch]) ?? '' }
				: isolation === 'folder'
					? { kind: 'folder' }
					: { kind: 'default' },
		};
	}

	// Projects an Agent Host run summary into the editor-facing Automation run model.
	private _projectRun(run: AutomationRunSummary): IAutomationRun {
		const lifecycle = run.lifecycle;
		const primarySession = run.primarySession ? this._projectSessionResource(run.primarySession) : undefined;
		return {
			id: this._resourceId(run.resource),
			automationId: this._resourceId(run.automation),
			status: lifecycle.status === AutomationRunStatus.Cancelled ? 'failed' : lifecycle.status,
			trigger: run.origin.kind === AutomationRunOriginKind.Manual
				? 'manual'
				: run.origin.catchUp ? 'catch_up' : 'schedule',
			sessionResource: primarySession,
			startedAt: lifecycle.status === AutomationRunStatus.Pending ? lifecycle.createdAt : lifecycle.startedAt ?? lifecycle.createdAt,
			completedAt: lifecycle.status === AutomationRunStatus.Completed || lifecycle.status === AutomationRunStatus.Failed || lifecycle.status === AutomationRunStatus.Cancelled
				? lifecycle.completedAt
				: undefined,
			errorMessage: lifecycle.status === AutomationRunStatus.Failed
				? lifecycle.error.message
				: lifecycle.status === AutomationRunStatus.Cancelled
					? localize('agentHostAutomation.cancelled', "Cancelled")
					: undefined,
		};
	}

	private _findAutomationEntry(id: string, includeHistoryOwners = false): AutomationEntry | undefined {
		const catalog = this._catalog.value;
		return catalog && !(catalog instanceof Error)
			? catalog.entries.find(automation => this._resourceId(automation.resource) === id
				&& (includeHistoryOwners || getAgentHostAutomationHistoryState(automation) === undefined))
			: undefined;
	}

	private _resourceId(resource: string): string {
		return `${encodeURIComponent(this._providerId)}:${resource}`;
	}

	private _requireAutomation(id: string): IAutomationDescriptor {
		const automation = this.getAutomation(id);
		if (!automation) {
			throw new Error(`Automation does not exist: ${id}`);
		}
		return automation;
	}

	private _operationAvailable(id: string, operation: AutomationOperation): boolean {
		return !this._store.isDisposed && this.catalogueState.get() === 'ready'
			&& this._findAutomationEntry(id)?.operations.includes(operation) === true;
	}

	private _requireOperation(id: string, operation: AutomationOperation): AutomationEntry {
		const automation = this._findAutomationEntry(id);
		if (this._store.isDisposed || this.catalogueState.get() !== 'ready' || !automation?.operations.includes(operation)) {
			throw new AutomationUnavailableError(localize('agentHostAutomation.operationUnavailable', "Automation operation '{0}' is not available for '{1}'.", operation, id));
		}
		return automation;
	}

	private _requireProjectedAutomation(state: AutomationEntry): IAutomationDescriptor {
		const automation = this._projectAutomation(state);
		if (!automation) {
			throw new Error(`Automation cannot be represented by the compatibility view: ${state.resource}`);
		}
		return automation;
	}

	private async _createDescriptor(resource: string, descriptor: IAutomationDescriptor, mutationGuard?: AutomationMutationGuard, customizationIds?: readonly string[]): Promise<AutomationEntry> {
		const definition = this._definitionFromDescriptor(descriptor);
		const scope = this._acquireCustomizationScope(descriptor.target, definition.session.provider);
		try {
			if (scope) {
				await this._captureCustomizations(definition, scope, undefined, customizationIds);
			}
			const state = await this._dispatchAndWait(
				{ type: ActionType.AutomationCreateRequested, resource, definition },
				catalog => catalog.entries.some(automation => automation.resource === resource),
				mutationGuard,
			);
			if (!state) {
				throw new Error(`Automation create completed without authoritative state: ${resource}`);
			}
			return state;
		} finally {
			// The host may read client-served bundle files until it responds.
			scope?.dispose();
		}
	}

	private async _replaceDescriptor(descriptor: IAutomationDescriptor, resetSessionTemplate = false, mutationGuard?: AutomationMutationGuard, customizationIds?: readonly string[]): Promise<AutomationEntry> {
		const current = this._findAutomationEntry(descriptor.id);
		if (!current) {
			throw new Error(`Automation does not exist: ${descriptor.id}`);
		}
		const resource = current.resource;
		const definition = this._definitionFromDescriptor(descriptor, current.definition, resetSessionTemplate);
		const scope = customizationIds !== undefined || !this._isCustomizationTargetUnchanged(descriptor.target, current.definition, definition.session.provider)
			? this._acquireCustomizationScope(descriptor.target, definition.session.provider)
			: undefined;
		try {
			if (scope) {
				await this._captureCustomizations(definition, scope, current.definition, customizationIds);
			}
			const expected = this._requireProjectedAutomation({ ...current, definition });
			const state = await this._dispatchAndWait(
				{
					type: ActionType.AutomationUpdateRequested,
					resource,
					changes: {
						title: definition.title,
						message: definition.message,
						session: definition.session,
						enabled: definition.enabled,
						triggers: definition.triggers,
						_meta: definition._meta,
					},
				},
				catalog => {
					const state = catalog.entries.find(automation => automation.resource === resource);
					if (scope && stableStringify(state?.definition.session.customizations) !== stableStringify(definition.session.customizations)) {
						return false;
					}
					const projected = this._projectAutomation(state);
					if (projected === undefined
						|| serializeAutomationEditableState(projected) !== serializeAutomationEditableState(expected)) {
						return false;
					}
					return true;
				},
				mutationGuard,
				!!scope,
			);
			if (!state) {
				throw new Error(`Automation update completed without authoritative state: ${resource}`);
			}
			return state;
		} finally {
			scope?.dispose();
		}
	}

	private _isCustomizationTargetUnchanged(target: AutomationTarget, existing: AutomationDefinition, provider: string | undefined, compareIsolation = false): boolean {
		const previousTarget = this._projectTarget(existing);
		return !!previousTarget
			&& previousTarget.providerId === target.providerId
			&& previousTarget.sessionTypeId === target.sessionTypeId
			&& existing.session.provider === provider
			&& previousTarget.kind === target.kind
			&& (previousTarget.kind !== 'workspace' || target.kind !== 'workspace'
				|| (isEqual(previousTarget.folderUri, target.folderUri)
					&& (!compareIsolation || stableStringify(previousTarget.isolation) === stableStringify(target.isolation))));
	}

	private _acquireCustomizationScope(target: AutomationTarget, provider: string | undefined): IAgentCustomizationScope | undefined {
		if (!this._connection.initializeResult.get()?.automations?.customizations || !provider) {
			return undefined;
		}
		const sessionType = this._boundaryMapper?.resourceSchemeForProvider(provider) ?? provider;
		return this._activeClientService.acquireScope(sessionType, target.kind === 'workspace' ? [target.folderUri] : []);
	}

	private async _captureCustomizations(definition: AutomationDefinition, scope: IAgentCustomizationScope, previous?: AutomationDefinition, customizationIds?: readonly string[]): Promise<void> {
		await scope.whenResolved();
		const current = scope.customizations.get().filter(isCustomizationEnabled);
		const currentIds = new Set(current.map(plugin => plugin.id));
		const selectedIds = customizationIds !== undefined ? new Set(customizationIds) : undefined;
		const customizations = selectedIds
			? [...current, ...(previous?.session.customizations ?? []).filter(plugin => !currentIds.has(plugin.id))].filter(plugin => selectedIds.has(plugin.id))
			: current;
		definition.session.customizations = customizations;
		if (!definition.session.agent) {
			return;
		}
		const agentUri = URI.parse(definition.session.agent.uri);
		const findBundle = (plugins: readonly ClientPluginCustomization[] | undefined, contains?: URI) => plugins?.map(plugin => URI.parse(plugin.uri))
			.find(uri => uri.scheme === SYNCED_CUSTOMIZATION_SCHEME && (!contains || isEqualOrParent(contains, uri)));
		let syncedUri = scope.getSyncedUri(agentUri);
		// An agent saved by an earlier capture points into the previous target's bundle, which lays out files the same way.
		const previousBundle = findBundle(previous?.session.customizations, agentUri);
		const bundle = findBundle(customizations);
		const relative = previousBundle && relativePath(previousBundle, agentUri);
		if (!syncedUri && bundle && relative !== undefined) {
			const candidate = joinPath(bundle, relative);
			syncedUri = this._activeClientService.getOrigin(candidate) ? candidate : undefined;
		}
		if (syncedUri && customizations.some(plugin => isEqualOrParent(syncedUri, URI.parse(plugin.uri)))) {
			definition.session.agent = { uri: syncedUri.toString() };
		}
	}


	private _definitionFromDescriptor(descriptor: IAutomationDescriptor, existing?: AutomationDefinition, resetSessionTemplate = false): AutomationDefinition {
		if (descriptor.target.providerId !== this._providerId) {
			throw new AutomationUnavailableError(localize('agentHostAutomation.wrongHost', "The automation target must belong to this Agent Host."));
		}
		const sessionTemplate = descriptor.sessionTemplate;
		assertAutomationSessionTemplate(sessionTemplate);
		const modelId = sessionTemplate ? sessionTemplate.modelId : descriptor.modelId;
		const provider = descriptor.target.sessionTypeId ?? this._providerFromModelId(modelId);
		const existingSession = existing && existing.session.provider === provider ? existing.session : undefined;
		let projectedConfig: Record<string, unknown>;
		if (sessionTemplate) {
			projectedConfig = {
				...pickAutomationDefinitionOwnedConfigValues(existingSession?.config),
				...omitAutomationSessionTemplateConfigValues({ ...sessionTemplate.config }),
			};
		} else if (resetSessionTemplate) {
			projectedConfig = pickAutomationDefinitionOwnedConfigValues(existingSession?.config);
		} else {
			projectedConfig = applyLegacyAutomationSessionConfig(
				provider,
				existingSession?.config,
				descriptor.mode,
				descriptor.permissionLevel,
			);
		}
		const config = projectedConfig;
		if (descriptor.target.kind === 'workspace') {
			setOptional(config, SessionConfigKey.Isolation, descriptor.target.isolation.kind === 'default' ? undefined : descriptor.target.isolation.kind);
			setOptional(config, SessionConfigKey.Branch, descriptor.target.isolation.kind === 'worktree' ? descriptor.target.isolation.branch : undefined);
		} else {
			setOptional(config, SessionConfigKey.Isolation, undefined);
			setOptional(config, SessionConfigKey.Branch, undefined);
		}
		const meta = existing?._meta ?? {};
		return {
			title: descriptor.name,
			message: { text: descriptor.prompt, origin: { kind: MessageKind.Automation } },
			session: {
				provider,
				model: modelId ? {
					id: this._toHostModelId(modelId, provider),
					...(sessionTemplate?.modelConfiguration !== undefined ? { config: sessionTemplate.modelConfiguration } : {}),
				} : undefined,
				agent: resetSessionTemplate ? undefined : sessionTemplate ? sessionTemplate.agent : existingSession?.agent,
				workingDirectories: descriptor.target.kind === 'workspace'
					? [(this._boundaryMapper?.toHost(descriptor.target.folderUri) ?? descriptor.target.folderUri).toString()]
					: undefined,
				config: Object.keys(config).length > 0 ? config : undefined,
				...(existingSession?.customizations !== undefined && this._connection.initializeResult.get()?.automations?.customizations ? { customizations: existingSession.customizations } : {}),
			},
			enabled: descriptor.enabled,
			triggers: scheduleTrigger(descriptor.schedule),
			_meta: Object.keys(meta).length > 0 ? meta : undefined,
		};
	}

	private _toHostModelId(modelId: string, provider: string | undefined): string {
		const resourceScheme = provider ? this._boundaryMapper?.resourceSchemeForProvider(provider) : undefined;
		const prefix = resourceScheme ? `${resourceScheme}:` : undefined;
		if (prefix && modelId.startsWith(prefix)) {
			return modelId.slice(prefix.length);
		}
		return modelId;
	}

	private _providerFromModelId(modelId: string | undefined): string | undefined {
		if (!modelId) {
			return undefined;
		}
		const separator = modelId.indexOf(':');
		return separator > 0 ? this._boundaryMapper?.providerForResourceScheme?.(modelId.slice(0, separator)) : undefined;
	}

	// Projects an Agent Host model identifier into the editor-facing provider namespace.
	private _projectModelId(modelId: string | undefined, provider: string | undefined): string | undefined {
		if (!modelId) {
			return undefined;
		}
		const resourceScheme = provider ? this._boundaryMapper?.resourceSchemeForProvider(provider) : undefined;
		const prefix = resourceScheme ? `${resourceScheme}:` : undefined;
		return prefix && !modelId.startsWith(prefix) ? `${prefix}${modelId}` : modelId;
	}

	private _applyPatch(current: IAutomationDescriptor, patch: IUpdateAutomationOptions): IAutomationDescriptor {
		assertAutomationSessionTemplateAuthority(current, patch);
		const now = new Date();
		const schedule = patch.schedule ?? current.schedule;
		const enabled = patch.enabled ?? current.enabled;
		const target = patch.target ?? current.target;
		const targetAuthorityChanged = patch.target !== undefined
			&& (patch.target.providerId !== current.target.providerId || patch.target.sessionTypeId !== current.target.sessionTypeId);
		const currentModelId = current.sessionTemplate?.modelId ?? current.modelId;
		const currentMode = readString(current.sessionTemplate?.config?.[SessionConfigKey.Mode]) ?? current.mode;
		const currentPermissionLevel = readString(current.sessionTemplate?.config?.[SessionConfigKey.AutoApprove]) ?? current.permissionLevel;
		const templatePatched = patch.sessionTemplate !== undefined;
		const modelId = templatePatched || patch.modelId === null
			? undefined
			: patch.modelId ?? (targetAuthorityChanged ? undefined : currentModelId);
		const mode = templatePatched || patch.mode === null ? undefined : patch.mode ?? (targetAuthorityChanged ? undefined : currentMode);
		const permissionLevel = templatePatched || patch.permissionLevel === null ? undefined : patch.permissionLevel ?? (targetAuthorityChanged ? undefined : currentPermissionLevel);
		const provider = target.sessionTypeId ?? this._providerFromModelId(modelId);
		const sessionTemplate = patch.sessionTemplate === null
			? undefined
			: patch.sessionTemplate ?? (targetAuthorityChanged
				? undefined
				: synchronizeAutomationSessionTemplate(current.sessionTemplate, provider, modelId, mode, permissionLevel));
		return {
			...current,
			...(patch.name !== undefined ? { name: patch.name } : {}),
			...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
			schedule,
			target,
			sessionTemplate,
			modelId,
			mode,
			permissionLevel,
			enabled,
			updatedAt: now.toISOString(),
		};
	}

	private async _dispatchAndWait(
		action: Parameters<IAgentConnection['dispatch']>[1] & { readonly resource: string },
		predicate: (catalog: AutomationState) => boolean,
		mutationGuard?: AutomationMutationGuard,
		waitForCatalogChange = false,
	): Promise<AutomationEntry | undefined> {
		await this._waitForCatalog(() => true);
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		mutationGuard?.();
		const beforeDispatch = this._catalog.value;
		const result = this._waitForCatalog(catalog => (!waitForCatalogChange || catalog !== beforeDispatch) && predicate(catalog), action);
		this._connection.dispatch(AUTOMATION_CATALOG_URI, action);
		const catalog = await result;
		const state = catalog.entries.find(automation => automation.resource === action.resource);
		return state;
	}

	private _waitForCatalog(
		predicate: (catalog: AutomationState) => boolean,
		action?: { readonly type: ActionType; readonly resource: string },
		timeoutMs: number | null = MUTATION_TIMEOUT_MS,
		onDidChange: Event<void> = Event.None,
	): Promise<AutomationState> {
		if (this._store.isDisposed) {
			return Promise.reject(new CancellationError());
		}
		const current = this._catalog.value;
		if (current instanceof Error) {
			return Promise.reject(current);
		}
		if (current && predicate(current)) {
			return Promise.resolve(current);
		}
		return new Promise<AutomationState>((resolve, reject) => {
			const store = new DisposableStore();
			const waitId = ++this._pendingWaitIds;
			let settled = false;
			this._pendingWaits.set(waitId, store);
			store.add(toDisposable(() => {
				if (!settled) {
					settled = true;
					reject(new CancellationError());
				}
			}));
			const finish = (result: AutomationState | Error) => {
				if (settled) {
					return;
				}
				settled = true;
				this._pendingWaits.deleteAndDispose(waitId);
				if (result instanceof Error) {
					reject(result);
				} else {
					resolve(result);
				}
			};
			const check = () => {
				const catalog = this._catalog.value;
				if (catalog instanceof Error) {
					finish(catalog);
				} else if (catalog && predicate(catalog)) {
					finish(catalog);
				}
			};
			store.add(this._catalog.onDidChange(check));
			store.add(onDidChange(check));
			if (this._catalog.onDidError) {
				store.add(this._catalog.onDidError(error => finish(error)));
			}
			if (action) {
				store.add(this._connection.onDidAction(envelope => {
					if (isAhpAutomationCatalogChannel(envelope.channel)
						&& envelope.rejectionReason
						&& envelope.action.type === action.type
						&& hasKey(envelope.action, { resource: true })
						&& envelope.action.resource === action.resource) {
						finish(new Error(envelope.rejectionReason));
					}
				}));
			}
			if (timeoutMs !== null) {
				store.add(disposableTimeout(() => finish(new Error(`Timed out waiting for authoritative Automation state after ${timeoutMs}ms.`)), timeoutMs));
			}
			check();
		});
	}

	private _prepareArchiveCleanup(resource: string): { readonly rowIds: string[]; readonly sessions: URI[]; readonly backendSessions: Map<string, string> } {
		const cleanup = { rowIds: [] as string[], sessions: [] as URI[], backendSessions: new Map<string, string>() };
		const raw = this._storageService.get(this._archiveKey, StorageScope.APPLICATION);
		if (!raw || !this._readCleanupIntents()) {
			return cleanup;
		}
		const archive = readArchiveRows(raw);
		if (!archive) {
			this._logService.warn('[AgentHostAutomationStore] Keeping unreadable legacy run archive during history deletion.');
			return cleanup;
		}
		for (const row of archive.rows) {
			if (!isSerializedArchivedRun(row) || automationResource(row.automationId) !== resource) {
				continue;
			}
			if (!row.sessionResource) {
				cleanup.rowIds.push(row.id);
				continue;
			}
			try {
				const backend = this._boundaryMapper?.resolveBackendSession?.(URI.parse(row.sessionResource));
				if (!backend) {
					continue;
				}
				cleanup.rowIds.push(row.id);
				cleanup.backendSessions.set(row.id, backend.toString());
				if (!cleanup.sessions.some(session => session.toString() === backend.toString())) {
					cleanup.sessions.push(backend);
				}
			} catch (error) {
				this._logService.warn(`[AgentHostAutomationStore] Keeping legacy run ${row.id}; its backend session could not be resolved.`, error);
			}
		}
		return cleanup;
	}

	private _createHistoryDeletionRequest(
		resource: string,
		title: string,
		cleanup: ReturnType<AgentHostAutomationStore['_prepareArchiveCleanup']> | undefined,
	): IHistoryDeletionRequest {
		return {
			requestId: generateUuid(),
			resource,
			title,
			rows: cleanup?.rowIds.map(id => ({ id, ...(cleanup.backendSessions.get(id) ? { session: cleanup.backendSessions.get(id) } : {}) })) ?? [],
			sessions: cleanup?.sessions.map(session => session.toString()) ?? [],
		};
	}

	private _resumeHistoryDeletion(): void {
		const requests = this._readHistoryDeletionRequests();
		if (!requests || requests.length === 0 || !supportsAgentHostAutomationHistoryReceipts(this._connection.initializeResult.get()) || !this._connection.acknowledgeAutomationDeletion) {
			return;
		}
		for (const request of requests) {
			void this._coalesceHistoryDeletion(request.resource, () => this._doExecuteHistoryDeletion(request.resource, true, undefined, request)).catch(error => {
				this._logService.error(`[AgentHostAutomationStore] Failed to resume Automation history deletion: ${request.resource}`, error);
			});
		}
	}

	private _readHistoryDeletionRequests(): readonly IHistoryDeletionRequest[] | undefined {
		const raw = this._storageService.get(this._deletionRequestKey, StorageScope.APPLICATION);
		if (!raw) {
			return [];
		}
		try {
			const value: Record<string, unknown> | null = JSON.parse(raw);
			const requests = value && typeof value === 'object' && value.version === HISTORY_DELETION_REQUEST_VERSION
				? value.requests ?? (value.request ? [value.request] : undefined)
				: undefined;
			if (!Array.isArray(requests) || !requests.every(isHistoryDeletionRequest)) {
				throw new Error('Unsupported history deletion request');
			}
			return requests;
		} catch (error) {
			this._logService.warn('[AgentHostAutomationStore] Preserving unreadable pending history deletion.', error);
			return undefined;
		}
	}

	private _requireHistoryDeletionRequests(): readonly IHistoryDeletionRequest[] {
		const requests = this._readHistoryDeletionRequests();
		if (!requests) {
			throw new AutomationUnavailableError(localize('agentHostAutomation.deletionRequestUnreadable', "The pending run history deletion could not be read."));
		}
		return requests;
	}

	private _writeHistoryDeletionRequests(requests: readonly IHistoryDeletionRequest[]): void {
		if (requests.length > 0) {
			this._storageService.store(this._deletionRequestKey, JSON.stringify({ version: HISTORY_DELETION_REQUEST_VERSION, requests }), StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this._storageService.remove(this._deletionRequestKey, StorageScope.APPLICATION);
		}
	}

	private _recordArchiveCleanupIntent(resource: string, rowIds: readonly string[]): void {
		const intents = this._readCleanupIntents();
		if (!intents) {
			throw new AutomationUnavailableError(localize('agentHostAutomation.cleanupUnreadable', "The pending run history cleanup could not be read."));
		}
		const existing = intents.find(intent => intent.resource === resource);
		const merged = [...new Set([...(existing?.rowIds ?? []), ...rowIds])];
		this._writeCleanupIntents([...intents.filter(intent => intent.resource !== resource), { resource, rowIds: merged }]);
	}

	private _readCleanupIntents(): readonly IArchiveCleanupIntent[] | undefined {
		const raw = this._storageService.get(this._cleanupKey, StorageScope.APPLICATION);
		if (!raw) {
			return [];
		}
		try {
			const value: Record<string, unknown> | null = JSON.parse(raw);
			if (!value || typeof value !== 'object' || value.version !== ARCHIVE_CLEANUP_VERSION
				|| !Array.isArray(value.intents) || !value.intents.every(isArchiveCleanupIntent)) {
				throw new Error('Unsupported history cleanup journal');
			}
			return value.intents;
		} catch (error) {
			this._logService.warn('[AgentHostAutomationStore] Preserving unreadable run history cleanup journal.', error);
			return undefined;
		}
	}

	private _writeCleanupIntents(intents: readonly IArchiveCleanupIntent[]): void {
		if (intents.length === 0) {
			this._storageService.remove(this._cleanupKey, StorageScope.APPLICATION);
		} else {
			this._storageService.store(this._cleanupKey, JSON.stringify({ version: ARCHIVE_CLEANUP_VERSION, intents }), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}

	private _reconcileArchiveCleanup(): void {
		const intents = this._readCleanupIntents();
		if (!intents) {
			return;
		}
		const remaining = intents.filter(intent => {
			if (this._deletingResources.has(intent.resource)) {
				return true;
			}
			return !this._removeArchivedRows(intent.resource, intent.rowIds);
		});
		if (remaining.length !== intents.length) {
			this._writeCleanupIntents(remaining);
		}
	}

	private _removeArchivedRows(resource: string, rowIds: readonly string[]): boolean {
		const raw = this._storageService.get(this._archiveKey, StorageScope.APPLICATION);
		if (!raw) {
			return true;
		}
		const archive = readArchiveRows(raw);
		if (!archive) {
			this._logService.warn('[AgentHostAutomationStore] Keeping unreadable legacy run archive after history deletion.');
			return false;
		}
		const ids = new Set(rowIds);
		const runs = archive.rows.filter(row => !(isSerializedArchivedRun(row) && ids.has(row.id) && automationResource(row.automationId) === resource));
		if (runs.length !== archive.rows.length) {
			this._storageService.store(this._archiveKey, JSON.stringify({ ...archive.archive, runs }), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		return true;
	}

	private _loadArchivedRuns(): readonly IAutomationRun[] {
		const raw = this._storageService.get(this._archiveKey, StorageScope.APPLICATION);
		if (!raw) {
			return [];
		}
		const parsed = parseArchivedRuns(raw);
		if (parsed.kind === 'unsupported') {
			this._logService.error(`[AgentHostAutomationStore] Ignoring legacy run archive with unsupported version: key=${this._archiveKey}, version=${parsed.version}.`);
			return [];
		}
		if (parsed.kind === 'invalid') {
			this._logService.error(`[AgentHostAutomationStore] Ignoring invalid legacy run archive: key=${this._archiveKey}, error=${parsed.error}.`);
			return [];
		}
		if (parsed.droppedRuns > 0) {
			this._logService.warn(`[AgentHostAutomationStore] Dropped ${parsed.droppedRuns} malformed run(s) from legacy run archive: key=${this._archiveKey}.`);
		}
		return parsed.runs.map(run => ({
			...terminalizeArchivedRun(run),
			id: this._resourceId(URI.from({ scheme: 'legacy-automation-run', path: `/${run.id}` }).toString()),
			automationId: this._resourceId(automationResource(run.automationId)),
		}));
	}
}

function automationResource(id: string): string {
	return URI.from({ scheme: 'ahp-automation', path: `/${id}` }).toString();
}

function isTerminalRun(run: AutomationRunSummary): boolean {
	return run.lifecycle.status === AutomationRunStatus.Completed
		|| run.lifecycle.status === AutomationRunStatus.Failed
		|| run.lifecycle.status === AutomationRunStatus.Cancelled;
}

// Projects Agent Host triggers into the editor-facing schedule model.
function projectSchedule(triggers: AutomationDefinition['triggers']): IAutomationSchedule {
	const trigger = triggers.find(trigger => trigger.kind === AutomationTriggerKind.Schedule);
	if (!trigger) {
		return { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
	}
	const [minuteValue, hourValue, dayOfMonth, month, dayValue, ...remaining] = trigger.schedule.expression.trim().split(/\s+/);
	if (remaining.length > 0 || dayOfMonth !== '*' || month !== '*') {
		return { interval: 'custom', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
	}
	const scheduleMinute = parseCronValue(minuteValue, 0, 59);
	if (scheduleMinute === undefined) {
		return { interval: 'custom', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
	}
	if (hourValue === '*' && dayValue === '*') {
		return { interval: 'hourly', scheduleHour: 0, scheduleMinute, scheduleDay: 0 };
	}
	const scheduleHour = parseCronValue(hourValue, 0, 23);
	if (scheduleHour === undefined) {
		return { interval: 'custom', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
	}
	if (dayValue === '*') {
		return { interval: 'daily', scheduleHour, scheduleMinute, scheduleDay: 0 };
	}
	if (dayValue === '1-5' || dayValue?.toUpperCase() === 'MON-FRI' || dayValue === '1,2,3,4,5') {
		if (triggers.length !== 1
			|| (trigger.misfirePolicy !== undefined && trigger.misfirePolicy !== AutomationMisfirePolicy.RunOnce)
			|| trigger.schedule.timeZone !== (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')) {
			return { interval: 'custom', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
		}
		return { interval: 'weekdays', scheduleHour, scheduleMinute, scheduleDay: 0 };
	}
	const scheduleDay = parseCronValue(dayValue, 0, 6);
	return scheduleDay === undefined
		? { interval: 'custom', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 }
		: { interval: 'weekly', scheduleHour, scheduleMinute, scheduleDay };
}

function parseCronValue(value: string | undefined, minimum: number, maximum: number): number | undefined {
	if (!value || !/^\d+$/.test(value)) {
		return undefined;
	}
	const parsed = Number(value);
	return parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function scheduleTrigger(schedule: IAutomationSchedule): AutomationDefinition['triggers'] {
	if (schedule.interval === 'custom' || schedule.timeZone === 'UTC') {
		throw new Error(localize('automationUnsupportedSchedule', "Choose a local-time schedule for this Agent Host automation."));
	}
	if (schedule.interval === 'manual') {
		return [];
	}
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	let expression: string;
	switch (schedule.interval) {
		case 'hourly':
			expression = `${schedule.scheduleMinute} * * * *`;
			break;
		case 'daily':
			expression = `${schedule.scheduleMinute} ${schedule.scheduleHour} * * *`;
			break;
		case 'weekdays':
			expression = `${schedule.scheduleMinute} ${schedule.scheduleHour} * * 1-5`;
			break;
		case 'weekly':
			expression = `${schedule.scheduleMinute} ${schedule.scheduleHour} * * ${schedule.scheduleDay}`;
			break;
	}
	return [{
		id: 'schedule',
		kind: AutomationTriggerKind.Schedule,
		schedule: { expression, timeZone },
		misfirePolicy: AutomationMisfirePolicy.RunOnce,
	}];
}

function readString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function projectAutomationSessionTemplate(definition: AutomationDefinition, modelId: string | undefined): IAutomationSessionTemplate | undefined {
	const config = omitAutomationSessionTemplateConfigValues({ ...definition.session.config });
	return createAutomationSessionTemplate(modelId, definition.session.model?.config, definition.session.agent, config);
}

function synchronizeAutomationSessionTemplate(template: IAutomationSessionTemplate | undefined, provider: string | undefined, modelId: string | undefined, mode: string | undefined, permissionLevel: string | undefined): IAutomationSessionTemplate | undefined {
	if (!template) {
		return undefined;
	}
	const config = applyLegacyAutomationSessionConfig(provider, template.config, mode, permissionLevel);
	return createAutomationSessionTemplate(modelId, modelId === template.modelId ? template.modelConfiguration : undefined, template.agent, config);
}

function createAutomationSessionTemplate(modelId: string | undefined, modelConfiguration: IAutomationSessionTemplate['modelConfiguration'], agent: IAutomationSessionTemplate['agent'], config: Readonly<Record<string, unknown>>): IAutomationSessionTemplate | undefined {
	if (!modelId && !agent && Object.keys(config).length === 0) {
		return undefined;
	}
	return {
		...(modelId ? { modelId } : {}),
		...(modelId && modelConfiguration !== undefined ? { modelConfiguration } : {}),
		...(agent ? { agent: { uri: agent.uri } } : {}),
		...(Object.keys(config).length > 0 ? { config } : {}),
	};
}

function setOptional(target: Record<string, unknown>, key: string, value: unknown): void {
	if (value === undefined) {
		delete target[key];
	} else {
		target[key] = value;
	}
}

function distinctById<T extends { readonly id: string }>(items: readonly T[]): T[] {
	const result: T[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		if (!seen.has(item.id)) {
			seen.add(item.id);
			result.push(item);
		}
	}
	return result;
}

function isNonTerminalRun(run: IAutomationRun): boolean {
	return run.status === 'pending' || run.status === 'running';
}

/**
 * Reuses the run's own timestamp because the interruption instant is unknowable and deterministic repair must be idempotent.
 */
function terminalizeArchivedRun(run: IAutomationRun): IAutomationRun {
	if (!isNonTerminalRun(run)) {
		return run;
	}
	return Object.freeze({
		...run,
		status: 'failed',
		completedAt: run.completedAt ?? run.startedAt,
		errorMessage: run.errorMessage ?? localize('agentHostAutomation.interruptedLegacyRun', "Legacy run tracking was interrupted."),
	});
}

function isSerializedArchivedRun(value: unknown): value is ISerializedArchivedRun {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}
	const run = value as Record<string, unknown>;
	return typeof run['id'] === 'string'
		&& typeof run['automationId'] === 'string'
		&& (run['status'] === 'pending' || run['status'] === 'running' || run['status'] === 'completed' || run['status'] === 'failed')
		&& (run['trigger'] === 'schedule' || run['trigger'] === 'catch_up' || run['trigger'] === 'manual')
		&& typeof run['startedAt'] === 'string'
		&& (run['sessionResource'] === undefined || typeof run['sessionResource'] === 'string')
		&& (run['completedAt'] === undefined || typeof run['completedAt'] === 'string')
		&& (run['errorMessage'] === undefined || typeof run['errorMessage'] === 'string');
}

interface IArchiveCleanupIntent {
	readonly resource: string;
	readonly rowIds: readonly string[];
}

function isArchiveCleanupIntent(value: unknown): value is IArchiveCleanupIntent {
	return !!value && typeof value === 'object' && 'resource' in value && 'rowIds' in value && typeof value.resource === 'string'
		&& Array.isArray(value.rowIds) && value.rowIds.every(id => typeof id === 'string');
}

function isHistoryDeletionRequest(value: unknown): value is IHistoryDeletionRequest {
	return !!value && typeof value === 'object'
		&& 'requestId' in value && typeof value.requestId === 'string'
		&& 'resource' in value && typeof value.resource === 'string'
		&& 'title' in value && typeof value.title === 'string'
		&& 'rows' in value && Array.isArray(value.rows) && value.rows.every(row =>
			!!row && typeof row === 'object' && 'id' in row && typeof row.id === 'string'
			&& (!('session' in row) || row.session === undefined || typeof row.session === 'string'))
		&& 'sessions' in value && Array.isArray(value.sessions) && value.sessions.every(session => typeof session === 'string');
}

function readArchiveRows(raw: string): { readonly archive: Record<string, unknown>; readonly rows: readonly unknown[] } | undefined {
	try {
		const value: Record<string, unknown> | null = JSON.parse(raw);
		return !!value && typeof value === 'object' && value.version === LEGACY_RUN_ARCHIVE_VERSION && Array.isArray(value.runs)
			? { archive: { ...value }, rows: value.runs } : undefined;
	} catch {
		return undefined;
	}
}

type ParsedArchivedRuns =
	| { readonly kind: 'archive'; readonly runs: readonly IAutomationRun[]; readonly droppedRuns: number }
	| { readonly kind: 'invalid'; readonly error: string }
	| { readonly kind: 'unsupported'; readonly version: number };

function parseArchivedRuns(raw: string): ParsedArchivedRuns {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error) {
		return { kind: 'invalid', error: error instanceof Error ? error.message : String(error) };
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { kind: 'invalid', error: 'archive is not an object' };
	}
	const archive = value as Record<string, unknown>;
	if (typeof archive['version'] === 'number' && archive['version'] > LEGACY_RUN_ARCHIVE_VERSION) {
		return { kind: 'unsupported', version: archive['version'] };
	}
	if (archive['version'] !== LEGACY_RUN_ARCHIVE_VERSION || !Array.isArray(archive['runs'])) {
		return { kind: 'invalid', error: 'archive has an invalid version or runs collection' };
	}
	const runs: IAutomationRun[] = [];
	for (const run of archive['runs']) {
		if (!isSerializedArchivedRun(run)) {
			continue;
		}
		try {
			runs.push({
				...run,
				sessionResource: run.sessionResource ? URI.parse(run.sessionResource) : undefined,
			});
		} catch {
			continue;
		}
	}
	return { kind: 'archive', runs, droppedRuns: archive['runs'].length - runs.length };
}
