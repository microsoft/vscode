/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, toDisposable } from '../../../base/common/lifecycle.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import type { SessionMode } from '../common/agentHostSchema.js';
import { createUnknownAgentHostClientTelemetryContext, type IAgentHostClientTelemetryContext } from '../common/agentHostTelemetry.js';
import { AgentHostClientType } from '../common/agentHostClientInfo.js';
import { canRefineContributor, toolSourceKindFromContributor } from './agentHostToolCallTracker.js';
import { SessionInputRequestKind } from '../common/state/protocol/state.js';
import type { ToolCallContributor } from '../common/state/sessionState.js';
import type { AgentHostModelTelemetryKind, AgentHostTelemetryReporter, AgentHostTurnHangReason, AgentHostTurnResult, IAgentHostTurnFailure } from './agentHostTelemetryReporter.js';

/**
 * How long a turn must go without any observed activity before the watchdog
 * reports it. Matches {@link TOOL_CALL_STALL_THRESHOLD_MS} in
 * `agentHostToolCallTracker.ts` so the two hang signals line up on dashboards.
 */
export const TURN_HANG_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * How many consecutive quiet windows the watchdog re-arms for. Each report is
 * deduped per {@link AgentHostTurnHangReason}, so re-arming exists only to
 * catch a *change* of state (e.g. the user answers a confirmation and the turn
 * then hangs for real). After this many quiet windows the watchdog stops
 * arming; any later activity re-arms it. This keeps the number of live timers
 * and emitted events bounded for a permanently dead turn.
 */
const MAX_HANG_CHECK_WINDOWS = 6;

/** Sentinel `lastActivityKind` for a turn that never produced any activity. */
export const TURN_ACTIVITY_NONE = 'none';

/** Identity of a tool call that has started but not yet completed. */
interface IInFlightToolCall {
	readonly toolId: string;
	contributor: ToolCallContributor | undefined;
	toolSourceKind: string;
}

/** An outstanding session input request, and the tool call it gates if any. */
interface ITurnBlocker {
	readonly kind: SessionInputRequestKind;
	readonly toolCallId: string | undefined;
}

/** Per-turn timing state, keyed by `session:turnId`. */
interface ITurnTiming {
	readonly stopWatch: StopWatch;
	readonly provider: string;
	readonly session: string;
	readonly turnId: string;
	model: string | undefined;
	modelTelemetryKind: AgentHostModelTelemetryKind | undefined;
	readonly modelSelectionKind: 'default' | 'auto' | 'explicit';
	readonly permissionLevel: string | undefined;
	readonly interactionMode: SessionMode | undefined;
	readonly clientContext: IAgentHostClientTelemetryContext;
	firstProgressMs: number | undefined;

	// Hang watchdog state
	/** Reset on every observed activity; measures the current quiet period. */
	quietStopWatch: StopWatch;
	/** Protocol action type of the last observed activity, or `none`. */
	lastActivityKind: string;
	/**
	 * Tool calls that have started but not completed, by tool call id. Insertion
	 * ordered, so the first entry is the longest-running call.
	 */
	readonly inFlightToolCalls: Map<string, IInFlightToolCall>;
	/** Outstanding session input requests for this turn, by request id. */
	readonly blockers: Map<string, ITurnBlocker>;
	/** Hang reasons already reported, so each is emitted at most once per turn. */
	readonly reportedHangReasons: Set<AgentHostTurnHangReason>;
	/** Number of hang reports emitted for this turn. */
	hangReportCount: number;
	/** The most recently reported hang reason, for the paired recovery event. */
	lastHangReason: AgentHostTurnHangReason | undefined;
	/** Started when the first hang report is emitted; measures recovery time. */
	lastHangStopWatch: StopWatch | undefined;
	/** Consecutive quiet windows the watchdog has observed. */
	quietWindows: number;
}

