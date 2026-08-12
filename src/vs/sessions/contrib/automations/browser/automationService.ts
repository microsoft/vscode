/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout, Sequencer } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, IReference } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { derived, IObservable, ISettableObservable, observableSignalFromEvent, observableValue, autorun, transaction, waitForState } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { hasKey } from '../../../../base/common/types.js';
import { IAgentHostConnectionInfo, IAgentHostConnectionsService, AMBIENT_AGENT_HOST_AUTHORITY } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { CLAUDE_AGENT_PROVIDER_ID, IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { SessionConfigKey } from '../../../../platform/agentHost/common/sessionConfigKeys.js';
import { IAgentSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import { AhpErrorCodes } from '../../../../platform/agentHost/common/state/protocol/common/errors.js';
import { ActionType } from '../../../../platform/agentHost/common/state/protocol/common/actions.js';
import { AutomationDefinitionPatch } from '../../../../platform/agentHost/common/state/protocol/commands.js';
import { AutomationDefinition, AutomationMisfirePolicy, AutomationOperation, AutomationState, AutomationTrigger, AutomationTriggerKind } from '../../../../platform/agentHost/common/state/protocol/channels-automation/state.js';
import { AutomationRunCauseKind, AutomationRunLifecycle, AutomationRunOperation, AutomationRunState, AutomationRunStatus, AutomationRunSummary } from '../../../../platform/agentHost/common/state/protocol/channels-automation-run/state.js';
import { MessageKind } from '../../../../platform/agentHost/common/state/protocol/channels-chat/state.js';
import { ProtocolError } from '../../../../platform/agentHost/common/state/sessionProtocol.js';
import { StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { AutomationRunTrigger, AutomationTarget, IAutomationDescriptor as IAutomation, IAutomationRun, IAutomationSchedule } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationMutationGuard, IAutomationRunStartResult, IAutomationService, ICreateAutomationOptions, IGuardedAutomationUpdateResult, IUpdateAutomationOptions, serializeAutomationEditableState } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { isAgentHostProviderId, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_PREFIX } from '../../../common/agentHostSessionsProvider.js';
import { AUTOMATION_STORAGE_KEY, ILegacyAutomationMigrationStorageService, LEGACY_AUTOMATION_STORAGE_KEYS } from '../common/legacyAutomationMigrationStorage.js';
import { ILegacyAutomationMigrationSnapshot, LegacyAutomationMigration } from './legacyAutomationMigration.js';

const MIGRATION_JOURNAL_KEY = 'chat.automations.ahpMigration.v1';
const MIGRATION_BACKUP_KEY = 'chat.automations.ahpMigration.backup.v1';

/** How long a cancellation request waits for the owning host to report a terminal run. */
const CANCEL_RUN_TIMEOUT = 30_000;

type MigrationPhase = 'previewed' | 'imported' | 'localDisabled' | 'localRemoved' | 'hostEnabled' | 'completed' | 'aborted';
const migrationPhases: readonly MigrationPhase[] = ['previewed', 'imported', 'localDisabled', 'localRemoved', 'hostEnabled', 'completed', 'aborted'];

interface IMigrationItem {
	readonly automationId: string;
	/** Absent on journals written before provider-local legacy storage existed. */
	readonly sourceKey?: string;
	readonly authority: string;
	readonly resource: string;
	readonly enabled: boolean;
	/** Absent on journals written before canonical definitions were persisted. */
	readonly definition?: AutomationDefinition;
	phase: MigrationPhase;
}

interface IMigrationJournal {
	readonly version: 1;
	readonly batchId: string;
	readonly items: IMigrationItem[];
}

interface IMigrationBackup {
	readonly automation: IAutomation;
	readonly runs: readonly IAutomationRun[];
}

interface ILegacyAutomationEntry {
	readonly sourceKey: string;
	readonly automation: IAutomation;
	readonly runs: readonly IAutomationRun[];
}

interface IHostAutomation {
	readonly authority: string;
	readonly resource: string;
	readonly connection: IAgentConnection | undefined;
	readonly state: AutomationState;
}

interface IHostRun {
	readonly authority: string;
	readonly connection: IAgentConnection | undefined;
	readonly state: AutomationRunState;
}

interface IHostSource {
	readonly authority: string;
	connection: IAgentConnection | undefined;
	readonly store: DisposableStore;
	readonly automationReferences: Map<string, IReference<IAgentSubscription<AutomationState>>>;
	readonly runReferences: Map<string, IReference<IAgentSubscription<AutomationRunState>>>;
}

export class AutomationService extends Disposable implements IAutomationService {

	declare readonly _serviceBrand: undefined;

	private readonly _legacyMigrations = new Map<string, LegacyAutomationMigration>();
	private readonly _legacySnapshots = new Map<string, ILegacyAutomationMigrationSnapshot>();
	private _migrationJournal: IMigrationJournal | undefined;
	private readonly _pendingMigrationEntries = new Map<string, ILegacyAutomationEntry>();
	private readonly _migrationConflicts = new Set<string>();
	private readonly _automations: ISettableObservable<readonly IAutomation[]>;
	private readonly _runs: ISettableObservable<readonly IAutomationRun[]>;
	private readonly _runsForCache = new Map<string, IObservable<readonly IAutomationRun[]>>();
	private readonly _hostAutomations = new Map<string, IHostAutomation>();
	private readonly _hostRuns = new Map<string, IHostRun>();
	private readonly _sources = new Map<string, IHostSource>();
	private readonly _syncSequencer = new Sequencer();

	readonly automations: IObservable<readonly IAutomation[]>;
	readonly runs: IObservable<readonly IAutomationRun[]>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@ILegacyAutomationMigrationStorageService private readonly legacyMigrationStorageService: ILegacyAutomationMigrationStorageService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
	) {
		super();
		for (const storageKey of LEGACY_AUTOMATION_STORAGE_KEYS) {
			const migration = new LegacyAutomationMigration(legacyMigrationStorageService, logService, storageKey);
			const snapshot = migration.readCached(storageService.get(storageKey, StorageScope.APPLICATION));
			this._legacyMigrations.set(storageKey, migration);
			this._legacySnapshots.set(storageKey, snapshot);
			for (const automation of snapshot.automations) {
				const identity = migrationIdentity(storageKey, automation.id);
				this._pendingMigrationEntries.set(identity, {
					sourceKey: storageKey,
					automation,
					runs: snapshot.runs.filter(run => run.automationId === automation.id),
				});
			}
		}
		this._migrationJournal = readMigrationJournalValue(storageService.get(MIGRATION_JOURNAL_KEY, StorageScope.APPLICATION));
		this._automations = observableValue<readonly IAutomation[]>(this, []);
		this._runs = observableValue<readonly IAutomationRun[]>(this, []);
		this.automations = this._automations;
		this.runs = this._runs;
		this._refreshProjection();

		const connectionsChanged = observableSignalFromEvent(this, this.agentHostConnectionsService.onDidChangeConnections);
		this._register(autorun(reader => {
			connectionsChanged.read(reader);
			const connections = this.agentHostConnectionsService.connections.map(info => {
				const initializeResult = info.connection?.initializeResult.read(reader);
				return {
					info,
					support: initializeResult === undefined ? 'unknown' as const : initializeResult.automations ? 'capable' as const : 'unsupported' as const,
				};
			});
			void this._syncSequencer.queue(async () => {
				await this._reloadLegacySnapshots();
				await this._syncSources(connections);
				await this._migrateAvailableAutomations();
				await this._normalizeHostAutomationModels();
			}).catch(error => {
				this.logService.error('[AutomationService] Failed to synchronize host automations.', error);
			});
		}));
		this._register(this.languageModelsService.onDidChangeLanguageModels(() => {
			void this._syncSequencer.queue(() => this._normalizeHostAutomationModels()).catch(error => {
				this.logService.error('[AutomationService] Failed to normalize automation models.', error);
			});
		}));
		const synchronizeMigration = () => {
			void this._syncSequencer.queue(async () => {
				await this._reloadLegacySnapshots();
				await this._migrateAvailableAutomations();
			}).catch(error => this.logService.error('[AutomationService] Failed to synchronize legacy automation migration.', error));
		};
		for (const storageKey of LEGACY_AUTOMATION_STORAGE_KEYS) {
			this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, storageKey, this._store)(synchronizeMigration));
		}
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, MIGRATION_JOURNAL_KEY, this._store)(synchronizeMigration));
	}

	getAutomation(id: string): IAutomation | undefined {
		return this._automations.get().find(automation => automation.id === id);
	}

	runsFor(automationId: string): IObservable<readonly IAutomationRun[]> {
		let result = this._runsForCache.get(automationId);
		if (!result) {
			result = derived(this, reader => this._runs.read(reader).filter(run => run.automationId === automationId));
			this._runsForCache.set(automationId, result);
		}
		return result;
	}

	async createAutomation(options: ICreateAutomationOptions, mutationGuard?: AutomationMutationGuard): Promise<IAutomation> {
		const authority = this._authorityForTarget(options.target);
		const source = this._sources.get(authority);
		if (!source) {
			throw new Error(`Automation host '${authority}' has not reported its capabilities yet.`);
		}
		if (!source.connection) {
			throw new Error(`Automation host '${source.authority}' is disconnected.`);
		}
		if (!this._isTargetAvailable(source, options.target)) {
			throw new Error(`Automation agent '${options.target.sessionTypeId ?? 'default'}' is not available on host '${authority}'.`);
		}

		mutationGuard?.();
		const resource = `ahp-automation:/${generateUuid()}`;
		await source.connection.createAutomation({
			channel: resource,
			definition: definitionFromOptions(options, (modelId, provider) => this._normalizeModelId(source, provider, modelId)),
		});
		await this._attachAutomation(source, resource);
		const automation = this._hostAutomations.get(hostKey(source.authority, resource));
		if (!automation) {
			throw new Error(`Automation host '${source.authority}' did not return the created definition.`);
		}
		return toAutomation(automation);
	}

	async updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomation> {
		const host = this._hostAutomations.get(id);
		if (!host) {
			throw this._unavailableAutomationError(id);
		}
		if (!host.connection) {
			throw new Error(`Automation host '${host.authority}' is disconnected.`);
		}
		this._requireOperation(host, AutomationOperation.Update);
		if (patch.target) {
			const authority = this._authorityForTarget(patch.target);
			if (authority !== host.authority) {
				throw new Error('An automation cannot be moved between Agent Hosts. Create a new automation on the target host instead.');
			}
		}
		const source = this._sources.get(host.authority);
		if (!source) {
			throw new Error(`Automation host '${host.authority}' is unavailable.`);
		}
		if (patch.target && !this._isTargetAvailable(source, patch.target)) {
			throw new Error(`Automation agent '${patch.target.sessionTypeId ?? 'default'}' is not available on host '${host.authority}'.`);
		}
		await host.connection.updateAutomation({
			channel: host.resource,
			expectedRevision: host.state.revision,
			changes: definitionPatch(host.state.definition, patch, (modelId, provider) => this._normalizeModelId(source, provider, modelId)),
		});
		return toAutomation(this._hostAutomations.get(id) ?? host);
	}

	async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomation, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		const host = this._hostAutomations.get(id);
		if (!host) {
			return { kind: 'conflict', current: this.getAutomation(id) };
		}
		const current = toAutomation(host);
		if (serializeAutomationEditableState(current) !== serializeAutomationEditableState(expected)) {
			return { kind: 'conflict', current };
		}
		try {
			mutationGuard?.();
			return { kind: 'updated', automation: await this.updateAutomation(id, patch) };
		} catch (error) {
			if (error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict) {
				return { kind: 'conflict', current: this.getAutomation(id) };
			}
			throw error;
		}
	}

	async deleteAutomation(id: string, mutationGuard?: AutomationMutationGuard): Promise<void> {
		const host = this._hostAutomations.get(id);
		if (!host) {
			throw this._unavailableAutomationError(id);
		}
		if (!host.connection) {
			throw new Error(`Automation host '${host.authority}' is disconnected.`);
		}
		this._requireOperation(host, AutomationOperation.Dispose);
		mutationGuard?.();
		await host.connection.disposeAutomation({ channel: host.resource });
	}

	async startRun(automationId: string, requestId: string): Promise<IAutomationRunStartResult> {
		const host = this._hostAutomations.get(automationId);
		if (!host) {
			throw this._unavailableAutomationError(automationId);
		}
		if (!host.connection) {
			throw new Error(`Automation host '${host.authority}' is disconnected.`);
		}
		this._requireOperation(host, AutomationOperation.Run);
		const active = this.getActiveRunFor(automationId);
		if (active) {
			return { claimed: false, run: active };
		}
		try {
			const result = await host.connection.runAutomation({ channel: host.resource, requestId });
			await this._attachRun(this._sources.get(host.authority)!, result.run);
			const run = this._hostRuns.get(hostKey(host.authority, result.run));
			if (!run) {
				throw new Error(`Automation host '${host.authority}' did not return run state.`);
			}
			return { claimed: true, run: toRun(run.state, automationId, hostKey(host.authority, run.state.resource)) };
		} catch (error) {
			if (error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict) {
				const concurrent = this.getActiveRunFor(automationId);
				if (concurrent) {
					return { claimed: false, run: concurrent };
				}
			}
			throw error;
		}
	}

	async cancelRun(runId: string): Promise<void> {
		const host = this._hostRuns.get(runId);
		const parsed = parseHostKey(runId);
		const authority = host?.authority ?? parsed?.authority;
		const resource = host?.state.resource ?? parsed?.resource;
		const connection = authority ? this._sources.get(authority)?.connection : undefined;
		if (!authority || !resource || !connection) {
			throw new Error(`Automation run is unavailable: ${runId}`);
		}
		connection.dispatch(resource, { type: ActionType.AutomationRunCancelRequested });
		// Cancellation is a request to the owning host, so only the projected run
		// lifecycle can tell callers whether the run actually stopped.
		await this._whenRunSettled(runId);
	}

	/** Resolves once the host reports a terminal lifecycle, and fails if it never does. */
	private async _whenRunSettled(runId: string): Promise<void> {
		const isSettled = (runs: readonly IAutomationRun[]) => {
			const run = runs.find(candidate => candidate.id === runId);
			return !run || run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
		};
		if (isSettled(this._runs.get())) {
			return;
		}
		const tokenSource = new CancellationTokenSource();
		try {
			const settled = await raceTimeout(
				waitForState(this._runs, isSettled, undefined, tokenSource.token)
					.then(() => true, error => isCancellationError(error) ? false : Promise.reject(error)),
				CANCEL_RUN_TIMEOUT,
			);
			if (!settled) {
				throw new Error(`Automation host '${this._hostRuns.get(runId)?.authority ?? parseHostKey(runId)?.authority}' did not stop the run.`);
			}
		} finally {
			tokenSource.cancel();
			tokenSource.dispose();
		}
	}

	getActiveRunFor(automationId: string): IAutomationRun | undefined {
		return this._runs.get().find(run => run.automationId === automationId && (run.status === 'pending' || run.status === 'running' || run.status === 'blocked'));
	}

	private async _syncSources(connections: readonly { readonly info: IAgentHostConnectionInfo; readonly support: 'unknown' | 'capable' | 'unsupported' }[]): Promise<void> {
		const knownAuthorities = new Set(connections.map(({ info }) => info.authority));
		let projectionChanged = false;
		for (const [authority, source] of this._sources) {
			const current = connections.find(({ info }) => info.authority === authority);
			if (current?.support !== 'capable' || !current.info.connection) {
				projectionChanged = true;
				source.connection = undefined;
				source.store.clear();
				for (const reference of source.automationReferences.values()) {
					reference.dispose();
				}
				for (const reference of source.runReferences.values()) {
					reference.dispose();
				}
				source.automationReferences.clear();
				source.runReferences.clear();
				for (const automation of this._hostAutomations.values()) {
					if (automation.authority === authority) {
						this._hostAutomations.set(hostKey(authority, automation.resource), { ...automation, connection: undefined });
					}
				}
				for (const run of this._hostRuns.values()) {
					if (run.authority === authority) {
						this._hostRuns.delete(hostKey(authority, run.state.resource));
					}
				}
			}
		}

		for (const { info, support } of connections) {
			if (support !== 'capable' || !info.connection) {
				continue;
			}
			let source = this._sources.get(info.authority);
			if (!source) {
				source = {
					authority: info.authority,
					connection: info.connection,
					store: this._register(new DisposableStore()),
					automationReferences: new Map(),
					runReferences: new Map(),
				};
				this._sources.set(info.authority, source);
			} else if (source.connection === info.connection) {
				continue;
			} else {
				source.connection = info.connection;
			}
			this._listenToSource(source);
			await this._loadSource(source);
		}

		for (const authority of knownAuthorities) {
			const source = this._sources.get(authority);
			if (source && !source.connection) {
				projectionChanged = true;
			}
		}
		if (projectionChanged) {
			this._refreshProjection();
		}
	}

	private _listenToSource(source: IHostSource): void {
		source.store.clear();
		const connection = source.connection;
		if (!connection) {
			return;
		}
		source.store.add(connection.onDidNotification(notification => {
			if (notification.type === 'root/automationAdded' || notification.type === 'root/automationSummaryChanged') {
				void this._attachAutomation(source, notification.type === 'root/automationAdded' ? notification.summary.resource : notification.summary.resource);
			} else if (notification.type === 'root/automationRemoved') {
				this._removeHostAutomation(source, notification.automation);
			}
		}));
		source.store.add(connection.rootState.onDidChange(() => {
			void this._syncSequencer.queue(async () => {
				await this._migrateLegacyAutomations(source);
				await this._normalizeHostAutomationModels();
			}).catch(error => {
				this.logService.error(`[AutomationService] Failed to resume migrations for host '${source.authority}'.`, error);
			});
		}));
	}

	private async _loadSource(source: IHostSource): Promise<void> {
		const connection = source.connection;
		if (!connection) {
			return;
		}
		let cursor: string | undefined;
		do {
			const result = await connection.listAutomations(cursor ? { cursor } : undefined);
			for (const summary of result.items) {
				await this._attachAutomation(source, summary.resource);
			}
			cursor = result.nextCursor;
		} while (cursor);
	}

	private async _reloadLegacySnapshots(): Promise<void> {
		for (const [storageKey, migration] of this._legacyMigrations) {
			this._legacySnapshots.set(storageKey, await migration.read());
		}
		const journal = await this._readMigrationJournal();
		const completed = new Set(journal?.items
			.filter(item => isTerminalMigrationPhase(item.phase))
			.map(item => migrationItemIdentity(item)));
		const pending = new Set(journal?.items
			.filter(item => !isTerminalMigrationPhase(item.phase))
			.map(item => migrationItemIdentity(item)));
		const entries = this._legacyEntries();
		const ledgerEntries = new Set(entries.map(entry => migrationIdentity(entry.sourceKey, entry.automation.id)));
		for (const identity of this._pendingMigrationEntries.keys()) {
			if (completed.has(identity) || (!ledgerEntries.has(identity) && !pending.has(identity))) {
				this._pendingMigrationEntries.delete(identity);
			}
		}
		for (const entry of entries) {
			const identity = migrationIdentity(entry.sourceKey, entry.automation.id);
			if (!completed.has(identity)) {
				this._pendingMigrationEntries.set(identity, entry);
			}
		}
		this._refreshProjection();
	}

	private _legacyEntries(): ILegacyAutomationEntry[] {
		const entries: ILegacyAutomationEntry[] = [];
		for (const [sourceKey, snapshot] of this._legacySnapshots) {
			for (const automation of snapshot.automations) {
				entries.push({
					sourceKey,
					automation,
					runs: snapshot.runs.filter(run => run.automationId === automation.id),
				});
			}
		}
		return entries;
	}

	private _legacyMigrationFor(sourceKey: string): LegacyAutomationMigration {
		const migration = this._legacyMigrations.get(sourceKey);
		if (!migration) {
			throw new Error(`Unknown legacy automation storage source: ${sourceKey}`);
		}
		return migration;
	}

	private async _migrateAvailableAutomations(): Promise<void> {
		for (const source of this._sources.values()) {
			if (source.connection) {
				await this._migrateLegacyAutomations(source);
			}
		}
	}

	private async _migrateLegacyAutomations(source: IHostSource): Promise<void> {
		const connection = source.connection;
		if (!connection) {
			return;
		}
		const journal = await this._readMigrationJournal();
		const journalEntries = new Set(journal?.items.map(item => migrationItemIdentity(item)));
		for (const item of journal?.items.filter(candidate => candidate.authority === source.authority && !isTerminalMigrationPhase(candidate.phase)) ?? []) {
			const sourceKey = migrationItemSourceKey(item);
			const backup = await this._readMigrationBackup(sourceKey, item.automationId);
			const entry = backup ? {
				sourceKey,
				automation: backup.automation,
				runs: backup.runs,
			} : undefined;
			if (!entry) {
				this.logService.error(`[AutomationService] Missing rollback data for automation migration '${item.automationId}' from '${sourceKey}'.`);
				continue;
			}
			this._pendingMigrationEntries.set(migrationIdentity(sourceKey, item.automationId), entry);
			if (!this._isTargetAvailable(source, entry.automation.target)) {
				continue;
			}
			try {
				await this._resumeMigrationItem(source, item, entry);
			} catch (error) {
				this.logService.error(`[AutomationService] Failed to migrate automation '${item.automationId}' from '${sourceKey}'.`, error);
			}
		}

		const candidates = this._legacyEntries().filter(entry =>
			this._authorityForTarget(entry.automation.target) === source.authority
			&& this._isTargetAvailable(source, entry.automation.target)
			&& !journalEntries.has(migrationIdentity(entry.sourceKey, entry.automation.id))
		);
		for (const entry of candidates) {
			try {
				const item = await this._ensureMigrationItem(entry, source);
				await this._resumeMigrationItem(source, item, entry);
			} catch (error) {
				this.logService.error(`[AutomationService] Failed to migrate automation '${entry.automation.id}' from '${entry.sourceKey}'.`, error);
			}
		}
	}

	private async _resumeMigrationItem(source: IHostSource, item: IMigrationItem, entry: ILegacyAutomationEntry): Promise<void> {
		const connection = source.connection;
		if (!connection || isTerminalMigrationPhase(item.phase)) {
			return;
		}
		const { automation, sourceKey } = entry;
		const identity = migrationIdentity(sourceKey, item.automationId);
		const migrationDefinition = await this._resolveMigrationDefinition(source, item, entry);
		item = migrationDefinition.item;
		const disabledDefinition = migrationDefinition.definition;
		const enabledDefinition = { ...disabledDefinition, enabled: item.enabled };
		const importedAutomation = () => this._hostAutomations.get(hostKey(source.authority, item.resource));
		const markConflict = () => {
			this._migrationConflicts.add(identity);
			this._refreshProjection();
		};
		if (item.phase === 'previewed') {
			await this._ensureImportedAutomation(source, item, disabledDefinition, true);
			const current = (await this._readMigrationJournal())?.items.find(candidate =>
				candidate.authority === item.authority
				&& candidate.automationId === item.automationId
				&& migrationItemSourceKey(candidate) === sourceKey
			);
			if (current && current.phase !== 'previewed') {
				item = current;
			} else {
				const imported = importedAutomation();
				if (!imported || !equals(imported.state.definition, disabledDefinition)) {
					markConflict();
					return;
				}
				this._migrationConflicts.delete(identity);
				item = await this._advanceMigrationItem(item, 'imported');
			}
		}
		if (item.phase === 'imported') {
			const imported = importedAutomation() ?? await this._ensureImportedAutomation(source, item, disabledDefinition);
			if (!equals(imported?.state.definition, disabledDefinition)) {
				markConflict();
				return;
			}
			const result = await this._legacyMigrationFor(sourceKey).disable(automation);
			if (result === 'missing') {
				item = await this._abortMigrationItem(item, 'imported');
				if (isTerminalMigrationPhase(item.phase)) {
					return;
				}
			} else {
				await this._reloadLegacySnapshots();
				if (!equals(importedAutomation()?.state.definition, disabledDefinition)) {
					markConflict();
					return;
				}
				item = await this._advanceMigrationItem(item, 'localDisabled');
			}
		}
		if (item.phase === 'localDisabled') {
			const currentRuns = await this._refreshMigrationBackupRuns(sourceKey, automation.id);
			const imported = importedAutomation() ?? await this._ensureImportedAutomation(source, item, disabledDefinition);
			if (!equals(imported?.state.definition, disabledDefinition)) {
				markConflict();
				return;
			}
			const result = await this._legacyMigrationFor(sourceKey).remove(automation, currentRuns);
			if (result !== 'missing') {
				await this._reloadLegacySnapshots();
			}
			if (!equals(importedAutomation()?.state.definition, disabledDefinition)) {
				markConflict();
				return;
			}
			item = await this._advanceMigrationItem(item, 'localRemoved');
		}
		if (item.phase === 'localRemoved') {
			const imported = importedAutomation();
			if (!imported) {
				item = await this._abortMigrationItem(item, 'localRemoved');
			} else if (equals(imported.state.definition, enabledDefinition)) {
				item = await this._advanceMigrationItem(item, 'hostEnabled');
			} else if (!equals(imported.state.definition, disabledDefinition)) {
				markConflict();
				return;
			} else {
				try {
					await connection.updateAutomation({
						channel: item.resource,
						expectedRevision: imported.state.revision,
						changes: { enabled: item.enabled },
					});
				} catch (error) {
					const current = this._hostAutomations.get(hostKey(source.authority, item.resource));
					if (!(error instanceof ProtocolError) || error.code !== AhpErrorCodes.Conflict || !equals(current?.state.definition, enabledDefinition)) {
						throw error;
					}
				}
				item = await this._advanceMigrationItem(item, 'hostEnabled');
			}
		}
		if (item.phase === 'hostEnabled') {
			const imported = importedAutomation();
			if (!imported) {
				await this._abortMigrationItem(item, 'hostEnabled');
				return;
			}
			if (!equals(imported.state.definition, enabledDefinition)) {
				markConflict();
				return;
			}
			await this._advanceMigrationItem(item, 'completed');
			this._pendingMigrationEntries.delete(identity);
			this._migrationConflicts.delete(identity);
			this._refreshProjection();
		}
	}

	private async _ensureImportedAutomation(source: IHostSource, item: IMigrationItem, definition: AutomationDefinition, forceCreate = false): Promise<IHostAutomation | undefined> {
		const existing = this._hostAutomations.get(hostKey(source.authority, item.resource));
		if (existing && !forceCreate) {
			return existing;
		}
		const connection = source.connection;
		const journal = await this._readMigrationJournal();
		if (!connection || !journal?.batchId) {
			return undefined;
		}
		try {
			await connection.createAutomation({
				channel: item.resource,
				definition,
				import: {
					source: 'vscode-legacy-automations',
					batchId: journal.batchId,
					itemId: migrationItemIdentity(item),
				},
			});
		} catch (error) {
			if (!(error instanceof ProtocolError) || error.code !== AhpErrorCodes.AlreadyExists) {
				throw error;
			}
		}
		await this._attachAutomation(source, item.resource);
		return this._hostAutomations.get(hostKey(source.authority, item.resource));
	}

	private async _resolveMigrationDefinition(source: IHostSource, item: IMigrationItem, entry: ILegacyAutomationEntry): Promise<{ item: IMigrationItem; definition: AutomationDefinition }> {
		if (item.definition) {
			return { item, definition: item.definition };
		}
		const imported = this._hostAutomations.get(hostKey(source.authority, item.resource));
		const definition = imported
			? { ...imported.state.definition, enabled: false }
			: definitionFromOptions({ ...entry.automation, enabled: false }, (modelId, provider) => this._normalizeModelId(source, provider, modelId));
		while (true) {
			const raw = await this.legacyMigrationStorageService.read(MIGRATION_JOURNAL_KEY);
			if (!raw) {
				throw new Error(`Missing migration journal for automation: ${item.automationId}`);
			}
			const journal = JSON.parse(raw) as IMigrationJournal;
			const current = journal.items.find(candidate =>
				candidate.automationId === item.automationId
				&& candidate.authority === item.authority
				&& migrationItemSourceKey(candidate) === migrationItemSourceKey(item)
			);
			if (!current) {
				throw new Error(`Missing migration journal item for automation: ${item.automationId}`);
			}
			if (current.definition) {
				this._migrationJournal = journal;
				return { item: current, definition: current.definition };
			}
			const updated: IMigrationItem = { ...current, definition };
			const items = journal.items.map(candidate =>
				candidate.automationId === item.automationId
					&& candidate.authority === item.authority
					&& migrationItemSourceKey(candidate) === migrationItemSourceKey(item)
					? updated
					: candidate
			);
			const result = await this.legacyMigrationStorageService.compareAndSwap(
				MIGRATION_JOURNAL_KEY,
				raw,
				JSON.stringify({ ...journal, items }),
			);
			if (result.swapped) {
				this._migrationJournal = { ...journal, items };
				return { item: updated, definition };
			}
		}
	}

	private async _abortMigrationItem(item: IMigrationItem, expectedPhase: MigrationPhase): Promise<IMigrationItem> {
		while (true) {
			const raw = await this.legacyMigrationStorageService.read(MIGRATION_JOURNAL_KEY);
			if (!raw) {
				throw new Error(`Missing migration journal for automation: ${item.automationId}`);
			}
			const journal = JSON.parse(raw) as IMigrationJournal;
			const current = journal.items.find(candidate =>
				candidate.automationId === item.automationId
				&& candidate.authority === item.authority
				&& migrationItemSourceKey(candidate) === migrationItemSourceKey(item)
			);
			if (!current) {
				throw new Error(`Missing migration journal item for automation: ${item.automationId}`);
			}
			if (current.phase !== expectedPhase) {
				this._migrationJournal = journal;
				return current;
			}
			const updated: IMigrationItem = { ...current, phase: 'aborted' };
			const result = await this.legacyMigrationStorageService.compareAndSwap(
				MIGRATION_JOURNAL_KEY,
				raw,
				JSON.stringify({
					...journal,
					items: journal.items.map(candidate =>
						candidate.automationId === item.automationId
							&& candidate.authority === item.authority
							&& migrationItemSourceKey(candidate) === migrationItemSourceKey(item)
							? updated
							: candidate
					),
				}),
			);
			if (result.swapped) {
				this._migrationJournal = {
					...journal,
					items: journal.items.map(candidate =>
						candidate.automationId === item.automationId
							&& candidate.authority === item.authority
							&& migrationItemSourceKey(candidate) === migrationItemSourceKey(item)
							? updated
							: candidate
					),
				};
				const identity = migrationItemIdentity(updated);
				this._pendingMigrationEntries.delete(identity);
				this._migrationConflicts.delete(identity);
				this._refreshProjection();
				return updated;
			}
		}
	}

	private async _refreshMigrationBackupRuns(sourceKey: string, automationId: string): Promise<readonly IAutomationRun[]> {
		while (true) {
			const raw = await this.legacyMigrationStorageService.read(MIGRATION_BACKUP_KEY);
			if (!raw) {
				throw new Error(`Missing migration backup for automation: ${automationId}`);
			}
			const backups = JSON.parse(raw) as Record<string, IMigrationBackup>;
			const backupKey = migrationIdentity(sourceKey, automationId);
			const backup = backups[backupKey];
			if (!backup) {
				throw new Error(`Missing migration backup for automation: ${automationId}`);
			}
			const snapshot = await this._legacyMigrationFor(sourceKey).read();
			if (!snapshot.automations.some(automation => automation.id === automationId)) {
				return backup.runs;
			}
			const runs = snapshot.runs.filter(run => run.automationId === automationId);
			if (equals(backup.runs, runs)) {
				return runs;
			}
			const result = await this.legacyMigrationStorageService.compareAndSwap(
				MIGRATION_BACKUP_KEY,
				raw,
				JSON.stringify({ ...backups, [backupKey]: { ...backup, runs } }),
			);
			if (result.swapped) {
				return runs;
			}
		}
	}

	private async _readMigrationJournal(): Promise<IMigrationJournal | undefined> {
		const raw = await this.legacyMigrationStorageService.read(MIGRATION_JOURNAL_KEY);
		if (!raw) {
			this._migrationJournal = undefined;
			return undefined;
		}
		const value = readMigrationJournalValue(raw);
		this._migrationJournal = value;
		return value;
	}

	private async _ensureMigrationItem(entry: ILegacyAutomationEntry, source: IHostSource): Promise<IMigrationItem> {
		const { automation, sourceKey } = entry;
		const authority = source.authority;
		const definition = definitionFromOptions({ ...automation, enabled: false }, (modelId, provider) => this._normalizeModelId(source, provider, modelId));
		await this._writeMigrationBackup(entry);
		while (true) {
			const raw = await this.legacyMigrationStorageService.read(MIGRATION_JOURNAL_KEY);
			const journal: IMigrationJournal = raw ? JSON.parse(raw) as IMigrationJournal : { version: 1, batchId: generateUuid(), items: [] };
			const existing = journal.items.find(item =>
				item.automationId === automation.id
				&& item.authority === authority
				&& migrationItemSourceKey(item) === sourceKey
			);
			if (existing) {
				this._migrationJournal = journal;
				return existing;
			}
			const item: IMigrationItem = {
				automationId: automation.id,
				sourceKey,
				authority,
				resource: migrationResource(sourceKey, automation.id),
				enabled: automation.enabled,
				definition,
				phase: 'previewed',
			};
			const result = await this.legacyMigrationStorageService.compareAndSwap(
				MIGRATION_JOURNAL_KEY,
				raw,
				JSON.stringify({ ...journal, items: [...journal.items, item] }),
			);
			if (result.swapped) {
				this._migrationJournal = { ...journal, items: [...journal.items, item] };
				return item;
			}
		}
	}

	private async _advanceMigrationItem(item: IMigrationItem, phase: MigrationPhase): Promise<IMigrationItem> {
		while (true) {
			const raw = await this.legacyMigrationStorageService.read(MIGRATION_JOURNAL_KEY);
			if (!raw) {
				throw new Error(`Missing migration journal for automation: ${item.automationId}`);
			}
			const journal = JSON.parse(raw) as IMigrationJournal;
			const current = journal.items.find(candidate =>
				candidate.automationId === item.automationId
				&& candidate.authority === item.authority
				&& migrationItemSourceKey(candidate) === migrationItemSourceKey(item)
			);
			if (!current) {
				throw new Error(`Missing migration journal item for automation: ${item.automationId}`);
			}
			if (migrationPhaseIndex(current.phase) >= migrationPhaseIndex(phase)) {
				this._migrationJournal = journal;
				return current;
			}
			const updated: IMigrationItem = { ...current, phase };
			const result = await this.legacyMigrationStorageService.compareAndSwap(
				MIGRATION_JOURNAL_KEY,
				raw,
				JSON.stringify({
					...journal,
					items: journal.items.map(candidate =>
						candidate.automationId === item.automationId
							&& candidate.authority === item.authority
							&& migrationItemSourceKey(candidate) === migrationItemSourceKey(item)
							? updated
							: candidate
					),
				}),
			);
			if (result.swapped) {
				this._migrationJournal = {
					...journal,
					items: journal.items.map(candidate =>
						candidate.automationId === item.automationId
							&& candidate.authority === item.authority
							&& migrationItemSourceKey(candidate) === migrationItemSourceKey(item)
							? updated
							: candidate
					),
				};
				return updated;
			}
		}
	}

	private async _writeMigrationBackup(entry: ILegacyAutomationEntry): Promise<void> {
		const backupKey = migrationIdentity(entry.sourceKey, entry.automation.id);
		while (true) {
			const raw = await this.legacyMigrationStorageService.read(MIGRATION_BACKUP_KEY);
			const backups = raw ? JSON.parse(raw) as Record<string, IMigrationBackup> : {};
			if (backups[backupKey]) {
				return;
			}
			const updated = {
				automation: entry.automation,
				runs: entry.runs,
			};
			const result = await this.legacyMigrationStorageService.compareAndSwap(
				MIGRATION_BACKUP_KEY,
				raw,
				JSON.stringify({ ...backups, [backupKey]: updated }),
			);
			if (result.swapped) {
				return;
			}
		}
	}

	private async _readMigrationBackup(sourceKey: string, automationId: string): Promise<IMigrationBackup | undefined> {
		const raw = await this.legacyMigrationStorageService.read(MIGRATION_BACKUP_KEY);
		if (!raw) {
			return undefined;
		}
		const backups = JSON.parse(raw) as Record<string, IMigrationBackup>;
		const backup = backups[migrationIdentity(sourceKey, automationId)];
		if (!backup) {
			return undefined;
		}
		if (backup.automation.target.kind === 'quickChat') {
			return backup;
		}
		return {
			...backup,
			automation: {
				...backup.automation,
				target: {
					...backup.automation.target,
					folderUri: URI.revive(backup.automation.target.folderUri),
				},
			},
		};
	}

	private _unavailableAutomationError(id: string): Error {
		const pending = this._pendingMigrationAutomation(id);
		return pending
			? new Error(`Automation '${pending.name}' is read-only until agent '${pending.target.sessionTypeId ?? 'default'}' becomes available on its Agent Host.`)
			: new Error(`Automation not found: ${id}`);
	}

	/** Fails fast when the owning authority does not currently permit an operation. */
	private _requireOperation(host: IHostAutomation, operation: AutomationOperation): void {
		if (!host.state.operations.includes(operation)) {
			throw new Error(`Automation host '${host.authority}' does not allow the '${operation}' operation on this automation.`);
		}
	}

	private async _attachAutomation(source: IHostSource, resource: string): Promise<void> {
		const connection = source.connection;
		if (!connection || source.automationReferences.has(resource)) {
			return;
		}
		const reference = connection.getSubscription(StateComponents.Automation, URI.parse(resource), `automations:${source.authority}`);
		source.automationReferences.set(resource, reference);
		const update = () => {
			const state = reference.object.value;
			if (!state || state instanceof Error) {
				return;
			}
			this._hostAutomations.set(hostKey(source.authority, resource), {
				authority: source.authority,
				resource,
				connection: source.connection,
				state,
			});
			this._refreshProjection();
			this._queueHostAutomationModelNormalization(hostKey(source.authority, resource));
			this._queueMigrationRetry(source);
		};
		source.store.add(reference.object.onDidChange(update));
		update();
		if (!reference.object.value) {
			await new Promise<void>(resolve => {
				const listener = reference.object.onDidChange(() => {
					listener.dispose();
					update();
					resolve();
				});
			});
		}
	}

	private async _attachRun(source: IHostSource, resource: string): Promise<void> {
		const connection = source.connection;
		if (!connection || source.runReferences.has(resource)) {
			return;
		}
		const reference = connection.getSubscription(StateComponents.AutomationRun, URI.parse(resource), `automation-run:${source.authority}`);
		source.runReferences.set(resource, reference);
		const update = () => {
			const state = reference.object.value;
			if (!state || state instanceof Error) {
				return;
			}
			this._hostRuns.set(hostKey(source.authority, resource), { authority: source.authority, connection: source.connection, state });
			this._refreshProjection();
		};
		source.store.add(reference.object.onDidChange(update));
		update();
		if (!reference.object.value) {
			await new Promise<void>(resolve => {
				const listener = reference.object.onDidChange(() => {
					listener.dispose();
					update();
					resolve();
				});
			});
		}
	}

	private async _normalizeHostAutomationModels(): Promise<void> {
		for (const key of this._hostAutomations.keys()) {
			await this._normalizeHostAutomationModel(key);
		}
	}

	private _queueHostAutomationModelNormalization(key: string): void {
		void this._syncSequencer.queue(() => this._normalizeHostAutomationModel(key)).catch(error => {
			this.logService.error('[AutomationService] Failed to normalize an automation model.', error);
		});
	}

	private async _normalizeHostAutomationModel(key: string): Promise<void> {
		for (let attempt = 0; attempt < 2; attempt++) {
			const host = this._hostAutomations.get(key);
			const connection = host?.connection;
			const model = host?.state.definition.session.model;
			const source = host ? this._sources.get(host.authority) : undefined;
			if (!host || !connection || !model || !source) {
				return;
			}
			const modelId = this._normalizeModelId(source, host.state.definition.session.provider, model.id);
			if (modelId === model.id) {
				return;
			}
			try {
				await connection.updateAutomation({
					channel: host.resource,
					expectedRevision: host.state.revision,
					changes: {
						session: {
							...host.state.definition.session,
							model: { ...model, id: modelId },
						},
					},
				});
				return;
			} catch (error) {
				if (!(error instanceof ProtocolError) || error.code !== AhpErrorCodes.Conflict) {
					throw error;
				}
			}
		}
		throw new Error(`Automation model normalization conflicted repeatedly: ${key}`);
	}

	private _normalizeModelId(source: IHostSource, provider: string | undefined, modelId: string): string {
		const rootState = source.connection?.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return modelId;
		}
		const agents = provider ? rootState.agents.filter(agent => agent.provider === provider) : rootState.agents;
		if (agents.some(agent => agent.models.some(model => model.id === modelId))) {
			return modelId;
		}
		const nativeModelId = this.languageModelsService.lookupLanguageModel(modelId)?.id;
		return nativeModelId && agents.some(agent => agent.models.some(model => model.id === nativeModelId))
			? nativeModelId
			: modelId;
	}

	private _queueMigrationRetry(source: IHostSource): void {
		void this._syncSequencer.queue(() => this._migrateLegacyAutomations(source)).catch(error => {
			this.logService.error(`[AutomationService] Failed to retry migrations for host '${source.authority}'.`, error);
		});
	}

	private _removeHostAutomation(source: IHostSource, resource: string): void {
		source.automationReferences.get(resource)?.dispose();
		source.automationReferences.delete(resource);
		this._hostAutomations.delete(hostKey(source.authority, resource));
		for (const [key, run] of this._hostRuns) {
			if (run.authority === source.authority && run.state.automation === resource) {
				source.runReferences.get(run.state.resource)?.dispose();
				source.runReferences.delete(run.state.resource);
				this._hostRuns.delete(key);
			}
		}
		this._refreshProjection();
		this._queueMigrationRetry(source);
	}

	private _authorityForTarget(target: AutomationTarget): string {
		const providerId = target.providerId;
		if (!providerId || !isAgentHostProviderId(providerId)) {
			return AMBIENT_AGENT_HOST_AUTHORITY;
		}
		const authority = providerId === LOCAL_AGENT_HOST_PROVIDER_ID
			? AMBIENT_AGENT_HOST_AUTHORITY
			: providerId.slice(REMOTE_AGENT_HOST_PROVIDER_PREFIX.length);
		return authority;
	}

	private _isTargetAvailable(source: IHostSource, target: AutomationTarget): boolean {
		const provider = toAgentHostProvider(target.sessionTypeId);
		const rootState = source.connection?.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return false;
		}
		return provider === undefined
			? rootState.agents.length > 0
			: rootState.agents.some(agent => agent.provider === provider);
	}

	private _pendingMigrationAutomation(id: string): IAutomation | undefined {
		return [...this._pendingMigrationEntries.values()]
			.map(entry => toPendingMigrationAutomation(
				entry,
				this._authorityForTarget(entry.automation.target),
				this._migrationConflicts.has(migrationIdentity(entry.sourceKey, entry.automation.id)),
			))
			.find(automation => automation.id === id);
	}

	private _refreshProjection(): void {
		const pendingResources = new Set(this._migrationJournal?.items
			.filter(item => !isTerminalMigrationPhase(item.phase) && !this._migrationConflicts.has(migrationItemIdentity(item)))
			.map(item => hostKey(item.authority, item.resource)));
		const hostAutomations = [...this._hostAutomations.values()]
			.filter(automation => !pendingResources.has(hostKey(automation.authority, automation.resource)))
			.map(toAutomation);
		const hostRuns = [...this._hostRuns.values()].map(run => toRun(run.state, hostKey(run.authority, run.state.automation), hostKey(run.authority, run.state.resource)));
		for (const host of this._hostAutomations.values()) {
			for (const summary of host.state.runs) {
				const key = hostKey(host.authority, summary.resource);
				if (!this._hostRuns.has(key)) {
					hostRuns.push(toRun(summary, hostKey(host.authority, host.resource), key));
				}
			}
		}
		const pendingAutomations = [...this._pendingMigrationEntries.values()].map(entry =>
			toPendingMigrationAutomation(
				entry,
				this._authorityForTarget(entry.automation.target),
				this._migrationConflicts.has(migrationIdentity(entry.sourceKey, entry.automation.id)),
			)
		);
		const pendingRuns = [...this._pendingMigrationEntries.values()].flatMap(entry => {
			const authority = this._authorityForTarget(entry.automation.target);
			const migrationConflict = this._migrationConflicts.has(migrationIdentity(entry.sourceKey, entry.automation.id));
			return entry.runs.map(run => ({
				...run,
				id: hostKey(authority, `legacy-run:${migrationSourceDiscriminator(entry.sourceKey)}:${run.id}`),
				automationId: pendingMigrationId(entry, authority, migrationConflict),
			}));
		});
		transaction(tx => {
			this._automations.set([...hostAutomations, ...pendingAutomations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), tx);
			this._runs.set([...hostRuns, ...pendingRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), tx);
		});
	}
}

