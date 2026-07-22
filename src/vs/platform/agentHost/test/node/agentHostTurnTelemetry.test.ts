/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentSession, IAgent } from '../../common/agentService.js';
import { ActionType, type ChatAction } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageKind, PendingMessageKind, ResponsePartKind, SessionStatus } from '../../common/state/sessionState.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { AgentHostLocalTurns } from '../../node/agentHostLocalTurns.js';
import { AgentHostTelemetryService } from '../../node/agentHostTelemetryService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { IAgentHostChangesetService } from '../../common/agentHostChangesetService.js';
import { AgentSideEffects } from '../../node/agentSideEffects.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
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
	refreshChangesetCatalog(): void { }
	refreshBranchChangeset(): void { }
	refreshSessionChangeset(): void { }
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

	function setAutoApprove(level: string): void {
		// Establish config on the authoritative session state via the state
		// manager API. Mutating the object returned by `getSessionState` would
		// strand the change on a detached composite copy (session merged with
		// its default chat). `agentService` registers the schema at session
		// creation time; tests bypass that wiring with this direct set.
		stateManager.setSessionConfig(sessionKey, {
			schema: {
				type: 'object',
				properties: {
					autoApprove: { type: 'string', title: 'Approvals', enum: ['default', 'autoApprove', 'autopilot'], default: 'default' },
				},
			},
			values: { autoApprove: level },
		});
	}

	function startTurn(turnId: string, text = 'hello', modelId?: string): void {
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
		stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
		sideEffects.handleAction(defaultChatUri, action);
	}

	function fire(action: ChatAction): void {
		agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action });
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
		setAutoApprove('autopilot');
		startTurn('turn-1', 'hello', 'gpt-5.5');

		fire({ type: ActionType.ChatResponsePart, turnId: 'turn-1', part: { kind: ResponsePartKind.Markdown, id: 'p1', content: 'hi' } });
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 });

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		const data = events[0].data as Record<string, unknown>;
		assert.strictEqual(data.provider, 'mock');
		assert.strictEqual(data.agentSessionId, 'session-1');
		assert.strictEqual(data.turnId, 'turn-1');
		assert.strictEqual(data.result, 'success');
		assert.strictEqual(data.model, 'gpt-5.5');
		assert.strictEqual(data.modelSelectionKind, 'explicit');
		assert.strictEqual(data.permissionLevel, 'autopilot');
		assert.strictEqual(typeof data.totalTime, 'number');
		assert.strictEqual(typeof data.timeToFirstProgress, 'number');
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

	test('emits result=cancelled on ChatTurnCancelled', () => {
		setupSession();
		startTurn('turn-1', 'hello', 'auto');
		fire({ type: ActionType.ChatTurnCancelled, turnId: 'turn-1', duration: 1000 });

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		assert.strictEqual((events[0].data as Record<string, unknown>).result, 'cancelled');
		assert.strictEqual((events[0].data as Record<string, unknown>).modelSelectionKind, 'auto');
	});

	test('emits result=error on ChatError', () => {
		setupSession();
		startTurn('turn-1');
		fire({ type: ActionType.ChatError, turnId: 'turn-1', duration: 1000, error: { errorType: 'oops', message: 'fail' } });

		const events = completedEvents();
		assert.strictEqual(events.length, 1);
		assert.strictEqual((events[0].data as Record<string, unknown>).result, 'error');
		assert.strictEqual((events[0].data as Record<string, unknown>).errorType, 'oops');
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
		setAutoApprove('default');
		startTurn('turn-1');

		// Change config mid-turn — should not affect the recorded event.
		setAutoApprove('autopilot');

		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.strictEqual(data.permissionLevel, 'default');
	});

	test('model and permissionLevel are undefined when never set', () => {
		setupSession();
		startTurn('turn-1');
		fire({ type: ActionType.ChatTurnComplete, turnId: 'turn-1', duration: 1000 });

		const data = completedEvents()[0].data as Record<string, unknown>;
		assert.strictEqual(data.model, undefined);
		assert.strictEqual(data.modelSelectionKind, 'default');
		assert.strictEqual(data.permissionLevel, undefined);
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
	});

	test('emits result=error when a queued sendMessage rejects', async () => {
		setupSession();
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
