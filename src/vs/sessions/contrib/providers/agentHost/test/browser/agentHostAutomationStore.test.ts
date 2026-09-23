/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, type IReference } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { getAgentHostExtensionInitializeResultMeta } from '../../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType, type ActionEnvelope } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { AutomationOperation, AutomationRunOriginKind, AutomationRunStatus, AutomationTriggerKind, MessageKind, type AutomationEntry, type AutomationRunSummary, type AutomationState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { AUTOMATION_CATALOG_URI, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { AgentHostAutomationStore } from '../../browser/agentHostAutomationStore.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from '../../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { ReconnectableAgentHostAutomationStore } from '../../browser/reconnectableAgentHostAutomationStore.js';
import { AutomationUnavailableError, type AutomationCatalogueState } from '../../../../../../workbench/contrib/chat/common/automations/automationService.js';
import type { IAutomationDescriptor, IAutomationRun } from '../../../../../../workbench/contrib/chat/common/automations/automation.js';
import { ProviderAutomationService } from '../../../../automations/browser/providerAutomationService.js';
import { AutomationRunner } from '../../../../automations/browser/automationRunner.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';

class TestAutomationConnection {

	private readonly _onDidAction = new Emitter<ActionEnvelope>();
	readonly onDidAction = this._onDidAction.event;
	private readonly _onDidCatalogChange = new Emitter<AutomationState>();
	private readonly _onDidCatalogError = new Emitter<Error>();
	private _catalog: AutomationState = { entries: [] };
	private _catalogError: Error | undefined;
	private _catalogAvailable: boolean;
	private _serverSeq = 0;

	readonly initializeResult;
	readonly runRequests: string[] = [];
	lastRunResource = '';
	readonly dispatched: { readonly channel: string; readonly action: Parameters<IAgentConnection['dispatch']>[1] }[] = [];
	subscribedChannel: string | undefined;
	runPrimarySession: string | undefined = 'mock:/session';
	readonly runRequested = new DeferredPromise<void>();
	runAdmissionBarrier: Promise<void> | undefined;
	suppressCreatePublication = false;
	updateError: Error | undefined;
	readonly createRequested = new DeferredPromise<void>();

	constructor(catalogAvailable = true) {
		this._catalogAvailable = catalogAvailable;
		this.initializeResult = observableValue<InitializeResult | undefined>(this, {
			protocolVersion: '1',
			serverSeq: 0,
			snapshots: [],
			automations: { create: {}, runCancellation: {} },
			_meta: getAgentHostExtensionInitializeResultMeta(),
		});
	}

	setFirstAutomationSessionConfig(config: Record<string, unknown>): void {
		const [automation, ...rest] = this._catalog.entries;
		if (!automation) {
			throw new Error('No Automation is available.');
		}
		this._catalog = {
			entries: [{
				...automation,
				definition: {
					...automation.definition,
					session: { ...automation.definition.session, config },
				},
			}, ...rest],
		};
		this._onDidCatalogChange.fire(this._catalog);
	}

	getSubscription(
		kind: StateComponents.AutomationCatalog,
		resource: URI,
		_owner: string,
	): IReference<IAgentSubscription<AutomationState>> {
		assert.strictEqual(kind, StateComponents.AutomationCatalog);
		this.subscribedChannel = resource.toString();
		const connection = this;
		return {
			object: {
				get value() { return connection._catalogError ?? (connection._catalogAvailable ? connection._catalog : undefined); },
				get verifiedValue() { return connection._catalogAvailable ? connection._catalog : undefined; },
				onDidChange: this._onDidCatalogChange.event,
				onDidError: this._onDidCatalogError.event,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			},
			dispose: () => { },
		};
	}

	setCatalogError(error: Error): void {
		this._catalogError = error;
		this._onDidCatalogError.fire(error);
	}

	setCatalogAvailable(available = true): void {
		this._catalogAvailable = available;
		this._catalogError = undefined;
		this._onDidCatalogChange.fire(this._catalog);
	}

	dispatch(channel: string, action: Parameters<IAgentConnection['dispatch']>[1]): void {
		this.dispatched.push({ channel, action });
		if (action.type === ActionType.AutomationCreateRequested) {
			void this.createRequested.complete();
			if (this.suppressCreatePublication) {
				return;
			}
			const timestamp = new Date().toISOString();
			const operations = [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run];
			const automation = {
				resource: action.resource,
				definition: action.definition,
				runs: [],
				operations,
				createdAt: timestamp,
				modifiedAt: timestamp,
			};
			this._catalog = { entries: [...this._catalog.entries, automation] };
			this._onDidCatalogChange.fire(this._catalog);
			this._onDidAction.fire({
				channel: AUTOMATION_CATALOG_URI,
				action: { type: ActionType.AutomationSet, automation },
				serverSeq: ++this._serverSeq,
				origin: undefined,
			});
		} else if (action.type === ActionType.AutomationUpdateRequested) {
			if (this.updateError) {
				throw this.updateError;
			}
			const current = this._catalog.entries.find(automation => automation.resource === action.resource);
			if (!current) {
				throw new Error(`Missing Automation: ${action.resource}`);
			}
			const definition = { ...current.definition, ...action.changes };
			const operations = [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run];
			const automation = {
				...current,
				definition,
				operations,
				modifiedAt: new Date().toISOString(),
			};
			this._catalog = {
				entries: this._catalog.entries.map(candidate => candidate.resource === automation.resource ? automation : candidate),
			};
			this._onDidCatalogChange.fire(this._catalog);
			this._onDidAction.fire({
				channel: AUTOMATION_CATALOG_URI,
				action: { type: ActionType.AutomationSet, automation },
				serverSeq: ++this._serverSeq,
				origin: undefined,
			});
		} else if (action.type === ActionType.AutomationRemoved) {
			this._catalog = {
				...this._catalog,
				entries: this._catalog.entries.filter(automation => automation.resource !== action.resource),
			};
			this._onDidCatalogChange.fire(this._catalog);
		} else if (action.type === ActionType.AutomationRunCancelRequested) {
			this._catalog = {
				...this._catalog,
				entries: this._catalog.entries.map(automation => ({
					...automation,
					runs: automation.runs.map(run => run.resource === channel ? {
						...run,
						lifecycle: { status: AutomationRunStatus.Cancelled, createdAt: run.lifecycle.createdAt, completedAt: new Date().toISOString() },
					} : run),
				})),
			};
			this._onDidCatalogChange.fire(this._catalog);
		}
	}