function hostKey(authority: string, resource: string): string {
	return `${authority}\0${resource}`;
}

function parseHostKey(key: string): { readonly authority: string; readonly resource: string } | undefined {
	const separator = key.indexOf('\0');
	return separator >= 0
		? { authority: key.slice(0, separator), resource: key.slice(separator + 1) }
		: undefined;
}

function migrationPhaseIndex(phase: MigrationPhase): number {
	return migrationPhases.indexOf(phase);
}

function isTerminalMigrationPhase(phase: MigrationPhase): boolean {
	return phase === 'completed' || phase === 'aborted';
}

function migrationItemSourceKey(item: IMigrationItem): string {
	return item.sourceKey ?? AUTOMATION_STORAGE_KEY;
}

function migrationIdentity(sourceKey: string, automationId: string): string {
	return sourceKey === AUTOMATION_STORAGE_KEY ? automationId : `${sourceKey}:${automationId}`;
}

function migrationItemIdentity(item: IMigrationItem): string {
	return migrationIdentity(migrationItemSourceKey(item), item.automationId);
}

function migrationSourceDiscriminator(sourceKey: string): string {
	return sourceKey === AUTOMATION_STORAGE_KEY ? 'global' : 'local-agent-host';
}

function readMigrationJournalValue(raw: string | undefined): IMigrationJournal | undefined {
	if (!raw) {
		return undefined;
	}
	const value = JSON.parse(raw) as IMigrationJournal;
	if (value.version !== 1 || !Array.isArray(value.items)) {
		throw new Error('Unsupported automation migration journal.');
	}
	return value;
}