/**
 * Tracks per-turn timing for agent host sessions and reports a completion
 * event via the provided {@link AgentHostTelemetryReporter} when a turn ends.
 *
 * Lifecycle per turn:
 *   1. {@link turnStarted} — begins a stopwatch for the turn and arms the hang
 *      watchdog
 *   2. {@link markFirstProgress} — records elapsed time to first visible output
 *      (only the first call per turn has an effect)
 *   3. {@link markActivity} — records any observed turn activity and debounces
 *      the hang watchdog
 *   4. {@link turnCompleted} — emits the telemetry event and clears state
 *
 * The hang watchdog gives a *positive* signal for stuck turns. Without it a
 * turn that starts and never completes is only visible as the absence of an
 * `agentHost.turnCompleted` event, which does not show up on dashboards. When
 * a turn goes {@link TURN_HANG_THRESHOLD_MS} without activity the tracker
 * reports `agentHost.turnHung` with the state it was quiet in; if such a turn
 * later completes, it also reports `agentHost.hungTurnCompleted` so permanent
 * hangs can be separated from merely slow ones.
 */
export class AgentHostTurnTracker extends Disposable {

	private readonly _turnTimings = new Map<string, ITurnTiming>();
	private readonly _hangWatchdogs = this._register(new DisposableMap<string>());
	/** Maps `session:requestId` to the turn key blocked on that request. */
	private readonly _blockerTurnKeys = new Map<string, string>();

	/**
	 * Fires with the provider id whenever a turn starts, i.e. whenever the host
	 * is about to make an LLM request on that provider's behalf.
	 *
	 * Consumed by {@link AgentModelRefreshScheduler} to gate its periodic model
	 * refresh on real usage, so an idle host issues no `models` network
	 * requests at all. Local host commands (`/rename`, `!command`) are
	 * intercepted before `turnStarted` is reached and so correctly do not count
	 * as activity.
	 */
	private readonly _onDidStartTurn = this._register(new Emitter<string>());
	readonly onDidStartTurn: Event<string> = this._onDidStartTurn.event;

	constructor(private readonly _reporter: AgentHostTelemetryReporter) {
		super();
		this._register(toDisposable(() => {
			this._turnTimings.clear();
			this._blockerTurnKeys.clear();
		}));
	}

	turnStarted(provider: string, session: string, turnId: string, model: string | undefined, modelTelemetryKind: AgentHostModelTelemetryKind | undefined, permissionLevel: string | undefined, interactionMode: SessionMode | undefined, clientContext = createUnknownAgentHostClientTelemetryContext(AgentHostClientType.Unknown)): void {
		const key = this._key(session, turnId);
		this._turnTimings.set(key, {
			stopWatch: StopWatch.create(false),
			provider,
			session,
			turnId,
			model,
			modelTelemetryKind,
			modelSelectionKind: model === undefined ? 'default' : model === 'auto' ? 'auto' : 'explicit',
			permissionLevel,
			interactionMode,
			clientContext,
			firstProgressMs: undefined,
			quietStopWatch: StopWatch.create(false),
			lastActivityKind: TURN_ACTIVITY_NONE,
			inFlightToolCalls: new Map(),
			blockers: new Map(),
			reportedHangReasons: new Set(),
			hangReportCount: 0,
			lastHangReason: undefined,
			lastHangStopWatch: undefined,
			quietWindows: 0,
		});
		this._armHangWatchdog(key);
		this._onDidStartTurn.fire(provider);
	}

	markFirstProgress(session: string, turnId: string): void {
		const timing = this._turnTimings.get(this._key(session, turnId));
		if (timing && timing.firstProgressMs === undefined) {
			timing.firstProgressMs = timing.stopWatch.elapsed();
		}
	}

	/**
	 * Records observed activity for a turn. `activityKind` is the protocol
	 * action type that produced it, which is emitted verbatim in the hang event
	 * so a hang can be attributed to what the turn was last doing.
	 *
	 * Every call debounces the hang watchdog, so a turn that keeps producing
	 * signals of any kind is never reported as hung. This is deliberately
	 * broader than {@link markFirstProgress}, which only counts *visible*
	 * progress for the time-to-first-progress metric.
	 */
	markActivity(session: string, turnId: string, activityKind: string): void {
		const key = this._key(session, turnId);
		const timing = this._turnTimings.get(key);
		if (!timing) {
			return;
		}
		timing.lastActivityKind = activityKind;
		this._touch(key, timing);
	}

