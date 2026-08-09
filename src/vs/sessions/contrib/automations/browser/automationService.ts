/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, IReference } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, ISettableObservable, observableSignalFromEvent, observableValue, autorun, transaction } from '../../../../base/common/observable.js';
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
import { AutomationDefinition, AutomationMisfirePolicy, AutomationScheduleKind, AutomationState, AutomationTrigger, AutomationTriggerKind, AutomationWeekday } from '../../../../platform/agentHost/common/state/protocol/channels-automation/state.js';
import { AutomationRunCauseKind, AutomationRunLifecycle, AutomationRunState, AutomationRunStatus, AutomationRunSummary } from '../../../../platform/agentHost/common/state/protocol/channels-automation-run/state.js';
import { MessageKind } from '../../../../platform/agentHost/common/state/protocol/channels-chat/state.js';
import { ProtocolError } from '../../../../platform/agentHost/common/state/sessionProtocol.js';
import { StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { AutomationRunTrigger, AutomationTarget, IAutomation, IAutomationRun, IAutomationSchedule } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationMutationGuard, IAutomationRunStartResult, IAutomationService, ICreateAutomationOptions, IGuardedAutomationUpdateResult, IUpdateAutomationOptions, serializeAutomationEditableState } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ILanguageModelsService } from '../../../../workbench/contrib/chat/common/languageModels.js';
import { isAgentHostProviderId, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_PREFIX } from '../../../common/agentHostSessionsProvider.js';
import { AUTOMATION_STORAGE_KEY, ILegacyAutomationMigrationStorageService } from '../common/legacyAutomationMigrationStorage.js';
import { ILegacyAutomationMigrationSnapshot, LegacyAutomationMigration } from './legacyAutomationMigration.js';

const MIGRATION_JOURNAL_KEY = 'chat.automations.ahpMigration.v1';
const MIGRATION_BACKUP_KEY = 'chat.automations.ahpMigration.backup.v1';

type MigrationPhase = 'previewed' | 'imported' | 'localDisabled' | 'localRemoved' | 'hostEnabled' | 'completed';
const migrationPhases: readonly MigrationPhase[] = ['previewed', 'imported', 'localDisabled', 'localRemoved', 'hostEnabled', 'completed'];

interface IMigrationItem {
	readonly automationId: string;
	readonly authority: string;
	readonly resource: string;
	readonly enabled: boolean;
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