function migrationResource(sourceKey: string, automationId: string): string {
	return sourceKey === AUTOMATION_STORAGE_KEY
		? `ahp-automation:/vscode-${automationId}`
		: `ahp-automation:/vscode-${migrationSourceDiscriminator(sourceKey)}-${automationId}`;
}

function definitionFromOptions(options: ICreateAutomationOptions, normalizeModelId: (modelId: string, provider: string | undefined) => string): AutomationDefinition {
	return {
		title: options.name,
		message: { text: options.prompt, origin: { kind: MessageKind.User } },
		session: sessionTemplate(options.target, options, normalizeModelId),
		enabled: options.enabled ?? true,
		triggers: triggersFromSchedule(options.schedule),
	};
}

function definitionPatch(current: AutomationDefinition, patch: IUpdateAutomationOptions, normalizeModelId: (modelId: string, provider: string | undefined) => string): AutomationDefinitionPatch {
	const changes: AutomationDefinitionPatch = {};
	if (patch.name !== undefined) {
		changes.title = patch.name;
	}
	if (patch.prompt !== undefined) {
		changes.message = { ...current.message, text: patch.prompt };
	}
	if (patch.enabled !== undefined) {
		changes.enabled = patch.enabled;
	}
	if (patch.schedule !== undefined) {
		const eventTriggers = current.triggers.filter(trigger => trigger.kind === AutomationTriggerKind.Event);
		changes.triggers = [...eventTriggers, ...triggersFromSchedule(patch.schedule)];
	}
	if (patch.target !== undefined || patch.modelId !== undefined || patch.mode !== undefined || patch.permissionLevel !== undefined) {
		const target = patch.target ?? targetFromDefinition(current);
		changes.session = sessionTemplate(target, {
			modelId: patch.modelId === undefined ? current.session.model?.id : patch.modelId ?? undefined,
			mode: patch.mode === undefined ? readString(current.session.config?.[SessionConfigKey.Mode]) : patch.mode ?? undefined,
			permissionLevel: patch.permissionLevel === undefined ? readString(current.session.config?.[SessionConfigKey.AutoApprove]) : patch.permissionLevel ?? undefined,
		}, normalizeModelId, current.session.config);
	}
	return changes;
}

