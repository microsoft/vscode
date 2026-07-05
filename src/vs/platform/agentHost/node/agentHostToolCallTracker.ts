/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../base/common/async.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import type { SessionToolClientExecutionRequest, SessionToolConfirmationRequest } from '../common/state/protocol/state.js';
import { ToolCallContributorKind, type ToolCallContributor, type ToolCallResult } from '../common/state/sessionState.js';
import type { AgentHostTelemetryReporter } from './agentHostTelemetryReporter.js';

export type ToolInvokedResult = 'success' | 'error' | 'userCancelled';

const TOOL_CALL_STALL_THRESHOLD_MS = 5 * 60 * 1000;

type ToolCallBlockerRequest = SessionToolConfirmationRequest | SessionToolClientExecutionRequest;

/**
 * Maps a completed tool call's result to the telemetry result bucket. Mirrors
 * the derivation previously done inline in `CopilotAgentSession`: a denied,
 * rejected, or cancelled tool call counts as `userCancelled`; any other
 * failure counts as `error`.
 */
export function deriveToolInvokedResult(result: ToolCallResult): ToolInvokedResult {
	if (result.success) {
		return 'success';
	}
	const code = result.error?.code;
	if (code === 'rejected' || code === 'denied' || code === 'cancelled') {
		return 'userCancelled';
	}
	return 'error';
}

/**
 * Maps a tool call's contributor to the telemetry `toolSourceKind`. A tool with
 * no contributor is provided by the agent host itself; an MCP contributor maps
 * to `mcp` and a client contributor to `client`.
 */
export function toolSourceKindFromContributor(contributor: ToolCallContributor | undefined): string {
	if (!contributor) {
		return 'agentHost';
	}
	// Widen to `string` so an unrecognized kind from a newer protocol version
	// falls through to a valid telemetry value rather than `undefined`.
	const kind: string = contributor.kind;
	switch (kind) {
		case ToolCallContributorKind.MCP:
			return 'mcp';
		case ToolCallContributorKind.Client:
			return 'client';
		default:
			return kind;
	}
}

/** Per-tool-call timing state, keyed by `session:toolCallId`. */
interface IToolCallTiming {
	readonly stopWatch: StopWatch;
	readonly provider: string;
	readonly session: string;
	readonly toolId: string;
	readonly toolSourceKind: string;
}

interface IStalledToolCall {
	readonly blockerKind: ToolCallBlockerRequest['kind'];
	readonly completionStopWatch: StopWatch;
}

/**
 * Tracks completed and stalled tool calls for agent host sessions.
 *
 * Lifecycle per tool call:
 *   1. {@link toolCallStarted} — begins a stopwatch and records the tool's
 *      name and source kind (only the start action carries these)
 *   2. {@link toolCallCompleted} — emits the telemetry event and clears state
 *   3. {@link toolCallBlocked} / {@link toolCallUnblocked} — emits once when a
 *      confirmation or client execution remains unresolved past the threshold
 *
 * In-flight tool calls that never complete (e.g. the turn is cancelled mid
 * tool call) are dropped via {@link clearSession} / {@link clear} so the
 * tracking map cannot leak.
 */
export class AgentHostToolCallTracker extends Disposable {

	private readonly _toolCalls = new Map<string, IToolCallTiming>();
	private readonly _toolCallStallTimers = this._register(new DisposableMap<string>());
	private readonly _stalledToolCalls = new Map<string, IStalledToolCall>();

	constructor(private readonly _reporter: AgentHostTelemetryReporter) {
		super();
	}

	toolCallStarted(provider: string, session: string, toolCallId: string, toolName: string, contributor: ToolCallContributor | undefined): void {
		this._toolCalls.set(this._key(session, toolCallId), {
			stopWatch: StopWatch.create(true),
			provider,
			session,
			toolId: toolName,
			toolSourceKind: toolSourceKindFromContributor(contributor),
		});
	}

	toolCallCompleted(session: string, toolCallId: string, result: ToolCallResult): void {
		const key = this._key(session, toolCallId);
		const timing = this._toolCalls.get(key);
		if (!timing) {
			// No matching start: either the start was never observed, or this is
			// a duplicate completion (the entry was already consumed). Either
			// way, do not emit so volume stays accurate.
			return;
		}
		this._toolCalls.delete(key);
		const resultBucket = deriveToolInvokedResult(result);
		const totalTimeMs = timing.stopWatch.elapsed();

		this._reporter.toolInvoked({
			provider: timing.provider,
			session: timing.session,
			toolId: timing.toolId,
			toolSourceKind: timing.toolSourceKind,
			result: resultBucket,
			invocationTimeMs: totalTimeMs,
		});

		const stalled = this._stalledToolCalls.get(key);
		if (stalled) {
			this._stalledToolCalls.delete(key);
			this._reporter.stalledToolCallCompleted({
				provider: timing.provider,
				session: timing.session,
				blockerKind: stalled.blockerKind,
				toolId: timing.toolId,
				toolSourceKind: timing.toolSourceKind,
				result: resultBucket,
				totalTimeMs,
				timeAfterStallMs: stalled.completionStopWatch.elapsed(),
			});
		}
	}

	toolCallBlocked(provider: string, session: string, request: ToolCallBlockerRequest): void {
		const key = this._key(session, request.id);
		const toolCallKey = this._key(session, request.toolCall.toolCallId);
		if (this._toolCallStallTimers.has(key) || this._stalledToolCalls.has(toolCallKey)) {
			return;
		}

		const stopWatch = StopWatch.create(true);
		this._toolCallStallTimers.set(key, disposableTimeout(() => {
			const stalledTimeMs = stopWatch.elapsed();
			this._stalledToolCalls.set(toolCallKey, { blockerKind: request.kind, completionStopWatch: StopWatch.create(true) });
			this._reporter.toolCallStalled({
				provider,
				session,
				blockerKind: request.kind,
				toolId: request.toolCall.toolName,
				toolSourceKind: toolSourceKindFromContributor(request.toolCall.contributor),
				stalledTimeMs,
			});
		}, TOOL_CALL_STALL_THRESHOLD_MS));
	}

	toolCallUnblocked(session: string, requestId: string): void {
		this._toolCallStallTimers.deleteAndDispose(this._key(session, requestId));
	}

	/**
	 * Drops any in-flight (never-completed) tool calls for a session. Called
	 * when a turn ends or a session is torn down so the tracking map cannot
	 * leak. A no-op in the normal case where every tool call completes.
	 */
	clearSession(session: string): void {
		const prefix = `${session}\0`;
		for (const key of this._toolCalls.keys()) {
			if (key.startsWith(prefix)) {
				this._toolCalls.delete(key);
			}
		}
		for (const key of this._toolCallStallTimers.keys()) {
			if (key.startsWith(prefix)) {
				this._toolCallStallTimers.deleteAndDispose(key);
			}
		}
		for (const key of this._stalledToolCalls.keys()) {
			if (key.startsWith(prefix)) {
				this._stalledToolCalls.delete(key);
			}
		}
	}

	clear(): void {
		this._toolCalls.clear();
		this._toolCallStallTimers.clearAndDisposeAll();
		this._stalledToolCalls.clear();
	}

	private _key(session: string, toolCallId: string): string {
		return `${session}\0${toolCallId}`;
	}
}
