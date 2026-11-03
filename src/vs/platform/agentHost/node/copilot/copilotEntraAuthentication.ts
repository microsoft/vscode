/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { EntraAuthOptions, EntraTokenProviderArgs, EntraTokenProviderResult } from '@github/copilot-sdk';
import { DeferredPromise, raceCancellation, raceTimeout, Sequencer } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, observableValue, transaction, type IReader } from '../../../../base/common/observable.js';
import type { AuthenticateParams } from '../../common/agent.js';
import { copilotEntraAuthorizationServer, copilotEntraClientId, copilotEntraDiscoveryResource, copilotEntraResources } from '../../common/copilotEntraAuthentication.js';
import { readAuthenticationAccount } from '../../common/meta/agentAuthenticationAccount.js';
import { AuthRequiredReason, type AuthRequiredParams } from '../../common/state/sessionActions.js';
import { AhpErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import type { ProtectedResourceMetadata } from '../../common/state/protocol/state.js';
import { IAgentHostClientConnectionService } from '../agentHostClientConnectionService.js';

interface IEntraAuthority {
	readonly accountId: string;
	readonly connection: CancellationToken;
}

interface IEntraAcquisition {
	readonly request: EntraTokenProviderArgs;
	readonly resource: ProtectedResourceMetadata;
	readonly completed: DeferredPromise<EntraTokenProviderResult>;
}

const discoveryResource: ProtectedResourceMetadata = {
	resource: copilotEntraDiscoveryResource,
	authorization_servers: [copilotEntraAuthorizationServer],
	scopes_supported: ['User.Read'],
};

/** Adapts the runtime's acquisition callback to AHP credential pushes without caching tokens. */
export class CopilotEntraAuthentication extends Disposable {
	private readonly _requests = new Sequencer();
	private readonly _connectionListener = this._register(new MutableDisposable());
	private readonly _onDidRevoke = this._register(new Emitter<void>());
	readonly onDidRevoke = this._onDidRevoke.event;
	private readonly _authority = observableValue<IEntraAuthority | undefined>(this, undefined);
	private readonly _pending = observableValue<IEntraAcquisition | undefined>(this, undefined);
	readonly authenticationRequired = derived<Omit<AuthRequiredParams, 'channel'> | undefined>(this, reader => {
		const pending = this._pending.read(reader);
		if (!pending) {
			return undefined;
		}
		return {
			resource: pending.resource,
			reason: pending.request.kind === 'token' && pending.request.skipCachedAccessToken ? AuthRequiredReason.Expired : AuthRequiredReason.Required,
		};
	});

	readonly options: EntraAuthOptions = {
		clientId: copilotEntraClientId,
		tokenProvider: (request, cancellation) => this._requests.queue(() => this.acquire(request, cancellation)),
	};

	constructor(
		@IAgentHostClientConnectionService private readonly _connections: IAgentHostClientConnectionService,
	) {
		super();
		this._register(this._connections.onDidChangeConnections(() => {
			if (this._connections.getConnectionCounts('').connectedClientCount === 0) {
				this.revoke();
			}
		}));
		this._register(toDisposable(() => {
			this.clearAuthority();
		}));
	}

	getProtectedResources(reader?: IReader): ProtectedResourceMetadata[] {
		const authority = this._authority.read(reader);
		const pending = this._pending.read(reader);
		return [
			...(authority ? [discoveryResource] : []),
			...(pending && (!authority || pending.resource.resource !== copilotEntraDiscoveryResource) ? [pending.resource] : []),
		];
	}

	async authenticate(params: AuthenticateParams, connection?: CancellationToken): Promise<boolean> {
		if (params.target || !isEntraCredentialResource(params.resource)) {
			return false;
		}
		if (!params.token) {
			this.revoke();
			return true;
		}
		if (!connection || connection.isCancellationRequested || this._store.isDisposed) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft credential authority is unavailable.');
		}
		return this.acceptCredential(params, connection);
	}

	private acceptCredential(params: AuthenticateParams, connection: CancellationToken): boolean {
		const pending = this._pending.get();
		const authority = this._authority.get();
		const isDiscovery = params.resource === copilotEntraDiscoveryResource;
		const resource = isDiscovery ? discoveryResource : pending?.resource;
		const accountId = validateEntraCredential(params, resource);
		validateEntraAccount(accountId, pending?.request.accountId ?? authority?.accountId);
		if (isDiscovery && authority && pending?.request.kind !== 'identity') {
			return true;
		}
		if (!pending || pending.completed.isSettled) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft credential does not satisfy the pending acquisition.');
		}
		this.completeAcquisition(pending, accountId, params.token, connection);
		return true;
	}

	private completeAcquisition(pending: IEntraAcquisition, accountId: string, accessToken: string, connection: CancellationToken): void {
		if (pending.request.kind === 'identity') {
			const authority: IEntraAuthority = { accountId, connection };
			this._authority.set(authority, undefined);
			this._connectionListener.value = connection.onCancellationRequested(() => {
				if (this._authority.get() === authority) {
					this.revoke();
				}
			});
			pending.completed.complete({ kind: 'identity', accountId });
		} else {
			const authority = this._authority.get();
			if (!authority || authority.connection.isCancellationRequested) {
				throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft credential authority is unavailable.');
			}
			pending.completed.complete({ kind: 'token', accountId, accessToken });
		}
	}

	private revoke(): void {
		const hadAuthority = this._authority.get() !== undefined || this._pending.get() !== undefined;
		this.clearAuthority();
		if (hadAuthority) {
			this._onDidRevoke.fire();
		}
	}

	private clearAuthority(): void {
		this._connectionListener.clear();
		this._pending.get()?.completed.complete({ kind: 'unavailable' });
		transaction(tx => {
			this._pending.set(undefined, tx);
			this._authority.set(undefined, tx);
		});
	}

	private async acquire(request: EntraTokenProviderArgs, cancellation: CancellationToken): Promise<EntraTokenProviderResult> {
		if (this._store.isDisposed || cancellation.isCancellationRequested) {
			return { kind: 'cancelled' };
		}
		if (request.clientId !== copilotEntraClientId || this._connections.getConnectionCounts('').connectedClientCount === 0) {
			return { kind: 'unavailable' };
		}
		const result = resolveEntraIdentity(request, this._authority.get());
		if (result) {
			return result;
		}
		const resource = copilotEntraResourceForRequest(request);
		if (!resource) {
			return { kind: 'unavailable' };
		}
		return this.requestCredential(request, resource, cancellation);
	}

	private async requestCredential(request: EntraTokenProviderArgs, resource: ProtectedResourceMetadata, cancellation: CancellationToken): Promise<EntraTokenProviderResult> {
		const pending: IEntraAcquisition = { request, resource, completed: new DeferredPromise<EntraTokenProviderResult>() };
		this._pending.set(pending, undefined);
		try {
			const result = await raceTimeout(raceCancellation<EntraTokenProviderResult>(pending.completed.p, cancellation, { kind: 'cancelled' }), 30_000);
			if (!result) {
				throw new Error('Microsoft credential acquisition timed out. Retry authentication in the client.');
			}
			return this._pending.get() === pending ? result : { kind: 'unavailable' };
		} finally {
			if (!pending.completed.isSettled) {
				pending.completed.complete({ kind: 'unavailable' });
			}
			if (this._pending.get() === pending) {
				this._pending.set(undefined, undefined);
			}
		}
	}
}

