/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';

export const IClaudeUsageService = createDecorator<IClaudeUsageService>('claudeUsageService');

/**
 * Accumulates the real Copilot credits (nano-AIU) that CAPI bills for a
 * Claude session's `/v1/messages` requests. The proxy — the only component
 * that sees the raw `copilot_usage.total_nano_aiu` (the SDK strips it from its
 * `result`) — pushes each report here via {@link addUsage}, keyed by the
 * session id it decoded from the proxy Bearer token.
 *
 * The accumulator is the single source of truth for a session's in-progress
 * credits, replacing the per-turn counter that used to live on the session:
 *
 * - A turn that completes normally {@link consume}s the total when its SDK
 *   `result` flows through (attaching it to the turn's `ChatUsage`), which
 *   resets the accumulator so the next turn sums from zero.
 * - A cancelled turn produces no `result`, so its credits are {@link peek}ed
 *   and surfaced incrementally as they settle (the in-flight request reports
 *   what it had seen as it unwinds); the accumulator is only {@link clear}ed
 *   when the next user message starts a fresh turn.
 */
export interface IClaudeUsageService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires with the session id whenever that session's accumulated usage
	 * grows. Consumers that surface a cancelled turn's still-settling credits
	 * subscribe to re-read {@link peek} as late reports land.
	 */
	readonly onDidChangeUsage: Event<string>;

	/**
	 * Add billed credits (nano-AIU) for a session. Ignores non-positive /
	 * non-finite values. Fires {@link onDidChangeUsage} on a real increase.
	 */
	addUsage(sessionId: string, totalNanoAiu: number): void;

	/** Read the session's accumulated credits without resetting. */
	peek(sessionId: string): number;

	/** Read the session's accumulated credits and reset to zero (clean turn-end). */
	consume(sessionId: string): number;

	/** Reset the session's accumulated credits (new user message). */
	clear(sessionId: string): void;
}

export class ClaudeUsageService extends Disposable implements IClaudeUsageService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeUsage = this._register(new Emitter<string>());
	readonly onDidChangeUsage: Event<string> = this._onDidChangeUsage.event;

	/** Accumulated nano-AIU per session id. */
	private readonly _bySession = new Map<string, number>();

	addUsage(sessionId: string, totalNanoAiu: number): void {
		if (!Number.isFinite(totalNanoAiu) || totalNanoAiu <= 0) {
			return;
		}
		this._bySession.set(sessionId, (this._bySession.get(sessionId) ?? 0) + totalNanoAiu);
		this._onDidChangeUsage.fire(sessionId);
	}

	peek(sessionId: string): number {
		return this._bySession.get(sessionId) ?? 0;
	}

	consume(sessionId: string): number {
		const total = this._bySession.get(sessionId) ?? 0;
		this._bySession.delete(sessionId);
		return total;
	}

	clear(sessionId: string): void {
		this._bySession.delete(sessionId);
	}
}
