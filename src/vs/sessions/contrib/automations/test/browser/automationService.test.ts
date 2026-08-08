/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IReference } from '../../../../../base/common/lifecycle.js';
import { observableValue, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullAgentHostService } from '../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { AutomationExecutionLifetime, AutomationOperation, AutomationRunCauseKind, AutomationRunOperation, AutomationRunState, AutomationRunStatus, AutomationRunSummary, AutomationState, AutomationSummary, MessageKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { CreateAutomationParams, ListAutomationsResult, RunAutomationParams, RunAutomationResult, UpdateAutomationParams } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { InitializeResult } from '../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { INotification } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ComponentToState, RootState, StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { AutomationService } from '../../browser/automationService.js';
import { LegacyAutomationMigration } from '../../browser/legacyAutomationMigration.js';
import { AUTOMATION_STORAGE_KEY, ILegacyAutomationMigrationCompareAndSwapResult, ILegacyAutomationMigrationStorageService } from '../../common/legacyAutomationMigrationStorage.js';

suite('AutomationService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps an unsupported legacy target read-only until its agent is advertised', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('cloud', 'copilot-cloud-agent')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const migrationStorage = new RecordingMigrationStorage(storage);
		const connection = new TestConnection(['copilotcli']);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			migrationStorage,
			new TestConnectionsService(connection),
		));
		await Event.toPromise(connection.onDidListAutomations);

		assert.deepStrictEqual({
			automations: service.automations.get().map(automation => ({
				name: automation.name,
				providerId: automation.target.providerId,
				sessionTypeId: automation.target.sessionTypeId,
				migrationPending: automation.host?.migrationPending,
			})),
			hostCreates: connection.operations,
			ledger: migrationStorage.value,
		}, {
			automations: [{
				name: 'cloud',
				providerId: 'default-copilot',
				sessionTypeId: 'copilot-cloud-agent',
				migrationPending: true,
			}],
			hostCreates: [],
			ledger: raw,
		});

		test('reads schema-v1 and schema-v2 rows for one-time migration', () => {
			const storage = disposables.add(new InMemoryStorageService());
			const migrationStorage = new RecordingMigrationStorage(storage);
			const migration = new LegacyAutomationMigration(migrationStorage, new NullLogService());
			const schema1 = migration.readCached(JSON.stringify({
				schemaVersion: 1,
				automations: [{
					...serializedAutomation('quick', 'copilotcli'),
					target: undefined,
					isQuickChat: true,
					providerId: 'default-copilot',
					sessionTypeId: 'copilotcli',
				}],
				runs: [],
			}));
			const schema2 = migration.readCached(JSON.stringify({
				schemaVersion: 2,
				automations: [{
					...serializedAutomation('workspace', 'copilotcli'),
					target: undefined,
					isQuickChat: false,
					folderUri: URI.file('/workspace').toJSON(),
					providerId: 'default-copilot',
					sessionTypeId: 'copilotcli',
					isolationMode: 'worktree',
					branch: 'main',
				}],
				runs: [],
			}));

			assert.deepStrictEqual({
				quick: schema1.automations[0].target,
				workspace: schema2.automations[0].target,
			}, {
				quick: { kind: 'quickChat', providerId: 'default-copilot', sessionTypeId: 'copilotcli' },
				workspace: {
					kind: 'workspace',
					folderUri: URI.file('/workspace'),
					providerId: 'default-copilot',
					sessionTypeId: 'copilotcli',
					isolation: { kind: 'worktree', branch: 'main' },
				},
			});
		});
	});

	test('migrates a local row without enabling both authorities', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('tests', 'copilotcli')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const operations: string[] = [];
		const migrationStorage = new RecordingMigrationStorage(storage, operations);
		const connection = new TestConnection(['copilotcli'], operations);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			migrationStorage,
			new TestConnectionsService(connection),
		));
		await waitForState(service.automations, items => items.length === 1 && items[0].host?.migrationPending !== true && items[0].enabled === true);

		assert.deepStrictEqual({
			operations,
			automation: service.automations.get().map(automation => ({
				name: automation.name,
				enabled: automation.enabled,
				providerId: automation.target.providerId,
				sessionTypeId: automation.target.sessionTypeId,
				migrationPending: automation.host?.migrationPending,
			})),
			legacyAutomations: JSON.parse(migrationStorage.value!).automations,
		}, {
			operations: ['host:create-disabled', 'legacy:disable', 'legacy:remove', 'host:enable'],
			automation: [{
				name: 'tests',
				enabled: true,
				providerId: 'local-agent-host',
				sessionTypeId: 'copilotcli',
				migrationPending: undefined,
			}],
			legacyAutomations: [],
		});
	});

	test('retries a concurrent backup write without losing either window data', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('tests', 'copilotcli')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const migrationStorage = new RecordingMigrationStorage(storage);
		migrationStorage.injectBackupConflict = true;
		const connection = new TestConnection(['copilotcli']);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			migrationStorage,
			new TestConnectionsService(connection),
		));
		await Event.toPromise(connection.onDidEnableImportedAutomation);
		const backups = JSON.parse(storage.get('chat.automations.ahpMigration.backup.v1', StorageScope.APPLICATION)!) as Record<string, unknown>;

		assert.deepStrictEqual({
			backupIds: Object.keys(backups).sort(),
			automationNames: service.automations.get().map(automation => automation.name),
		}, {
			backupIds: ['other-window', 'tests'],
			automationNames: ['tests'],
		});
	});

	test('drops a pending cache entry completed by another window', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('cloud', 'copilot-cloud-agent')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const connection = new TestConnection(['copilotcli']);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
		));
		await Event.toPromise(connection.onDidListAutomations);
		const resource = 'ahp-automation:/vscode-cloud';
		connection.publishAutomation(resource, true);
		storage.store('chat.automations.ahpMigration.v1', JSON.stringify({
			version: 1,
			batchId: 'other-window',
			items: [{
				automationId: 'cloud',
				authority: AMBIENT_AGENT_HOST_AUTHORITY,
				resource,
				enabled: true,
				phase: 'completed',
			}],
		}), StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store(AUTOMATION_STORAGE_KEY, serializeLegacyLedger([]), StorageScope.APPLICATION, StorageTarget.MACHINE);

		const automations = await waitForState(service.automations, items =>
			items.length === 1 && items[0].host?.migrationPending !== true
		);
		assert.deepStrictEqual(automations.map(automation => ({
			name: automation.name,
			migrationPending: automation.host?.migrationPending,
		})), [{ name: 'cloud', migrationPending: undefined }]);
	});

	test('automatically resumes migration when the target agent appears', async () => {
		const raw = serializeLegacyLedger([serializedAutomation('cloud', 'copilot-cloud-agent')]);
		const storage = disposables.add(new InMemoryStorageService());
		storage.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
		const operations: string[] = [];
		const connection = new TestConnection(['copilotcli'], operations);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage, operations),
			new TestConnectionsService(connection),
		));
		await Event.toPromise(connection.onDidListAutomations);
		connection.setProviders(['copilotcli', 'copilot-cloud-agent']);
		await waitForState(service.automations, items => items.length === 1 && items[0].host?.migrationPending !== true);

		assert.deepStrictEqual({
			operations,
			automation: service.automations.get().map(automation => ({
				name: automation.name,
				migrationPending: automation.host?.migrationPending,
			})),
		}, {
			operations: ['host:create-disabled', 'legacy:disable', 'legacy:remove', 'host:enable'],
			automation: [{ name: 'cloud', migrationPending: undefined }],
		});
	});

	test('resumes after the local row was removed before the host copy was enabled', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const automation = {
			...serializedAutomation('resume', 'copilotcli'),
			target: {
				kind: 'quickChat' as const,
				providerId: 'default-copilot',
				sessionTypeId: 'copilotcli',
			},
		};
		const resource = 'ahp-automation:/vscode-resume';
		storage.store('chat.automations.ahpMigration.v1', JSON.stringify({
			version: 1,
			batchId: 'batch',
			items: [{
				automationId: 'resume',
				authority: AMBIENT_AGENT_HOST_AUTHORITY,
				resource,
				enabled: true,
				phase: 'localDisabled',
			}],
		}), StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store('chat.automations.ahpMigration.backup.v1', JSON.stringify({
			resume: { automation, runs: [] },
		}), StorageScope.APPLICATION, StorageTarget.MACHINE);
		const operations: string[] = [];
		const connection = new TestConnection(['copilotcli'], operations);
		connection.seedAutomation(resource, false);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage, operations),
			new TestConnectionsService(connection),
		));

		await waitForState(service.automations, items => items.length === 1 && items[0].host?.migrationPending !== true && items[0].enabled === true);

		assert.deepStrictEqual({
			operations,
			automations: service.automations.get().map(candidate => ({ name: candidate.name, enabled: candidate.enabled })),
		}, {
			operations: ['host:enable'],
			automations: [{ name: 'resume', enabled: true }],
		});
	});

	test('creates new definitions only on AHP', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const connection = new TestConnection(['copilotcli']);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			new TestConnectionsService(connection),
		));
		await Event.toPromise(connection.onDidListAutomations);

		const automation = await service.createAutomation({
			name: 'new',
			prompt: 'Run tests',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
		});

		assert.deepStrictEqual({
			name: automation.name,
			host: automation.host?.authority,
			legacyLedger: storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION),
		}, {
			name: 'new',
			host: AMBIENT_AGENT_HOST_AUTHORITY,
			legacyLedger: undefined,
		});
	});

	test('reconnect drops stale run state and follows fresh summaries', async () => {
		const storage = disposables.add(new InMemoryStorageService());
		const connection = new TestConnection(['copilotcli']);
		connection.seedAutomation('ahp-automation:/test', true);
		const connections = new TestConnectionsService(connection);
		const service = disposables.add(new AutomationService(
			storage,
			new NullLogService(),
			new RecordingMigrationStorage(storage),
			connections,
		));
		await Event.toPromise(connection.onDidListAutomations);
		const automation = service.automations.get()[0];
		const started = await service.startRun(automation.id, 'request');
		assert.strictEqual(started.claimed, true);

		connections.setConnection(undefined);
		await waitForState(service.automations, items => items[0]?.host?.connected === false);
		connections.setConnection(connection);
		await Event.toPromise(connection.onDidListAutomations);
		connection.setRunStatus(started.run.id.split('\0')[1], AutomationRunStatus.Completed);
		const completedRuns = await waitForState(service.runs, runs => runs.some(run => run.status === 'completed'));

		assert.strictEqual(completedRuns[0].status, 'completed');
	});
});