function sessionTemplate(
	target: AutomationTarget,
	options: Pick<ICreateAutomationOptions, 'modelId' | 'mode' | 'permissionLevel'>,
	normalizeModelId: (modelId: string, provider: string | undefined) => string,
	currentConfig: Record<string, unknown> = {},
) {
	const config = { ...currentConfig };
	setOptional(config, SessionConfigKey.Mode, options.mode);
	setOptional(config, SessionConfigKey.AutoApprove, options.permissionLevel);
	if (target.kind === 'workspace') {
		const isolation = target.isolation.kind === 'folder' ? 'folder' : target.isolation.kind === 'worktree' ? 'worktree' : undefined;
		setOptional(config, SessionConfigKey.Isolation, isolation);
		setOptional(config, SessionConfigKey.Branch, target.isolation.kind === 'worktree' ? target.isolation.branch : undefined);
	} else {
		delete config[SessionConfigKey.Isolation];
		delete config[SessionConfigKey.Branch];
	}
	const provider = toAgentHostProvider(target.sessionTypeId);
	return {
		provider,
		...(options.modelId ? { model: { id: normalizeModelId(options.modelId, provider) } } : {}),
		...(target.kind === 'workspace' ? { workingDirectories: [target.folderUri.toString()] } : {}),
		...(Object.keys(config).length ? { config } : {}),
	};
}

