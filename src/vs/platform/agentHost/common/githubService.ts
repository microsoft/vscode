/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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

export interface GitHubHostCapabilities {
	readonly graphql: boolean;
	readonly mergeQueue: boolean;
	readonly internalMergeStatus: boolean;
	readonly reviewThreads: boolean;
	readonly checkContextRequiredness: boolean;
}