class TestSubscription<T> implements IAgentSubscription<T> {
	private readonly _onDidChange = new Emitter<T>();
	readonly onDidChange = this._onDidChange.event;
	readonly onWillApplyAction = Event.None;
	readonly onDidApplyAction = Event.None;

	constructor(public value: T | Error | undefined) { }

	get verifiedValue(): T | undefined {
		return this.value instanceof Error ? undefined : this.value;
	}

	set(value: T): void {
		this.value = value;
		this._onDidChange.fire(value);
	}
}

class TestConnection extends NullAgentHostService {
	override readonly initializeResult = observableValue<InitializeResult | undefined>(this, {
		protocolVersion: '0.8.0',
		serverSeq: 0,
		snapshots: [],
		automations: { execution: { lifetime: AutomationExecutionLifetime.HostLifetime }, create: {} },
	});
	private readonly _rootState: TestSubscription<RootState>;
	readonly operations: string[];

	private readonly _onDidNotificationEmitter = new Emitter<INotification>();
	override readonly onDidNotification = this._onDidNotificationEmitter.event;
	private readonly _onDidListAutomations = new Emitter<void>();
	readonly onDidListAutomations = this._onDidListAutomations.event;
	private readonly _onDidEnableImportedAutomation = new Emitter<void>();
	readonly onDidEnableImportedAutomation = this._onDidEnableImportedAutomation.event;
	private readonly automations = new Map<string, TestSubscription<AutomationState>>();
	private readonly runs = new Map<string, TestSubscription<AutomationRunState>>();

