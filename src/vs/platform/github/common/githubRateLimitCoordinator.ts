/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { GitHubAccountHandle } from './githubTypes.js';
import { GitHubRequestQueue } from './githubRequestQueue.js';
import { IGitHubScheduler, schedulerDelay } from './githubScheduler.js';

export interface GitHubRateLimitState {
	readonly limit?: number;
	readonly remaining?: number;
	readonly used?: number;
	readonly resetAt?: number;
	readonly blockedUntil?: number;
}

/** GitHub's documented floor for retrying a rate limit it gave no reset hint for. */
const unhintedRateLimitCooldown = 60_000;

export class GitHubRateLimitCoordinator extends Disposable {

	private readonly _states = new Map<string, GitHubRateLimitState>();
	private readonly _accountBlockedUntil = new Map<string, number>();

	constructor(
		private readonly _scheduler: IGitHubScheduler,
	) {
		super();
	}

	getState(account: GitHubAccountHandle, resource: string): GitHubRateLimitState | undefined {
		return this._states.get(this._key(account, resource));
	}

	getDelay(account: GitHubAccountHandle, resource: string): number {
		const accountKey = GitHubRequestQueue.accountKey(account);
		const state = this._states.get(this._key(account, resource));
		const resourceBlockedUntil = state?.blockedUntil ?? (state?.remaining === 0 ? state.resetAt : undefined);
		const accountBlockedUntil = this._accountBlockedUntil.get(accountKey);
		const blockedUntil = resourceBlockedUntil === undefined
			? accountBlockedUntil
			: accountBlockedUntil === undefined ? resourceBlockedUntil : Math.max(resourceBlockedUntil, accountBlockedUntil);
		return blockedUntil === undefined ? 0 : Math.max(0, blockedUntil - this._scheduler.now());
	}

	async wait(account: GitHubAccountHandle, resource: string, signal: AbortSignal): Promise<void> {
		const delay = this.getDelay(account, resource);
		if (delay > 0) {
			await schedulerDelay(this._scheduler, delay, signal);
		}
	}

	updateFromResponse(account: GitHubAccountHandle, response: Response, responseBody?: string): void {
		const resource = response.headers.get('x-ratelimit-resource') ?? 'core';
		const key = this._key(account, resource);
		const previous = this._states.get(key);
		const now = this._scheduler.now();
		const retryAfter = parseSeconds(response.headers.get('retry-after'), now);
		const resetSeconds = parseNumber(response.headers.get('x-ratelimit-reset'));
		const remaining = parseNumber(response.headers.get('x-ratelimit-remaining'));
		const rateLimited = isRateLimited(response.status, responseBody);
		const secondaryLimited = rateLimited && isSecondaryRateLimit(responseBody);
		// GitHub's documented order: honour `retry-after`; otherwise wait for the
		// reset only once the quota is actually spent. A secondary limit reports
		// the primary window, so obeying its reset would park the account for up
		// to an hour over a refusal that needs a minute.
		const hinted = retryAfter !== undefined
			? now + retryAfter * 1000
			: remaining === 0 && resetSeconds !== undefined ? resetSeconds * 1000 : undefined;
		// A refusal must always park the caller, including when the only hint
		// GitHub gave has already elapsed and would otherwise retry at once.
		const refusedUntil = hinted !== undefined && hinted > now ? hinted : now + unhintedRateLimitCooldown;
		// Every rate-limited refusal parks its resource, notably the primary form
		// GitHub reports as 403 with spent quota headers rather than as 429. Only
		// the body separates that from an authorization failure, which must stay
		// unparked so a credential problem still surfaces immediately.
		const blockedUntil = secondaryLimited
			? undefined
			: rateLimited
				? refusedUntil
				: retryAfter !== undefined ? now + retryAfter * 1000 : undefined;
		if (secondaryLimited) {
			const accountKey = GitHubRequestQueue.accountKey(account);
			// GitHub asks clients that hit a secondary limit to wait at least a
			// minute when it gives no usable hint, and the refusal parks the
			// whole account rather than only the resource that observed it.
			this._accountBlockedUntil.set(accountKey, Math.max(refusedUntil, this._accountBlockedUntil.get(accountKey) ?? 0));
		}
		this._states.set(key, {
			limit: parseNumber(response.headers.get('x-ratelimit-limit')) ?? previous?.limit,
			remaining: remaining ?? previous?.remaining,
			used: parseNumber(response.headers.get('x-ratelimit-used')) ?? previous?.used,
			resetAt: resetSeconds !== undefined ? resetSeconds * 1000 : previous?.resetAt,
			blockedUntil,
		});
	}

	updateFromGraphQL(account: GitHubAccountHandle, rateLimit: { readonly limit?: number; readonly remaining?: number; readonly used?: number; readonly resetAt?: string } | undefined): void {
		if (!rateLimit) {
			return;
		}
		const resetAt = typeof rateLimit.resetAt === 'string' ? Date.parse(rateLimit.resetAt) : undefined;
		this._states.set(this._key(account, 'graphql'), {
			limit: rateLimit.limit,
			remaining: rateLimit.remaining,
			used: rateLimit.used,
			resetAt: resetAt !== undefined && Number.isFinite(resetAt) ? resetAt : undefined,
		});
	}

	markGraphQLRateLimited(account: GitHubAccountHandle): void {
		const key = this._key(account, 'graphql');
		const previous = this._states.get(key);
		const now = this._scheduler.now();
		this._states.set(key, {
			...previous,
			remaining: 0,
			// The retained reset can belong to a window that has already closed,
			// and a refusal must park the caller rather than retry at once.
			blockedUntil: previous?.resetAt !== undefined && previous.resetAt > now
				? previous.resetAt
				: now + unhintedRateLimitCooldown,
		});
	}

	clearAccount(account: GitHubAccountHandle): void {
		const accountKey = GitHubRequestQueue.accountKey(account);
		const prefix = `${accountKey}\x00`;
		for (const key of this._states.keys()) {
			if (key.startsWith(prefix)) {
				this._states.delete(key);
			}
		}
		this._accountBlockedUntil.delete(accountKey);
	}

	override dispose(): void {
		this._states.clear();
		this._accountBlockedUntil.clear();
		super.dispose();
	}

	private _key(account: GitHubAccountHandle, resource: string): string {
		return `${GitHubRequestQueue.accountKey(account)}\x00${resource}`;
	}
}

function parseNumber(value: string | null): number | undefined {
	if (value === null) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSeconds(value: string | null, now: number): number | undefined {
	const parsed = parseNumber(value);
	if (parsed !== undefined) {
		return Math.max(0, parsed);
	}
	if (value === null) {
		return undefined;
	}
	const date = Date.parse(value);
	return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : undefined;
}

/**
 * Whether GitHub refused the request for rate limiting. Primary exhaustion is
 * reported as 403 with the quota headers rather than as 429, and only the body
 * tells it apart from an authorization failure.
 */
function isRateLimited(status: number, body: string | undefined): boolean {
	if (status === 429) {
		return true;
	}
	return status === 403 && (body?.toLowerCase().includes('rate limit') ?? false);
}

function isSecondaryRateLimit(body: string | undefined): boolean {
	return body?.toLowerCase().includes('secondary rate limit') ?? false;
}
