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

/** Totals for one session's current activity period. */
class SessionSummary {
	private _clientContext: IAgentHostClientTelemetryContext | undefined;
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
		// Subagent turns inherit their parent's client, so only root turns say which client was used.
		const clientContext = report.clientContext;
		if (!clientContext || isSubagentTurn(report)) {
			return;
		}
		const isKnown = clientContext.clientType !== AgentHostClientType.Unknown;
		if (isKnown) {
			this._clientTypes.add(clientContext.clientType);
		}
		if (!this._clientContext || (isKnown && this._clientContext.clientType === AgentHostClientType.Unknown)) {
			this._clientContext = clientContext;
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
 * current period.
 */
export class SessionSummaryTelemetryContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'sessionSummaryTelemetry';
	readonly order = 900;

	private readonly _summaries = new Map<string, SessionSummary>();
	private readonly _idleTimers = this._register(new DisposableMap<string>());
	/** What outlives a period: whether this process created the session, and how many summaries it sent for it. */
	private readonly _sessions = new Map<string, { createdInHostProcess: boolean; summaryCount: number }>();

	constructor(
		_context: IAgentHostChatContributionContext,
		@IAgentHostTurnTracker turnTracker: IAgentHostTurnTracker,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostTelemetryReporter private readonly _reporter: AgentHostTelemetryReporter,
	) {
		super();
		this._register(turnTracker.onDidCompleteTurn(report => {
			const session = rootSessionOf(report.owner);
			this._getSummary(session, report.provider).addTurn(report, Date.now());
			this._armIdleTimer(session);
		}));
		this._register(turnTracker.onDidReportTurnHang(report => {
			if (isExpectedTurnHang(report.hangReason)) {
				return;
			}
			const session = rootSessionOf(report.owner);
			this._getSummary(session, report.provider).addUnexpectedHang(report, Date.now());
			this._armIdleTimer(session);
		}));
		this._register(this._stateManager.onDidDeleteSession(session => {
			this._send(session, 'deleted');
			this._sessions.delete(session);
		}));
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		if (dispatched.rejectionReason !== undefined || isAhpChatChannel(dispatched.channel)) {
			return;
		}
		const action = dispatched.action;
		// Restored sessions are registered as ready without this action, so it marks a session created by this process.
		if (action.type === ActionType.SessionReady) {
			this._getSession(dispatched.session).createdInHostProcess = true;
		} else if (action.type === ActionType.SessionIsArchivedChanged && action.isArchived) {
			this._send(dispatched.session, 'archived');
		}
	}

	onWillShutdown(): void {
		for (const session of [...this._summaries.keys()]) {
			this._send(session, 'shutdown');
		}
	}

	private _getSummary(session: string, provider: string): SessionSummary {
		let summary = this._summaries.get(session);
		if (!summary) {
			summary = new SessionSummary(provider);
			this._summaries.set(session, summary);
		}
		return summary;
	}

	private _getSession(session: string): { createdInHostProcess: boolean; summaryCount: number } {
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
		// A turn that outlasts the timeout keeps the period open; its completion re-arms the timer.
		if (this._stateManager.hasActiveTurn(session)) {
			this._armIdleTimer(session);
		} else {
			this._send(session, 'idle');
		}
	}

	private _send(session: string, reason: AgentHostSessionSummaryReason): void {
		this._idleTimers.deleteAndDispose(session);
		const summary = this._summaries.get(session);
		if (!summary) {
			return;
		}
		this._summaries.delete(session);
		const state = this._getSession(session);
		this._reporter.sessionSummary(summary.toReport(session, reason, state.summaryCount++, state.createdInHostProcess));
	}
}
