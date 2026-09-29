/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';

export type GitHubFetch = typeof globalThis.fetch;

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
	| 'malformedResponse'
	| 'unknown';

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

export interface GitHubServiceOptions {
	readonly endpoint: IGitHubEndpointProvider;
	readonly tokenProvider: IGitHubTokenProvider;
	readonly fetch?: GitHubFetch;
}
