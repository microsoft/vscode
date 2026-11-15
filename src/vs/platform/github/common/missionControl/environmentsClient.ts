/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { ApiRequestOptions, ApiResponse } from '../client/request.js';
import { parseGitHubRequestId } from '../client/headers.js';
import { pathSegment, withQuery } from '../client/routing.js';
import { parse, SchemaError } from '../client/schema.js';
import { AdvertisedEncryptionKey, ClientTokenResponse, ConnectEnvironmentOptions, Environment, EnvironmentConnectionOptions, EnvironmentConnectResult, EnvironmentIdentityToken, IEnvironmentsClient, ListEnvironmentsOptions, SEALED_ENVIRONMENT_TOKEN_PREFIX, SealedEnvironmentToken, SealEnvironmentTokenRequest, WakingResponse } from './environments.js';
import { MissionControlClient, parseActivationContext, parseEnvironmentKind } from './missionControlClient.js';

export class EnvironmentsClient implements IEnvironmentsClient {
	constructor(private readonly _client: MissionControlClient) { }

	mintIdentityToken(signal: AbortSignal, options?: ApiRequestOptions): Promise<EnvironmentIdentityToken> {
		return this._client.request({
			domain: 'environments',
			method: 'POST',
			path: '/environments/tokens',
			body: {},
			expectedStatus: 200,
			policy: { credential: true },
			options,
		}, signal, response => parseEnvironmentIdentityToken(response.data));
	}

	list(signal: AbortSignal, options?: ListEnvironmentsOptions): Promise<readonly Environment[]> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.request({
			domain: 'environments',
			method: 'GET',
			path: withQuery('/environments', { ...query }),
			expectedStatus: 200,
			policy: { sensitive: true },
			options: requestOptions,
		}, signal, response => parseEnvironmentList(response.data));
	}

	get(environmentId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<Environment> {
		return this._client.request({
			domain: 'environments',
			method: 'GET',
			path: environmentPath(environmentId),
			expectedStatus: 200,
			policy: { sensitive: true },
			options,
		}, signal, response => {
			const environment = parseEnvironment(response.data);
			if (environment.id !== environmentId) {
				throw new SchemaError('Environment response did not match the requested environment');
			}
			return environment;
		});
	}

	delete(environmentId: string, signal: AbortSignal, options?: ApiRequestOptions): Promise<void> {
		return this._client.request({
			domain: 'environments',
			method: 'DELETE',
			path: environmentPath(environmentId),
			expectedStatus: 204,
			responseBody: 'none',
			options,
		}, signal, () => { });
	}

	sealToken(environmentId: string, request: SealEnvironmentTokenRequest, signal: AbortSignal, options?: ApiRequestOptions): Promise<SealedEnvironmentToken> {
		return this._client.request({
			domain: 'environments',
			method: 'POST',
			path: `${environmentPath(environmentId)}/seal-token`,
			body: request,
			expectedStatus: 200,
			policy: { credential: true },
			options,
		}, signal, response => parseSealedEnvironmentToken(response.data));
	}

	connect(environmentId: string, signal: AbortSignal, options?: ConnectEnvironmentOptions): Promise<EnvironmentConnectResult> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.request({
			domain: 'environments',
			method: 'GET',
			path: withQuery(`${environmentPath(environmentId)}/connect`, { ...query }),
			expectedStatus: [200, 202],
			policy: { credential: true },
			options: requestOptions,
		}, signal, parseConnection);
	}

	reconnect(environmentId: string, clientId: string, signal: AbortSignal, options?: EnvironmentConnectionOptions): Promise<EnvironmentConnectResult> {
		const { query, ...requestOptions } = options ?? {};
		return this._client.request({
			domain: 'environments',
			method: 'GET',
			path: withQuery(`${environmentPath(environmentId)}/reconnect`, { ...query, client_id: clientId }),
			expectedStatus: [200, 202],
			policy: { credential: true },
			options: requestOptions,
		}, signal, response => {
			const result = parseConnection(response);
			if (result.status === 200 && result.data.client_id !== clientId) {
				throw new SchemaError('Reconnect returned credentials for a different client');
			}
			return result;
		});
	}
}

function environmentPath(environmentId: string): string {
	return `/environments/${pathSegment(environmentId)}`;
}

const parseEnvironmentIdentityToken = parse.object<EnvironmentIdentityToken>({
	token: parse.nonEmptyString,
	expires_at: parse.optional(parse.dateTime),
	expires_in: parse.optional(parse.nonNegativeInteger),
});

const parseEnvironmentStatus = parse.oneOf('online', 'offline', 'waking', 'degraded', 'draining');
const parseOptionalActivationContext = parse.optional(parseActivationContext);

const parseEncryptionKey = parse.object<AdvertisedEncryptionKey>({
	key_id: parse.string,
	use: parse.string,
	algorithm: parse.string,
	public_key: parse.string,
});

const sealedTokenKeyIdPattern = /^[A-Za-z0-9_-]{11}$/;
const sealedTokenPayloadPattern = /^[A-Za-z0-9_-]+$/;

