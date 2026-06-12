/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentSession, IAgent } from '../../common/agentService.js';
import { ActionType, SessionAction } from '../../common/state/sessionActions.js';
import { MessageKind, PendingMessageKind, ResponsePartKind, SessionStatus } from '../../common/state/sessionState.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { AgentHostTelemetryService } from '../../node/agentHostTelemetryService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { IAgentHostChangesetService } from '../../node/agentHostChangesetService.js';
import { AgentSideEffects } from '../../node/agentSideEffects.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createNullSessionDataService } from '../common/sessionTestHelpers.js';
import { MockAgent } from './mockAgent.js';

class FakeChangesetService implements IAgentHostChangesetService {
	declare readonly _serviceBrand: undefined;
	registerStaticChangesets(): void { }
	restoreStaticChangeset(): void { }
	parsePersistedStaticChangesets(): { uncommitted?: undefined; session?: undefined } { return {}; }
	applyPersistedStaticChangesets(): void { }
	restorePersistedStaticChangesets(): { uncommitted?: undefined; session?: undefined } { return {}; }
	persistChangesSummary(): void { }
	isStaticChangesetComputeActive(): boolean { return false; }
	refreshBranchChangeset(): void { }
	refreshUncommittedChangeset(): void { }
	refreshSessionChangeset(): void { }
	setTurnSubscriberProbe(): void { }
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

	const sessionUri = AgentSession.uri('mock', 'session-1');
	const sessionKey = sessionUri.toString();

	function setupSession(): void {
		stateManager.createSession({
			resource: sessionKey,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
		});
		stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
	}

	function setModel(id: string): void {
		stateManager.dispatchServerAction(sessionKey, {
			type: ActionType.SessionModelChanged,
			model: { id },
		});
	}

	function setAutoApprove(level: string): void {
		// Set config on the session state directly — the SessionConfigChanged
		// reducer only merges into an existing config schema, which agentService
		// normally registers at session creation time. Tests bypass that wiring.
		const state = stateManager.getSessionState(sessionKey);
		if (state) {
			state.config = {
				schema: {
					type: 'object',
					properties: {
						autoApprove: { type: 'string', title: 'Approvals', enum: ['default', 'autoApprove', 'autopilot'], default: 'default' },
					},
				},
				values: { autoApprove: level },
			};
		}
	}

	function startTurn(turnId: string, text = 'hello'): void {
		const action: SessionAction = {
			type: ActionType.SessionTurnStarted,
			turnId,
			message: { text, origin: { kind: MessageKind.User } },
		};
		// Dispatch into the state manager so `getActiveTurnId` returns the
		// active turn (the progress-listener path relies on this) and then
		// invoke `handleAction` so the side-effect (which calls
		// `agent.sendMessage` and `turnTracker.turnStarted`) runs.
		stateManager.dispatchClientAction(sessionKey, action, { clientId: 'test', clientSeq: 1 });
		sideEffects.handleAction(sessionKey, action);
	}

	function fire(action: SessionAction): void {
		agent.fireProgress({ kind: 'action', session: sessionUri, action });
	}