function toAgentHostProvider(sessionTypeId: string | undefined): string | undefined {
	return sessionTypeId === 'claude-code' ? CLAUDE_AGENT_PROVIDER_ID : sessionTypeId;
}

function setOptional(target: Record<string, unknown>, key: string, value: string | undefined): void {
	if (value === undefined) {
		delete target[key];
	} else {
		target[key] = value;
	}
}

function triggersFromSchedule(schedule: IAutomationSchedule): AutomationTrigger[] {
	if (schedule.interval === 'manual') {
		return [];
	}
	const id = 'schedule';
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	if (schedule.interval === 'hourly') {
		return [{ id, kind: AutomationTriggerKind.Schedule, schedule: { expression: '0 * * * *', timeZone }, misfirePolicy: AutomationMisfirePolicy.RunOnce }];
	}
	const time = `${schedule.scheduleMinute} ${schedule.scheduleHour}`;
	if (schedule.interval === 'daily') {
		return [{ id, kind: AutomationTriggerKind.Schedule, schedule: { expression: `${time} * * *`, timeZone }, misfirePolicy: AutomationMisfirePolicy.RunOnce }];
	}
	return [{
		id,
		kind: AutomationTriggerKind.Schedule,
		schedule: {
			expression: `${time} * * ${schedule.scheduleDay}`,
			timeZone,
		},
		misfirePolicy: AutomationMisfirePolicy.RunOnce,
	}];
}

