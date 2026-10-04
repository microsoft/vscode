/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, disposableTimeout } from '../../../base/common/async.js';
import { getExpirationTime, getRemainingTimeInSeconds, isExpired } from '../../../base/common/date.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { ILogService } from '../../log/common/log.js';
import type { AuthenticateParams, AuthenticateResult, IAgent, IAgentHostAuthTokenRequest } from '../common/agent.js';
import { authenticationAccountId, authenticationAccountMeta, IAgentAuthenticationAccount, readAuthenticationAccount } from '../common/meta/agentAuthenticationAccount.js';

export interface IAgentHostAuthTokenChangeEvent {
	readonly resource: string;
	readonly scopes: readonly string[];
	readonly token: string | undefined;
}

export const IAgentHostAuthenticationService = createDecorator<IAgentHostAuthenticationService>('agentHostAuthenticationService');
export const IAgentHostAuthenticationController = createDecorator<IAgentHostAuthenticationController>('agentHostAuthenticationController');

export interface IAgentHostAuthenticationService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeAuthToken: Event<IAgentHostAuthTokenChangeEvent>;
	getAuthToken(request: IAgentHostAuthTokenRequest): string | undefined;
	getAuthAccount(request: IAgentHostAuthTokenRequest): IAgentAuthenticationAccount | undefined;
}

export interface IAgentHostAuthenticationController {
	readonly _serviceBrand: undefined;
	authenticate(params: AuthenticateParams, providers: Iterable<IAgent>): Promise<AuthenticateResult>;
	replay(provider: IAgent): Promise<void>;
	/** Quarantines only the currently selected credential refused by its resource server. */
	rejectToken(request: IAgentHostAuthTokenRequest, token: string, accountId: string | undefined): boolean;
}

interface IStoredAuthToken {
	readonly resource: string;
	readonly scopes: readonly string[];
	readonly token: string;
	readonly expiresAt: number | undefined;
	readonly account?: IAgentAuthenticationAccount;
}

interface IAuthenticationRequest {
	readonly resource: string;
	readonly completed: DeferredPromise<void>;
}

export class AgentHostAuthenticationService extends Disposable implements IAgentHostAuthenticationService, IAgentHostAuthenticationController {

	declare readonly _serviceBrand: undefined;
	private readonly _tokens = new Map<string, IStoredAuthToken>();
	private readonly _rejectedTokens = new Map<string, { readonly token: string; readonly scopes: readonly string[] }[]>();
	private readonly _authenticationRequests = new Map<string, IAuthenticationRequest>();
	private readonly _onDidChangeAuthToken = this._register(new Emitter<IAgentHostAuthTokenChangeEvent>());
	readonly onDidChangeAuthToken = this._onDidChangeAuthToken.event;