	/** Resets the quiet period and re-arms the watchdog for a live turn. */
	private _touch(key: string, timing: ITurnTiming): void {
		timing.quietStopWatch = StopWatch.create(true);
		timing.quietWindows = 0;
		this._armHangWatchdog(key);
	}

	/**
	 * Records that a tool call is in flight for the turn. An in-flight tool
	 * call explains an otherwise quiet turn (a long build, or a subagent whose
	 * progress is reported on its own chat channel), so the hang is reported
	 * with the `runningTool` reason rather than as an unexplained stall.
	 *
	 * The tool's identity is retained so a hang report can name what the turn
	 * is stuck on. This matters most for agent-host-provided tools: those never
	 * enter the session input queue, so `agentHost.toolCallStalled` — which
	 * only fires for blocked tool calls — cannot see them at all.
	 */
	toolCallStarted(session: string, turnId: string, toolCallId: string, toolName: string, contributor: ToolCallContributor | undefined): void {
		this._turnTimings.get(this._key(session, turnId))?.inFlightToolCalls.set(toolCallId, {
			toolId: toolName,
			contributor,
			toolSourceKind: toolSourceKindFromContributor(contributor),
		});
	}

	/**
	 * Refines an in-flight tool call's contributor once complete metadata is
	 * available. Mirrors {@link AgentHostToolCallTracker.toolCallMetadataUpdated}
	 * so `toolSourceKind` agrees between the two telemetry events for the same
	 * tool call.
	 */
	toolCallMetadataUpdated(session: string, turnId: string, toolCallId: string, contributor: ToolCallContributor | undefined): void {
		const inFlight = this._turnTimings.get(this._key(session, turnId))?.inFlightToolCalls.get(toolCallId);
		if (inFlight && contributor && canRefineContributor(inFlight.contributor, contributor)) {
			inFlight.contributor = contributor;
			inFlight.toolSourceKind = toolSourceKindFromContributor(contributor);
		}
	}

	toolCallEnded(session: string, turnId: string, toolCallId: string): void {
		this._turnTimings.get(this._key(session, turnId))?.inFlightToolCalls.delete(toolCallId);
	}

	/**
	 * Records that a session input request is outstanding for the turn.
	 *
	 * Only requests that block on a *human* make the turn `waitingOnUser`.
	 * {@link SessionInputRequestKind.ToolClientExecution} is delegated running
	 * work, not a prompt: the call has already cleared its confirmation gate
	 * and is simply executing on a client. Counting it would report every
	 * long-running client tool as waiting on the user. This mirrors the
	 * `awaitsUser` predicate the protocol reducer uses for session status
	 * (`channels-session/reducer.ts`), which cannot be imported here because
	 * that file is generated. Client execution is still represented — the
	 * in-flight tool set covers it and yields `runningTool`.
	 *
	 * Every outstanding request is recorded regardless, so unblocking can find
	 * its turn and teardown can clean up its bookkeeping.
	 */
	turnBlocked(session: string, turnId: string, requestId: string, kind: SessionInputRequestKind, toolCallId: string | undefined): void {
		const turnKey = this._key(session, turnId);
		const timing = this._turnTimings.get(turnKey);
		if (!timing) {
			return;
		}
		timing.blockers.set(requestId, { kind, toolCallId });
		this._blockerTurnKeys.set(this._key(session, requestId), turnKey);
		// A request appearing or being answered is itself a state change, so it
		// restarts the quiet period. Without this, a user who answers just
		// before the watchdog expires would be misreported as an unexplained
		// stall on the very next tick, and a turn whose watchdog had stopped
		// re-arming while blocked would never be watched again after the
		// answer.
		this._touch(turnKey, timing);
	}

	turnUnblocked(session: string, requestId: string): void {
		const blockerKey = this._key(session, requestId);
		const turnKey = this._blockerTurnKeys.get(blockerKey);
		if (turnKey === undefined) {
			return;
		}
		this._blockerTurnKeys.delete(blockerKey);
		const timing = this._turnTimings.get(turnKey);
		if (!timing) {
			return;
		}
		timing.blockers.delete(requestId);
		this._touch(turnKey, timing);
	}

	updateModel(session: string, turnId: string, model: string, modelTelemetryKind: AgentHostModelTelemetryKind): void {
		const timing = this._turnTimings.get(this._key(session, turnId));
		if (timing) {
			timing.model = model;
			timing.modelTelemetryKind = modelTelemetryKind;
		}
	}