	constructor(providers: readonly string[], operations: string[] = []) {
		super();
		this.operations = operations;
		this._rootState = new TestSubscription<RootState>({
			agents: providers.map(provider => ({ provider, displayName: provider, description: provider, models: [], tools: [] })),
			activeSessions: 0,
			terminals: [],
		});
	}

	override get rootState(): IAgentSubscription<RootState> {
		return this._rootState;
	}

	setProviders(providers: readonly string[]): void {
		this._rootState.set({
			agents: providers.map(provider => ({ provider, displayName: provider, description: provider, models: [], tools: [] })),
			activeSessions: 0,
			terminals: [],
		});
	}

	override async listAutomations(): Promise<ListAutomationsResult> {
		queueMicrotask(() => this._onDidListAutomations.fire());
		return { items: [...this.automations.values()].map(subscription => toSummary(subscription.value as AutomationState)) };
	}

	override async createAutomation(params: CreateAutomationParams): Promise<void> {
		this.operations.push(params.definition.enabled ? 'host:create-enabled' : 'host:create-disabled');
		const now = new Date().toISOString();
		const state: AutomationState = {
			resource: params.channel,
			definition: params.definition,
			revision: 1,
			runs: [],
			operations: [AutomationOperation.Update, AutomationOperation.Dispose, AutomationOperation.Run],
			createdAt: now,
			modifiedAt: now,
		};
		this.automations.set(params.channel, new TestSubscription(state));
	}

