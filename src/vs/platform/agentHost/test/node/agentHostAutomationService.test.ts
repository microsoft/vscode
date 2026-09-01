/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY, AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY, AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY, AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY } from '../../common/automationMigration.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AutomationMisfirePolicy, AutomationOperation, AutomationTriggerKind, type AutomationDefinition } from '../../common/state/protocol/channels-automation/state.js';
import { AutomationRunOriginKind, AutomationRunStatus, type AutomationRunState } from '../../common/state/protocol/channels-automation-run/state.js';
import { buildDefaultChatUri, MessageKind, ROOT_STATE_URI, SessionStatus } from '../../common/state/sessionState.js';
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

	function createService(execution?: Partial<IAgentHostAutomationExecution>): AgentHostAutomationService {
		const service = new AgentHostAutomationService({
			isSessionTemplateAvailable: execution?.isSessionTemplateAvailable ?? (() => true),
			createSession: execution?.createSession ?? (async () => { throw new Error('Unexpected session creation'); }),
			startSession: execution?.startSession ?? (async () => { throw new Error('Unexpected session start'); }),
			cancelSession: execution?.cancelSession ?? (async () => false),
		}, stateManager, storageService, new NullLogService());
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
