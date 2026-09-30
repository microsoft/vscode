/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import type { TelemetryLevel } from '../../telemetry/common/telemetry.js';

export type GitHubFetch = typeof globalThis.fetch;
export type GitHubRequestKind = 'rest' | 'graphql' | 'download';
export type GitHubTelemetrySource = 'workbench' | 'web' | 'agentHost' | 'sharedProcess' | 'other';

export interface GitHubAccountHandle {
	readonly host: string;
	readonly accountId: string;
}

export type GitHubRequestPriority =
	| 'mutationReconciliation'
	| 'mutation'
	| 'interactive'
	| 'mergeGate'
	| 'visible'
	| 'background'
	| 'enrichment';

export type GitHubRequestErrorKind =
	| 'authentication'
	| 'authorization'
	| 'notFound'
	| 'validation'
	| 'schema'
	| 'rateLimit'
	| 'network'
	| 'server'
	| 'overloaded'
	| 'timeout'
	| 'responseTooLarge'
	| 'malformedResponse'
	| 'unknown';

export interface GitHubRequestOptions {
	readonly caller?: string;
	readonly deadline?: number;
}

export interface GitHubRequestContext {
	readonly kind: GitHubRequestKind;
	readonly account: GitHubAccountHandle;
	readonly caller: string;
	readonly resource: string;
	readonly priority: GitHubRequestPriority;
	readonly deadline: number;
	readonly signal: AbortSignal;
	readonly owner?: object;
}

export interface GitHubGraphQLError {
	readonly message?: string;
	readonly type?: string;
	readonly path?: readonly (string | number)[];
	readonly extensions?: {
		readonly code?: string;
	};
}

export class GitHubRequestError extends Error {

	constructor(
		message: string,
		readonly kind: GitHubRequestErrorKind,
		readonly statusCode?: number,
		readonly responseBody?: string,
		readonly graphQLErrors?: readonly GitHubGraphQLError[],
	) {
		super(message);
		this.name = 'GitHubRequestError';
	}
}

export class GitHubRequestTimeoutError extends GitHubRequestError {
	constructor(readonly requestDispatched = false) {
		super('GitHub request timed out', 'timeout');
	}
}

export interface GitHubHostCapabilities {
	readonly graphql: boolean;
	readonly mergeQueue: boolean;
	readonly internalMergeStatus: boolean;
	readonly reviewThreads: boolean;
	readonly checkContextRequiredness: boolean;
}

export interface IGitHubEndpointProvider {
	readonly onDidChange: Event<void>;
	getApiBaseUri(): string;
	getGraphQlUri(): string;
}

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

export interface GitHubServiceOptions {
	readonly credentialProvider: IGitHubCredentialProvider;
	readonly fetch?: GitHubFetch;
	readonly telemetrySource?: GitHubTelemetrySource;
	readonly clientMetadata?: GitHubClientMetadata;
	readonly onDidChangeTelemetryLevel?: Event<TelemetryLevel>;
}

/** Identifies an authorization grant chosen by the hosting binding, never a raw token. */
export interface GitHubAuthorizationContext {
	readonly providerId: string;
	readonly sessionId: string;
	readonly scopes: readonly string[];
	readonly authorizationServer?: string;
}

export interface GitHubClientOptions {
	readonly authorization: GitHubAuthorizationContext;
	readonly apiBaseUri: string;
	readonly graphQlUri: string;
}

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