	seedAutomation(resource: string, enabled: boolean, title = 'resume'): void {
		void this.createAutomation({
			channel: resource,
			definition: {
				title,
				message: { text: 'Run tests', origin: { kind: MessageKind.User } },
				session: { provider: 'copilotcli' },
				enabled,
				triggers: [],
			},
		});
		this.operations.length = 0;
	}

	publishAutomation(resource: string, enabled: boolean): void {
		this.seedAutomation(resource, enabled, 'cloud');
		const state = this.automations.get(resource)!.value as AutomationState;
		this._onDidNotificationEmitter.fire({
			type: 'root/automationAdded',
			channel: 'ahp-root://',
			summary: toSummary(state),
		});
	}

	override async updateAutomation(params: UpdateAutomationParams): Promise<void> {
		const subscription = this.automations.get(params.channel)!;
		const current = subscription.value as AutomationState;
		const next: AutomationState = {
			...current,
			definition: { ...current.definition, ...params.changes },
			revision: current.revision + 1,
			modifiedAt: new Date().toISOString(),
		};
		subscription.set(next);
		if (params.changes.enabled === true) {
			this.operations.push('host:enable');
			queueMicrotask(() => this._onDidEnableImportedAutomation.fire());
		}
	}

	override async runAutomation(params: RunAutomationParams): Promise<RunAutomationResult> {
		const resource = 'ahp-automation-run:/run';
		const automation = this.automations.get(params.channel)!;
		const state = automation.value as AutomationState;
		const now = new Date().toISOString();
		const run: AutomationRunState = {
			resource,
			automation: params.channel,
			cause: { kind: AutomationRunCauseKind.Manual },
			lifecycle: { status: AutomationRunStatus.Running, createdAt: now, startedAt: now },
			sessions: ['copilotcli:/session'],
			primarySession: 'copilotcli:/session',
			artifacts: [],
			operations: [AutomationRunOperation.Cancel],
		};
		this.runs.set(resource, new TestSubscription(run));
		automation.set({ ...state, runs: [toRunSummary(run)] });
		return { run: resource };
	}

	setRunStatus(resource: string, status: AutomationRunStatus): void {
		const subscription = this.runs.get(resource)!;
		const current = subscription.value as AutomationRunState;
		const startedAt = current.lifecycle.status === AutomationRunStatus.Pending
			? current.lifecycle.createdAt
			: current.lifecycle.startedAt ?? current.lifecycle.createdAt;
		const lifecycle = status === AutomationRunStatus.Completed
			? {
				status,
				createdAt: current.lifecycle.createdAt,
				startedAt,
				completedAt: new Date().toISOString(),
			} as const
			: current.lifecycle;
		const next = { ...current, lifecycle, operations: [] };
		subscription.set(next);
		const automation = this.automations.get(current.automation)!;
		const automationState = automation.value as AutomationState;
		automation.set({ ...automationState, runs: [toRunSummary(next)] });
	}

