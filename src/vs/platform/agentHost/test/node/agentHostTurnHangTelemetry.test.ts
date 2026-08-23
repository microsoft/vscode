/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { getTelemetryChatSessionId } from '../../common/agentTelemetryCorrelation.js';
import { AgentSession, IAgent } from '../../common/agent.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { SessionInputRequestKind } from '../../common/state/protocol/state.js';
import { ActionType, type ChatAction } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, buildSubagentChatUri, ChatInputQuestionKind, MessageKind, ResponsePartKind, SessionStatus, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallContributorKind } from '../../common/state/sessionState.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { AgentHostLocalTurns } from '../../node/agentHostLocalTurns.js';
import { AgentHostTelemetryService } from '../../node/agentHostTelemetryService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { IAgentHostChangesetService } from '../../common/agentHostChangesetService.js';
import type { IAgentHostCustomizationEnablementService } from '../../node/agentHostCustomizationEnablementService.js';
import { AgentSideEffects } from '../../node/agentSideEffects.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostTurnTracker, TURN_ACTIVITY_NONE, TURN_HANG_THRESHOLD_MS } from '../../node/agentHostTurnTracker.js';
import { AgentHostTelemetryReporter } from '../../node/agentHostTelemetryReporter.js';
import { AgentHostClientConnectionService, IAgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { createNullSessionDataService } from '../common/sessionTestHelpers.js';
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
	refreshBranchChangeset(): void { }
	refreshSessionChangeset(): void { }
	refreshChangesetCatalog(): void { }
	onWorkingDirectoryAvailable(): void { }
	recomputeSubscribedChangesets(): void { }
	onSessionDisposed(): void { }
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
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

/**
 * Integration tests for the turn hang watchdog owned by
 * {@link AgentHostTurnTracker}, driven through {@link AgentSideEffects} so the
 * activity, blocker and tool-call signals are exercised through their real
 * wiring rather than by calling the tracker directly.
 */
suite('AgentSideEffects — turn hang telemetry', () => {

	const disposables = new DisposableStore();
	let stateManager: AgentHostStateManager;
	let agent: MockAgent;
	let sideEffects: AgentSideEffects;
	let telemetry: CapturingTelemetryService;
	let workingDirectoryGate: DeferredPromise<readonly URI[] | undefined> | undefined;
	let checkpointGate: DeferredPromise<void> | undefined;

	const sessionUri = AgentSession.uri('mock', 'session-1');
	const sessionKey = sessionUri.toString();
	const defaultChatUri = buildDefaultChatUri(sessionUri);

	function setupSession(): void {
		stateManager.createSession({
			resource: sessionKey,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
	}

	function startTurn(turnId: string, modelId?: string): void {
		const action: ChatAction = {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hello', origin: { kind: MessageKind.User }, ...(modelId ? { model: { id: modelId } } : {}) },
		};
		stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
		sideEffects.handleAction(defaultChatUri, action, 'test');
	}

	function fire(action: ChatAction): void {
		agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action });
	}

	function responsePart(turnId: string): void {
		fire({ type: ActionType.ChatResponsePart, turnId, part: { kind: ResponsePartKind.Markdown, id: 'p1', content: '' } });
	}

	function delta(turnId: string, content: string): void {
		fire({ type: ActionType.ChatDelta, turnId, partId: 'p1', content });
	}

	/** Normalizes the non-deterministic timing fields to booleans for snapshotting. */
	function hangEvents(): { eventName: string; data: Record<string, unknown> }[] {
		return telemetry.events
			.filter(e => e.eventName === 'agentHost.turnHung')
			.map(e => {
				const data = e.data as Record<string, unknown>;
				return {
					eventName: e.eventName,
					data: {
						...data,
						quietTimeMs: typeof data.quietTimeMs === 'number' && data.quietTimeMs >= TURN_HANG_THRESHOLD_MS,
						turnElapsedMs: typeof data.turnElapsedMs === 'number' && data.turnElapsedMs >= TURN_HANG_THRESHOLD_MS,
					},
				};
			});
	}

	function hangRecoveryEvents(): { eventName: string; data: Record<string, unknown> }[] {
		return telemetry.events
			.filter(e => e.eventName === 'agentHost.hungTurnCompleted')
			.map(e => {
				const data = e.data as Record<string, unknown>;
				return {
					eventName: e.eventName,
					data: {
						...data,
						totalTimeMs: typeof data.totalTimeMs === 'number' && data.totalTimeMs >= 0,
						timeAfterHangMs: typeof data.timeAfterHangMs === 'number' && data.timeAfterHangMs >= 0,
					},
				};
			});
	}

	setup(() => {
		agent = new MockAgent();
		disposables.add(toDisposable(() => agent.dispose()));
		stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const agentList = observableValue<readonly IAgent[]>('agents', [agent]);
		telemetry = new CapturingTelemetryService();

		const logService = new NullLogService();
		const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const telemetryService = disposables.add(new AgentHostTelemetryService(telemetry));
		const sessionDataService = createNullSessionDataService();
		const customizationEnablementService = { onDidChange: Event.None } as IAgentHostCustomizationEnablementService;
		workingDirectoryGate = undefined;
		checkpointGate = undefined;
		const checkpointService: IAgentHostCheckpointService = {
			...NULL_CHECKPOINT_SERVICE,
			captureTurnStartCheckpoint: async () => {
				await checkpointGate?.p;
			},
		};
		const clientConnections = disposables.add(new AgentHostClientConnectionService());
		disposables.add(clientConnections.registerSource({
			hasSeenClient: clientId => clientId === 'test',
			isClientConnected: clientId => clientId === 'test',
			getConnectedClientTransportCounts: () => new Map([['test', 1]]),
		}));
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, logService],
			[IAgentConfigurationService, configService],
			[IAgentHostChangesetService, new FakeChangesetService()],
			[IAgentHostCheckpointService, checkpointService],
			[ITelemetryService, telemetryService],
			[IAgentHostTerminalManager, disposables.add(new TestAgentHostTerminalManager())],
			[ISessionDataService, sessionDataService],
			[IAgentHostClientConnectionService, clientConnections],
		), /*strict*/ true));
		sideEffects = disposables.add(instantiationService.createInstance(AgentSideEffects, stateManager, customizationEnablementService, {
			getAgent: () => agent,
			agents: agentList,
			sessionDataService,
			localTurns: new AgentHostLocalTurns(sessionDataService, logService),
			onTurnComplete: () => { },
			resolveWorkingDirectoryBeforeSend: async () => await workingDirectoryGate?.p,
		}));
		disposables.add(sideEffects.registerProgressListener(agent));
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports noProgress for a turn that starts and is never heard from again', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-lost');
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents(), [{
			eventName: 'agentHost.turnHung',
			data: {
				provider: 'mock',
				agentSessionId: 'session-1',
				chatSessionId: getTelemetryChatSessionId(defaultChatUri),
				isSubagentSession: false,
				turnId: 'turn-lost',
				hangReason: 'noProgress',
				isExpected: false,
				hadAnyProgress: false,
				lastActivityKind: TURN_ACTIVITY_NONE,
				currentStage: 'provider',
				providerDiagnosticState: 'unsupported',
				initiatorClientConnectionState: 'connected',
				blockedOn: undefined,
				toolId: undefined,
				toolSourceKind: undefined,
				inFlightToolCallCount: 0,
				quietTimeMs: true,
				turnElapsedMs: true,
				model: undefined,
				modelSelectionKind: 'default',
				permissionLevel: undefined,
			},
		}]);
	});

	test('reports stalledAfterProgress once a turn goes quiet after streaming', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-stalled');
			responsePart('turn-stalled');
			delta('turn-stalled', 'thinking');
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents().map(e => ({
			hangReason: e.data.hangReason,
			isExpected: e.data.isExpected,
			hadAnyProgress: e.data.hadAnyProgress,
			lastActivityKind: e.data.lastActivityKind,
		})), [{
			hangReason: 'stalledAfterProgress',
			isExpected: false,
			hadAnyProgress: true,
			lastActivityKind: 'chat.delta',
		}]);
	});

	test('does not report while activity keeps arriving inside the threshold', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-busy');
			responsePart('turn-busy');
			// Ten windows' worth of elapsed time, but never a full quiet window.
			for (let i = 0; i < 10; i++) {
				await timeout(TURN_HANG_THRESHOLD_MS - 1000);
				delta('turn-busy', `chunk-${i}`);
			}
			fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-busy', duration: 1000 });
		});

		assert.deepStrictEqual({ hangs: hangEvents(), recoveries: hangRecoveryEvents() }, { hangs: [], recoveries: [] });
	});

	test('tags a turn blocked on a tool confirmation as an expected wait on the user', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-confirm');
			fire({
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-confirm',
				toolCallId: 'tc-confirm',
				toolName: 'write',
				displayName: 'write',
			});
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-confirm',
				toolCallId: 'tc-confirm',
				invocationMessage: 'Write file',
				confirmationTitle: 'Write file',
			});
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents().map(e => ({
			hangReason: e.data.hangReason,
			isExpected: e.data.isExpected,
			blockedOn: e.data.blockedOn,
			toolId: e.data.toolId,
			toolSourceKind: e.data.toolSourceKind,
			inFlightToolCallCount: e.data.inFlightToolCallCount,
		})), [{
			hangReason: 'waitingOnUser',
			isExpected: true,
			blockedOn: SessionInputRequestKind.ToolConfirmation,
			toolId: 'write',
			toolSourceKind: 'agentHost',
			inFlightToolCallCount: 1,
		}]);
	});

	test('tags a silent long-running tool call as runningTool, then reports a real stall once it completes', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-tool');
			fire({
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-tool',
				toolCallId: 'tc-slow',
				toolName: 'bash',
				displayName: 'bash',
			});
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-tool',
				toolCallId: 'tc-slow',
				invocationMessage: 'Run build',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			await timeout(TURN_HANG_THRESHOLD_MS);

			// The tool finally returns, but the agent loop never picks the turn
			// back up — the second report distinguishes that from the first.
			fire({ type: ActionType.ChatToolCallComplete, turnId: 'turn-tool', toolCallId: 'tc-slow', result: { success: true, pastTenseMessage: 'built' } });
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents().map(e => ({
			hangReason: e.data.hangReason,
			isExpected: e.data.isExpected,
			toolId: e.data.toolId,
			toolSourceKind: e.data.toolSourceKind,
			inFlightToolCallCount: e.data.inFlightToolCallCount,
		})), [
			// The agent-host tool is named even though it never entered the
			// session input queue, which is what `toolCallStalled` cannot see.
			{ hangReason: 'runningTool', isExpected: true, toolId: 'bash', toolSourceKind: 'agentHost', inFlightToolCallCount: 1 },
			{ hangReason: 'stalledAfterProgress', isExpected: false, toolId: undefined, toolSourceKind: undefined, inFlightToolCallCount: 0 },
		]);
	});

	test('reports each hang reason at most once no matter how long the turn stays quiet', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-forever');
			await timeout(10 * TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents().map(e => e.data.hangReason), ['noProgress']);
	});

	test('reports the paired recovery event when a hung turn later completes', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-recovered');
			await timeout(TURN_HANG_THRESHOLD_MS);
			fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-recovered', duration: 1000 });
		});

		assert.deepStrictEqual(hangRecoveryEvents(), [{
			eventName: 'agentHost.hungTurnCompleted',
			data: {
				provider: 'mock',
				agentSessionId: 'session-1',
				chatSessionId: getTelemetryChatSessionId(defaultChatUri),
				isSubagentSession: false,
				turnId: 'turn-recovered',
				hangReason: 'noProgress',
				result: 'success',
				hangReportCount: 1,
				totalTimeMs: true,
				timeAfterHangMs: true,
			},
		}]);
	});

	test('does not report a recovery event for a turn that never hung', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-quick');
			responsePart('turn-quick');
			delta('turn-quick', 'hi');
			fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-quick', duration: 1000 });
			await timeout(2 * TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual({ hangs: hangEvents(), recoveries: hangRecoveryEvents() }, { hangs: [], recoveries: [] });
	});

	test('reports the active stage', async () => {
		const tracker = disposables.add(new AgentHostTurnTracker(
			new AgentHostTelemetryReporter(telemetry),
			disposables.add(new AgentHostClientConnectionService()),
			new NullLogService(),
		));
		const cases = [
			{ session: AgentSession.uri('mock', 'validation').toString(), stage: 'validation' },
			{ session: AgentSession.uri('mock', 'working-directory').toString(), stage: 'workingDirectory' },
			{ session: AgentSession.uri('mock', 'model-selection').toString(), stage: 'modelSelection' },
			{ session: AgentSession.uri('mock', 'send-message').toString(), stage: 'sendMessage' },
			{ session: AgentSession.uri('mock', 'provider').toString(), stage: 'provider' },
		] as const;

		await runWithFakedTimers({}, async () => {
			for (const item of cases) {
				tracker.turnStarted(agent, item.session, 'turn', undefined, undefined, 'default', undefined, undefined);
				tracker.setCurrentStage(item.session, 'turn', item.stage);
			}
			await timeout(TURN_HANG_THRESHOLD_MS);
			for (const item of cases) {
				tracker.turnCompleted(item.session, 'turn', 'cancelled');
			}
		});

		assert.deepStrictEqual({
			stages: hangEvents().slice(-cases.length).map(e => e.data.currentStage),
			recoveries: hangRecoveryEvents().map(e => ({
				result: e.data.result,
				hangReason: e.data.hangReason,
				hangReportCount: e.data.hangReportCount,
			})),
		}, {
			stages: cases.map(item => item.stage),
			recoveries: cases.map(() => ({
				result: 'cancelled',
				hangReason: 'noProgress',
				hangReportCount: 1,
			})),
		});
	});

	test('reports provider lifecycle and initiating client connection snapshots', async () => {
		const clientConnections = disposables.add(new AgentHostClientConnectionService());
		disposables.add(clientConnections.registerSource({
			hasSeenClient: clientId => clientId === 'connected-client',
			isClientConnected: clientId => clientId === 'connected-client',
			getConnectedClientTransportCounts: () => new Map([['connected-client', 1]]),
		}));
		const diagnosticAgent = disposables.add(new MockAgent('copilotcli'));
		diagnosticAgent.getTurnDiagnosticSnapshot = () => ({
			state: 'available',
			providerCallState: 'pending',
			providerTurnStarted: false,
			providerSessionState: 'active',
		});
		const tracker = disposables.add(new AgentHostTurnTracker(
			new AgentHostTelemetryReporter(telemetry),
			clientConnections,
			new NullLogService(),
		));
		const session = AgentSession.uri('copilotcli', 'lifecycle').toString();

		await runWithFakedTimers({}, async () => {
			tracker.turnStarted(
				diagnosticAgent,
				session,
				'turn',
				undefined,
				undefined,
				'default',
				undefined,
				undefined,
				createUnknownAgentHostClientTelemetryContext(AgentHostClientType.AgentsWindow),
				'connected-client',
			);
			tracker.setCurrentStage(session, 'turn', 'provider');
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents().at(-1)?.data, {
			provider: 'copilotcli',
			agentSessionId: 'lifecycle',
			chatSessionId: getTelemetryChatSessionId(session),
			isSubagentSession: false,
			turnId: 'turn',
			hangReason: 'noProgress',
			isExpected: false,
			hadAnyProgress: false,
			lastActivityKind: TURN_ACTIVITY_NONE,
			currentStage: 'provider',
			providerDiagnosticState: 'available',
			providerCallState: 'pending',
			providerTurnStarted: false,
			providerSessionState: 'active',
			initiatorClientType: 'agents_window',
			initiatorClientConnectionState: 'connected',
			blockedOn: undefined,
			toolId: undefined,
			toolSourceKind: undefined,
			inFlightToolCallCount: 0,
			quietTimeMs: true,
			turnElapsedMs: true,
			model: undefined,
			modelSelectionKind: 'default',
			permissionLevel: undefined,
		});
	});

	test('reports diagnostic errors without losing the hang event', async () => {
		const diagnosticAgent = disposables.add(new MockAgent('copilotcli'));
		diagnosticAgent.getTurnDiagnosticSnapshot = () => {
			throw new Error('diagnostic failed');
		};
		const tracker = disposables.add(new AgentHostTurnTracker(
			new AgentHostTelemetryReporter(telemetry),
			disposables.add(new AgentHostClientConnectionService()),
			new NullLogService(),
		));
		const session = AgentSession.uri('copilotcli', 'diagnostic-error').toString();

		await runWithFakedTimers({}, async () => {
			tracker.turnStarted(diagnosticAgent, session, 'turn', undefined, undefined, 'default', undefined, undefined);
			tracker.setCurrentStage(session, 'turn', 'provider');
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual({
			providerDiagnosticState: hangEvents().at(-1)?.data.providerDiagnosticState,
			hangReason: hangEvents().at(-1)?.data.hangReason,
		}, {
			providerDiagnosticState: 'error',
			hangReason: 'noProgress',
		});
	});

	test('tracks pre-provider stages through the send pipeline', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();

			workingDirectoryGate = new DeferredPromise();
			startTurn('turn-working-directory');
			await timeout(TURN_HANG_THRESHOLD_MS);
			workingDirectoryGate.complete(undefined);
			await timeout(0);

			const modelGate = new DeferredPromise<void>();
			agent.changeModel = async () => await modelGate.p;
			startTurn('turn-model-selection', 'gpt-5');
			await timeout(TURN_HANG_THRESHOLD_MS);
			modelGate.complete();
			await timeout(0);

			checkpointGate = new DeferredPromise();
			startTurn('turn-send-message');
			await timeout(TURN_HANG_THRESHOLD_MS);
			checkpointGate.complete();
			await timeout(0);
		});

		assert.deepStrictEqual(hangEvents().map(e => ({
			turnId: e.data.turnId,
			currentStage: e.data.currentStage,
		})), [
			{ turnId: 'turn-working-directory', currentStage: 'workingDirectory' },
			{ turnId: 'turn-model-selection', currentStage: 'modelSelection' },
			{ turnId: 'turn-send-message', currentStage: 'sendMessage' },
		]);
	});

	test('reports provider stage for new and resumed subagent turns', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-parent');
			fire({
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-parent',
				toolCallId: 'tc-subagent',
				toolName: 'task',
				displayName: 'Task',
			});
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-parent',
				toolCallId: 'tc-subagent',
				invocationMessage: 'Exploring code',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			agent.fireProgress({
				kind: 'subagent_started',
				chat: URI.parse(defaultChatUri),
				toolCallId: 'tc-subagent',
				agentName: 'explore',
				agentDisplayName: 'Explore',
				agentDescription: 'Explores code',
				taskPrompt: 'Find the implementation',
			});
			const subagentChat = buildSubagentChatUri(sessionKey, 'tc-subagent');
			await timeout(TURN_HANG_THRESHOLD_MS);
			const firstTurnId = hangEvents().find(e => e.data.isSubagentSession)?.data.turnId;
			if (typeof firstTurnId !== 'string') {
				assert.fail('Expected the first subagent turn to hang');
			}
			agent.fireProgress({
				kind: 'action',
				resource: URI.parse(subagentChat),
				action: { type: ActionType.ChatTurnComplete, turnId: firstTurnId, duration: TURN_HANG_THRESHOLD_MS },
			});
			agent.fireProgress({
				kind: 'subagent_started',
				chat: URI.parse(defaultChatUri),
				toolCallId: 'tc-subagent',
				agentName: 'explore',
				agentDisplayName: 'Explore',
				agentDescription: 'Explores code',
				taskPrompt: 'Continue the investigation',
			});
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(
			hangEvents()
				.filter(e => e.data.isSubagentSession)
				.map(e => ({ hangReason: e.data.hangReason, currentStage: e.data.currentStage })),
			[
				{ hangReason: 'noProgress', currentStage: 'provider' },
				{ hangReason: 'noProgress', currentStage: 'provider' },
			],
		);
	});

	test('does not report a turn that a truncation removed from the chat', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-truncated');

			// Omitting `turnId` clears every turn including the active one.
			const truncate: ChatAction = { type: ActionType.ChatTruncated };
			stateManager.dispatchClientAction(defaultChatUri, truncate, { clientId: 'test', clientSeq: 2 });
			sideEffects.handleAction(defaultChatUri, truncate);

			await timeout(10 * TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual({ hangs: hangEvents(), recoveries: hangRecoveryEvents() }, { hangs: [], recoveries: [] });
	});

	test('keeps watching a turn after the user answers a confirmation it had hung on', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-answered');
			fire({
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-answered',
				toolCallId: 'tc-answered',
				toolName: 'write',
				displayName: 'write',
			});
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-answered',
				toolCallId: 'tc-answered',
				invocationMessage: 'Write file',
				confirmationTitle: 'Write file',
			});
			await timeout(TURN_HANG_THRESHOLD_MS);

			const confirmed: ChatAction = {
				type: ActionType.ChatToolCallConfirmed,
				turnId: 'turn-answered',
				toolCallId: 'tc-answered',
				approved: true,
				confirmed: ToolCallConfirmationReason.UserAction,
			};
			stateManager.dispatchClientAction(defaultChatUri, confirmed, { clientId: 'test', clientSeq: 2 });
			sideEffects.handleAction(defaultChatUri, confirmed);
			fire({ type: ActionType.ChatToolCallComplete, turnId: 'turn-answered', toolCallId: 'tc-answered', result: { success: true, pastTenseMessage: 'wrote file' } });

			// The tool is done and nothing is blocking, but the agent loop
			// never picks the turn back up.
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents().map(e => ({ hangReason: e.data.hangReason, isExpected: e.data.isExpected })), [
			{ hangReason: 'waitingOnUser', isExpected: true },
			{ hangReason: 'stalledAfterProgress', isExpected: false },
		]);
	});

	test('tags a client-executed tool as runningTool, not as a wait on the user', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-client');
			fire({
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-client',
				toolCallId: 'tc-client',
				toolName: 'run_tests',
				displayName: 'run_tests',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-1' },
			});
			// Confirmation is not needed, so the call goes straight to running
			// and is surfaced as a `toolClientExecution` input request. That is
			// delegated work, not a prompt — the turn is not waiting on a human.
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-client',
				toolCallId: 'tc-client',
				invocationMessage: 'Run tests',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents().map(e => ({
			hangReason: e.data.hangReason,
			isExpected: e.data.isExpected,
			blockedOn: e.data.blockedOn,
			toolId: e.data.toolId,
			toolSourceKind: e.data.toolSourceKind,
			inFlightToolCallCount: e.data.inFlightToolCallCount,
		})), [{
			hangReason: 'runningTool',
			isExpected: true,
			blockedOn: undefined,
			toolId: 'run_tests',
			toolSourceKind: 'client',
			inFlightToolCallCount: 1,
		}]);
	});

	test('names the longest-running tool when several are in flight', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-parallel');
			fire({ type: ActionType.ChatToolCallStart, turnId: 'turn-parallel', toolCallId: 'tc-a', toolName: 'bash', displayName: 'bash' });
			fire({ type: ActionType.ChatToolCallStart, turnId: 'turn-parallel', toolCallId: 'tc-b', toolName: 'read_file', displayName: 'read_file' });
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		// `toolId` is a best guess among parallel calls; `inFlightToolCallCount`
		// above one is the signal that attribution is ambiguous.
		assert.deepStrictEqual(hangEvents().map(e => ({
			toolId: e.data.toolId,
			inFlightToolCallCount: e.data.inFlightToolCallCount,
		})), [{ toolId: 'bash', inFlightToolCallCount: 2 }]);
	});

	test('refines the tool source kind when tool metadata arrives after the start', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-refined');
			// The start signal carries no contributor; `ready` supplies it.
			fire({ type: ActionType.ChatToolCallStart, turnId: 'turn-refined', toolCallId: 'tc-refined', toolName: 'lookup', displayName: 'lookup' });
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-refined',
				toolCallId: 'tc-refined',
				invocationMessage: 'Look up metadata',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'c1' },
			});
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents().map(e => ({
			toolId: e.data.toolId,
			toolSourceKind: e.data.toolSourceKind,
		})), [{ toolId: 'lookup', toolSourceKind: 'mcp' }]);
	});

	test('names the tool the blocker gates, not another tool that happens to be running', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-mixed');
			// A long-running tool starts first, so it is the earliest entry in
			// the in-flight set...
			fire({ type: ActionType.ChatToolCallStart, turnId: 'turn-mixed', toolCallId: 'tc-running', toolName: 'bash', displayName: 'bash' });
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-mixed',
				toolCallId: 'tc-running',
				invocationMessage: 'Run build',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			// ...but a second tool is what actually blocks on the user, so that
			// is the one the report must name.
			fire({ type: ActionType.ChatToolCallStart, turnId: 'turn-mixed', toolCallId: 'tc-gated', toolName: 'write', displayName: 'write' });
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-mixed',
				toolCallId: 'tc-gated',
				invocationMessage: 'Write file',
				confirmationTitle: 'Write file',
			});
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents().map(e => ({
			hangReason: e.data.hangReason,
			toolId: e.data.toolId,
			inFlightToolCallCount: e.data.inFlightToolCallCount,
		})), [{
			hangReason: 'waitingOnUser',
			toolId: 'write',
			inFlightToolCallCount: 2,
		}]);
	});

	test('leaves the tool unnamed when the user is reviewing a completed result', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-result');
			fire({
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-result',
				toolCallId: 'tc-result',
				toolName: 'write',
				displayName: 'write',
			});
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-result',
				toolCallId: 'tc-result',
				invocationMessage: 'Write file',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			// The tool ran to completion and is now awaiting *result* review, so
			// it has left the in-flight set. The turn waits on the user reading
			// a result, not on a tool — `toolId` is deliberately undefined.
			fire({
				type: ActionType.ChatToolCallComplete,
				turnId: 'turn-result',
				toolCallId: 'tc-result',
				result: { success: true, pastTenseMessage: 'wrote file' },
				requiresResultConfirmation: true,
			});
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents().map(e => ({
			hangReason: e.data.hangReason,
			blockedOn: e.data.blockedOn,
			toolId: e.data.toolId,
			toolSourceKind: e.data.toolSourceKind,
			inFlightToolCallCount: e.data.inFlightToolCallCount,
		})), [{
			hangReason: 'waitingOnUser',
			blockedOn: SessionInputRequestKind.ToolConfirmation,
			toolId: undefined,
			toolSourceKind: undefined,
			inFlightToolCallCount: 0,
		}]);
	});

	test('leaves the tool unnamed when the turn is blocked on an elicitation', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-elicit');
			// An elicitation is not attached to any tool call at all, and the
			// action carries no `turnId` — the blocker resolves to the chat's
			// active turn via the fallback in `_setSessionInputNeeded`.
			fire({
				type: ActionType.ChatInputRequested,
				request: {
					id: 'req-1',
					message: 'Which environment should I deploy to?',
					questions: [{ id: 'q1', kind: ChatInputQuestionKind.Text, message: 'Environment' }],
				},
			});
			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents().map(e => ({
			hangReason: e.data.hangReason,
			blockedOn: e.data.blockedOn,
			toolId: e.data.toolId,
			toolSourceKind: e.data.toolSourceKind,
			inFlightToolCallCount: e.data.inFlightToolCallCount,
		})), [{
			hangReason: 'waitingOnUser',
			blockedOn: SessionInputRequestKind.ChatInput,
			toolId: undefined,
			toolSourceKind: undefined,
			inFlightToolCallCount: 0,
		}]);
	});

	test('reports a real stall when the agent goes quiet after a denied confirmation', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-denied');
			fire({
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-denied',
				toolCallId: 'tc-denied',
				toolName: 'write',
				displayName: 'write',
			});
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-denied',
				toolCallId: 'tc-denied',
				invocationMessage: 'Write file',
				confirmationTitle: 'Write file',
			});

			// Denial is terminal — no `ChatToolCallComplete` follows, so the
			// tool must not stay in the turn's in-flight set.
			const denied: ChatAction = {
				type: ActionType.ChatToolCallConfirmed,
				turnId: 'turn-denied',
				toolCallId: 'tc-denied',
				approved: false,
				reason: ToolCallCancellationReason.Denied,
			};
			stateManager.dispatchClientAction(defaultChatUri, denied, { clientId: 'test', clientSeq: 2 });
			sideEffects.handleAction(defaultChatUri, denied);

			await timeout(TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual(hangEvents().map(e => ({
			hangReason: e.data.hangReason,
			isExpected: e.data.isExpected,
			inFlightToolCallCount: e.data.inFlightToolCallCount,
		})), [{
			hangReason: 'stalledAfterProgress',
			isExpected: false,
			inFlightToolCallCount: 0,
		}]);
	});

	test('does not report after a turn is cancelled or its session is torn down', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-cancelled');
			fire({ type: ActionType.ChatTurnCancelled, turnId: 'turn-cancelled', duration: 1000 });

			startTurn('turn-cleared');
			sideEffects.clearChannelTelemetry(defaultChatUri);

			await timeout(10 * TURN_HANG_THRESHOLD_MS);
		});

		assert.deepStrictEqual({ hangs: hangEvents(), recoveries: hangRecoveryEvents() }, { hangs: [], recoveries: [] });
	});
});
