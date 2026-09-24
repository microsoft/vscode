/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../base/common/observable.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { hashAutomationTelemetryId } from '../../node/agentHostAutomationTelemetry.js';
import { NullTelemetryServiceShape, TelemetryTrustedValue } from '../../../telemetry/common/telemetryUtils.js';
import { AgentSession, type IAgent, type IAgentModelInfo } from '../../common/agent.js';
import { createAgentModelByokMeta } from '../../common/agentModelByokMeta.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY, AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY } from '../../common/automationConfig.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AutomationDisableConditionKind, AutomationMisfirePolicy, AutomationOperation, AutomationTriggerKind, type AutomationDefinition } from '../../common/state/protocol/channels-automation/state.js';
import { AutomationRunOriginKind, AutomationRunStatus, type AutomationRunState } from '../../common/state/protocol/channels-automation-run/state.js';
import type { RunAutomationParams } from '../../common/state/protocol/channels-automation/commands.js';
import { AUTOMATION_CATALOG_URI, buildDefaultChatUri, MessageKind, ResponsePartKind, ROOT_STATE_URI, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostAutomationService, type IAgentHostAutomationExecution } from '../../node/agentHostAutomationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostStorageService, type IAgentHostStorageWriter } from '../../node/agentHostStorageService.js';
import { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { AgentHostTelemetryReporter } from '../../node/agentHostTelemetryReporter.js';

class RecordingAutomationTelemetry extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

	override publicLog2(name?: string, data?: Record<string, unknown>): void {
		this.events.push({ name: name ?? '', data: data ?? {} });
	}
}

