/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { IGitHubScheduler, schedulerDelay } from './githubScheduler.js';

/**
 * Shapes how far apart repeated attempts against a failing subject are spaced.
 * Without one, every subscriber that reacts to a failure retries at its normal
 * rate for the whole outage, which turns one unhealthy dependency into a
 * request storm against GitHub from every user at once.
 */
export interface GitHubBackoffPolicy {
	/** Consecutive failures that may retry without waiting, so a single blip still recovers at once. */
	readonly immediateRetries: number;
	readonly base: number;
	readonly maximum: number;
	readonly jitter: number;
	/**
	 * Quiet time after which consecutive failures are forgotten. Only
	 * {@link GitHubBackoffGate} consults it, for subjects whose recovery nothing
	 * else can report; callers that observe a success reset the count directly.
	 */
	readonly decay?: number;
}

/**
 * The delay an attempt must serve after `attempts` consecutive failures, never
 * shorter than `minimum`. Jittered so a host that fails many callers at once
 * does not gather them into a single retry burst when the delay elapses.
 */
export function gitHubBackoffDelay(policy: GitHubBackoffPolicy, scheduler: IGitHubScheduler, attempts: number, minimum = 0): number {
	const escalated = attempts <= policy.immediateRetries
		? 0
		: Math.min(policy.base * 2 ** (attempts - policy.immediateRetries - 1), policy.maximum);
	const delay = Math.max(escalated, minimum);
	// An attempt that is free to run now must stay immediate rather than being
	// pushed onto the jitter window.
	return delay === 0 ? 0 : delay + scheduler.jitter(policy.jitter);
}

interface IBackoffState {
	readonly key: string;
	readonly attempts: number;
	readonly recordedAt: number;
	readonly blockedUntil: number;
}

/**
 * Holds back attempts against a single subject that keeps failing, spacing them
 * further apart the longer the trouble lasts.
 *
 * Callers wait rather than being rejected, so recovery stays automatic and
 * everyone queued behind one delay shares the single attempt that follows it.
 * The subject is named by an opaque key -- which may carry a secret and is
 * therefore never logged -- so replacing it recovers immediately.
 */
export class GitHubBackoffGate extends Disposable {

	private readonly _lifetime = new AbortController();
	private _changed = new AbortController();
	private _state: IBackoffState | undefined;

	constructor(
		private readonly _label: string,
		private readonly _policy: GitHubBackoffPolicy,
		private readonly _scheduler: IGitHubScheduler,
		private readonly _logService?: ILogService,
	) {
		super();
	}

	/**
	 * Waits until an attempt for `key` may run and reports whether it had to.
	 * A key this gate holds no failure for proceeds at once.
	 */
	async wait(key: string, signal: AbortSignal): Promise<boolean> {
		let waited = false;
		while (this._state) {
			const state = this._state;
			// A different subject has never failed, so it is tried at once
			// instead of serving out the previous one's delay.
			if (state.key !== key) {
				this._set(undefined);
				return waited;
			}
			const remaining = state.blockedUntil - this._scheduler.now();
			if (remaining <= 0) {
				return waited;
			}
			this._logService?.debug(`[GitHubBackoffGate] Delaying ${this._label} by ${remaining}ms after ${state.attempts} consecutive failure(s)`);
			const changed = this._changed.signal;
			waited = true;
			try {
				await schedulerDelay(this._scheduler, remaining, AbortSignal.any([signal, this._lifetime.signal, changed]));
			} catch (error) {
				if (!changed.aborted || signal.aborted || this._lifetime.signal.aborted) {
					throw error;
				}
				// The record changed, so the new one decides how much longer to wait.
			}
		}
		return waited;
	}

	/** Records a failure for `key`, so the next attempt for it waits longer. */
	fail(key: string): void {
		const now = this._scheduler.now();
		const state = this._state;
		// A subject that has gone quiet for a whole decay window is treated as
		// healthy again, so an isolated failure much later still retries at once.
		const continues = state !== undefined
			&& state.key === key
			&& now - state.recordedAt <= (this._policy.decay ?? Number.POSITIVE_INFINITY);
		const attempts = (continues ? state.attempts : 0) + 1;
		const delay = gitHubBackoffDelay(this._policy, this._scheduler, attempts);
		this._set({ key, attempts, recordedAt: now, blockedUntil: now + delay });
		if (delay > 0) {
			this._logService?.warn(`[GitHubBackoffGate] Backing off ${this._label} by ${delay}ms after ${attempts} consecutive failure(s)`);
		}
	}

	/** Forgets the recorded failures, releasing anyone already waiting. */
	reset(): void {
		if (this._state) {
			this._set(undefined);
		}
	}

	override dispose(): void {
		this._state = undefined;
		this._lifetime.abort(new Error(`GitHub ${this._label} backoff was disposed`));
		super.dispose();
	}

	/** Replaces the record and wakes every caller waiting on the previous one. */
	private _set(state: IBackoffState | undefined): void {
		this._state = state;
		this._changed.abort();
		this._changed = new AbortController();
	}
}
