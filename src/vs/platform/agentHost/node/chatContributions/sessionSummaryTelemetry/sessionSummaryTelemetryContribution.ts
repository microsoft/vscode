/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../../base/common/async.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import type { IAgentTelemetryContext } from '../../../common/agent.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { AgentHostClientType } from '../../../common/agentHostClientInfo.js';
import type { IAgentHostClientTelemetryContext } from '../../../common/agentHostTelemetry.js';
import { readForwardedChatErrorFetchType } from '../../../common/meta/errorMeta.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { isAhpChatChannel, isSubagentSession, MessageKind, parseSubagentSessionUri, type ErrorInfo } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { AgentHostTelemetryReporter, IAgentHostTelemetryReporter, isExpectedTurnHang, type AgentHostSessionSummaryReason, type IAgentHostSessionSummaryReport, type IAgentHostSessionSummaryTotals, type IAgentHostTurnCompletedReport, type IAgentHostTurnHungReport } from '../../agentHostTelemetryReporter.js';
import { IAgentHostTurnTracker } from '../../agentHostTurnTracker.js';

/** How long a session must have no active turn before its summary is sent. */
export const SESSION_SUMMARY_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** Copilot SDK error types, and forwarded fetch classifications, for a reached quota or rate limit. */
const usageLimitErrorTypes: ReadonlySet<string> = new Set(['quota', 'rate_limit']);
const usageLimitFetchTypes: ReadonlySet<string> = new Set(['quotaExceeded', 'rateLimited']);

function isUsageLimitError(error: ErrorInfo): boolean {
	const fetchType = readForwardedChatErrorFetchType(error);
	return usageLimitErrorTypes.has(error.errorType) || (fetchType !== undefined && usageLimitFetchTypes.has(fetchType));
}

/** The rule `isSubagentSession` uses on the turn events, so the summary's root and subagent split matches theirs. */
function isSubagentTurn(report: IAgentHostTurnCompletedReport | IAgentHostTurnHungReport): boolean {
	return report.subagentKind !== undefined || isSubagentSession(report.owner);
}

/** The root session a turn's owner belongs to, so a legacy subagent session's turns count toward its parent. */
function rootSessionOf(owner: string): string {
	let session = owner;
	for (let parsed = parseSubagentSessionUri(session); parsed; parsed = parseSubagentSessionUri(session)) {
		session = parsed.parentSession.toString();
	}
	return session;
}

function addOptional(total: number | undefined, value: number | undefined): number | undefined {
	return value === undefined ? total : (total ?? 0) + value;
}

/** Ranks a turn's client context as the initiator of its period: a known client first, then a root turn before a subagent turn. */
function initiatorRank(clientContext: IAgentHostClientTelemetryContext, isSubagent: boolean): number {
	return (clientContext.clientType !== AgentHostClientType.Unknown ? 2 : 0) + (isSubagent ? 0 : 1);
}

/** What outlives a session's activity periods in this process. */
interface ISessionSummaryState {
	/** Whether this process created the session, rather than restoring it. */
	createdInHostProcess: boolean;
	/** How many summaries this process sent for the session. */
	summaryCount: number;
}

/** Totals for one session's current activity period. */
class SessionActivityPeriod {
	private _clientContext: IAgentHostClientTelemetryContext | undefined;
	private _clientContextRank = -1;
	private _clientContextStart = Number.POSITIVE_INFINITY;
	private readonly _clientTypes = new Set<AgentHostClientType>();
	private _telemetryContext: IAgentTelemetryContext | undefined;
	/** Turns, by chat and turn id, with an unexpected hang and no completion yet. */
	private readonly _hungTurns = new Set<string>();
	private _firstActivity = Number.POSITIVE_INFINITY;
	private _lastActivity = Number.NEGATIVE_INFINITY;
	private readonly _totals: IAgentHostSessionSummaryTotals = {
		rootTurnCount: 0,
		userTurnCount: 0,
		subagentTurnCount: 0,
		failedTurnCount: 0,
		cancelledTurnCount: 0,
		usageLimitFailedTurnCount: 0,
		failedSubagentTurnCount: 0,
		unexpectedHangTurnCount: 0,
		recoveredHangTurnCount: 0,
		steeredTurnCount: 0,
		modelCallCount: 0,
		promptTokenCount: undefined,
		promptCacheTokenCount: undefined,
		completionTokenCount: undefined,
		rootBilledNanoAiu: undefined,
		subagentBilledNanoAiu: undefined,
		totalBilledNanoAiu: undefined,
		missingBilledNanoAiuTurnCount: 0,
		durationMs: 0,
		activeMs: 0,
	};

	constructor(private readonly _provider: string) { }