	async runAutomation(params: { readonly automation: string }) {
		this.runRequests.push(params.automation);
		const automation = this._catalog.entries.find(candidate => candidate.resource === params.automation);
		if (!automation) {
			throw new Error(`Missing Automation: ${params.automation}`);
		}
		const resource = `ahp-automation-run:/run-${++this._serverSeq}`;
		this.lastRunResource = resource;
		const timestamp = new Date().toISOString();
		const run: AutomationRunSummary = {
			resource,
			automation: automation.resource,
			origin: { kind: AutomationRunOriginKind.Manual },
			lifecycle: this.runPrimarySession === undefined
				? { status: AutomationRunStatus.Pending, createdAt: timestamp }
				: { status: AutomationRunStatus.Running, createdAt: timestamp, startedAt: timestamp },
			primarySession: this.runPrimarySession,
			sessionCount: this.runPrimarySession === undefined ? 0 : 1,
		};
		const updated = { ...automation, runs: [run, ...automation.runs] };
		this._catalog = {
			...this._catalog,
			entries: this._catalog.entries.map(candidate => candidate.resource === updated.resource ? updated : candidate),
		};
		this._onDidCatalogChange.fire(this._catalog);
		await this.runRequested.complete();
		await this.runAdmissionBarrier;
		return { resource };
	}

	setOperations(resource: string, operations: AutomationOperation[]): void {
		const current = this._catalog.entries.find(automation => automation.resource === resource);
		if (!current) {
			throw new Error(`Missing Automation: ${resource}`);
		}
		const automation = { ...current, operations };
		this._catalog = {
			...this._catalog,
			entries: this._catalog.entries.map(candidate => candidate.resource === resource ? automation : candidate),
		};
		this._onDidCatalogChange.fire(this._catalog);
	}

	setAutomation(automation: AutomationEntry): void {
		this._catalog = {
			...this._catalog,
			entries: [
				...this._catalog.entries.filter(candidate => candidate.resource !== automation.resource),
				automation,
			],
		};
		this._onDidCatalogChange.fire(this._catalog);
	}

	completeRun(resource: string): void {
		const timestamp = new Date().toISOString();
		this._catalog = {
			...this._catalog,
			entries: this._catalog.entries.map(automation => ({
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
		this._onDidCatalogError.dispose();
	}
}

suite('AgentHostAutomationStore', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function reconnectable(enabled = true) {
		const storage = disposables.add(new InMemoryStorageService());
		const configuration = new TestConfigurationService({ [CHAT_AUTOMATIONS_ENABLED_SETTING]: enabled });
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, configuration);
		const store = disposables.add(instantiationService.createInstance(ReconnectableAgentHostAutomationStore, 'host', undefined));
		return { store, storage, configuration };
	}

	function createOptions(): IAutomationDescriptor {
		return {
			id: 'automation',
			name: 'Review',
			prompt: 'Review changes',
			target: { kind: 'quickChat', providerId: 'host', sessionTypeId: 'copilotcli' },
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			enabled: true,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
		};
	}

	test('disconnected, initializing, unsupported and disabled hosts never use browser ledgers', async () => {
		const reasons = {
			disconnected: 'The Agent Host is disconnected. Reconnect to the host and try again.',
			initializing: 'The Agent Host is still connecting. Wait for the connection to finish, then try again.',
			unsupported: 'This Agent Host does not support automations. Update the host or use an Agent Host with Automation support.',
			disabled: 'Automations are disabled. Enable the chat.automations.enabled setting and try again.',
		};
		for (const state of ['disconnected', 'initializing', 'unsupported', 'disabled'] as const) {
			const { store, storage } = reconnectable(state !== 'disabled');
			const legacy = JSON.stringify({ schemaVersion: 4, automations: [createOptions()], runs: [] });
			storage.store('chat.automations.ledger', legacy, StorageScope.APPLICATION, StorageTarget.MACHINE);
			storage.store('chat.automations.provider.host.ledger', legacy, StorageScope.APPLICATION, StorageTarget.MACHINE);
			const connection = disposables.add(new TestAutomationConnection());
			if (state === 'initializing') {
				connection.initializeResult.set(undefined, undefined);
			} else if (state === 'unsupported') {
				connection.initializeResult.set({ protocolVersion: '1', serverSeq: 0, snapshots: [] }, undefined);
			}
			if (state !== 'disconnected') {
				store.setConnection(connection);
			}
			assert.throws(() => store.createAutomation(createOptions()), AutomationUnavailableError);
			assert.throws(() => store.updateAutomation('automation', { enabled: true }), AutomationUnavailableError);
			assert.throws(() => store.deleteAutomation('automation'), AutomationUnavailableError);
			assert.throws(() => store.runAutomation('automation'), AutomationUnavailableError);
			assert.deepStrictEqual({
				state: store.catalogueState.get(),
				reason: store.unavailableReason.get(),
				canCreate: store.canCreateAutomation.get(),
				canRun: store.canRunAutomation('automation'),
				automations: store.automations.get(),
				runs: store.runs.get(),
				actions: connection.dispatched,
				requests: connection.runRequests,
				legacy: storage.get('chat.automations.ledger', StorageScope.APPLICATION),
				providerLegacy: storage.get('chat.automations.provider.host.ledger', StorageScope.APPLICATION),
			}, {
				state: state === 'initializing' ? 'loading' : 'unavailable',
				reason: reasons[state],
				canCreate: false, canRun: false, automations: [], runs: [], actions: [], requests: [], legacy, providerLegacy: legacy,
			});
		}
	});

	test('capability resolution and disconnect publish accurate availability without any activation dispatch', () => {
		const { store } = reconnectable();
		const connection = disposables.add(new TestAutomationConnection());
		connection.initializeResult.set(undefined, undefined);
		const states: AutomationCatalogueState[] = [];
		disposables.add(autorun(reader => states.push(store.catalogueState.read(reader))));
		store.setConnection(connection);
		connection.initializeResult.set({ protocolVersion: '1', serverSeq: 0, snapshots: [] }, undefined);
		connection.initializeResult.set({ protocolVersion: '1', serverSeq: 0, snapshots: [], automations: { create: {} }, _meta: getAgentHostExtensionInitializeResultMeta() }, undefined);
		store.clearConnection();
		assert.deepStrictEqual({ states, actions: connection.dispatched, requests: connection.runRequests }, {
			states: ['unavailable', 'loading', 'unavailable', 'ready', 'unavailable'],
			actions: [], requests: [],
		});
	});

	test('capability removal and feature disablement revoke operations immediately', async () => {
		const { store, configuration } = reconnectable();
		const connection = disposables.add(new TestAutomationConnection());
		store.setConnection(connection);
		const automation = await store.createAutomation(createOptions());
		const supported = connection.initializeResult.get()!;
		connection.initializeResult.set({ ...supported, automations: undefined }, undefined);
		assert.throws(() => store.runAutomation(automation.id), AutomationUnavailableError);
		connection.initializeResult.set(supported, undefined);
		await configuration.setUserConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING, false);
		configuration.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([CHAT_AUTOMATIONS_ENABLED_SETTING]),
			change: { keys: [CHAT_AUTOMATIONS_ENABLED_SETTING], overrides: [] },
			affectsConfiguration: () => true,
		});
		assert.deepStrictEqual({
			state: store.catalogueState.get(),
			create: store.canCreateAutomation.get(),
			run: store.canRunAutomation(automation.id),
			update: store.canUpdateAutomation(automation.id),
			remove: store.canDeleteAutomation(automation.id),
			requests: connection.runRequests,
		}, { state: 'unavailable', create: false, run: false, update: false, remove: false, requests: [] });
	});

