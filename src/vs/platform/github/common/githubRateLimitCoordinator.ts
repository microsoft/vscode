/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CooldownState } from './cooldownState.js';
import { parseHeaderNumber, parseRetryAfter } from './httpHeaders.js';
import { RequestQueue } from './requestQueue.js';
import { RequestAccount } from './types.js';

/** GitHub's documented floor for retrying a rate limit it gave no reset hint for. */
const unhintedRateLimitCooldown = 60_000;

/** Interprets GitHub quota headers and GraphQL feedback using shared cooldown storage. */
export class GitHubRateLimitCoordinator extends CooldownState {

	/** Agents quotas are independent of REST/GraphQL; successful Retry-After responses can mean waking. */
	updateFromAgentsResponse(account: RequestAccount, response: Response, responseBody?: string): void {
		if (!isRateLimited(response.status, responseBody)) {
			return;
		}
		const now = this._scheduler.now();
		const delay = (parseRetryAfter(response.headers.get('retry-after'), now, true) ?? 0) * 1000;
		const key = this._key(account, 'agents');
		this._states.set(key, {
			blockedUntil: Math.max(this._states.get(key)?.blockedUntil ?? 0, now + (delay > 0 ? delay : unhintedRateLimitCooldown)),
		});
		this._onDidChange.fire();
	}

	updateFromResponse(account: RequestAccount, response: Response, responseBody?: string, fallbackResource = 'core'): void {
		const resource = response.headers.get('x-ratelimit-resource') ?? fallbackResource;
		const isGraphQL = resource === 'graphql';
		const strictHeaders = isGraphQL || response.status === 403 || response.status === 429;
		const key = this._key(account, resource);
		const previous = this._states.get(key);
		const previousBlockedUntil = previous?.blockedUntil ?? (previous?.remaining === 0 ? previous.resetAt : undefined);
		const now = this._scheduler.now();
		const retryAfter = parseRetryAfter(response.headers.get('retry-after'), now, strictHeaders);
		const resetSeconds = parseHeaderNumber(response.headers.get('x-ratelimit-reset'), strictHeaders);
		const remaining = parseHeaderNumber(response.headers.get('x-ratelimit-remaining'), strictHeaders);
		const rateLimit = classifyGitHubHttpRateLimit(response, responseBody);
		const secondaryLimited = rateLimit === 'secondary';
		// A secondary limit can report an unspent primary quota window.
		const hinted = retryAfter !== undefined
			? now + retryAfter * 1000
			: remaining === 0 && resetSeconds !== undefined ? resetSeconds * 1000 : undefined;
		// Expired hints must not let a rate-limited refusal retry immediately.
		const refusedUntil = hinted !== undefined && hinted > now ? hinted : now + unhintedRateLimitCooldown;
		const blockedUntil = secondaryLimited
			? undefined
			: rateLimit !== undefined || (isGraphQL && remaining === 0)
				? refusedUntil
				: hinted;
		if (secondaryLimited) {
			const accountKey = RequestQueue.accountKey(account);
			this._accountBlockedUntil.set(accountKey, Math.max(refusedUntil, this._accountBlockedUntil.get(accountKey) ?? 0));
		}
		this._states.set(key, {
			limit: parseHeaderNumber(response.headers.get('x-ratelimit-limit'), strictHeaders) ?? previous?.limit,
			remaining: remaining ?? previous?.remaining,
			used: parseHeaderNumber(response.headers.get('x-ratelimit-used'), strictHeaders) ?? previous?.used,
			resetAt: resetSeconds !== undefined ? resetSeconds * 1000 : previous?.resetAt,
			blockedUntil: previousBlockedUntil !== undefined && previousBlockedUntil > now
				? Math.max(previousBlockedUntil, blockedUntil ?? 0) : blockedUntil,
		});
		this._onDidChange.fire();
	}

	updateFromGraphQL(account: RequestAccount, rateLimit: { readonly limit?: number; readonly remaining?: number; readonly used?: number; readonly resetAt?: string } | undefined): void {
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
		this._onDidChange.fire();
	}

	/** Records primary GraphQL exhaustion without shortening an existing server cooldown. */
	markGraphQLRateLimited(account: RequestAccount, retryAfter: string | null = null): void {
		const key = this._key(account, 'graphql');
		const previous = this._states.get(key);
		const now = this._scheduler.now();
		const retryAfterSeconds = parseRetryAfter(retryAfter, now, true);
		const hinted = retryAfterSeconds !== undefined ? now + retryAfterSeconds * 1000 : previous?.resetAt;
		const blockedUntil = hinted !== undefined && hinted > now ? hinted : now + unhintedRateLimitCooldown;
		this._states.set(key, {
			...previous,
			remaining: 0,
			blockedUntil: Math.max(previous?.blockedUntil ?? 0, blockedUntil),
		});
		this._onDidChange.fire();
	}
}

/** A generic "Rate Limit Exceeded" message can also accompany non-quota 403 denials. */
export function classifyGitHubHttpRateLimit(response: Pick<Response, 'status' | 'headers'>, body?: string): 'primary' | 'secondary' | undefined {
	if (response.status !== 403 && response.status !== 429) {
		return undefined;
	}
	if (response.headers.get('x-github-secondary-rate-limited')?.toLowerCase() === 'true'
		|| /\bsecondary rate limit\b|\babuse detection mechanism\b/i.test(body ?? '')) {
		return 'secondary';
	}
	const remaining = parseHeaderNumber(response.headers.get('x-ratelimit-remaining'), true);
	if (response.status === 429 || remaining === 0
		|| parseRetryAfter(response.headers.get('retry-after'), 0, true) !== undefined
		|| remaining === undefined && /\bAPI rate limit exceeded\b/i.test(body ?? '')) {
		return 'primary';
	}
	return undefined;
}
