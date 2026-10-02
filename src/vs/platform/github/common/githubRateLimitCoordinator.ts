/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReference, toDisposable } from '../../../base/common/lifecycle.js';
import { GitHubRequestError } from './githubTypes.js';
import { CooldownState } from './cooldownState.js';
import { parseHeaderNumber, parseRetryAfter } from './httpHeaders.js';
import { RequestQueue } from './requestQueue.js';
import { RequestAccount } from './types.js';

/** Pinned route observation used consistently for admission and response accounting. */
export interface IGitHubRestRateLimitResource {
	readonly name: string;
	readonly responseName: string;
	observe(headers: Headers): void;
}

/** Bounded client-specific route feedback whose live cooldowns prevent idle eviction. */
interface IRestResourceMapping {
	readonly account: RequestAccount;
	readonly accountKey: string;
	readonly route: string;
	readonly resources: Set<string>;
	resource: string;
	references: number;
	overflow: boolean;
}

/** GitHub's documented floor for retrying a rate limit it gave no reset hint for. */
const unhintedRateLimitCooldown = 60_000;

/** Interprets GitHub quota headers and GraphQL feedback using shared cooldown storage. */
export class GitHubRateLimitCoordinator extends CooldownState {

	static readonly maximumRestResourceMappings = 512;
	private static readonly maximumResourcesPerRoute = 16;
	private readonly _restResources = new Map<string, IRestResourceMapping>();

	/** Pins a bounded route-family observation; live cooldowns prevent idle eviction. */
	acquireRestResource(account: RequestAccount, url: string, scope = ''): IReference<IGitHubRestRateLimitResource> {
		if (this._store.isDisposed) {
			throw new GitHubRequestError('GitHub rate-limit coordinator was disposed', 'unknown');
		}
		const route = restRateLimitRoute(url);
		const key = this._restResourceKey(account, route.key, scope);
		let entry = this._restResources.get(key);
		if (!entry) {
			if (this._restResources.size >= GitHubRateLimitCoordinator.maximumRestResourceMappings) {
				const unused = [...this._restResources].find(([, candidate]) => candidate.references === 0
					&& [...candidate.resources].every(resource => this.getDelay(candidate.account, resource) === 0));
				if (!unused) {
					throw new GitHubRequestError('GitHub resource mapping capacity exceeded', 'overloaded');
				}
				this._restResources.delete(unused[0]);
			}
			entry = { account, accountKey: RequestQueue.accountKey(account), route: route.key, resource: this.getRestResource(account, url, scope), resources: new Set(), references: 0, overflow: false };
		} else if (!entry.resources.size) {
			entry.resource = this.getRestResource(account, url, scope);
		}
		if (entry.overflow) {
			throw new GitHubRequestError('GitHub resource mapping capacity exceeded', 'overloaded');
		}
		this._restResources.delete(key);
		this._restResources.set(key, entry);
		entry.references++;
		const retained = entry;
		const owner = this;
		const release = toDisposable(() => retained.references--);
		return {
			object: {
				get name() { return owner.getRestResource(account, url, scope); },
				get responseName() { return retained.resource; },
				observe(headers) {
					const resource = readRateLimitResource(headers);
					if (!resource) {
						return;
					}
					for (const previous of retained.resources) {
						if (owner.getDelay(account, previous) === 0) {
							retained.resources.delete(previous);
						}
					}
					if (!retained.resources.has(resource) && retained.resources.size >= GitHubRateLimitCoordinator.maximumResourcesPerRoute) {
						retained.overflow = true;
						throw new GitHubRequestError('GitHub resource mapping capacity exceeded', 'overloaded');
					}
					retained.resource = resource;
					retained.resources.add(resource);
				},
			},
			dispose: () => release.dispose(),
		};
	}

	getRestResource(account: RequestAccount, url: string, scope = ''): string {
		const route = restRateLimitRoute(url);
		const entry = this._restResources.get(this._restResourceKey(account, route.key, scope));
		const accountKey = RequestQueue.accountKey(account);
		const unresolvedKey = account.kind === 'bootstrap' && account.accountId !== undefined
			? RequestQueue.accountKey({ ...account, accountId: undefined })
			: undefined;
		const observed = entry?.resources.size ? [entry] : [];
		let selected = entry?.resource ?? route.fallback;
		if (!observed.length || unresolvedKey) {
			for (const candidate of this._restResources.values()) {
				if (candidate.route !== route.key || !candidate.resources.size) {
					continue;
				}
				if (!entry?.resources.size && candidate.accountKey === accountKey) {
					observed.push(candidate);
					selected = candidate.resource;
				} else if (candidate.accountKey === unresolvedKey) {
					observed.push(candidate);
				}
			}
		}
		for (const mapping of observed) {
			for (const resource of mapping.resources) {
				if (this.getDelay(account, resource) > this.getDelay(account, selected)) {
					selected = resource;
				}
			}
		}
		return selected;
	}

