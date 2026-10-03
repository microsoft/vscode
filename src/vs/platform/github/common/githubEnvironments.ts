/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHubCloudApi, cloudObject, cloudOptionalString, cloudPathSegment, cloudQuery, cloudStatus, cloudTimestamp } from './githubCloudApi.js';
import { objectProperty, requiredString } from './githubResponse.js';
import { GitHubRequestError } from './githubTypes.js';
import { parseRetryAfter } from './httpHeaders.js';

export type GitHubEnvironmentStatus = 'online' | 'offline' | 'degraded' | 'waking' | 'draining';

export interface GitHubEnvironment {
	readonly id: string;
	readonly status: GitHubEnvironmentStatus;
	readonly capabilities?: { readonly ahp_version?: string };
}

/** Short-lived connection material, returned only to the caller and never cached or logged. */
export interface GitHubEnvironmentToken {
	readonly access_token: string;
	readonly expires_at: string;
	readonly wps_endpoint: string;
	readonly hub: string;
	readonly subprotocol: string;
	readonly client_id: string;
	readonly groups: {
		readonly broadcast: string;
		readonly to_client: string;
		readonly to_host: string;
	};
	readonly encrypted_github_token?: string;
	readonly host_encryption_key?: {
		readonly key_id: string;
		readonly use: string;
		readonly algorithm: string;
		readonly public_key: string;
	};
}

export interface GitHubEnvironmentConnectionRequest {
	readonly environmentId: string;
	readonly sessionId?: string;
}

export type GitHubEnvironmentConnectResult =
	| { readonly kind: 'token'; readonly token: GitHubEnvironmentToken }
	| { readonly kind: 'waking'; readonly retryAfterSeconds: number | undefined };

export interface IGitHubEnvironments {
	get(id: string, signal: AbortSignal): Promise<GitHubEnvironment>;
	connect(request: GitHubEnvironmentConnectionRequest, signal: AbortSignal): Promise<GitHubEnvironmentConnectResult>;
	reconnect(request: GitHubEnvironmentConnectionRequest, clientId: string, signal: AbortSignal): Promise<GitHubEnvironmentConnectResult>;
}

export class GitHubEnvironments implements IGitHubEnvironments {
	constructor(private readonly _api: GitHubCloudApi) { }

	get(id: string, signal: AbortSignal): Promise<GitHubEnvironment> {
		const path = `/environments/${cloudPathSegment(id)}`;
		return this._api.run('github.environments', signal, request => request({ method: 'GET', path }, response => {
			cloudStatus(response, 200, 304);
			validateEnvironment(response.data);
			if (response.data.id !== id) {
				throw new GitHubRequestError('GitHub cloud environment identity did not match the request', 'malformedResponse');
			}
			return response.data;
		}));
	}

	connect(request: GitHubEnvironmentConnectionRequest, signal: AbortSignal): Promise<GitHubEnvironmentConnectResult> {
		return this._connect('connect', request, signal);
	}

	reconnect(request: GitHubEnvironmentConnectionRequest, clientId: string, signal: AbortSignal): Promise<GitHubEnvironmentConnectResult> {
		cloudPathSegment(clientId);
		return this._connect('reconnect', request, signal, clientId);
	}

	private _connect(action: 'connect' | 'reconnect', connection: GitHubEnvironmentConnectionRequest, signal: AbortSignal, clientId?: string): Promise<GitHubEnvironmentConnectResult> {
		if (connection.sessionId !== undefined) {
			cloudPathSegment(connection.sessionId);
		}
		const path = cloudQuery(`/environments/${cloudPathSegment(connection.environmentId)}/${action}`, {
			session_id: connection.sessionId,
			client_id: clientId,
		});
		return this._api.run('github.environments', signal, request => request({ method: 'GET', path, credential: true }, response => {
			cloudStatus(response, 200, 202);
			if (response.statusCode === 202) {
				const retryAfterSeconds = parseRetryAfter(response.retryAfter ?? null, response.observedAt, true);
				if (response.retryAfter !== undefined && retryAfterSeconds === undefined) {
					throw new GitHubRequestError('GitHub cloud waking response had an invalid Retry-After', 'malformedResponse');
				}
				return { kind: 'waking', retryAfterSeconds };
			}
			validateToken(response.data);
			if (clientId !== undefined && response.data.client_id !== clientId) {
				throw new GitHubRequestError('GitHub cloud credentials did not match the reconnecting client', 'malformedResponse');
			}
			return { kind: 'token', token: response.data };
		}));
	}
}

function validateEnvironment(value: unknown): asserts value is GitHubEnvironment {
	const environment = cloudObject(value);
	if (!requiredString(environment, 'id') || !['online', 'offline', 'degraded', 'waking', 'draining'].includes(requiredString(environment, 'status'))) {
		throw new GitHubRequestError('GitHub cloud environment identity or status was invalid', 'malformedResponse');
	}
	const capabilities = Reflect.get(environment, 'capabilities');
	if (capabilities !== undefined) {
		cloudOptionalString(cloudObject(capabilities), 'ahp_version');
	}
}

function validateToken(value: unknown): asserts value is GitHubEnvironmentToken {
	const token = cloudObject(value);
	for (const key of ['access_token', 'expires_at', 'wps_endpoint', 'hub', 'subprotocol', 'client_id']) {
		if (!requiredString(token, key)) {
			throw new GitHubRequestError('GitHub cloud connection credentials were incomplete', 'malformedResponse');
		}
	}
	cloudTimestamp(requiredString(token, 'expires_at'));
	const groups = objectProperty(token, 'groups');
	for (const key of ['broadcast', 'to_client', 'to_host']) {
		if (!requiredString(groups, key)) {
			throw new GitHubRequestError('GitHub cloud connection groups were incomplete', 'malformedResponse');
		}
	}
	cloudOptionalString(token, 'encrypted_github_token');
	if (Reflect.get(token, 'host_encryption_key') !== undefined) {
		const hostKey = objectProperty(token, 'host_encryption_key');
		for (const key of ['key_id', 'use', 'algorithm', 'public_key']) {
			if (!requiredString(hostKey, key)) {
				throw new GitHubRequestError('GitHub cloud host encryption key was incomplete', 'malformedResponse');
			}
		}
	}
}
