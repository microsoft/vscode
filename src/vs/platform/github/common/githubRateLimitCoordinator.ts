/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IReference, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { GitHubRequestAccount, GitHubRequestError } from './githubTypes.js';
import { GitHubRequestQueue } from './githubRequestQueue.js';
import { IGitHubScheduler, schedulerDelay } from './githubScheduler.js';

export interface GitHubRateLimitState {
	readonly limit?: number;
	readonly remaining?: number;
	readonly used?: number;
	readonly resetAt?: number;
	readonly blockedUntil?: number;
}

export interface IGitHubRestRateLimitResource {
	readonly name: string;
	readonly responseName: string;
	observe(headers: Headers): void;
}

interface IRestResourceMapping {
	readonly account: GitHubRequestAccount;
	readonly accountKey: string;
	readonly route: string;
	readonly resources: Set<string>;
	resource: string;
	references: number;
	overflow: boolean;
}

/** GitHub's documented floor for retrying a rate limit it gave no reset hint for. */
const unhintedRateLimitCooldown = 60_000;

export class GitHubRateLimitCoordinator extends Disposable {

	static readonly maximumRestResourceMappings = 512;
	private static readonly maximumResourcesPerRoute = 16;
	private readonly _restResources = new Map<string, IRestResourceMapping>();
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;
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