	getRestResponseResource(account: RequestAccount, url: string, scope = ''): string {
		const route = restRateLimitRoute(url);
		return this._restResources.get(this._restResourceKey(account, route.key, scope))?.resource ?? route.fallback;
	}

	private _restResourceKey(account: RequestAccount, route: string, scope: string): string {
		return `${RequestQueue.accountKey(account)}\x00${scope}\x00${route}`;
	}


	updateFromResponse(account: RequestAccount, response: Response, responseBody?: string, fallbackResource = 'core'): void {
		const resource = readRateLimitResource(response.headers) ?? fallbackResource;
		const isGraphQL = resource === 'graphql';
		const key = this._key(account, resource);
		const previous = this._states.get(key);
		const previousBlockedUntil = previous?.blockedUntil ?? (previous?.remaining === 0 ? previous.resetAt : undefined);
		const now = this._scheduler.now();
		const retryAfter = parseRetryAfter(response.headers.get('retry-after'), now, isGraphQL);
		const resetSeconds = parseHeaderNumber(response.headers.get('x-ratelimit-reset'), isGraphQL);
		const remaining = parseHeaderNumber(response.headers.get('x-ratelimit-remaining'), isGraphQL);
		const rateLimit = classifyGitHubHttpRateLimit(response, responseBody);
		const rateLimited = rateLimit !== undefined;
		const secondaryLimited = rateLimit === 'secondary';
		// GitHub's documented order: honour `retry-after`; otherwise wait for the
		// reset only once the quota is actually spent. A secondary limit reports
		// the primary window, so obeying its reset would park the account for up
		// to an hour over a refusal that needs a minute.
		const hinted = retryAfter !== undefined
			? now + retryAfter * 1000
			: !secondaryLimited && remaining === 0 && resetSeconds !== undefined ? resetSeconds * 1000 : undefined;
		// A refusal must always park the caller, including when the only hint
		// GitHub gave has already elapsed and would otherwise retry at once.
		const refusedUntil = hinted !== undefined && hinted > now ? hinted : now + unhintedRateLimitCooldown;
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

	protected override _clearAccount(accountKey: string): void {
		const prefix = `${accountKey}\x00`;
		for (const key of this._restResources.keys()) {
			if (key.startsWith(prefix)) {
				this._restResources.delete(key);
			}
		}
		super._clearAccount(accountKey);
	}

	override dispose(): void {
		this._restResources.clear();
		super.dispose();
	}
}

function restRateLimitRoute(url: string): { key: string; fallback: string } {
	const target = new URL(url);
	const path = target.pathname.replace(/%[0-9a-f]{2}/gi, encoded => {
		const character = String.fromCharCode(parseInt(encoded.slice(1), 16));
		return /^[\w.~\-]$/.test(character) ? character : encoded.toUpperCase();
	});
	const checks = /^(?<base>.*?)(?:\/repos\/[^/]+\/[^/]+|\/repositories\/[^/]+)\/(?:commits\/.+\/check-(?:runs|suites)|check-(?:runs|suites)(?:\/.*)?)\/?$/.exec(path);
	const search = /^(?<base>.*?)\/search\/(?<kind>[^/]+)\/?$/.exec(path);
	const semantic = search?.groups?.kind === 'issues' && ['semantic', 'hybrid'].includes(target.searchParams.get('search_type') ?? '');
	const key = checks ? JSON.stringify([target.origin, checks.groups?.base, 'checks'])
		: search ? JSON.stringify([target.origin, search.groups?.base, 'search', search.groups?.kind, semantic])
			: JSON.stringify([target.origin, path]);
	if (key.length > 4096) {
		throw new GitHubRequestError('GitHub request route exceeds the resource mapping limit', 'validation');
	}
	return { key, fallback: search || /^(?:\/api\/v3)?\/search\//.test(path) ? 'search' : 'core' };
}

function readRateLimitResource(headers: Headers): string | undefined {
	const value = headers.get('x-ratelimit-resource')?.trim().toLowerCase();
	return value && /^[a-z][a-z0-9_-]{0,63}$/.test(value) ? value : undefined;
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
	const remaining = parseHeaderNumber(response.headers.get('x-ratelimit-remaining'));
	if (response.status === 429 || remaining === 0
		|| parseRetryAfter(response.headers.get('retry-after'), 0) !== undefined
		|| remaining === undefined && /\bAPI rate limit exceeded\b/i.test(body ?? '')) {
		return 'primary';
	}
	return undefined;
}