/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { GitHubRequestAccount } from './githubTypes.js';
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
	private readonly _inactiveAccounts = new Map<string, number>();
	private readonly _accountOwners = new Map<string, Set<object>>();
	private readonly _cleanup = this._register(new MutableDisposable());

	constructor(
		private readonly _scheduler: IGitHubScheduler,
	) {
		super();
	}

	getState(account: GitHubRequestAccount, resource: string): GitHubRateLimitState | undefined {
		return this._states.get(this._key(account, resource));
	}

	getDelay(account: GitHubRequestAccount, resource: string): number {
		const accountKey = GitHubRequestQueue.accountKey(account);
		const state = this._states.get(this._key(account, resource));
		const resourceBlockedUntil = state?.blockedUntil ?? (state?.remaining === 0 ? state.resetAt : undefined);
		const accountBlockedUntil = this._accountBlockedUntil.get(accountKey);
		const blockedUntil = resourceBlockedUntil === undefined
			? accountBlockedUntil
			: accountBlockedUntil === undefined ? resourceBlockedUntil : Math.max(resourceBlockedUntil, accountBlockedUntil);
		return blockedUntil === undefined ? 0 : Math.max(0, blockedUntil - this._scheduler.now());
	}

	preserveCooldown(account: GitHubRequestAccount, resource: string, delay: number): void {
		if (delay <= 0) {
			return;
		}
		const key = this._key(account, resource);
		const previous = this._states.get(key);
		this._states.set(key, { ...previous, blockedUntil: Math.max(previous?.blockedUntil ?? 0, this._scheduler.now() + delay) });
		this.releaseAccount(account);
	}

	async wait(account: GitHubRequestAccount, resource: string, signal: AbortSignal): Promise<void> {
		const delay = this.getDelay(account, resource);
		if (delay > 0) {
			await schedulerDelay(this._scheduler, delay, signal);
		}
	}

	updateFromResponse(account: GitHubRequestAccount, response: Response, responseBody?: string, fallbackResource = 'core'): void {
		const resource = response.headers.get('x-ratelimit-resource') ?? fallbackResource;
		const isGraphQL = resource === 'graphql';
		const key = this._key(account, resource);
		const previous = this._states.get(key);
		const previousBlockedUntil = previous?.blockedUntil ?? (isGraphQL && previous?.remaining === 0 ? previous.resetAt : undefined);
		const now = this._scheduler.now();
		const retryAfter = parseSeconds(response.headers.get('retry-after'), now, isGraphQL);
		const resetSeconds = parseNumber(response.headers.get('x-ratelimit-reset'), isGraphQL);
		const remaining = parseNumber(response.headers.get('x-ratelimit-remaining'), isGraphQL);
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
			: rateLimited || (isGraphQL && remaining === 0)
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
			limit: parseNumber(response.headers.get('x-ratelimit-limit'), isGraphQL) ?? previous?.limit,
			remaining: remaining ?? previous?.remaining,
			used: parseNumber(response.headers.get('x-ratelimit-used'), isGraphQL) ?? previous?.used,
			resetAt: resetSeconds !== undefined ? resetSeconds * 1000 : previous?.resetAt,
			blockedUntil: previousBlockedUntil !== undefined && previousBlockedUntil > now
				? Math.max(previousBlockedUntil, blockedUntil ?? 0) : blockedUntil,
		});
	}

	updateFromGraphQL(account: GitHubRequestAccount, rateLimit: { readonly limit?: number; readonly remaining?: number; readonly used?: number; readonly resetAt?: string } | undefined): void {
		if (!rateLimit) {
			return;
		}
		const resetAt = typeof rateLimit.resetAt === 'string' ? Date.parse(rateLimit.resetAt) : undefined;
		const key = this._key(account, 'graphql');
		const previous = this._states.get(key);
		const blockedUntil = previous?.blockedUntil ?? (previous?.remaining === 0 ? previous.resetAt : undefined);
		this._states.set(key, {
			limit: rateLimit.limit ?? previous?.limit,
			remaining: rateLimit.remaining ?? previous?.remaining,
			used: rateLimit.used ?? previous?.used,
			resetAt: resetAt !== undefined && Number.isFinite(resetAt) ? resetAt : previous?.resetAt,
			...(blockedUntil !== undefined && blockedUntil > this._scheduler.now() ? { blockedUntil } : {}),
		});
	}

	/** Records primary GraphQL exhaustion without shortening an existing server cooldown. */
	markGraphQLRateLimited(account: GitHubRequestAccount, retryAfter: string | null = null): void {
		const key = this._key(account, 'graphql');
		const previous = this._states.get(key);
		const now = this._scheduler.now();
		const retryAfterSeconds = parseSeconds(retryAfter, now, true);
		const hinted = retryAfterSeconds !== undefined ? now + retryAfterSeconds * 1000 : previous?.resetAt;
		const blockedUntil = hinted !== undefined && hinted > now ? hinted : now + unhintedRateLimitCooldown;
		this._states.set(key, {
			...previous,
			remaining: 0,
			blockedUntil: Math.max(previous?.blockedUntil ?? 0, blockedUntil),
		});
	}

	clearAccount(account: GitHubRequestAccount): void {
		this._clearAccount(GitHubRequestQueue.accountKey(account));
		this._scheduleCleanup();
	}

	retainAccount(account: GitHubRequestAccount, owner?: object): void {
		const accountKey = GitHubRequestQueue.accountKey(account);
		if (owner) {
			let owners = this._accountOwners.get(accountKey);
			if (!owners) {
				owners = new Set();
				this._accountOwners.set(accountKey, owners);
			}
			owners.add(owner);
		}
		if (this._inactiveAccounts.delete(accountKey)) {
			this._scheduleCleanup();
		}
	}

	/** Drops unused quota data once all server-required cooldowns for the account have elapsed. */
	releaseAccount(account: GitHubRequestAccount, owner?: object): void {
		if (this._store.isDisposed) {
			return;
		}
		const accountKey = GitHubRequestQueue.accountKey(account);
		const owners = this._accountOwners.get(accountKey);
		if (owner) {
			owners?.delete(owner);
		}
		if (owners?.size) {
			return;
		}
		this._accountOwners.delete(accountKey);
		const prefix = `${accountKey}\x00`;
		let expiresAt = this._accountBlockedUntil.get(accountKey) ?? 0;
		for (const [key, state] of this._states) {
			if (key.startsWith(prefix)) {
				expiresAt = Math.max(expiresAt, state.blockedUntil ?? (state.remaining === 0 ? state.resetAt ?? 0 : 0));
			}
		}
		if (expiresAt > this._scheduler.now()) {
			this._inactiveAccounts.set(accountKey, expiresAt);
		} else {
			this._clearAccount(accountKey);
		}
		this._scheduleCleanup();
	}

	private _clearAccount(accountKey: string): void {
		const prefix = `${accountKey}\x00`;
		for (const key of this._states.keys()) {
			if (key.startsWith(prefix)) {
				this._states.delete(key);
			}
		}
		this._accountBlockedUntil.delete(accountKey);
		this._inactiveAccounts.delete(accountKey);
	}

	private _scheduleCleanup(): void {
		this._cleanup.clear();
		if (this._inactiveAccounts.size === 0 || this._store.isDisposed) {
			return;
		}
		let next = Infinity;
		for (const expiresAt of this._inactiveAccounts.values()) {
			next = Math.min(next, expiresAt);
		}
		this._cleanup.value = this._scheduler.schedule(() => {
			for (const [accountKey, expiresAt] of this._inactiveAccounts) {
				if (expiresAt <= this._scheduler.now()) {
					this._clearAccount(accountKey);
				}
			}
			this._scheduleCleanup();
		}, Math.max(0, next - this._scheduler.now()));
	}

	override dispose(): void {
		this._states.clear();
		this._accountBlockedUntil.clear();
		this._inactiveAccounts.clear();
		this._accountOwners.clear();
		super.dispose();
	}

	private _key(account: GitHubRequestAccount, resource: string): string {
		return `${GitHubRequestQueue.accountKey(account)}\x00${resource}`;
	}
}

function parseNumber(value: string | null, nonNegativeInteger = false): number | undefined {
	if (value === null || (nonNegativeInteger && !/^\d+$/.test(value.trim()))) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) && (!nonNegativeInteger || (Number.isSafeInteger(parsed) && parsed >= 0)) ? parsed : undefined;
}

function parseSeconds(value: string | null, now: number, strict = false): number | undefined {
	const parsed = parseNumber(value, strict);
	if (parsed !== undefined) {
		return Math.max(0, parsed);
	}
	if (value === null) {
		return undefined;
	}
	if (strict) {
		value = value.trim();
		// Date.parse also accepts numeric lookalikes and treats asctime dates as local time.
		if (/^[A-Z][a-z]{2} [A-Z][a-z]{2} (?:\d{2}| \d) \d{2}:\d{2}:\d{2} \d{4}$/.test(value)) {
			value += ' GMT';
		} else if (!/^(?:[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}|[A-Z][a-z]+, \d{2}-[A-Z][a-z]{2}-\d{2}) \d{2}:\d{2}:\d{2} GMT$/.test(value)) {
			return undefined;
		}
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