	constructor(
		private readonly _logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => {
			this._tokens.clear();
			this._rejectedTokens.clear();
			for (const request of this._authenticationRequests.values()) {
				request.completed.complete();
			}
			this._authenticationRequests.clear();
		}));
	}

	async authenticate(params: AuthenticateParams, providers: Iterable<IAgent>): Promise<AuthenticateResult> {
		if (this._store.isDisposed || this._isRejectedToken(params, params.token)) {
			this._logService.debug(`[AgentHostAuthenticationService] Refusing a rejected credential for resource=${params.resource}`);
			return { authenticated: false };
		}
		const scopes = this._normalizeScopes(params.scopes);
		const key = this._key(params.resource, scopes);
		const previousRequest = this._authenticationRequests.get(key);
		const request: IAuthenticationRequest = { resource: params.resource, completed: new DeferredPromise<void>() };
		this._authenticationRequests.set(key, request);
		// Wake replayers only after the replacement request is visible.
		previousRequest?.completed.complete();
		try {
			return await this._authenticate(params, providers, scopes, key, request);
		} finally {
			if (this._authenticationRequests.get(key) === request) {
				this._authenticationRequests.delete(key);
			}
			request.completed.complete();
		}
	}

	private async _authenticate(params: AuthenticateParams, providers: Iterable<IAgent>, scopes: readonly string[], key: string, request: IAuthenticationRequest): Promise<AuthenticateResult> {
		this._logService.trace(`[AgentHostAuthenticationService] authenticate called: resource=${params.resource}`);
		const expiresAt = getExpirationTime(params.expiresIn);
		const providerList = [...providers];
		// Multiple providers may share the same protected resource (e.g.
		// both Copilot CLI and Claude consume the Copilot-scoped OAuth credential).
		// Fan out to every matching provider in parallel; the request is
		// considered authenticated if at least one accepts. Provider
		// failures are isolated -- one provider rejecting (e.g. proxy
		// server bind failure) MUST NOT prevent another provider from
		// accepting the same token.
		const matching = providerList.filter(
			p => p.getProtectedResources().some(r => r.resource === params.resource),
		);
		const settled = await Promise.allSettled(
			matching.map(p => p.authenticate(params.resource, params.token, params.expiresIn)),
		);
		let authenticated = false;
		let rejected = false;
		for (let i = 0; i < settled.length; i++) {
			const result = settled[i];
			if (result.status === 'fulfilled') {
				authenticated ||= result.value;
			} else {
				rejected = true;
				this._logService.error(
					result.reason,
					`[AgentHostAuthenticationService] Provider '${matching[i].id}' authenticate threw for resource=${params.resource}`,
				);
			}
		}
		const sessionResourceHandlers = providerList.filter(p => p.handleAuthenticationToken);
		const sessionResourceSettled = await Promise.allSettled(
			sessionResourceHandlers.map(p => p.handleAuthenticationToken ? p.handleAuthenticationToken(params) : Promise.resolve(false)),
		);
		for (let i = 0; i < sessionResourceSettled.length; i++) {
			const result = sessionResourceSettled[i];
			if (result.status === 'fulfilled') {
				authenticated ||= result.value;
			} else {
				rejected = true;
				this._logService.error(
					result.reason,
					`[AgentHostAuthenticationService] Provider '${sessionResourceHandlers[i].id}' handleAuthenticationToken threw for resource=${params.resource}`,
				);
			}
		}
		if (this._store.isDisposed || this._isRejectedToken(params, params.token)) {
			return { authenticated: false };
		}
		if (this._authenticationRequests.get(key) !== request) {
			return { authenticated };
		}
		const previous = this._tokens.get(key);
		const previousToken = previous?.token;
		if (!authenticated && !rejected) {
			authenticated = this._tokens.get(key)?.token === params.token;
		}
		if (!params.token) {
			// Revocation must never remain replayable, even when a provider rejects
			// while clearing its own live state.
			this._tokens.delete(key);
		} else if (authenticated) {
			const account = readAuthenticationAccount(params);
			this._tokens.set(key, { resource: params.resource, scopes, token: params.token, expiresAt, account });
		}
		const token = this._tokens.get(key)?.token;
		if (previousToken !== token || authenticationAccountId(previous?.account) !== authenticationAccountId(this._tokens.get(key)?.account)) {
			this._onDidChangeAuthToken.fire({ resource: params.resource, scopes, token });
		}
		return { authenticated };
	}

	async replay(provider: IAgent): Promise<void> {
		while (true) {
			const pending = [...this._authenticationRequests.values()].filter(request =>
				provider.handleAuthenticationToken || provider.getProtectedResources().some(resource => resource.resource === request.resource));
			if (pending.length === 0) {
				break;
			}
			await Promise.all(pending.map(request => request.completed.p));
		}
		const protectedResources = new Set(provider.getProtectedResources().map(resource => resource.resource));
		for (const [key, stored] of this._tokens) {
			if (this._authenticationRequests.has(key) || this._tokens.get(key) !== stored || this._isRejectedToken(stored, stored.token)) {
				continue;
			}
			const now = Date.now();
			if (isExpired(stored.expiresAt, now)) {
				this._tokens.delete(key);
				continue;
			}
			const expiresIn = getRemainingTimeInSeconds(stored.expiresAt, now);
			const params: AuthenticateParams = {
				resource: stored.resource, scopes: stored.scopes, token: stored.token, expiresIn,
				...(stored.account ? { _meta: authenticationAccountMeta(stored.account) } : {}),
			};
			if (protectedResources.has(stored.resource)) {
				try {
					await provider.authenticate(stored.resource, stored.token, expiresIn);
				} catch (error) {
					this._logService.error(error, `[AgentHostAuthenticationService] Provider '${provider.id}' rejected replayed authentication for resource=${stored.resource}`);
				}
			}
			if (provider.handleAuthenticationToken) {
				try {
					await provider.handleAuthenticationToken(params);
				} catch (error) {
					this._logService.error(error, `[AgentHostAuthenticationService] Provider '${provider.id}' rejected replayed session authentication for resource=${stored.resource}`);
				}
			}
		}
	}

	getAuthToken(request: IAgentHostAuthTokenRequest): string | undefined {
		const stored = this._getAuthToken(request, false);
		return stored && !this._isRejectedToken(stored, stored.token) ? stored.token : undefined;
	}

	getAuthAccount(request: IAgentHostAuthTokenRequest): IAgentAuthenticationAccount | undefined {
		return (this._getAuthToken(request, false) ?? this._getAuthToken(request, true))?.account;
	}

	rejectToken(request: IAgentHostAuthTokenRequest, token: string, accountId: string | undefined): boolean {
		const stored = this._getAuthToken(request, false);
		if (this._store.isDisposed || !stored || stored.token !== token || authenticationAccountId(stored.account) !== accountId || this._isRejectedToken(stored, token)) {
			return false;
		}
		const rejected = this._rejectedTokens.get(request.resource) ?? [];
		rejected.push({ token, scopes: this._normalizeScopes(request.scopes) });
		this._rejectedTokens.set(request.resource, rejected);
		this._logService.debug(`[AgentHostAuthenticationService] Quarantined a refused credential for resource=${request.resource}`);
		// Let the failing request's promise chain settle before retiring its client.
		disposableTimeout(() => {
			if (!this._store.isDisposed && this._getAuthToken(request, false) === stored) {
				this._onDidChangeAuthToken.fire({ resource: stored.resource, scopes: stored.scopes, token: undefined });
			}
		}, 0, this._store);
		return true;
	}

	private _isRejectedToken(request: IAgentHostAuthTokenRequest, token: string): boolean {
		const scopes = this._normalizeScopes(request.scopes);
		return !!token && (this._rejectedTokens.get(request.resource)?.some(rejected =>
			rejected.token === token && (scopes.length === 0 || rejected.scopes.every(scope => scopes.includes(scope)))) ?? false);
	}

	private _getAuthToken(request: IAgentHostAuthTokenRequest, includeExpired: boolean): IStoredAuthToken | undefined {
		const scopes = this._normalizeScopes(request.scopes);
		const exact = this._tokens.get(this._key(request.resource, scopes));
		if (exact && (includeExpired || !isExpired(exact.expiresAt))) {
			return exact;
		}
		if (scopes.length === 0) {
			return undefined;
		}

		const requested = new Set(scopes);
		let best: IStoredAuthToken | undefined;
		for (const candidate of this._tokens.values()) {
			if (candidate.resource !== request.resource || candidate.scopes.length === 0 || (!includeExpired && isExpired(candidate.expiresAt))) {
				continue;
			}
			if (!this._containsAll(candidate.scopes, requested)) {
				continue;
			}
			if (!best || candidate.scopes.length < best.scopes.length) {
				best = candidate;
			}
		}
		if (best) {
			return best;
		}

		// Compatibility for clients that resolved the right token before scopes
		// were forwarded through the authenticate command.
		const unscoped = this._tokens.get(this._key(request.resource, []));
		return unscoped && (includeExpired || !isExpired(unscoped.expiresAt)) ? unscoped : undefined;
	}

	private _containsAll(scopes: readonly string[], requested: ReadonlySet<string>): boolean {
		for (const scope of requested) {
			if (!scopes.includes(scope)) {
				return false;
			}
		}
		return true;
	}

	private _key(resource: string, scopes: readonly string[]): string {
		return `${resource}\x00${scopes.join('\x00')}`;
	}

	private _normalizeScopes(scopes: readonly string[] | undefined): readonly string[] {
		return scopes ? [...new Set(scopes)].sort() : [];
	}

}
