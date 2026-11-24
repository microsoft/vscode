/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../base/common/lifecycle.js';

export const maxSentMessages = 100;
export const orchestrationLimitWindowMs = 60 * 60 * 1000;

interface ISessionActionLimit {
	readonly used: number;
	readonly pending: number;
	readonly max: number;
	readonly windowMinutes: number;
	readonly retryAfterSeconds: number | undefined;
}

/** Counts actions per session over a sliding window. */
export class SessionActionLimiter {
	private readonly timestamps = new Map<string, number[]>();
	private readonly pending = new Map<string, number>();
	private lastSweep: number;

	constructor(private readonly maxActions: number, private readonly windowMs: number, private readonly now: () => number) {
		this.lastSweep = now();
	}

	record(session: string): void {
		const recent = this.getRecentActions(session);
		recent.push(this.now());
		this.timestamps.set(session, recent);
		this.sweepIdleSessions();
	}

	reserve(session: string): IDisposable {
		this.pending.set(session, (this.pending.get(session) ?? 0) + 1);
		return toDisposable(() => {
			const remaining = this.pending.get(session)! - 1;
			if (remaining === 0) {
				this.pending.delete(session);
			} else {
				this.pending.set(session, remaining);
			}
		});
	}

	private sweepIdleSessions(): void {
		if (this.now() - this.lastSweep < this.windowMs) {
			return;
		}
		this.lastSweep = this.now();
		for (const session of [...this.timestamps.keys()]) {
			const recent = this.getRecentActions(session);
			if (recent.length === 0) {
				this.timestamps.delete(session);
			} else {
				this.timestamps.set(session, recent);
			}
		}
	}

	private getRecentActions(session: string): number[] {
		const cutoff = this.now() - this.windowMs;
		return (this.timestamps.get(session) ?? []).filter(time => time > cutoff);
	}

	getLimit(session: string): ISessionActionLimit | undefined {
		const recent = this.getRecentActions(session);
		const pending = this.pending.get(session) ?? 0;
		if (recent.length + pending < this.maxActions) {
			return undefined;
		}
		const retryIndex = recent.length + pending - this.maxActions;
		return {
			used: recent.length,
			pending,
			max: this.maxActions,
			windowMinutes: Math.round(this.windowMs / 60000),
			retryAfterSeconds: recent.length >= this.maxActions && retryIndex < recent.length ? Math.max(1, Math.ceil((recent[retryIndex] + this.windowMs - this.now()) / 1000)) : undefined,
		};
	}

	describeLimit(action: string, session: string): string | undefined {
		const limit = this.getLimit(session);
		if (!limit) {
			return undefined;
		}
		if (limit.retryAfterSeconds === undefined) {
			return `Refusing to ${action}: this session already used ${limit.used} of ${limit.max} allowed in the last ${limit.windowMinutes} minutes and has ${limit.pending} more in progress. Wait for an action to finish, or turn off agent orchestration limits in settings.`;
		}
		return `Refusing to ${action}: this session already used ${limit.used} of ${limit.max} allowed in the last ${limit.windowMinutes} minutes. The limit applies to each session separately and frees up as older actions leave that window. Retry after ${limit.retryAfterSeconds} seconds, or turn off agent orchestration limits in settings.`;
	}
}