	override getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
		const subscription = kind === StateComponents.Automation
			? this.automations.get(resource.toString())!
			: this.runs.get(resource.toString())!;
		return {
			object: subscription,
			dispose() { },
		} as never;
	}
}

class TestConnectionsService implements IAgentHostConnectionsService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeConnections = new Emitter<void>();
	readonly onDidChangeConnections = this._onDidChangeConnections.event;
	private connection: TestConnection | undefined;

	constructor(connection: TestConnection) {
		this.connection = connection;
	}

	get connections() {
		return [{
			authority: AMBIENT_AGENT_HOST_AUTHORITY,
			address: undefined,
			name: 'Local',
			isAmbient: true,
			connection: this.connection,
		}];
	}

	get ambientConnection() {
		return this.connection!;
	}

	setConnection(connection: TestConnection | undefined): void {
		this.connection = connection;
		this._onDidChangeConnections.fire();
	}

	getConnectionByAuthority(authority: string) {
		return authority === AMBIENT_AGENT_HOST_AUTHORITY ? this.ambientConnection : undefined;
	}

	getConnectionByAddress() {
		return undefined;
	}

	resolveSessionResource() {
		return undefined;
	}
}

class RecordingMigrationStorage implements ILegacyAutomationMigrationStorageService {
	declare readonly _serviceBrand: undefined;
	injectBackupConflict = false;

	constructor(
		private readonly storage: InMemoryStorageService,
		private readonly operations: string[] = [],
	) { }

	get value(): string | undefined {
		return this.storage.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION);
	}

	async read(key = AUTOMATION_STORAGE_KEY): Promise<string | undefined> {
		return this.storage.get(key, StorageScope.APPLICATION);
	}

	async compareAndSwap(key: string, expectedValue: string | undefined, newValue: string): Promise<ILegacyAutomationMigrationCompareAndSwapResult> {
		const currentValue = this.storage.get(key, StorageScope.APPLICATION);
		if (currentValue !== expectedValue) {
			return { swapped: false, currentValue };
		}
		if (this.injectBackupConflict && key === 'chat.automations.ahpMigration.backup.v1') {
			this.injectBackupConflict = false;
			const concurrentValue = JSON.stringify({
				'other-window': {
					automation: serializedAutomation('other-window', 'copilotcli'),
					runs: [],
				},
			});
			this.storage.store(key, concurrentValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
			return { swapped: false, currentValue: concurrentValue };
		}
		if (key === AUTOMATION_STORAGE_KEY) {
			const previous = expectedValue ? JSON.parse(expectedValue) as { automations: { enabled: boolean }[] } : undefined;
			const next = JSON.parse(newValue) as { automations: { enabled: boolean }[] };
			if (previous?.automations.length && next.automations.length === previous.automations.length) {
				this.operations.push('legacy:disable');
			} else if (previous?.automations.length && next.automations.length < previous.automations.length) {
				this.operations.push('legacy:remove');
			}
		}
		this.storage.store(key, newValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
		return { swapped: true, currentValue: newValue };
	}
}

function serializedAutomation(name: string, sessionTypeId: string) {
	return {
		id: name,
		name,
		prompt: 'Run tests',
		schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
		target: { kind: 'quickChat', providerId: 'default-copilot', sessionTypeId },
		enabled: true,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
	};
}

function serializeLegacyLedger(automations: readonly ReturnType<typeof serializedAutomation>[]): string {
	return JSON.stringify({ schemaVersion: 3, revision: 1, automations, runs: [] });
}

function toSummary(state: AutomationState): AutomationSummary {
	return {
		resource: state.resource,
		title: state.definition.title,
		enabled: state.definition.enabled,
		triggerCount: state.definition.triggers.length,
		revision: state.revision,
		operations: state.operations,
		createdAt: state.createdAt,
		modifiedAt: state.modifiedAt,
	};
}

function toRunSummary(state: AutomationRunState): AutomationRunSummary {
	return {
		resource: state.resource,
		automation: state.automation,
		cause: state.cause,
		lifecycle: state.lifecycle,
		primarySession: state.primarySession,
		sessionCount: state.sessions.length,
		artifactCount: state.artifacts.length,
		operations: state.operations,
	};
}
