/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../../../../base/common/stopwatch.js';
import type { AgentHostClientConnectionKind } from '../../../../../../platform/agentHost/common/agentHostTelemetry.js';

export type AgentHostFirstResponseOutcome = 'success' | 'cancelled' | 'error' | 'notDispatched';

let rendererRootInvocationOrdinal = 0;

/** Shared by all provider handlers in this renderer; reconnecting a host does not reset it. */
export function nextRendererRootInvocationOrdinal(): number {
	return ++rendererRootInvocationOrdinal;
}

export interface IAgentHostFirstResponseEvent {
	schemaVersion: 1;
	requestId: string;
	provider: string;
	connectionKind: AgentHostClientConnectionKind;
	agentSessionId?: string;
	chatId?: string;
	outcome: AgentHostFirstResponseOutcome;
	sessionTurnKind: 'first' | 'later' | 'unknown';
	invocationKind: 'newTurn' | 'existingTurn' | 'subagent' | 'unknown';
	firstResponseTextMs?: number;
	firstResponseOrReasoningMs?: number;
	rootToolCallsBeforeFirstText?: number;
	rendererRootInvocationOrdinal?: number;
	trustInteractionRequired: boolean;
	totalElapsedMs: number;
	hasResponseText: boolean;
}

export type AgentHostFirstResponseClassification = {
	owner: 'amunger';
	comment: 'Measures local Agent Host invocation to first nonempty live root response text, and to first response text or reasoning, not physical submission or paint.';
	schemaVersion: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Version of the invocation timing contract.' };
	requestId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Actual client request and protocol turn identifier.' };
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Agent Host provider identifier.' };
	connectionKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Allowlisted client connection kind captured at invocation start, including web_pub_sub for the current GitHub sandbox integration and mission_control for user-local Mission Control hosts. Unknown when unavailable; contains no environment identity.' };
	agentSessionId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Backend session identifier.' };
	chatId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Backend chat identifier.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Terminal invocation outcome, including cancellation before dispatch.' };
	sessionTurnKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the default chat of the session has prior turns. Unknown for turns in other chats of the session, such as added, forked or side chats, and for invocations that ended before their chat was resolved.' };
	invocationKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'New local root turn, existing or resumed turn, subagent turn, or unknown before hydration. Existing and subagent turns are excluded from first-response comparisons.' };
	firstResponseTextMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Monotonic milliseconds from invocation entry through preparation to first nonwhitespace live root markdown emission; absent without text.' };
	firstResponseOrReasoningMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Monotonic milliseconds from invocation entry through preparation to the first nonwhitespace live root markdown or reasoning emission, whichever came first; never later than firstResponseTextMs, and absent without either. Excludes replayed, subagent, and tool output.' };
	rootToolCallsBeforeFirstText?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Distinct live root tool calls presented before first root text; excludes child calls and replay, and is absent without qualifying text. Not a model-call count.' };
	rendererRootInvocationOrdinal?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'One-based root invocation attempt ordinal across providers in this renderer lifetime, including declined and resumed attempts; absent for subagents or unresolved routing.' };
	trustInteractionRequired: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether this invocation requested an interactive decision for untrusted workspace or resource access. Exclude these rows from primary latency comparisons.' };
	totalElapsedMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Monotonic milliseconds from invocation entry to terminal outcome.' };
	hasResponseText: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether this invocation emitted nonwhitespace live root response text.' };
};

/** Tracks only explicitly observed live root output; callers must not feed replay, subagent, or tool output, and must report reasoning through `observeReasoning`. */
export class AgentHostFirstResponseTiming {
	private firstResponseTextMs: number | undefined;
	private firstResponseOrReasoningMs: number | undefined;
	private readonly rootToolCallIds = new Set<string>();

	constructor(private readonly clock: Pick<StopWatch, 'elapsed'> = StopWatch.create()) { }

	observeText(text: string): void {
		if (this.firstResponseTextMs === undefined && text.trim().length > 0) {
			this.firstResponseTextMs = this.clock.elapsed();
			this.firstResponseOrReasoningMs ??= this.firstResponseTextMs;
		}
	}

	observeReasoning(text: string): void {
		if (this.firstResponseOrReasoningMs === undefined && text.trim().length > 0) {
			this.firstResponseOrReasoningMs = this.clock.elapsed();
		}
	}

	observeToolCall(toolCallId: string): void {
		if (this.firstResponseTextMs === undefined) {
			this.rootToolCallIds.add(toolCallId);
		}
	}

	finish(context: Omit<IAgentHostFirstResponseEvent, 'schemaVersion' | 'firstResponseTextMs' | 'firstResponseOrReasoningMs' | 'rootToolCallsBeforeFirstText' | 'totalElapsedMs' | 'hasResponseText'>): IAgentHostFirstResponseEvent {
		return {
			schemaVersion: 1,
			...context,
			firstResponseTextMs: this.firstResponseTextMs,
			firstResponseOrReasoningMs: this.firstResponseOrReasoningMs,
			rootToolCallsBeforeFirstText: this.firstResponseTextMs === undefined ? undefined : this.rootToolCallIds.size,
			totalElapsedMs: this.clock.elapsed(),
			hasResponseText: this.firstResponseTextMs !== undefined,
		};
	}
}