function toAutomation(host: IHostAutomation): IAutomation {
	const { state } = host;
	const definition = state.definition;
	const scheduleTrigger = definition.triggers.find(trigger => trigger.kind === AutomationTriggerKind.Schedule);
	const schedule = scheduleTrigger ? scheduleFromTrigger(scheduleTrigger) : undefined;
	const target = targetFromDefinition(definition, host.authority);
	const lastRun = state.runs[0];
	return Object.freeze({
		id: hostKey(host.authority, host.resource),
		name: definition.title,
		prompt: definition.message.text,
		schedule: schedule ?? manualSchedule(),
		target,
		modelId: definition.session.model?.id,
		mode: readString(definition.session.config?.[SessionConfigKey.Mode]),
		permissionLevel: readString(definition.session.config?.[SessionConfigKey.AutoApprove]),
		enabled: definition.enabled,
		createdAt: state.createdAt,
		updatedAt: state.modifiedAt,
		lastRunAt: lastRun ? lifecycleStartedAt(lastRun.lifecycle) : undefined,
		nextRunAt: state.nextRunAt,
		host: {
			authority: host.authority,
			resource: host.resource,
			revision: state.revision,
			connected: !!host.connection,
			hasUnsupportedTriggers: definition.triggers.length > 1 || definition.triggers.some(trigger => trigger.kind === AutomationTriggerKind.Event || scheduleFromTrigger(trigger) === undefined),
			canEdit: state.operations.includes(AutomationOperation.Update),
			canRun: state.operations.includes(AutomationOperation.Run),
			canDelete: state.operations.includes(AutomationOperation.Dispose),
		},
	});
}

