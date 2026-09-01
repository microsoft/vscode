/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, timeout } from '../../../../../base/common/async.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable, type IReference } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, type IObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { type IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY, AGENT_HOST_LEGACY_AUTOMATION_IMPORT_META_KEY, AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY } from '../../../../../platform/agentHost/common/automationMigration.js';
import { isAgentHostAutomationCatalogMigrated, isAgentHostLegacyAutomationImport, isAgentHostLegacyAutomationImportPending } from '../../../../../platform/agentHost/common/meta/automationMeta.js';
import { SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { type IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { AutomationMisfirePolicy, AutomationOperation, AutomationRunOriginKind, AutomationRunStatus, AutomationTriggerKind, MessageKind, type AutomationDefinition, type AutomationEntry, type AutomationRunSummary, type AutomationState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { AUTOMATION_CATALOG_URI, isAhpAutomationCatalogChannel, ROOT_STATE_URI, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import type { AutomationRunTrigger, AutomationTarget, IAutomationDescriptor, IAutomationRun, IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationActiveRunError, type AutomationMutationGuard, type IAutomationRunClaim, type ICreateAutomationOptions, type IGuardedAutomationUpdateResult, isAutomationActiveRunError, serializeAutomationEditableState, type IUpdateAutomationOptions, type IUpdateAutomationRunOptions } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { publishAutomationMigration } from '../../../../../workbench/contrib/chat/common/automations/automationTelemetry.js';
import type { IAutomation, IAutomationSnapshotImportResult, IGuardedAutomationSnapshotRemovalResult, ISessionsProviderAutomations } from '../../../../services/sessions/common/sessionsProvider.js';
import { IAutomationStorageService } from '../../../automations/common/automationStorageService.js';

const MUTATION_TIMEOUT_MS = 30_000;
const MIGRATION_POLL_INTERVAL_MS = 50;
const LEGACY_RUN_ARCHIVE_VERSION = 1;
const LEGACY_RUN_ARCHIVE_WRITE_ATTEMPTS = 10;

export type IAgentHostAutomationConnection = Pick<IAgentConnection,
	'dispatch'
	| 'initializeResult'
	| 'listAutomationTriggerDefinitions'
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

interface ILegacyRunArchive {
	readonly version: 1;
	readonly runs: readonly ISerializedArchivedRun[];
}

interface ILoadedLegacyRunArchive {
	readonly runs: readonly IAutomationRun[];
	readonly repairedRuns: number;
}

export interface IAgentHostAutomationBoundaryMapper {
	toHost(resource: URI): URI;
	fromHost(resource: URI): URI;
	resourceSchemeForProvider(provider: string): string;
	providerForSessionScheme?(scheme: string): string;
	providerForResourceScheme?(scheme: string): string | undefined;
}

export class AgentHostAutomationStore extends Disposable implements ISessionsProviderAutomations {

	readonly preservesImportedRunHistory = true;

	private readonly _catalogReference: IReference<IAgentSubscription<AutomationState>>;
	private readonly _catalog: IAgentSubscription<AutomationState>;
	private readonly _catalogChanged;
	private readonly _ready = observableValue(this, false);
	private readonly _runsForCache = new Map<string, IObservable<readonly IAutomationRun[]>>();
	private readonly _pendingWaits = this._register(new DisposableMap<number, DisposableStore>());
	private _pendingWaitIds = 0;
	private readonly _archiveKey: string;
	private readonly _archivedRuns;
	private _migrationPromise: Promise<void> | undefined;
	private _lastPreflightDeferralKey: string | undefined;

	readonly automations: IObservable<readonly IAutomationDescriptor[]>;
	readonly runs: IObservable<readonly IAutomationRun[]>;

	constructor(
		private readonly _providerId: string,
		private readonly _connection: IAgentHostAutomationConnection,
		private readonly _legacySource: ISessionsProviderAutomations | undefined,
		private readonly _boundaryMapper: IAgentHostAutomationBoundaryMapper | undefined,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IAutomationStorageService private readonly _automationStorageService: IAutomationStorageService,
	) {
		super();
		this._archiveKey = `agentHostAutomation.legacyRunArchive.${_providerId}`;
		const archive = this._loadArchivedRuns();
		this._archivedRuns = observableValue<readonly IAutomationRun[]>(this, archive.runs);
		this._persistRepairedArchivedRuns(archive);
		this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, this._archiveKey, this._store)(() => {
			const archive = this._loadArchivedRuns();
			this._archivedRuns.set(archive.runs, undefined);
			this._persistRepairedArchivedRuns(archive);
		}));
		this._catalogReference = this._register(_connection.getSubscription(
			StateComponents.AutomationCatalog,
			URI.parse(AUTOMATION_CATALOG_URI),
			'AgentHostAutomationStore',
		));
		this._catalog = this._catalogReference.object;
		this._catalogChanged = observableSignalFromEvent(this, this._catalog.onDidChange);
		if (this._catalog.onDidError) {
			this._register(this._catalog.onDidError(error => this._logService.error(`[AgentHostAutomationStore] Catalogue subscription failed: ${error.message}`)));
		}
		this._register(autorun(reader => {
			this._catalogChanged.read(reader);
			const catalog = this._catalog.value;
			if (catalog && !(catalog instanceof Error)
				&& (isAgentHostAutomationCatalogMigrated(catalog)
					|| catalog.entries.some(automation => automation.operations.includes(AutomationOperation.Run)))
				&& !catalog.entries.some(automation => isAgentHostLegacyAutomationImportPending(automation.definition))
				&& (!this._legacySource || this._legacySource.automations.read(reader).length === 0)
				&& !this._migrationPromise
				&& !this._ready.read(reader)) {
				this._ready.set(true, undefined);
			}
		}));
		this.automations = derived(this, reader => {
			this._catalogChanged.read(reader);
			if (!this._ready.read(reader)) {
				return distinctById([
					...(this._legacySource?.automations.read(reader) ?? []),
					...this._projectAutomations(),
				]);
			}
			return this._projectAutomations();
		});
		this.runs = derived(this, reader => {
			this._catalogChanged.read(reader);
			if (!this._ready.read(reader)) {
				return distinctById([
					...(this._legacySource?.runs.read(reader) ?? []),
					...this._archivedRuns.read(reader),
				]).sort((first, second) => second.startedAt.localeCompare(first.startedAt));
			}
			return distinctById([...this._projectRuns(), ...this._archivedRuns.read(reader)])
				.sort((first, second) => second.startedAt.localeCompare(first.startedAt));
		});
	}

	getAutomation(id: string): IAutomationDescriptor | undefined {
		return this._ready.get()
			? this._projectAutomation(this._findAutomationEntry(id))
			: this._legacySource?.getAutomation(id) ?? this._projectAutomation(this._findAutomationEntry(id));
	}

	isSchedulingOwnedByHost(automationId: string): boolean {
		if (!this._ready.get()) {
			return false;
		}
		const state = this._findAutomationEntry(automationId);
		return state !== undefined
			&& !isAgentHostLegacyAutomationImportPending(state.definition)
			&& state.operations.includes(AutomationOperation.Run);
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
		await this._waitForMigrationBeforeMutation();
		if (!this._ready.get() && this._legacySource) {
			return this._legacySource.createAutomation(options, mutationGuard);
		}
		mutationGuard?.();
		const now = new Date();
		const descriptor: IAutomationDescriptor = {
			id: generateUuid(),
			name: options.name,
			prompt: options.prompt,
			schedule: options.schedule,
			target: options.target,
			modelId: options.modelId,
			mode: options.mode,
			permissionLevel: options.permissionLevel,
			enabled: options.enabled ?? true,
			createdAt: now.toISOString(),
			updatedAt: now.toISOString(),
		};
		const state = await this._createDescriptor(descriptor);
		return this._requireProjectedAutomation(state);
	}

	async updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomationDescriptor> {
		await this._waitForMigrationBeforeMutation();
		if (!this._ready.get() && this._legacySource?.getAutomation(id)) {
			return this._legacySource.updateAutomation(id, patch);
		}
		this._requireOperation(id, AutomationOperation.Update);
		const current = this._requireAutomation(id);
		const updated = this._applyPatch(current, patch);
		const state = await this._replaceDescriptor(updated);
		return this._requireProjectedAutomation(state);
	}

	async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		await this._waitForMigrationBeforeMutation();
		if (!this._ready.get() && this._legacySource?.getAutomation(id)) {
			return this._legacySource.updateAutomationIfUnchanged(id, patch, expected, mutationGuard);
		}
		mutationGuard?.();
		const current = this.getAutomation(id);
		if (!current || serializeAutomationEditableState(current) !== serializeAutomationEditableState(expected)) {
			return { kind: 'conflict', current };
		}
		return { kind: 'updated', automation: await this.updateAutomation(id, patch) };
	}

	async deleteAutomation(id: string, mutationGuard?: AutomationMutationGuard): Promise<void> {
		await this._waitForMigrationBeforeMutation();
		if (!this._ready.get() && this._legacySource?.getAutomation(id)) {
			return this._legacySource.deleteAutomation(id, mutationGuard);
		}
		this._requireOperation(id, AutomationOperation.Remove);
		mutationGuard?.();
		const resource = automationResource(id);
		if (!this._findAutomationEntry(id)) {
			return;
		}
		await this._dispatchAndWait(
			{ type: ActionType.AutomationRemoved, resource },
			catalog => !catalog.entries.some(automation => automation.resource === resource),
		);
		this._runsForCache.delete(id);
	}

	async importAutomationSnapshot(snapshot: IAutomation): Promise<IAutomationSnapshotImportResult> {
		return this._importAutomationSnapshot(snapshot, true);
	}

	private async _importAutomationSnapshot(snapshot: IAutomation, importPending: boolean): Promise<IAutomationSnapshotImportResult> {
		assertTerminalRunHistory(snapshot.runs);
		const existing = this._findAutomationEntry(snapshot.automation.id);
		if (existing) {
			const current = this._requireProjectedAutomation(existing);
			const expected = this._canonicalDescriptor(snapshot.automation, existing);
			if (serializeAutomationEditableState(current) !== serializeAutomationEditableState(expected)) {
				if (isAgentHostLegacyAutomationImport(existing.definition)) {
					await this._replaceDescriptor(snapshot.automation, true, importPending);
					await this._archiveRuns(snapshot.runs);
					return { kind: 'alreadyPresent' };
				}
				return { kind: 'conflict', current: { automation: current, runs: this._projectRunsFor(existing.resource) } };
			}
			// Editable state matches, but if the caller is staging pending and
			// the existing definition is not already pending, re-dispatch so the
			// meta flag lands. Otherwise a retry after a lost dispatch would
			// leave Run authority granted on a not-yet-drained legacy row.
			if (importPending && !isAgentHostLegacyAutomationImportPending(existing.definition)) {
				await this._replaceDescriptor(snapshot.automation, true, importPending);
			}
			await this._archiveRuns(snapshot.runs);
			return { kind: 'alreadyPresent' };
		}
		await this._createDescriptor(snapshot.automation, true, importPending);
		await this._archiveRuns(snapshot.runs);
		this._logService.info(`[AgentHostAutomationStore] Migrated Automation definition: resource=${automationResource(snapshot.automation.id)}, legacyRunsRetained=${snapshot.runs.length}.`);
		return { kind: 'inserted' };
	}

	async upsertAutomationSnapshot(snapshot: IAutomation): Promise<void> {
		assertTerminalRunHistory(snapshot.runs);
		if (this._findAutomationEntry(snapshot.automation.id)) {
			await this._replaceDescriptor(snapshot.automation, true, true);
		} else {
			await this._createDescriptor(snapshot.automation, true, true);
		}
		await this._archiveRuns(snapshot.runs);
	}

	async removeAutomationSnapshotIfUnchanged(expected: IAutomation): Promise<IGuardedAutomationSnapshotRemovalResult> {
		const current = this._findAutomationEntry(expected.automation.id);
		if (!current) {
			return { kind: 'missing' };
		}
		const projected = this._requireProjectedAutomation(current);
		const canonicalExpected = this._canonicalDescriptor(expected.automation, current);
		if (serializeAutomationEditableState(projected) !== serializeAutomationEditableState(canonicalExpected)) {
			return { kind: 'conflict', current: { automation: projected, runs: this._projectRunsFor(current.resource) } };
		}
		await this.deleteAutomation(expected.automation.id);
		return { kind: 'removed' };
	}

	async acknowledgeAutomationSnapshotImported(snapshot: IAutomation): Promise<void> {
		const current = this._findAutomationEntry(snapshot.automation.id);
		if (!current || !isAgentHostLegacyAutomationImportPending(current.definition)) {
			return;
		}
		await this._clearImportPending(snapshot.automation.id);
	}

	async recordRunStart(automationId: string, trigger: AutomationRunTrigger, _leaderWindowId: number): Promise<IAutomationRunClaim> {
		if (!this._ready.get() && this._legacySource?.getAutomation(automationId)) {
			return this._legacySource.recordRunStart(automationId, trigger, _leaderWindowId);
		}
		if (trigger !== 'manual') {
			throw new Error('Scheduled Automation execution is owned by the Agent Host.');
		}
		this._requireOperation(automationId, AutomationOperation.Run);
		const activeRun = this.getActiveRunFor(automationId);
		if (activeRun) {
			return { claimed: false, run: activeRun };
		}
		const result = await this._connection.runAutomation({
			channel: AUTOMATION_CATALOG_URI,
			automation: automationResource(automationId),
			requestId: generateUuid(),
		});
		const catalog = await this._waitForCatalog(state => state.entries.some(automation => automation.runs.some(run =>
			run.resource === result.resource && (run.primarySession !== undefined || isTerminalRun(run))
		)));
		const run = catalog.entries.flatMap(automation => automation.runs).find(candidate => candidate.resource === result.resource);
		if (!run) {
			throw new Error(`Automation run did not appear in the authoritative catalogue: ${result.resource}`);
		}
		const projectedRun = this._projectRun(run);
		return {
			claimed: false,
			run: projectedRun,
			externalDispatch: {
				sessionResource: projectedRun.sessionResource,
				whenCompleted: this._waitForCatalog(state => state.entries.some(automation => automation.runs.some(candidate =>
					candidate.resource === result.resource && isTerminalRun(candidate)
				)), undefined, null).then(() => undefined),
				...(this._connection.initializeResult.get()?.automations?.runCancellation ? {
					cancel: () => this._connection.dispatch(result.resource, { type: ActionType.AutomationRunCancelRequested }),
				} : {}),
			},
		};
	}

	// Projects an Agent Host session resource into the editor-facing provider scheme.
	private _projectSessionResource(resource: string): URI {
		const session = URI.parse(resource);
		const provider = this._boundaryMapper?.providerForSessionScheme?.(session.scheme) ?? session.scheme;
		const resourceScheme = this._boundaryMapper?.resourceSchemeForProvider(provider);
		return resourceScheme ? session.with({ scheme: resourceScheme }) : session;
	}

	async updateRun(runId: string, _patch: IUpdateAutomationRunOptions): Promise<IAutomationRun | undefined> {
		if (!this._ready.get() && this._legacySource?.runs.get().some(run => run.id === runId)) {
			return this._legacySource.updateRun(runId, _patch);
		}
		return this.runs.get().find(run => run.id === runId);
	}

	async deleteRun(runId: string): Promise<void> {
		if (!this._ready.get() && this._legacySource?.runs.get().some(run => run.id === runId)) {
			return this._legacySource.deleteRun(runId);
		}
		throw new Error('Automation run history is owned by the Agent Host.');
	}

	getActiveRunFor(automationId: string): IAutomationRun | undefined {
		if (!this._ready.get() && this._legacySource?.getAutomation(automationId)) {
			return this._legacySource.getActiveRunFor(automationId);
		}
		return this.runs.get().find(run => run.automationId === automationId && (run.status === 'pending' || run.status === 'running'));
	}

	async markStaleRunsFailed(reason: string): Promise<void> {
		if (!this._ready.get() && this._legacySource) {
			return this._legacySource.markStaleRunsFailed(reason);
		}
	}

	async completeMigration(): Promise<void> {
		if (this._ready.get()) {
			return;
		}
		if (this._migrationPromise) {
			return this._migrationPromise;
		}
		const migration = this._completeMigration();
		this._migrationPromise = migration;
		try {
			await migration;
		} finally {
			if (this._migrationPromise === migration) {
				this._migrationPromise = undefined;
			}
		}
	}

	private async _completeMigration(): Promise<void> {
		const startedAt = Date.now();
		const source = this._legacySource;
		const discovered = source ? [...source.automations.get()] : [];
		const activeRuns = source
			? discovered.flatMap(automation => source.runsFor(automation.id).get().filter(isNonTerminalRun))
			: [];
		if (activeRuns.length > 0) {
			const deferralKey = activeRuns.map(run => run.id).sort().join(',');
			if (this._lastPreflightDeferralKey !== deferralKey) {
				this._lastPreflightDeferralKey = deferralKey;
				publishAutomationMigration(this._telemetryService, {
					outcome: 'deferred',
					discoveredCount: discovered.length,
					migratedCount: 0,
					failedCount: 0,
					durationMs: Date.now() - startedAt,
				});
			}
			this._logService.info(`[AgentHostAutomationStore] Automation migration deferred: activeRuns=${activeRuns.length}.`);
			throw new AutomationActiveRunError(activeRuns[0].automationId, activeRuns[0].id);
		}
		this._lastPreflightDeferralKey = undefined;
		this._logService.info(`[AgentHostAutomationStore] Automation migration started: discovered=${discovered.length}.`);
		publishAutomationMigration(this._telemetryService, {
			outcome: 'started',
			discoveredCount: discovered.length,
			migratedCount: 0,
			failedCount: 0,
			durationMs: 0,
		});
		let migratedCount = 0;
		let failedCount = 0;
		try {
			if (source?.canCompleteMigration?.() === false) {
				throw new Error('Legacy Automation storage cannot be migrated safely by this version.');
			}
			const failures: Error[] = [];
			for (const automation of discovered) {
				try {
					await this._migrateLegacySourceAutomation(automation);
					migratedCount++;
				} catch (error) {
					if (isCancellationError(error) || this._store.isDisposed) {
						throw new CancellationError();
					}
					const failure = error instanceof Error ? error : new Error(String(error));
					failures.push(failure);
					failedCount++;
					if (isAutomationActiveRunError(error)) {
						this._logService.info(`[AgentHostAutomationStore] Automation migration item deferred while a run is active: resource=${automationResource(automation.id)}.`);
					} else {
						this._logService.error(`[AgentHostAutomationStore] Automation migration item failed: resource=${automationResource(automation.id)}, error=${failure.message}`);
					}
				}
			}
			if (failures.length > 0) {
				throw new AggregateError(failures, `Failed to migrate ${failures.length} Agent Host Automation definition(s).`);
			}

			this._requireLegacySourceDrained();
			await this._waitForCatalog(() => true);
			const resources = discovered.map(automation => automationResource(automation.id));
			this._connection.dispatch(ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged,
				config: {
					[AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY]: {
						version: 1,
						status: 'complete',
						resources,
					},
				},
			});
			await this._waitForMigrationCompletion();
			this._requireLegacySourceDrained();
			// Sweep any stragglers whose pending flag never cleared. This
			// covers reconnect races and cross-provider transfers that stage
			// pending without a subsequent acknowledgement path.
			await this._drainPendingImports();
			this._ready.set(true, undefined);
			const durationMs = Date.now() - startedAt;
			this._logService.info(`[AgentHostAutomationStore] Automation migration completed: discovered=${discovered.length}, migrated=${resources.length}, failed=0, durationMs=${durationMs}.`);
			publishAutomationMigration(this._telemetryService, {
				outcome: 'completed',
				discoveredCount: discovered.length,
				migratedCount: resources.length,
				failedCount: 0,
				durationMs,
			});
		} catch (error) {
			if (isCancellationError(error)) {
				throw error;
			}
			const durationMs = Date.now() - startedAt;
			if (isAutomationActiveRunError(error)) {
				this._logService.info(`[AgentHostAutomationStore] Automation migration deferred after ${migratedCount} item(s) while a run became active.`);
				publishAutomationMigration(this._telemetryService, {
					outcome: 'deferred',
					discoveredCount: discovered.length,
					migratedCount,
					failedCount: 0,
					durationMs,
				});
				throw error;
			}
			if (error instanceof AggregateError) {
				failedCount = Math.max(failedCount, error.errors.length);
			}
			this._logService.error(`[AgentHostAutomationStore] Automation migration failed: discovered=${discovered.length}, migrated=${migratedCount}, failed=${failedCount}, durationMs=${durationMs}, error=${error instanceof Error ? error.message : String(error)}.`);
			publishAutomationMigration(this._telemetryService, {
				outcome: 'failed',
				discoveredCount: discovered.length,
				migratedCount,
				failedCount,
				durationMs,
			});
			throw error;
		}
	}

	private async _waitForMigrationBeforeMutation(): Promise<void> {
		const migration = this._migrationPromise;
		if (migration) {
			await migration;
		}
	}

	private _requireLegacySourceDrained(): void {
		const remaining = this._legacySource?.automations.get().length ?? 0;
		if (remaining > 0) {
			throw new Error(`Automation migration source changed during migration; ${remaining} definition(s) remain.`);
		}
	}

	private async _migrateLegacySourceAutomation(initialAutomation: IAutomationDescriptor): Promise<void> {
		const source = this._legacySource;
		if (!source) {
			return;
		}
		let snapshot: IAutomation = { automation: initialAutomation, runs: source.runsFor(initialAutomation.id).get() };
		for (let attempt = 0; attempt < 3; attempt++) {
			const result = await this._importAutomationSnapshot(snapshot, true);
			if (result.kind === 'conflict') {
				throw new Error(`Automation conflicts with the Agent Host catalogue: ${automationResource(initialAutomation.id)}`);
			}
			const removal = await source.removeAutomationSnapshotIfUnchanged(snapshot);
			if (removal.kind === 'removed' || removal.kind === 'missing') {
				// Legacy row is durably gone. Clear the pending flag so the
				// host can grant Run authority now that no other authority
				// owns the source.
				await this._clearImportPending(initialAutomation.id);
				return;
			}
			snapshot = removal.current;
		}
		throw new Error(`Automation kept changing while migrating: ${automationResource(initialAutomation.id)}`);
	}

	private async _clearImportPending(automationId: string): Promise<void> {
		const current = this._findAutomationEntry(automationId);
		if (!current || !isAgentHostLegacyAutomationImportPending(current.definition)) {
			return;
		}
		const projected = this._projectAutomation(current);
		if (!projected) {
			return;
		}
		await this._replaceDescriptor(projected, isAgentHostLegacyAutomationImport(current.definition), false);
	}

	private async _drainPendingImports(): Promise<void> {
		const catalog = this._catalog.value;
		if (!catalog || catalog instanceof Error) {
			return;
		}
		const failures: Error[] = [];
		const pending = catalog.entries.filter(automation => isAgentHostLegacyAutomationImportPending(automation.definition));
		for (const automation of pending) {
			if (this._store.isDisposed) {
				throw new CancellationError();
			}
			const id = automationId(automation.resource);
			const legacyEntry = this._legacySource?.getAutomation(id);
			try {
				if (legacyEntry) {
					await this._migrateLegacySourceAutomation(legacyEntry);
				} else {
					// Stranded pending row: the legacy source row was removed
					// by another authority (e.g., a cross-provider transfer)
					// without acknowledging the AHP import. Clear the flag so
					// the host can start scheduling the automation.
					await this._clearImportPending(id);
				}
			} catch (error) {
				if (isCancellationError(error) || this._store.isDisposed) {
					throw new CancellationError();
				}
				const failure = error instanceof Error ? error : new Error(String(error));
				failures.push(failure);
				this._logService.error(`[AgentHostAutomationStore] Failed to drain pending Automation import: id=${id}, error=${failure.message}`);
			}
		}
		if (failures.length > 0) {
			throw new AggregateError(failures, `Failed to drain ${failures.length} pending Agent Host Automation import(s).`);
		}
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

	// Projects one Agent Host Automation's run summaries into editor-facing runs.
	private _projectRunsFor(resource: string): IAutomationRun[] {
		return this._findAutomationEntryByResource(resource)?.runs.map(run => this._projectRun(run)) ?? [];
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
		const config = state.definition.session.config;
		const newestRun = state.runs[0];
		return {
			id: automationId(state.resource),
			name: state.definition.title,
			prompt: state.definition.message.text,
			schedule: projectSchedule(state.definition.triggers),
			target,
			modelId: this._projectModelId(state.definition.session.model?.id, state.definition.session.provider),
			mode: readString(config?.[SessionConfigKey.Mode]),
			permissionLevel: readString(config?.[SessionConfigKey.AutoApprove]),
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
			id: automationRunId(run.resource),
			automationId: automationId(run.automation),
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
			leaderWindowId: 0,
		};
	}

	private _findAutomationEntry(id: string): AutomationEntry | undefined {
		return this._findAutomationEntryByResource(automationResource(id));
	}

	private _findAutomationEntryByResource(resource: string): AutomationEntry | undefined {
		const catalog = this._catalog.value;
		return catalog && !(catalog instanceof Error)
			? catalog.entries.find(automation => automation.resource === resource)
			: undefined;
	}

	private _requireAutomation(id: string): IAutomationDescriptor {
		const automation = this.getAutomation(id);
		if (!automation) {
			throw new Error(`Automation does not exist: ${id}`);
		}
		return automation;
	}

	private _operationAvailable(id: string, operation: AutomationOperation): boolean {
		if (!this._ready.get() && this._legacySource?.getAutomation(id)) {
			return true;
		}
		return this._findAutomationEntry(id)?.operations.includes(operation) === true;
	}

	private _requireOperation(id: string, operation: AutomationOperation): void {
		if (!this._operationAvailable(id, operation)) {
			throw new Error(`Automation operation '${operation}' is not available: ${id}`);
		}
	}

	private _requireProjectedAutomation(state: AutomationEntry): IAutomationDescriptor {
		const automation = this._projectAutomation(state);
		if (!automation) {
			throw new Error(`Automation cannot be represented by the compatibility view: ${state.resource}`);
		}
		return automation;
	}

	private async _createDescriptor(descriptor: IAutomationDescriptor, imported = false, importPending?: boolean): Promise<AutomationEntry> {
		const resource = automationResource(descriptor.id);
		const definition = this._definitionFromDescriptor(descriptor, undefined, imported, importPending);
		const state = await this._dispatchAndWait(
			{ type: ActionType.AutomationCreateRequested, resource, definition },
			catalog => catalog.entries.some(automation => automation.resource === resource),
		);
		if (!state) {
			throw new Error(`Automation create completed without authoritative state: ${resource}`);
		}
		return state;
	}

	private async _replaceDescriptor(descriptor: IAutomationDescriptor, imported = false, importPending?: boolean): Promise<AutomationEntry> {
		const resource = automationResource(descriptor.id);
		const current = this._findAutomationEntry(descriptor.id);
		if (!current) {
			throw new Error(`Automation does not exist: ${descriptor.id}`);
		}
		const definition = this._definitionFromDescriptor(descriptor, current.definition, imported, importPending);
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
				// The pending flag lives on definition._meta, which the
				// editable-state comparison does not observe. Force the wait
				// to also see the intended pending state so a caller that
				// depends on the flag being (un)set doesn't race the host.
				if (importPending === true) {
					return isAgentHostLegacyAutomationImportPending(state!.definition);
				}
				if (importPending === false) {
					return !isAgentHostLegacyAutomationImportPending(state!.definition);
				}
				return true;
			},
		);
		if (!state) {
			throw new Error(`Automation update completed without authoritative state: ${resource}`);
		}
		return state;
	}

	private _definitionFromDescriptor(descriptor: IAutomationDescriptor, existing?: AutomationDefinition, imported = false, importPending?: boolean): AutomationDefinition {
		const config = { ...existing?.session.config };
		const provider = descriptor.target.sessionTypeId ?? this._providerFromModelId(descriptor.modelId);
		setOptional(config, SessionConfigKey.Mode, descriptor.mode);
		setOptional(config, SessionConfigKey.AutoApprove, descriptor.permissionLevel);
		if (descriptor.target.kind === 'workspace') {
			setOptional(config, SessionConfigKey.Isolation, descriptor.target.isolation.kind === 'default' ? undefined : descriptor.target.isolation.kind);
			setOptional(config, SessionConfigKey.Branch, descriptor.target.isolation.kind === 'worktree' ? descriptor.target.isolation.branch : undefined);
		} else {
			setOptional(config, SessionConfigKey.Isolation, undefined);
			setOptional(config, SessionConfigKey.Branch, undefined);
		}
		const meta: Record<string, unknown> = {
			...existing?._meta,
			...((imported || isAgentHostLegacyAutomationImport(existing)) ? { [AGENT_HOST_LEGACY_AUTOMATION_IMPORT_META_KEY]: true } : {}),
		};
		if (importPending === true) {
			meta[AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY] = true;
		} else if (importPending === false) {
			delete meta[AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY];
		}
		return {
			title: descriptor.name,
			message: { text: descriptor.prompt, origin: { kind: MessageKind.Automation } },
			session: {
				provider,
				model: descriptor.modelId ? { id: this._toHostModelId(descriptor.modelId, provider) } : undefined,
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

	private _canonicalDescriptor(descriptor: IAutomationDescriptor, state: AutomationEntry): IAutomationDescriptor {
		const definition = this._definitionFromDescriptor(descriptor, state.definition);
		return this._requireProjectedAutomation({ ...state, definition });
	}

	private _applyPatch(current: IAutomationDescriptor, patch: IUpdateAutomationOptions): IAutomationDescriptor {
		const now = new Date();
		const schedule = patch.schedule ?? current.schedule;
		const enabled = patch.enabled ?? current.enabled;
		const target = patch.target ?? current.target;
		const targetAuthorityChanged = patch.target !== undefined
			&& (patch.target.providerId !== current.target.providerId || patch.target.sessionTypeId !== current.target.sessionTypeId);
		return {
			...current,
			...(patch.name !== undefined ? { name: patch.name } : {}),
			...(patch.prompt !== undefined ? { prompt: patch.prompt } : {}),
			schedule,
			target,
			modelId: patch.modelId === null
				? undefined
				: patch.modelId ?? (targetAuthorityChanged ? undefined : current.modelId),
			mode: patch.mode === null ? undefined : patch.mode ?? current.mode,
			permissionLevel: patch.permissionLevel === null ? undefined : patch.permissionLevel ?? current.permissionLevel,
			enabled,
			updatedAt: now.toISOString(),
		};
	}

	private async _dispatchAndWait(
		action: Parameters<IAgentConnection['dispatch']>[1] & { readonly resource: string },
		predicate: (catalog: AutomationState) => boolean,
	): Promise<AutomationEntry | undefined> {
		await this._waitForCatalog(() => true);
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

	private async _waitForMigrationCompletion(): Promise<void> {
		const deadline = Date.now() + MUTATION_TIMEOUT_MS;
		let lastError: Error | undefined;
		while (Date.now() < deadline) {
			if (this._store.isDisposed) {
				throw new CancellationError();
			}
			try {
				await this._connection.listAutomationTriggerDefinitions({ channel: ROOT_STATE_URI });
				return;
			} catch (error) {
				if (isCancellationError(error) || this._store.isDisposed) {
					throw new CancellationError();
				}
				lastError = error instanceof Error ? error : new Error(String(error));
				await timeout(MIGRATION_POLL_INTERVAL_MS);
			}
		}
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		throw lastError ?? new Error('Timed out waiting for Agent Host Automation migration completion.');
	}

	private _loadArchivedRuns(): ILoadedLegacyRunArchive {
		const raw = this._storageService.get(this._archiveKey, StorageScope.APPLICATION);
		if (!raw) {
			return { runs: [], repairedRuns: 0 };
		}
		const parsed = parseArchivedRuns(raw);
		if (parsed.kind === 'unsupported') {
			this._logService.error(`[AgentHostAutomationStore] Ignoring legacy run archive with unsupported version: key=${this._archiveKey}, version=${parsed.version}.`);
			return { runs: [], repairedRuns: 0 };
		}
		if (parsed.kind === 'invalid') {
			this._logService.error(`[AgentHostAutomationStore] Ignoring invalid legacy run archive: key=${this._archiveKey}, error=${parsed.error}.`);
			return { runs: [], repairedRuns: 0 };
		}
		if (parsed.droppedRuns > 0) {
			this._logService.warn(`[AgentHostAutomationStore] Dropped ${parsed.droppedRuns} malformed run(s) from legacy run archive: key=${this._archiveKey}.`);
		}
		let repairedRuns = 0;
		const runs = parsed.runs.map(run => {
			const terminalRun = terminalizeArchivedRun(run);
			if (terminalRun !== run) {
				repairedRuns++;
			}
			return terminalRun;
		});
		return { runs, repairedRuns };
	}

	private _persistRepairedArchivedRuns(archive: ILoadedLegacyRunArchive): void {
		if (archive.repairedRuns === 0) {
			return;
		}
		this._logService.warn(`[AgentHostAutomationStore] Repairing ${archive.repairedRuns} non-terminal legacy Automation run(s): key=${this._archiveKey}.`);
		void this._repairArchivedRuns().catch(error => {
			this._logService.error(`[AgentHostAutomationStore] Failed to persist repaired legacy Automation runs: key=${this._archiveKey}, error=${error instanceof Error ? error.message : String(error)}.`);
		});
	}

	private async _repairArchivedRuns(): Promise<void> {
		let raw = await this._automationStorageService.read(this._archiveKey);
		for (let attempt = 0; attempt < LEGACY_RUN_ARCHIVE_WRITE_ATTEMPTS; attempt++) {
			if (raw === undefined) {
				return;
			}
			const parsed = parseArchivedRuns(raw);
			if (parsed.kind === 'unsupported') {
				throw new Error(`Cannot repair legacy Automation run archive with unsupported version: key=${this._archiveKey}, version=${parsed.version}.`);
			}
			if (parsed.kind === 'invalid') {
				throw new Error(`Cannot repair invalid legacy Automation run archive: key=${this._archiveKey}, error=${parsed.error}.`);
			}
			const runs = parsed.runs.map(terminalizeArchivedRun);
			if (runs.every((run, index) => run === parsed.runs[index])) {
				this._archivedRuns.set(runs, undefined);
				return;
			}
			const archive: ILegacyRunArchive = {
				version: LEGACY_RUN_ARCHIVE_VERSION,
				runs: runs.map(run => ({
					...run,
					sessionResource: run.sessionResource?.toString(),
				})),
			};
			const result = await this._automationStorageService.compareAndSwap(this._archiveKey, raw, JSON.stringify(archive));
			if (result.swapped) {
				this._archivedRuns.set(runs, undefined);
				return;
			}
			raw = result.currentValue;
		}
		throw new Error(`Legacy Automation run archive kept changing while it was being repaired: ${this._archiveKey}`);
	}

	private async _archiveRuns(runs: readonly IAutomationRun[]): Promise<void> {
		if (runs.length === 0) {
			return;
		}
		let raw = await this._automationStorageService.read(this._archiveKey);
		for (let attempt = 0; attempt < LEGACY_RUN_ARCHIVE_WRITE_ATTEMPTS; attempt++) {
			let current: readonly IAutomationRun[] = [];
			if (raw !== undefined) {
				const parsed = parseArchivedRuns(raw);
				if (parsed.kind === 'unsupported') {
					throw new Error(`Cannot update legacy Automation run archive with unsupported version: key=${this._archiveKey}, version=${parsed.version}.`);
				}
				if (parsed.kind === 'invalid') {
					this._logService.error(`[AgentHostAutomationStore] Replacing invalid legacy run archive: key=${this._archiveKey}, error=${parsed.error}.`);
				} else {
					current = parsed.runs;
					if (parsed.droppedRuns > 0) {
						this._logService.warn(`[AgentHostAutomationStore] Dropping ${parsed.droppedRuns} malformed run(s) while repairing legacy run archive: key=${this._archiveKey}.`);
					}
				}
			}
			const merged = distinctById([...runs, ...current]).map(terminalizeArchivedRun);
			const archive: ILegacyRunArchive = {
				version: LEGACY_RUN_ARCHIVE_VERSION,
				runs: merged.map(run => ({
					...run,
					sessionResource: run.sessionResource?.toString(),
				})),
			};
			const next = JSON.stringify(archive);
			const result = await this._automationStorageService.compareAndSwap(this._archiveKey, raw, next);
			if (result.swapped) {
				this._archivedRuns.set(merged, undefined);
				return;
			}
			raw = result.currentValue;
		}
		throw new Error(`Legacy Automation run archive kept changing while it was being updated: ${this._archiveKey}`);
	}
}

function automationResource(id: string): string {
	return URI.from({ scheme: 'ahp-automation', path: `/${id}` }).toString();
}

function automationId(resource: string): string {
	return URI.parse(resource).path.split('/').filter(Boolean).at(-1) ?? resource;
}

function automationRunId(resource: string): string {
	return URI.parse(resource).path.split('/').filter(Boolean).at(-1) ?? resource;
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

function assertTerminalRunHistory(runs: readonly IAutomationRun[]): void {
	const activeRun = runs.find(isNonTerminalRun);
	if (activeRun) {
		throw new AutomationActiveRunError(activeRun.automationId, activeRun.id);
	}
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
		errorMessage: run.errorMessage ?? localize('agentHostAutomation.interruptedLegacyRun', "Interrupted while migrating Automation history"),
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
		&& typeof run['leaderWindowId'] === 'number'
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
