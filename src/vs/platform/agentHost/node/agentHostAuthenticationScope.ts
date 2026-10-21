/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getExpirationTime, isExpired } from '../../../base/common/date.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import type { AuthenticateParams, IAgentHostAuthTokenRequest } from '../common/agent.js';
import { normalizeAuthenticationScopes, type IAgentHostAuthenticationScope, type IAgentHostCredentialPrincipal, type IAgentHostCredentialSource, type IAgentHostScopedCredential } from '../common/agentHostCredentials.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../common/state/sessionProtocol.js';

interface IScopedCredential extends IAgentHostScopedCredential {
	readonly scopes: readonly string[];
}

/** Host-owned connection capture with optional listener-authorized credential delegation. */
export class AgentHostAuthenticationScope extends Disposable implements IAgentHostAuthenticationScope {
	private readonly _credentials = new Map<string, IScopedCredential>();
	private readonly _delegatedSources = new Map<string, IAgentHostCredentialSource>();
	private readonly _attempts = new Map<string, number>();
	private _revision = 0;

	constructor(
		private readonly _validate: (params: AuthenticateParams) => Promise<AuthenticateParams>,
		private readonly _checkAuthorization: () => void,
		readonly principal?: IAgentHostCredentialPrincipal,
		private readonly _resolveCredentials?: (resource: string) => Promise<IAgentHostCredentialSource | undefined>,
	) {
		super();
	}

	async authenticate(params: AuthenticateParams, resources: readonly string[]): Promise<void> {
		this._checkLive();
		if (!resources.includes(params.resource) || !params.token) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Authentication requires a token for an advertised protected resource');
		}
		const scopes = normalizeAuthenticationScopes(params.scopes);
		const key = params.resource;
		const attempt = (this._attempts.get(key) ?? 0) + 1;
		this._attempts.set(key, attempt);
		const validated = await this._validate(params);
		this._checkLive();
		this._checkAuthorization();
		if (validated.resource !== params.resource || !validated.token) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Authentication changed the protected resource or supplied no credential');
		}
		const expiresAt = getExpirationTime(validated.expiresIn);
		if (expiresAt !== undefined && !Number.isFinite(expiresAt)) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Credential expiration must be finite');
		}
		if (isExpired(expiresAt)) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Credential has expired');
		}
		const source = await this._resolveCredentials?.(params.resource);
		this._checkLive();
		this._checkAuthorization();
		if (this._attempts.get(key) !== attempt) {
			throw new ProtocolError(AhpErrorCodes.Conflict, 'Authentication was superseded on this connection');
		}
		if (source) {
			if (!source.getCredential({ resource: params.resource })) {
				throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Local Copilot authentication is required');
			}
			this._credentials.delete(key);
			this._delegatedSources.set(key, source);
			return;
		}
		this._delegatedSources.delete(key);
		this._credentials.set(key, {
			resource: params.resource,
			scopes,
			token: validated.token,
			expiresAt,
			revision: ++this._revision,
		});
	}

	async validate(params: AuthenticateParams): Promise<AuthenticateParams> {
		this._checkLive();
		this._checkAuthorization();
		const validated = await this._validate(params);
		this._checkLive();
		this._checkAuthorization();
		if (validated.resource !== params.resource || !validated.token) {
			throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, 'Authentication changed the protected resource or supplied no credential');
		}
		return validated;
	}

	getCredential(request: IAgentHostAuthTokenRequest): IAgentHostScopedCredential | undefined {
		this._checkLive();
		this._checkAuthorization();
		return this._getLive(request.resource);
	}

	override dispose(): void {
		this._credentials.clear();
		this._delegatedSources.clear();
		this._attempts.clear();
		super.dispose();
	}

	private _getLive(key: string): IAgentHostScopedCredential | undefined {
		const source = this._delegatedSources.get(key);
		if (source) {
			return source.getCredential({ resource: key });
		}
		const credential = this._credentials.get(key);
		if (credential && isExpired(credential.expiresAt)) {
			this._credentials.delete(key);
			return undefined;
		}
		return credential;
	}

	private _checkLive(): void {
		if (this._store.isDisposed) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'Authentication connection has ended');
		}
	}
}
