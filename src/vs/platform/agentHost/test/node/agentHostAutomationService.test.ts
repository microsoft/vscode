/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY, AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY, AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY, AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY } from '../../common/automationMigration.js';
import type { IAgentPluginManager } from '../../common/agentPluginManager.js';
import { AUTOMATION_VIRTUAL_CLIENT_ID, automationCustomizationSnapshotRevision, readAutomationCustomizationSnapshotReference, withAutomationCustomizationSnapshotPublication } from '../../common/meta/automationCustomizationSnapshotMeta.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AutomationMisfirePolicy, AutomationOperation, AutomationTriggerKind, type AutomationDefinition } from '../../common/state/protocol/channels-automation/state.js';
import { AutomationRunOriginKind, AutomationRunStatus, type AutomationRunState } from '../../common/state/protocol/channels-automation-run/state.js';
import type { ClientPluginCustomization, SessionActiveClient } from '../../common/state/protocol/channels-session/state.js';
import { buildDefaultChatUri, customizationId, CustomizationType, MessageKind, ROOT_STATE_URI, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostAutomationService, type IAgentHostAutomationExecution } from '../../node/agentHostAutomationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostStorageService, type IAgentHostStorageWriter } from '../../node/agentHostStorageService.js';

suite('AgentHostAutomationService', () => {

	let disposables: DisposableStore;
	let stateManager: AgentHostStateManager;
	let storageService: AgentHostStorageService;
	let writeFailures: number;
	let writeAttempts: number;

	setup(() => {
		disposables = new DisposableStore();
		stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: true },
		});
		writeFailures = 0;
		writeAttempts = 0;
		const writer: IAgentHostStorageWriter = {
			mkdir: async () => { },
			writeFile: async () => {
				writeAttempts++;
				if (writeFailures > 0) {
					writeFailures--;
					throw new Error('storage unavailable');
				}
			},
		};
		storageService = disposables.add(new AgentHostStorageService(
			URI.file(`/agent-host-automation-service-${generateUuid()}.json`),
			new NullLogService(),
			writer,
		));
	});

	teardown(() => disposables.dispose());
	ensureNoDisposablesAreLeakedInTestSuite();

	function definition(): AutomationDefinition {
		return {
			title: 'Review changes',
			message: { text: 'Review the current changes.', origin: { kind: MessageKind.Automation } },
			session: { provider: 'mock' },
			enabled: true,
			triggers: [],
		};
	}

	function createAction(resource = 'ahp-automation:/review-changes') {
		return {
			type: ActionType.AutomationCreateRequested,
			resource,
			definition: definition(),
		} as const;
	}

	function createService(execution?: Partial<IAgentHostAutomationExecution>, pluginManager?: IAgentPluginManager): AgentHostAutomationService {
		const service = new AgentHostAutomationService({
			isSessionTemplateAvailable: execution?.isSessionTemplateAvailable ?? (() => true),
			createSession: execution?.createSession ?? (async () => { throw new Error('Unexpected session creation'); }),
			startSession: execution?.startSession ?? (async () => { throw new Error('Unexpected session start'); }),
			cancelSession: execution?.cancelSession ?? (async () => false),
		}, stateManager, storageService, new NullLogService(), pluginManager ?? {
			_serviceBrand: undefined,
			basePath: URI.file('/agent-plugins'),
			syncCustomizations: async (_clientId, customizations) => customizations.map(customization => ({
				customization,
				pluginDir: URI.file(`/agent-plugins/${customization.id}`),
			})),
			retainCustomizations: () => { },
		});
		return disposables.add(service);
	}

	async function enableAndCreate(service: AgentHostAutomationService, resource = 'ahp-automation:/review-changes'): Promise<void> {
		await service.completeMigration();
		await service.handleCreate(createAction(resource));
	}

	test('execution remains gated after migration persistence failure and retries safely', async () => {
		const service = createService();
		writeFailures = 1;

		await assert.rejects(service.completeMigration(), /storage unavailable/);
		assert.deepStrictEqual(service.capabilities, { create: {}, schedules: {}, runCancellation: {}, runHistoryLimit: 50 });

		await service.completeMigration();

		assert.deepStrictEqual({
			writeAttempts,
			capabilities: service.capabilities,
			catalog: stateManager.getAutomationCatalogState(),
		}, {
			writeAttempts: 3,
			capabilities: { create: {}, schedules: {}, runCancellation: {}, runHistoryLimit: 50 },
			catalog: { entries: [], _meta: { [AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY]: true } },
		});
	});

	test('a future host automation storage version disables the capability without rewriting data', async () => {
		storageService.set('automations', {
			version: 2,
			catalog: { automations: [] },
		});
		await storageService.whenIdle();
		const service = createService();

		await assert.rejects(service.completeMigration(), /storage is unavailable/);
		assert.deepStrictEqual({
			isAvailable: service.isAvailable,
			capabilities: service.capabilities,
			storedVersion: storageService.get<{ version: number }>('automations')?.version,
		}, {
			isAvailable: false,
			capabilities: undefined,
			storedVersion: 2,
		});
	});

	test('version 1 automation storage maps automations to protocol entries', async () => {
		const resource = 'ahp-automation:/review-changes';
		storageService.set('automations', {
			version: 1,
			catalog: {
				automations: [{
					resource,
					definition: definition(),
					runs: [],
					operations: [AutomationOperation.Update, AutomationOperation.Remove],
					createdAt: '2026-01-01T00:00:00.000Z',
					modifiedAt: '2026-01-01T00:00:00.000Z',
				}],
			},
		});
		await storageService.whenIdle();
		const service = createService();

		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries.map(entry => entry.resource), [resource]);

		await service.completeMigration([resource]);
		const stored = storageService.get<{ version: number; catalog: { entries?: unknown[]; automations?: unknown[] } }>('automations');
		assert.deepStrictEqual({
			version: stored?.version,
			automationCount: stored?.catalog.automations?.length,
			hasEntries: Object.hasOwn(stored?.catalog ?? {}, 'entries'),
		}, {
			version: 1,
			automationCount: 1,
			hasEntries: false,
		});
	});

	test('invalid stored customization scopes do not disable the Automation catalog', async () => {
		storageService.set('automations', {
			version: 1,
			catalog: { automations: [] },
			customizationScopes: [{
				key: 'invalid',
				snapshot: {
					revision: 'invalid',
					capturedAt: '2026-01-01T00:00:00.000Z',
					customizations: [],
				},
			}],
		});
		await storageService.whenIdle();

		const service = createService();

		assert.deepStrictEqual({
			isAvailable: service.isAvailable,
			catalog: stateManager.getAutomationCatalogState(),
		}, {
			isAvailable: true,
			catalog: { entries: [] },
		});
	});

	test('restores legacy per-Automation customizations into the shared virtual client', async () => {
		const plugin = {
			type: CustomizationType.Plugin,
			id: customizationId('file:///plugins/legacy'),
			uri: 'file:///plugins/legacy',
			name: 'Legacy Plugin',
			nonce: 'revision-1',
		} as const;
		storageService.set('automations', {
			version: 1,
			catalog: {
				automations: [{
					resource: 'ahp-automation:/legacy-customizations',
					definition: {
						...definition(),
						_meta: {
							'vscode.automationActiveClient': {
								version: 1,
								activeClient: {
									clientId: 'legacy-client',
									tools: [],
									customizations: [plugin],
								},
							},
						},
					},
					runs: [],
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: '2026-01-01T00:00:00.000Z',
					modifiedAt: '2026-01-01T00:00:00.000Z',
				}],
			},
			migration: { status: 'complete', completedAt: '2026-01-01T00:00:00.000Z' },
		});
		await storageService.whenIdle();
		const retained = new Map<string, readonly ClientPluginCustomization[]>();

		createService(undefined, {
			_serviceBrand: undefined,
			basePath: URI.file('/agent-plugins'),
			syncCustomizations: async () => { throw new Error('Legacy snapshots must not require a client sync'); },
			retainCustomizations: (owner, customizations) => retained.set(owner, customizations),
		});

		assert.deepStrictEqual({
			reference: readAutomationCustomizationSnapshotReference(stateManager.getAutomationCatalogState()?.entries[0].definition._meta),
			retained: retained.get('automation-scope:["mock",[]]'),
		}, {
			reference: {
				captureId: 'legacy',
				sourceRevision: automationCustomizationSnapshotRevision([plugin]),
				snapshotRevision: automationCustomizationSnapshotRevision([plugin]),
			},
			retained: [plugin],
		});
	});

	test('failed catalogue persistence publishes nothing and a retry creates one entry', async () => {
		const service = createService();
		await service.completeMigration();
		writeFailures = 1;

		await assert.rejects(service.handleCreate(createAction()), /storage unavailable/);
		assert.deepStrictEqual(stateManager.getAutomationCatalogState(), {
			entries: [],
			_meta: { [AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY]: true },
		});

		await service.handleCreate(createAction());

		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries.map(automation => ({
			resource: automation.resource,
			operations: automation.operations,
		})), [{
			resource: 'ahp-automation:/review-changes',
			operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
		}]);
	});

	test('partial migration cannot unblock execution', async () => {
		const service = createService();
		await service.handleCreate(createAction());

		await assert.rejects(
			service.completeMigration(['ahp-automation:/review-changes', 'ahp-automation:/missing']),
			/1 expected automation resources are missing/,
		);
		await assert.rejects(service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'blocked-request',
		}), /migration must complete/);

		assert.deepStrictEqual({
			capabilities: service.capabilities,
			operations: stateManager.getAutomationCatalogState()?.entries[0].operations,
		}, {
			capabilities: { create: {}, schedules: {}, runCancellation: {}, runHistoryLimit: 50 },
			operations: [AutomationOperation.Update, AutomationOperation.Remove],
		});

		await service.completeMigration(['ahp-automation:/review-changes']);
		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries[0].operations, [
			AutomationOperation.Update,
			AutomationOperation.Remove,
			AutomationOperation.Run,
		]);
	});

	test('feature disablement removes run permission and blocks execution in the host', async () => {
		const service = createService();
		await enableAndCreate(service);
		stateManager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: false },
		});
		await service.handleConfigurationChanged();

		await assert.rejects(service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'disabled-request',
		}), /Automations are disabled/);
		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries[0].operations, [
			AutomationOperation.Update,
			AutomationOperation.Remove,
		]);

		stateManager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: true },
		});
		await service.handleConfigurationChanged();
		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries[0].operations, [
			AutomationOperation.Update,
			AutomationOperation.Remove,
			AutomationOperation.Run,
		]);
	});

	test('manual run is durable, idempotent, linked before send, and completed from chat state', async () => {
		const session = URI.parse('mock:/automation-session');
		const started = new DeferredPromise<{ readonly turnId: string }>();
		let createCalls = 0;
		let startedMessageKind: MessageKind | undefined;
		const service = createService({
			createSession: async () => {
				createCalls++;
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async (createdSession, message) => {
				const turnId = 'automation-turn';
				startedMessageKind = message.origin.kind;
				stateManager.dispatchServerAction(buildDefaultChatUri(createdSession), {
					type: ActionType.ChatTurnStarted,
					turnId,
					startedAt: new Date().toISOString(),
					message,
				});
				await started.complete({ turnId });
			},
		});
		await enableAndCreate(service);

		const params = {
			channel: 'ahp-automations://' as const,
			automation: 'ahp-automation:/review-changes',
			requestId: 'manual-request',
		};
		const first = await service.runAutomation(params);
		const second = await service.runAutomation(params);
		const concurrent = await service.runAutomation({ ...params, requestId: 'concurrent-request' });
		const { turnId } = await started.p;

		const running = stateManager.getAutomationRunState(first.resource);
		assert.deepStrictEqual({
			first,
			second,
			concurrent,
			createCalls,
			status: running?.lifecycle.status,
			sessions: running?.sessions,
			primarySession: running?.primarySession,
			catalogRuns: stateManager.getAutomationCatalogState()?.entries[0].runs.length,
			startedMessageKind,
		}, {
			first: second,
			second,
			concurrent: second,
			createCalls: 1,
			status: AutomationRunStatus.Running,
			sessions: [session.toString()],
			primarySession: session.toString(),
			catalogRuns: 1,
			startedMessageKind: MessageKind.Automation,
		});

		const completed = new DeferredPromise<void>();
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel === first.resource
				&& envelope.action.type === ActionType.AutomationRunLifecycleChanged
				&& envelope.action.lifecycle.status === AutomationRunStatus.Completed) {
				void completed.complete();
			}
		}));
		stateManager.dispatchServerAction(buildDefaultChatUri(session), {
			type: ActionType.ChatTurnComplete,
			turnId,
			duration: 10,
		});
		await completed.p;

		assert.deepStrictEqual({
			run: stateManager.getAutomationRunState(first.resource)?.lifecycle.status,
			summary: stateManager.getAutomationCatalogState()?.entries[0].runs[0].lifecycle.status,
		}, {
			run: AutomationRunStatus.Completed,
			summary: AutomationRunStatus.Completed,
		});
	});

	test('materializes and reuses the Automation virtual client customizations', async () => {
		const plugin = {
			type: CustomizationType.Plugin,
			id: customizationId('file:///plugins/local'),
			uri: 'file:///plugins/local',
			name: 'Local Plugin',
			nonce: 'revision-1',
		} as const;
		const activeClient = {
			clientId: 'editor-client',
			tools: [],
			customizations: [plugin],
		};
		const synced: string[] = [];
		const retained = new Map<string, readonly ClientPluginCustomization[]>();
		let createdActiveClient: SessionActiveClient | undefined;
		const started = new DeferredPromise<void>();
		const session = URI.parse('mock:/customized-automation');
		const service = createService({
			createSession: async (_template, _run, value) => {
				createdActiveClient = value;
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async () => started.complete(),
		}, {
			_serviceBrand: undefined,
			basePath: URI.file('/agent-plugins'),
			syncCustomizations: async (clientId, customizations) => {
				synced.push(clientId);
				return customizations.map(customization => ({
					customization,
					pluginDir: URI.file(`/agent-plugins/${customization.id}`),
				}));
			},
			retainCustomizations: (owner, customizations) => retained.set(owner, customizations),
		});
		await service.completeMigration();
		await service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/customized',
			definition: {
				...definition(),
				_meta: withAutomationCustomizationSnapshotPublication(undefined, 'capture-1', activeClient.clientId, activeClient.customizations),
			},
		}, activeClient.clientId);
		await service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/customized',
			definition: {
				...definition(),
				_meta: withAutomationCustomizationSnapshotPublication(undefined, 'capture-retry', activeClient.clientId, activeClient.customizations),
			},
		}, activeClient.clientId);
		await service.handleUpdate({
			type: ActionType.AutomationUpdateRequested,
			resource: 'ahp-automation:/customized',
			changes: { title: 'Updated customized Automation' },
		}, activeClient.clientId);

		await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/customized',
			requestId: 'customized-run',
		});
		await started.p;

		assert.deepStrictEqual({
			synced,
			retained: retained.get('automation-scope:["mock",[]]'),
			createdActiveClient,
		}, {
			synced: ['editor-client'],
			retained: [plugin],
			createdActiveClient: {
				clientId: AUTOMATION_VIRTUAL_CLIENT_ID,
				displayName: 'VS Code Automations',
				tools: [],
				customizations: [plugin],
			},
		});
	});

	test('shares one customization snapshot across Automations with the same scope', async () => {
		const plugin = {
			type: CustomizationType.Plugin,
			id: customizationId('file:///plugins/shared'),
			uri: 'file:///plugins/shared',
			name: 'Shared Plugin',
			nonce: 'revision-1',
		} as const;
		let syncCount = 0;
		const retained = new Map<string, readonly ClientPluginCustomization[]>();
		const service = createService(undefined, {
			_serviceBrand: undefined,
			basePath: URI.file('/agent-plugins'),
			syncCustomizations: async (_clientId, customizations) => {
				syncCount++;
				return customizations.map(customization => ({
					customization,
					pluginDir: URI.file(`/agent-plugins/${customization.id}`),
				}));
			},
			retainCustomizations: (owner, customizations) => retained.set(owner, customizations),
		});
		await service.completeMigration();

		for (const [index, resource] of ['ahp-automation:/first', 'ahp-automation:/second'].entries()) {
			await service.handleCreate({
				type: ActionType.AutomationCreateRequested,
				resource,
				definition: {
					...definition(),
					_meta: withAutomationCustomizationSnapshotPublication(undefined, `capture-${index}`, 'editor-client', [plugin]),
				},
			}, 'editor-client');
		}

		const catalog = stateManager.getAutomationCatalogState();
		const revision = automationCustomizationSnapshotRevision([plugin]);
		await service.handleRemove({ type: ActionType.AutomationRemoved, resource: 'ahp-automation:/first' });
		const retainedAfterFirstRemoval = retained.get('automation-scope:["mock",[]]');
		await service.handleRemove({ type: ActionType.AutomationRemoved, resource: 'ahp-automation:/second' });
		assert.deepStrictEqual({
			syncCount,
			references: catalog?.entries.map(automation => readAutomationCustomizationSnapshotReference(automation.definition._meta)?.snapshotRevision),
			retainedAfterFirstRemoval,
			retainedAfterLastRemoval: retained.get('automation-scope:["mock",[]]'),
			storedScopeCountAfterLastRemoval: storageService.get<{ customizationScopes?: readonly unknown[] }>('automations')?.customizationScopes?.length,
		}, {
			syncCount: 1,
			references: [
				revision,
				revision,
			],
			retainedAfterFirstRemoval: [plugin],
			retainedAfterLastRemoval: [],
			storedScopeCountAfterLastRemoval: 0,
		});
	});

	test('replaces the shared virtual client snapshot when a plugin is removed', async () => {
		const first = {
			type: CustomizationType.Plugin,
			id: customizationId('file:///plugins/first'),
			uri: 'file:///plugins/first',
			name: 'First Plugin',
			nonce: 'revision-1',
		} as const;
		const removed = {
			type: CustomizationType.Plugin,
			id: customizationId('file:///plugins/removed'),
			uri: 'file:///plugins/removed',
			name: 'Removed Plugin',
			nonce: 'revision-1',
		} as const;
		let createdActiveClient: SessionActiveClient | undefined;
		const session = URI.parse('mock:/removed-plugin-automation');
		const service = createService({
			createSession: async (_template, _run, activeClient) => {
				createdActiveClient = activeClient;
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async () => { },
		});
		await service.completeMigration();
		await service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/removal',
			definition: {
				...definition(),
				_meta: withAutomationCustomizationSnapshotPublication(undefined, 'capture-1', 'editor-client', [first, removed]),
			},
		}, 'editor-client');
		await service.handleUpdate({
			type: ActionType.AutomationUpdateRequested,
			resource: 'ahp-automation:/removal',
			changes: {
				_meta: withAutomationCustomizationSnapshotPublication(undefined, 'capture-2', 'editor-client', [first]),
			},
		}, 'editor-client');

		await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/removal',
			requestId: 'removal-run',
		});
		await timeout(0);

		assert.deepStrictEqual(createdActiveClient?.customizations?.map(customization => customization.name), ['First Plugin']);
	});

	test('restores the virtual client snapshot after Agent Host restart', async () => {
		const plugin = {
			type: CustomizationType.Plugin,
			id: customizationId('file:///plugins/restored'),
			uri: 'file:///plugins/restored',
			name: 'Restored Plugin',
			nonce: 'revision-1',
		} as const;
		const firstService = createService();
		await firstService.completeMigration();
		await firstService.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/restored',
			definition: {
				...definition(),
				_meta: withAutomationCustomizationSnapshotPublication(undefined, 'capture-1', 'editor-client', [plugin]),
			},
		}, 'editor-client');
		firstService.dispose();

		let createdActiveClient: SessionActiveClient | undefined;
		const retained = new Map<string, readonly ClientPluginCustomization[]>();
		const session = URI.parse('mock:/restored-automation');
		const restoredService = createService({
			createSession: async (_template, _run, activeClient) => {
				createdActiveClient = activeClient;
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async () => { },
		}, {
			_serviceBrand: undefined,
			basePath: URI.file('/agent-plugins'),
			syncCustomizations: async () => { throw new Error('Restored snapshots must not require a client sync'); },
			retainCustomizations: (owner, customizations) => retained.set(owner, customizations),
		});

		await restoredService.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/restored',
			requestId: 'restored-run',
		});
		await timeout(0);

		assert.deepStrictEqual({
			activeClient: createdActiveClient,
			retained: retained.get('automation-scope:["mock",[]]'),
		}, {
			activeClient: {
				clientId: AUTOMATION_VIRTUAL_CLIENT_ID,
				displayName: 'VS Code Automations',
				tools: [],
				customizations: [plugin],
			},
			retained: [plugin],
		});
	});

	test('retains the snapshot used by a running Automation when its scope advances', async () => {
		const first = {
			type: CustomizationType.Plugin,
			id: customizationId('file:///plugins/versioned'),
			uri: 'file:///plugins/versioned',
			name: 'Versioned Plugin',
			nonce: 'revision-1',
		} as const;
		const second = { ...first, nonce: 'revision-2' } as const;
		const retained = new Map<string, readonly ClientPluginCustomization[]>();
		const started = new DeferredPromise<string>();
		const session = URI.parse('mock:/versioned-automation');
		const service = createService({
			createSession: async () => {
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async (createdSession, message) => {
				const turnId = 'versioned-turn';
				stateManager.dispatchServerAction(buildDefaultChatUri(createdSession), {
					type: ActionType.ChatTurnStarted,
					turnId,
					startedAt: new Date().toISOString(),
					message,
				});
				started.complete(turnId);
			},
		}, {
			_serviceBrand: undefined,
			basePath: URI.file('/agent-plugins'),
			syncCustomizations: async (_clientId, customizations) => customizations.map(customization => ({
				customization,
				pluginDir: URI.file(`/agent-plugins/${customization.id}/${customization.nonce}`),
			})),
			retainCustomizations: (owner, customizations) => retained.set(owner, customizations),
		});
		await service.completeMigration();
		await service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/versioned',
			definition: {
				...definition(),
				_meta: withAutomationCustomizationSnapshotPublication(undefined, 'capture-1', 'editor-client', [first]),
			},
		}, 'editor-client');
		const run = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/versioned',
			requestId: 'versioned-run',
		});
		const turnId = await started.p;

		await service.handleUpdate({
			type: ActionType.AutomationUpdateRequested,
			resource: 'ahp-automation:/versioned',
			changes: {
				_meta: withAutomationCustomizationSnapshotPublication(undefined, 'capture-2', 'editor-client', [second]),
			},
		}, 'editor-client');
		const retainedWhileRunning = {
			scope: retained.get('automation-scope:["mock",[]]'),
			run: retained.get(`automation-run:${run.resource}`),
		};
		stateManager.dispatchServerAction(buildDefaultChatUri(session), {
			type: ActionType.ChatTurnComplete,
			turnId,
			duration: 10,
		});
		await timeout(0);

		assert.deepStrictEqual({
			retainedWhileRunning,
			retainedAfterCompletion: retained.get(`automation-run:${run.resource}`),
		}, {
			retainedWhileRunning: {
				scope: [second],
				run: [first],
			},
			retainedAfterCompletion: [],
		});
	});

	test('rejects Automation customizations published by a different client', async () => {
		const service = createService();
		await service.completeMigration();

		await assert.rejects(service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/unauthorized',
			definition: {
				...definition(),
				_meta: withAutomationCustomizationSnapshotPublication(undefined, 'capture-1', 'other-client', []),
			},
		}, 'editor-client'), /must be published by their active client/);
	});

	test('persists an Automation when one customization cannot be materialized', async () => {
		const plugin = {
			type: CustomizationType.Plugin,
			id: customizationId('file:///plugins/missing'),
			uri: 'file:///plugins/missing',
			name: 'Missing Plugin',
			nonce: 'revision-1',
		} as const;
		const service = createService(undefined, {
			_serviceBrand: undefined,
			basePath: URI.file('/agent-plugins'),
			syncCustomizations: async () => [{ customization: plugin }],
			retainCustomizations: () => { },
		});
		await service.completeMigration();

		await service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/degraded',
			definition: {
				...definition(),
				_meta: withAutomationCustomizationSnapshotPublication(undefined, 'capture-1', 'editor-client', [plugin]),
			},
		}, 'editor-client');

		assert.strictEqual(stateManager.getAutomationCatalogState()?.entries[0].resource, 'ahp-automation:/degraded');
	});

	test('releases temporary customization retention when persistence fails', async () => {
		const plugin = {
			type: CustomizationType.Plugin,
			id: customizationId('file:///plugins/temporary'),
			uri: 'file:///plugins/temporary',
			name: 'Temporary Plugin',
			nonce: 'revision-1',
		} as const;
		const retained = new Map<string, readonly ClientPluginCustomization[]>();
		const service = createService(undefined, {
			_serviceBrand: undefined,
			basePath: URI.file('/agent-plugins'),
			syncCustomizations: async (_clientId, customizations) => customizations.map(customization => ({
				customization,
				pluginDir: URI.file(`/agent-plugins/${customization.id}`),
			})),
			retainCustomizations: (owner, customizations) => retained.set(owner, customizations),
		});
		await service.completeMigration();
		writeFailures = 1;

		await assert.rejects(service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/temporary',
			definition: {
				...definition(),
				_meta: withAutomationCustomizationSnapshotPublication(undefined, 'temporary-capture', 'editor-client', [plugin]),
			},
		}, 'editor-client'), /storage unavailable/);

		assert.deepStrictEqual({
			temporary: retained.get('automation-capture:temporary-capture'),
			scope: retained.get('automation-scope:["mock",[]]'),
		}, {
			temporary: [],
			scope: undefined,
		});
	});

	test('run persistence failure prevents session side effects', async () => {
		let createCalls = 0;
		const service = createService({
			createSession: async () => {
				createCalls++;
				return URI.parse('mock:/unexpected');
			},
		});
		await enableAndCreate(service);
		writeFailures = 1;

		await assert.rejects(service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'failed-request',
		}), /storage unavailable/);

		assert.deepStrictEqual({
			createCalls,
			runs: stateManager.getAutomationCatalogState()?.entries[0].runs,
		}, {
			createCalls: 0,
			runs: [],
		});
	});

	test('pending execution waits for provider registration', async () => {
		let available = false;
		let createCalls = 0;
		const started = new DeferredPromise<void>();
		const session = URI.parse('mock:/deferred-session');
		const service = createService({
			isSessionTemplateAvailable: () => available,
			createSession: async () => {
				createCalls++;
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async () => {
				await started.complete();
			},
		});
		await enableAndCreate(service);

		const result = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'deferred-request',
		});
		await Promise.resolve();
		assert.deepStrictEqual({
			createCalls,
			status: stateManager.getAutomationRunState(result.resource)?.lifecycle.status,
		}, {
			createCalls: 0,
			status: AutomationRunStatus.Pending,
		});

		available = true;
		service.handleAgentsChanged();
		await started.p;
		assert.deepStrictEqual({
			createCalls,
			status: stateManager.getAutomationRunState(result.resource)?.lifecycle.status,
		}, {
			createCalls: 1,
			status: AutomationRunStatus.Running,
		});
	});

	test('host timeout terminates a hung run so later occurrences cannot overlap', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
		stateManager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY]: 1 },
		});
		const session = URI.parse('mock:/hung-session');
		const started = new DeferredPromise<void>();

		const service = createService({
			createSession: async () => {
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async () => {
				await started.complete();
			},
			cancelSession: async () => false,
		});
		await enableAndCreate(service);
		const failed = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, envelope =>
			envelope.action.type === ActionType.AutomationRunLifecycleChanged
			&& envelope.action.lifecycle.status === AutomationRunStatus.Failed
		));

		const result = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'hung-request',
		});
		await started.p;
		await failed;

		const run = stateManager.getAutomationRunState(result.resource);
		assert.deepStrictEqual({
			status: run?.lifecycle.status,
			error: run?.lifecycle.status === AutomationRunStatus.Failed ? run.lifecycle.error.message : undefined,
			removeAvailable: stateManager.getAutomationCatalogState()?.entries[0].operations.includes(AutomationOperation.Remove),
		}, {
			status: AutomationRunStatus.Failed,
			error: 'Automation run timed out.',
			removeAvailable: true,
		});
	}));

	test('cancellation wins a session-creation race without sending the prompt', async () => {
		const session = URI.parse('mock:/cancelled-session');
		const createStarted = new DeferredPromise<void>();
		const releaseCreate = new DeferredPromise<void>();
		const cancelled = new DeferredPromise<void>();
		let startCalls = 0;
		const service = createService({
			createSession: async () => {
				await createStarted.complete();
				await releaseCreate.p;
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async () => {
				startCalls++;
			},
			cancelSession: async () => {
				await cancelled.complete();
				return true;
			},
		});
		await enableAndCreate(service);
		const result = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'cancel-request',
		});
		await createStarted.p;

		await service.handleCancel(result.resource, { type: ActionType.AutomationRunCancelRequested });
		await releaseCreate.complete();
		await cancelled.p;

		const run = stateManager.getAutomationRunState(result.resource);
		assert.deepStrictEqual({
			startCalls,
			status: run?.lifecycle.status,
			hasStartedAt: run?.lifecycle.status === AutomationRunStatus.Cancelled && run.lifecycle.startedAt !== undefined,
			hasCompletedAt: run?.lifecycle.status === AutomationRunStatus.Cancelled && run.lifecycle.completedAt.length > 0,
			sessions: run?.sessions,
			primarySession: run?.primarySession,
		}, {
			startCalls: 0,
			status: AutomationRunStatus.Cancelled,
			hasStartedAt: true,
			hasCompletedAt: true,
			sessions: [session.toString()],
			primarySession: session.toString(),
		});
	});

	test('failed linked-session cancellation leaves the run non-terminal', async () => {
		const session = URI.parse('mock:/uncancelled-session');
		const started = new DeferredPromise<void>();

		const service = createService({
			createSession: async () => {
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async () => {
				await started.complete();
			},
			cancelSession: async () => {
				throw new Error('cancel failed');
			},
		});
		await enableAndCreate(service);
		const result = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'cancel-failure',
		});
		await started.p;

		await assert.rejects(service.handleCancel(result.resource, { type: ActionType.AutomationRunCancelRequested }), /cancel failed/);

		assert.strictEqual(stateManager.getAutomationRunState(result.resource)?.lifecycle.status, AutomationRunStatus.Running);
	});

	test('claims a persisted missed schedule before starting its session', async () => {
		const now = new Date();
		const scheduledFor = new Date(now.getTime() - 2 * 60_000).toISOString();
		const automationResource = 'ahp-automation:/scheduled-review';
		const scheduledDefinition: AutomationDefinition = {
			...definition(),
			triggers: [{
				id: 'weekday-review',
				kind: AutomationTriggerKind.Schedule,
				schedule: { expression: '* * * * *', timeZone: 'UTC' },
				misfirePolicy: AutomationMisfirePolicy.RunOnce,
			}],
		};
		storageService.set('automations', {
			catalog: {
				automations: [{
					resource: automationResource,
					definition: scheduledDefinition,
					nextRunAt: scheduledFor,
					runs: [],
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: now.toISOString(),
					modifiedAt: now.toISOString(),
					_meta: { 'vscode.scheduleCursors': { 'weekday-review': scheduledFor } },
				}],
			},
			runs: [],
			manualRunRequests: [],
			migration: { status: 'complete', completedAt: now.toISOString() },
		});
		await storageService.whenIdle();

		const session = URI.parse('mock:/scheduled-session');
		const started = new DeferredPromise<void>();

		const service = createService({
			createSession: async () => {
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async (createdSession, message) => {
				stateManager.dispatchServerAction(buildDefaultChatUri(createdSession), {
					type: ActionType.ChatTurnStarted,
					turnId: 'scheduled-turn',
					startedAt: new Date().toISOString(),
					message,
				});
				await started.complete();
			},
		});
		await started.p;

		const automation = stateManager.getAutomationCatalogState()?.entries[0];
		const run = automation?.runs[0];
		assert.deepStrictEqual({
			origin: run?.origin,
			status: run?.lifecycle.status,
			primarySession: run?.primarySession,
			nextRunIsFuture: Date.parse(automation?.nextRunAt ?? '') > now.getTime(),
			serviceAvailable: service.isAvailable,
		}, {
			origin: {
				kind: AutomationRunOriginKind.Trigger,
				triggerId: 'weekday-review',
				scheduledFor,
				catchUp: true,
			},
			status: AutomationRunStatus.Running,
			primarySession: session.toString(),
			nextRunIsFuture: true,
			serviceAvailable: true,
		});
	});

	test('coalesces simultaneously-due schedule triggers on one Automation into a single run', async () => {
		const now = new Date();
		const firstScheduledFor = new Date(now.getTime() - 3 * 60_000).toISOString();
		const secondScheduledFor = new Date(now.getTime() - 2 * 60_000).toISOString();
		const automationResource = 'ahp-automation:/multi-trigger';
		const multiTriggerDefinition: AutomationDefinition = {
			...definition(),
			triggers: [
				{
					id: 'first-trigger',
					kind: AutomationTriggerKind.Schedule,
					schedule: { expression: '* * * * *', timeZone: 'UTC' },
					misfirePolicy: AutomationMisfirePolicy.RunOnce,
				},
				{
					id: 'second-trigger',
					kind: AutomationTriggerKind.Schedule,
					schedule: { expression: '*/2 * * * *', timeZone: 'UTC' },
					misfirePolicy: AutomationMisfirePolicy.RunOnce,
				},
			],
		};
		storageService.set('automations', {
			catalog: {
				automations: [{
					resource: automationResource,
					definition: multiTriggerDefinition,
					nextRunAt: firstScheduledFor,
					runs: [],
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: now.toISOString(),
					modifiedAt: now.toISOString(),
					_meta: {
						'vscode.scheduleCursors': {
							'first-trigger': firstScheduledFor,
							'second-trigger': secondScheduledFor,
						},
					},
				}],
			},
			runs: [],
			manualRunRequests: [],
			migration: { status: 'complete', completedAt: now.toISOString() },
		});
		await storageService.whenIdle();

		const session = URI.parse('mock:/multi-trigger-session');
		const started = new DeferredPromise<void>();
		createService({
			createSession: async () => {
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async () => {
				await started.complete();
			},
		});
		await started.p;

		const automation = stateManager.getAutomationCatalogState()?.entries[0];
		const cursors = automation?._meta?.['vscode.scheduleCursors'] as Record<string, string> | undefined;
		assert.deepStrictEqual({
			runsClaimed: automation?.runs.length,
			claimedTriggerId: automation?.runs[0]?.origin.kind === AutomationRunOriginKind.Trigger ? automation.runs[0].origin.triggerId : undefined,
			firstCursorAdvanced: cursors ? Date.parse(cursors['first-trigger']) > now.getTime() : false,
			secondCursorAdvanced: cursors ? Date.parse(cursors['second-trigger']) > now.getTime() : false,
		}, {
			runsClaimed: 1,
			claimedTriggerId: 'first-trigger',
			firstCursorAdvanced: true,
			secondCursorAdvanced: true,
		});
	});

	test('Skip-catch-up on the first trigger does not consume the per-tick claim slot', async () => {
		const now = new Date();
		const stale = new Date(now.getTime() - 10 * 60_000).toISOString();
		const dueRecently = new Date(now.getTime() - 30_000).toISOString();
		const automationResource = 'ahp-automation:/skip-first';
		const multiTriggerDefinition: AutomationDefinition = {
			...definition(),
			triggers: [
				{
					id: 'stale-skip-trigger',
					kind: AutomationTriggerKind.Schedule,
					schedule: { expression: '* * * * *', timeZone: 'UTC' },
					misfirePolicy: AutomationMisfirePolicy.Skip,
				},
				{
					id: 'due-run-trigger',
					kind: AutomationTriggerKind.Schedule,
					schedule: { expression: '*/2 * * * *', timeZone: 'UTC' },
					misfirePolicy: AutomationMisfirePolicy.RunOnce,
				},
			],
		};
		storageService.set('automations', {
			catalog: {
				automations: [{
					resource: automationResource,
					definition: multiTriggerDefinition,
					nextRunAt: stale,
					runs: [],
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: now.toISOString(),
					modifiedAt: now.toISOString(),
					_meta: {
						'vscode.scheduleCursors': {
							'stale-skip-trigger': stale,
							'due-run-trigger': dueRecently,
						},
					},
				}],
			},
			runs: [],
			manualRunRequests: [],
			migration: { status: 'complete', completedAt: now.toISOString() },
		});
		await storageService.whenIdle();

		const session = URI.parse('mock:/skip-first-session');
		const started = new DeferredPromise<void>();

		createService({
			createSession: async () => {
				stateManager.createSession({
					resource: session.toString(),
					provider: 'mock',
					title: '',
					status: SessionStatus.Idle,
					createdAt: new Date().toISOString(),
					modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async () => {
				await started.complete();
			},
		});
		await started.p;

		const automation = stateManager.getAutomationCatalogState()?.entries[0];
		assert.deepStrictEqual({
			runsClaimed: automation?.runs.length,
			claimedTriggerId: automation?.runs[0]?.origin.kind === AutomationRunOriginKind.Trigger ? automation.runs[0].origin.triggerId : undefined,
		}, {
			runsClaimed: 1,
			claimedTriggerId: 'due-run-trigger',
		});
	});

	test('bounds catalogue run history and loads older pages by cursor', async () => {
		const automationResource = 'ahp-automation:/history';
		const runs: AutomationRunState[] = Array.from({ length: 51 }, (_, index) => {
			const timestamp = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
			return {
				resource: `ahp-automation-run:/run-${index}`,
				automation: automationResource,
				origin: { kind: AutomationRunOriginKind.Manual },
				lifecycle: {
					status: AutomationRunStatus.Completed,
					createdAt: timestamp,
					startedAt: timestamp,
					completedAt: timestamp,
				},
				sessions: [],
			};
		});
		storageService.set('automations', {
			catalog: {
				automations: [{
					resource: automationResource,
					definition: definition(),
					runs: runs.map(run => ({
						resource: run.resource,
						automation: run.automation,
						origin: run.origin,
						lifecycle: run.lifecycle,
						sessionCount: 0,
					})),
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: '2026-01-01T00:00:00.000Z',
					modifiedAt: '2026-01-01T00:00:00.000Z',
				}],
			},
			runs,
			manualRunRequests: [],
			migration: { status: 'complete', completedAt: '2026-01-01T00:00:00.000Z' },
		});
		await storageService.whenIdle();
		const service = createService();

		assert.deepStrictEqual({
			count: stateManager.getAutomationCatalogState()?.entries[0].runs.length,
			cursor: stateManager.getAutomationCatalogState()?.entries[0].runsNextCursor,
		}, {
			count: 50,
			cursor: '50',
		});

		await service.fetchAutomationRuns({
			channel: 'ahp-automations://',
			automation: automationResource,
			cursor: '50',
		});

		assert.deepStrictEqual({
			count: stateManager.getAutomationCatalogState()?.entries[0].runs.length,
			cursor: stateManager.getAutomationCatalogState()?.entries[0].runsNextCursor,
		}, {
			count: 51,
			cursor: undefined,
		});
	});

	test('a create staged as an import-pending row is never granted Run authority', async () => {
		const service = createService();
		await service.completeMigration();
		await service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/pending-import',
			definition: {
				...definition(),
				_meta: { [AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY]: true },
			},
		});

		await assert.rejects(service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/pending-import',
			requestId: 'pending-request',
		}), /not available/i);
		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries[0].operations, [
			AutomationOperation.Update,
		]);
	});

	test('clearing the import-pending flag restores Run and Remove authority', async () => {
		const service = createService();
		await service.completeMigration();
		await service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/pending-import',
			definition: {
				...definition(),
				_meta: { [AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY]: true },
			},
		});
		await service.handleUpdate({
			type: ActionType.AutomationUpdateRequested,
			resource: 'ahp-automation:/pending-import',
			changes: { _meta: {} },
		});

		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries[0].operations, [
			AutomationOperation.Update,
			AutomationOperation.Remove,
			AutomationOperation.Run,
		]);
	});

	test('staging an existing Automation as import-pending removes Run and Remove authority', async () => {
		const service = createService();
		await service.completeMigration();
		await service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/existing',
			definition: definition(),
		});
		await service.handleUpdate({
			type: ActionType.AutomationUpdateRequested,
			resource: 'ahp-automation:/existing',
			changes: { _meta: { [AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY]: true } },
		});

		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries[0].operations, [
			AutomationOperation.Update,
		]);
	});

	test('completeMigration withholds Run and Remove from pending imports', async () => {
		const service = createService();
		await service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/pending-import',
			definition: {
				...definition(),
				_meta: { [AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY]: true },
			},
		});
		await service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/clean-import',
			definition: definition(),
		});

		await service.completeMigration();

		const automations = stateManager.getAutomationCatalogState()?.entries ?? [];
		const byResource = new Map(automations.map(automation => [automation.resource, automation.operations]));
		assert.deepStrictEqual({
			pending: byResource.get('ahp-automation:/pending-import'),
			clean: byResource.get('ahp-automation:/clean-import'),
		}, {
			pending: [AutomationOperation.Update],
			clean: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
		});
	});

	test('re-enabling automations still withholds Run from a pending import', async () => {
		const service = createService();
		await service.completeMigration();
		await service.handleCreate({
			type: ActionType.AutomationCreateRequested,
			resource: 'ahp-automation:/pending-import',
			definition: {
				...definition(),
				_meta: { [AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY]: true },
			},
		});
		stateManager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: false },
		});
		await service.handleConfigurationChanged();
		stateManager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: true },
		});
		await service.handleConfigurationChanged();

		assert.deepStrictEqual(stateManager.getAutomationCatalogState()?.entries[0].operations, [
			AutomationOperation.Update,
		]);
	});

	test('the scheduler skips a persisted pending row on restart', async () => {
		const now = new Date();
		const scheduledFor = new Date(now.getTime() - 2 * 60_000).toISOString();
		const scheduledDefinition: AutomationDefinition = {
			...definition(),
			triggers: [{
				id: 'weekday-review',
				kind: AutomationTriggerKind.Schedule,
				schedule: { expression: '* * * * *', timeZone: 'UTC' },
				misfirePolicy: AutomationMisfirePolicy.RunOnce,
			}],
			_meta: { [AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY]: true },
		};
		storageService.set('automations', {
			catalog: {
				automations: [{
					resource: 'ahp-automation:/pending-scheduled',
					definition: scheduledDefinition,
					nextRunAt: scheduledFor,
					runs: [],
					// Post-fix persisted state: no Run because the row is
					// still import-pending. The scheduler must respect this.
					operations: [AutomationOperation.Update],
					createdAt: now.toISOString(),
					modifiedAt: now.toISOString(),
					_meta: {
						'vscode.scheduleCursors': { 'weekday-review': scheduledFor },
						[AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY]: true,
					},
				}],
			},
			runs: [],
			manualRunRequests: [],
			migration: { status: 'complete', completedAt: now.toISOString() },
		});
		await storageService.whenIdle();

		let createCalls = 0;
		const service = createService({
			createSession: async () => {
				createCalls++;
				return URI.parse('mock:/should-not-start');
			},
		});
		await service.completeMigration();

		const automation = stateManager.getAutomationCatalogState()?.entries[0];
		assert.deepStrictEqual({
			createCalls,
			operations: automation?.operations,
			runCount: automation?.runs.length,
		}, {
			createCalls: 0,
			operations: [AutomationOperation.Update],
			runCount: 0,
		});
	});

	test('run recovery on restart skips a pending row even if a run was persisted', async () => {
		const now = new Date();
		const scheduledDefinition: AutomationDefinition = {
			...definition(),
			_meta: { [AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY]: true },
		};
		const pendingRun: AutomationRunState = {
			resource: 'ahp-automation-run:/pending-run',
			automation: 'ahp-automation:/pending-import',
			origin: { kind: AutomationRunOriginKind.Manual },
			lifecycle: { status: AutomationRunStatus.Pending, createdAt: now.toISOString() },
			sessions: [],
		};
		storageService.set('automations', {
			catalog: {
				automations: [{
					resource: 'ahp-automation:/pending-import',
					definition: scheduledDefinition,
					runs: [pendingRun],
					// Post-fix persisted state should not include Run because
					// the item is still pending. The recovery gate must respect
					// that even though a Pending run is on disk.
					operations: [AutomationOperation.Update],
					createdAt: now.toISOString(),
					modifiedAt: now.toISOString(),
					_meta: { [AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY]: true },
				}],
			},
			runs: [pendingRun],
			manualRunRequests: [],
			migration: { status: 'complete', completedAt: now.toISOString() },
		});
		await storageService.whenIdle();

		let createCalls = 0;
		const service = createService({
			createSession: async () => {
				createCalls++;
				return URI.parse('mock:/should-not-start');
			},
		});
		await service.completeMigration();

		assert.strictEqual(createCalls, 0);
	});
});