	getModelTelemetryContext(session: string, turnId: string): { model: string | undefined; modelTelemetryKind: AgentHostModelTelemetryKind | undefined } | undefined {
		const timing = this._turnTimings.get(this._key(session, turnId));
		return timing ? { model: timing.model, modelTelemetryKind: timing.modelTelemetryKind } : undefined;
	}

	getClientTelemetryContext(session: string, turnId: string): IAgentHostClientTelemetryContext | undefined {
		return this._turnTimings.get(this._key(session, turnId))?.clientContext;
	}

	turnCompleted(session: string, turnId: string, result: AgentHostTurnResult, failure?: IAgentHostTurnFailure, workspace?: { readonly isMultiRoot: boolean; readonly folderCount: number }): void {
		const key = this._key(session, turnId);
		const timing = this._turnTimings.get(key);
		if (!timing) {
			return;
		}
		this._disposeTurn(key, timing);

		this._reporter.turnCompleted({
			clientContext: timing.clientContext,
			provider: timing.provider,
			session: timing.session,
			turnId,
			timeToFirstProgress: timing.firstProgressMs,
			totalTime: timing.stopWatch.elapsed(),
			result,
			model: timing.model,
			modelTelemetryKind: timing.modelTelemetryKind,
			modelSelectionKind: timing.modelSelectionKind,
			permissionLevel: timing.permissionLevel,
			interactionMode: timing.interactionMode,
			failure,
			isMultiRoot: workspace?.isMultiRoot ?? false,
			folderCount: workspace?.folderCount ?? 0,
		});

		// Paired recovery event: the turn was reported as hung but did finish,
		// which distinguishes a permanent hang from a merely slow turn.
		if (timing.lastHangReason !== undefined) {
			this._reporter.hungTurnCompleted({
				clientContext: timing.clientContext,
				provider: timing.provider,
				session: timing.session,
				turnId,
				hangReason: timing.lastHangReason,
				result,
				hangReportCount: timing.hangReportCount,
				totalTimeMs: timing.stopWatch.elapsed(),
				timeAfterHangMs: timing.lastHangStopWatch?.elapsed() ?? 0,
			});
		}
	}

	/**
	 * Drops any in-flight (never-completed) turns for a session without
	 * reporting them. Called on session teardown so neither the timing map nor
	 * the watchdog timers can outlive the session they describe.
	 */
	clearSession(session: string): void {
		const prefix = `${session}\0`;
		for (const [key, timing] of this._turnTimings) {
			if (key.startsWith(prefix)) {
				this._disposeTurn(key, timing);
			}
		}
		for (const key of this._blockerTurnKeys.keys()) {
			if (key.startsWith(prefix)) {
				this._blockerTurnKeys.delete(key);
			}
		}
	}

	/**
	 * Drops tracked turns for a channel that are not in `keepTurnIds`, without
	 * reporting them. Used after a chat is truncated: the turns are gone from
	 * state and will never complete, so their watchdogs must not survive to
	 * report a hang for a turn that no longer exists.
	 */
	clearTurnsExcept(session: string, keepTurnIds: ReadonlySet<string>): void {
		const prefix = `${session}\0`;
		for (const [key, timing] of this._turnTimings) {
			if (key.startsWith(prefix) && !keepTurnIds.has(timing.turnId)) {
				this._disposeTurn(key, timing);
			}
		}
	}

	private _disposeTurn(key: string, timing: ITurnTiming): void {
		this._turnTimings.delete(key);
		this._hangWatchdogs.deleteAndDispose(key);
		for (const requestId of timing.blockers.keys()) {
			this._blockerTurnKeys.delete(this._key(timing.session, requestId));
		}
	}

	private _armHangWatchdog(key: string): void {
		this._hangWatchdogs.set(key, disposableTimeout(() => this._onHangWatchdogFired(key), TURN_HANG_THRESHOLD_MS));
	}

