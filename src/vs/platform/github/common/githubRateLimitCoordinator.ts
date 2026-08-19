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
		const retryAfter = parseSeconds(response.headers.get('retry-after'), this._scheduler.now());
		const resetSeconds = parseNumber(response.headers.get('x-ratelimit-reset'));
		const secondaryLimited = isSecondaryRateLimit(response.status, responseBody);
		const blockedUntil = !secondaryLimited && retryAfter !== undefined
			? this._scheduler.now() + retryAfter * 1000
			: !secondaryLimited && response.status === 429
				? resetSeconds !== undefined ? resetSeconds * 1000 : previous?.blockedUntil
				: undefined;
		if (secondaryLimited) {
			const accountKey = GitHubRequestQueue.accountKey(account);
			const accountBlockedUntil = retryAfter !== undefined
				? this._scheduler.now() + retryAfter * 1000
				: resetSeconds !== undefined ? resetSeconds * 1000 : this._accountBlockedUntil.get(accountKey);
			if (accountBlockedUntil !== undefined) {
				this._accountBlockedUntil.set(accountKey, accountBlockedUntil);
			}
		}
		this._states.set(key, {
			limit: parseNumber(response.headers.get('x-ratelimit-limit')) ?? previous?.limit,
			remaining: parseNumber(response.headers.get('x-ratelimit-remaining')) ?? previous?.remaining,
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
		this._states.set(key, {
			...previous,
			remaining: 0,
			blockedUntil: previous?.resetAt ?? this._scheduler.now() + 60_000,
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

function isSecondaryRateLimit(status: number, body: string | undefined): boolean {
	if (status !== 403 && status !== 429) {
		return false;
	}
	return body?.toLowerCase().includes('secondary rate limit') ?? false;
}
