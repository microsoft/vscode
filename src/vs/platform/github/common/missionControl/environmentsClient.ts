/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pathSegment, withQuery } from '../client/routing.js';
import { parse, SchemaError } from '../client/schema.js';
import { AdvertisedEncryptionKey, ClientTokenResponse, ConnectEnvironmentOptions, Environment, EnvironmentConnectionOptions, EnvironmentConnectResult, IEnvironmentsClient, ListEnvironmentsOptions, WakingResponse } from './environments.js';
import { ApiResponse, MissionControlClient, parseActivationContext, parseEnvironmentKind } from './missionControlClient.js';

export class EnvironmentsClient implements IEnvironmentsClient {
	constructor(private readonly _client: MissionControlClient) { }

	list(signal: AbortSignal, options?: ListEnvironmentsOptions): Promise<readonly Environment[]> {
		return this._client.request({
			method: 'GET',
			path: withQuery('/environments', { ...options }),
			expectedStatus: [200],
			sensitive: true,
		}, signal, response => parseEnvironmentList(response.data));
	}

	get(environmentId: string, signal: AbortSignal): Promise<Environment> {
		return this._client.request({
			method: 'GET',
			path: environmentPath(environmentId),
			expectedStatus: [200],
			sensitive: true,
		}, signal, response => {
			const environment = parseEnvironment(response.data);
			if (environment.id !== environmentId) {
				throw new SchemaError('Environment response did not match the requested environment');
			}
			return environment;
		});
	}

	connect(environmentId: string, signal: AbortSignal, options?: ConnectEnvironmentOptions): Promise<EnvironmentConnectResult> {
		return this._client.request({
			method: 'GET',
			path: withQuery(`${environmentPath(environmentId)}/connect`, { ...options }),
			expectedStatus: [200, 202],
			credential: true,
		}, signal, parseConnection);
	}

	reconnect(environmentId: string, clientId: string, signal: AbortSignal, options?: EnvironmentConnectionOptions): Promise<EnvironmentConnectResult> {
		return this._client.request({
			method: 'GET',
			path: withQuery(`${environmentPath(environmentId)}/reconnect`, { ...options, client_id: clientId }),
			expectedStatus: [200, 202],
			credential: true,
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

const parseEnvironmentStatus = parse.oneOf('online', 'offline', 'waking', 'degraded', 'draining');
const parseOptionalActivationContext = parse.optional(parseActivationContext);

const parseEncryptionKey = parse.object<AdvertisedEncryptionKey>({
	key_id: parse.string,
	use: parse.string,
	algorithm: parse.string,
	public_key: parse.string,
});

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
	environment_status: parse.oneOf('waking'),
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
	return (response.status === 202) ?
		{
			status: 202,
			data: parseWakingResponse(response.data),
			retryAfterSeconds: response.retryAfterSeconds,
		} :
		{
			status: 200,
			data: parseClientTokenResponse(response.data),
		};
}