	addTurn(report: IAgentHostTurnCompletedReport, now: number): void {
		const totalTime = Math.max(0, report.totalTime);
		this._observe(report, now - totalTime, now);
		const totals = this._totals;
		if (this._hungTurns.delete(`${report.session}\0${report.turnId}`)) {
			totals.recoveredHangTurnCount++;
		}
		// Each turn reports only its own model calls, tokens and credits, so root and subagent turns add up without overlap.
		totals.modelCallCount += report.modelCallCount;
		totals.promptTokenCount = addOptional(totals.promptTokenCount, report.directPromptTokenCount);
		totals.promptCacheTokenCount = addOptional(totals.promptCacheTokenCount, report.directPromptCacheTokenCount);
		totals.completionTokenCount = addOptional(totals.completionTokenCount, report.directCompletionTokenCount);
		if (report.modelCallCount > 0 && report.directBilledNanoAiu === undefined) {
			totals.missingBilledNanoAiuTurnCount++;
		}
		if (isSubagentTurn(report)) {
			totals.subagentTurnCount++;
			if (report.result === 'error') {
				totals.failedSubagentTurnCount++;
			}
			totals.subagentBilledNanoAiu = addOptional(totals.subagentBilledNanoAiu, report.directBilledNanoAiu);
			return;
		}
		totals.rootTurnCount++;
		if (report.messageOriginKind === MessageKind.User) {
			totals.userTurnCount++;
		}
		if (report.result === 'error') {
			totals.failedTurnCount++;
			if (report.failure && isUsageLimitError(report.failure.error)) {
				totals.usageLimitFailedTurnCount++;
			}
		} else if (report.result === 'cancelled') {
			totals.cancelledTurnCount++;
		}
		if (report.receivedSteering) {
			totals.steeredTurnCount++;
		}
		totals.rootBilledNanoAiu = addOptional(totals.rootBilledNanoAiu, report.directBilledNanoAiu);
		totals.activeMs += totalTime;
	}

	addUnexpectedHang(report: IAgentHostTurnHungReport, now: number): void {
		this._observe(report, now - Math.max(0, report.turnElapsedMs), now);
		const turn = `${report.session}\0${report.turnId}`;
		// The watchdog reports each reason once, so one turn can report both unexpected reasons.
		if (!this._hungTurns.has(turn)) {
			this._hungTurns.add(turn);
			this._totals.unexpectedHangTurnCount++;
		}
	}

	toReport(session: string, summaryReason: AgentHostSessionSummaryReason, summaryIndex: number, createdInHostProcess: boolean): IAgentHostSessionSummaryReport {
		const totals = this._totals;
		return {
			clientContext: this._clientContext,
			telemetryContext: this._telemetryContext,
			provider: this._provider,
			session,
			summaryReason,
			summaryIndex,
			createdInHostProcess,
			multipleClientTypes: this._clientTypes.size > 1,
			totals: {
				...totals,
				totalBilledNanoAiu: addOptional(totals.rootBilledNanoAiu, totals.subagentBilledNanoAiu),
				durationMs: Math.round(Math.max(0, this._lastActivity - this._firstActivity)),
				activeMs: Math.round(totals.activeMs),
			},
		};
	}

	private _observe(report: IAgentHostTurnCompletedReport | IAgentHostTurnHungReport, start: number, end: number): void {
		this._firstActivity = Math.min(this._firstActivity, start);
		this._lastActivity = Math.max(this._lastActivity, end);
		// Read the account context now: it stops resolving once its authentication is no longer current.
		const copilotSku = report.telemetryContext?.copilotSku;
		const copilotTrackingId = report.telemetryContext?.copilotTrackingId;
		if (copilotSku !== undefined || copilotTrackingId !== undefined) {
			this._telemetryContext = { copilotSku, copilotTrackingId };
		}
		// Subagent turns are started with the client context of the turn that started them, so they can stand in for it,
		// for example when the session is archived while that turn still runs.
		const clientContext = report.clientContext;
		if (!clientContext) {
			return;
		}
		if (clientContext.clientType !== AgentHostClientType.Unknown) {
			this._clientTypes.add(clientContext.clientType);
		}
		const rank = initiatorRank(clientContext, isSubagentTurn(report));
		// Concurrent turns can end in any order, so the earliest-started of equally ranked turns describes the period.
		if (rank > this._clientContextRank || (rank === this._clientContextRank && start < this._clientContextStart)) {
			this._clientContext = clientContext;
			this._clientContextRank = rank;
			this._clientContextStart = start;
		}
	}
}

