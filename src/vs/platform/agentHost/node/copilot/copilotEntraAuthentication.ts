/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { EntraAuthOptions, EntraTokenProviderArgs, EntraTokenProviderResult } from '@github/copilot-sdk';
import { equals } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isExpired } from '../../../../base/common/date.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, observableValue, transaction, type IReader } from '../../../../base/common/observable.js';
import type { AuthenticateParams } from '../../common/agent.js';
import { copilotEntraAuthorizationServer, copilotEntraClientId, copilotEntraDiscoveryResource, copilotEntraResources } from '../../common/copilotEntraAuthentication.js';
import { readAuthenticationAccount, type IAgentAuthenticationAccount } from '../../common/meta/agentAuthenticationAccount.js';
import { AuthRequiredReason, type AuthRequiredParams } from '../../common/state/sessionActions.js';
import { AhpErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import type { ProtectedResourceMetadata } from '../../common/state/protocol/state.js';
import { IAgentHostAuthenticationService, type IAgentHostAuthCredential } from '../agentHostAuthenticationService.js';

interface IEntraAuthority {
	readonly accountId: string;
	readonly username?: string;
	readonly connection: CancellationToken;
}

interface IEntraTokenChallenge {
	readonly rejectedToken: string | undefined;
	pending: boolean;
}

const discoveryResource: ProtectedResourceMetadata = {
	resource: copilotEntraDiscoveryResource,
	authorization_servers: [copilotEntraAuthorizationServer],
	scopes_supported: ['User.Read'],
	required: false,
};

/** Reads credentials supplied through AHP without waiting for a client to acquire them. */
export class CopilotEntraAuthentication extends Disposable {
	private readonly _onDidRevoke = this._register(new Emitter<void>());
	readonly onDidRevoke = this._onDidRevoke.event;
	private readonly _authority = observableValue<IEntraAuthority | undefined>(this, undefined);
	private readonly _requirements = observableValue<readonly Omit<AuthRequiredParams, 'channel'>[]>(this, []);
	private readonly _tokenChallenges = new Map<string, IEntraTokenChallenge>();
	readonly authenticationRequired = derived<Omit<AuthRequiredParams, 'channel'> | undefined>(this, reader => {
		return this._requirements.read(reader).at(-1);
	});

	readonly options: EntraAuthOptions = {
		clientId: copilotEntraClientId,
		tokenProvider: (request, cancellation) => this.acquire(request, cancellation),
	};

	constructor(
		@IAgentHostAuthenticationService private readonly _authenticationService: IAgentHostAuthenticationService,
	) {
		super();
		this._register(toDisposable(() => {
			this.clearAuthority();
		}));
		if (this._authenticationService.onDidAuthenticate) {
			this._register(this._authenticationService.onDidAuthenticate(request => {
				if (request.resource === copilotEntraDiscoveryResource && request.connectionToken && !this._authority.get()
					&& this._requirements.get().some(requirement => requirement.resource.resource === copilotEntraDiscoveryResource)) {
					const account = this._authenticationService.getAuthCredential({ resource: copilotEntraDiscoveryResource, scopes: discoveryResource.scopes_supported })?.account;
					if (account?.providerId === 'microsoft') {
						this._authority.set({ accountId: account.accountId, connection: request.connectionToken, ...(account.label !== undefined ? { username: account.label } : {}) }, undefined);
					}
				}
				if (this.getCredential(request.resource, request.scopes ?? [])) {
					this._requirements.set(this._requirements.get().filter(requirement => requirement.resource.resource !== request.resource), undefined);
				}
			}));
		}
	}

	getProtectedResources(reader?: IReader): ProtectedResourceMetadata[] {
		const authority = this._authority.read(reader);
		const requirements = this._requirements.read(reader);
		return [
			...(authority ? [discoveryResource] : []),
			...requirements.map(requirement => requirement.resource).filter(resource => !authority || resource.resource !== copilotEntraDiscoveryResource),
		];
	}

	async authenticate(params: AuthenticateParams, connection?: CancellationToken): Promise<boolean> {
		if (params.target || !isEntraCredentialResource(params.resource)) {
			return false;
		}
		this.validateAuthentication(params, connection);
		if (!params.token) {
			this.revoke();
			return true;
		}
		return true;
	}

	validateAuthentication(params: AuthenticateParams, connection?: CancellationToken): void {
		if (params.target || !isEntraCredentialResource(params.resource)) {
			return;
		}
		if (!connection || connection.isCancellationRequested || this._store.isDisposed) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft credential authority is unavailable.');
		}
		if (params.token) {
			this.validateCredential(params);
			return;
		}
		const authority = this._authority.get();
		if (authority && authority.connection !== connection) {
			throw new ProtocolError(AhpErrorCodes.PermissionDenied, 'Only the connection that owns Microsoft authentication can withdraw it.');
		}
	}

	private validateCredential(params: AuthenticateParams): void {
		const authority = this._authority.get();
		const isDiscovery = params.resource === copilotEntraDiscoveryResource;
		const resource = this.getProtectedResources().find(resource => resource.resource === params.resource);
		const account = validateEntraCredential(params, resource);
		validateEntraAccount(account.accountId, authority?.accountId);
		if (this._tokenChallenges.get(params.resource)?.rejectedToken === params.token) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft authentication requires a replacement credential.');
		}
		if (!isDiscovery && !authority) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft credential authority is unavailable.');
		}
	}

	private revoke(): void {
		const hadAuthority = this._authority.get() !== undefined;
		this.clearAuthority();
		if (hadAuthority) {
			this._onDidRevoke.fire();
		}
	}

	private clearAuthority(): void {
		this._tokenChallenges.clear();
		for (const resource of [copilotEntraDiscoveryResource, ...copilotEntraResources.values()]) {
			this._authenticationService.invalidateAuthTokens(resource);
		}
		transaction(tx => {
			this._requirements.set([], tx);
			this._authority.set(undefined, tx);
		});
	}

	private acquire(request: EntraTokenProviderArgs, cancellation: CancellationToken): EntraTokenProviderResult {
		if (this._store.isDisposed || cancellation.isCancellationRequested) {
			return { kind: 'cancelled' };
		}
		if (request.clientId !== copilotEntraClientId) {
			return { kind: 'unavailable' };
		}
		const resource = copilotEntraResourceForRequest(request);
		if (!resource) {
			return { kind: 'unavailable' };
		}
		const authority = this._authority.get();
		if (request.accountId !== undefined && request.accountId !== authority?.accountId) {
			return { kind: 'unavailable' };
		}
		if (request.kind === 'identity') {
			const result = resolveEntraIdentity(request, authority);
			if (result) {
				return result;
			}
		} else {
			const result = this.acquireToken(request, resource);
			if (result) {
				return result;
			}
		}
		this.requireCredential(resource, this.getRequiredReason(request, resource));
		return { kind: 'unavailable' };
	}

	private getRequiredReason(request: EntraTokenProviderArgs, resource: ProtectedResourceMetadata): AuthRequiredReason {
		if (request.kind === 'identity') {
			return AuthRequiredReason.Required;
		}
		const previous = this._authenticationService.getAuthCredential({ resource: resource.resource, scopes: request.scopes }, true);
		return request.skipCachedAccessToken || this._tokenChallenges.get(resource.resource)?.pending || previous && isExpired(previous.expiresAt) ? AuthRequiredReason.Expired : AuthRequiredReason.Required;
	}

	private acquireToken(request: Extract<EntraTokenProviderArgs, { kind: 'token' }>, resource: ProtectedResourceMetadata): EntraTokenProviderResult | undefined {
		const previous = this._authenticationService.getAuthCredential({ resource: resource.resource, scopes: request.scopes }, true);
		let challenge = this._tokenChallenges.get(resource.resource);
		if (request.skipCachedAccessToken && !challenge?.pending || previous && isExpired(previous.expiresAt)) {
			challenge = { rejectedToken: previous?.token, pending: true };
			this._tokenChallenges.set(resource.resource, challenge);
			this._authenticationService.invalidateAuthTokens(resource.resource);
			return undefined;
		}
		const credential = this.getCredential(resource.resource, request.scopes);
		if (credential && challenge) {
			challenge.pending = false;
		}
		return credential ? { kind: 'token', accountId: request.accountId, accessToken: credential.token } : undefined;
	}

	private getCredential(resource: string, scopes: readonly string[]): IAgentHostAuthCredential | undefined {
		const authority = this._authority.get();
		const credential = this._authenticationService.getAuthCredential({ resource, scopes });
		return authority && credential?.account?.providerId === 'microsoft'
			&& credential.account.accountId === authority.accountId
			&& credential.token !== this._tokenChallenges.get(resource)?.rejectedToken ? credential : undefined;
	}

	private requireCredential(resource: ProtectedResourceMetadata, reason: AuthRequiredReason): void {
		const requirements = this._requirements.get();
		if (requirements.some(requirement => requirement.resource.resource === resource.resource && requirement.reason === AuthRequiredReason.Expired)) {
			reason = AuthRequiredReason.Expired;
		}
		if (requirements.some(requirement => requirement.resource.resource === resource.resource && requirement.reason === reason
			&& equals(requirement.resource.scopes_supported, resource.scopes_supported))) {
			return;
		}
		this._requirements.set([...requirements.filter(requirement => requirement.resource.resource !== resource.resource), { resource, reason }], undefined);
	}
}

