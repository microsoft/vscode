/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { InstantiationService } from '../../../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../../../log/common/log.js';
import { AgentSession, type AgentSubagentKind, type IAgentTelemetryContext } from '../../../../common/agent.js';
import type { IAgentHostChatContributions, IDispatchedAction } from '../../../../common/agentHostChatContributionsService.js';
import { AgentHostClientType } from '../../../../common/agentHostClientInfo.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../../../common/agentHostTelemetry.js';
import { SessionInputRequestKind } from '../../../../common/state/protocol/state.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, MessageKind, SessionStatus, type ErrorInfo } from '../../../../common/state/sessionState.js';
import { AgentHostChatContributions } from '../../../../node/agentHostChatContributionsService.js';
import { AgentHostClientConnectionService } from '../../../../node/agentHostClientConnectionService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../../../node/agentHostStateManager.js';
import { AgentHostTelemetryReporter, IAgentHostTelemetryReporter, type AgentHostMessageOriginTelemetryKind, type AgentHostTurnResult, type IAgentHostEventTelemetry, type IAgentHostSessionSummaryClassification, type IAgentHostSessionSummaryEvent } from '../../../../node/agentHostTelemetryReporter.js';
import { AgentHostTurnTracker, IAgentHostTurnTracker, TURN_HANG_THRESHOLD_MS } from '../../../../node/agentHostTurnTracker.js';
import { SESSION_SUMMARY_IDLE_TIMEOUT_MS, SessionSummaryTelemetryContribution } from '../../../../node/chatContributions/sessionSummaryTelemetry/sessionSummaryTelemetryContribution.js';
import { buildChatErrorInfoFromCopilotSdkFields } from '../../../../node/copilot/copilotSdkChatError.js';
import { chatTurnComplete } from '../../../common/chatActionBuilders.js';
import { CapturingTelemetryService } from '../../../common/capturingTelemetryService.js';
import { MockAgent } from '../../mockAgent.js';

/** Reports whatever account context a test sets, as a provider does after account discovery. */
class AccountAgent extends MockAgent {
	account: IAgentTelemetryContext = { copilotSku: undefined };

	getTelemetryContext(): IAgentTelemetryContext {
		return this.account;
	}
}

interface ITestTurn {
	readonly chat?: string;
	readonly subagentKind?: AgentSubagentKind;
	readonly origin?: AgentHostMessageOriginTelemetryKind;
	readonly clientType?: AgentHostClientType;
	readonly result?: AgentHostTurnResult;
	readonly error?: ErrorInfo;
	readonly tokens?: readonly [input: number, cached: number, output: number];
	readonly nanoAiu?: number;
	readonly modelCalls?: number;
	readonly steered?: boolean;
}

suite('SessionSummaryTelemetryContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const session = AgentSession.uri('mock', 'session-1').toString();
	const chat = buildDefaultChatUri(session);
	const minute = 60_000;

	function createSummaries() {
		const log = new NullLogService();
		const telemetry = new CapturingTelemetryService();
		const reporter = new AgentHostTelemetryReporter(telemetry);
		const stateManager = store.add(new AgentHostStateManager(log));
		const tracker = store.add(new AgentHostTurnTracker(reporter, store.add(new AgentHostClientConnectionService()), log));
		const instantiation = store.add(new InstantiationService(new ServiceCollection(
			[ILogService, log],
			[IAgentHostStateManager, stateManager],
			[IAgentHostTelemetryReporter, reporter],
			[IAgentHostTurnTracker, tracker],
		), true));
		const contributions: IAgentHostChatContributions = store.add(new AgentHostChatContributions(log, instantiation));
		store.add(contributions.registerContribution(SessionSummaryTelemetryContribution));
		const agent = store.add(new AccountAgent('mock', undefined, undefined, false));
		let turnCount = 0;

		/** Starts a tracked turn the way the send path and subagent routing do. */
		const start = (turn: ITestTurn = {}): string => {
			const turnId = `turn-${++turnCount}`;
			const isSubagent = turn.subagentKind !== undefined;
			const clientContext = createUnknownAgentHostClientTelemetryContext(turn.clientType ?? AgentHostClientType.AgentsWindow);
			tracker.turnStarted(agent, turn.chat ?? chat, session, turnId, undefined, undefined, 'default', undefined, undefined, clientContext, undefined, undefined, isSubagent ? 'spawning-tool-call' : undefined, turn.origin ?? (isSubagent ? MessageKind.Tool : MessageKind.User), undefined, undefined, turn.subagentKind);
			return turnId;
		};
		/** Records the turn's usage and ends it, which reports `agentHost.turnCompleted`. */
		const complete = (turnId: string, turn: ITestTurn = {}): void => {
			const turnChat = turn.chat ?? chat;
			if (turn.tokens || turn.nanoAiu !== undefined) {
				const tokenTotals = turn.tokens && [{ model: 'model', inputTokens: turn.tokens[0], cachedTokens: turn.tokens[1], outputTokens: turn.tokens[2] }];
				tracker.updateDirectUsage(turnChat, turnId, tokenTotals, turn.nanoAiu);
			}
			for (let call = 0; call < (turn.modelCalls ?? 0); call++) {
				tracker.modelCallCompleted(turnChat, turnId, `${turnId}-call-${call}`);
			}
			if (turn.steered) {
				tracker.markSteering(turnChat, turnId, 'received');
			}
			const result = turn.result ?? 'success';
			const failure = result === 'error' ? { stage: 'provider' as const, error: turn.error ?? { errorType: 'internalError', message: 'Failed' } } : undefined;
			tracker.turnCompleted(turnChat, turnId, result, failure);
		};
		/** Delivers a session action to the contribution, as `AgentSideEffects` does for every dispatched action. */
		const dispatch = (action: IDispatchedAction['action'], rejectionReason?: string): void => {
			contributions.didDispatchAction({ channel: session, session, action, ...(rejectionReason ? { rejectionReason } : {}) });
		};
		/** Registers a session in host state, so its chats can report an active turn and move to another session. */
		const createStateSession = (resource = session, defaultChat = chat): void => {
			stateManager.createSession({
				resource,
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date(0).toISOString(),
				modifiedAt: new Date(0).toISOString(),
				defaultChat,
			});
			stateManager.dispatchServerAction(resource, { type: ActionType.SessionReady });
		};
		const events = (eventName: string) => telemetry.events.filter(event => event.eventName === eventName).map(event => event.data as Record<string, unknown>);
		const summaries = () => events('agentHost.sessionSummary');
		return { agent, contributions, stateManager, tracker, start, complete, dispatch, createStateSession, events, summaries };
	}

	test('sums root and subagent turns once each, matching the per-turn events', () => runWithFakedTimers({}, async () => {
		const { contributions, start, complete, events, summaries } = createSummaries();
		const subagent: ITestTurn = { chat: buildSubagentChatUri(session, 'spawning-tool-call'), subagentKind: 'task' };
		const automation: ITestTurn = { origin: MessageKind.Automation };

		const root = start();
		const child = start(subagent);
		await timeout(100);
		complete(child, { ...subagent, tokens: [50, 20, 5], nanoAiu: 300, modelCalls: 1 });
		const failedChild = start(subagent);
		await timeout(50);
		complete(failedChild, { ...subagent, result: 'error', error: { errorType: 'subagentFailed', message: 'Failed' } });
		await timeout(850);
		complete(root, { tokens: [100, 40, 10], nanoAiu: 1000, modelCalls: 2 });
		const steered = start();
		await timeout(500);
		// Cancelled after a model call but before its AI credits were reported.
		complete(steered, { result: 'cancelled', steered: true, modelCalls: 1 });
		const quota = start(automation);
		await timeout(100);
		complete(quota, { ...automation, result: 'error', error: { errorType: 'quota', message: 'Quota reached' } });
		const failed = start();
		await timeout(400);
		complete(failed, { result: 'error' });
		// A rate limit reached by a provider request, classified only by its forwarded HTTP status.
		complete(start(), { result: 'error', error: buildChatErrorInfoFromCopilotSdkFields({ errorType: 'query', message: 'Too many requests', statusCode: 429 }) });
		contributions.willShutdown();

		const turns = events('agentHost.turnCompleted');
		const sum = (field: string) => turns.reduce((total, turn) => total + (typeof turn[field] === 'number' ? turn[field] : 0), 0);
		assert.deepStrictEqual({
			summaries: summaries(),
			turnEventTotals: { promptTokenCount: sum('directPromptTokenCount'), totalBilledNanoAiu: sum('directBilledNanoAiu'), modelCallCount: sum('modelCallCount') },
		}, {
			summaries: [{
				initiatorClientType: AgentHostClientType.AgentsWindow,
				schemaVersion: 1,
				provider: 'mock',
				agentSessionId: 'session-1',
				summaryReason: 'shutdown',
				summaryIndex: 0,
				createdInHostProcess: false,
				multipleClientTypes: false,
				rootTurnCount: 5,
				userTurnCount: 4,
				subagentTurnCount: 2,
				failedTurnCount: 3,
				cancelledTurnCount: 1,
				usageLimitFailedTurnCount: 2,
				failedSubagentTurnCount: 1,
				unexpectedHangTurnCount: 0,
				recoveredHangTurnCount: 0,
				steeredTurnCount: 1,
				modelCallCount: 4,
				promptTokenCount: 150,
				promptCacheTokenCount: 60,
				completionTokenCount: 15,
				rootBilledNanoAiu: 1000,
				subagentBilledNanoAiu: 300,
				totalBilledNanoAiu: 1300,
				missingBilledNanoAiuTurnCount: 1,
				durationMs: 2000,
				activeMs: 2000,
			}],
			turnEventTotals: { promptTokenCount: 150, totalBilledNanoAiu: 1300, modelCallCount: 4 },
		});
	}));

	test('describes the first known client, preferring root turns, and the latest account context of the period', () => runWithFakedTimers({}, async () => {
		const { agent, contributions, start, complete, dispatch, summaries } = createSummaries();
		const subagent: ITestTurn = { chat: buildSubagentChatUri(session, 'spawning-tool-call'), subagentKind: 'task', clientType: AgentHostClientType.EditorWindow };
		agent.account = { copilotSku: 'first_sku', copilotTrackingId: 'first-tracking-id' };
		complete(start({ clientType: AgentHostClientType.Unknown }));
		// A subagent turn carries the client of the turn that started it, so it counts as that client.
		complete(start(subagent), subagent);
		agent.account = { copilotSku: 'latest_sku', copilotTrackingId: 'latest-tracking-id' };
		complete(start({ clientType: AgentHostClientType.AgentsWindow }));
		dispatch({ type: ActionType.SessionIsArchivedChanged, isArchived: true });
		complete(start({ clientType: AgentHostClientType.Unknown }));
		complete(start({ clientType: AgentHostClientType.EditorWindow }));
		complete(start({ clientType: AgentHostClientType.AgentsWindow }));
		contributions.willShutdown();

		assert.deepStrictEqual(summaries().map(summary => ({
			initiatorClientType: summary.initiatorClientType,
			multipleClientTypes: summary.multipleClientTypes,
			copilotSku: summary.copilotSku,
			copilotTrackingId: summary['common.copilotTrackingId'],
		})), [
			{ initiatorClientType: AgentHostClientType.AgentsWindow, multipleClientTypes: true, copilotSku: 'latest_sku', copilotTrackingId: 'latest-tracking-id' },
			{ initiatorClientType: AgentHostClientType.EditorWindow, multipleClientTypes: true, copilotSku: 'latest_sku', copilotTrackingId: 'latest-tracking-id' },
		]);
	}));

	test('describes the earliest-started of equally ranked turns, whatever order they end in', () => runWithFakedTimers({}, async () => {
		const { contributions, start, complete, summaries } = createSummaries();
		const peer: ITestTurn = { chat: buildChatUri(session, 'peer'), clientType: AgentHostClientType.AgentsWindow };
		const first = start({ clientType: AgentHostClientType.EditorWindow });
		await timeout(1000);
		// A turn started later in a peer chat ends first.
		complete(start(peer), peer);
		await timeout(1000);
		complete(first);
		contributions.willShutdown();

		assert.deepStrictEqual(summaries().map(summary => ({ initiatorClientType: summary.initiatorClientType, multipleClientTypes: summary.multipleClientTypes, rootTurnCount: summary.rootTurnCount })), [
			{ initiatorClientType: AgentHostClientType.EditorWindow, multipleClientTypes: true, rootTurnCount: 2 },
		]);
	}));

	test('attributes a period with only subagent turns to the client of the turn that started them', () => {
		const { start, complete, dispatch, summaries } = createSummaries();
		const subagent: ITestTurn = { chat: buildSubagentChatUri(session, 'spawning-tool-call'), subagentKind: 'task', clientType: AgentHostClientType.AgentsWindow };
		start({ clientType: AgentHostClientType.AgentsWindow });
		complete(start(subagent), subagent);
		dispatch({ type: ActionType.SessionIsArchivedChanged, isArchived: true });

		assert.deepStrictEqual(summaries().map(summary => ({ summaryReason: summary.summaryReason, initiatorClientType: summary.initiatorClientType, rootTurnCount: summary.rootTurnCount, subagentTurnCount: summary.subagentTurnCount })), [
			{ summaryReason: 'archived', initiatorClientType: AgentHostClientType.AgentsWindow, rootTurnCount: 0, subagentTurnCount: 1 },
		]);
	});

	test('sends an idle summary only after the session has had no active turn for the timeout', () => runWithFakedTimers({}, async () => {
		const { stateManager, tracker, start, complete, createStateSession, summaries } = createSummaries();
		createStateSession();
		const first = start();
		await timeout(minute);
		complete(first);
		await timeout(9 * minute);
		// A turn that waits on the user past the idle timeout keeps the period open.
		const waiting = start();
		stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnStarted, turnId: waiting, startedAt: new Date().toISOString(), message: { text: 'Hello', origin: { kind: MessageKind.User } } });
		tracker.turnBlocked(chat, waiting, 'confirmation', SessionInputRequestKind.ToolConfirmation, undefined);
		await timeout(35 * minute);
		const sentWhileActive = summaries().length;
		stateManager.dispatchServerAction(chat, chatTurnComplete(waiting, 0));
		complete(waiting);
		await timeout(SESSION_SUMMARY_IDLE_TIMEOUT_MS - 1);
		const sentBeforeTimeout = summaries().length;
		await timeout(1);

		assert.deepStrictEqual({
			sentWhileActive,
			sentBeforeTimeout,
			summaries: summaries().map(summary => ({ summaryReason: summary.summaryReason, rootTurnCount: summary.rootTurnCount, durationMs: summary.durationMs, activeMs: summary.activeMs })),
		}, {
			sentWhileActive: 0,
			sentBeforeTimeout: 0,
			summaries: [{ summaryReason: 'idle', rootTurnCount: 2, durationMs: 45 * minute, activeMs: 36 * minute }],
		});
	}));

	test('restarts the idle timeout once a turn that outlasts it ends, without polling while it runs', () => runWithFakedTimers({}, async () => {
		const { stateManager, start, complete, createStateSession, summaries } = createSummaries();
		createStateSession();
		complete(start());
		// Runs in host state only, so only the session becoming idle can restart the timeout.
		stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnStarted, turnId: 'long', startedAt: new Date().toISOString(), message: { text: 'Hello', origin: { kind: MessageKind.User } } });
		// Far more idle timeouts than the faked timers allow events, so a timer per timeout would fail the run.
		await timeout(100 * SESSION_SUMMARY_IDLE_TIMEOUT_MS + minute);
		const sentWhileActive = summaries().length;
		stateManager.dispatchServerAction(chat, chatTurnComplete('long', 0));
		await timeout(SESSION_SUMMARY_IDLE_TIMEOUT_MS - 1);
		const sentBeforeTimeout = summaries().length;
		await timeout(1);

		assert.deepStrictEqual({
			sentWhileActive,
			sentBeforeTimeout,
			summaryReasons: summaries().map(summary => summary.summaryReason),
		}, { sentWhileActive: 0, sentBeforeTimeout: 0, summaryReasons: ['idle'] });
	}));

	test('sends once per archive, shutdown and deletion, numbering the periods of the session', () => {
		const { contributions, stateManager, start, complete, dispatch, createStateSession, summaries } = createSummaries();
		createStateSession();
		dispatch({ type: ActionType.SessionReady });
		complete(start());
		dispatch({ type: ActionType.SessionIsArchivedChanged, isArchived: true }, 'rejected');
		dispatch({ type: ActionType.SessionIsArchivedChanged, isArchived: true });
		dispatch({ type: ActionType.SessionIsArchivedChanged, isArchived: true });
		complete(start());
		contributions.willShutdown();
		contributions.willShutdown();
		complete(start());
		stateManager.deleteSession(session);

		assert.deepStrictEqual(summaries().map(summary => ({ summaryReason: summary.summaryReason, summaryIndex: summary.summaryIndex, createdInHostProcess: summary.createdInHostProcess, rootTurnCount: summary.rootTurnCount })), [
			{ summaryReason: 'archived', summaryIndex: 0, createdInHostProcess: true, rootTurnCount: 1 },
			{ summaryReason: 'shutdown', summaryIndex: 1, createdInHostProcess: true, rootTurnCount: 1 },
			{ summaryReason: 'deleted', summaryIndex: 2, createdInHostProcess: true, rootTurnCount: 1 },
		]);
	});

	test('counts a turn that moves with its chat toward the session it moved to', () => {
		const { contributions, stateManager, start, complete, dispatch, createStateSession, summaries } = createSummaries();
		const target = AgentSession.uri('mock', 'session-2').toString();
		createStateSession();
		createStateSession(target, buildDefaultChatUri(target));
		dispatch({ type: ActionType.SessionReady });
		complete(start());
		// The turn tracker keeps the session a turn started in as its owner, and moving the session deletes it.
		const running = start();
		stateManager.transferSession(session, target, [chat], undefined, true);
		complete(running);
		contributions.willShutdown();

		assert.deepStrictEqual(summaries().map(summary => ({ agentSessionId: summary.agentSessionId, summaryReason: summary.summaryReason, summaryIndex: summary.summaryIndex, createdInHostProcess: summary.createdInHostProcess, rootTurnCount: summary.rootTurnCount })), [
			{ agentSessionId: 'session-1', summaryReason: 'deleted', summaryIndex: 0, createdInHostProcess: true, rootTurnCount: 1 },
			{ agentSessionId: 'session-2', summaryReason: 'shutdown', summaryIndex: 0, createdInHostProcess: false, rootTurnCount: 1 },
		]);
	});

	test('marks a session whose first send failed before it was created as created in this process', () => {
		const { contributions, start, complete, dispatch, summaries } = createSummaries();
		complete(start(), { result: 'error' });
		dispatch({ type: ActionType.SessionCreationFailed, error: { errorType: 'internalError', message: 'Failed' } });
		contributions.willShutdown();

		assert.deepStrictEqual(summaries().map(summary => ({ createdInHostProcess: summary.createdInHostProcess, failedTurnCount: summary.failedTurnCount })), [
			{ createdInHostProcess: true, failedTurnCount: 1 },
		]);
	});

	test('sends nothing for a session without a completed turn or an unexpected hang', () => runWithFakedTimers({}, async () => {
		const { contributions, stateManager, tracker, start, dispatch, createStateSession, events, summaries } = createSummaries();
		createStateSession();
		dispatch({ type: ActionType.SessionReady });
		const waiting = start();
		tracker.turnBlocked(chat, waiting, 'confirmation', SessionInputRequestKind.ToolConfirmation, undefined);
		await timeout(TURN_HANG_THRESHOLD_MS + 1);
		dispatch({ type: ActionType.SessionIsArchivedChanged, isArchived: true });
		contributions.willShutdown();
		stateManager.deleteSession(session);
		await timeout(SESSION_SUMMARY_IDLE_TIMEOUT_MS);

		assert.deepStrictEqual({
			hangReasons: events('agentHost.turnHung').map(hang => hang.hangReason),
			summaries: summaries(),
		}, { hangReasons: ['waitingOnUser'], summaries: [] });
	}));

	test('counts an unexpected hang once per turn, and as recovered when the turn completes', () => runWithFakedTimers({}, async () => {
		const { contributions, tracker, start, complete, events, summaries } = createSummaries();
		const peer: ITestTurn = { chat: buildChatUri(session, 'peer') };
		const recovered = start();
		start(peer);
		await timeout(TURN_HANG_THRESHOLD_MS + 1);
		tracker.markActivity(chat, recovered, ActionType.ChatDelta);
		await timeout(TURN_HANG_THRESHOLD_MS + 1);
		complete(recovered);
		contributions.willShutdown();

		assert.deepStrictEqual({
			hangReasons: events('agentHost.turnHung').map(hang => hang.hangReason),
			summaries: summaries().map(summary => ({ rootTurnCount: summary.rootTurnCount, unexpectedHangTurnCount: summary.unexpectedHangTurnCount, recoveredHangTurnCount: summary.recoveredHangTurnCount })),
		}, {
			hangReasons: ['noProgress', 'noProgress', 'stalledAfterProgress'],
			summaries: [{ rootTurnCount: 1, unexpectedHangTurnCount: 2, recoveredHangTurnCount: 1 }],
		});
	}));

	test('classifies every numeric and boolean field as a measurement and no other field', () => {
		type CheckMeasurements<E, C> = {
			[K in keyof E]-?: K extends keyof C
			? NonNullable<E[K]> extends number | boolean
			? C[K] extends { isMeasurement: true } ? true : never
			: 'isMeasurement' extends keyof C[K] ? never : true
			: never;
		};
		const checked: CheckMeasurements<Omit<IAgentHostSessionSummaryEvent, keyof IAgentHostEventTelemetry>, IAgentHostSessionSummaryClassification> = {
			schemaVersion: true, provider: true, agentSessionId: true, summaryReason: true, summaryIndex: true, createdInHostProcess: true, multipleClientTypes: true,
			rootTurnCount: true, userTurnCount: true, subagentTurnCount: true, failedTurnCount: true, cancelledTurnCount: true, usageLimitFailedTurnCount: true,
			failedSubagentTurnCount: true, unexpectedHangTurnCount: true, recoveredHangTurnCount: true, steeredTurnCount: true, modelCallCount: true,
			promptTokenCount: true, promptCacheTokenCount: true, completionTokenCount: true, rootBilledNanoAiu: true, subagentBilledNanoAiu: true, totalBilledNanoAiu: true,
			missingBilledNanoAiuTurnCount: true, durationMs: true, activeMs: true,
		};
		assert.ok(Object.values(checked).every(value => value));
	});
});
