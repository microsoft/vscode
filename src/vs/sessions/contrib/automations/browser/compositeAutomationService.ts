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
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
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
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AutomationRunTrigger, AutomationTarget, IAutomation, IAutomationRun, IAutomationSchedule } from '../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationMutationGuard, IAutomationRunClaim, IAutomationService, ICreateAutomationOptions, IGuardedAutomationUpdateResult, IUpdateAutomationOptions, IUpdateAutomationRunOptions, serializeAutomationEditableState } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { isAgentHostProviderId, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_PREFIX } from '../../../common/agentHostSessionsProvider.js';
import { IAutomationStorageService } from '../common/automationStorageService.js';
import { AutomationService } from './automationService.js';

const MIGRATION_JOURNAL_KEY = 'chat.automations.ahpMigration.v1';
const MIGRATION_BACKUP_KEY = 'chat.automations.ahpMigration.backup.v1';

type MigrationPhase = 'previewed' | 'imported' | 'localDisabled' | 'localRemoved' | 'hostEnabled' | 'completed';

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

export class CompositeAutomationService extends Disposable implements IAutomationService {

	declare readonly _serviceBrand: undefined;

	private readonly _legacy: AutomationService;
	private readonly _automations: ISettableObservable<readonly IAutomation[]>;
	private readonly _runs: ISettableObservable<readonly IAutomationRun[]>;
	private readonly _runsForCache = new Map<string, IObservable<readonly IAutomationRun[]>>();
	private readonly _hostAutomations = new Map<string, IHostAutomation>();
	private readonly _hostRuns = new Map<string, IHostRun>();
	private readonly _sources = new Map<string, IHostSource>();
	private readonly _unsupportedAuthorities = new Set<string>();
	private readonly _syncSequencer = new Sequencer();