function isEntraCredentialResource(resource: string): boolean {
	return resource === copilotEntraDiscoveryResource || [...copilotEntraResources.values()].includes(resource);
}

function validateEntraCredential(params: AuthenticateParams, resource: ProtectedResourceMetadata | undefined): IAgentAuthenticationAccount {
	if (!resource || resource.resource !== params.resource) {
		throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft credential does not satisfy the advertised requirement.');
	}
	const account = readAuthenticationAccount(params);
	if (account?.providerId !== 'microsoft') {
		throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft credential requires account provenance.');
	}
	if (!resource.scopes_supported?.every(scope => params.scopes?.includes(scope))) {
		throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft credential does not satisfy the advertised requirement.');
	}
	validateEntraCredentialExpiry(params.expiresIn);
	return account;
}

function validateEntraCredentialExpiry(expiresIn: number | undefined): void {
	if (expiresIn !== undefined && (!Number.isInteger(expiresIn) || expiresIn <= 0)) {
		throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft credential has an invalid expiry.');
	}
}

function validateEntraAccount(accountId: string, expectedAccount: string | undefined): void {
	if (expectedAccount !== undefined && accountId !== expectedAccount) {
		throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft authentication requires the original account.');
	}
}

function resolveEntraIdentity(request: Extract<EntraTokenProviderArgs, { kind: 'identity' }>, authority: IEntraAuthority | undefined): EntraTokenProviderResult | undefined {
	if (!authority) {
		return request.reason === 'renewal' ? { kind: 'unavailable' } : undefined;
	}
	if (request.reason === 'forceInteractive') {
		return undefined;
	}
	return { kind: 'identity', accountId: authority.accountId, ...(authority.username !== undefined ? { username: authority.username } : {}) };
}

function copilotEntraResourceForRequest(request: EntraTokenProviderArgs): ProtectedResourceMetadata | undefined {
	if (request.kind === 'identity') {
		return discoveryResource;
	}
	if (request.tenant !== undefined && request.tenant !== 'organizations') {
		return undefined;
	}
	const audience = request.audience ?? request.scopes[0]?.split('/')[0];
	const resource = audience && copilotEntraResources.get(audience);
	if (!resource || request.scopes.length === 0 || !request.scopes.every(scope => scope === `${audience}/.default` || scope === `${audience}/user_impersonation`)) {
		return undefined;
	}
	return {
		resource,
		authorization_servers: [copilotEntraAuthorizationServer],
		scopes_supported: [...request.scopes],
		required: false,
	};
}
