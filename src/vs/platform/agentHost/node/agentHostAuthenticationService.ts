/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ILogService } from '../../log/common/log.js';
import type { AuthenticateParams, AuthenticateResult, IAgent, IAgentHostAuthTokenRequest } from '../common/agent.js';

interface IStoredAuthToken {
	readonly resource: string;
	readonly scopes: readonly string[];
	readonly token: string;
}

export class AgentHostAuthenticationService {

	private readonly _tokens = new Map<string, IStoredAuthToken>();

	constructor(
		private readonly _logService: ILogService,
	) { }

	async authenticate(params: AuthenticateParams, providers: Iterable<IAgent>): Promise<AuthenticateResult> {
		this._logService.trace(`[AgentHostAuthenticationService] authenticate called: resource=${params.resource}`);
		const providerList = [...providers];
		// Multiple providers may share the same protected resource (e.g.
		// both Copilot CLI and Claude consume the GitHub Copilot token).
		// Fan out to every matching provider in parallel; the request is
		// considered authenticated if at least one accepts. Provider
		// failures are isolated -- one provider rejecting (e.g. proxy
		// server bind failure) MUST NOT prevent another provider from
		// accepting the same token.
		const matching = providerList.filter(
			p => p.getProtectedResources().some(r => r.resource === params.resource),
		);
		const settled = await Promise.allSettled(
			matching.map(p => p.authenticate(params.resource, params.token)),
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
		const scopes = this._normalizeScopes(params.scopes);
		const key = this._key(params.resource, scopes);
		if (!authenticated && !rejected) {
			authenticated = this._tokens.get(key)?.token === params.token;
		}
		if (!params.token) {
			// Revocation must never remain replayable, even when a provider rejects
			// while clearing its own live state.
			this._tokens.delete(key);
		} else if (authenticated) {
			this._tokens.set(key, { resource: params.resource, scopes, token: params.token });
		}
		return { authenticated };
	}

	async replay(provider: IAgent): Promise<void> {
		const protectedResources = new Set(provider.getProtectedResources().map(resource => resource.resource));
		for (const stored of this._tokens.values()) {
			const params: AuthenticateParams = { resource: stored.resource, scopes: stored.scopes, token: stored.token };
			if (protectedResources.has(stored.resource)) {
				try {
					await provider.authenticate(stored.resource, stored.token);
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
		const scopes = this._normalizeScopes(request.scopes);
		const exact = this._tokens.get(this._key(request.resource, scopes));
		if (exact) {
			return exact.token;
		}
		if (scopes.length === 0) {
			return undefined;
		}

		const requested = new Set(scopes);
		let best: IStoredAuthToken | undefined;
		for (const candidate of this._tokens.values()) {
			if (candidate.resource !== request.resource || candidate.scopes.length === 0) {
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
			return best.token;
		}

		// Compatibility for clients that resolved the right token before scopes
		// were forwarded through the authenticate command.
		return this._tokens.get(this._key(request.resource, []))?.token;
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
