/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, type IReference } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY } from '../../../../../../platform/agentHost/common/automationMigration.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType, type ActionEnvelope } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { AutomationOperation, AutomationRunOriginKind, AutomationRunStatus, MessageKind, type AutomationCatalogState, type AutomationState, type RootState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { AUTOMATION_CATALOG_URI, ROOT_STATE_URI, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService, NullTelemetryServiceShape } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { AgentHostAutomationStore } from '../../browser/agentHostAutomationStore.js';
import type { IAutomation } from '../../../../../services/sessions/common/sessionsProvider.js';
import { IAutomationStorageService, providerAutomationStorageKey } from '../../../../automations/common/automationStorageService.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { TestAutomationStorageService } from '../../../../automations/test/browser/automationTestUtils.js';
import { AutomationStore } from '../../../../automations/browser/automationService.js';
import { ReconnectableAgentHostAutomationStore } from '../../browser/reconnectableAgentHostAutomationStore.js';

class TestAutomationConnection {

	private readonly _onDidAction = new Emitter<ActionEnvelope>();
	readonly onDidAction = this._onDidAction.event;
	private readonly _onDidCatalogChange = new Emitter<AutomationCatalogState>();
	private readonly _onDidRootChange = new Emitter<RootState>();
	private _catalog: AutomationCatalogState = { automations: [] };
	private _root: RootState;
	private _serverSeq = 0;
	private _migrationComplete: boolean;

	readonly initializeResult;
	readonly rootState: IAgentSubscription<RootState>;
	readonly dispatched: { readonly channel: string; readonly action: Parameters<IAgentConnection['dispatch']>[1] }[] = [];
	subscribedChannel: string | undefined;
	runPrimarySession = 'mock:/session';
	suppressCreatePublication = false;
	readonly createRequested = new DeferredPromise<void>();