	test('requires autonomous authority on mixed-version hosts before subscribing or accepting definitions', async () => {
		const { store } = reconnectable();
		const connection = disposables.add(new TestAutomationConnection());
		const compatible = connection.initializeResult.get()!;
		for (const meta of [undefined, { 'vscode.autonomousAutomations': false }, { 'vscode.autonomousAutomations': 'true' }]) {
			connection.initializeResult.set({ ...compatible, _meta: meta }, undefined);
			store.setConnection(connection);
			assert.throws(() => store.createAutomation(createOptions()), /Update this Agent Host/);
			assert.deepStrictEqual({
				state: store.catalogueState.get(),
				canCreate: store.canCreateAutomation.get(),
				subscribed: connection.subscribedChannel,
				dispatched: connection.dispatched,
				runRequests: connection.runRequests,
			}, { state: 'unavailable', canCreate: false, subscribed: undefined, dispatched: [], runRequests: [] });
			assert.match(store.unavailableReason.get()!, /Update this Agent Host/);
		}
		connection.initializeResult.set(compatible, undefined);
		const created = await store.createAutomation(createOptions());
		const upgraded = { ready: store.catalogueState.get(), canRun: store.canRunAutomation(created.id), reason: store.unavailableReason.get() };
		connection.initializeResult.set({ ...compatible, _meta: undefined }, undefined);
		assert.throws(() => store.runAutomation(created.id), /Update this Agent Host/);
		assert.deepStrictEqual({ upgraded, downgraded: store.catalogueState.get(), runRequests: connection.runRequests }, {
			upgraded: { ready: 'ready', canRun: true, reason: undefined }, downgraded: 'unavailable', runRequests: [],
		});
	});

	test('reads already-migrated history without reading or rewriting a legacy definition ledger', () => {
		const { store, storage } = reconnectable();
		const connection = disposables.add(new TestAutomationConnection());
		const run: IAutomationRun = {
			id: 'old-run', automationId: 'automation', status: 'completed', trigger: 'manual',
			startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:01:00Z',
			sessionResource: URI.parse('agent-host-copilotcli:/old-session'),
		};
		const archive = JSON.stringify({ version: 1, runs: [{ ...run, sessionResource: run.sessionResource?.toString(), leaderWindowId: 42 }] });
		storage.store('agentHostAutomation.legacyRunArchive.host', archive, StorageScope.APPLICATION, StorageTarget.MACHINE);
		storage.store('chat.automations.ledger', 'obsolete-ledger-not-readable', StorageScope.APPLICATION, StorageTarget.MACHINE);
		store.setConnection(connection);
		const automationId = 'host:ahp-automation:/automation';
		const history = store.runsFor(automationId).get();
		store.clearConnection();
		store.setConnection(connection);
		const serializeRuns = (runs: readonly IAutomationRun[]) => runs.map(run => ({ ...run, sessionResource: run.sessionResource?.toString() }));
		assert.deepStrictEqual({
			history: serializeRuns(history),
			reconnected: serializeRuns(store.runsFor(automationId).get()),
			archive: storage.get('agentHostAutomation.legacyRunArchive.host', StorageScope.APPLICATION),
			legacy: storage.get('chat.automations.ledger', StorageScope.APPLICATION),
			actions: connection.dispatched,
		}, {
			history: [{ ...run, id: 'host:legacy-automation-run:/old-run', automationId, sessionResource: run.sessionResource?.toString(), leaderWindowId: 42 }],
			reconnected: [{ ...run, id: 'host:legacy-automation-run:/old-run', automationId, sessionResource: run.sessionResource?.toString(), leaderWindowId: 42 }],
			archive, legacy: 'obsolete-ledger-not-readable', actions: [],
		});
	});

	test('cross-host targets are rejected before any host mutation', async () => {
		const { store } = reconnectable();
		const connection = disposables.add(new TestAutomationConnection());
		store.setConnection(connection);
		const automation = await store.createAutomation(createOptions());
		const target = { kind: 'quickChat', providerId: 'another-host', sessionTypeId: 'copilotcli' } as const;
		const actionsBefore = connection.dispatched.length;
		await assert.rejects(store.createAutomation({ ...createOptions(), target }), /must belong/);
		await assert.rejects(store.updateAutomation(automation.id, { target }), /must belong/);
		assert.strictEqual(connection.dispatched.length, actionsBefore);
	});