const parseSealedEnvironmentTokenFields = parse.object<SealedEnvironmentToken>({
	encrypted_github_token: parse.nonEmptyString,
	host_encryption_key: parseEncryptionKey,
});

function parseSealedEnvironmentToken(value: unknown): SealedEnvironmentToken {
	const { host_encryption_key: key, encrypted_github_token: sealed } = parseSealedEnvironmentTokenFields(value);
	if (sealed.length > 64 * 1024
		|| !sealedTokenKeyIdPattern.test(key.key_id)
		|| key.use !== 'auth-token'
		|| (key.algorithm !== 'x25519-sealedbox' && key.algorithm !== 'hpke-x25519-hkdf-sha256-aes256gcm')) {
		throw new SchemaError('Invalid sealed environment token response');
	}

	const prefix = `${SEALED_ENVIRONMENT_TOKEN_PREFIX}${key.key_id}.`;
	const payload = sealed.slice(prefix.length);
	if (!sealed.startsWith(prefix) || !sealedTokenPayloadPattern.test(payload)) {
		throw new SchemaError('Invalid sealed environment token response');
	}

	let publicKey: VSBuffer;
	let ciphertext: VSBuffer;
	try {
		publicKey = decodeBase64(key.public_key);
		ciphertext = decodeBase64(payload);
	} catch {
		throw new SchemaError('Invalid sealed environment token response');
	}

	if (publicKey.byteLength !== 32
		|| encodeBase64(publicKey) !== key.public_key
		|| ciphertext.byteLength < 48
		|| encodeBase64(ciphertext, false, true) !== payload) {
		throw new SchemaError('Invalid sealed environment token response');
	}

	return {
		encrypted_github_token: sealed,
		host_encryption_key: {
			key_id: key.key_id,
			use: key.use,
			algorithm: key.algorithm,
			public_key: key.public_key
		},
	};
}

const parseEnvironment = parse.object<Environment>({
	id: parse.nonEmptyString,
	name: parse.string,
	kind: parseEnvironmentKind,
	status: parseEnvironmentStatus,
	capabilities: parse.optional(parse.object({
		ahp_version: parse.optional(parse.string),
		features: parse.optional(parse.strings),
		max_sessions: parse.optional(parse.nullable(parse.nonNegativeInteger)),
		current_sessions: parse.optional(parse.nullable(parse.nonNegativeInteger)),
	})),
	provisioning_mode: parse.optional(parse.string),
	infra_health_ref: parse.optional(parse.string),
	user_id: parse.optional(parse.string),
	owner_id: parse.optional(parse.string),
	owner_type: parse.optional(parse.oneOf('user', 'organization')),
	org_id: parse.optional(parse.nullable(parse.string)),
	labels: parse.optional(parse.dictionary(parse.string)),
	last_heartbeat_at: parse.optional(parse.nullable(parse.dateTime)),
	webpubsub: parse.optional(parse.object({
		url: parse.string,
		hub: parse.string,
		subprotocol: parse.string,
		access_token: parse.nonEmptyString,
		groups: parse.object({
			control: parse.string,
			ingest_ack: parse.string,
			events: parse.string,
			lifecycle: parse.string,
		}),
	})),
	metadata: parse.optional(parse.object({
		codespace_name: parse.string,
		codespace_repo: parse.optional(parse.string),
		machine_type: parse.optional(parse.string),
	})),
	lifecycle_controls: parse.optional(parse.object({
		wake: parse.optional(parse.boolean),
	})),
	encryption_keys: parse.optional(parse.arrayOf(parseEncryptionKey)),
});

const parseEnvironmentList = parse.arrayOf(parseEnvironment);

const parseWakingResponse = parse.object<WakingResponse>({
	environment_status: parse.exact('waking'),
	activation_context: parseOptionalActivationContext,
});

const parseClientTokenResponse = parse.object<ClientTokenResponse>({
	access_token: parse.nonEmptyString,
	expires_at: parse.dateTime,
	wps_endpoint: parse.string,
	hub: parse.string,
	subprotocol: parse.string,
	client_id: parse.nonEmptyString,
	environment_status: parseEnvironmentStatus,
	activation_context: parseOptionalActivationContext,
	groups: parse.object({
		broadcast: parse.string,
		to_client: parse.string,
		to_host: parse.string,
		clients: parse.string,
	}),
	encrypted_github_token: parse.optional(parse.string),
	encrypted_github_token_scope: parse.optional(parse.oneOf('repository', 'user')),
	host_encryption_key: parse.optional(parseEncryptionKey),
});

function parseConnection(response: ApiResponse): EnvironmentConnectResult {
	const requestId = parseGitHubRequestId(response.metadata?.requestId);
	const correlation = requestId !== undefined ? { requestId } : {};
	return response.status === 202 ?
		{
			status: 202,
			data: parseWakingResponse(response.data),
			retryAfterSeconds: response.metadata?.retryAfterSeconds,
			...correlation,
		} :
		{
			status: 200,
			data: parseClientTokenResponse(response.data),
			...correlation,
		};
}
