/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { IGitHubAccountClient } from '../account/account.js';
import { IGitHubAnonymousClient } from '../anonymous/anonymous.js';
import { ApiRequest, ApiResponseMetadata, parseRequest } from '../client/request.js';
import { ApiErrorResponse, CodedApiErrorResponse } from '../missionControl/missionControl.js';
import { parse } from '../client/schema.js';
import { GitHubAuthorizationContext, GitHubClientOptions, GitHubGraphQLError, GitHubResponseMetadata, IGitHubCredentialProvider } from '../githubTypes.js';
import { RequestErrorKind } from '../types.js';

export const GITHUB_CHANNEL_NAME = 'github';
export const GITHUB_CREDENTIALS_CHANNEL_NAME = 'githubCredentials';
export const ISharedProcessGitHubService = createDecorator<ISharedProcessGitHubService>('sharedProcessGitHubService');
export const IGitHubCredentialBroker = createDecorator<IGitHubCredentialBroker>('gitHubCredentialBroker');

/** Renderer-owned silent credentials and endpoint selection for an explicitly selected session. */
export interface IGitHubCredentialBroker extends IGitHubCredentialProvider {
	readonly _serviceBrand: undefined;
	resolveClient(authorization: GitHubAuthorizationContext, signal: AbortSignal): Promise<GitHubClientOptions>;
}

/** Acquires directly disposable clients; the caller selects the account, never the shared process. */
export interface ISharedProcessGitHubService {
	readonly _serviceBrand: undefined;

	/** The signal governs acquisition, while the returned client owns its lease until disposal. */
	acquireAnonymousClient(signal: AbortSignal): Promise<IGitHubAnonymousClient>;
	acquireClient(authorization: GitHubAuthorizationContext, signal: AbortSignal): Promise<IGitHubAccountClient>;
}

/** Client-generated lease IDs are scoped to the connection and allow release after a lost acquisition reply. */
export interface ClientRequest {
	readonly clientId: string;
}

export interface AcquireClientRequest extends ClientRequest {
	readonly authorization: GitHubAuthorizationContext;
}

/** Endpoint profiles, not domain names: content and gist REST methods use the REST target. */
export type ApiRequestTarget = 'rest' | 'graphql' | 'rawContent' | 'missionControl';

export interface ApiRequestEnvelope extends ClientRequest {
	readonly target: ApiRequestTarget;
	readonly request: Omit<ApiRequest, 'body'>;
	readonly requestId?: string;
}

/** A separate tuple slot keeps the body on IPC's string path instead of embedding it in JSON. */
export type ApiRequestMessage = readonly [metadata: ApiRequestEnvelope, bodyText: string | undefined];

export interface SerializedRequestError {
	readonly type: 'request';
	readonly message: string;
	readonly kind: RequestErrorKind;
	readonly statusCode?: number;
	readonly statusText?: string;
	readonly graphQLErrors?: readonly GitHubGraphQLError[];
	readonly responseMetadata?: GitHubResponseMetadata;
}

export type SerializedGitHubError =
	| SerializedRequestError
	| { readonly type: 'timeout'; readonly requestDispatched: boolean }
	| { readonly type: 'rateLimit'; readonly retryAfterMs: number }
	| { readonly type: 'cancelled' };
export type SerializedMissionControlError =
	| { readonly type: 'missionControl'; readonly statusCode: number; readonly kind: RequestErrorKind; readonly response?: ApiErrorResponse | CodedApiErrorResponse; readonly requestId?: string; readonly code?: string; readonly limitedResource?: string; readonly retryAfterSeconds?: number; readonly outcome?: 'indeterminate' }
	| { readonly type: 'mutationUncertain'; readonly kind: RequestErrorKind; readonly statusCode?: number };

export type GitHubErrorResponse = readonly [metadata: { readonly type: 'error'; readonly error: SerializedGitHubError | SerializedMissionControlError }, bodyText: string | undefined];

/** Small control-plane results; HTTP request and response bodies use their own text slots. */
export type ClientResponse<T> = readonly [metadata: { readonly type: 'success'; readonly value: T }, bodyText: undefined] | GitHubErrorResponse;

export type ApiResponseEnvelope =
	| { readonly type: 'success'; readonly status: number; readonly metadata?: ApiResponseMetadata }
	| { readonly type: 'error'; readonly error: SerializedGitHubError | SerializedMissionControlError };

/** Error response bodies also remain text; no response header collection crosses this boundary. */
export type ApiResponseMessage = readonly [metadata: ApiResponseEnvelope, bodyText: string | undefined];

export const parseRequestEnvelope = parse.object<ApiRequestEnvelope>({
	clientId: parse.nonEmptyString,
	target: parse.oneOf('rest', 'graphql', 'rawContent', 'missionControl'),
	request: parseRequest,
	requestId: parse.optional(parse.nonEmptyString),
});

export const parseBodyText = parse.optional(parse.string);

export const parseAuthorization = parse.object<GitHubAuthorizationContext>({
	providerId: parse.nonEmptyString,
	sessionId: parse.nonEmptyString,
	accountId: parse.optional(parse.nonEmptyString),
	scopes: parse.arrayOf(parse.nonEmptyString),
	authorizationServer: parse.optional(parse.nonEmptyString),
});