	test('non-terminal archived rows remain inert history without rewriting storage or host runs', () => {
		const { store, storage } = reconnectable();
		const connection = disposables.add(new TestAutomationConnection());
		const archive = JSON.stringify({
			version: 1,
			runs: [{
				id: 'interrupted', automationId: 'automation', status: 'running', trigger: 'manual',
				startedAt: '2026-01-01T00:00:00Z', sessionResource: 'agent-host-copilotcli:/old-session', errorMessage: 'Lost tracking',
			}],
		});
		storage.store('agentHostAutomation.legacyRunArchive.host', archive, StorageScope.APPLICATION, StorageTarget.MACHINE);
		store.setConnection(connection);
		const [run] = store.runs.get();
		assert.deepStrictEqual({
			run: { ...run, sessionResource: run.sessionResource?.toString() },
			active: store.getActiveRunFor('host:ahp-automation:/automation'),
			archive: storage.get('agentHostAutomation.legacyRunArchive.host', StorageScope.APPLICATION),
			actions: connection.dispatched,
			requests: connection.runRequests,
		}, {
			run: {
				id: 'host:legacy-automation-run:/interrupted', automationId: 'host:ahp-automation:/automation', status: 'failed', trigger: 'manual',
				startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:00:00Z',
				sessionResource: 'agent-host-copilotcli:/old-session', errorMessage: 'Lost tracking',
			},
			active: undefined, archive, actions: [], requests: [],
		});
	});

	test('mutation guards run immediately before AHP dispatch, not before an asynchronous wait', async () => {
		const { store } = reconnectable();
		const connection = disposables.add(new TestAutomationConnection());
		store.setConnection(connection);
		const automation = await store.createAutomation(createOptions());
		const dispatches = connection.dispatched.length;
		for (const operation of ['create', 'update', 'delete'] as const) {
			let permitted = true;
			const guard = () => {
				if (!permitted) {
					throw new Error('Mutation cancelled');
				}
			};
			const pending = operation === 'create'
				? store.createAutomation(createOptions(), guard)
				: operation === 'update'
					? store.updateAutomationIfUnchanged(automation.id, { name: 'Changed' }, automation, guard)
					: store.deleteAutomation(automation.id, guard);
			permitted = false;
			await assert.rejects(pending, /Mutation cancelled/);
		}
		assert.strictEqual(connection.dispatched.length, dispatches);
	});

	test('disconnecting before dispatch cannot mutate a stale host connection', async () => {
		const { store } = reconnectable();
		const connection = disposables.add(new TestAutomationConnection());
		store.setConnection(connection);
		const pending = store.createAutomation(createOptions());
		store.clearConnection();
		await assert.rejects(pending, /Canceled/);
		assert.deepStrictEqual(connection.dispatched, []);
	});

	test('reports loading until the authoritative catalogue is ready', () => {
		const connection = new TestAutomationConnection(false);
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));
		const loading = store.catalogueState.get();
		connection.setCatalogAvailable();