	private readonly _legacyMigration: LegacyAutomationMigration;
	private _legacySnapshot: ILegacyAutomationMigrationSnapshot;
	private _migrationJournal: IMigrationJournal | undefined;
	private readonly _pendingMigrationAutomations = new Map<string, IAutomation>();
	private readonly _pendingMigrationRuns = new Map<string, readonly IAutomationRun[]>();
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
		this._legacyMigration = new LegacyAutomationMigration(legacyMigrationStorageService, logService);
		this._legacySnapshot = this._legacyMigration.readCached(storageService.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION));
		this._migrationJournal = readMigrationJournalValue(storageService.get(MIGRATION_JOURNAL_KEY, StorageScope.APPLICATION));
		for (const automation of this._legacySnapshot.automations) {
			this._pendingMigrationAutomations.set(automation.id, automation);
			this._pendingMigrationRuns.set(automation.id, this._legacySnapshot.runs.filter(run => run.automationId === automation.id));
		}
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
				await this._reloadLegacySnapshot();
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
				await this._reloadLegacySnapshot();
				await this._migrateAvailableAutomations();
			}).catch(error => this.logService.error('[AutomationService] Failed to synchronize legacy automation migration.', error));
		};
		this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, AUTOMATION_STORAGE_KEY, this._store)(synchronizeMigration));
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

	private async _reloadLegacySnapshot(): Promise<void> {
		this._legacySnapshot = await this._legacyMigration.read();
		const journal = await this._readMigrationJournal();
		const completedIds = new Set(journal?.items.filter(item => item.phase === 'completed').map(item => item.automationId));
		const pendingIds = new Set(journal?.items.filter(item => item.phase !== 'completed').map(item => item.automationId));
		const ledgerIds = new Set(this._legacySnapshot.automations.map(automation => automation.id));
		for (const automationId of this._pendingMigrationAutomations.keys()) {
			if (completedIds.has(automationId) || (!ledgerIds.has(automationId) && !pendingIds.has(automationId))) {
				this._pendingMigrationAutomations.delete(automationId);
				this._pendingMigrationRuns.delete(automationId);
			}
		}
		for (const automation of this._legacySnapshot.automations) {
			if (!completedIds.has(automation.id)) {
				this._pendingMigrationAutomations.set(automation.id, automation);
				this._pendingMigrationRuns.set(automation.id, this._legacySnapshot.runs.filter(run => run.automationId === automation.id));
			}
		}
		this._refreshProjection();
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
		for (const item of journal?.items.filter(candidate => candidate.authority === source.authority && candidate.phase !== 'completed') ?? []) {
			const backup = await this._readMigrationBackup(item.automationId);
			const automation = this._legacySnapshot.automations.find(candidate => candidate.id === item.automationId) ?? backup?.automation;
			if (!automation) {
				throw new Error(`Missing rollback data for automation migration: ${item.automationId}`);
			}
			this._pendingMigrationAutomations.set(automation.id, automation);
			if (backup) {
				this._pendingMigrationRuns.set(automation.id, backup.runs);
			}
			if (!this._isTargetAvailable(source, automation.target)) {
				continue;
			}
			await this._resumeMigrationItem(source, item, automation);
		}

		const candidates = this._legacySnapshot.automations.filter(automation =>
			this._authorityForTarget(automation.target) === source.authority
			&& this._isTargetAvailable(source, automation.target)
		);
		for (const automation of candidates) {
			const item = await this._ensureMigrationItem(automation, source.authority);
			await this._resumeMigrationItem(source, item, automation);
		}
	}

	private async _resumeMigrationItem(source: IHostSource, item: IMigrationItem, automation: IAutomation): Promise<void> {
		const connection = source.connection;
		if (!connection || item.phase === 'completed') {
			return;
		}
		if (item.phase === 'previewed') {
			const batchId = (await this._readMigrationJournal())?.batchId;
			if (!batchId) {
				throw new Error(`Missing migration batch for automation: ${item.automationId}`);
			}
			try {
				await connection.createAutomation({
					channel: item.resource,
					definition: definitionFromOptions({ ...automation, enabled: false }, (modelId, provider) => this._normalizeModelId(source, provider, modelId)),
					import: {
						source: 'vscode-legacy-automations',
						batchId,
						itemId: automation.id,
					},
				});
			} catch (error) {
				if (!(error instanceof ProtocolError) || error.code !== AhpErrorCodes.AlreadyExists) {
					throw error;
				}
			}
			await this._attachAutomation(source, item.resource);
			item = await this._advanceMigrationItem(item, 'imported');
		}
		if (item.phase === 'imported') {
			const current = this._legacySnapshot.automations.find(candidate => candidate.id === automation.id);
			if (current?.enabled) {
				await this._legacyMigration.disable(automation.id);
				await this._reloadLegacySnapshot();
			}
			item = await this._advanceMigrationItem(item, 'localDisabled');
		}
		if (item.phase === 'localDisabled') {
			await this._legacyMigration.remove(automation.id);
			await this._reloadLegacySnapshot();
			item = await this._advanceMigrationItem(item, 'localRemoved');
		}
		if (item.phase === 'localRemoved') {
			const imported = this._hostAutomations.get(hostKey(source.authority, item.resource));
			if (!imported) {
				throw new Error(`Imported automation is unavailable: ${item.resource}`);
			}
			if (imported.state.definition.enabled !== item.enabled) {
				try {
					await connection.updateAutomation({
						channel: item.resource,
						expectedRevision: imported.state.revision,
						changes: { enabled: item.enabled },
					});
				} catch (error) {
					const current = this._hostAutomations.get(hostKey(source.authority, item.resource));
					if (!(error instanceof ProtocolError) || error.code !== AhpErrorCodes.Conflict || current?.state.definition.enabled !== item.enabled) {
						throw error;
					}
				}
			}
			item = await this._advanceMigrationItem(item, 'hostEnabled');
		}
		if (item.phase === 'hostEnabled') {
			await this._advanceMigrationItem(item, 'completed');
			this._pendingMigrationAutomations.delete(item.automationId);
			this._pendingMigrationRuns.delete(item.automationId);
			this._refreshProjection();
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

	private async _ensureMigrationItem(automation: IAutomation, authority: string): Promise<IMigrationItem> {
		await this._writeMigrationBackup(automation);
		while (true) {
			const raw = await this.legacyMigrationStorageService.read(MIGRATION_JOURNAL_KEY);
			const journal: IMigrationJournal = raw ? JSON.parse(raw) as IMigrationJournal : { version: 1, batchId: generateUuid(), items: [] };
			const existing = journal.items.find(item => item.automationId === automation.id && item.authority === authority);
			if (existing) {
				this._migrationJournal = journal;
				return existing;
			}
			const item: IMigrationItem = {
				automationId: automation.id,
				authority,
				resource: migrationResource(automation.id),
				enabled: automation.enabled,
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
			const current = journal.items.find(candidate => candidate.automationId === item.automationId && candidate.authority === item.authority);
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
						candidate.automationId === item.automationId && candidate.authority === item.authority ? updated : candidate
					),
				}),
			);
			if (result.swapped) {
				this._migrationJournal = {
					...journal,
					items: journal.items.map(candidate =>
						candidate.automationId === item.automationId && candidate.authority === item.authority ? updated : candidate
					),
				};
				return updated;
			}
		}
	}

	private async _writeMigrationBackup(automation: IAutomation): Promise<void> {
		while (true) {
			const raw = await this.legacyMigrationStorageService.read(MIGRATION_BACKUP_KEY);
			const backups = raw ? JSON.parse(raw) as Record<string, IMigrationBackup> : {};
			if (backups[automation.id]) {
				return;
			}
			const updated = {
				automation,
				runs: this._legacySnapshot.runs.filter(run => run.automationId === automation.id),
			};
			const result = await this.legacyMigrationStorageService.compareAndSwap(
				MIGRATION_BACKUP_KEY,
				raw,
				JSON.stringify({ ...backups, [automation.id]: updated }),
			);
			if (result.swapped) {
				return;
			}
		}
	}

	private async _readMigrationBackup(automationId: string): Promise<IMigrationBackup | undefined> {
		const raw = await this.legacyMigrationStorageService.read(MIGRATION_BACKUP_KEY);
		if (!raw) {
			return undefined;
		}
		const backups = JSON.parse(raw) as Record<string, IMigrationBackup>;
		const backup = backups[automationId];
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
		return [...this._pendingMigrationAutomations.values()]
			.map(automation => toPendingMigrationAutomation(automation, this._authorityForTarget(automation.target)))
			.find(automation => automation.id === id);
	}

	private _refreshProjection(): void {
		const pendingResources = new Set(this._migrationJournal?.items
			.filter(item => item.phase !== 'completed')
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
		const pendingAutomations = [...this._pendingMigrationAutomations.values()].map(automation =>
			toPendingMigrationAutomation(automation, this._authorityForTarget(automation.target))
		);
		const pendingRuns = [...this._pendingMigrationRuns.values()].flat().map(run => {
			const automation = this._pendingMigrationAutomations.get(run.automationId);
			if (!automation) {
				return undefined;
			}
			const authority = this._authorityForTarget(automation.target);
			return {
				...run,
				id: hostKey(authority, `legacy-run:${run.id}`),
				automationId: hostKey(authority, migrationResource(automation.id)),
			};
		}).filter((run): run is IAutomationRun => !!run);
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

function migrationResource(automationId: string): string {
	return `ahp-automation:/vscode-${automationId}`;
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
	if (schedule.interval === 'hourly') {
		return [{ id, kind: AutomationTriggerKind.Schedule, schedule: { kind: AutomationScheduleKind.Hourly }, misfirePolicy: AutomationMisfirePolicy.RunOnce }];
	}
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const time = { hour: schedule.scheduleHour, minute: schedule.scheduleMinute };
	if (schedule.interval === 'daily') {
		return [{ id, kind: AutomationTriggerKind.Schedule, schedule: { kind: AutomationScheduleKind.Daily, time, timeZone }, misfirePolicy: AutomationMisfirePolicy.RunOnce }];
	}
	return [{
		id,
		kind: AutomationTriggerKind.Schedule,
		schedule: {
			kind: AutomationScheduleKind.Weekly,
			weekday: weekdays[schedule.scheduleDay],
			time,
			timeZone,
		},
		misfirePolicy: AutomationMisfirePolicy.RunOnce,
	}];
}

const weekdays = [
	AutomationWeekday.Sunday,
	AutomationWeekday.Monday,
	AutomationWeekday.Tuesday,
	AutomationWeekday.Wednesday,
	AutomationWeekday.Thursday,
	AutomationWeekday.Friday,
	AutomationWeekday.Saturday,
] as const;

function toAutomation(host: IHostAutomation): IAutomation {
	const { state } = host;
	const definition = state.definition;
	const scheduleTrigger = definition.triggers.find(trigger => trigger.kind === AutomationTriggerKind.Schedule);
	const target = targetFromDefinition(definition, host.authority);
	const lastRun = state.runs[0];
	return Object.freeze({
		id: hostKey(host.authority, host.resource),
		name: definition.title,
		prompt: definition.message.text,
		schedule: scheduleTrigger ? scheduleFromTrigger(scheduleTrigger) : manualSchedule(),
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
			hasUnsupportedTriggers: definition.triggers.length > 1 || definition.triggers.some(trigger => trigger.kind === AutomationTriggerKind.Event || trigger.schedule.kind === AutomationScheduleKind.Cron),
		},
	});
}

function toPendingMigrationAutomation(automation: IAutomation, authority: string): IAutomation {
	return Object.freeze({
		...automation,
		id: hostKey(authority, migrationResource(automation.id)),
		host: {
			authority,
			resource: migrationResource(automation.id),
			revision: 0,
			connected: false,
			hasUnsupportedTriggers: false,
			migrationPending: true,
		},
	});
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

function scheduleFromTrigger(trigger: Extract<AutomationTrigger, { kind: AutomationTriggerKind.Schedule }>): IAutomationSchedule {
	switch (trigger.schedule.kind) {
		case AutomationScheduleKind.Hourly:
			return { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
		case AutomationScheduleKind.Daily:
			return { interval: 'daily', scheduleHour: trigger.schedule.time.hour, scheduleMinute: trigger.schedule.time.minute, scheduleDay: 0 };
		case AutomationScheduleKind.Weekly:
			return {
				interval: 'weekly',
				scheduleHour: trigger.schedule.time.hour,
				scheduleMinute: trigger.schedule.time.minute,
				scheduleDay: weekdays.indexOf(trigger.schedule.weekday),
			};
		case AutomationScheduleKind.Cron:
			return manualSchedule();
	}
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
		sessionResource: run.primarySession,
		sessionResources: sessions,
		artifactCount: fullRun ? run.artifacts.length : run.artifactCount,
		blocker: lifecycle.status === AutomationRunStatus.Blocked ? lifecycle.blocker.kind : undefined,
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
