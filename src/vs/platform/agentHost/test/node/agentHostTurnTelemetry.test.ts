/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../telemetry/common/telemetryUtils.js';
import { createAgentModelByokMeta } from '../../common/agentModelByokMeta.js';
import { getTelemetryChatSessionId } from '../../common/agentTelemetryCorrelation.js';
import { AgentSession, IAgent, type AgentModelCallFinishedOutcome, type IAgentTurnTokenUsage } from '../../common/agent.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind, type IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import type { SessionMode } from '../../common/agentHostSchema.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType, type ChatAction, type ChatUsageAction } from '../../common/state/sessionActions.js';
import { withEphemeralSessionMeta } from '../../common/meta/agentEphemeralSessionMeta.js';
import { toAgentMergeMessageMeta } from '../../common/meta/agentMergeMessageMeta.js';
import { buildDefaultChatUri, buildSubagentChatUri, createErrorResponsePart, type Message, MessageKind, PendingMessageKind, ResponsePartKind, SessionStatus } from '../../common/state/sessionState.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentHostChatContributions } from '../../common/agentHostChatContributionsService.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { AgentHostLocalTurns, IAgentHostLocalTurns } from '../../node/agentHostLocalTurns.js';
import { AgentHostLocalCommands, IAgentHostLocalCommands } from '../../node/localCommands/localChatCommand.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { registerBuiltInChatContributions } from '../../node/chatContributions/builtInChatContributions.js';
import { ISessionWorkspaceConversionService } from '../../node/chatContributions/sessionWorkspaceConversion/sessionWorkspaceConversionService.js';
import { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { createTestAgentHostProviderService } from './testAgentHostProviderService.js';
import { AgentHostSessionTitleController, IAgentHostSessionTitleController } from '../../node/agentHostSessionTitleController.js';
import { AgentHostTelemetryReporter, IAgentHostTelemetryReporter } from '../../node/agentHostTelemetryReporter.js';
import { AgentHostTelemetryService } from '../../node/agentHostTelemetryService.js';
import { AgentHostToolCallTracker, IAgentHostToolCallTracker } from '../../node/agentHostToolCallTracker.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker } from '../../node/agentHostTurnTracker.js';
import { AgentHostTurnService, IAgentHostTurnService } from '../../node/agentHostTurnService.js';
import { AgentHostClientConnectionService, IAgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { IAgentHostChangesetService } from '../../common/agentHostChangesetService.js';
import { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { AgentSideEffects } from '../../node/agentSideEffects.js';
import type { IAgentHostCustomizationEnablementService } from '../../node/agentHostCustomizationEnablementService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { IAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';
import { createNoopGitStateService, createNullSessionDataService } from '../common/sessionTestHelpers.js';
import { createNoopWorktreeIsolation } from './worktreeTestHelpers.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { MockAgent } from './mockAgent.js';
import { TestAgentHostTerminalManager } from './testAgentHostTerminalManager.js';

class FakeChangesetService implements IAgentHostChangesetService {
	declare readonly _serviceBrand: undefined;
	registerStaticChangesets(): void { }
	restoreStaticChangeset(): void { }
	parsePersistedStaticChangesets(): { session?: undefined } { return {}; }
	applyPersistedStaticChangesets(): void { }
	restorePersistedStaticChangesets(): { session?: undefined } { return {}; }
	persistChangesSummary(): void { }
	isStaticChangesetComputeActive(): boolean { return false; }
	getListMetadataKeys() { return undefined; }
	computeListEntryChanges() { return undefined; }
	refreshChangesetCatalog(): void { }
	refreshBranchChangeset(): void { }
	refreshSessionChangeset(): void { }
	onWorkingDirectoryAvailable(): void { }
	recomputeSubscribedChangesets(): void { }
	async computeUncommittedChangeset(session: string): Promise<string> { return `${session}/changeset/uncommitted`; }
	async computeTurnChangeset(session: string): Promise<string> { return `${session}/x`; }
	async computeCompareTurnsChangeset(session: string): Promise<string> { return `${session}/y`; }
	onToolCallEditsApplied(): void { }
	onTurnComplete(): void { }
	onSessionTruncated(): void { }
}

class CapturingTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sessionId = 'test-session';
	readonly machineId = 'test-machine';
	readonly sqmId = 'test-sqm';
	readonly devDeviceId = 'test-dev-device';
	readonly firstSessionDate = 'test-first-session-date';
	readonly sendErrorTelemetry = false;
	readonly events: { eventName: string; data: unknown }[] = [];

	publicLog(): void { }
	publicLog2(eventName: string, data?: unknown): void {
		this.events.push({ eventName, data });
	}
	publicLogError(): void { }
	publicLogError2(eventName: string, data?: unknown): void {
		this.events.push({ eventName, data });
	}
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

/**
 * Integration tests covering the {@link AgentHostTurnTracker} as it is
 * driven through {@link AgentSideEffects}. These tests intentionally
 * exercise the full wiring (turn-started routing, progress dispatch,
 * turn-complete/cancel/error paths) so that we cover both the tracker
 * and its integration with the side-effect dispatch in one place.
 */
suite('AgentSideEffects — turn tracker telemetry', () => {

	const disposables = new DisposableStore();
	let stateManager: AgentHostStateManager;
	let agent: MockAgent;
	let sideEffects: AgentSideEffects;
	let telemetry: CapturingTelemetryService;
	let logService: NullLogService;
	let turnTracker: AgentHostTurnTracker;

	const sessionUri = AgentSession.uri('mock', 'session-1');
	const sessionKey = sessionUri.toString();
	const defaultChatUri = buildDefaultChatUri(sessionUri);

	function setupSession(ready = true, workingDirectories?: string[], isEphemeral = false): void {
		stateManager.createSession({
			resource: sessionKey,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			...(workingDirectories ? { workingDirectories } : {}),
			...(isEphemeral ? { _meta: withEphemeralSessionMeta(undefined, true) } : {}),
		});
		if (ready) {
			stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
		}
	}

	function setSessionConfig(values: { autoApprove?: string; mode?: SessionMode }): void {
		// Establish config on the authoritative session state via the state
		// manager API. Mutating the object returned by `getSessionState` would
		// strand the change on a detached composite copy (session merged with
		// its default chat). `agentService` registers the schema at session
		// creation time; tests bypass that wiring with this direct set.
		stateManager.setSessionConfig(sessionKey, {
			schema: {
				type: 'object',
				properties: {
					[SessionConfigKey.AutoApprove]: { type: 'string', title: 'Approvals', enum: ['default', 'autoApprove', 'autopilot'], default: 'default' },
					[SessionConfigKey.Mode]: { type: 'string', title: 'Mode', enum: ['interactive', 'plan', 'autopilot'], default: 'interactive' },
				},
			},
			values: {
				...(values.autoApprove === undefined ? {} : { [SessionConfigKey.AutoApprove]: values.autoApprove }),
				...(values.mode === undefined ? {} : { [SessionConfigKey.Mode]: values.mode }),
			},
		});
	}

	function startTurn(turnId: string, text = 'hello', modelId?: string, chatUri = defaultChatUri, clientContext?: IAgentHostClientTelemetryContext): void {
		const action: ChatAction = {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text, origin: { kind: MessageKind.User }, model: modelId ? { id: modelId } : undefined },
		};
		// Dispatch into the state manager so `getActiveTurnId` returns the
		// active turn (the progress-listener path relies on this) and then
		// invoke `handleAction` so the side-effect (which calls
		// `agent.sendMessage` and `turnTracker.turnStarted`) runs.
		stateManager.dispatchClientAction(chatUri, action, { clientId: 'test', clientSeq: 1 });
		sideEffects.handleAction(chatUri, action, 'test', clientContext);
	}

	/**
	 * Starts a turn the way the host does for its own messages (Agent Merge
	 * prompts): a server action, with no initiating client.
	 */
	function startHostTurn(turnId: string, message: Message, chatUri = defaultChatUri): void {
		const action: ChatAction = { type: ActionType.ChatTurnStarted, turnId, startedAt: '2025-01-01T00:00:00.000Z', message };
		stateManager.dispatchServerAction(chatUri, action);
		sideEffects.handleAction(chatUri, action);
	}

	function fire(action: ChatAction, chatUri = defaultChatUri): void {
		agent.fireProgress({ kind: 'action', resource: URI.parse(chatUri), action });
	}

	function fireModelCallCompleted(turnId: string, modelCallId: string, chatUri = defaultChatUri): void {
		agent.fireProgress({ kind: 'model_call_completed', resource: URI.parse(chatUri), turnId, modelCallId });
	}

	function fireModelCallFinished(turnId: string, modelCallId: string, dispatchDurationMs: number, outcome: AgentModelCallFinishedOutcome, containsBuiltInFileEditRequest?: boolean, parentToolCallId?: string): void {
		agent.fireProgress({
			kind: 'model_call_finished',
			resource: URI.parse(defaultChatUri),
			turnId,
			modelCallId,
			dispatchDurationMs,
			outcome,
			containsBuiltInFileEditRequest,
			editClassifierVersion: 1,
			parentToolCallId,
		});
	}

	function completedEvents(): { eventName: string; data: unknown }[] {
		return telemetry.events.filter(e => e.eventName === 'agentHost.turnCompleted');
	}

	function capturedModel(data: Record<string, unknown>): { trusted: boolean; value: unknown } {
		const model = data.model;
		return model instanceof TelemetryTrustedValue ? { trusted: true, value: model.value } : { trusted: false, value: model };
	}

	function failedEvents(): { eventName: string; data: unknown }[] {
		return telemetry.events.filter(e => e.eventName === 'agentHost.turnFailed');
	}

	setup(() => {
		agent = new MockAgent();
		disposables.add(toDisposable(() => agent.dispose()));
		stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const agentList = observableValue<readonly IAgent[]>('agents', [agent]);
		telemetry = new CapturingTelemetryService();

		logService = new NullLogService();
		const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const telemetryService = disposables.add(new AgentHostTelemetryService(telemetry));
		const sessionDataService = createNullSessionDataService();
		const customizationEnablementService: IAgentHostCustomizationEnablementService = {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			initializeSession: async () => { },
			getWorkingDirectoryState: () => ({ kind: 'workspaceless' }),
			resolve: () => ({ kind: 'resolved', enablement: [], enabled: true, workingDirectory: { kind: 'workspaceless' } }),
			applyClientGlobalEnablement: () => ({ kind: 'resolved', enablement: [], enabled: true, workingDirectory: { kind: 'workspaceless' } }),
			replaceEnablement: () => ({ kind: 'resolved', enablement: [], enabled: true, workingDirectory: { kind: 'workspaceless' } }),
			setEnablement: () => ({ kind: 'resolved', enablement: [], enabled: true, workingDirectory: { kind: 'workspaceless' } }),
			whenIdle: async () => { },
		};
		const services = new ServiceCollection(
			[ILogService, logService],
			[IAgentConfigurationService, configService],
			[IAgentHostChangesetService, new FakeChangesetService()],
			[IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
			[IAgentHostGitStateService, createNoopGitStateService()],
			[IAgentHostStateManager, stateManager],
			[ITelemetryService, telemetryService],
			[IAgentHostTerminalManager, disposables.add(new TestAgentHostTerminalManager())],
			[ISessionDataService, sessionDataService],
			[IAgentHostWorktreeIsolation, createNoopWorktreeIsolation()],
			[IAgentHostClientConnectionService, disposables.add(new AgentHostClientConnectionService())],
			[ISessionWorkspaceConversionService, {
				_serviceBrand: undefined,
				requestSessionWorkspaceUpdate: () => { },
				isPending: () => false,
				cancel: () => { },
				updateSessionWorkspace: async () => { },
			}],
		);
		const instantiationService = disposables.add(new InstantiationService(services, /*strict*/ true));
		const chatContributions = disposables.add(new AgentHostChatContributions(logService, instantiationService));
		services.set(IAgentHostChatContributions, chatContributions);
		services.set(IAgentHostTurnService, new AgentHostTurnService(stateManager, chatContributions, instantiationService));
		services.set(IAgentHostSessionTitleController, disposables.add(new AgentHostSessionTitleController(stateManager, { sessionDataService }, logService)));
		services.set(IAgentHostProviderService, createTestAgentHostProviderService(() => agent));
		const telemetryReporter = new AgentHostTelemetryReporter(telemetryService);
		services.set(IAgentHostTelemetryReporter, telemetryReporter);
		turnTracker = disposables.add(instantiationService.createInstance(AgentHostTurnTracker));
		services.set(IAgentHostTurnTracker, turnTracker);
		services.set(IAgentHostToolCallTracker, disposables.add(instantiationService.createInstance(AgentHostToolCallTracker)));
		const localTurns = new AgentHostLocalTurns(sessionDataService, logService);
		services.set(IAgentHostLocalTurns, localTurns);
		const localCommands = disposables.add(instantiationService.createInstance(AgentHostLocalCommands));
		services.set(IAgentHostLocalCommands, localCommands);
		disposables.add(registerBuiltInChatContributions(chatContributions));
		sideEffects = disposables.add(instantiationService.createInstance(AgentSideEffects, stateManager, customizationEnablementService, {
			getAgent: () => agent,
			agents: agentList,
			sessionDataService,
			localTurns,
		}));
		// Wire the agent's progress signals through side-effects (this is how
		// progress actions reach the state manager in production).
		disposables.add(sideEffects.registerProgressListener(agent));
	});

	teardown(() => {
		disposables.clear();
		sinon.restore();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('emits turnCompleted with timing and turn-start context on success', () => {
		setupSession(true, undefined, true);
		agent.setModels([{ provider: 'mock', id: 'gpt-5.5', name: 'GPT 5.5', supportsVision: false }]);
		setSessionConfig({ autoApprove: 'autopilot', mode: 'interactive' });
		startTurn('turn-1', 'hello', 'gpt-5.5');

		fire({ type: ActionType.ChatResponsePart, turnId: 'turn-1', part: { kind: ResponsePartKind.Markdown, id: 'p1', content: 'hi' } });
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 });

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		const data = events[0].data as Record<string, unknown>;
		assert.strictEqual(data.provider, 'mock');
		assert.strictEqual(data.agentSessionId, 'session-1');
		assert.strictEqual(data.chatSessionId, getTelemetryChatSessionId(defaultChatUri));
		assert.strictEqual(data.turnId, 'turn-1');
		assert.strictEqual(data.parentTurnId, undefined);
		assert.strictEqual(data.result, 'success');
		assert.deepStrictEqual(capturedModel(data), { trusted: true, value: 'gpt-5.5' });
		assert.strictEqual(data.modelSelectionKind, 'explicit');
		assert.strictEqual(data.permissionLevel, 'autopilot');
		assert.strictEqual(data.isSubagentSession, false);
		assert.strictEqual(data.isBYOK, false);
		assert.strictEqual(data.interactionMode, 'interactive');
		assert.strictEqual(data.messageOriginKind, 'inline');
		assert.strictEqual(typeof data.totalTime, 'number');
		assert.strictEqual(typeof data.timeToFirstProgress, 'number');
		assert.strictEqual(data.isMultiRoot, false);
		assert.strictEqual(data.folderCount, 0);
		assert.strictEqual((telemetry.events.find(event => event.eventName === 'agentHost.userMessageSent')?.data as Record<string, unknown>).messageOriginKind, 'inline');
	});

	test('attributes completed and failed turns to the initiating client identity', () => {
		setupSession();
		const clientContext: IAgentHostClientTelemetryContext = {
			clientType: AgentHostClientType.EditorWindow,
			connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
			transportKind: AgentHostTransportKind.MessagePort,
			hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
			machineId: 'client-machine-id',
			devDeviceId: 'client-dev-device-id',
		};
		startTurn('t-client', 'hello', undefined, defaultChatUri, clientContext);
		fire({ type: ActionType.ChatError, turnId: 't-client', duration: 100, part: createErrorResponsePart({ errorType: 'providerFailed', message: 'failed' }) });

		assert.deepStrictEqual([completedEvents()[0], failedEvents()[0]].map(event => {
			const data = event.data as Record<string, unknown>;
			return {
				eventName: event.eventName,
				initiatorClientType: data.initiatorClientType,
				initiatorConnectionKind: data.initiatorConnectionKind,
				initiatorTransportKind: data.initiatorTransportKind,
				hostLaunchKind: data.hostLaunchKind,
				messageOriginKind: data.messageOriginKind,
				initiatorMachineId: data.initiatorMachineId,
				initiatorDevDeviceId: data.initiatorDevDeviceId,
			};
		}), [{
			eventName: 'agentHost.turnCompleted',
			initiatorClientType: 'editor_window',
			initiatorConnectionKind: 'remote_extension_host',
			initiatorTransportKind: 'message_port',
			hostLaunchKind: 'vscode_main_process',
			messageOriginKind: 'user',
			initiatorMachineId: 'client-machine-id',
			initiatorDevDeviceId: 'client-dev-device-id',
		}, {
			eventName: 'agentHost.turnFailed',
			initiatorClientType: 'editor_window',
			initiatorConnectionKind: 'remote_extension_host',
			initiatorTransportKind: 'message_port',
			hostLaunchKind: 'vscode_main_process',
			messageOriginKind: 'user',
			initiatorMachineId: 'client-machine-id',
			initiatorDevDeviceId: 'client-dev-device-id',
		}]);
	});

	test('reports the actor that started the turn, separating Agent Merge from user turns', () => {
		setupSession();
		startTurn('turn-user');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-user', duration: 1000 });
		startHostTurn('turn-agent-merge', { text: 'fix the failed required checks', origin: { kind: MessageKind.SystemNotification }, _meta: toAgentMergeMessageMeta() });
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-agent-merge', duration: 1000 });

		assert.deepStrictEqual(completedEvents().map(event => {
			const data = event.data as Record<string, unknown>;
			return { turnId: data.turnId, messageOriginKind: data.messageOriginKind };
		}), [
			{ turnId: 'turn-user', messageOriginKind: 'user' },
			{ turnId: 'turn-agent-merge', messageOriginKind: 'agentMerge' },
		]);
	});

	test('counts unique completed model responses on the turn', () => {
		setupSession();
		startTurn('turn-model-calls');

		fireModelCallCompleted('turn-model-calls', 'call-1');
		fireModelCallCompleted('turn-model-calls', 'call-1');
		fireModelCallCompleted('turn-model-calls', 'call-2');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-model-calls', duration: 1000 });

		assert.strictEqual((completedEvents()[0].data as Record<string, unknown>).modelCallCount, 2);
	});

	test('sums dispatched attempts through the first accepted edit request', () => {
		setupSession();
		startTurn('turn-first-edit');

		fireModelCallFinished('turn-first-edit', 'call-error', 120, 'error');
		fireModelCallFinished('turn-first-edit', 'call-rejected', 80, 'rejected');
		fireModelCallFinished('turn-first-edit', 'call-read', 200, 'success', false);
		fireModelCallFinished('turn-first-edit', 'call-edit', 300, 'success', true);
		fireModelCallFinished('turn-first-edit', 'call-after-edit', 500, 'success', false);
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-first-edit', duration: 1000 });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.strictEqual(data.timeToFirstEdit, 700);
		assert.strictEqual(data.timeToFirstEditClassifierVersion, 1);
		assert.strictEqual(data.modelCallCount, 0);
	});

	test('tracks provider-promoted steering turns without sending their messages again', async () => {
		setupSession();
		setSessionConfig({ autoApprove: 'autopilot', mode: 'interactive' });
		startTurn('turn-original');
		await new Promise(resolve => setTimeout(resolve, 0));
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-original', duration: 1000 });

		for (const turnId of ['turn-steering-1', 'turn-steering-2']) {
			fire({
				type: ActionType.ChatTurnStarted,
				turnId,
				startedAt: new Date().toISOString(),
				message: { text: 'edit the file', origin: { kind: MessageKind.User } },
				queuedMessageId: `queued-${turnId}`,
			});
			fireModelCallFinished(turnId, `call-${turnId}`, 250, 'success', true);
			fire({ type: ActionType.ChatTurnComplete, turnId, duration: 1000 });
		}
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({
			sentPrompts: agent.sendMessageCalls.map(call => call.prompt),
			completed: completedEvents().map(event => {
				const data = event.data as Record<string, unknown>;
				return {
					turnId: data.turnId,
					timeToFirstEdit: data.timeToFirstEdit,
					hostLaunchKind: data.hostLaunchKind,
					permissionLevel: data.permissionLevel,
					interactionMode: data.interactionMode,
					messageOriginKind: data.messageOriginKind,
				};
			}),
		}, {
			sentPrompts: ['hello'],
			completed: ['turn-original', 'turn-steering-1', 'turn-steering-2'].map(turnId => ({
				turnId,
				timeToFirstEdit: turnId === 'turn-original' ? undefined : 250,
				hostLaunchKind: undefined,
				permissionLevel: 'autopilot',
				interactionMode: 'interactive',
				messageOriginKind: 'user',
			})),
		});
	});

	test('deduplicates model-call attempts and leaves time to first edit absent when no edit is requested', () => {
		setupSession();
		startTurn('turn-no-edit');

		fireModelCallFinished('turn-no-edit', 'call-1', 100, 'cancelled');
		fireModelCallFinished('turn-no-edit', 'call-1', 100, 'cancelled');
		fireModelCallFinished('turn-no-edit', 'call-2', 200, 'success', false);
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-no-edit', duration: 1000 });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.strictEqual(data.timeToFirstEdit, undefined);
		assert.strictEqual(data.timeToFirstEditClassifierVersion, undefined);
	});

	test('does not attribute a stale model-call attempt to the active turn', () => {
		setupSession();
		startTurn('turn-finished-old');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-finished-old', duration: 1000 });
		startTurn('turn-finished-active');

		fireModelCallFinished('turn-finished-old', 'late-edit', 100, 'success', true);
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-finished-active', duration: 1000 });

		assert.deepStrictEqual(completedEvents().map(event => {
			const data = event.data as Record<string, unknown>;
			return { turnId: data.turnId, timeToFirstEdit: data.timeToFirstEdit };
		}), [
			{ turnId: 'turn-finished-old', timeToFirstEdit: undefined },
			{ turnId: 'turn-finished-active', timeToFirstEdit: undefined },
		]);
	});

	test('request token availability is independent of success, failure, cancellation and missing snapshots', () => {
		setupSession();
		const observed: IAgentTurnTokenUsage = {
			summaries: [{
				model: 'gpt-5.5', usageScope: 'direct-model', usageStatus: 'partial',
				usageRecordCount: 1, inputKnownRecordCount: 1, outputKnownRecordCount: 0, cacheKnownRecordCount: 0,
				knownInputTokens: 0,
			}]
		};
		const reads: string[] = [];
		Object.assign(agent, {
			getTurnTokenUsage: (_chat: URI, turnId: string) => {
				reads.push(turnId);
				return turnId === 'missing' ? undefined : observed;
			}
		});
		for (const turnId of ['success', 'failure', 'cancel', 'missing']) {
			startTurn(turnId);
			if (turnId === 'failure') {
				fire({ type: ActionType.ChatError, turnId, duration: 1, part: createErrorResponsePart({ errorType: 'test', message: 'failed' }) });
			} else if (turnId === 'cancel') {
				fire({ type: ActionType.ChatTurnCancelled, turnId, duration: 1 });
			} else {
				fire({ type: ActionType.ChatTurnComplete, turnId, duration: 1 });
			}
			fire({ type: ActionType.ChatTurnComplete, turnId, duration: 1 });
		}
		assert.deepStrictEqual(reads, ['success', 'failure', 'cancel', 'missing']);
		assert.deepStrictEqual(telemetry.events.filter(e => e.eventName === 'agentHost.requestTokenUsage').map(e => {
			const data = e.data as Record<string, unknown>;
			assert.strictEqual(Object.hasOwn(data, 'knownOutputTokens'), false);
			assert.strictEqual(Object.hasOwn(data, 'completedModelCallCount'), false);
			return [data.requestId, data.result, data.usageStatus, data.usageRecordCount, data.knownInputTokens];
		}), [
			['success', 'success', 'partial', 1, 0],
			['failure', 'error', 'partial', 1, 0],
			['cancel', 'cancelled', 'partial', 1, 0],
			['missing', 'success', 'notReported', 0, undefined],
		]);
	});

	for (const result of ['success', 'error', 'cancelled'] as const) {
		test(`excludes token summary collection and reporting from ${result} completion timing`, () => {
			let elapsed = 100;
			sinon.stub(StopWatch.prototype, 'elapsed').callsFake(() => elapsed);
			const order: string[] = [];
			Object.assign(agent, {
				getTurnTokenUsage: (): IAgentTurnTokenUsage => {
					order.push('snapshot');
					elapsed += 5000;
					return {
						summaries: [{
							usageScope: 'direct-model', usageStatus: 'partial',
							usageRecordCount: 1, inputKnownRecordCount: 1, outputKnownRecordCount: 0, cacheKnownRecordCount: 0,
							knownInputTokens: 12,
						}]
					};
				}
			});
			telemetry.publicLog2 = (eventName, data) => {
				if (eventName === 'agentHost.requestTokenUsage') {
					elapsed += 4000;
				}
				if (eventName === 'agentHost.turnCompleted' || eventName === 'agentHost.requestTokenUsage') {
					order.push(eventName);
				}
				telemetry.events.push({ eventName, data });
			};
			turnTracker.turnStarted(agent, defaultChatUri, 'slow-summary', undefined, undefined, 'default', undefined, undefined);
			const completed = turnTracker.turnCompleted(defaultChatUri, 'slow-summary', result);
			const summary = telemetry.events.find(event => event.eventName === 'agentHost.requestTokenUsage')?.data as Record<string, unknown>;
			assert.deepStrictEqual({
				completed,
				order,
				elapsed,
				completions: completedEvents().map(event => {
					const data = event.data as Record<string, unknown>;
					return { result: data.result, totalTime: data.totalTime };
				}),
				summary: { result: summary.result, knownInputTokens: summary.knownInputTokens },
			}, {
				completed: true,
				order: ['snapshot', 'agentHost.turnCompleted', 'agentHost.requestTokenUsage'],
				elapsed: 9100,
				completions: [{ result, totalTime: 100 }],
				summary: { result, knownInputTokens: 12 },
			});
		});

		test(`logs token summary reporting failures without interrupting ${result} completion`, () => {
			const errors: Array<string | Error> = [];
			Object.assign(logService, { error: (message: string | Error) => errors.push(message) });
			Object.assign(agent, { getTurnTokenUsage: (): IAgentTurnTokenUsage => ({ summaries: [] }) });
			telemetry.publicLog2 = (eventName, data) => {
				if (eventName === 'agentHost.requestTokenUsage') {
					throw new Error('summary reporting failed');
				}
				telemetry.events.push({ eventName, data });
			};
			turnTracker.turnStarted(agent, defaultChatUri, 'failed-summary', undefined, undefined, 'default', undefined, undefined);
			const completed = turnTracker.turnCompleted(defaultChatUri, 'failed-summary', result);
			const completedAgain = turnTracker.turnCompleted(defaultChatUri, 'failed-summary', result);
			assert.deepStrictEqual({
				completed,
				completedAgain,
				errors,
				results: completedEvents().map(event => (event.data as Record<string, unknown>).result),
			}, {
				completed: true,
				completedAgain: false,
				errors: ['[AgentHostTurnTracker] Failed to report provider token usage for provider=mock: summary reporting failed'],
				results: [result],
			});
		});
	}

	test('logs provider usage snapshot failures without changing terminal outcome or inventing counters', () => {
		setupSession();
		const errors: Array<string | Error> = [];
		Object.assign(logService, { error: (message: string | Error) => errors.push(message) });
		Object.assign(agent, { getTurnTokenUsage: () => { throw new Error('snapshot failed'); } });
		startTurn('failed-snapshot');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'failed-snapshot', duration: 1 });
		const event = telemetry.events.find(event => event.eventName === 'agentHost.requestTokenUsage')?.data as Record<string, unknown>;
		assert.deepStrictEqual({
			errors,
			result: event.result,
			usageStatus: event.usageStatus,
			hasInput: Object.hasOwn(event, 'knownInputTokens'),
			completedResult: (completedEvents()[0].data as Record<string, unknown>).result,
		}, {
			errors: ['[AgentHostTurnTracker] Failed to collect provider token usage for provider=mock: snapshot failed'],
			result: 'success',
			usageStatus: 'notReported',
			hasInput: false,
			completedResult: 'success',
		});
	});

	test('reads child usage from the exact provider chat while emitting canonical child identity', () => {
		const providerChat = URI.parse(defaultChatUri);
		const childChat = buildSubagentChatUri(sessionUri, 'child-tool');
		const reads: Array<[string, string, string | undefined]> = [];
		Object.assign(agent, {
			getTurnTokenUsage: (chat: URI, turnId: string, parentToolCallId?: string): IAgentTurnTokenUsage => {
				reads.push([chat.toString(), turnId, parentToolCallId]);
				return {
					summaries: [{
						model: 'gpt-5.5', usageScope: 'direct-model', usageStatus: 'partial',
						usageRecordCount: 1, inputKnownRecordCount: 1, outputKnownRecordCount: 0, cacheKnownRecordCount: 0,
						knownInputTokens: 12,
					}]
				};
			}
		});
		turnTracker.turnStarted(agent, childChat, 'child-turn', undefined, undefined, 'default', undefined, undefined,
			undefined, undefined, 'root-turn', 'child-tool', undefined, undefined, providerChat);
		turnTracker.turnCompleted(childChat, 'child-turn', 'success');
		const event = telemetry.events.find(event => event.eventName === 'agentHost.requestTokenUsage')?.data as Record<string, unknown>;
		assert.deepStrictEqual({
			reads,
			requestId: event.requestId,
			chatSessionId: event.chatSessionId,
			parentTurnId: event.parentTurnId,
			parentToolCallId: event.parentToolCallId,
			isSubagentSession: event.isSubagentSession,
			knownInputTokens: event.knownInputTokens,
		}, {
			reads: [[providerChat.toString(), 'child-turn', 'child-tool']],
			requestId: 'child-turn',
			chatSessionId: getTelemetryChatSessionId(childChat),
			parentTurnId: 'root-turn',
			parentToolCallId: 'child-tool',
			isSubagentSession: true,
			knownInputTokens: 12,
		});
	});

	test('does not attribute a stale model response to the active turn', () => {
		setupSession();
		startTurn('turn-old');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-old', duration: 1000 });
		fireModelCallCompleted('turn-old', 'late-call-while-idle');
		startTurn('turn-active');

		fireModelCallCompleted('turn-old', 'late-call');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-active', duration: 1000 });

		assert.deepStrictEqual({
			completed: completedEvents().map(event => {
				const data = event.data as Record<string, unknown>;
				return { turnId: data.turnId, modelCallCount: data.modelCallCount };
			}),
			correlations: agent.modelCallTurnCorrelationCalls.map(call => ({
				chat: call.chat.toString(), modelCallId: call.modelCallId, turnId: call.turnId,
			})),
		}, {
			completed: [
				{ turnId: 'turn-old', modelCallCount: 0 },
				{ turnId: 'turn-active', modelCallCount: 0 },
			],
			correlations: [
				{ chat: defaultChatUri, modelCallId: 'late-call-while-idle', turnId: 'turn-old' },
				{ chat: defaultChatUri, modelCallId: 'late-call', turnId: 'turn-old' },
			],
		});
	});

	test('attributes subagent model responses only to the subagent turn', () => {
		setupSession();
		setSessionConfig({ mode: 'plan' });
		startTurn('turn-parent');
		const subagentChatUri = buildSubagentChatUri(sessionUri, 'call-subagent');
		stateManager.addChat(sessionKey, subagentChatUri);
		fire({
			type: ActionType.ChatToolCallStart,
			turnId: 'turn-parent',
			toolCallId: 'call-subagent',
			toolName: 'task',
			displayName: 'Task',
		});
		agent.fireProgress({
			kind: 'subagent_started',
			chat: URI.parse(defaultChatUri),
			toolCallId: 'call-subagent',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			taskModelSource: 'task_argument',
		});

		const subagentTurnId = stateManager.getActiveTurnId(subagentChatUri);
		assert.ok(subagentTurnId);
		agent.fireProgress({
			kind: 'model_call_completed',
			resource: URI.parse(defaultChatUri),
			turnId: 'turn-parent',
			modelCallId: 'subagent-model-call',
			parentToolCallId: 'call-subagent',
		});
		fire({ type: ActionType.ChatTurnComplete, turnId: subagentTurnId, duration: 1000 }, subagentChatUri);
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-parent', duration: 1000 });

		assert.deepStrictEqual({
			completed: completedEvents().map(event => {
				const data = event.data as Record<string, unknown>;
				return { isSubagentSession: data.isSubagentSession, interactionMode: data.interactionMode, modelCallCount: data.modelCallCount, subagentTaskModelSource: data.subagentTaskModelSource };
			}),
			correlations: agent.modelCallTurnCorrelationCalls.map(({ chat, ...correlation }) => ({ chat: chat.toString(), ...correlation })),
		}, {
			completed: [
				{ isSubagentSession: true, interactionMode: 'plan', modelCallCount: 1, subagentTaskModelSource: 'task_argument' },
				{ isSubagentSession: false, interactionMode: 'plan', modelCallCount: 0, subagentTaskModelSource: undefined },
			],
			correlations: [{
				chat: defaultChatUri,
				modelCallId: 'subagent-model-call',
				turnId: subagentTurnId,
			}],
		});
	});

	test('attributes subagent model-call attempt durations only to the subagent turn', () => {
		setupSession();
		startTurn('turn-parent-finished');
		const subagentChatUri = buildSubagentChatUri(sessionUri, 'call-subagent-finished');
		stateManager.addChat(sessionKey, subagentChatUri);
		fire({
			type: ActionType.ChatToolCallStart,
			turnId: 'turn-parent-finished',
			toolCallId: 'call-subagent-finished',
			toolName: 'task',
			displayName: 'Task',
		});
		agent.fireProgress({
			kind: 'subagent_started',
			chat: URI.parse(defaultChatUri),
			toolCallId: 'call-subagent-finished',
			agentName: 'explore',
			agentDisplayName: 'Explore',
		});

		const subagentTurnId = stateManager.getActiveTurnId(subagentChatUri);
		assert.ok(subagentTurnId);
		fireModelCallFinished('turn-parent-finished', 'subagent-call-1', 150, 'error', undefined, 'call-subagent-finished');
		fireModelCallFinished('turn-parent-finished', 'subagent-call-2', 250, 'success', true, 'call-subagent-finished');
		fire({ type: ActionType.ChatTurnComplete, turnId: subagentTurnId, duration: 1000 }, subagentChatUri);
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-parent-finished', duration: 1000 });

		assert.deepStrictEqual(completedEvents().map(event => {
			const data = event.data as Record<string, unknown>;
			return { isSubagentSession: data.isSubagentSession, timeToFirstEdit: data.timeToFirstEdit };
		}), [
			{ isSubagentSession: true, timeToFirstEdit: 400 },
			{ isSubagentSession: false, timeToFirstEdit: undefined },
		]);
	});

	test('correlates first-level and nested subagent turns with their immediate parent', () => {
		setupSession();
		startTurn('turn-parent');

		const level1ChatUri = buildSubagentChatUri(sessionUri, 'call-level-1');
		stateManager.addChat(sessionKey, level1ChatUri);
		agent.fireProgress({
			kind: 'subagent_started',
			chat: URI.parse(defaultChatUri),
			toolCallId: 'call-level-1',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			taskModelSource: 'subagent_configuration',
		});
		const level1TurnId = stateManager.getActiveTurnId(level1ChatUri);
		assert.ok(level1TurnId);

		const level2ChatUri = buildSubagentChatUri(sessionUri, 'call-level-2');
		stateManager.addChat(sessionKey, level2ChatUri);
		agent.fireProgress({
			kind: 'subagent_started',
			chat: URI.parse(defaultChatUri),
			toolCallId: 'call-level-2',
			parentToolCallId: 'call-level-1',
			agentName: 'explore',
			agentDisplayName: 'Explore',
			taskModelSource: 'custom_agent_definition',
		});
		const level2TurnId = stateManager.getActiveTurnId(level2ChatUri);
		assert.ok(level2TurnId);

		const directUsage = (turnId: string, inputTokens: number): ChatUsageAction => ({
			type: ActionType.ChatUsage,
			turnId,
			usage: {
				_meta: {
					directTurnTokenTotals: [{ model: 'gpt-5.5', inputTokens, cachedTokens: 0, outputTokens: 1 }],
				},
			},
		});
		fire(directUsage('turn-parent', 10));
		fire(directUsage(level1TurnId, 20), level1ChatUri);
		fire(directUsage(level2TurnId, 30), level2ChatUri);
		const observedByTurn = new Map<string, number>([['turn-parent', 10], [level1TurnId, 20], [level2TurnId, 30]]);
		const ownershipReads: Array<[string, string | undefined]> = [];
		Object.assign(agent, {
			getTurnTokenUsage: (_chat: URI, turnId: string, parentToolCallId?: string): IAgentTurnTokenUsage | undefined => {
				ownershipReads.push([turnId, parentToolCallId]);
				const input = observedByTurn.get(turnId);
				return input === undefined ? undefined : {
					summaries: [{
						model: 'gpt-5.5', usageScope: 'direct-model', usageStatus: 'partial',
						usageRecordCount: 1, inputKnownRecordCount: 1, outputKnownRecordCount: 0, cacheKnownRecordCount: 0,
						knownInputTokens: input,
					}]
				};
			}
		});

		fire({ type: ActionType.ChatTurnComplete, turnId: level2TurnId, duration: 1000 }, level2ChatUri);
		agent.fireProgress({
			kind: 'subagent_resumed',
			chat: URI.parse(defaultChatUri),
			toolCallId: 'call-level-2',
		});
		const resumedLevel2TurnId = stateManager.getActiveTurnId(level2ChatUri);
		assert.ok(resumedLevel2TurnId);
		fire({ type: ActionType.ChatTurnComplete, turnId: resumedLevel2TurnId, duration: 1000 }, level2ChatUri);
		fire({ type: ActionType.ChatTurnComplete, turnId: level1TurnId, duration: 1000 }, level1ChatUri);
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-parent', duration: 1000 });

		assert.deepStrictEqual(completedEvents().map(event => {
			const data = event.data as Record<string, unknown>;
			return {
				turnId: data.turnId,
				parentTurnId: data.parentTurnId,
				parentToolCallId: data.parentToolCallId,
				directPromptTokenCount: data.directPromptTokenCount,
				subagentTaskModelSource: data.subagentTaskModelSource,
			};
		}), [
			{ turnId: level2TurnId, parentTurnId: level1TurnId, parentToolCallId: 'call-level-2', directPromptTokenCount: 30, subagentTaskModelSource: 'custom_agent_definition' },
			{ turnId: resumedLevel2TurnId, parentTurnId: level1TurnId, parentToolCallId: 'call-level-2', directPromptTokenCount: undefined, subagentTaskModelSource: 'custom_agent_definition' },
			{ turnId: level1TurnId, parentTurnId: 'turn-parent', parentToolCallId: 'call-level-1', directPromptTokenCount: 20, subagentTaskModelSource: 'subagent_configuration' },
			{ turnId: 'turn-parent', parentTurnId: undefined, parentToolCallId: undefined, directPromptTokenCount: 10, subagentTaskModelSource: undefined },
		]);
		assert.deepStrictEqual(telemetry.events.filter(e => e.eventName === 'agentHost.requestTokenUsage').map(e => {
			const row = e.data as Record<string, unknown>;
			return [row.requestId, row.parentTurnId, row.parentToolCallId, row.knownInputTokens, row.usageStatus];
		}), [
			[level2TurnId, level1TurnId, 'call-level-2', 30, 'partial'],
			[resumedLevel2TurnId, level1TurnId, 'call-level-2', undefined, 'notReported'],
			[level1TurnId, 'turn-parent', 'call-level-1', 20, 'partial'],
			['turn-parent', undefined, undefined, 10, 'partial'],
		]);
		assert.deepStrictEqual(ownershipReads, [
			[level2TurnId, 'call-level-2'], [resumedLevel2TurnId, 'call-level-2'],
			[level1TurnId, 'call-level-1'], ['turn-parent', undefined],
		]);
	});

	test('omits subagent parent correlation when the immediate parent is unavailable', () => {
		setupSession();
		startTurn('turn-parent');

		const childChatUri = buildSubagentChatUri(sessionUri, 'call-orphaned-child');
		stateManager.addChat(sessionKey, childChatUri);
		agent.fireProgress({
			kind: 'subagent_started',
			chat: URI.parse(defaultChatUri),
			toolCallId: 'call-orphaned-child',
			parentToolCallId: 'unknown-parent-call',
			agentName: 'explore',
			agentDisplayName: 'Explore',
		});
		const childTurnId = stateManager.getActiveTurnId(childChatUri);
		assert.ok(childTurnId);
		fire({ type: ActionType.ChatTurnComplete, turnId: childTurnId, duration: 1000 }, childChatUri);

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.strictEqual(data.parentTurnId, undefined);
		assert.strictEqual(data.parentToolCallId, 'call-orphaned-child');
	});

	test('emits turnCompleted with the multi-root working-directory shape', () => {
		setupSession(true, ['file:///work/app', 'file:///work/api']);
		startTurn('turn-mr', 'hello');

		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-mr', duration: 1000 });

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		const data = events[0].data as Record<string, unknown>;
		assert.strictEqual(data.isMultiRoot, true);
		assert.strictEqual(data.folderCount, 2);
	});

	test('uses generic model values for BYOK and unknown selections', () => {
		setupSession();
		agent.setModels([{
			provider: 'mock',
			id: 'openrouter/private-model',
			name: 'Private Model',
			supportsVision: false,
			_meta: createAgentModelByokMeta('openrouter/private-model'),
		}]);

		startTurn('turn-byok', 'hello', 'openrouter/private-model');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-byok', duration: 1000 });
		startTurn('turn-unknown', 'hello', 'unadvertised/private-model');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-unknown', duration: 1000 });
		agent.chatModel = { id: 'openrouter/private-model' };
		startTurn('turn-default');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-default', duration: 1000 });

		assert.deepStrictEqual(completedEvents().map(event => {
			const data = event.data as Record<string, unknown>;
			return { model: data.model, modelSelectionKind: data.modelSelectionKind, isBYOK: data.isBYOK };
		}), [
			{ model: 'byokModel', modelSelectionKind: 'explicit', isBYOK: true },
			{ model: 'unknown', modelSelectionKind: 'explicit', isBYOK: false },
			{ model: 'byokModel', modelSelectionKind: 'default', isBYOK: true },
		]);
	});

	test('uses the resolved usage model while preserving Auto selection', () => {
		setupSession();
		agent.setModels([
			{ provider: 'mock', id: 'auto', name: 'Auto', supportsVision: false },
			{ provider: 'mock', id: 'gpt-5.5', name: 'GPT 5.5', supportsVision: false },
		]);
		startTurn('turn-auto', 'hello', 'auto');

		fire({ type: ActionType.ChatUsage, turnId: 'turn-auto', usage: { model: 'gpt-5.5' } });
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-auto', duration: 1000 });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.deepStrictEqual({
			model: capturedModel(data),
			modelSelectionKind: data.modelSelectionKind,
		}, {
			model: { trusted: true, value: 'gpt-5.5' },
			modelSelectionKind: 'auto',
		});
	});

	test('uses the concrete provider default across turn outcomes while preserving Default selection', () => {
		setupSession();
		agent.setModels([{ provider: 'mock', id: 'gpt-5.5', name: 'GPT 5.5', supportsVision: false }]);
		agent.chatModel = { id: 'gpt-5.5' };

		startTurn('turn-success');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-success', duration: 1000 });
		startTurn('turn-error');
		fire({ type: ActionType.ChatError, turnId: 'turn-error', duration: 1000, part: createErrorResponsePart({ errorType: 'oops', message: 'fail' }) });
		startTurn('turn-cancelled');
		fire({ type: ActionType.ChatTurnCancelled, turnId: 'turn-cancelled', duration: 1000 });

		assert.deepStrictEqual(completedEvents().map(event => {
			const data = event.data as Record<string, unknown>;
			return {
				model: capturedModel(data),
				modelSelectionKind: data.modelSelectionKind,
				result: data.result,
			};
		}), [
			{ model: { trusted: true, value: 'gpt-5.5' }, modelSelectionKind: 'default', result: 'success' },
			{ model: { trusted: true, value: 'gpt-5.5' }, modelSelectionKind: 'default', result: 'error' },
			{ model: { trusted: true, value: 'gpt-5.5' }, modelSelectionKind: 'default', result: 'cancelled' },
		]);
	});

	test('does not treat an Auto provider default as the effective model', () => {
		setupSession();
		agent.setModels([
			{ provider: 'mock', id: 'auto', name: 'Auto', supportsVision: false },
			{ provider: 'mock', id: 'gpt-5.5', name: 'GPT 5.5', supportsVision: false },
		]);
		agent.chatModel = { id: 'auto' };
		startTurn('turn-default');

		fire({ type: ActionType.ChatTurnCancelled, turnId: 'turn-default', duration: 1000 });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.deepStrictEqual({
			model: data.model,
			modelSelectionKind: data.modelSelectionKind,
		}, {
			model: undefined,
			modelSelectionKind: 'default',
		});
	});

	test('timeToFirstProgress is undefined when no visible progress arrives before completion', () => {
		setupSession();
		startTurn('turn-1');

		// Usage is not a "visible progress" action — it should not mark first progress.
		fire({ type: ActionType.ChatUsage, turnId: 'turn-1', usage: { inputTokens: 1, outputTokens: 1 } });
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.strictEqual(data.timeToFirstProgress, undefined);
	});

	test('reports the latest per-turn billed nano-AIU from usage updates when available', () => {
		setupSession();
		startTurn('turn-1');

		fire({ type: ActionType.ChatUsage, turnId: 'turn-1', usage: { _meta: { copilotUsage: { totalNanoAiu: 1_500_000_000 } } } });
		fire({ type: ActionType.ChatUsage, turnId: 'turn-1', usage: { inputTokens: 10, outputTokens: 5, _meta: { copilotUsage: { totalNanoAiu: 2_000_000_000 } } } });
		fire({ type: ActionType.ChatUsage, turnId: 'turn-1', usage: { inputTokens: 20, outputTokens: 10 } });
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 });

		assert.strictEqual((completedEvents()[0].data as Record<string, unknown>).billedNanoAiu, 2_000_000_000);
	});

	test('does not report billed nano-AIU when the provider does not supply it', () => {
		setupSession();
		startTurn('turn-1');

		fire({ type: ActionType.ChatUsage, turnId: 'turn-1', usage: { inputTokens: 10, outputTokens: 5 } });
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 });

		assert.strictEqual((completedEvents()[0].data as Record<string, unknown>).billedNanoAiu, undefined);
	});

	test('attributes billed nano-AIU only to the parent turn, which already includes subagent cost', () => {
		setupSession();
		const subagentChatUri = buildSubagentChatUri(sessionUri, 'tool-call-1');
		stateManager.addChat(sessionKey, subagentChatUri);

		startTurn('turn-parent');
		startTurn('turn-subagent', 'hello', undefined, subagentChatUri);

		// The parent aggregate already folds in the subagent's charge; the
		// subagent chat additionally reports its own component.
		fire({ type: ActionType.ChatUsage, turnId: 'turn-parent', usage: { _meta: { copilotUsage: { totalNanoAiu: 3_000_000_000 } } } });
		fire({ type: ActionType.ChatUsage, turnId: 'turn-subagent', usage: { _meta: { copilotUsage: { totalNanoAiu: 1_000_000_000 } } } }, subagentChatUri);

		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-subagent', duration: 1000 }, subagentChatUri);
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-parent', duration: 1000 });

		assert.deepStrictEqual(completedEvents().map(event => {
			const data = event.data as Record<string, unknown>;
			return { turnId: data.turnId, isSubagentSession: data.isSubagentSession, billedNanoAiu: data.billedNanoAiu };
		}), [
			{ turnId: 'turn-subagent', isSubagentSession: true, billedNanoAiu: undefined },
			{ turnId: 'turn-parent', isSubagentSession: false, billedNanoAiu: 3_000_000_000 },
		]);
	});

	test('reports non-overlapping direct usage snapshots for parent and subagent turns', () => {
		setupSession();
		const subagentChatUri = buildSubagentChatUri(sessionUri, 'tool-call-direct');
		stateManager.addChat(sessionKey, subagentChatUri);

		startTurn('turn-parent');
		startTurn('turn-subagent', 'hello', undefined, subagentChatUri);

		fire({
			type: ActionType.ChatUsage,
			turnId: 'turn-parent',
			usage: {
				_meta: {
					copilotUsage: { totalNanoAiu: 1_000 },
					directCopilotUsage: { totalNanoAiu: 400 },
					directTurnTokenTotals: [
						{ model: 'gpt-5.5', inputTokens: 100, cachedTokens: 60, outputTokens: 20 },
						{ model: 'gpt-5.5-mini', inputTokens: 30, cachedTokens: 10, outputTokens: 5 },
					],
				},
			},
		});
		fire({
			type: ActionType.ChatUsage,
			turnId: 'turn-subagent',
			usage: {
				_meta: {
					directCopilotUsage: { totalNanoAiu: 300 },
					directTurnTokenTotals: [
						{ model: 'gpt-5.5-mini', inputTokens: 70, cachedTokens: 20, outputTokens: 10 },
					],
				},
			},
		}, subagentChatUri);
		fire({
			type: ActionType.ChatUsage,
			turnId: 'turn-subagent',
			usage: {
				_meta: {
					directCopilotUsage: { totalNanoAiu: 600 },
					directTurnTokenTotals: [
						{ model: 'gpt-5.5-mini', inputTokens: 150, cachedTokens: 50, outputTokens: 25 },
					],
				},
			},
		}, subagentChatUri);

		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-subagent', duration: 1000 }, subagentChatUri);
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-parent', duration: 1000 });

		assert.deepStrictEqual(completedEvents().map(event => {
			const data = event.data as Record<string, unknown>;
			return {
				turnId: data.turnId,
				billedNanoAiu: data.billedNanoAiu,
				directBilledNanoAiu: data.directBilledNanoAiu,
				directPromptTokenCount: data.directPromptTokenCount,
				directPromptCacheTokenCount: data.directPromptCacheTokenCount,
				directCompletionTokenCount: data.directCompletionTokenCount,
			};
		}), [
			{
				turnId: 'turn-subagent',
				billedNanoAiu: undefined,
				directBilledNanoAiu: 600,
				directPromptTokenCount: 150,
				directPromptCacheTokenCount: 50,
				directCompletionTokenCount: 25,
			},
			{
				turnId: 'turn-parent',
				billedNanoAiu: 1_000,
				directBilledNanoAiu: 400,
				directPromptTokenCount: 130,
				directPromptCacheTokenCount: 70,
				directCompletionTokenCount: 25,
			},
		]);
	});

	test('emits result=cancelled on ChatTurnCancelled', () => {
		setupSession();
		startTurn('turn-1', 'hello', 'auto');
		fire({ type: ActionType.ChatTurnCancelled, turnId: 'turn-1', duration: 1000 });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.deepStrictEqual({
			model: capturedModel(data),
			result: data.result,
			modelSelectionKind: data.modelSelectionKind,
		}, { model: { trusted: true, value: 'auto' }, result: 'cancelled', modelSelectionKind: 'auto' });
	});

	test('emits result=error on ChatError', () => {
		setupSession();
		startTurn('turn-1');
		fire({ type: ActionType.ChatError, turnId: 'turn-1', duration: 1000, part: createErrorResponsePart({ errorType: 'oops', message: 'fail' }) });

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		assert.strictEqual((events[0].data as Record<string, unknown>).result, 'error');
		assert.strictEqual((events[0].data as Record<string, unknown>).errorType, 'oops');
	});

	test('correlates turn failure with chat and provider request identifiers', () => {
		setupSession();
		startTurn('turn-1');
		fire({
			type: ActionType.ChatError,
			turnId: 'turn-1',
			duration: 1000,
			part: createErrorResponsePart({
				errorType: 'quota',
				message: 'quota exceeded',
				_meta: {
					chatError: {
						fetchError: {
							requestId: 'provider-request-id',
							serverRequestId: 'service-request-id',
						},
					},
				},
			}),
		});

		assert.deepStrictEqual(failedEvents().map(event => {
			const data = event.data as Record<string, unknown>;
			return {
				agentSessionId: data.agentSessionId,
				chatSessionId: data.chatSessionId,
				isSubagentSession: data.isSubagentSession,
				turnId: data.turnId,
				providerCallId: data.providerCallId,
				serviceRequestId: data.serviceRequestId,
			};
		}), [{
			agentSessionId: 'session-1',
			chatSessionId: getTelemetryChatSessionId(defaultChatUri),
			isSubagentSession: false,
			turnId: 'turn-1',
			providerCallId: 'provider-request-id',
			serviceRequestId: 'service-request-id',
		}]);
	});

	test('reports subagent completion and failure without collapsing the chat identity', () => {
		setupSession();
		const subagentChatUri = buildSubagentChatUri(sessionUri, 'tool-call-1');
		stateManager.addChat(sessionKey, subagentChatUri);

		startTurn('subagent-complete', 'hello', undefined, subagentChatUri);
		fire({ type: ActionType.ChatTurnComplete, turnId: 'subagent-complete', duration: 1000 }, subagentChatUri);
		startTurn('subagent-failed', 'hello', undefined, subagentChatUri);
		fire({ type: ActionType.ChatError, turnId: 'subagent-failed', duration: 1000, part: createErrorResponsePart({ errorType: 'oops', message: 'fail' }) }, subagentChatUri);

		assert.deepStrictEqual({
			completed: completedEvents().map(event => {
				const data = event.data as Record<string, unknown>;
				return { turnId: data.turnId, agentSessionId: data.agentSessionId, chatSessionId: data.chatSessionId, isSubagentSession: data.isSubagentSession };
			}),
			failed: failedEvents().map(event => {
				const data = event.data as Record<string, unknown>;
				return { turnId: data.turnId, agentSessionId: data.agentSessionId, chatSessionId: data.chatSessionId, isSubagentSession: data.isSubagentSession };
			}),
		}, {
			completed: [
				{ turnId: 'subagent-complete', agentSessionId: 'session-1', chatSessionId: getTelemetryChatSessionId(subagentChatUri), isSubagentSession: true },
				{ turnId: 'subagent-failed', agentSessionId: 'session-1', chatSessionId: getTelemetryChatSessionId(subagentChatUri), isSubagentSession: true },
			],
			failed: [
				{ turnId: 'subagent-failed', agentSessionId: 'session-1', chatSessionId: getTelemetryChatSessionId(subagentChatUri), isSubagentSession: true },
			],
		});
	});

	test('emits a single turnCompleted per turn even when followed by duplicate completions', () => {
		setupSession();
		startTurn('turn-1');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 });
		// A duplicate turn-complete should not produce a second telemetry event because the tracker
		// drops its per-turn state on the first completion.
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 });

		assert.strictEqual(completedEvents().length, 1);
	});

	test('captures permissionLevel at turnStarted, not later mid-turn changes', () => {
		setupSession();
		setSessionConfig({ autoApprove: 'default' });
		startTurn('turn-1');

		// Change config mid-turn — should not affect the recorded event.
		setSessionConfig({ autoApprove: 'autopilot' });

		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.strictEqual(data.permissionLevel, 'default');
	});

	test('reports all interaction modes', () => {
		setupSession();

		for (const mode of ['interactive', 'plan', 'autopilot'] as const) {
			setSessionConfig({ mode });
			startTurn(`turn-${mode}`);
			fire({ type: ActionType.ChatTurnComplete, turnId: `turn-${mode}`, duration: 1000 });
		}

		assert.deepStrictEqual(completedEvents().map(event => (event.data as Record<string, unknown>).interactionMode), ['interactive', 'plan', 'autopilot']);
	});

	test('captures interactionMode at turnStarted, not later mid-turn changes', () => {
		setupSession();
		setSessionConfig({ mode: 'plan' });
		startTurn('turn-1');

		setSessionConfig({ mode: 'autopilot' });
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 });

		assert.strictEqual((completedEvents()[0].data as Record<string, unknown>).interactionMode, 'plan');
	});

	test('model and permissionLevel are undefined when never set', () => {
		setupSession();
		startTurn('turn-1');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.strictEqual(data.model, undefined);
		assert.strictEqual(data.modelSelectionKind, 'default');
		assert.strictEqual(data.permissionLevel, undefined);
		assert.strictEqual(data.isBYOK, undefined);
		assert.strictEqual(data.interactionMode, undefined);
	});

	// The tests below cover completion paths that bypass the agent-progress
	// signal flow (`_dispatchActionForSession`) — client-initiated cancel
	// and `sendMessage` rejection both dispatch their terminal action
	// directly through the state manager.

	test('emits result=cancelled when the client cancels a turn (no agent progress signal)', async () => {
		setupSession();
		startTurn('turn-1');

		sideEffects.handleAction(defaultChatUri, {
			type: ActionType.ChatTurnCancelled,
			turnId: 'turn-1',
			duration: 1000,
		});

		await new Promise(r => setTimeout(r, 10));

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		assert.strictEqual((events[0].data as Record<string, unknown>).result, 'cancelled');
	});

	test('emits result=error when a direct sendMessage rejects', async () => {
		setupSession();
		agent.sendMessage = async () => { throw new Error('boom'); };

		startTurn('turn-1');

		await new Promise(r => setTimeout(r, 10));

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		assert.strictEqual((events[0].data as Record<string, unknown>).result, 'error');
		assert.strictEqual((events[0].data as Record<string, unknown>).errorType, 'sendFailed');
		assert.deepStrictEqual(failedEvents().map(event => {
			const data = event.data as Record<string, unknown>;
			return {
				failureStage: data.failureStage,
				errorType: data.errorType,
				errorName: data.errorName,
				msg: data.msg,
				hasStack: typeof data.callstack === 'string',
			};
		}), [{
			failureStage: 'sendMessage',
			errorType: 'sendFailed',
			errorName: 'Error',
			msg: 'Error: boom',
			hasStack: true,
		}]);
	});

	test('fails the turn when model selection rejects instead of sending with a stale model', async () => {
		setupSession(false);
		agent.changeModel = async () => { throw new Error('unknown model'); };

		startTurn('turn-1', 'hello', 'missing-model');
		await new Promise(r => setTimeout(r, 10));

		const completed = completedEvents()[0].data as Record<string, unknown>;
		const failed = failedEvents()[0].data as Record<string, unknown>;
		assert.deepStrictEqual({
			completed: { result: completed.result, errorType: completed.errorType, failureStage: completed.failureStage },
			failed: { errorType: failed.errorType, failureStage: failed.failureStage, msg: failed.msg },
			creationErrorType: stateManager.getSessionState(sessionKey)?.creationError?.errorType,
			sendMessageCalls: agent.sendMessageCalls.length,
		}, {
			completed: { result: 'error', errorType: 'modelSelectionFailed', failureStage: 'modelSelection' },
			failed: { errorType: 'modelSelectionFailed', failureStage: 'modelSelection', msg: 'Error: unknown model' },
			creationErrorType: 'modelSelectionFailed',
			sendMessageCalls: 0,
		});
	});

	test('emits result=error when a queued sendMessage rejects', async () => {
		setupSession(true, undefined, true);
		agent.sendMessage = async () => { throw new Error('boom'); };

		const setAction: ChatAction = {
			type: ActionType.ChatPendingMessageSet,
			kind: PendingMessageKind.Queued,
			id: 'q-err',
			message: { text: 'queued message', origin: { kind: MessageKind.User } },
		};
		stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: 'test', clientSeq: 1 });
		sideEffects.handleAction(defaultChatUri, setAction);

		await new Promise(r => setTimeout(r, 10));

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		assert.strictEqual((events[0].data as Record<string, unknown>).result, 'error');
		assert.strictEqual((events[0].data as Record<string, unknown>).messageOriginKind, 'inline');
		assert.strictEqual((telemetry.events.find(event => event.eventName === 'agentHost.userMessageSent')?.data as Record<string, unknown>).messageOriginKind, 'inline');
	});

	test('captures interactionMode for queued turns', () => {
		setupSession();
		setSessionConfig({ mode: 'autopilot' });

		const setAction: ChatAction = {
			type: ActionType.ChatPendingMessageSet,
			kind: PendingMessageKind.Queued,
			id: 'q-mode',
			message: { text: 'queued message', origin: { kind: MessageKind.User } },
		};
		stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: 'test', clientSeq: 1 });
		sideEffects.handleAction(defaultChatUri, setAction);
		const turnId = stateManager.getActiveTurnId(defaultChatUri);
		assert.ok(turnId);

		setSessionConfig({ mode: 'interactive' });
		fire({ type: ActionType.ChatTurnComplete, turnId, duration: 1000 });

		assert.strictEqual((completedEvents()[0].data as Record<string, unknown>).interactionMode, 'autopilot');
	});

	test('emits a single turnCompleted when both the client cancel and a follow-up agent signal arrive', () => {
		// Some agents emit a `ChatTurnCancelled` signal in response to
		// `abortSession`; the tracker must dedup across the client-cancel
		// path and the agent-progress signal path.
		setupSession();
		startTurn('turn-1');

		sideEffects.handleAction(defaultChatUri, {
			type: ActionType.ChatTurnCancelled,
			turnId: 'turn-1',
			duration: 1000,
		});
		fire({ type: ActionType.ChatTurnCancelled, turnId: 'turn-1', duration: 1000 });

		assert.strictEqual(completedEvents().length, 1);
	});
});