		assert.deepStrictEqual({
			loading,
			afterSnapshot: store.catalogueState.get(),
		}, {
			loading: 'loading',
			afterSnapshot: 'ready',
		});
	});

	test('reports catalogue errors after the ready state was observed', async () => {
		const connection = new TestAutomationConnection();
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));
		await store.createAutomation({
			name: 'Review changes',
			prompt: 'Review the current changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
		});

		const ready = store.catalogueState.get();
		connection.setCatalogError(new Error('catalogue unavailable'));

		assert.deepStrictEqual({
			ready,
			afterError: store.catalogueState.get(),
		}, {
			ready: 'ready',
			afterError: 'error',
		});
	});

	test('uses the exact catalogue channel and projects authoritative creates', async () => {
		const connection = new TestAutomationConnection();
		disposables.add(connection);
		connection.runPrimarySession = 'ahp-session:/session';
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));

		const automation = await store.createAutomation({
			name: 'Review changes',
			prompt: 'Review the current changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
			mode: 'agent',
			permissionLevel: 'autopilot',
		});
		const create = connection.dispatched[0].action;
		const trigger = create.type === ActionType.AutomationCreateRequested ? create.definition.triggers[0] : undefined;

		assert.deepStrictEqual({
			catalogueState: store.catalogueState.get(),
			subscribedChannel: connection.subscribedChannel,
			dispatchChannel: connection.dispatched[0].channel,
			definitionMeta: create.type === ActionType.AutomationCreateRequested ? create.definition._meta : undefined,
			sessionConfig: create.type === ActionType.AutomationCreateRequested ? create.definition.session.config : undefined,
			triggerExpression: trigger?.kind === AutomationTriggerKind.Schedule ? trigger.schedule.expression : undefined,
			automation: {
				name: automation.name,
				prompt: automation.prompt,
				schedule: automation.schedule,
				target: automation.target,
				enabled: automation.enabled,
			},
		}, {
			catalogueState: 'ready',
			subscribedChannel: URI.parse(AUTOMATION_CATALOG_URI).toString(),
			dispatchChannel: AUTOMATION_CATALOG_URI,
			definitionMeta: undefined,
			sessionConfig: { mode: 'autopilot', autoApprove: 'assisted' },
			triggerExpression: '30 9 * * *',
			automation: {
				name: 'Review changes',
				prompt: 'Review the current changes.',
				schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
				target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
				enabled: true,
			},
		});
	});

	test('does not forward generic chat modes to Agent Host session config', async () => {
		const connection = disposables.add(new TestAutomationConnection());
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));

		await store.createAutomation({
			name: 'Review changes',
			prompt: 'Review the current changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
			mode: 'agent',
			permissionLevel: 'default',
		});

		const create = connection.dispatched[0].action;
		assert.deepStrictEqual(
			create.type === ActionType.AutomationCreateRequested ? create.definition.session.config : undefined,
			{ autoApprove: 'default' },
		);
	});

	test('applies legacy Autopilot configuration to the default provider', async () => {
		const connection = disposables.add(new TestAutomationConnection());
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));

		await store.createAutomation({
			name: 'Review changes',
			prompt: 'Review the current changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: {
				kind: 'workspace',
				folderUri: URI.file('/workspace'),
				providerId: 'local-agent-host',
				sessionTypeId: undefined,
				isolation: { kind: 'default' },
			},
			mode: 'agent',
			permissionLevel: 'autopilot',
		});

		const create = connection.dispatched[0].action;
		assert.deepStrictEqual(
			create.type === ActionType.AutomationCreateRequested ? create.definition.session.config : undefined,
			{ mode: 'autopilot', autoApprove: 'assisted' },
		);
	});

	test('preserves Agent Host config on an unrelated canonical update', async () => {
		const connection = disposables.add(new TestAutomationConnection());
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));
		const automation = await store.createAutomation({
			name: 'Review changes',
			prompt: 'Review the current changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
			mode: 'autopilot',
			permissionLevel: 'assisted',
		});

		const current = store.getAutomation(automation.id);
		await store.updateAutomation(automation.id, {
			name: 'Review renamed changes',
			sessionTemplate: current?.sessionTemplate,
		});

		const update = connection.dispatched.at(-1)?.action;
		assert.deepStrictEqual(
			update?.type === ActionType.AutomationUpdateRequested ? update.changes.session?.config : undefined,
			{ mode: 'autopilot', autoApprove: 'assisted' },
		);
	});

	test('does not apply legacy Copilot configuration to another session type', async () => {
		const connection = disposables.add(new TestAutomationConnection());
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));

		await store.createAutomation({
			name: 'Review changes',
			prompt: 'Review the current changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'claude' },
			mode: 'agent',
			permissionLevel: 'autopilot',
		});

		const create = connection.dispatched[0].action;
		assert.deepStrictEqual(
			create.type === ActionType.AutomationCreateRequested ? create.definition.session : undefined,
			{
				provider: 'claude',
				model: undefined,
				agent: undefined,
				workingDirectories: undefined,
				config: undefined,
			},
		);
	});

	test('filters session-owned values from canonical templates', async () => {
		const connection = disposables.add(new TestAutomationConnection());
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));

		await store.createAutomation({
			name: 'Review changes',
			prompt: 'Review the current changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
			sessionTemplate: {
				config: {
					mode: 'plan',
					providerOption: true,
					[SessionConfigKey.Permissions]: { allow: ['Shell(echo *)'], deny: [] },
					[SessionConfigKey.ShellInitScripts]: [{ shell: 'bash', script: 'source ~/.bashrc' }],
				},
			},
		});

		const create = connection.dispatched[0].action;
		assert.deepStrictEqual(
			create.type === ActionType.AutomationCreateRequested ? create.definition.session.config : undefined,
			{ mode: 'plan', providerOption: true },
		);
	});

	test('clears provider configuration and agent with an explicit template reset', async () => {
		const connection = disposables.add(new TestAutomationConnection());
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));
		const automation = await store.createAutomation({
			name: 'Review changes',
			prompt: 'Review the current changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'claude' },
			sessionTemplate: {
				modelId: 'model',
				modelConfiguration: { thinkingLevel: 'low' },
				agent: { uri: 'file:///agents/reviewer.agent.md' },
				config: { mode: 'plan', providerOption: true },
			},
		});
		const permissions = {
			allow: ['Shell(echo *)'],
			deny: [],
		};
		connection.setFirstAutomationSessionConfig({
			[SessionConfigKey.Permissions]: permissions,
			[SessionConfigKey.Mode]: 'plan',
			providerOption: true,
		});

		await store.updateAutomation(automation.id, { sessionTemplate: null });

		const update = connection.dispatched.at(-1)?.action;
		assert.deepStrictEqual(
			update?.type === ActionType.AutomationUpdateRequested ? update.changes.session : undefined,
			{
				provider: 'claude',
				model: undefined,
				agent: undefined,
				workingDirectories: undefined,
				config: { [SessionConfigKey.Permissions]: permissions },
			},
		);
	});

	test('drops provider configuration when retargeting to another session type', async () => {
		const connection = disposables.add(new TestAutomationConnection());
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));
		const automation = await store.createAutomation({
			name: 'Review changes',
			prompt: 'Review the current changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
			mode: 'autopilot',
			permissionLevel: 'assisted',
		});

		await store.updateAutomation(automation.id, {
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'claude' },
		});

		const update = connection.dispatched.at(-1)?.action;
		assert.deepStrictEqual(
			update?.type === ActionType.AutomationUpdateRequested ? update.changes.session : undefined,
			{
				provider: 'claude',
				model: undefined,
				agent: undefined,
				workingDirectories: undefined,
				config: undefined,
			},
		);
	});

	test('round-trips the complete Agent Host session template', async () => {
		const connection = disposables.add(new TestAutomationConnection());
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, {
			toHost: resource => resource,
			fromHost: resource => resource,
			resourceSchemeForProvider: provider => `agent-host-${provider}`,
		}, new NullLogService(), storage));
		const sessionTemplate = {
			modelId: 'agent-host-copilotcli:auto',
			modelConfiguration: { thinkingLevel: 'low', futureOption: 'preserved' },
			agent: { uri: 'file:///agents/reviewer.agent.md' },
			config: {
				mode: 'plan',
				autoApprove: 'assisted',
				providerOption: { enabled: true },
			},
		};

		const automation = await store.createAutomation({
			name: 'Review changes',
			prompt: 'Review the current changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: {
				kind: 'workspace',
				folderUri: URI.file('/workspace'),
				providerId: 'local-agent-host',
				sessionTypeId: 'copilotcli',
				isolation: { kind: 'folder' },
			},
			sessionTemplate,
		});
		await assert.rejects(
			store.updateAutomation(automation.id, { permissionLevel: 'autoApprove' }),
			/cannot be updated through legacy configuration aliases/,
		);
		const updatedTemplate = {
			...sessionTemplate,
			modelId: 'agent-host-copilotcli:gpt-5',
			config: {
				...sessionTemplate.config,
				mode: 'interactive',
				autoApprove: 'autoApprove',
			},
		};
		await store.updateAutomation(automation.id, {
			name: 'Review renamed changes',
			sessionTemplate: updatedTemplate,
		});

		const update = connection.dispatched.at(-1)?.action;
		assert.deepStrictEqual({
			projected: store.getAutomation(automation.id)?.sessionTemplate,
			updatedSession: update?.type === ActionType.AutomationUpdateRequested ? update.changes.session : undefined,
		}, {
			projected: updatedTemplate,
			updatedSession: {
				provider: 'copilotcli',
				model: { id: 'gpt-5', config: sessionTemplate.modelConfiguration },
				agent: { uri: 'file:///agents/reviewer.agent.md' },
				workingDirectories: ['file:///workspace'],
				config: {
					mode: 'interactive',
					autoApprove: 'autoApprove',
					providerOption: { enabled: true },
					isolation: 'folder',
				},
			},
		});
	});

	test('rejects model configuration without a model identifier instead of dropping it', async () => {
		const connection = disposables.add(new TestAutomationConnection());
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));
		const options = {
			name: 'Model configuration',
			prompt: 'Review changes.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
		} as const;
		await assert.rejects(store.createAutomation({
			...options,
			sessionTemplate: { modelConfiguration: { thinkingLevel: 'low' } },
		}), /model configuration requires a model identifier/);
		const sessionTemplate = { modelId: 'model', modelConfiguration: { thinkingLevel: 'low' } };
		const automation = await store.createAutomation({ ...options, sessionTemplate });
		const dispatched = connection.dispatched.length;
		await assert.rejects(store.updateAutomation(automation.id, {
			sessionTemplate: { modelConfiguration: {} },
		}), /model configuration requires a model identifier/);

		assert.deepStrictEqual({
			template: store.getAutomation(automation.id)?.sessionTemplate,
			additionalActions: connection.dispatched.length - dispatched,
		}, {
			template: sessionTemplate,
			additionalActions: 0,
		});
	});

	test('explicit empty and omitted model configuration replace stale model options', async () => {
		const connection = disposables.add(new TestAutomationConnection());
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));
		const automation = await store.createAutomation({
			name: 'Reset model configuration',
			prompt: 'Review changes.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
			sessionTemplate: { modelId: 'model', modelConfiguration: { thinkingLevel: 'low', futureOption: true } },
		});
		const empty = await store.updateAutomation(automation.id, { sessionTemplate: { modelId: 'model', modelConfiguration: {} } });
		const emptyAction = connection.dispatched.at(-1)?.action;
		const reset = await store.updateAutomation(automation.id, { sessionTemplate: { modelId: 'model' } });
		const resetAction = connection.dispatched.at(-1)?.action;

		assert.deepStrictEqual({
			empty: empty.sessionTemplate,
			emptyModel: emptyAction?.type === ActionType.AutomationUpdateRequested ? emptyAction.changes.session?.model : undefined,
			reset: reset.sessionTemplate,
			resetModel: resetAction?.type === ActionType.AutomationUpdateRequested ? resetAction.changes.session?.model : undefined,
		}, {
			empty: { modelId: 'model', modelConfiguration: {} },
			emptyModel: { id: 'model', config: {} },
			reset: { modelId: 'model' },
			resetModel: { id: 'model' },
		});
	});

	test('applies the first flat permission update when the projected session template is empty', async () => {
		const connection = disposables.add(new TestAutomationConnection());
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));
		const automation = await store.createAutomation({
			name: 'Review changes',
			prompt: 'Review the current changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
		});

		await store.updateAutomation(automation.id, { permissionLevel: 'autoApprove' });

		const update = connection.dispatched.at(-1)?.action;
		assert.deepStrictEqual(
			update?.type === ActionType.AutomationUpdateRequested ? update.changes.session?.config : undefined,
			{ autoApprove: 'autoApprove' },
		);
	});

	test('canonicalizes irrelevant schedule fields when updating an interval', async () => {
		const connection = new TestAutomationConnection();
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));
		const automation = await store.createAutomation({
			name: 'Scheduled review',
			prompt: 'Review changes.',
			schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
		});

		const updated = await store.updateAutomation(automation.id, {
			schedule: { interval: 'manual', scheduleHour: 9, scheduleMinute: 30, scheduleDay: 1 },
		});

		assert.deepStrictEqual(updated.schedule, {
			interval: 'manual',
			scheduleHour: 0,
			scheduleMinute: 0,
			scheduleDay: 0,
		});
	});

	test('maps remote workspace and model identifiers at the AHP boundary', async () => {
		const connection = new TestAutomationConnection();
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('remote-agent-host', connection, {
			toHost: resource => URI.file(resource.path),
			fromHost: resource => URI.from({ scheme: 'client', path: resource.path }),
			resourceSchemeForProvider: provider => `remote-test-${provider}`,
			providerForSessionScheme: scheme => scheme === 'ahp-session' ? 'mock' : scheme,
		}, new NullLogService(), storage));

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
		const claim = await store.runAutomation(automation.id);
		assert.strictEqual(claim.kind, 'dispatched');
		void claim.whenCompleted.catch(() => { });

		assert.deepStrictEqual({
			hostDirectory: create.type === ActionType.AutomationCreateRequested ? create.definition.session.workingDirectories : undefined,
			hostModel: create.type === ActionType.AutomationCreateRequested ? create.definition.session.model?.id : undefined,
			clientDirectory: automation.target.kind === 'workspace' ? automation.target.folderUri.toString() : undefined,
			clientModel: automation.sessionTemplate?.modelId,
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
		const connection = new TestAutomationConnection();
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, {
			toHost: resource => resource,
			fromHost: resource => resource,
			resourceSchemeForProvider: provider => `agent-host-${provider}`,
			providerForResourceScheme: scheme => scheme.startsWith('agent-host-') ? scheme.slice('agent-host-'.length) : undefined,
		}, new NullLogService(), storage));

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
			clientModel: automation.sessionTemplate?.modelId,
		}, {
			hostModel: 'auto',
			clientModel: 'agent-host-copilotcli:auto',
		});
	});

	test('clears an inherited model when the target authority changes', async () => {
		const connection = new TestAutomationConnection();
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, {
			toHost: resource => resource,
			fromHost: resource => resource,
			resourceSchemeForProvider: provider => `agent-host-${provider}`,
			providerForResourceScheme: scheme => scheme.startsWith('agent-host-') ? scheme.slice('agent-host-'.length) : undefined,
		}, new NullLogService(), storage));
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
			clientModel: updated.sessionTemplate?.modelId,
		}, {
			hostModel: undefined,
			clientModel: undefined,
		});
	});

	test('normalizes a qualified model for the default provider without splitting native colons', async () => {
		const connection = new TestAutomationConnection();
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, {
			toHost: resource => resource,
			fromHost: resource => resource,
			resourceSchemeForProvider: provider => `agent-host-${provider}`,
			providerForResourceScheme: scheme => scheme.startsWith('agent-host-') ? scheme.slice('agent-host-'.length) : undefined,
		}, new NullLogService(), storage));
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
			hostProviders: createActions.map(action => action.definition.session.provider),
			hostModels: createActions.map(action => action.definition.session.model?.id),
			clientModels: [defaultProvider.sessionTemplate?.modelId, nativeColon.sessionTemplate?.modelId],
		}, {
			hostProviders: ['copilotcli', 'copilotcli'],
			hostModels: ['auto', 'openai/gpt-5:high'],
			clientModels: ['agent-host-copilotcli:auto', 'agent-host-copilotcli:openai/gpt-5:high'],
		});
	});

	test('qualifies host-authored models and preserves definition-owned configuration on update', async () => {
		const connection = new TestAutomationConnection();
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, {
			toHost: resource => resource,
			fromHost: resource => resource,
			resourceSchemeForProvider: provider => `agent-host-${provider}`,
		}, new NullLogService(), storage));
		const timestamp = new Date().toISOString();

		connection.setAutomation({
			resource: 'ahp-automation:/host-authored',
			definition: {
				title: 'Host-authored',
				message: { text: 'Say hi.', origin: { kind: MessageKind.Automation } },
				session: {
					provider: 'codex',
					model: { id: 'auto' },
					config: {
						mode: 'plan',
						[SessionConfigKey.Permissions]: { allow: ['Shell(echo *)'], deny: [] },
						[SessionConfigKey.WorktreeBranchPrefix]: 'host-prefix/',
						[SessionConfigKey.WorktreeIncludeFiles]: ['host.json'],
						[SessionConfigKey.ShellInitScripts]: [{ shell: 'bash', script: 'source ~/.bashrc' }],
						[SessionConfigKey.AgentMerge]: true,
					},
				},
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
		const projected = store.getAutomation('local-agent-host:ahp-automation:/host-authored');
		await store.updateAutomation('local-agent-host:ahp-automation:/host-authored', { enabled: false });
		const update = connection.dispatched.at(-1)?.action;

		assert.deepStrictEqual({
			sessionTemplate: projected?.sessionTemplate,
			sessionResource: store.runs.get()[0].sessionResource?.toString(),
			updatedConfig: update?.type === ActionType.AutomationUpdateRequested ? update.changes.session?.config : undefined,
		}, {
			sessionTemplate: {
				modelId: 'agent-host-codex:auto',
				config: { mode: 'plan' },
			},
			sessionResource: 'agent-host-copilotcli:/host-authored-session',
			updatedConfig: {
				mode: 'plan',
				[SessionConfigKey.Permissions]: { allow: ['Shell(echo *)'], deny: [] },
				[SessionConfigKey.WorktreeBranchPrefix]: 'host-prefix/',
				[SessionConfigKey.WorktreeIncludeFiles]: ['host.json'],
				[SessionConfigKey.AgentMerge]: true,
			},
		});
	});

	test('uses per-automation operations as the client authority', async () => {
		const connection = new TestAutomationConnection();
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));
		const automation = await store.createAutomation({
			name: 'Restricted',
			prompt: 'Review.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
		});
		const create = connection.dispatched[0].action;
		assert.strictEqual(create.type, ActionType.AutomationCreateRequested);
		connection.setOperations(create.resource, [AutomationOperation.Update]);

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

	test('an update-only authority edits existing definitions without permitting creation', async () => {
		const { store } = reconnectable();
		const connection = disposables.add(new TestAutomationConnection());
		connection.setAutomation({
			resource: 'ahp-automation:/existing',
			definition: {
				title: 'Existing',
				message: { text: 'Review.', origin: { kind: MessageKind.Automation } },
				session: { provider: 'copilotcli' },
				enabled: false,
				triggers: [],
			},
			runs: [],
			operations: [AutomationOperation.Update],
			createdAt: '2026-01-01T00:00:00Z',
			modifiedAt: '2026-01-01T00:00:00Z',
		});
		connection.initializeResult.set({ ...connection.initializeResult.get()!, automations: {} }, undefined);
		store.setConnection(connection);
		const existing = store.automations.get()[0];
		const edited = await store.updateAutomationIfUnchanged(existing.id, { name: 'Renamed', schedule: { interval: 'daily', scheduleHour: 10, scheduleMinute: 0, scheduleDay: 0 } }, existing);
		await assert.rejects(store.createAutomation(createOptions()), /not ready to create/);
		assert.deepStrictEqual({
			canCreate: store.canCreateAutomation.get(),
			editKind: edited.kind,
			name: store.getAutomation(existing.id)?.name,
			schedule: store.getAutomation(existing.id)?.schedule,
			actions: connection.dispatched.map(({ action }) => action.type),
		}, {
			canCreate: false, editKind: 'updated', name: 'Renamed',
			schedule: { interval: 'daily', scheduleHour: 10, scheduleMinute: 0, scheduleDay: 0 },
			actions: [ActionType.AutomationUpdateRequested],
		});
	});

	test('dispatches run cancellation only when the capability is advertised', async () => {
		const connection = new TestAutomationConnection();
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, undefined, new NullLogService(), storage));
		const automation = await store.createAutomation({
			name: 'Cancelable',
			prompt: 'Review.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
		});

		const claim = await store.runAutomation(automation.id);
		assert.strictEqual(claim.kind, 'dispatched');
		claim.cancel?.();
		void claim.whenCompleted.catch(() => { });

		const cancellation = connection.dispatched.at(-1);
		assert.deepStrictEqual(cancellation, {
			channel: connection.lastRunResource,
			action: { type: ActionType.AutomationRunCancelRequested },
		});
	});

	for (const pauseAdmission of [false, true]) {
		test(`cancels a pending run ${pauseAdmission ? 'during admission' : 'after waiting more than 30 seconds for a session'} through the client stack`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { store } = reconnectable();
			const connection = disposables.add(new TestAutomationConnection());
			connection.runPrimarySession = undefined;
			const barrier = new DeferredPromise<void>();
			connection.runAdmissionBarrier = pauseAdmission ? barrier.p : undefined;
			store.setConnection(connection);
			const provider = upcastPartial<ISessionsProvider>({ id: 'host', label: 'Host', automations: store });
			const registry = new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return [provider]; }
				override getProvider<T extends ISessionsProvider>(id: string): T | undefined { return id === provider.id ? provider as T : undefined; }
			}();
			const service = disposables.add(new ProviderAutomationService(constObservable(true), registry));
			const errors: string[] = [];
			const runner = new AutomationRunner(service, registry, new NullLogService(), upcastPartial<INotificationService>({
				error: message => errors.push(String(message)),
			}));
			const automation = await service.createAutomation(createOptions());
			const cancellation = disposables.add(new CancellationTokenSource());
			const operation = runner.runOnce(automation, cancellation.token);
			await connection.runRequested.p;
			if (!pauseAdmission) {
				await timeout(31_000);
			}
			cancellation.cancel();
			await barrier.complete();
			const dispatch = await operation.whenDispatched;
			await operation.whenCompleted;
			assert.deepStrictEqual({
				kind: dispatch.kind,
				reason: dispatch.kind === 'notStarted' ? dispatch.reason : undefined,
				cancellations: connection.dispatched.filter(({ action }) => action.type === ActionType.AutomationRunCancelRequested).length,
				activeRun: store.getActiveRunFor(automation.id),
				errors,
			}, { kind: 'notStarted', reason: 'cancelled', cancellations: 1, activeRun: undefined, errors: [] });
		}));
	}

	test('does not time out an authority-dispatched run after 30 seconds', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const connection = new TestAutomationConnection();
		disposables.add(connection);
		const storage = disposables.add(new InMemoryStorageService());
		const store = disposables.add(new AgentHostAutomationStore('local-agent-host', connection, {
			toHost: resource => resource,
			fromHost: resource => resource,
			resourceSchemeForProvider: provider => `agent-host-${provider}`,
		}, new NullLogService(), storage));
		const automation = await store.createAutomation({
			name: 'Long-running',
			prompt: 'Review.',
			schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'mock' },
		});
		const claim = await store.runAutomation(automation.id);
		assert.strictEqual(claim.kind, 'dispatched');
		let settled = false;
		void claim.whenCompleted.finally(() => settled = true);

		await timeout(31_000);
		assert.strictEqual(settled, false);

		connection.completeRun(connection.lastRunResource);
		await claim.whenCompleted;
		assert.strictEqual(settled, true);
	}));

	test('scopes colliding catalogue and history identities to the concrete host for every operation', async () => {
		const resource = 'ahp-automation:/review';
		const timestamp = '2026-01-01T00:00:00Z';
		const entry: AutomationEntry = {
			resource,
			definition: {
				title: 'Local review',
				message: { text: 'Review local changes.', origin: { kind: MessageKind.Automation } },
				session: { provider: 'copilotcli' },
				enabled: true,
				triggers: [],
			},
			runs: [{
				resource: 'ahp-automation-run:/shared-run', automation: resource, origin: { kind: AutomationRunOriginKind.Manual },
				lifecycle: { status: AutomationRunStatus.Completed, createdAt: timestamp, startedAt: timestamp, completedAt: timestamp },
				sessionCount: 0,
			}],
			operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
			createdAt: timestamp,
			modifiedAt: timestamp,
		};
		const localConnection = disposables.add(new TestAutomationConnection());
		const remoteConnection = disposables.add(new TestAutomationConnection());
		localConnection.setAutomation(entry);
		localConnection.setAutomation({ ...entry, resource: 'ahp-automation:/nested/review', runs: [] });
		remoteConnection.setAutomation({ ...entry, definition: { ...entry.definition, title: 'Remote review' } });
		const storage = disposables.add(new InMemoryStorageService());
		const local = disposables.add(new AgentHostAutomationStore('local', localConnection, undefined, new NullLogService(), storage));
		const remote = disposables.add(new AgentHostAutomationStore('remote', remoteConnection, undefined, new NullLogService(), storage));
		const providers = [
			upcastPartial<ISessionsProvider>({ id: 'local', automations: local }),
			upcastPartial<ISessionsProvider>({ id: 'remote', automations: remote }),
		];
		const service = disposables.add(new ProviderAutomationService(constObservable(true), upcastPartial<ISessionsProvidersService>({
			onDidChangeProviders: Event.None,
			getProviders: () => providers,
		})));
		const remoteAutomation = service.automations.get().find(automation => automation.target.providerId === 'remote')!;
		await service.updateAutomation(remoteAutomation.id, { name: 'Updated remote' });
		const expected = service.getAutomation(remoteAutomation.id)!;
		await service.updateAutomationIfUnchanged(expected.id, { prompt: 'Updated remote prompt' }, expected);
		const dispatched = await service.runAutomation(remoteAutomation.id);
		assert.strictEqual(dispatched.kind, 'dispatched');
		const activeRun = service.getActiveRunFor(remoteAutomation.id);
		remoteConnection.completeRun(remoteConnection.lastRunResource);
		await dispatched.whenCompleted;
		const catalogueIds = service.automations.get().map(automation => automation.id);
		const localHistory = service.runsFor('local:ahp-automation:/review').get().map(run => run.id);
		const remoteHistory = service.runsFor(remoteAutomation.id).get().map(run => run.id);
		await service.deleteAutomation(remoteAutomation.id);
		await service.updateAutomation('local:ahp-automation:/nested/review', { enabled: false });

		assert.deepStrictEqual({
			catalogueIds,
			localHistory,
			remoteHistory,
			activeAutomation: activeRun?.automationId,
			localRequests: localConnection.runRequests,
			remoteRequests: remoteConnection.runRequests,
			localMutations: localConnection.dispatched.map(({ action }) => action.type === ActionType.AutomationUpdateRequested ? action.resource : action.type),
			remoteMutations: remoteConnection.dispatched.map(({ action }) => action.type),
			remaining: service.automations.get().map(automation => automation.id),
		}, {
			catalogueIds: ['local:ahp-automation:/review', 'local:ahp-automation:/nested/review', 'remote:ahp-automation:/review'],
			localHistory: ['local:ahp-automation-run:/shared-run'],
			remoteHistory: [dispatched.run.id, 'remote:ahp-automation-run:/shared-run'],
			activeAutomation: remoteAutomation.id,
			localRequests: [],
			remoteRequests: [resource],
			localMutations: ['ahp-automation:/nested/review'],
			remoteMutations: [ActionType.AutomationUpdateRequested, ActionType.AutomationUpdateRequested, ActionType.AutomationRemoved],
			remaining: ['local:ahp-automation:/review', 'local:ahp-automation:/nested/review'],
		});
	});
});
