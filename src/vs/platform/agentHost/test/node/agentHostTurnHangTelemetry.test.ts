/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
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
import { AgentSession, IAgent } from '../../common/agentService.js';
import { SessionInputRequestKind } from '../../common/state/protocol/state.js';
import { ActionType, type ChatAction } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageKind, ResponsePartKind, SessionStatus, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallContributorKind } from '../../common/state/sessionState.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { AgentHostLocalTurns } from '../../node/agentHostLocalTurns.js';
import { AgentHostTelemetryService } from '../../node/agentHostTelemetryService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { IAgentHostChangesetService } from '../../common/agentHostChangesetService.js';
import { AgentSideEffects } from '../../node/agentSideEffects.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { TURN_ACTIVITY_NONE, TURN_HANG_THRESHOLD_MS } from '../../node/agentHostTurnTracker.js';
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

	function startTurn(turnId: string): void {
		const action: ChatAction = {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		};
		stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
		sideEffects.handleAction(defaultChatUri, action);
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
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, logService],
			[IAgentConfigurationService, configService],
			[IAgentHostChangesetService, new FakeChangesetService()],
			[IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
			[ITelemetryService, telemetryService],
			[IAgentHostTerminalManager, disposables.add(new TestAgentHostTerminalManager())],
			[ISessionDataService, sessionDataService],
		), /*strict*/ true));
		sideEffects = disposables.add(instantiationService.createInstance(AgentSideEffects, stateManager, {
			getAgent: () => agent,
			agents: agentList,
			sessionDataService,
			localTurns: new AgentHostLocalTurns(sessionDataService, logService),
			onTurnComplete: () => { },
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
				blockedOn: undefined,
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
			lastActivityKind: ActionType.ChatDelta,
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
			inFlightToolCallCount: e.data.inFlightToolCallCount,
		})), [{
			hangReason: 'waitingOnUser',
			isExpected: true,
			blockedOn: SessionInputRequestKind.ToolConfirmation,
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
			inFlightToolCallCount: e.data.inFlightToolCallCount,
		})), [
			{ hangReason: 'runningTool', isExpected: true, inFlightToolCallCount: 1 },
			{ hangReason: 'stalledAfterProgress', isExpected: false, inFlightToolCallCount: 0 },
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
			inFlightToolCallCount: e.data.inFlightToolCallCount,
		})), [{
			hangReason: 'runningTool',
			isExpected: true,
			blockedOn: undefined,
			inFlightToolCallCount: 1,
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