function isEntraCredentialResource(resource: string): boolean {
	return resource === copilotEntraDiscoveryResource || [...copilotEntraResources.values()].includes(resource);
}

function validateEntraCredential(params: AuthenticateParams, resource: ProtectedResourceMetadata | undefined): string {
	if (!resource || resource.resource !== params.resource) {
		throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft credential does not satisfy the pending acquisition.');
	}
	const account = readAuthenticationAccount(params);
	if (account?.providerId !== 'microsoft') {
		throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft credential requires account provenance.');
	}
	if (!resource.scopes_supported?.every(scope => params.scopes?.includes(scope))) {
		throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Microsoft credential does not satisfy the pending acquisition.');
	}
	validateEntraCredentialExpiry(params.expiresIn);
	return account.accountId;
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

function resolveEntraIdentity(request: EntraTokenProviderArgs, authority: IEntraAuthority | undefined): EntraTokenProviderResult | undefined {
	if (!authority || authority.connection.isCancellationRequested) {
		return request.kind === 'token' || request.reason === 'renewal' ? { kind: 'unavailable' } : undefined;
	}
	if (request.accountId !== undefined && request.accountId !== authority.accountId) {
		return { kind: 'unavailable' };
	}
	if (request.kind === 'identity' && request.reason !== 'forceInteractive') {
		return { kind: 'identity', accountId: authority.accountId };
	}
	return undefined;
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
	};
}