	private _onHangWatchdogFired(key: string): void {
		const timing = this._turnTimings.get(key);
		if (!timing) {
			return;
		}
		timing.quietWindows++;

		const hangReason = this._deriveHangReason(timing);
		// Report each reason at most once per turn: a turn quiet for an hour
		// should not produce a dozen identical events, but a turn that moves
		// from `waitingOnUser` to a genuine stall should still be reported.
		if (!timing.reportedHangReasons.has(hangReason)) {
			timing.reportedHangReasons.add(hangReason);
			timing.hangReportCount++;
			timing.lastHangReason = hangReason;
			timing.lastHangStopWatch = StopWatch.create(true);
			const userBlocker = this._firstUserBlocker(timing);
			const stuckTool = this._resolveStuckTool(timing, hangReason);
			this._reporter.turnHung({
				clientContext: timing.clientContext,
				provider: timing.provider,
				session: timing.session,
				turnId: timing.turnId,
				hangReason,
				hadAnyProgress: timing.lastActivityKind !== TURN_ACTIVITY_NONE,
				lastActivityKind: timing.lastActivityKind,
				blockedOn: userBlocker?.kind,
				toolId: stuckTool?.toolId,
				toolSourceKind: stuckTool?.toolSourceKind,
				inFlightToolCallCount: timing.inFlightToolCalls.size,
				quietTimeMs: timing.quietStopWatch.elapsed(),
				turnElapsedMs: timing.stopWatch.elapsed(),
				model: timing.model,
				modelTelemetryKind: timing.modelTelemetryKind,
				modelSelectionKind: timing.modelSelectionKind,
				permissionLevel: timing.permissionLevel,
			});
		}

		if (timing.quietWindows < MAX_HANG_CHECK_WINDOWS) {
			this._armHangWatchdog(key);
		}
	}

	/**
	 * The first outstanding request that blocks on the user, or `undefined`
	 * when none does. See {@link turnBlocked} for why client tool execution is
	 * not a user blocker.
	 */
	private _firstUserBlocker(timing: ITurnTiming): ITurnBlocker | undefined {
		for (const blocker of timing.blockers.values()) {
			if (blocker.kind !== SessionInputRequestKind.ToolClientExecution) {
				return blocker;
			}
		}
		return undefined;
	}

	/**
	 * Identifies the tool the turn appears to be stuck on, so a hang report can
	 * name it rather than only counting it.
	 *
	 * For `waitingOnUser` this is the tool call gated by the blocking request.
	 * A result-confirmation prompt resolves to `undefined`, because the tool
	 * already completed and left the in-flight set — the turn is waiting on the
	 * user reviewing a result, not on a tool. An elicitation has no tool at all.
	 *
	 * For `runningTool` this is the longest-running in-flight call. With
	 * several tools running in parallel there is no way to tell which one is
	 * wedged, so this is a heuristic; `inFlightToolCallCount` travels alongside
	 * it, and filtering to `inFlightToolCallCount == 1` gives unambiguous
	 * attribution.
	 */
	private _resolveStuckTool(timing: ITurnTiming, hangReason: AgentHostTurnHangReason): IInFlightToolCall | undefined {
		if (hangReason === 'waitingOnUser') {
			const toolCallId = this._firstUserBlocker(timing)?.toolCallId;
			return toolCallId === undefined ? undefined : timing.inFlightToolCalls.get(toolCallId);
		}
		if (hangReason === 'runningTool') {
			return timing.inFlightToolCalls.values().next().value;
		}
		return undefined;
	}

	private _deriveHangReason(timing: ITurnTiming): AgentHostTurnHangReason {
		// A user blocker takes precedence over an in-flight tool call: a tool
		// call awaiting confirmation is both, and the human is the real reason
		// the turn is quiet.
		if (this._firstUserBlocker(timing) !== undefined) {
			return 'waitingOnUser';
		}
		if (timing.inFlightToolCalls.size > 0) {
			return 'runningTool';
		}
		// Nothing outstanding to explain the silence — this is a real hang.
		// `noProgress` in particular is the signature of a lost turn: the turn
		// started, no activity of any kind was ever observed, and it never
		// completed.
		return timing.lastActivityKind === TURN_ACTIVITY_NONE ? 'noProgress' : 'stalledAfterProgress';
	}

	private _key(session: string, turnId: string): string {
		return `${session}\0${turnId}`;
	}
}
