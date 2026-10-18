/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../base/common/async.js';
import { getExpirationTime, getRemainingTimeInSeconds, isExpired } from '../../../base/common/date.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { ILogService } from '../../log/common/log.js';
import type { AuthenticateParams, AuthenticateResult, IAgent, IAgentHostAuthTokenRequest } from '../common/agent.js';
import type { ProtectedResourceMetadata } from '../common/state/protocol/state.js';
import { authenticationAccountId, authenticationAccountMeta, IAgentAuthenticationAccount, readAuthenticationAccount } from '../common/meta/agentAuthenticationAccount.js';
import { isScopedCredentialUsable, normalizeAuthenticationScopes, type IAgentHostAuthenticationScope, type IAgentHostCredentialPrincipal, type IAgentHostCredentialSource, type IAgentHostScopedCredential } from '../common/agentHostCredentials.js';
import { AhpErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';

export const SESSION_CREDENTIAL_PRINCIPAL_KEY = 'vscode.credentialPrincipal';

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
	getAuthToken(request: IAgentHostAuthTokenRequest, source?: IAgentHostCredentialSource): string | undefined;
	getAuthAccount(request: IAgentHostAuthTokenRequest): IAgentAuthenticationAccount | undefined;
	getSessionCredentialSource(session: string, usage?: 'execution' | 'agentMerge'): IAgentHostCredentialSource | undefined;
	getSessionCredentialPrincipal(session: string): IAgentHostCredentialPrincipal | undefined;
	bindSessionCredentials(session: string, source: IAgentHostCredentialSource | undefined, chat?: string, usage?: 'execution' | 'agentMerge'): void;
	restoreSessionCredentialPrincipal(session: string, principal: IAgentHostCredentialPrincipal, chat?: string): void;
	releaseSessionCredentials(session: string): void;
	createLocalCredentialSource(principal: IAgentHostCredentialPrincipal, resources: readonly ProtectedResourceMetadata[]): Promise<IAgentHostCredentialSource>;
}

export interface IAgentHostAuthenticationController {
	readonly _serviceBrand: undefined;
	authenticate(params: AuthenticateParams, providers: Iterable<IAgent>, scope?: IAgentHostAuthenticationScope): Promise<AuthenticateResult>;
	replay(provider: IAgent): Promise<void>;
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
	private readonly _authenticationRequests = new Map<string, IAuthenticationRequest>();
	private readonly _sessionCredentials = new Map<string, IAgentHostCredentialSource>();
	private readonly _agentMergeCredentials = new Map<string, IAgentHostCredentialSource>();
	private readonly _unavailableSources = new Map<string, IAgentHostCredentialSource>();
	private readonly _sessionPrincipals = new Map<string, IAgentHostCredentialPrincipal>();
	private readonly _credentialOwners = new Map<string, string>();
	private readonly _revocations = new Map<string, number>();
	private readonly _onDidChangeAuthToken = this._register(new Emitter<IAgentHostAuthTokenChangeEvent>());
	readonly onDidChangeAuthToken = this._onDidChangeAuthToken.event;

	constructor(
		private readonly _logService: ILogService,
		private readonly _fetch: typeof globalThis.fetch = globalThis.fetch,
	) {
		super();
		this._register(toDisposable(() => {
			this._tokens.clear();
			this._sessionCredentials.clear();
			this._agentMergeCredentials.clear();
			this._unavailableSources.clear();
			this._sessionPrincipals.clear();
			this._credentialOwners.clear();
			this._revocations.clear();
			for (const request of this._authenticationRequests.values()) {
				request.completed.complete();
			}
			this._authenticationRequests.clear();
		}));
	}