/**
 * Sends `agentHost.sessionSummary`, one event per session and activity period
 * that sums the reports behind `agentHost.turnCompleted` and
 * `agentHost.turnHung`, so per-session metrics need no joins across events.
 *
 * A period starts with the first turn completion or unexpected hang reported
 * for a session. It ends when the session has had no active turn for
 * {@link SESSION_SUMMARY_IDLE_TIMEOUT_MS}, is archived or deleted, or when the
 * host begins a graceful shutdown. A session with nothing to report sends
 * nothing. Totals live only in memory, so a crash or forced exit loses the
 * current period, and so do turns that end after a graceful shutdown begins.
 *
 * A turn counts toward the session that owns its chat when the turn is
 * reported, so a turn that moves with its chat counts toward the session it
 * moved to.
 */
export class SessionSummaryTelemetryContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'sessionSummaryTelemetry';
	readonly order = 900;

	private readonly _periods = new Map<string, SessionActivityPeriod>();
	private readonly _idleTimers = this._register(new DisposableMap<string>());
	private readonly _sessions = new Map<string, ISessionSummaryState>();

	constructor(
		_context: IAgentHostChatContributionContext,
		@IAgentHostTurnTracker turnTracker: IAgentHostTurnTracker,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostTelemetryReporter private readonly _reporter: AgentHostTelemetryReporter,
	) {
		super();
		this._register(turnTracker.onDidCompleteTurn(report => {
			const session = this._sessionOf(report);
			this._getPeriod(session, report.provider).addTurn(report, Date.now());
			this._armIdleTimer(session);
		}));
		this._register(turnTracker.onDidReportTurnHang(report => {
			if (isExpectedTurnHang(report.hangReason)) {
				return;
			}
			const session = this._sessionOf(report);
			this._getPeriod(session, report.provider).addUnexpectedHang(report, Date.now());
			this._armIdleTimer(session);
		}));
		this._register(this._stateManager.onDidDeleteSession(session => {
			this._send(session, 'deleted');
			this._sessions.delete(session);
		}));
		// Restarts the timeout once the session has no active turn, also after a turn that no report covers.
		this._register(this._stateManager.onDidChangeSessionActiveTurn(({ session, active }) => {
			if (!active && this._periods.has(session)) {
				this._armIdleTimer(session);
			}
		}));
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		const action = dispatched.action;
		// Checks the type first: this runs for every dispatched action, including each streamed delta.
		if ((action.type !== ActionType.SessionReady && action.type !== ActionType.SessionCreationFailed && action.type !== ActionType.SessionIsArchivedChanged)
			|| dispatched.rejectionReason !== undefined || isAhpChatChannel(dispatched.channel)) {
			return;
		}
		if (action.type === ActionType.SessionIsArchivedChanged) {
			if (action.isArchived) {
				this._send(dispatched.session, 'archived');
			}
		} else {
			// A session this process creates becomes ready, or fails creation on its first send. Restored sessions are
			// registered as ready without either action.
			this._getSession(dispatched.session).createdInHostProcess = true;
		}
	}

	onWillShutdown(): void {
		for (const session of [...this._periods.keys()]) {
			this._send(session, 'shutdown');
		}
	}

	/**
	 * The root session a turn counts toward: the one that owns its chat now, so a turn that moved with its chat
	 * counts toward the session it moved to. The tracker keeps the owner the turn started with.
	 */
	private _sessionOf(report: IAgentHostTurnCompletedReport | IAgentHostTurnHungReport): string {
		return rootSessionOf(this._stateManager.getChatOwner(report.session) ?? report.owner);
	}

	private _getPeriod(session: string, provider: string): SessionActivityPeriod {
		let period = this._periods.get(session);
		if (!period) {
			period = new SessionActivityPeriod(provider);
			this._periods.set(session, period);
		}
		return period;
	}

	private _getSession(session: string): ISessionSummaryState {
		let state = this._sessions.get(session);
		if (!state) {
			state = { createdInHostProcess: false, summaryCount: 0 };
			this._sessions.set(session, state);
		}
		return state;
	}

	private _armIdleTimer(session: string): void {
		this._idleTimers.set(session, disposableTimeout(() => this._onIdleTimeout(session), SESSION_SUMMARY_IDLE_TIMEOUT_MS));
	}

	private _onIdleTimeout(session: string): void {
		// A turn that outlasts the timeout keeps the period open. Rather than polling, the timeout restarts once the session has no active turn.
		if (this._stateManager.hasActiveTurn(session)) {
			this._idleTimers.deleteAndDispose(session);
		} else {
			this._send(session, 'idle');
		}
	}

	private _send(session: string, reason: AgentHostSessionSummaryReason): void {
		this._idleTimers.deleteAndDispose(session);
		const period = this._periods.get(session);
		if (!period) {
			return;
		}
		this._periods.delete(session);
		const state = this._getSession(session);
		this._reporter.sessionSummary(period.toReport(session, reason, state.summaryCount++, state.createdInHostProcess));
	}
}
