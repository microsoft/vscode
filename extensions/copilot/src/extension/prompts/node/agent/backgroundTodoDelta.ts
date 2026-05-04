/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { URI } from '../../../../util/vs/base/common/uri';
import { Turn } from '../../../prompt/common/conversation';
import { IBuildPromptContext, IToolCallRound } from '../../../prompt/common/intents';
import { classifyTool } from './backgroundTodoProcessor';

/**
 * Extract the session resource as a Uri from a prompt context.
 */
export function extractSessionResource(promptContext: IBuildPromptContext): vscode.Uri | undefined {
	const fromRequest = promptContext.request?.sessionResource;
	if (fromRequest) {
		return fromRequest;
	}
	const fromToken = (promptContext.tools?.toolInvocationToken as { sessionResource?: string | vscode.Uri } | undefined)?.sessionResource;
	if (fromToken) {
		return typeof fromToken === 'string' ? URI.parse(fromToken) as vscode.Uri : fromToken;
	}
	return undefined;
}

/**
 * Snapshot of new activity since the last background todo pass.
 */
export interface IBackgroundTodoDelta {
	/** The user's original request message (from the current or most recent turn). */
	readonly userRequest: string;
	/** New tool call rounds not yet seen by the background todo processor. */
	readonly newRounds: readonly IToolCallRound[];
	/** Full conversation history (read-only reference, stable within a turn). */
	readonly history: readonly Turn[];
	/** Session resource URI, needed for todo tool invocation. */
	readonly sessionResource: vscode.Uri | undefined;
	/** Metadata useful for policy decisions. */
	readonly metadata: IBackgroundTodoDeltaMetadata;
}

/**
 * Lightweight metadata derived from a delta snapshot, consumed by the
 * invocation policy to decide run / wait / skip without inspecting
 * round contents.
 */
export interface IBackgroundTodoDeltaMetadata {
	/** Number of new tool-call rounds in this delta. */
	readonly newRoundCount: number;
	/** Total number of individual tool calls across new rounds. */
	readonly newToolCallCount: number;
	/** Number of meaningful (mutating/executing) tool calls in new rounds. */
	readonly meaningfulToolCallCount: number;
	/** Number of context (read-only) tool calls in new rounds. */
	readonly contextToolCallCount: number;
	/** True when this is the very first delta for the session (no rounds processed yet). */
	readonly isInitialDelta: boolean;
	/** True when the delta contains only a user request and zero new rounds. */
	readonly isRequestOnly: boolean;
}

/**
 * Tracks which tool-call rounds the background todo processor has already
 * considered and produces deltas containing only new activity.
 *
 * This utility is independent of invocation policy — callers decide *when*
 * to request a delta and what to do with it.
 */
export class BackgroundTodoDeltaTracker {

	/** Set of round IDs already processed by the background todo agent. */
	private readonly _processedRoundIds = new Set<string>();

	/**
	 * Build a delta snapshot from the current prompt context without
	 * advancing the cursor. Call {@link markProcessed} after the pass
	 * is handled to commit the cursor forward.
	 *
	 * Returns `undefined` when there is no new activity since the last
	 * committed cursor position.
	 */
	peekDelta(promptContext: IBuildPromptContext): IBackgroundTodoDelta | undefined {
		const currentRounds = promptContext.toolCallRounds ?? [];
		const newRounds: IToolCallRound[] = [];
		const seenRoundIds = new Set<string>();

		// Process historical rounds before current rounds so older context is
		// pruned first if the background prompt exceeds its budget.
		for (const turn of promptContext.history) {
			for (const round of turn.rounds) {
				if (!this._processedRoundIds.has(round.id) && !seenRoundIds.has(round.id)) {
					seenRoundIds.add(round.id);
					newRounds.push(round);
				}
			}
		}

		for (const round of currentRounds) {
			if (!this._processedRoundIds.has(round.id) && !seenRoundIds.has(round.id)) {
				seenRoundIds.add(round.id);
				newRounds.push(round);
			}
		}

		// First invocation (nothing processed yet) with no tool call rounds:
		// produce a delta with just the user request so the background agent
		// can set up an initial plan.
		const isInitialDelta = this._processedRoundIds.size === 0;
		if (newRounds.length === 0 && !isInitialDelta) {
			return undefined;
		}

		const userRequest = promptContext.query;
		let newToolCallCount = 0;
		let meaningfulToolCallCount = 0;
		let contextToolCallCount = 0;
		for (const round of newRounds) {
			for (const call of round.toolCalls) {
				const category = classifyTool(call.name);
				if (category === 'meaningful') {
					meaningfulToolCallCount++;
					newToolCallCount++;
				} else if (category === 'context') {
					contextToolCallCount++;
					newToolCallCount++;
				}
				// excluded tools are not counted
			}
		}

		return {
			userRequest,
			newRounds,
			history: promptContext.history,
			sessionResource: extractSessionResource(promptContext),
			metadata: {
				newRoundCount: newRounds.length,
				newToolCallCount,
				meaningfulToolCallCount,
				contextToolCallCount,
				isInitialDelta,
				isRequestOnly: newRounds.length === 0,
			},
		};
	}

	/**
	 * Convenience alias that behaves like the old `getDelta` — peeks and
	 * returns the snapshot without committing.
	 */
	getDelta(promptContext: IBuildPromptContext): IBackgroundTodoDelta | undefined {
		return this.peekDelta(promptContext);
	}

	/**
	 * Mark all rounds in the given delta as processed so they won't appear
	 * in subsequent deltas.
	 */
	markProcessed(delta: IBackgroundTodoDelta): void {
		for (const round of delta.newRounds) {
			this._processedRoundIds.add(round.id);
		}
	}

	/**
	 * Mark a set of round IDs as processed without requiring a full delta.
	 * Useful when advancing the cursor after a no-op pass.
	 */
	markRoundsProcessed(roundIds: Iterable<string>): void {
		for (const id of roundIds) {
			this._processedRoundIds.add(id);
		}
	}

	/**
	 * Reset the tracker to its initial state.
	 */
	reset(): void {
		this._processedRoundIds.clear();
	}
}