suite('AgentHostAutomationService', () => {

	let disposables: DisposableStore;
	let stateManager: AgentHostStateManager;
	let storageService: AgentHostStorageService;
	let writeFailures: number;
	let writeAttempts: number;
	let telemetry: RecordingAutomationTelemetry;

	setup(() => {
		disposables = new DisposableStore();
		stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.dispatchServerAction(ROOT_STATE_URI, {
			type: ActionType.RootConfigChanged,
			config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: true },
		});
		writeFailures = 0;
		writeAttempts = 0;
		telemetry = new RecordingAutomationTelemetry();
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

	function scheduledDefinition(maxRuns?: number): AutomationDefinition {
		return {
			...definition(),
			triggers: [{ id: 'schedule', kind: AutomationTriggerKind.Schedule, schedule: { expression: '* * * * *', timeZone: 'UTC' } }],
			...(maxRuns === undefined ? {} : { disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns }] }),
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
		const models: IAgentModelInfo[] = [
			{ provider: 'copilotcli', id: 'catalog-model', name: 'Catalog model', supportsVision: false },
			{ provider: 'copilotcli', id: 'private-byok-model', name: 'Private model', supportsVision: false, _meta: createAgentModelByokMeta('private/vendor/model') },
		];
		const agent = upcastPartial<IAgent>({ id: 'copilotcli', models: constObservable(models) });
		const providers = new class extends mock<IAgentHostProviderService>() {
			override resolveProvider(provider?: string): IAgent | undefined {
				return provider === undefined || provider === agent.id ? agent : undefined;
			}
		}();
		const service = new AgentHostAutomationService({
			isSessionTemplateAvailable: execution?.isSessionTemplateAvailable ?? (() => true),
			createSession: execution?.createSession ?? (async () => { throw new Error('Unexpected session creation'); }),
			startSession: execution?.startSession ?? (async () => { throw new Error('Unexpected session start'); }),
			cancelSession: execution?.cancelSession ?? (async () => false),
		}, stateManager, storageService, new NullLogService(), telemetry, providers);
		return disposables.add(service);
	}

	async function enableAndCreate(service: AgentHostAutomationService, resource = 'ahp-automation:/review-changes'): Promise<void> {
		await service.handleCreate(createAction(resource));
	}

	function terminalRun(resource: string): Promise<void> {
		const isTerminal = (status: AutomationRunStatus | undefined) => status === AutomationRunStatus.Completed || status === AutomationRunStatus.Cancelled || status === AutomationRunStatus.Failed;
		if (isTerminal(stateManager.getAutomationRunState(resource)?.lifecycle.status)) {
			return Promise.resolve();
		}
		return Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, envelope =>
			envelope.channel === resource && envelope.action.type === ActionType.AutomationRunLifecycleChanged && isTerminal(envelope.action.lifecycle.status)
		)).then(() => undefined);
	}

	test('logs creation once after persistence, excluding retries and failed writes', async () => {
		const service = createService();
		const action = {
			...createAction(),
			definition: {
				...definition(),
				title: 'Private title',
				session: {
					provider: 'copilotcli',
					model: { id: 'catalog-model' },
					agent: { uri: 'file:///private/custom-agent.md' },
					workingDirectories: ['file:///private/repository'],
					config: { mode: 'plan', autoApprove: 'assisted', isolation: 'worktree', branch: 'private-branch', privateSetting: 'private value' },
				},
			},
		};
		writeFailures = 1;
		await assert.rejects(service.handleCreate(action), /storage unavailable/);
		assert.deepStrictEqual(telemetry.events, []);
		await service.handleCreate(action);
		await service.handleCreate(action);

		assert.deepStrictEqual(telemetry.events, [{
			name: 'automation.created',
			data: {
				automationId: hashAutomationTelemetryId('ahp-automation:/review-changes'),
				provider: 'copilotcli',
				model: new TelemetryTrustedValue('catalog-model'),
				modelSelectionKind: 'explicit',
				mode: 'plan',
				permissionLevel: 'assisted',
				isolationMode: 'worktree',
				targetKind: 'workspace',
				folderCount: 1,
				hasCustomAgent: true,
				enabled: true,
				scheduleKind: 'manual',
			},
		}]);
	});

	test('records editable updates and deletion once without counting internal metadata or replays', async () => {
		const service = createService();
		const resource = 'ahp-automation:/review-changes';
		await enableAndCreate(service, resource);
		await service.handleUpdate({
			type: ActionType.AutomationUpdateRequested, resource,
			changes: { _meta: { 'test.internal': true } },
		});
		const disable = { type: ActionType.AutomationUpdateRequested, resource, changes: { enabled: false } } as const;
		await service.handleUpdate(disable);
		await service.handleUpdate(disable);
		const reconfigure = {
			type: ActionType.AutomationUpdateRequested,
			resource,
			changes: { session: { provider: 'copilotcli', model: { id: 'catalog-model' }, config: { mode: 'plan', autoApprove: 'assisted' } } },
		} as const;
		writeFailures = 1;
		await assert.rejects(service.handleUpdate(reconfigure), /storage unavailable/);
		await service.handleUpdate(reconfigure);
		const rename = { type: ActionType.AutomationUpdateRequested, resource, changes: { title: 'Private title' } } as const;
		await service.handleUpdate(rename);
		await service.handleUpdate(rename);
		writeFailures = 1;
		await assert.rejects(service.handleRemove({ type: ActionType.AutomationRemoved, resource }), /storage unavailable/);
		await service.handleRemove({ type: ActionType.AutomationRemoved, resource });
		await service.handleRemove({ type: ActionType.AutomationRemoved, resource });

		assert.deepStrictEqual(telemetry.events.map(event => ({
			name: event.name,
			id: event.data.automationId,
			enabled: event.data.enabled,
			enabledChanged: event.data.enabledChanged,
			sessionConfigurationChanged: event.data.sessionConfigurationChanged,
			scheduleChanged: event.data.scheduleChanged,
			promptChanged: event.data.promptChanged,
			titleChanged: event.data.titleChanged,
		})), [
			{ name: 'automation.created', id: hashAutomationTelemetryId(resource), enabled: true, enabledChanged: undefined, sessionConfigurationChanged: undefined, scheduleChanged: undefined, promptChanged: undefined, titleChanged: undefined },
			{ name: 'automation.updated', id: hashAutomationTelemetryId(resource), enabled: false, enabledChanged: true, sessionConfigurationChanged: false, scheduleChanged: false, promptChanged: false, titleChanged: false },
			{ name: 'automation.updated', id: hashAutomationTelemetryId(resource), enabled: false, enabledChanged: false, sessionConfigurationChanged: true, scheduleChanged: false, promptChanged: false, titleChanged: false },
			{ name: 'automation.updated', id: hashAutomationTelemetryId(resource), enabled: false, enabledChanged: false, sessionConfigurationChanged: false, scheduleChanged: false, promptChanged: false, titleChanged: true },
			{ name: 'automation.deleted', id: hashAutomationTelemetryId(resource), enabled: false, enabledChanged: undefined, sessionConfigurationChanged: undefined, scheduleChanged: undefined, promptChanged: undefined, titleChanged: undefined },
		]);
	});

	test('preserves distinct complete automation resources across definition and run telemetry', async () => {
		const service = createService();
		const resources = [
			'ahp-automation:/shared',
			'ahp-automation://first/shared',
			'ahp-automation://second/shared',
			'ahp-automation:/shared?first',
			'ahp-automation:/shared?second',
			'ahp-automation:/shared#first',
			'ahp-automation:/shared#second',
		];
		for (const resource of resources) {
			await service.handleCreate(createAction(resource));
			const run = await service.runAutomation({ channel: 'ahp-automations://', automation: resource, requestId: resource });
			await terminalRun(run.resource);
			await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource, changes: { enabled: false } });
			await service.handleRemove({ type: ActionType.AutomationRemoved, resource });
		}

		assert.deepStrictEqual(telemetry.events.map(event => ({ name: event.name, automationId: event.data.automationId })), resources.flatMap(resource =>
			['automation.created', 'automation.runCreated', 'automation.runCompleted', 'automation.updated', 'automation.deleted'].map(name => ({
				name,
				automationId: hashAutomationTelemetryId(resource),
			}))
		));
	});

	test('redacts unknown models and provider configuration while retaining safe model selections', async () => {
		const service = createService();
		for (const model of [undefined, 'auto', 'private-byok-model', '/private/custom-model']) {
			await service.handleCreate({
				...createAction(`ahp-automation:/${generateUuid()}`),
				definition: {
					...definition(),
					session: {
						model: model ? { id: model } : undefined,
						config: { mode: '/private/custom-mode', autoApprove: 'Private policy text', branch: 'private-branch' },
					},
				},
			});
		}
		assert.deepStrictEqual(telemetry.events.map(event => ({
			provider: event.data.provider,
			model: event.data.model,
			selection: event.data.modelSelectionKind,
			mode: event.data.mode,
			permissionLevel: event.data.permissionLevel,
			isolation: event.data.isolationMode,
		})), [
			{ provider: 'default', model: undefined, selection: 'default', mode: 'other', permissionLevel: 'other', isolation: 'none' },
			{ provider: 'default', model: new TelemetryTrustedValue('auto'), selection: 'auto', mode: 'other', permissionLevel: 'other', isolation: 'none' },
			{ provider: 'default', model: 'byokModel', selection: 'explicit', mode: 'other', permissionLevel: 'other', isolation: 'none' },
			{ provider: 'default', model: 'unknown', selection: 'explicit', mode: 'other', permissionLevel: 'other', isolation: 'none' },
		]);
	});

	test('records a durable run claim before session creation settles and does not replay it', async () => {
		const release = new DeferredPromise<URI>();
		const started = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => release.p,
			startSession: async () => { await started.complete(); },
		});
		await service.handleCreate({
			...createAction(),
			definition: { ...definition(), session: { provider: 'copilotcli', config: { mode: 'plan' } } },
		});
		const request: RunAutomationParams = { channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'claim' };
		const run = await service.runAutomation(request);
		await service.runAutomation(request);
		await service.runAutomation({ ...request, requestId: 'overlap' });

		assert.deepStrictEqual(telemetry.events.filter(event => event.name !== 'automation.created').map(event => event.data), [{
			automationId: hashAutomationTelemetryId('ahp-automation:/review-changes'),
			runId: AgentSession.id(run.resource),
			trigger: 'manual',
			runCreatedAt: stateManager.getAutomationRunState(run.resource)?.lifecycle.createdAt,
			provider: 'copilotcli',
			agentSessionId: undefined,
			sessionCreated: false,
			model: undefined,
			modelSelectionKind: 'default',
			mode: 'plan',
			permissionLevel: 'providerDefault',
			isolationMode: 'none',
			targetKind: 'quickChat',
			folderCount: 0,
			hasCustomAgent: false,
		}]);
		await release.complete(URI.parse('copilotcli:/claimed-session'));
		await started.p;
		assert.deepStrictEqual(telemetry.events.map(event => event.name), ['automation.created', 'automation.runCreated', 'automation.runStarted']);
	});

	test('joins runs to existing Agent Host session telemetry without changing or duplicating it', async () => {
		const session = URI.parse('copilotcli:/business-session');
		const started = new DeferredPromise<void>();
		const reporter = new AgentHostTelemetryReporter(telemetry);
		const service = createService({
			createSession: async () => session,
			startSession: async (_, message) => {
				reporter.userMessageSent(
					'copilotcli', undefined, createUnknownAgentHostClientTelemetryContext(AgentHostClientType.Unknown),
					session.toString(), 'first-turn', undefined, 'direct', message, false,
				);
				await started.complete();
			},
		});
		await service.handleCreate({ ...createAction(), definition: { ...definition(), session: {} } });
		await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'business-run' });
		await started.p;

		const starts = telemetry.events.filter(event => event.name === 'automation.runStarted');
		const messages = telemetry.events.filter(event => event.name === 'agentHost.userMessageSent');
		assert.deepStrictEqual({
			events: telemetry.events.map(event => event.name),
			savedProviders: telemetry.events.filter(event => event.name === 'automation.created' || event.name === 'automation.runCreated').map(event => event.data.provider),
			runSession: starts.map(event => ({ provider: event.data.provider, agentSessionId: event.data.agentSessionId })),
			messageSession: messages.map(event => ({ provider: event.data.provider, agentSessionId: event.data.agentSessionId })),
			origins: messages.map(event => event.data.messageOriginKind),
			legacyFields: starts.flatMap(event => Object.keys(event.data).filter(key => key === 'executionAuthority' || key === 'agentsWindowSessionId' || key === 'sessionProvider')),
		}, {
			events: ['automation.created', 'automation.runCreated', 'automation.runStarted', 'agentHost.userMessageSent'],
			savedProviders: ['default', 'default'],
			runSession: [{ provider: 'copilotcli', agentSessionId: 'business-session' }],
			messageSession: [{ provider: 'copilotcli', agentSessionId: 'business-session' }],
			origins: ['automation'],
			legacyFields: [],
		});
	});

	test('logs pre-session failure once without inventing a run-start or session identifier', async () => {
		const service = createService({ createSession: async () => { throw new Error('/private/startup-error'); } });
		await enableAndCreate(service);
		const run = await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'failed-start' });
		await terminalRun(run.resource);
		await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'failed-start' });

		assert.deepStrictEqual(telemetry.events.filter(event => event.name === 'automation.runCompleted').map(event => ({
			name: event.name,
			...event.data,
			durationMs: Number(event.data.durationMs) >= 0,
		})), [{
			name: 'automation.runCompleted',
			automationId: hashAutomationTelemetryId('ahp-automation:/review-changes'),
			runId: AgentSession.id(run.resource),
			trigger: 'manual',
			runCreatedAt: stateManager.getAutomationRunState(run.resource)?.lifecycle.createdAt,
			provider: 'default',
			agentSessionId: undefined,
			sessionCreated: false,
			outcome: 'error',
			durationMs: true,
		}]);
		assert.deepStrictEqual(telemetry.events.map(event => event.name), ['automation.created', 'automation.runCreated', 'automation.runCompleted']);
	});

	test('a future host automation storage version disables the capability without rewriting data', async () => {
		storageService.set('automations', {
			version: 2,
			catalog: { automations: [] },
		});
		await storageService.whenIdle();
		const service = createService();

		await assert.rejects(service.handleCreate(createAction()), /storage is unavailable/);
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
		assert.deepStrictEqual(await service.listTriggerDefinitions({ channel: ROOT_STATE_URI }), { items: [] });
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

	test('obsolete migration flags cannot keep a restored host inactive', async () => {
		const resource = 'ahp-automation:/restored';
		const savedDefinition = { ...definition(), _meta: { 'vscode.legacyAutomationImportPending': true } };
		storageService.set('automations', {
			version: 1,
			catalog: {
				automations: [{
					resource,
					definition: savedDefinition,
					runs: [],
					operations: [AutomationOperation.Update],
					createdAt: '2026-01-01T00:00:00Z',
					modifiedAt: '2026-01-01T00:00:00Z',
				}],
				_meta: { 'vscode.migrationCompleted': false },
			},
		});
		await storageService.whenIdle();
		const service = createService();
		assert.deepStrictEqual({
			capabilities: service.capabilities,
			triggers: await service.listTriggerDefinitions({ channel: ROOT_STATE_URI }),
			definition: stateManager.getAutomationCatalogState()?.entries[0].definition,
			operations: stateManager.getAutomationCatalogState()?.entries[0].operations,
		}, {
			capabilities: { create: {}, schedules: {}, runCancellation: {}, runHistoryLimit: 50 },
			triggers: { items: [] },
			definition: savedDefinition,
			operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
		});
	});

	test('migrates stored Copilot Autopilot configurations into the current Automation shape', async () => {
		storageService.set('automations', {
			version: 1,
			catalog: {
				automations: [
					{
						resource: 'ahp-automation:/legacy-autopilot',
						definition: {
							...definition(),
							session: {
								provider: 'copilotcli',
								config: { [SessionConfigKey.AutoApprove]: 'autopilot' },
							},
						},
						runs: [],
						operations: [AutomationOperation.Update, AutomationOperation.Remove],
						createdAt: '2026-01-01T00:00:00.000Z',
						modifiedAt: '2026-01-01T00:00:00.000Z',
					},
					{
						resource: 'ahp-automation:/hotfix-window',
						definition: {
							...definition(),
							session: {
								config: {
									[SessionConfigKey.Mode]: 'agent',
									[SessionConfigKey.AutoApprove]: 'assisted',
								},
							},
						},
						runs: [],
						operations: [AutomationOperation.Update, AutomationOperation.Remove],
						createdAt: '2026-01-01T00:00:00.000Z',
						modifiedAt: '2026-01-01T00:00:00.000Z',
					},
				],
			},
		});
		await storageService.whenIdle();

		createService();

		assert.deepStrictEqual(
			stateManager.getAutomationCatalogState()?.entries.map(automation => automation.definition.session.config),
			[
				{ mode: 'autopilot', autoApprove: 'assisted' },
				{ mode: 'autopilot', autoApprove: 'assisted' },
			],
		);
	});

	test('failed catalogue persistence publishes nothing and a retry creates one entry', async () => {
		const service = createService();
		writeFailures = 1;

		await assert.rejects(service.handleCreate(createAction()), /storage unavailable/);
		assert.deepStrictEqual(stateManager.getAutomationCatalogState(), {
			entries: [],
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
		stateManager.dispatchServerAction(buildDefaultChatUri(session), { type: ActionType.ChatTurnComplete, turnId, duration: 10 });
		await service.fetchAutomationRuns({ channel: 'ahp-automations://', automation: params.automation });
		assert.deepStrictEqual(telemetry.events.filter(event => event.name !== 'automation.created').map(event => ({
			name: event.name,
			automationId: event.data.automationId,
			runId: event.data.runId,
			agentSessionId: event.data.agentSessionId,
			sessionCreated: event.data.sessionCreated,
			outcome: event.data.outcome,
		})), ['automation.runCreated', 'automation.runStarted', 'automation.runCompleted'].map(name => ({
			name,
			automationId: hashAutomationTelemetryId('ahp-automation:/review-changes'),
			runId: AgentSession.id(first.resource),
			agentSessionId: name === 'automation.runCreated' ? undefined : 'automation-session',
			sessionCreated: name !== 'automation.runCreated',
			outcome: name === 'automation.runCompleted' ? 'success' : undefined,
		})));
	});

	for (const hasMessageModel of [false, true]) {
		test(hasMessageModel ? 'preserves an explicit Automation message model' : 'records the Automation model configuration on its first turn', async () => {
			const session = URI.parse('mock:/model-configuration-run');
			const model = { id: 'mock-model', config: { thinkingLevel: 'low', contextSize: 272_000 } };
			const messageModel = hasMessageModel ? { id: 'other-model', config: { thinkingLevel: 'high' } } : undefined;
			const completed = new DeferredPromise<void>();
			let createdModel: AutomationDefinition['session']['model'];
			const readinessModels: AutomationDefinition['session']['model'][] = [];
			disposables.add(stateManager.onDidEmitEnvelope(envelope => {
				if (envelope.action.type === ActionType.AutomationRunLifecycleChanged && envelope.action.lifecycle.status === AutomationRunStatus.Completed) {
					void completed.complete();
				}
			}));
			const service = createService({
				isSessionTemplateAvailable: template => {
					readinessModels.push(template.model);
					return true;
				},
				createSession: async template => {
					createdModel = template.model;
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
					const chat = buildDefaultChatUri(createdSession);
					stateManager.dispatchServerAction(chat, {
						type: ActionType.ChatTurnStarted,
						turnId: 'model-configuration-turn',
						startedAt: new Date().toISOString(),
						message,
					});
					stateManager.dispatchServerAction(chat, {
						type: ActionType.ChatTurnComplete,
						turnId: 'model-configuration-turn',
						duration: 0,
					});
				},
			});
			const automation = definition();
			automation.session.model = model;
			if (messageModel) {
				automation.message.model = messageModel;
			}
			await service.handleCreate({ ...createAction(), definition: automation });
			await service.runAutomation({
				channel: 'ahp-automations://',
				automation: 'ahp-automation:/review-changes',
				requestId: 'model-configuration-request',
			});
			await completed.p;

			assert.deepStrictEqual({
				createdModel,
				readinessModelsMatch: readinessModels.length > 0 && readinessModels.every(checkedModel => checkedModel === (messageModel ?? model)),
				recordedModel: stateManager.getChatState(buildDefaultChatUri(session))?.turns[0]?.message.model,
				savedModel: stateManager.getAutomationCatalogState()?.entries[0].definition.session.model,
			}, {
				createdModel: messageModel ?? model,
				readinessModelsMatch: true,
				recordedModel: messageModel ?? model,
				savedModel: model,
			});
		});
	}

	for (const scheduled of [false, true]) {
		test(`uses a message-only model for ${scheduled ? 'scheduled' : 'manual'} execution readiness`, () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
			const model = { id: 'byok-model', config: { thinkingLevel: 'high' } };
			const started = new DeferredPromise<void>();
			let createdModel: AutomationDefinition['session']['model'];
			let sentModel: AutomationDefinition['message']['model'];
			const service = createService({
				isSessionTemplateAvailable: template => template.model?.id === model.id,
				createSession: async template => {
					createdModel = template.model;
					return URI.parse('mock:/byok-automation');
				},
				startSession: async (_session, message) => {
					sentModel = message.model;
					await started.complete();
				},
			});
			const automation = definition();
			automation.message.model = model;
			if (scheduled) {
				automation.triggers = [{ id: 'schedule', kind: AutomationTriggerKind.Schedule, schedule: { expression: '* * * * *', timeZone: 'UTC' } }];
			}
			await service.handleCreate({ ...createAction(), definition: automation });
			if (!scheduled) {
				await service.runAutomation({
					channel: 'ahp-automations://',
					automation: 'ahp-automation:/review-changes',
					requestId: 'message-model-request',
				});
			}
			await started.p;
			assert.deepStrictEqual({
				createdModel,
				sentModel,
				savedSessionModel: stateManager.getAutomationCatalogState()?.entries[0].definition.session.model,
			}, { createdModel: model, sentModel: model, savedSessionModel: undefined });
		}));
	}

	test('logs the saved run configuration despite an edit while the session is being created', async () => {
		const session = URI.parse('copilotcli:/configured-session');
		const started = new DeferredPromise<void>();
		const createStarted = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => {
				await createStarted.complete();
				await release.p;
				return session;
			},
			startSession: async () => { await started.complete(); },
		});
		await service.handleCreate({
			...createAction(),
			definition: { ...definition(), session: { provider: 'copilotcli', model: { id: 'catalog-model' }, config: { mode: 'plan', autoApprove: 'assisted' } } },
		});
		await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'config-snapshot' });
		await createStarted.p;
		await service.handleUpdate({
			type: ActionType.AutomationUpdateRequested,
			resource: 'ahp-automation:/review-changes',
			changes: { session: { provider: 'codex', config: { mode: 'autopilot', autoApprove: 'autoApprove' } } },
		});
		await release.complete();
		await started.p;

		assert.deepStrictEqual(telemetry.events.filter(event => event.name === 'automation.runStarted').map(event => ({
			provider: event.data.provider,
			model: event.data.model,
			modelSelectionKind: event.data.modelSelectionKind,
			mode: event.data.mode,
			permissionLevel: event.data.permissionLevel,
			targetKind: event.data.targetKind,
			folderCount: event.data.folderCount,
			isolationMode: event.data.isolationMode,
			agentSessionId: event.data.agentSessionId,
		})), [{
			provider: 'copilotcli',
			model: new TelemetryTrustedValue('catalog-model'),
			modelSelectionKind: 'explicit',
			mode: 'plan',
			permissionLevel: 'assisted',
			targetKind: 'quickChat',
			folderCount: 0,
			isolationMode: 'none',
			agentSessionId: 'configured-session',
		}]);
	});

	test('logs interruption once on restart with the previously linked session', async () => {
		const started = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => URI.parse('copilotcli:/interrupted-session'),
			startSession: async () => { await started.complete(); },
		});
		await enableAndCreate(service);
		const run = await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: 'restart' });
		await started.p;
		service.dispose();
		createService();
		await terminalRun(run.resource);
		createService();
		await storageService.whenIdle();

		assert.deepStrictEqual(telemetry.events.map(event => ({ name: event.name, outcome: event.data.outcome, session: event.data.agentSessionId })), [
			{ name: 'automation.created', outcome: undefined, session: undefined },
			{ name: 'automation.runCreated', outcome: undefined, session: undefined },
			{ name: 'automation.runStarted', outcome: undefined, session: 'interrupted-session' },
			{ name: 'automation.runCompleted', outcome: 'interrupted', session: 'interrupted-session' },
		]);
	});

	for (const outcome of ['success', 'error', 'cancelled', 'timeout'] as const) {
		test(outcome === 'success' ? 'preserves successful completion when cancellation races it' : `records linked-session ${outcome} without error content`, () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1), maxTaskCount: 100 }, async () => {
			stateManager.dispatchServerAction(ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged,
				config: { [AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY]: 1 },
			});
			const session = URI.parse(`copilotcli:/${outcome}-session`);
			const started = new DeferredPromise<void>();
			const service = createService({
				createSession: async () => {
					stateManager.createSession({
						resource: session.toString(), provider: 'copilotcli', title: '', status: SessionStatus.Idle,
						createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
					});
					return session;
				},
				startSession: async (_, message) => {
					stateManager.dispatchServerAction(buildDefaultChatUri(session), {
						type: ActionType.ChatTurnStarted, turnId: 'turn', startedAt: new Date().toISOString(), message,
					});
					await started.complete();
				},
				cancelSession: async () => {
					if (outcome === 'success') {
						stateManager.dispatchServerAction(buildDefaultChatUri(session), { type: ActionType.ChatTurnComplete, turnId: 'turn', duration: 0 });
					} else {
						stateManager.dispatchServerAction(buildDefaultChatUri(session), { type: ActionType.ChatTurnCancelled, turnId: 'turn', duration: 0 });
					}
					return true;
				},
			});
			await enableAndCreate(service);
			const run = await service.runAutomation({ channel: 'ahp-automations://', automation: 'ahp-automation:/review-changes', requestId: outcome });
			await started.p;
			const completed = terminalRun(run.resource);
			if (outcome === 'error') {
				stateManager.dispatchServerAction(buildDefaultChatUri(session), {
					type: ActionType.ChatError, turnId: 'turn', duration: 0,
					part: { kind: ResponsePartKind.Error, error: { errorType: 'providerError', message: 'Private error /private/repository' } },
				});
			} else if (outcome === 'cancelled' || outcome === 'success') {
				await service.handleCancel(run.resource, { type: ActionType.AutomationRunCancelRequested });
			}
			await completed;

			assert.deepStrictEqual(telemetry.events.filter(event => event.name === 'automation.runCompleted').map(event => event.data), [{
				automationId: hashAutomationTelemetryId('ahp-automation:/review-changes'),
				runId: AgentSession.id(run.resource),
				trigger: 'manual',
				runCreatedAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
				provider: 'copilotcli',
				agentSessionId: `${outcome}-session`,
				sessionCreated: true,
				outcome,
				durationMs: outcome === 'timeout' ? 60_000 : 0,
			}]);
		}));
	}

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

	test('a cancelled pending run never executes when its provider later registers', async () => {
		let available = false;
		let createCalls = 0;
		let startCalls = 0;
		const service = createService({
			isSessionTemplateAvailable: () => available,
			createSession: async () => { createCalls++; return URI.parse('mock:/unexpected'); },
			startSession: async () => { startCalls++; },
		});
		await enableAndCreate(service);
		const run = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'cancel-before-provider',
		});
		await service.handleCancel(run.resource, { type: ActionType.AutomationRunCancelRequested });
		available = true;
		service.handleAgentsChanged();
		await timeout(0);
		assert.deepStrictEqual({
			createCalls,
			startCalls,
			status: stateManager.getAutomationRunState(run.resource)?.lifecycle.status,
		}, { createCalls: 0, startCalls: 0, status: AutomationRunStatus.Cancelled });
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
			outcomes: telemetry.events.filter(event => event.name === 'automation.runCompleted').map(event => event.data.outcome),
		}, {
			status: AutomationRunStatus.Failed,
			error: 'Automation run timed out.',
			removeAvailable: true,
			outcomes: ['timeout'],
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
			lifecycleEvents: telemetry.events.filter(event => event.name !== 'automation.created').map(event => ({ name: event.name, outcome: event.data.outcome, sessionCreated: event.data.sessionCreated })),
		}, {
			startCalls: 0,
			status: AutomationRunStatus.Cancelled,
			hasStartedAt: true,
			hasCompletedAt: true,
			sessions: [session.toString()],
			primarySession: session.toString(),
			lifecycleEvents: [
				{ name: 'automation.runCreated', outcome: undefined, sessionCreated: false },
				{ name: 'automation.runCompleted', outcome: 'cancelled', sessionCreated: false },
			],
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
			startTriggers: telemetry.events.filter(event => event.name === 'automation.runStarted').map(event => event.data.trigger),
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
			startTriggers: ['catch_up'],
		});
	});

	for (const initiallyEnabled of [true, false]) {
		test(`preserves catch-up work until authentication is ready with enablement ${initiallyEnabled}`, async () => {
			const timestamp = new Date().toISOString();
			const scheduledFor = new Date(Date.now() - 120_000).toISOString();
			const resource = 'ahp-automation:/awaiting-auth';
			storageService.set('automations', {
				version: 1,
				catalog: {
					automations: [{
						resource,
						definition: {
							...definition(),
							triggers: [{
								id: 'schedule', kind: AutomationTriggerKind.Schedule,
								schedule: { expression: '* * * * *', timeZone: 'UTC' },
								misfirePolicy: AutomationMisfirePolicy.RunOnce,
							}],
						},
						runs: [], nextRunAt: scheduledFor,
						operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
						createdAt: timestamp, modifiedAt: timestamp,
						_meta: { 'vscode.scheduleCursors': { schedule: scheduledFor } },
					}]
				},
				runs: [],
				manualRunRequests: [],
			});
			await storageService.whenIdle();
			stateManager.dispatchServerAction(ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged, config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: initiallyEnabled },
			});
			const authenticated = observableValue('authenticated', false);
			const started = new DeferredPromise<void>();
			let createCalls = 0;
			const service = createService({
				isSessionTemplateAvailable: (_template, reader) => authenticated.read(reader),
				createSession: async () => {
					createCalls++;
					const session = URI.parse('mock:/authenticated');
					stateManager.createSession({
						resource: session.toString(), provider: 'mock', title: '',
						status: SessionStatus.Idle, createdAt: timestamp, modifiedAt: timestamp,
					});
					return session;
				},
				startSession: async () => { await started.complete(); },
			});
			const writesBeforeReadiness = writeAttempts;
			await timeout(0);
			assert.deepStrictEqual({
				createCalls, writes: writeAttempts - writesBeforeReadiness,
				nextRunAt: stateManager.getAutomationCatalogState()?.entries[0].nextRunAt,
				runs: stateManager.getAutomationCatalogState()?.entries[0].runs,
			}, { createCalls: 0, writes: 0, nextRunAt: scheduledFor, runs: [] });
			authenticated.set(true, undefined);
			if (!initiallyEnabled) {
				await timeout(0);
				assert.strictEqual(createCalls, 0);
				stateManager.dispatchServerAction(ROOT_STATE_URI, {
					type: ActionType.RootConfigChanged, config: { [AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: true },
				});
				await service.handleConfigurationChanged();
			}
			await started.p;
			authenticated.set(false, undefined);
			authenticated.set(true, undefined);
			await timeout(0);
			const automation = stateManager.getAutomationCatalogState()?.entries[0];
			assert.deepStrictEqual({
				createCalls, runCount: automation?.runs.length,
				origin: automation?.runs[0].origin,
				nextRunIsFuture: Date.parse(automation?.nextRunAt ?? '') > Date.now(),
			}, {
				createCalls: 1, runCount: 1,
				origin: { kind: AutomationRunOriginKind.Trigger, triggerId: 'schedule', scheduledFor, catchUp: true },
				nextRunIsFuture: true,
			});
		});
	}

	test('records an on-time scheduled run with schedule provenance', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1), maxTaskCount: 100 }, async () => {
		const started = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => URI.parse('copilotcli:/scheduled-session'),
			startSession: async () => { await started.complete(); },
		});
		await service.handleCreate({
			...createAction(),
			definition: {
				...definition(),
				triggers: [{ id: 'schedule', kind: AutomationTriggerKind.Schedule, schedule: { expression: '* * * * *', timeZone: 'UTC' } }],
			},
		});
		await started.p;

		assert.deepStrictEqual(telemetry.events.map(event => ({ name: event.name, trigger: event.data.trigger, scheduleKind: event.data.scheduleKind })), [
			{ name: 'automation.created', trigger: undefined, scheduleKind: 'scheduled' },
			{ name: 'automation.runCreated', trigger: 'schedule', scheduleKind: undefined },
			{ name: 'automation.runStarted', trigger: 'schedule', scheduleKind: undefined },
		]);
	}));

	test('allows exactly three scheduled runs and keeps manual execution exempt after exhaustion', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1), maxTaskCount: 500 }, async () => {
		let createCalls = 0;
		let startCalls = 0;
		const thirdScheduledStart = new DeferredPromise<void>();
		const sixthScheduledStart = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => {
				const session = URI.parse(`mock:/limited-scheduled-${++createCalls}`);
				stateManager.createSession({
					resource: session.toString(), provider: 'mock', title: '',
					status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
				});
				return session;
			},
			startSession: async (session, message) => {
				const turnId = `limited-scheduled-${++startCalls}`;
				stateManager.dispatchServerAction(buildDefaultChatUri(session), {
					type: ActionType.ChatTurnStarted, turnId, startedAt: new Date().toISOString(), message,
				});
				stateManager.dispatchServerAction(buildDefaultChatUri(session), {
					type: ActionType.ChatTurnComplete, turnId, duration: 0,
				});
				if (startCalls === 3) {
					await thirdScheduledStart.complete();
				}
				if (startCalls === 7) {
					await sixthScheduledStart.complete();
				}
			},
		});
		await service.handleCreate({
			...createAction(),
			definition: {
				...scheduledDefinition(3),
				triggers: [{ id: 'schedule', kind: AutomationTriggerKind.Schedule, schedule: { expression: '0 * * * *', timeZone: 'UTC' } }],
			},
		});
		await thirdScheduledStart.p;
		await terminalRun(stateManager.getAutomationCatalogState()!.entries[0].runs[0].resource);

		const manual = await service.runAutomation({
			channel: 'ahp-automations://',
			automation: 'ahp-automation:/review-changes',
			requestId: 'manual-after-schedule-limit',
		});
		await terminalRun(manual.resource);

		const automation = stateManager.getAutomationCatalogState()?.entries[0];
		await service.handleUpdate({
			type: ActionType.AutomationUpdateRequested, resource: 'ahp-automation:/review-changes', changes: { enabled: true },
		});
		await sixthScheduledStart.p;
		await terminalRun(stateManager.getAutomationCatalogState()!.entries[0].runs[0].resource);
		const freshAllowance = stateManager.getAutomationCatalogState()?.entries[0];
		assert.deepStrictEqual({
			startCalls,
			enabled: automation?.definition.enabled,
			disableConditions: automation?.definition.disableConditions,
			scheduledRunCount: automation?.scheduledRunCount,
			nextRunAt: automation?.nextRunAt,
			cursors: automation?._meta?.['vscode.scheduleCursors'],
			origins: automation?.runs.map(run => run.origin.kind).sort(),
			freshAllowance: [freshAllowance?.definition.enabled, freshAllowance?.scheduledRunCount],
		}, {
			startCalls: 7,
			enabled: false,
			disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 3 }],
			scheduledRunCount: 3,
			nextRunAt: undefined,
			cursors: undefined,
			freshAllowance: [false, 3],
			origins: [
				AutomationRunOriginKind.Manual,
				AutomationRunOriginKind.Trigger,
				AutomationRunOriginKind.Trigger,
				AutomationRunOriginKind.Trigger,
			],
		});
	}));

	for (const outcome of ['failed', 'cancelled'] as const) {
		test(`scheduled run limit is consumed when an admitted run is ${outcome}`, () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1), maxTaskCount: 100 }, async () => {
			const session = URI.parse(`mock:/limited-${outcome}`);
			const started = new DeferredPromise<void>();
			const terminal = new DeferredPromise<void>();
			const service = createService({
				createSession: async () => {
					stateManager.createSession({
						resource: session.toString(), provider: 'mock', title: '',
						status: SessionStatus.Idle, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString(),
					});
					return session;
				},
				startSession: async (createdSession, message) => {
					if (outcome === 'failed') {
						throw new Error('scheduled failure');
					}
					stateManager.dispatchServerAction(buildDefaultChatUri(createdSession), {
						type: ActionType.ChatTurnStarted, turnId: 'limited-cancel', startedAt: new Date().toISOString(), message,
					});
					await started.complete();
				},
				cancelSession: async createdSession => {
					stateManager.dispatchServerAction(buildDefaultChatUri(createdSession), {
						type: ActionType.ChatTurnCancelled, turnId: 'limited-cancel', duration: 0,
					});
					return true;
				},
			});
			disposables.add(stateManager.onDidEmitEnvelope(envelope => {
				if (envelope.action.type === ActionType.AutomationRunLifecycleChanged && envelope.action.lifecycle.status !== AutomationRunStatus.Running) {
					void terminal.complete();
				}
			}));
			await service.handleCreate({ ...createAction(), definition: scheduledDefinition(1) });
			if (outcome === 'cancelled') {
				await started.p;
				await service.handleCancel(stateManager.getAutomationCatalogState()!.entries[0].runs[0].resource, { type: ActionType.AutomationRunCancelRequested });
			}
			await terminal.p;

			const automation = stateManager.getAutomationCatalogState()?.entries[0];
			assert.deepStrictEqual({
				enabled: automation?.definition.enabled,
				scheduledRunCount: automation?.scheduledRunCount,
				status: automation?.runs[0].lifecycle.status,
			}, {
				enabled: false,
				scheduledRunCount: 1,
				status: outcome === 'failed' ? AutomationRunStatus.Failed : AutomationRunStatus.Cancelled,
			});
		}));
	}

	test('edits preserve, reset, lower, raise, and clear scheduled run limits', async () => {
		const now = new Date();
		const scheduledFor = new Date(now.getTime() - 60_000).toISOString();
		const resource = 'ahp-automation:/review-changes';
		storageService.set('automations', {
			version: 1,
			catalog: {
				automations: [{
					resource,
					definition: scheduledDefinition(3),
					scheduledRunCount: 0,
					runs: [], nextRunAt: scheduledFor,
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: now.toISOString(), modifiedAt: now.toISOString(),
					_meta: { 'vscode.scheduleCursors': { schedule: scheduledFor } },
				}],
			},
			runs: [],
			manualRunRequests: [],
		});
		await storageService.whenIdle();
		const started = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => URI.parse('mock:/limit-edit'),
			startSession: async () => { await started.complete(); },
		});
		await started.p;
		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource, changes: { enabled: true } });
		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource, changes: { disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 5 }] } });
		const expanded = stateManager.getAutomationCatalogState()?.entries[0];
		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource, changes: { disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 1 }] } });
		const lowered = stateManager.getAutomationCatalogState()?.entries[0];
		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource, changes: { disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 5 }] } });
		const raised = stateManager.getAutomationCatalogState()?.entries[0];
		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource, changes: { enabled: true } });
		const reenabled = stateManager.getAutomationCatalogState()?.entries[0];
		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource, changes: { enabled: false } });
		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource, changes: { disableConditions: [] } });
		const cleared = stateManager.getAutomationCatalogState()?.entries[0];

		assert.deepStrictEqual({
			expanded: [expanded?.definition.enabled, expanded?.scheduledRunCount, expanded?.definition.disableConditions],
			lowered: {
				enabled: lowered?.definition.enabled,
				disableConditions: lowered?.definition.disableConditions,
				scheduledRunCount: lowered?.scheduledRunCount,
				nextRunAt: lowered?.nextRunAt,
			},
			raised: {
				enabled: raised?.definition.enabled,
				disableConditions: raised?.definition.disableConditions,
				scheduledRunCount: raised?.scheduledRunCount,
			},
			reenabled: {
				enabled: reenabled?.definition.enabled,
				disableConditions: reenabled?.definition.disableConditions,
				scheduledRunCount: reenabled?.scheduledRunCount,
			},
			cleared: {
				enabled: cleared?.definition.enabled,
				disableConditions: cleared?.definition.disableConditions,
				scheduledRunCount: cleared?.scheduledRunCount,
			},
		}, {
			expanded: [true, 1, [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 5 }]],
			lowered: { enabled: false, disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 1 }], scheduledRunCount: 1, nextRunAt: undefined },
			raised: { enabled: false, disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 5 }], scheduledRunCount: 1 },
			reenabled: { enabled: true, disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 5 }], scheduledRunCount: 0 },
			cleared: { enabled: false, disableConditions: [], scheduledRunCount: undefined },
		});
	});

	for (const mode of ['idle', 'unavailable', 'active'] as const) {
		test(`final date disables scheduling with an ${mode} provider or run`, () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1) }, async () => {
			let creates = 0;
			let cancels = 0;
			const service = createService({
				isSessionTemplateAvailable: () => mode !== 'unavailable',
				createSession: async () => { creates++; return URI.parse('mock:/cutoff'); },
				startSession: async () => { },
				cancelSession: async () => { cancels++; return true; },
			});
			const conditions = [
				{ kind: AutomationDisableConditionKind.MaxRuns as const, maxRuns: 3 },
				{ kind: AutomationDisableConditionKind.FinalDate as const, finalDate: '2026-01-01T00:00:01Z' },
			];
			await service.handleCreate({ ...createAction(), definition: { ...scheduledDefinition(), disableConditions: conditions } });
			if (mode === 'active') {
				await service.runAutomation({ channel: AUTOMATION_CATALOG_URI, automation: createAction().resource, requestId: 'before-cutoff' });
			}
			await timeout(999);
			assert.strictEqual(stateManager.getAutomationCatalogState()!.entries[0].definition.enabled, true);
			await timeout(2);
			const automation = stateManager.getAutomationCatalogState()!.entries[0];
			assert.deepStrictEqual({
				enabled: automation.definition.enabled,
				conditions: automation.definition.disableConditions,
				count: automation.scheduledRunCount,
				nextRunAt: automation.nextRunAt,
				canRun: automation.operations.includes(AutomationOperation.Run),
				active: automation.runs[0]?.lifecycle.status,
				creates, cancels,
			}, {
				enabled: false, conditions, count: 0, nextRunAt: undefined, canRun: true,
				active: mode === 'active' ? AutomationRunStatus.Running : undefined,
				creates: mode === 'active' ? 1 : 0, cancels: 0,
			});
		}));
	}

	test('expired restart conditions suppress catch-up, retain usage and allow manual runs', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 2) }, async () => {
		const timestamp = '2026-01-01T00:00:00Z';
		const conditions = [
			{ kind: AutomationDisableConditionKind.MaxRuns as const, maxRuns: 3 },
			{ kind: AutomationDisableConditionKind.FinalDate as const, finalDate: '2026-01-02T00:00:00Z' },
		];
		storageService.set('automations', {
			version: 1,
			catalog: {
				automations: [{
					resource: createAction().resource,
					definition: { ...scheduledDefinition(), disableConditions: conditions },
					scheduledRunCount: 1, runs: [], nextRunAt: timestamp,
					operations: [AutomationOperation.Update, AutomationOperation.Run],
					createdAt: timestamp, modifiedAt: timestamp,
					_meta: { 'vscode.scheduleCursors': { schedule: timestamp } },
				}]
			},
		});
		await storageService.whenIdle();
		let creates = 0;
		const manualStarted = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => { creates++; return URI.parse('mock:/expired-manual'); },
			startSession: async () => { await manualStarted.complete(); },
		});
		await timeout(1);
		const expired = stateManager.getAutomationCatalogState()!.entries[0];
		assert.deepStrictEqual([expired.definition.enabled, expired.scheduledRunCount, creates], [false, 1, 0]);
		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource: expired.resource, changes: { enabled: true } });
		const reenabled = stateManager.getAutomationCatalogState()!.entries[0];
		await service.runAutomation({ channel: AUTOMATION_CATALOG_URI, automation: expired.resource, requestId: 'manual-after-cutoff' });
		await manualStarted.p;
		const manual = stateManager.getAutomationCatalogState()!.entries[0];
		assert.deepStrictEqual({
			reenabled: [reenabled.definition.enabled, reenabled.scheduledRunCount, reenabled.definition.disableConditions],
			manual: [manual.scheduledRunCount, manual.runs[0].origin.kind, creates],
		}, {
			reenabled: [false, 0, conditions],
			manual: [0, AutomationRunOriginKind.Manual, 1],
		});
	}));

	for (const cutoffSeconds of [59, 60, 61]) {
		test(`OR conditions enforce final date ${cutoffSeconds}s around a scheduled admission`, () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1) }, async () => {
			let creates = 0;
			const service = createService({
				createSession: async () => { creates++; return URI.parse('mock:/or-conditions'); },
				startSession: async () => { },
			});
			const conditions = [
				{ kind: AutomationDisableConditionKind.MaxRuns as const, maxRuns: 1 },
				{ kind: AutomationDisableConditionKind.FinalDate as const, finalDate: new Date(Date.now() + cutoffSeconds * 1000).toISOString() },
			];
			await service.handleCreate({ ...createAction(), definition: { ...scheduledDefinition(), disableConditions: conditions } });
			await timeout(62_000);
			const entry = stateManager.getAutomationCatalogState()!.entries[0];
			assert.deepStrictEqual([entry.definition.enabled, entry.scheduledRunCount, creates, entry.definition.disableConditions],
				[false, cutoffSeconds > 60 ? 1 : 0, cutoffSeconds > 60 ? 1 : 0, conditions]);
		}));
	}

	test('date-only edits and condition reordering preserve allowance; removing maxRuns clears usage', async () => {
		const timestamp = new Date().toISOString();
		const maxRuns = { kind: AutomationDisableConditionKind.MaxRuns as const, maxRuns: 5 };
		const finalDate = { kind: AutomationDisableConditionKind.FinalDate as const, finalDate: '2099-01-01T00:00:00Z' };
		storageService.set('automations', {
			catalog: {
				automations: [{
					resource: createAction().resource,
					definition: { ...definition(), enabled: false, disableConditions: [maxRuns] },
					scheduledRunCount: 2, runs: [], operations: [AutomationOperation.Update, AutomationOperation.Run],
					createdAt: timestamp, modifiedAt: timestamp,
				}]
			}
		});
		await storageService.whenIdle();
		const service = createService();
		const counts: (number | undefined)[] = [];
		for (const disableConditions of [
			[maxRuns, finalDate], [finalDate, maxRuns], [maxRuns], [finalDate], [finalDate, maxRuns], [],
		]) {
			await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource: createAction().resource, changes: { disableConditions } });
			counts.push(stateManager.getAutomationCatalogState()!.entries[0].scheduledRunCount);
		}
		assert.deepStrictEqual({ counts, enabled: stateManager.getAutomationCatalogState()!.entries[0].definition.enabled },
			{ counts: [2, 2, 2, undefined, 0, undefined], enabled: false });
	});

	test('scheduled claim persistence failure publishes nothing and does not execute', async () => {
		const now = new Date();
		const scheduledFor = new Date(now.getTime() - 60_000).toISOString();
		storageService.set('automations', {
			version: 1,
			catalog: {
				automations: [{
					resource: 'ahp-automation:/persist-failure',
					definition: scheduledDefinition(1),
					scheduledRunCount: 0,
					runs: [], nextRunAt: scheduledFor,
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: now.toISOString(), modifiedAt: now.toISOString(),
					_meta: { 'vscode.scheduleCursors': { schedule: scheduledFor } },
				}],
			},
			runs: [],
			manualRunRequests: [],
		});
		await storageService.whenIdle();
		writeFailures = 1;
		let createCalls = 0;
		createService({ createSession: async () => { createCalls++; return URI.parse('mock:/unexpected'); } });
		await timeout(0);

		const automation = stateManager.getAutomationCatalogState()?.entries[0];
		assert.deepStrictEqual({
			createCalls,
			runs: automation?.runs,
			scheduledRunCount: automation?.scheduledRunCount,
			enabled: automation?.definition.enabled,
		}, {
			createCalls: 0,
			runs: [],
			scheduledRunCount: 0,
			enabled: true,
		});
	});

	test('final date persistence failure publishes nothing and retries without admitting a run', () => runWithFakedTimers({ useFakeTimers: true, startTime: Date.UTC(2026, 0, 1) }, async () => {
		const service = createService();
		await service.handleCreate({
			...createAction(),
			definition: {
				...scheduledDefinition(),
				disableConditions: [{ kind: AutomationDisableConditionKind.FinalDate, finalDate: '2026-01-01T00:01:00Z' }],
			},
		});
		const initial = stateManager.getAutomationCatalogState()!.entries[0];
		writeFailures = 1;
		await timeout(60_001);
		const failed = stateManager.getAutomationCatalogState()!.entries[0];
		await timeout(60_000);
		const retried = stateManager.getAutomationCatalogState()!.entries[0];
		assert.deepStrictEqual({ failed, retried: [retried.definition.enabled, retried.runs, retried.definition.disableConditions] },
			{ failed: initial, retried: [false, [], initial.definition.disableConditions] });
	}));

	test('scheduled run allowance persists across restart after final admission', async () => {
		const now = new Date();
		const scheduledFor = new Date(now.getTime() - 60_000).toISOString();
		storageService.set('automations', {
			version: 1,
			catalog: {
				automations: [{
					resource: 'ahp-automation:/restart-limit',
					definition: scheduledDefinition(2),
					scheduledRunCount: 1,
					runs: [], nextRunAt: scheduledFor,
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: now.toISOString(), modifiedAt: now.toISOString(),
					_meta: { 'vscode.scheduleCursors': { schedule: scheduledFor } },
				}],
			},
			runs: [],
			manualRunRequests: [],
		});
		await storageService.whenIdle();
		const started = new DeferredPromise<void>();
		const service = createService({
			createSession: async () => URI.parse('mock:/restart-limit'),
			startSession: async () => { await started.complete(); },
		});
		await started.p;
		service.dispose();
		createService();
		await timeout(0);

		const automation = stateManager.getAutomationCatalogState()?.entries[0];
		assert.deepStrictEqual({
			enabled: automation?.definition.enabled,
			scheduledRunCount: automation?.scheduledRunCount,
			nextRunAt: automation?.nextRunAt,
			runCount: automation?.runs.length,
		}, {
			enabled: false,
			scheduledRunCount: 2,
			nextRunAt: undefined,
			runCount: 1,
		});
	});

	test('rejects invalid maxima and duplicate condition kinds without changing state', async () => {
		const service = createService();
		for (const maximum of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
			await assert.rejects(service.handleCreate({ ...createAction(), definition: scheduledDefinition(maximum) }), /positive safe integer/);
		}
		for (const finalDate of ['not-a-date', '2026-02-30T00:00:00Z', '2026-01-01T00:00:00']) {
			await assert.rejects(service.handleCreate({
				...createAction(),
				definition: { ...definition(), disableConditions: [{ kind: AutomationDisableConditionKind.FinalDate, finalDate }] },
			}), /valid ISO 8601/);
		}
		await service.handleCreate({ ...createAction(), definition: scheduledDefinition(2) });
		for (const maximum of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
			await assert.rejects(service.handleUpdate({
				type: ActionType.AutomationUpdateRequested, resource: 'ahp-automation:/review-changes', changes: { disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: maximum }] },
			}), /positive safe integer/);
		}
		await assert.rejects(service.handleUpdate({
			type: ActionType.AutomationUpdateRequested,
			resource: 'ahp-automation:/review-changes',
			changes: {
				disableConditions: [
					{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 3 },
					{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 3 },
				]
			},
		}), /at most once/);
		await service.handleUpdate({
			type: ActionType.AutomationUpdateRequested,
			resource: 'ahp-automation:/review-changes',
			changes: {},
		});

		assert.deepStrictEqual({
			disableConditions: stateManager.getAutomationCatalogState()?.entries[0].definition.disableConditions,
			scheduledRunCount: stateManager.getAutomationCatalogState()?.entries[0].scheduledRunCount,
		}, {
			disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 2 }],
			scheduledRunCount: 0,
		});
	});

	test('invalid stored scheduled limit state disables automations without rewriting storage', async () => {
		const timestamp = '2026-01-01T00:00:00.000Z';
		const valid = {
			version: 1,
			catalog: {
				automations: [{
					resource: 'ahp-automation:/valid-limit',
					definition: scheduledDefinition(2),
					scheduledRunCount: 0,
					runs: [],
					operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
					createdAt: timestamp,
					modifiedAt: timestamp,
				}],
			},
			runs: [],
			manualRunRequests: [],
		};
		const cases = [
			{ name: 'missing-count', definition: scheduledDefinition(2) },
			{ name: 'invalid-max', definition: scheduledDefinition(0), scheduledRunCount: 0 },
			{ name: 'negative-count', definition: scheduledDefinition(2), scheduledRunCount: -1 },
			{ name: 'fraction-count', definition: scheduledDefinition(2), scheduledRunCount: 1.5 },
			{ name: 'unsafe-count', definition: scheduledDefinition(2), scheduledRunCount: Number.MAX_SAFE_INTEGER + 1 },
			{ name: 'count-on-unlimited', definition: scheduledDefinition(), scheduledRunCount: 0 },
			{ name: 'invalid-date', definition: { ...definition(), disableConditions: [{ kind: AutomationDisableConditionKind.FinalDate, finalDate: 'invalid' }] } },
			{
				name: 'duplicate-kind', definition: {
					...definition(), disableConditions: [
						{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 3 },
						{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 4 },
					]
				}, scheduledRunCount: 0
			},
		];

		for (const { name, ...automation } of cases) {
			storageService.set('automations', valid);
			await storageService.whenIdle();
			const raw = {
				version: 1,
				catalog: {
					automations: [{
						resource: `ahp-automation:/${name}`,
						runs: [],
						operations: [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run],
						createdAt: timestamp,
						modifiedAt: timestamp,
						...automation,
					}],
				},
				runs: [],
				manualRunRequests: [],
			};
			storageService.set('automations', raw);
			await storageService.whenIdle();
			const service = createService();

			await assert.rejects(service.handleCreate(createAction()), /storage is unavailable/);
			assert.deepStrictEqual({
				isAvailable: service.isAvailable,
				capabilities: service.capabilities,
				raw: storageService.get('automations'),
			}, {
				isAvailable: false,
				capabilities: undefined,
				raw,
			});
			service.dispose();
		}
	});

	test('coalesces simultaneously-due schedule triggers on one Automation into a single run', async () => {
		const now = new Date();
		const firstScheduledFor = new Date(now.getTime() - 3 * 60_000).toISOString();
		const secondScheduledFor = new Date(now.getTime() - 2 * 60_000).toISOString();
		const automationResource = 'ahp-automation:/multi-trigger';
		const multiTriggerDefinition: AutomationDefinition = {
			...definition(),
			disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 10 }],
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
					scheduledRunCount: 0,
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
			scheduledRunCount: automation?.scheduledRunCount,
			claimedTriggerId: automation?.runs[0]?.origin.kind === AutomationRunOriginKind.Trigger ? automation.runs[0].origin.triggerId : undefined,
			firstCursorAdvanced: cursors ? Date.parse(cursors['first-trigger']) > now.getTime() : false,
			secondCursorAdvanced: cursors ? Date.parse(cursors['second-trigger']) > now.getTime() : false,
		}, {
			runsClaimed: 1,
			scheduledRunCount: 1,
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
			disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 10 }],
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
					scheduledRunCount: 0,
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
			scheduledRunCount: automation?.scheduledRunCount,
			claimedTriggerId: automation?.runs[0]?.origin.kind === AutomationRunOriginKind.Trigger ? automation.runs[0].origin.triggerId : undefined,
		}, {
			runsClaimed: 1,
			scheduledRunCount: 1,
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
					definition: { ...definition(), disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 100 }] },
					scheduledRunCount: 51,
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
		});
		await storageService.whenIdle();
		const service = createService();

		assert.deepStrictEqual({
			count: stateManager.getAutomationCatalogState()?.entries[0].runs.length,
			cursor: stateManager.getAutomationCatalogState()?.entries[0].runsNextCursor,
			scheduledRunCount: stateManager.getAutomationCatalogState()?.entries[0].scheduledRunCount,
		}, {
			count: 50,
			cursor: '50',
			scheduledRunCount: 51,
		});

		await service.fetchAutomationRuns({
			channel: 'ahp-automations://',
			automation: automationResource,
			cursor: '50',
		});

		assert.deepStrictEqual({
			count: stateManager.getAutomationCatalogState()?.entries[0].runs.length,
			cursor: stateManager.getAutomationCatalogState()?.entries[0].runsNextCursor,
			scheduledRunCount: stateManager.getAutomationCatalogState()?.entries[0].scheduledRunCount,
		}, {
			count: 51,
			cursor: undefined,
			scheduledRunCount: 51,
		});

		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource: automationResource, changes: { disableConditions: [] } });
		await service.handleUpdate({ type: ActionType.AutomationUpdateRequested, resource: automationResource, changes: { disableConditions: [{ kind: AutomationDisableConditionKind.MaxRuns, maxRuns: 3 }] } });
		const newlyLimited = stateManager.getAutomationCatalogState()?.entries[0];
		assert.deepStrictEqual({
			history: newlyLimited?.runs.length,
			usage: newlyLimited?.scheduledRunCount,
			enabled: newlyLimited?.definition.enabled,
		}, { history: 51, usage: 0, enabled: true });
	});
});