function toPendingMigrationAutomation(entry: ILegacyAutomationEntry, authority: string, migrationConflict = false): IAutomation {
	const { automation, sourceKey } = entry;
	const resource = migrationResource(sourceKey, automation.id);
	return Object.freeze({
		...automation,
		id: pendingMigrationId(entry, authority, migrationConflict),
		host: {
			authority,
			resource,
			revision: 0,
			connected: false,
			hasUnsupportedTriggers: false,
			canEdit: false,
			canRun: false,
			canDelete: false,
			migrationPending: true,
			migrationConflict,
		},
	});
}

function pendingMigrationId(entry: ILegacyAutomationEntry, authority: string, migrationConflict: boolean): string {
	const resource = migrationConflict
		? `legacy-migration-conflict:${migrationIdentity(entry.sourceKey, entry.automation.id)}`
		: migrationResource(entry.sourceKey, entry.automation.id);
	return hostKey(authority, resource);
}

function targetFromDefinition(definition: AutomationDefinition, authority = AMBIENT_AGENT_HOST_AUTHORITY): AutomationTarget {
	const providerId = authority === AMBIENT_AGENT_HOST_AUTHORITY ? LOCAL_AGENT_HOST_PROVIDER_ID : `${REMOTE_AGENT_HOST_PROVIDER_PREFIX}${authority}`;
	const sessionTypeId = definition.session.provider ?? '';
	const folder = definition.session.workingDirectories?.[0];
	if (!folder) {
		return { kind: 'quickChat', providerId, sessionTypeId };
	}
	const isolationValue = readString(definition.session.config?.[SessionConfigKey.Isolation]);
	const branch = readString(definition.session.config?.[SessionConfigKey.Branch]);
	const isolation = isolationValue === 'folder'
		? { kind: 'folder' as const }
		: isolationValue === 'worktree' && branch
			? { kind: 'worktree' as const, branch }
			: { kind: 'default' as const };
	return { kind: 'workspace', folderUri: URI.parse(folder), providerId, sessionTypeId, isolation };
}