	constructor(migrationComplete: boolean) {
		this._migrationComplete = migrationComplete;
		this._root = {
			agents: [],
			activeSessions: 0,
			terminals: [],
			config: {
				schema: { type: 'object', properties: {} },
				values: migrationComplete ? {
					[AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY]: { version: 1, status: 'complete', resources: [] },
				} : {},
			},
		};
		const connection = this;
		this.rootState = {
			get value() { return connection._root; },
			get verifiedValue() { return connection._root; },
			onDidChange: this._onDidRootChange.event,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		this.initializeResult = observableValue<InitializeResult | undefined>(this, {
			protocolVersion: '1',
			serverSeq: 0,
			snapshots: [],
			automations: migrationComplete ? { create: {}, runCancellation: {} } : { create: {} },
		});
	}

	getSubscriptionByChannel(
		kind: StateComponents.AutomationCatalog,
		channel: string,
		_owner: string,
	): IReference<IAgentSubscription<AutomationCatalogState>> {
		assert.strictEqual(kind, StateComponents.AutomationCatalog);
		this.subscribedChannel = channel;
		const connection = this;
		return {
			object: {
				get value() { return connection._catalog; },
				get verifiedValue() { return connection._catalog; },
				onDidChange: this._onDidCatalogChange.event,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			},
			dispose: () => { },
		};
	}

	dispatch(channel: string, action: Parameters<IAgentConnection['dispatch']>[1]): void {
		this.dispatched.push({ channel, action });
		if (action.type === ActionType.AutomationCreateRequested) {
			void this.createRequested.complete();
			if (this.suppressCreatePublication) {
				return;
			}
			const timestamp = new Date().toISOString();
			const automation = {
				resource: action.resource,
				definition: action.definition,
				runs: [],
				operations: [AutomationOperation.Update, AutomationOperation.Remove, ...(this._migrationComplete ? [AutomationOperation.Run] : [])],
				createdAt: timestamp,
				modifiedAt: timestamp,
			};
			this._catalog = { automations: [...this._catalog.automations, automation] };
			this._onDidCatalogChange.fire(this._catalog);
			this._onDidAction.fire({
				channel: AUTOMATION_CATALOG_URI,
				action: { type: ActionType.AutomationSet, automation },
				serverSeq: ++this._serverSeq,
				origin: undefined,
			});
		} else if (action.type === ActionType.AutomationUpdateRequested) {
			const current = this._catalog.automations.find(automation => automation.resource === action.resource);
			if (!current) {
				throw new Error(`Missing Automation: ${action.resource}`);
			}
			const automation = {
				...current,
				definition: { ...current.definition, ...action.changes },
				modifiedAt: new Date().toISOString(),
			};
			this._catalog = {
				automations: this._catalog.automations.map(candidate => candidate.resource === automation.resource ? automation : candidate),
			};
			this._onDidCatalogChange.fire(this._catalog);
			this._onDidAction.fire({
				channel: AUTOMATION_CATALOG_URI,
				action: { type: ActionType.AutomationSet, automation },
				serverSeq: ++this._serverSeq,
				origin: undefined,
			});
		} else if (action.type === ActionType.RootConfigChanged && action.config[AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY]) {
			this._migrationComplete = true;
			this._root = {
				...this._root,
				config: {
					schema: this._root.config?.schema ?? { type: 'object', properties: {} },
					values: { ...this._root.config?.values, ...action.config },
				},
			};
			this._onDidRootChange.fire(this._root);
		}
	}

	async listAutomationTriggerDefinitions() {
		if (!this._migrationComplete) {
			throw new Error('migration pending');
		}
		return { items: [] };
	}

	async runAutomation(params: { readonly automation: string }) {
		const automation = this._catalog.automations.find(candidate => candidate.resource === params.automation);
		if (!automation) {
			throw new Error(`Missing Automation: ${params.automation}`);
		}
		const resource = `ahp-automation-run:/run-${this._serverSeq + 1}`;
		const timestamp = new Date().toISOString();
		const updated = {
			...automation,
			runs: [{
				resource,
				automation: automation.resource,
				origin: { kind: AutomationRunOriginKind.Manual as const },
				lifecycle: { status: AutomationRunStatus.Running as const, createdAt: timestamp, startedAt: timestamp },
				primarySession: this.runPrimarySession,
				sessionCount: 1,
			}, ...automation.runs],
		};
		this._catalog = {
			...this._catalog,
			automations: this._catalog.automations.map(candidate => candidate.resource === updated.resource ? updated : candidate),
		};
		this._onDidCatalogChange.fire(this._catalog);
		return { resource };
	}

	setOperations(resource: string, operations: AutomationOperation[]): void {
		const current = this._catalog.automations.find(automation => automation.resource === resource);
		if (!current) {
			throw new Error(`Missing Automation: ${resource}`);
		}
		const automation = { ...current, operations };
		this._catalog = {
			...this._catalog,
			automations: this._catalog.automations.map(candidate => candidate.resource === resource ? automation : candidate),
		};
		this._onDidCatalogChange.fire(this._catalog);
	}

	setAutomation(automation: AutomationState): void {
		this._catalog = {
			...this._catalog,
			automations: [
				...this._catalog.automations.filter(candidate => candidate.resource !== automation.resource),
				automation,
			],
		};
		this._onDidCatalogChange.fire(this._catalog);
	}

	completeRun(resource: string): void {
		const timestamp = new Date().toISOString();
		this._catalog = {
			...this._catalog,
			automations: this._catalog.automations.map(automation => ({
				...automation,
				runs: automation.runs.map(run => run.resource === resource ? {
					...run,
					lifecycle: {
						status: AutomationRunStatus.Completed,
						createdAt: run.lifecycle.createdAt,
						startedAt: run.lifecycle.status === AutomationRunStatus.Running ? run.lifecycle.startedAt : timestamp,
						completedAt: timestamp,
					},
				} : run),
			})),
		};
		this._onDidCatalogChange.fire(this._catalog);
	}

	dispose(): void {
		this._onDidAction.dispose();
		this._onDidCatalogChange.dispose();
		this._onDidRootChange.dispose();
	}
}

class FailingArchiveStorageService extends TestAutomationStorageService {
	override async compareAndSwap(key: string, expectedValue: string | undefined, newValue: string) {
		if (key.startsWith('agentHostAutomation.legacyRunArchive.')) {
			return { swapped: false, currentValue: expectedValue };
		}
		return super.compareAndSwap(key, expectedValue, newValue);
	}
}

class ToggleMigrationAutomationStore extends AutomationStore {
	migrationAllowed = false;