	/** Pins a bounded route-family observation; live cooldowns prevent idle eviction. */
	acquireRestResource(account: GitHubRequestAccount, url: string, scope = ''): IReference<IGitHubRestRateLimitResource> {
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
			entry = { account, accountKey: GitHubRequestQueue.accountKey(account), route: route.key, resource: this.getRestResource(account, url, scope), resources: new Set(), references: 0, overflow: false };
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

	getRestResource(account: GitHubRequestAccount, url: string, scope = ''): string {
		const route = restRateLimitRoute(url);
		const entry = this._restResources.get(this._restResourceKey(account, route.key, scope));
		const accountKey = GitHubRequestQueue.accountKey(account);
		const unresolvedKey = account.kind === 'bootstrap' && account.accountId !== undefined
			? GitHubRequestQueue.accountKey({ ...account, accountId: undefined })
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

	getRestResponseResource(account: GitHubRequestAccount, url: string, scope = ''): string {
		const route = restRateLimitRoute(url);
		return this._restResources.get(this._restResourceKey(account, route.key, scope))?.resource ?? route.fallback;
	}

	private _restResourceKey(account: GitHubRequestAccount, route: string, scope: string): string {
		return `${GitHubRequestQueue.accountKey(account)}\x00${scope}\x00${route}`;
	}

	getDelay(account: GitHubRequestAccount, resource: string): number {
		const accountKey = GitHubRequestQueue.accountKey(account);
		const state = this._states.get(this._key(account, resource));
		const resourceBlockedUntil = state?.blockedUntil ?? (state?.remaining === 0 ? state.resetAt : undefined);
		const accountBlockedUntil = this._accountBlockedUntil.get(accountKey);
		const blockedUntil = resourceBlockedUntil === undefined
			? accountBlockedUntil
			: accountBlockedUntil === undefined ? resourceBlockedUntil : Math.max(resourceBlockedUntil, accountBlockedUntil);
		const delay = blockedUntil === undefined ? 0 : Math.max(0, blockedUntil - this._scheduler.now());
		return account.kind === 'bootstrap' && account.accountId !== undefined
			? Math.max(delay, this.getDelay({ ...account, accountId: undefined }, resource))
			: delay;
	}

	preserveCooldown(account: GitHubRequestAccount, resource: string, delay: number): void {
		if (delay <= 0) {
			return;
		}
		const key = this._key(account, resource);
		const previous = this._states.get(key);
		this._states.set(key, { ...previous, blockedUntil: Math.max(previous?.blockedUntil ?? 0, this._scheduler.now() + delay) });
		this.releaseAccount(account);
		this._onDidChange.fire();
	}

	updateRetryAfter(account: GitHubRequestAccount, resource: string, value: string | null, fallbackDelay = 0): void {
		const now = this._scheduler.now();
		const seconds = parseSeconds(value, now);
		const delay = seconds !== undefined && seconds > 0 ? seconds * 1000 : fallbackDelay;
		if (delay > 0) {
			const key = this._key(account, resource);
			const previous = this._states.get(key);
			this._states.set(key, { ...previous, blockedUntil: Math.max(previous?.blockedUntil ?? 0, now + delay) });
			this._onDidChange.fire();
		}
	}

	async wait(account: GitHubRequestAccount, resource: string, signal: AbortSignal): Promise<void> {
		const delay = this.getDelay(account, resource);
		if (delay > 0) {
			await schedulerDelay(this._scheduler, delay, signal);
		}
	}

	updateFromResponse(account: GitHubRequestAccount, response: Response, responseBody?: string, fallbackResource = 'core'): void {
		const resource = readRateLimitResource(response.headers) ?? fallbackResource;
		const key = this._key(account, resource);
		const previous = this._states.get(key);
		const now = this._scheduler.now();
		const retryAfter = parseSeconds(response.headers.get('retry-after'), now);
		const resetSeconds = parseNumber(response.headers.get('x-ratelimit-reset'));
		const remaining = parseNumber(response.headers.get('x-ratelimit-remaining'));
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
		const previousBlockedUntil = previous?.blockedUntil ?? (previous?.remaining === 0 ? previous.resetAt : undefined);
		this._states.set(key, {
			limit: parseNumber(response.headers.get('x-ratelimit-limit')) ?? previous?.limit,
			remaining: remaining ?? previous?.remaining,
			used: parseNumber(response.headers.get('x-ratelimit-used')) ?? previous?.used,
			resetAt: resetSeconds !== undefined ? resetSeconds * 1000 : previous?.resetAt,
			blockedUntil: previousBlockedUntil !== undefined && previousBlockedUntil > now
				? Math.max(previousBlockedUntil, blockedUntil ?? 0) : blockedUntil,
		});
		this._onDidChange.fire();
	}

	updateFromGraphQL(account: GitHubRequestAccount, rateLimit: { readonly limit?: number; readonly remaining?: number; readonly used?: number; readonly resetAt?: string } | undefined): void {
		if (!rateLimit) {
			return;
		}
		const resetAt = typeof rateLimit.resetAt === 'string' ? Date.parse(rateLimit.resetAt) : undefined;
		const key = this._key(account, 'graphql');
		const previous = this._states.get(key);
		this._states.set(key, {
			limit: rateLimit.limit,
			remaining: rateLimit.remaining,
			used: rateLimit.used,
			resetAt: resetAt !== undefined && Number.isFinite(resetAt) ? resetAt : undefined,
			...(previous?.blockedUntil !== undefined && previous.blockedUntil > this._scheduler.now()
				? { blockedUntil: previous.blockedUntil } : {}),
		});
		this._onDidChange.fire();
	}

	markGraphQLRateLimited(account: GitHubRequestAccount): void {
		const key = this._key(account, 'graphql');
		const previous = this._states.get(key);
		const now = this._scheduler.now();
		this._states.set(key, {
			...previous,
			remaining: 0,
			// The retained reset can belong to a window that has already closed,
			// and a refusal must park the caller rather than retry at once.
			blockedUntil: Math.max(previous?.blockedUntil ?? 0, previous?.resetAt !== undefined && previous.resetAt > now
				? previous.resetAt
				: now + unhintedRateLimitCooldown),
		});
		this._onDidChange.fire();
	}

	clearAccount(account: GitHubRequestAccount): void {
		this._clearAccount(GitHubRequestQueue.accountKey(account));
		this._scheduleCleanup();
		this._onDidChange.fire();
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
		for (const key of this._restResources.keys()) {
			if (key.startsWith(prefix)) {
				this._restResources.delete(key);
			}
		}
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
		this._restResources.clear();
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

function parseNumber(value: string | null): number | undefined {
	if (value === null || !value.trim()) {
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

/** A generic "Rate Limit Exceeded" message can also accompany non-quota 403 denials. */
export function classifyGitHubHttpRateLimit(response: Pick<Response, 'status' | 'headers'>, body?: string): 'primary' | 'secondary' | undefined {
	if (response.status !== 403 && response.status !== 429) {
		return undefined;
	}
	if (response.headers.get('x-github-secondary-rate-limited')?.toLowerCase() === 'true'
		|| /\bsecondary rate limit\b|\babuse detection mechanism\b/i.test(body ?? '')) {
		return 'secondary';
	}
	const remaining = parseNumber(response.headers.get('x-ratelimit-remaining'));
	if (response.status === 429 || remaining === 0
		|| parseSeconds(response.headers.get('retry-after'), 0) !== undefined
		|| remaining === undefined && /\bAPI rate limit exceeded\b/i.test(body ?? '')) {
		return 'primary';
	}
	return undefined;
}
