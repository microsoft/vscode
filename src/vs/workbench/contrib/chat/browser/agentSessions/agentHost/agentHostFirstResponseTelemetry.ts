/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StopWatch } from '../../../../../../base/common/stopwatch.js';

export type AgentHostFirstResponseOutcome = 'success' | 'cancelled' | 'error' | 'notDispatched';

export interface IAgentHostFirstResponseEvent {
	schemaVersion: 1;
	requestId: string;
	provider: string;
	sessionId?: string;
	chatId?: string;
	outcome: AgentHostFirstResponseOutcome;
	sessionTurnKind: 'first' | 'later' | 'unknown';
	invocationKind: 'newTurn' | 'existingTurn' | 'subagent' | 'unknown';
	firstResponseTextMs?: number;
	totalElapsedMs: number;
	hasResponseText: boolean;
}

export type AgentHostFirstResponseClassification = {
	owner: 'amunger';
	comment: 'Measures local Agent Host invocation to first nonempty live root response text, not physical submission or paint.';
	schemaVersion: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Version of the invocation timing contract.' };
	requestId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Actual client request and protocol turn identifier.' };
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Agent Host provider identifier.' };
	sessionId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Backend session identifier.' };
	chatId?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Backend chat identifier.' };
	outcome: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Terminal invocation outcome, including cancellation before dispatch.' };
	sessionTurnKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether the observed chat has prior turns; unknown before state hydration.' };
	invocationKind: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'New local root turn, existing or resumed turn, subagent turn, or unknown before hydration. Existing and subagent turns are excluded from first-response comparisons.' };
	firstResponseTextMs?: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Monotonic milliseconds from invocation entry through preparation to first nonwhitespace live root markdown emission; absent without text.' };
	totalElapsedMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Monotonic milliseconds from invocation entry to terminal outcome.' };
	hasResponseText: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether this invocation emitted nonwhitespace live root response text.' };
};

/** Tracks only explicitly observed live text; callers must not feed replay, reasoning, or tool output. */
export class AgentHostFirstResponseTiming {
	private firstResponseTextMs: number | undefined;

	constructor(private readonly clock: Pick<StopWatch, 'elapsed'> = StopWatch.create()) { }

	observeText(text: string): void {
		if (this.firstResponseTextMs === undefined && text.trim().length > 0) {
			this.firstResponseTextMs = this.clock.elapsed();
		}
	}

	finish(context: Omit<IAgentHostFirstResponseEvent, 'schemaVersion' | 'firstResponseTextMs' | 'totalElapsedMs' | 'hasResponseText'>): IAgentHostFirstResponseEvent {
		return {
			schemaVersion: 1,
			...context,
			firstResponseTextMs: this.firstResponseTextMs,
			totalElapsedMs: this.clock.elapsed(),
			hasResponseText: this.firstResponseTextMs !== undefined,
		};
	}
}