	override canCompleteMigration(): boolean {
		return this.migrationAllowed;
	}
}

class RecordingLogService extends NullLogService {
	readonly errors: string[] = [];

	override error(message: string, ..._args: unknown[]): void {
		this.errors.push(message);
	}
}

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly events: Array<{ readonly name: string; readonly data: Record<string, unknown> }> = [];

	override publicLog2(eventName?: string, data?: Record<string, unknown>): void {
		this.events.push({ name: eventName ?? '', data: data ?? {} });
	}
}

suite('AgentHostAutomationStore', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function archivedSnapshot(id: string, runId: string): IAutomation {
		return {
			automation: {
				id,
				name: id,
				prompt: 'Review history.',
				schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
				target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
				enabled: true,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
			},
			runs: [{
				id: runId,
				automationId: id,
				status: 'completed',
				trigger: 'manual',
				sessionResource: URI.parse(`mock:/${runId}`),
				startedAt: '2026-01-02T00:00:00.000Z',
				completedAt: '2026-01-02T00:01:00.000Z',
				leaderWindowId: 1,
			}],
		};
	}

	test('uses the exact catalogue channel and projects authoritative creates', async () => {
		const connection = new TestAutomationConnection(true);
		disposables.add(connection);
		connection.runPrimarySession = 'ahp-session:/session';
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage));

		const automation = await store.createAutomation({
			name: 'Review changes',
			prompt: 'Review the current changes.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
		});

		assert.deepStrictEqual({
			subscribedChannel: connection.subscribedChannel,
			dispatchChannel: connection.dispatched[0].channel,
			automation: {
				name: automation.name,
				prompt: automation.prompt,
				target: automation.target,
				enabled: automation.enabled,
			},
		}, {
			subscribedChannel: AUTOMATION_CATALOG_URI,
			dispatchChannel: AUTOMATION_CATALOG_URI,
			automation: {
				name: 'Review changes',
				prompt: 'Review the current changes.',
				target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
				enabled: true,
			},
		});
	});

	test('switches authority only after host migration completion is verified', async () => {
		const connection = new TestAutomationConnection(false);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage));

		await Promise.all([store.completeMigration(), store.completeMigration()]);
		await store.completeMigration();

		const completions = connection.dispatched.filter(entry => entry.channel === ROOT_STATE_URI);
		const completion = completions[0];
		assert.deepStrictEqual({
			automations: store.automations.get(),
			completionCount: completions.length,
			completion: completion?.action.type === ActionType.RootConfigChanged
				? completion.action.config[AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY]
				: undefined,
		}, {
			automations: [],
			completionCount: 1,
			completion: {
				version: 1,
				status: 'complete',
				resources: [],
			},
		});
	});

	test('keeps browser scheduling until the specific host definition is migration-ready', async () => {
		const connection = new TestAutomationConnection(false);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage));
		await store.importAutomationSnapshot(archivedSnapshot('scheduled-owner', 'legacy-run'));

		const before = store.isSchedulingOwnedByHost('scheduled-owner');
		await store.completeMigration();

		assert.deepStrictEqual({
			before,
			after: store.isSchedulingOwnedByHost('scheduled-owner'),
		}, {
			before: false,
			after: true,
		});
	});

	test('maps remote workspace and model identifiers at the AHP boundary', async () => {
		const connection = new TestAutomationConnection(true);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const store = disposables.add(new AgentHostAutomationStore('remote-agent-host', connection, undefined, {
			toHost: resource => URI.file(resource.path),
			fromHost: resource => URI.from({ scheme: 'client', path: resource.path }),
			resourceSchemeForProvider: provider => `remote-test-${provider}`,
			providerForSessionScheme: scheme => scheme === 'ahp-session' ? 'mock' : scheme,
		}, new NullLogService(), storage, NullTelemetryService, automationStorage));

		const automation = await store.createAutomation({
			name: 'Remote',
			prompt: 'Review.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			modelId: 'remote-test-mock:auto',
			target: {
				kind: 'workspace',
				folderUri: URI.parse('client:/workspace'),
				providerId: 'remote-agent-host',
				sessionTypeId: 'mock',
				isolation: { kind: 'default' },
			},
		});
		const create = connection.dispatched[0].action;
		const claim = await store.recordRunStart(automation.id, 'manual', 0);
		void claim.externalDispatch?.whenCompleted.catch(() => { });

		assert.deepStrictEqual({
			hostDirectory: create.type === ActionType.AutomationCreateRequested ? create.definition.session.workingDirectories : undefined,
			hostModel: create.type === ActionType.AutomationCreateRequested ? create.definition.session.model?.id : undefined,
			clientDirectory: automation.target.kind === 'workspace' ? automation.target.folderUri.toString() : undefined,
			clientModel: automation.modelId,
			clientSession: claim.run.sessionResource?.toString(),
		}, {
			hostDirectory: ['file:///workspace'],
			hostModel: 'auto',
			clientDirectory: 'client:/workspace',
			clientModel: 'remote-test-mock:auto',
			clientSession: 'remote-test-mock:/session',
		});
	});

	test('maps local Agent Host model identifiers to provider-native ids', async () => {
		const connection = new TestAutomationConnection(true);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, {
			toHost: resource => resource,
			fromHost: resource => resource,
			resourceSchemeForProvider: provider => `agent-host-${provider}`,
		}, new NullLogService(), storage, NullTelemetryService, automationStorage));

		const automation = await store.createAutomation({
			name: 'Local',
			prompt: 'Say hi.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			modelId: 'agent-host-copilotcli:auto',
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
		});
		const create = connection.dispatched[0].action;

		assert.deepStrictEqual({
			hostModel: create.type === ActionType.AutomationCreateRequested ? create.definition.session.model?.id : undefined,
			clientModel: automation.modelId,
		}, {
			hostModel: 'auto',
			clientModel: 'agent-host-copilotcli:auto',
		});
	});

	test('clears an inherited model when the target authority changes', async () => {
		const connection = new TestAutomationConnection(true);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, {
			toHost: resource => resource,
			fromHost: resource => resource,
			resourceSchemeForProvider: provider => `agent-host-${provider}`,
		}, new NullLogService(), storage, NullTelemetryService, automationStorage));
		const automation = await store.createAutomation({
			name: 'Retargeted',
			prompt: 'Say hi.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			modelId: 'agent-host-copilotcli:auto',
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
		});

		const updated = await store.updateAutomation(automation.id, {
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'claude' },
		});
		const update = connection.dispatched.at(-1)?.action;

		assert.deepStrictEqual({
			hostModel: update?.type === ActionType.AutomationUpdateRequested ? update.changes.session?.model : undefined,
			clientModel: updated.modelId,
		}, {
			hostModel: undefined,
			clientModel: undefined,
		});
	});

	test('normalizes a qualified model for the default provider without splitting native colons', async () => {
		const connection = new TestAutomationConnection(true);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, {
			toHost: resource => resource,
			fromHost: resource => resource,
			resourceSchemeForProvider: provider => `agent-host-${provider}`,
		}, new NullLogService(), storage, NullTelemetryService, automationStorage));
		const folderUri = URI.file('/workspace');

		const defaultProvider = await store.createAutomation({
			name: 'Default provider',
			prompt: 'Say hi.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			modelId: 'agent-host-copilotcli:auto',
			target: { kind: 'workspace', folderUri, providerId: 'local-agent-host', isolation: { kind: 'default' } },
		});
		const nativeColon = await store.createAutomation({
			name: 'Native colon',
			prompt: 'Say hi.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			modelId: 'openai/gpt-5:high',
			target: { kind: 'workspace', folderUri, providerId: 'local-agent-host', sessionTypeId: 'copilotcli', isolation: { kind: 'default' } },
		});
		const createActions = connection.dispatched
			.map(entry => entry.action)
			.filter(action => action.type === ActionType.AutomationCreateRequested);

		assert.deepStrictEqual({
			hostModels: createActions.map(action => action.definition.session.model?.id),
			clientModels: [defaultProvider.modelId, nativeColon.modelId],
		}, {
			hostModels: ['auto', 'openai/gpt-5:high'],
			clientModels: ['agent-host-copilotcli:auto', 'openai/gpt-5:high'],
		});
	});

	test('qualifies host-authored models without retargeting historical run sessions', () => {
		const connection = new TestAutomationConnection(true);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, {
			toHost: resource => resource,
			fromHost: resource => resource,
			resourceSchemeForProvider: provider => `agent-host-${provider}`,
		}, new NullLogService(), storage, NullTelemetryService, automationStorage));
		const timestamp = new Date().toISOString();

		connection.setAutomation({
			resource: 'ahp-automation:/host-authored',
			definition: {
				title: 'Host-authored',
				message: { text: 'Say hi.', origin: { kind: MessageKind.Automation } },
				session: { provider: 'codex', model: { id: 'auto' } },
				enabled: true,
				triggers: [],
			},
			runs: [{
				resource: 'ahp-automation-run:/host-authored-run',
				automation: 'ahp-automation:/host-authored',
				origin: { kind: AutomationRunOriginKind.Manual },
				lifecycle: {
					status: AutomationRunStatus.Completed,
					createdAt: timestamp,
					startedAt: timestamp,
					completedAt: timestamp,
				},
				primarySession: 'copilotcli:/host-authored-session',
				sessionCount: 1,
			}],
			operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
			createdAt: timestamp,
			modifiedAt: timestamp,
		});

		assert.deepStrictEqual({
			modelId: store.getAutomation('host-authored')?.modelId,
			sessionResource: store.runs.get()[0].sessionResource?.toString(),
		}, {
			modelId: 'agent-host-codex:auto',
			sessionResource: 'agent-host-copilotcli:/host-authored-session',
		});
	});

	test('uses per-automation operations as the client authority', async () => {
		const connection = new TestAutomationConnection(true);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage));
		const automation = await store.createAutomation({
			name: 'Restricted',
			prompt: 'Review.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
		});
		connection.setOperations(`ahp-automation:/${automation.id}`, [AutomationOperation.Update]);

		await assert.rejects(store.deleteAutomation(automation.id), /operation 'remove' is not available/);

		assert.deepStrictEqual({
			canRun: store.canRunAutomation(automation.id),
			canUpdate: store.canUpdateAutomation(automation.id),
			canDelete: store.canDeleteAutomation(automation.id),
		}, {
			canRun: false,
			canUpdate: true,
			canDelete: false,
		});
	});

	test('dispatches run cancellation only when the capability is advertised', async () => {
		const connection = new TestAutomationConnection(true);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage));
		const automation = await store.createAutomation({
			name: 'Cancelable',
			prompt: 'Review.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
		});

		const claim = await store.recordRunStart(automation.id, 'manual', 0);
		claim.externalDispatch?.cancel?.();
		void claim.externalDispatch?.whenCompleted.catch(() => { });

		const cancellation = connection.dispatched.at(-1);
		assert.deepStrictEqual(cancellation, {
			channel: `ahp-automation-run:/${claim.run.id}`,
			action: { type: ActionType.AutomationRunCancelRequested },
		});
	});

	test('does not time out an authority-dispatched run after 30 seconds', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const connection = new TestAutomationConnection(true);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, {
			toHost: resource => resource,
			fromHost: resource => resource,
			resourceSchemeForProvider: provider => `agent-host-${provider}`,
		}, new NullLogService(), storage, NullTelemetryService, automationStorage));
		const automation = await store.createAutomation({
			name: 'Long-running',
			prompt: 'Review.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
		});
		const claim = await store.recordRunStart(automation.id, 'manual', 0);
		let settled = false;
		void claim.externalDispatch!.whenCompleted.finally(() => settled = true);

		await timeout(31_000);
		assert.strictEqual(settled, false);

		connection.completeRun(`ahp-automation-run:/${claim.run.id}`);
		await claim.externalDispatch!.whenCompleted;
		assert.strictEqual(settled, true);
	}));

	test('retains imported legacy run history in a read-only archive across store recreation', async () => {
		const connection = new TestAutomationConnection(true);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const snapshot = archivedSnapshot('archived', 'legacy-run');
		const first = new AgentHostAutomationStore('local-agent-host', connection, undefined, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage);
		await first.importAutomationSnapshot(snapshot);
		first.dispose();

		const restored = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage));
		assert.deepStrictEqual(
			restored.runs.get().map(run => ({ ...run, sessionResource: run.sessionResource?.toString() })),
			snapshot.runs.map(run => ({ ...run, sessionResource: run.sessionResource?.toString() })),
		);
	});

	test('merges concurrent legacy run archives without lost updates', async () => {
		const connection = new TestAutomationConnection(true);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const first = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage));
		const second = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage));

		await Promise.all([
			first.importAutomationSnapshot(archivedSnapshot('first', 'run-first')),
			second.importAutomationSnapshot(archivedSnapshot('second', 'run-second')),
		]);

		const restored = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage));
		assert.deepStrictEqual(restored.runs.get().map(run => run.id).sort(), ['run-first', 'run-second']);
	});

	test('an interrupted legacy import retries by updating its prior host entry', async () => {
		const connection = new TestAutomationConnection(true);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage));
		const initial = archivedSnapshot('retry', 'run-initial');
		await store.importAutomationSnapshot(initial);
		const changed: IAutomation = {
			automation: { ...initial.automation, name: 'Changed during migration' },
			runs: initial.runs,
		};

		const result = await store.importAutomationSnapshot(changed);

		assert.deepStrictEqual({
			result,
			name: store.getAutomation('retry')?.name,
		}, {
			result: { kind: 'alreadyPresent' },
			name: 'Changed during migration',
		});
	});

	test('migrates a real legacy ledger and archives its run before source removal', async () => {
		const connection = new TestAutomationConnection(false);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const legacy = disposables.add(new AutomationStore(providerAutomationStorageKey('local-agent-host'), storage, new NullLogService(), NullTelemetryService, automationStorage));
		const automation = await legacy.createAutomation({
			name: 'Scheduled review',
			prompt: 'Review changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
		});
		const claim = await legacy.recordRunStart(automation.id, 'manual', 1);
		await legacy.updateRun(claim.run.id, { status: 'completed', completedAt: '2026-01-01T00:01:00.000Z' });
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, legacy, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage));

		await store.completeMigration();

		assert.deepStrictEqual({
			legacyAutomations: legacy.automations.get(),
			migratedNames: store.automations.get().map(candidate => candidate.name),
			archivedRunIds: store.runs.get().map(run => run.id),
		}, {
			legacyAutomations: [],
			migratedNames: ['Scheduled review'],
			archivedRunIds: [claim.run.id],
		});
	});

	test('archive persistence failure leaves the legacy source intact and migration gated', async () => {
		const connection = new TestAutomationConnection(false);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new FailingArchiveStorageService(storage);
		const legacy = disposables.add(new AutomationStore(providerAutomationStorageKey('local-agent-host'), storage, new NullLogService(), NullTelemetryService, automationStorage));
		const automation = await legacy.createAutomation({
			name: 'Preserve me',
			prompt: 'Review changes.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
		});
		const claim = await legacy.recordRunStart(automation.id, 'manual', 1);
		await legacy.updateRun(claim.run.id, { status: 'completed', completedAt: '2026-01-01T00:01:00.000Z' });
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, legacy, undefined, new NullLogService(), storage, NullTelemetryService, automationStorage));

		await assert.rejects(store.completeMigration(), /Failed to migrate 1 Agent Host Automation definition/);

		assert.deepStrictEqual({
			legacyIds: legacy.automations.get().map(candidate => candidate.id),
			completionRequests: connection.dispatched.filter(entry => entry.channel === ROOT_STATE_URI).length,
		}, {
			legacyIds: [automation.id],
			completionRequests: 0,
		});
	});

	test('rebind after a failed migration creates a fresh authority and retries immediately', async () => {
		const connection = disposables.add(new TestAutomationConnection(false));
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const legacy = disposables.add(new ToggleMigrationAutomationStore(providerAutomationStorageKey('local-agent-host'), storage, new NullLogService(), NullTelemetryService, automationStorage));
		const instantiationService = disposables.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService({ chat: { automations: { enabled: true } } });
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IAutomationStorageService, automationStorage);
		const store = disposables.add(new ReconnectableAgentHostAutomationStore(
			'local-agent-host',
			legacy,
			undefined,
			instantiationService,
			new NullLogService(),
			configurationService,
		));
		store.setConnection(connection);
		await assert.rejects(store.completeMigration(), /cannot be migrated safely/);

		legacy.migrationAllowed = true;
		store.setConnection(connection);
		await store.completeMigration();

		assert.deepStrictEqual({
			subscriptions: connection.subscribedChannel,
			completionRequests: connection.dispatched.filter(entry => entry.channel === ROOT_STATE_URI).length,
		}, {
			subscriptions: AUTOMATION_CATALOG_URI,
			completionRequests: 1,
		});
	});

	test('migration remains retryable while connection capabilities are initializing', async () => {
		const connection = disposables.add(new TestAutomationConnection(false));
		connection.initializeResult.set(undefined, undefined);
		const configurationService = new TestConfigurationService({ [CHAT_AUTOMATIONS_ENABLED_SETTING]: true });
		const instantiationService = disposables.add(new TestInstantiationService());
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IAutomationStorageService, automationStorage);
		const store = disposables.add(new ReconnectableAgentHostAutomationStore(
			'local-agent-host',
			undefined,
			undefined,
			instantiationService,
			new NullLogService(),
			configurationService,
		));
		store.setConnection(connection);

		let settled = false;
		const migration = store.completeMigration().finally(() => settled = true);
		await Promise.resolve();
		assert.strictEqual(settled, false);
		connection.initializeResult.set({
			protocolVersion: '1',
			serverSeq: 0,
			snapshots: [],
			automations: { create: {} },
		}, undefined);
		await migration;

		assert.strictEqual(connection.dispatched.filter(entry => entry.channel === ROOT_STATE_URI).length, 1);
	});

	test('migration resolves without subscribing after an older host finishes initializing', async () => {
		const connection = disposables.add(new TestAutomationConnection(false));
		connection.initializeResult.set(undefined, undefined);
		const configurationService = new TestConfigurationService({ [CHAT_AUTOMATIONS_ENABLED_SETTING]: true });
		const instantiationService = disposables.add(new TestInstantiationService());
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IAutomationStorageService, automationStorage);
		const store = disposables.add(new ReconnectableAgentHostAutomationStore(
			'local-agent-host',
			undefined,
			undefined,
			instantiationService,
			new NullLogService(),
			configurationService,
		));
		store.setConnection(connection);
		const migration = store.completeMigration();

		connection.initializeResult.set({
			protocolVersion: '1',
			serverSeq: 0,
			snapshots: [],
		}, undefined);
		await migration;

		assert.deepStrictEqual({
			subscribedChannel: connection.subscribedChannel,
			completionRequests: connection.dispatched.filter(entry => entry.channel === ROOT_STATE_URI).length,
		}, {
			subscribedChannel: undefined,
			completionRequests: 0,
		});
	});

	test('stalled capability initialization cannot block migration indefinitely', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const connection = disposables.add(new TestAutomationConnection(false));
		connection.initializeResult.set(undefined, undefined);
		const configurationService = new TestConfigurationService({ [CHAT_AUTOMATIONS_ENABLED_SETTING]: true });
		const instantiationService = disposables.add(new TestInstantiationService());
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IAutomationStorageService, automationStorage);
		const store = disposables.add(new ReconnectableAgentHostAutomationStore(
			'local-agent-host',
			undefined,
			undefined,
			instantiationService,
			new NullLogService(),
			configurationService,
		));
		store.setConnection(connection);

		await store.completeMigration();

		assert.strictEqual(connection.dispatched.length, 0);
	}));

	test('disposing while capabilities initialize settles migration', async () => {
		const connection = disposables.add(new TestAutomationConnection(false));
		connection.initializeResult.set(undefined, undefined);
		const configurationService = new TestConfigurationService({ [CHAT_AUTOMATIONS_ENABLED_SETTING]: true });
		const instantiationService = disposables.add(new TestInstantiationService());
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IAutomationStorageService, automationStorage);
		const store = disposables.add(new ReconnectableAgentHostAutomationStore(
			'local-agent-host',
			undefined,
			undefined,
			instantiationService,
			new NullLogService(),
			configurationService,
		));
		store.setConnection(connection);
		const migration = store.completeMigration();

		store.dispose();

		await migration;
	});

	test('disposing a supported authority during migration does not schedule zombie retries', async () => {
		const connection = disposables.add(new TestAutomationConnection(false));
		connection.suppressCreatePublication = true;
		const configurationService = new TestConfigurationService({ [CHAT_AUTOMATIONS_ENABLED_SETTING]: true });
		const instantiationService = disposables.add(new TestInstantiationService());
		const storage = disposables.add(new InMemoryStorageService());
		const automationStorage = new TestAutomationStorageService(storage);
		const logService = new RecordingLogService();
		const telemetryService = new RecordingTelemetryService();
		const legacy = disposables.add(new AutomationStore(providerAutomationStorageKey('local-agent-host'), storage, new NullLogService(), NullTelemetryService, automationStorage));
		await legacy.createAutomation({
			name: 'Pending migration',
			prompt: 'Review.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
		});
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ITelemetryService, telemetryService);
		instantiationService.stub(IAutomationStorageService, automationStorage);
		const store = disposables.add(new ReconnectableAgentHostAutomationStore(
			'local-agent-host',
			legacy,
			undefined,
			instantiationService,
			logService,
			configurationService,
		));
		store.setConnection(connection);
		const migration = store.completeMigration();
		await connection.createRequested.p;

		store.dispose();
		await migration;

		assert.deepStrictEqual({
			createRequests: connection.dispatched.filter(entry => entry.action.type === ActionType.AutomationCreateRequested).length,
			migrationErrors: logService.errors.filter(message => message.includes('Automation migration failed')),
			failedTelemetry: telemetryService.events.filter(event => event.name === 'automation.migration' && event.data['outcome'] === 'failed'),
		}, {
			createRequests: 1,
			migrationErrors: [],
			failedTelemetry: [],
		});
	});
});
