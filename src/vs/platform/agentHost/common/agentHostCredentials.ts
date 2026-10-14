/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../base/common/lifecycle.js';
import { isExpired } from '../../../base/common/date.js';
import { isObject } from '../../../base/common/types.js';
import type { AuthenticateParams, IAgentHostAuthTokenRequest } from './agent.js';
import type { ProtectedResourceMetadata } from './state/protocol/state.js';
import { AhpErrorCodes, ProtocolError } from './state/sessionProtocol.js';

export interface IAgentHostCredentialPrincipal {
	readonly apiOrigin: string;
	readonly userId: string;
}

/** A validated credential captured for one connection and protected resource. */
export interface IAgentHostScopedCredential {
	readonly resource: string;
	readonly token: string;
	readonly expiresAt: number | undefined;
	readonly revision: number;
	readonly scopes?: readonly string[];
	readonly isUsable?: () => boolean;
}

/** A host-owned credential source, never serialized through AHP. */
export interface IAgentHostCredentialSource {
	readonly principal?: IAgentHostCredentialPrincipal;
	getCredential(request: IAgentHostAuthTokenRequest): IAgentHostScopedCredential | undefined;
}

export interface IAgentHostAuthenticationScope extends IAgentHostCredentialSource, IDisposable {
	authenticate(params: AuthenticateParams, resources: readonly string[]): Promise<void>;
	validate(params: AuthenticateParams): Promise<AuthenticateParams>;
}

export function normalizeAuthenticationScopes(scopes: readonly string[] | undefined): readonly string[] {
	return scopes ? [...new Set(scopes)].sort() : [];
}

export function parseCredentialPrincipal(serialized: string): IAgentHostCredentialPrincipal {
	const value: unknown = JSON.parse(serialized);
	if (!isRecord(value) || typeof value.apiOrigin !== 'string' || typeof value.userId !== 'string'
		|| !/^[1-9][0-9]*$/.test(value.userId) || new URL(value.apiOrigin).protocol !== 'https:') {
		throw new Error('Invalid persisted credential principal');
	}

	return { apiOrigin: value.apiOrigin, userId: value.userId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

export function isScopedCredentialUsable(credential: IAgentHostScopedCredential): boolean {
	return (credential.expiresAt === undefined || Number.isFinite(credential.expiresAt))
		&& !isExpired(credential.expiresAt) && (credential.isUsable?.() ?? true);
}

export function isAuthRequiredError(error: unknown): error is ProtocolError {
	return error instanceof ProtocolError && error.code === AhpErrorCodes.AuthRequired;
}

/** Captures an execution's credentials before awaiting work; later authentication cannot change them. */
export function captureCredentialSource(source: IAgentHostCredentialSource, resources: readonly ProtectedResourceMetadata[]): IAgentHostCredentialSource {
	const captured = new Map<string, IAgentHostScopedCredential>();
	for (const resource of resources) {
		const credential = source.getCredential({ resource: resource.resource, scopes: resource.scopes_supported });
		if (credential) {
			captured.set(resource.resource, credential);
		} else if (resource.required !== false) {
			throw new ProtocolError(AhpErrorCodes.AuthRequired, 'The execution sponsor must authenticate', { resources: [resource] });
		}
	}
	return {
		principal: source.principal,
		getCredential: request => {
			const credential = captured.get(request.resource);
			if (!credential || !isScopedCredentialUsable(credential)
				|| (credential.scopes?.length && request.scopes?.some(scope => !credential.scopes?.includes(scope)))) {
				return undefined;
			}
			return credential;
		},
	};
}
