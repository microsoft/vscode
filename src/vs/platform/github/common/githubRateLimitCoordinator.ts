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
		const key = this._key(account, resource);
		const previous = this._states.get(key);
		const previousBlockedUntil = previous?.blockedUntil ?? (isGraphQL && previous?.remaining === 0 ? previous.resetAt : undefined);
		const now = this._scheduler.now();
		const retryAfter = parseRetryAfter(response.headers.get('retry-after'), now, isGraphQL);
		const resetSeconds = parseHeaderNumber(response.headers.get('x-ratelimit-reset'), isGraphQL);
		const remaining = parseHeaderNumber(response.headers.get('x-ratelimit-remaining'), isGraphQL);
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
			const accountKey = RequestQueue.accountKey(account);
			// GitHub asks clients that hit a secondary limit to wait at least a
			// minute when it gives no usable hint, and the refusal parks the
			// whole account rather than only the resource that observed it.
			this._accountBlockedUntil.set(accountKey, Math.max(refusedUntil, this._accountBlockedUntil.get(accountKey) ?? 0));
		}
		this._states.set(key, {
			limit: parseHeaderNumber(response.headers.get('x-ratelimit-limit'), isGraphQL) ?? previous?.limit,
			remaining: remaining ?? previous?.remaining,
			used: parseHeaderNumber(response.headers.get('x-ratelimit-used'), isGraphQL) ?? previous?.used,
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
