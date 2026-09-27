/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable, type IReference } from '../../../../../base/common/lifecycle.js';
import { derived, type IObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { type IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { applyLegacyAutomationSessionConfig } from '../../../../../platform/agentHost/common/automationConfig.js';
import { omitAutomationSessionTemplateConfigValues, pickAutomationDefinitionOwnedConfigValues, SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { type IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { AutomationMisfirePolicy, AutomationOperation, AutomationRunOriginKind, AutomationRunStatus, AutomationTriggerKind, MessageKind, type AutomationDefinition, type AutomationEntry, type AutomationRunSummary, type AutomationState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { AUTOMATION_CATALOG_URI, isAhpAutomationCatalogChannel, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { assertAutomationSessionTemplate, type AutomationTarget, type IAutomationDescriptor, type IAutomationRun, type IAutomationSchedule, type IAutomationSessionTemplate } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationUnavailableError, type AutomationCatalogueState, assertAutomationSessionTemplateAuthority, type AutomationMutationGuard, type IAutomationRunRequestResult, type ICreateAutomationOptions, type IGuardedAutomationUpdateResult, serializeAutomationEditableState, type IUpdateAutomationOptions } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import type { ISessionsProviderAutomations } from '../../../../services/sessions/common/sessionsProvider.js';

const MUTATION_TIMEOUT_MS = 30_000;
const LEGACY_RUN_ARCHIVE_VERSION = 1;

/** The AHP connection surface for Automation catalogue subscriptions and commands. */
export type IAgentHostAutomationConnection = Pick<IAgentConnection,
	'dispatch'
	| 'initializeResult'
	| 'onDidAction'
	| 'runAutomation'
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

	readonly automations: IObservable<readonly IAutomationDescriptor[]>;
	/** Authoritative host runs merged with read-only historical archive rows. */
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
	) {
		super();
		this._archiveKey = `agentHostAutomation.legacyRunArchive.${_providerId}`;
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
			return distinctById([...this._projectRuns(), ...this._archivedRuns.read(reader)])
				.sort((first, second) => second.startedAt.localeCompare(first.startedAt));
		});
	}

	getAutomation(id: string): IAutomationDescriptor | undefined {
		return this._projectAutomation(this._findAutomationEntry(id));
	}

	canRunAutomation(automationId: string): boolean {
		return this._operationAvailable(automationId, AutomationOperation.Run);
	}

	canUpdateAutomation(automationId: string): boolean {
		return this._operationAvailable(automationId, AutomationOperation.Update);
	}

	canDeleteAutomation(automationId: string): boolean {
		return this._operationAvailable(automationId, AutomationOperation.Remove);
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
		const state = await this._createDescriptor(resource, descriptor, mutationGuard);
		return this._requireProjectedAutomation(state);
	}

	async updateAutomation(id: string, patch: IUpdateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IAutomationDescriptor> {
		this._requireOperation(id, AutomationOperation.Update);
		const current = this._requireAutomation(id);
		const updated = this._applyPatch(current, patch);
		const state = await this._replaceDescriptor(updated, patch.sessionTemplate === null, mutationGuard);
		return this._requireProjectedAutomation(state);
	}

	async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		const current = this.getAutomation(id);
		if (!current || serializeAutomationEditableState(current) !== serializeAutomationEditableState(expected)) {
			return { kind: 'conflict', current };
		}
		return { kind: 'updated', automation: await this.updateAutomation(id, patch, mutationGuard) };
	}

	async deleteAutomation(id: string, mutationGuard?: AutomationMutationGuard): Promise<void> {
		const { resource } = this._requireOperation(id, AutomationOperation.Remove);
		await this._dispatchAndWait(
			{ type: ActionType.AutomationRemoved, resource },
			catalog => !catalog.entries.some(automation => automation.resource === resource),
			mutationGuard,
		);
		this._runsForCache.delete(id);
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
			const catalog = await this._waitForCatalog(state => state.entries.some(automation => automation.runs.some(run =>
				run.resource === result.resource && (run.primarySession !== undefined || isTerminalRun(run))
			)), undefined, null);
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
	private _projectSessionResource(resource: string): URI {
		const session = URI.parse(resource);
		const provider = this._boundaryMapper?.providerForSessionScheme?.(session.scheme) ?? session.scheme;
		const resourceScheme = this._boundaryMapper?.resourceSchemeForProvider(provider);
		return resourceScheme ? session.with({ scheme: resourceScheme }) : session;
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
		return {
			id: this._resourceId(state.resource),
			name: state.definition.title,
			prompt: state.definition.message.text,
			schedule: projectSchedule(state.definition.triggers),
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

	private _findAutomationEntry(id: string): AutomationEntry | undefined {
		const catalog = this._catalog.value;
		return catalog && !(catalog instanceof Error)
			? catalog.entries.find(automation => this._resourceId(automation.resource) === id)
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

	private async _createDescriptor(resource: string, descriptor: IAutomationDescriptor, mutationGuard?: AutomationMutationGuard): Promise<AutomationEntry> {
		const definition = this._definitionFromDescriptor(descriptor);
		const state = await this._dispatchAndWait(
			{ type: ActionType.AutomationCreateRequested, resource, definition },
			catalog => catalog.entries.some(automation => automation.resource === resource),
			mutationGuard,
		);
		if (!state) {
			throw new Error(`Automation create completed without authoritative state: ${resource}`);
		}
		return state;
	}

	private async _replaceDescriptor(descriptor: IAutomationDescriptor, resetSessionTemplate = false, mutationGuard?: AutomationMutationGuard): Promise<AutomationEntry> {
		const current = this._findAutomationEntry(descriptor.id);
		if (!current) {
			throw new Error(`Automation does not exist: ${descriptor.id}`);
		}
		const resource = current.resource;
		const definition = this._definitionFromDescriptor(descriptor, current.definition, resetSessionTemplate);
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
				const projected = this._projectAutomation(state);
				if (projected === undefined
					|| serializeAutomationEditableState(projected) !== serializeAutomationEditableState(expected)) {
					return false;
				}
				return true;
			},
			mutationGuard,
		);
		if (!state) {
			throw new Error(`Automation update completed without authoritative state: ${resource}`);
		}
		return state;
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
	): Promise<AutomationEntry | undefined> {
		await this._waitForCatalog(() => true);
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		mutationGuard?.();
		const result = this._waitForCatalog(predicate, action);
		this._connection.dispatch(AUTOMATION_CATALOG_URI, action);
		const catalog = await result;
		const state = catalog.entries.find(automation => automation.resource === action.resource);
		return state;
	}

	private _waitForCatalog(
		predicate: (catalog: AutomationState) => boolean,
		action?: { readonly type: ActionType; readonly resource: string },
		timeoutMs: number | null = MUTATION_TIMEOUT_MS,
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
		return { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
	}
	const scheduleMinute = parseCronValue(minuteValue, 0, 59);
	if (scheduleMinute === undefined) {
		return { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
	}
	if (hourValue === '*' && dayValue === '*') {
		return { interval: 'hourly', scheduleHour: 0, scheduleMinute, scheduleDay: 0 };
	}
	const scheduleHour = parseCronValue(hourValue, 0, 23);
	if (scheduleHour === undefined) {
		return { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
	}
	if (dayValue === '*') {
		return { interval: 'daily', scheduleHour, scheduleMinute, scheduleDay: 0 };
	}
	const scheduleDay = parseCronValue(dayValue, 0, 6);
	return scheduleDay === undefined
		? { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 }
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