	function completedEvents(): { eventName: string; data: unknown }[] {
		return telemetry.events.filter(e => e.eventName === 'agentHost.turnCompleted');
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
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, logService],
			[IAgentConfigurationService, configService],
			[IAgentHostChangesetService, new FakeChangesetService()],
			[IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
			[ITelemetryService, telemetryService],
		), /*strict*/ true));
		sideEffects = disposables.add(instantiationService.createInstance(AgentSideEffects, stateManager, {
			getAgent: () => agent,
			agents: agentList,
			sessionDataService: createNullSessionDataService(),
			onTurnComplete: () => { },
		}));
		// Wire the agent's progress signals through side-effects (this is how
		// progress actions reach the state manager in production).
		disposables.add(sideEffects.registerProgressListener(agent));
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('emits turnCompleted with timing, model and permissionLevel on success', () => {
		setupSession();
		setModel('gpt-5.5');
		setAutoApprove('autopilot');
		startTurn('turn-1');

		fire({ type: ActionType.SessionResponsePart, turnId: 'turn-1', part: { kind: ResponsePartKind.Markdown, id: 'p1', content: 'hi' } });
		fire({ type: ActionType.SessionTurnComplete, turnId: 'turn-1' });

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		const data = events[0].data as Record<string, unknown>;
		assert.strictEqual(data.provider, 'mock');
		assert.strictEqual(data.agentSessionId, 'session-1');
		assert.strictEqual(data.result, 'success');
		assert.strictEqual(data.model, 'gpt-5.5');
		assert.strictEqual(data.permissionLevel, 'autopilot');
		assert.strictEqual(typeof data.totalTime, 'number');
		assert.strictEqual(typeof data.timeToFirstProgress, 'number');
	});

	test('timeToFirstProgress is undefined when no visible progress arrives before completion', () => {
		setupSession();
		startTurn('turn-1');

		// Usage is not a "visible progress" action — it should not mark first progress.
		fire({ type: ActionType.SessionUsage, turnId: 'turn-1', usage: { inputTokens: 1, outputTokens: 1 } });
		fire({ type: ActionType.SessionTurnComplete, turnId: 'turn-1' });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.strictEqual(data.timeToFirstProgress, undefined);
	});

	test('emits result=cancelled on SessionTurnCancelled', () => {
		setupSession();
		startTurn('turn-1');
		fire({ type: ActionType.SessionTurnCancelled, turnId: 'turn-1' });

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		assert.strictEqual((events[0].data as Record<string, unknown>).result, 'cancelled');
	});

	test('emits result=error on SessionError', () => {
		setupSession();
		startTurn('turn-1');
		fire({ type: ActionType.SessionError, turnId: 'turn-1', error: { errorType: 'oops', message: 'fail' } });

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		assert.strictEqual((events[0].data as Record<string, unknown>).result, 'error');
	});

	test('emits a single turnCompleted per turn even when followed by duplicate completions', () => {
		setupSession();
		startTurn('turn-1');
		fire({ type: ActionType.SessionTurnComplete, turnId: 'turn-1' });
		// A duplicate turn-complete should not produce a second telemetry event because the tracker
		// drops its per-turn state on the first completion.
		fire({ type: ActionType.SessionTurnComplete, turnId: 'turn-1' });

		assert.strictEqual(completedEvents().length, 1);
	});

	test('captures permissionLevel at turnStarted, not later mid-turn changes', () => {
		setupSession();
		setAutoApprove('default');
		startTurn('turn-1');

		// Change config mid-turn — should not affect the recorded event.
		setAutoApprove('autopilot');

		fire({ type: ActionType.SessionTurnComplete, turnId: 'turn-1' });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.strictEqual(data.permissionLevel, 'default');
	});

	test('model and permissionLevel are undefined when never set', () => {
		setupSession();
		startTurn('turn-1');
		fire({ type: ActionType.SessionTurnComplete, turnId: 'turn-1' });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.strictEqual(data.model, undefined);
		assert.strictEqual(data.permissionLevel, undefined);
	});

	// The tests below cover completion paths that bypass the agent-progress
	// signal flow (`_dispatchActionForSession`) — client-initiated cancel
	// and `sendMessage` rejection both dispatch their terminal action
	// directly through the state manager.

	test('emits result=cancelled when the client cancels a turn (no agent progress signal)', async () => {
		setupSession();
		startTurn('turn-1');

		sideEffects.handleAction(sessionKey, {
			type: ActionType.SessionTurnCancelled,
			turnId: 'turn-1',
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
	});

	test('emits result=error when a queued sendMessage rejects', async () => {
		setupSession();
		agent.sendMessage = async () => { throw new Error('boom'); };

		const setAction: SessionAction = {
			type: ActionType.SessionPendingMessageSet,
			kind: PendingMessageKind.Queued,
			id: 'q-err',
			message: { text: 'queued message', origin: { kind: MessageKind.User } },
		};
		stateManager.dispatchClientAction(sessionKey, setAction, { clientId: 'test', clientSeq: 1 });
		sideEffects.handleAction(sessionKey, setAction);

		await new Promise(r => setTimeout(r, 10));

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		assert.strictEqual((events[0].data as Record<string, unknown>).result, 'error');
	});

	test('emits a single turnCompleted when both the client cancel and a follow-up agent signal arrive', () => {
		// Some agents emit a `SessionTurnCancelled` signal in response to
		// `abortSession`; the tracker must dedup across the client-cancel
		// path and the agent-progress signal path.
		setupSession();
		startTurn('turn-1');

		sideEffects.handleAction(sessionKey, {
			type: ActionType.SessionTurnCancelled,
			turnId: 'turn-1',
		});
		fire({ type: ActionType.SessionTurnCancelled, turnId: 'turn-1' });

		assert.strictEqual(completedEvents().length, 1);
	});
});