	readonly automations: IObservable<readonly IAutomation[]>;
	readonly runs: IObservable<readonly IAutomationRun[]>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IAutomationStorageService automationStorageService: IAutomationStorageService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
	) {
		super();
		this._legacy = this._register(new AutomationService(storageService, logService, telemetryService, automationStorageService));
		this._automations = observableValue<readonly IAutomation[]>(this, this._legacy.automations.get());
		this._runs = observableValue<readonly IAutomationRun[]>(this, this._legacy.runs.get());
		this.automations = this._automations;
		this.runs = this._runs;

		this._register(autorun(reader => {
			this._legacy.automations.read(reader);
			this._legacy.runs.read(reader);
			this._refreshProjection();
		}));

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
			void this._syncSequencer.queue(() => this._syncSources(connections)).catch(error => {
				this.logService.error('[CompositeAutomationService] Failed to synchronize host automations.', error);
			});
		}));
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
		if (!authority) {
			return this._legacy.createAutomation(options, mutationGuard);
		}
		const source = this._sources.get(authority);
		if (!source) {
			if (this._unsupportedAuthorities.has(authority)) {
				return this._legacy.createAutomation(options, mutationGuard);
			}
			throw new Error(`Automation host '${authority}' has not reported its capabilities yet.`);
		}
		if (!source.connection) {
			throw new Error(`Automation host '${source.authority}' is disconnected.`);
		}

		mutationGuard?.();
		const resource = `ahp-automation:/${generateUuid()}`;
		await source.connection.createAutomation({
			channel: resource,
			definition: definitionFromOptions(options),
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
			return this._legacy.updateAutomation(id, patch);
		}
		if (!host.connection) {
			throw new Error(`Automation host '${host.authority}' is disconnected.`);
		}
		await host.connection.updateAutomation({
			channel: host.resource,
			expectedRevision: host.state.revision,
			changes: definitionPatch(host.state.definition, patch),
		});
		return toAutomation(this._hostAutomations.get(id) ?? host);
	}

	async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomation, mutationGuard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
		const host = this._hostAutomations.get(id);
		if (!host) {
			return this._legacy.updateAutomationIfUnchanged(id, patch, expected, mutationGuard);
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
			return this._legacy.deleteAutomation(id, mutationGuard);
		}
		if (!host.connection) {
			throw new Error(`Automation host '${host.authority}' is disconnected.`);
		}
		mutationGuard?.();
		await host.connection.disposeAutomation({ channel: host.resource });
	}

	async recordRunStart(automationId: string, trigger: AutomationRunTrigger, leaderWindowId: number): Promise<IAutomationRunClaim> {
		const host = this._hostAutomations.get(automationId);
		if (!host) {
			return this._legacy.recordRunStart(automationId, trigger, leaderWindowId);
		}
		if (trigger !== 'manual') {
			throw new Error('Host-owned schedules are dispatched by the host.');
		}
		if (!host.connection) {
			throw new Error(`Automation host '${host.authority}' is disconnected.`);
		}
		const active = this.getActiveRunFor(automationId);
		if (active) {
			return { claimed: false, run: active };
		}
		try {
			const result = await host.connection.runAutomation({ channel: host.resource, requestId: generateUuid() });
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

	async updateRun(runId: string, patch: IUpdateAutomationRunOptions): Promise<IAutomationRun | undefined> {
		const host = this._hostRuns.get(runId);
		if (host) {
			return toRun(host.state, hostKey(host.authority, host.state.automation), runId);
		}
		return this._legacy.updateRun(runId, patch);
	}

	async cancelRun(runId: string): Promise<void> {
		const host = this._hostRuns.get(runId);
		if (!host) {
			return;
		}
		if (!host.connection) {
			throw new Error(`Automation host '${host.authority}' is disconnected.`);
		}
		host.connection.dispatch(host.state.resource, { type: ActionType.AutomationRunCancelRequested });
	}

	async deleteRun(runId: string): Promise<void> {
		if (this._hostRuns.has(runId)) {
			throw new Error('Agent Host run history cannot be deleted by the client.');
		}
		await this._legacy.deleteRun(runId);
	}

	getActiveRunFor(automationId: string): IAutomationRun | undefined {
		return this._runs.get().find(run => run.automationId === automationId && (run.status === 'pending' || run.status === 'running' || run.status === 'blocked'));
	}

	markStaleRunsFailed(reason: string): Promise<void> {
		return this._legacy.markStaleRunsFailed(reason);
	}

	private async _syncSources(connections: readonly { readonly info: IAgentHostConnectionInfo; readonly support: 'unknown' | 'capable' | 'unsupported' }[]): Promise<void> {
		const knownAuthorities = new Set(connections.map(({ info }) => info.authority));
		let projectionChanged = false;
		this._unsupportedAuthorities.clear();
		for (const { info, support } of connections) {
			if (support === 'unsupported') {
				this._unsupportedAuthorities.add(info.authority);
			}
		}
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
						this._hostRuns.set(hostKey(authority, run.state.resource), { ...run, connection: undefined });
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
					store: new DisposableStore(),
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
		await this._migrateLegacyAutomations(source);
	}

	private async _migrateLegacyAutomations(source: IHostSource): Promise<void> {
		const connection = source.connection;
		if (!connection) {
			return;
		}
		const journal = this._readMigrationJournal() ?? { version: 1, batchId: generateUuid(), items: [] };
		for (const item of journal.items.filter(candidate => candidate.authority === source.authority && candidate.phase !== 'completed')) {
			const automation = this._legacy.getAutomation(item.automationId) ?? this._readMigrationBackup(item.automationId);
			if (!automation) {
				throw new Error(`Missing rollback data for automation migration: ${item.automationId}`);
			}
			await this._resumeMigrationItem(source, journal, item, automation);
		}

		const candidates = this._legacy.automations.get().filter(automation => this._authorityForTarget(automation.target) === source.authority);
		for (const automation of candidates) {
			let item = journal.items.find(candidate => candidate.automationId === automation.id && candidate.authority === source.authority);
			if (!item) {
				item = {
					automationId: automation.id,
					authority: source.authority,
					resource: `ahp-automation:/vscode-${automation.id}`,
					enabled: automation.enabled,
					phase: 'previewed',
				};
				journal.items.push(item);
				this._writeMigrationBackup(automation);
				this._writeMigrationJournal(journal);
			}
			await this._resumeMigrationItem(source, journal, item, automation);
		}
	}

	private async _resumeMigrationItem(source: IHostSource, journal: IMigrationJournal, item: IMigrationItem, automation: IAutomation): Promise<void> {
		const connection = source.connection;
		if (!connection || item.phase === 'completed') {
			return;
		}
		if (item.phase === 'previewed') {
			try {
				await connection.createAutomation({
					channel: item.resource,
					definition: definitionFromOptions({ ...automation, enabled: false }),
					import: {
						source: 'vscode-legacy-automations',
						batchId: journal.batchId,
						itemId: automation.id,
					},
				});
			} catch (error) {
				if (!(error instanceof ProtocolError) || error.code !== AhpErrorCodes.AlreadyExists) {
					throw error;
				}
			}
			await this._attachAutomation(source, item.resource);
			item.phase = 'imported';
			this._writeMigrationJournal(journal);
		}
		if (item.phase === 'imported') {
			const current = this._legacy.getAutomation(automation.id);
			if (current?.enabled) {
				await this._legacy.updateAutomation(automation.id, { enabled: false });
			}
			item.phase = 'localDisabled';
			this._writeMigrationJournal(journal);
		}
		if (item.phase === 'localDisabled') {
			await this._legacy.deleteAutomation(automation.id);
			item.phase = 'localRemoved';
			this._writeMigrationJournal(journal);
		}
		if (item.phase === 'localRemoved') {
			const imported = this._hostAutomations.get(hostKey(source.authority, item.resource));
			if (!imported) {
				throw new Error(`Imported automation is unavailable: ${item.resource}`);
			}
			if (imported.state.definition.enabled !== item.enabled) {
				await connection.updateAutomation({
					channel: item.resource,
					expectedRevision: imported.state.revision,
					changes: { enabled: item.enabled },
				});
			}
			item.phase = 'hostEnabled';
			this._writeMigrationJournal(journal);
		}
		item.phase = 'completed';
		this._writeMigrationJournal(journal);
	}

	private _readMigrationJournal(): IMigrationJournal | undefined {
		const raw = this.storageService.get(MIGRATION_JOURNAL_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return undefined;
		}
		const value = JSON.parse(raw) as IMigrationJournal;
		if (value.version !== 1 || !Array.isArray(value.items)) {
			throw new Error('Unsupported automation migration journal.');
		}
		return value;
	}

	private _writeMigrationJournal(journal: IMigrationJournal): void {
		this.storageService.store(MIGRATION_JOURNAL_KEY, JSON.stringify(journal), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private _writeMigrationBackup(automation: IAutomation): void {
		const raw = this.storageService.get(MIGRATION_BACKUP_KEY, StorageScope.APPLICATION);
		const backups = raw ? JSON.parse(raw) as Record<string, { readonly automation: IAutomation; readonly runs: readonly IAutomationRun[] }> : {};
		if (!backups[automation.id]) {
			backups[automation.id] = {
				automation,
				runs: this._legacy.runsFor(automation.id).get(),
			};
			this.storageService.store(MIGRATION_BACKUP_KEY, JSON.stringify(backups), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}

	private _readMigrationBackup(automationId: string): IAutomation | undefined {
		const raw = this.storageService.get(MIGRATION_BACKUP_KEY, StorageScope.APPLICATION);
		if (!raw) {
			return undefined;
		}
		const backups = JSON.parse(raw) as Record<string, { readonly automation: IAutomation }>;
		const automation = backups[automationId]?.automation;
		if (!automation) {
			return undefined;
		}
		if (automation.target.kind === 'quickChat') {
			return automation;
		}
		return {
			...automation,
			target: {
				...automation.target,
				folderUri: URI.revive(automation.target.folderUri),
			},
		};
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

	private _authorityForTarget(target: AutomationTarget): string | undefined {
		const providerId = target.providerId;
		if (!providerId || !isAgentHostProviderId(providerId)) {
			return undefined;
		}
		const authority = providerId === LOCAL_AGENT_HOST_PROVIDER_ID
			? AMBIENT_AGENT_HOST_AUTHORITY
			: providerId.slice(REMOTE_AGENT_HOST_PROVIDER_PREFIX.length);
		return authority;
	}

	private _refreshProjection(): void {
		const hostAutomations = [...this._hostAutomations.values()].map(toAutomation);
		const hostRuns = [...this._hostRuns.values()].map(run => toRun(run.state, hostKey(run.authority, run.state.automation), hostKey(run.authority, run.state.resource)));
		for (const host of this._hostAutomations.values()) {
			for (const summary of host.state.runs) {
				const key = hostKey(host.authority, summary.resource);
				if (!this._hostRuns.has(key)) {
					hostRuns.push(toRun(summary, hostKey(host.authority, host.resource), key));
				}
			}
		}
		transaction(tx => {
			this._automations.set([...hostAutomations, ...this._legacy.automations.get()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), tx);
			this._runs.set([...hostRuns, ...this._legacy.runs.get()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), tx);
		});
	}
}

function hostKey(authority: string, resource: string): string {
	return `${authority}\0${resource}`;
}

function definitionFromOptions(options: ICreateAutomationOptions): AutomationDefinition {
	return {
		title: options.name,
		message: { text: options.prompt, origin: { kind: MessageKind.User } },
		session: sessionTemplate(options.target, options),
		enabled: options.enabled ?? true,
		triggers: triggersFromSchedule(options.schedule),
	};
}

function definitionPatch(current: AutomationDefinition, patch: IUpdateAutomationOptions): AutomationDefinitionPatch {
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
		}, current.session.config);
	}
	return changes;
}

function sessionTemplate(target: AutomationTarget, options: Pick<ICreateAutomationOptions, 'modelId' | 'mode' | 'permissionLevel'>, currentConfig: Record<string, unknown> = {}) {
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
	return {
		provider: target.sessionTypeId,
		...(options.modelId ? { model: { id: options.modelId } } : {}),
		...(target.kind === 'workspace' ? { workingDirectories: [target.folderUri.toString()] } : {}),
		...(Object.keys(config).length ? { config } : {}),
	};
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
		leaderWindowId: 0,
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