function scheduleFromTrigger(trigger: Extract<AutomationTrigger, { kind: AutomationTriggerKind.Schedule }>): IAutomationSchedule | undefined {
	if (trigger.misfirePolicy === AutomationMisfirePolicy.Skip) {
		return undefined;
	}
	const fields = trigger.schedule.expression.trim().split(/\s+/);
	if (fields.length !== 5) {
		return undefined;
	}
	const [minuteField, hourField, dayOfMonth, month, dayOfWeek] = fields;
	if (minuteField === '0' && hourField === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
		return { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
	}
	const scheduleMinute = parseSimpleCronNumber(minuteField, 0, 59);
	const scheduleHour = parseSimpleCronNumber(hourField, 0, 23);
	if (scheduleMinute === undefined || scheduleHour === undefined || dayOfMonth !== '*' || month !== '*' || trigger.schedule.timeZone !== Intl.DateTimeFormat().resolvedOptions().timeZone) {
		return undefined;
	}
	if (dayOfWeek === '*') {
		return { interval: 'daily', scheduleHour, scheduleMinute, scheduleDay: 0 };
	}
	const scheduleDay = parseSimpleCronWeekday(dayOfWeek);
	return scheduleDay === undefined ? undefined : { interval: 'weekly', scheduleHour, scheduleMinute, scheduleDay };
}

function parseSimpleCronNumber(value: string, min: number, max: number): number | undefined {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function parseSimpleCronWeekday(value: string): number | undefined {
	const named = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(value.toLowerCase());
	if (named >= 0) {
		return named;
	}
	const parsed = parseSimpleCronNumber(value, 0, 7);
	return parsed === 7 ? 0 : parsed;
}

function manualSchedule(): IAutomationSchedule {
	return { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}

function toRun(run: AutomationRunState | AutomationRunSummary, automationId: string, id: string): IAutomationRun {
	const lifecycle = run.lifecycle;
	const fullRun = isFullAutomationRun(run);
	const sessions = fullRun ? run.sessions : run.primarySession ? [run.primarySession] : [];
	return Object.freeze({
		id,
		automationId,
		status: lifecycle.status,
		trigger: triggerFromRun(run),
		sessionResource: run.primarySession ? URI.parse(run.primarySession) : undefined,
		sessionResources: sessions.map(session => URI.parse(session)),
		artifactCount: fullRun ? run.artifacts.length : run.artifactCount,
		blocker: lifecycle.status === AutomationRunStatus.Blocked ? lifecycle.blocker.kind : undefined,
		canCancel: run.operations.includes(AutomationRunOperation.Cancel),
		startedAt: lifecycleStartedAt(lifecycle),
		completedAt: lifecycleCompletedAt(lifecycle),
		errorMessage: lifecycle.status === AutomationRunStatus.Failed ? lifecycle.error.message : undefined,
	});
}

function triggerFromRun(run: AutomationRunState | AutomationRunSummary): AutomationRunTrigger {
	if (run.cause.kind === AutomationRunCauseKind.Manual) {
		return 'manual';
	}
	if (run.cause.event) {
		return 'event';
	}
	return run.cause.catchUp ? 'catch_up' : 'schedule';
}

function lifecycleStartedAt(lifecycle: AutomationRunLifecycle): string {
	switch (lifecycle.status) {
		case AutomationRunStatus.Pending:
			return lifecycle.createdAt;
		case AutomationRunStatus.Running:
		case AutomationRunStatus.Blocked:
		case AutomationRunStatus.Completed:
		case AutomationRunStatus.Failed:
		case AutomationRunStatus.Cancelled:
			return lifecycle.startedAt ?? lifecycle.createdAt;
	}
}

function lifecycleCompletedAt(lifecycle: AutomationRunLifecycle): string | undefined {
	switch (lifecycle.status) {
		case AutomationRunStatus.Pending:
		case AutomationRunStatus.Running:
		case AutomationRunStatus.Blocked:
			return undefined;
		case AutomationRunStatus.Completed:
		case AutomationRunStatus.Failed:
		case AutomationRunStatus.Cancelled:
			return lifecycle.completedAt;
	}
}

function isFullAutomationRun(run: AutomationRunState | AutomationRunSummary): run is AutomationRunState {
	return hasKey(run, { sessions: true }) && hasKey(run, { artifacts: true });
}

function readString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}