	async authenticate(params: AuthenticateParams, providers: Iterable<IAgent>, scope?: IAgentHostAuthenticationScope): Promise<AuthenticateResult> {
		if (scope) {
			const providerList = [...providers];
			const resources = [
				...providerList.flatMap(provider => provider.getProtectedResources().map(resource => resource.resource)),
				...(scope.principal ? [scope.principal.apiOrigin] : []),
			];
			if (resources.includes(params.resource)) {
				await scope.authenticate(params, resources);
				return { authenticated: true };
			}
			const validated = await scope.validate(params);
			let authenticated = false;
			const handlers = providerList.filter(provider => provider.handleAuthenticationToken);
			const settled = await Promise.allSettled(handlers.map(provider => provider.handleAuthenticationToken?.(validated)));
			for (let index = 0; index < settled.length; index++) {
				const result = settled[index];
				if (result.status === 'fulfilled') {
					authenticated ||= result.value === true;
				} else {
					this._logService.error(result.reason, `[AgentHostAuthenticationService] Provider '${handlers[index].id}' rejected scoped resource authentication`);
				}
			}
			return { authenticated };
		}
		const scopes = normalizeAuthenticationScopes(params.scopes);
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
			this._revocations.set(key, (this._revocations.get(key) ?? 0) + 1);
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
			if (this._authenticationRequests.has(key) || this._tokens.get(key) !== stored) {
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

	getAuthToken(request: IAgentHostAuthTokenRequest, source?: IAgentHostCredentialSource): string | undefined {
		source ??= request.session ? this.getSessionCredentialSource(request.session) : undefined;
		if (source) {
			return source.getCredential(request)?.token;
		}
		return this._getAuthToken(request, false)?.token;
	}

	getAuthAccount(request: IAgentHostAuthTokenRequest): IAgentAuthenticationAccount | undefined {
		const source = request.session ? this.getSessionCredentialSource(request.session) : undefined;
		if (source) {
			const credential = source.getCredential(request);
			return credential && source.principal ? { providerId: 'github', accountId: source.principal.userId } : undefined;
		}
		return (this._getAuthToken(request, false) ?? this._getAuthToken(request, true))?.account;
	}

	getSessionCredentialSource(session: string, usage: 'execution' | 'agentMerge' = 'execution'): IAgentHostCredentialSource | undefined {
		if (usage === 'agentMerge') {
			return this._agentMergeCredentials.get(session);
		}
		const source = this._sessionCredentials.get(session);
		if (source) {
			return source;
		}
		const principal = this.getSessionCredentialPrincipal(session);
		if (!principal) {
			return undefined;
		}
		let unavailable = this._unavailableSources.get(session);
		if (!unavailable) {
			unavailable = {
				principal,
				getCredential: () => { throw new ProtocolError(AhpErrorCodes.AuthRequired, 'An isolated session requires an authenticated sponsor'); },
			};
			this._unavailableSources.set(session, unavailable);
		}
		return unavailable;
	}

	getSessionCredentialPrincipal(session: string): IAgentHostCredentialPrincipal | undefined {
		return this._sessionPrincipals.get(this._credentialOwners.get(session) ?? session);
	}

	bindSessionCredentials(session: string, source: IAgentHostCredentialSource | undefined, chat?: string, usage: 'execution' | 'agentMerge' = 'execution'): void {
		if (!source && usage === 'agentMerge') {
			this._agentMergeCredentials.delete(chat ?? session);
			return;
		}
		if (!source?.principal) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Session sponsorship requires a validated GitHub owner');
		}
		this.restoreSessionCredentialPrincipal(session, source.principal);
		(usage === 'agentMerge' ? this._agentMergeCredentials : this._sessionCredentials).set(chat ?? session, source);
		this._credentialOwners.set(chat ?? session, session);
	}

	restoreSessionCredentialPrincipal(session: string, principal: IAgentHostCredentialPrincipal, chat?: string): void {
		const previous = this._sessionPrincipals.get(session);
		if (previous && (previous.apiOrigin !== principal.apiOrigin || previous.userId !== principal.userId)) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'The session credential owner cannot change');
		}
		this._sessionPrincipals.set(session, principal);
		if (chat !== undefined) {
			this._credentialOwners.set(chat, session);
		}
	}

	releaseSessionCredentials(session: string): void {
		for (const [resource, owner] of this._credentialOwners) {
			if (owner === session) {
				this._sessionCredentials.delete(resource);
				this._agentMergeCredentials.delete(resource);
				this._unavailableSources.delete(resource);
				this._credentialOwners.delete(resource);
			}
		}
		this._sessionPrincipals.delete(session);
		this._unavailableSources.delete(session);
	}

	async createLocalCredentialSource(principal: IAgentHostCredentialPrincipal, resources: readonly ProtectedResourceMetadata[]): Promise<IAgentHostCredentialSource> {
		const { resolveMissionControlIdentity } = await import('./missionControl/missionControlAuthentication.js');
		const captured = new Map<string, IAgentHostScopedCredential>();
		for (const resource of resources) {
			if (new URL(resource.resource).origin !== new URL(principal.apiOrigin).origin) {
				throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Local credential origin does not match the isolated session owner');
			}
			const request = { resource: resource.resource, scopes: resource.scopes_supported };
			const stored = this._getAuthToken(request, false)
				?? [...this._tokens.values()].find(candidate => candidate.resource === resource.resource && !isExpired(candidate.expiresAt));
			if (!stored) {
				if (resource.required !== false) {
					throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Local session continuation requires authentication', { resources: [resource] });
				}
				continue;
			}
			const validated = await resolveMissionControlIdentity(this._fetch, principal.apiOrigin, stored.token);
			if (validated.owner !== principal.userId || this._tokens.get(this._key(stored.resource, stored.scopes)) !== stored) {
				throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Local session credential changed or does not match its owner');
			}
			const expiresAt = stored.expiresAt === undefined ? validated.expiresAt
				: validated.expiresAt === undefined ? stored.expiresAt : Math.min(stored.expiresAt, validated.expiresAt);
			const key = this._key(stored.resource, stored.scopes);
			const revocation = this._revocations.get(key) ?? 0;
			captured.set(resource.resource, {
				resource: resource.resource, token: stored.token, expiresAt, revision: 0, scopes: stored.scopes,
				isUsable: () => (this._revocations.get(key) ?? 0) === revocation && !this._store.isDisposed,
			});
		}
		return {
			principal,
			getCredential: request => {
				const credential = captured.get(request.resource);
				if (!credential || !isScopedCredentialUsable(credential)
					|| this._tokens.get(this._key(credential.resource, credential.scopes ?? []))?.token !== credential.token) {
					return undefined;
				}
				return credential;
			},
		};
	}

	private _getAuthToken(request: IAgentHostAuthTokenRequest, includeExpired: boolean): IStoredAuthToken | undefined {
		const scopes = normalizeAuthenticationScopes(request.scopes);
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

}
