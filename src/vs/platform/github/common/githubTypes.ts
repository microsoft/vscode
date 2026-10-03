/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import type { TelemetryLevel } from '../../telemetry/common/telemetry.js';
import { RequestError, RequestErrorKind, RequestFetch } from './types.js';

/** Allowlisted hosting environments for GitHub telemetry. */
export type GitHubTelemetrySource = 'workbench' | 'web' | 'agentHost' | 'sharedProcess' | 'other';

/** GitHub GraphQL error details retained for domain-specific interpretation. */
export interface GitHubGraphQLError {
	readonly message?: string;
	readonly type?: string;
	readonly path?: readonly (string | number)[];
	readonly extensions?: {
		readonly code?: string;
	};
}

/** GitHub transport error preserving the service's established error and GraphQL payload contract. */
export class GitHubRequestError extends RequestError {

	constructor(
		message: string,
		kind: RequestErrorKind,
		statusCode?: number,
		responseBody?: string,
		readonly graphQLErrors?: readonly GitHubGraphQLError[],
		statusText?: string,
	) {
		super(message, kind, statusCode, responseBody, statusText);
		this.name = 'GitHubRequestError';
	}
}

/** GitHub deadline failure preserving whether the operation reached the network. */
export class GitHubRequestTimeoutError extends GitHubRequestError {
	constructor(readonly requestDispatched = false) {
		super('GitHub request timed out', 'timeout');
	}
}

/** GitHub bootstrap cooldown that exceeds the remaining caller deadline. */
export class GitHubRequestRateLimitError extends GitHubRequestError {
	constructor(readonly retryAfterMs: number) {
		super('The server cooldown exceeds the remaining request budget', 'rateLimit', 429);
	}
}

/** GitHub feature support observed for a credential's selected host. */
export interface GitHubHostCapabilities {
	readonly graphql: boolean;
	readonly mergeQueue: boolean;
	readonly internalMergeStatus: boolean;
	readonly reviewThreads: boolean;
	readonly checkContextRequiredness: boolean;
}

/** GitHub REST/GraphQL endpoint selection owned by a hosting binding. */
export interface IGitHubEndpointProvider {
	readonly onDidChange: Event<void>;
	getApiBaseUri(): string;
	getGraphQlUri(): string;
}

/** Silent token access for one explicitly selected GitHub grant. */
export interface IGitHubTokenProvider {
	readonly onDidChangeToken?: Event<void>;
	getToken(signal: AbortSignal): string | undefined | Promise<string | undefined>;
	invalidateToken?(token: string): void;
}

/** Trusted identification supplied by the service binding, not request-provided headers. */
export interface GitHubClientMetadata {
	readonly application: string;
	readonly source: string;
	/** Describes the fetch implementation, including browser fetch in a desktop renderer. */
	readonly egress: 'browser' | 'node';
}

/** Hosting dependencies and telemetry configuration for a GitHub request engine. */
export interface GitHubServiceOptions {
	readonly credentialProvider?: IGitHubCredentialProvider;
	readonly fetch?: RequestFetch;
	readonly telemetrySource?: GitHubTelemetrySource;
	readonly clientMetadata?: GitHubClientMetadata;
	readonly onDidChangeTelemetryLevel?: Event<TelemetryLevel>;
}

/** Identifies an authorization grant chosen by the hosting binding, never a raw token. */
export interface GitHubAuthorizationContext {
	readonly providerId: string;
	readonly sessionId: string;
	/** Opaque account provenance supplied by the binding; identity is still verified through GitHub. */
	readonly accountId?: string;
	readonly scopes: readonly string[];
	readonly authorizationServer?: string;
}

/** Authorization and endpoints selected by the caller for one GitHub client. */
export interface GitHubClientOptions {
	readonly authorization: GitHubAuthorizationContext;
	readonly apiBaseUri: string;
	readonly graphQlUri: string;
	readonly cloud?: GitHubCloudEndpoint;
}

/** Host-approved agents API and headers for this grant; no endpoint discovery or fallback is implied. */
export interface GitHubCloudEndpoint {
	/** Complete agents API base, for example `https://api.githubcopilot.com/agents`. */
	readonly apiBaseUri: string;
	readonly integrationId: string;
	/** Omitted unless the selected cloud endpoint requires an API version. */
	readonly apiVersion?: string;
}

/** Trusted API base for public reads; callers cannot override authentication or network execution. */
export interface GitHubAnonymousClientOptions {
	readonly apiBaseUri: string;
}

/** Internal, read-only bootstrap capability; account provenance affects quota accounting, not authorization. */
export interface GitHubBootstrapClientOptions {
	readonly apiBaseUri: string;
	readonly token: string;
	readonly accountId?: string;
}

/** Provider notification identifying grants whose cached credentials are obsolete. */
export interface GitHubCredentialChange {
	readonly providerId: string;
	readonly sessionIds?: readonly string[];
}

/** Implemented by the host's authentication binding; token access must be silent and context-specific. */
export interface IGitHubCredentialProvider {
	readonly onDidChange: Event<GitHubCredentialChange>;
	getToken(context: GitHubAuthorizationContext, signal: AbortSignal): string | undefined | Promise<string | undefined>;
	invalidateToken?(context: GitHubAuthorizationContext, token: string): void;
}
