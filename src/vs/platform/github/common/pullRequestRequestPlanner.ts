/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PullRequestFragment, PullRequestPriority } from './githubPullRequestService.js';
import { GitHubHostCapabilities } from './githubTypes.js';
import { RequestPriority } from './types.js';

export type PullRequestRequestStrategy =
	| 'rest'
	| 'graphql'
	| 'restChecksFallback'
	| 'restMergeabilityFallback'
	| 'unavailable';

export interface PullRequestRequestPlan {
	readonly strategy: PullRequestRequestStrategy;
	readonly priority: RequestPriority;
	readonly completeWhenSuccessful: boolean;
}

export class PullRequestRequestPlanner {

	plan(fragment: PullRequestFragment, priority: PullRequestPriority, capabilities: GitHubHostCapabilities): PullRequestRequestPlan {
		const requestPriority = toGitHubRequestPriority(priority);
		switch (fragment) {
			case 'core':
			case 'topLevelComments':
			case 'submittedReviews':
				return { strategy: 'rest', priority: requestPriority, completeWhenSuccessful: true };
			case 'reviewThreads':
				return capabilities.graphql && capabilities.reviewThreads
					? { strategy: 'graphql', priority: requestPriority, completeWhenSuccessful: true }
					: { strategy: 'unavailable', priority: requestPriority, completeWhenSuccessful: false };
			case 'checks':
				return capabilities.graphql
					? { strategy: 'graphql', priority: requestPriority, completeWhenSuccessful: capabilities.checkContextRequiredness }
					: { strategy: 'restChecksFallback', priority: requestPriority, completeWhenSuccessful: false };
			case 'mergeability':
				return capabilities.graphql
					? { strategy: 'graphql', priority: requestPriority, completeWhenSuccessful: true }
					: { strategy: 'restMergeabilityFallback', priority: requestPriority, completeWhenSuccessful: false };
		}
	}
}

function toGitHubRequestPriority(priority: PullRequestPriority): RequestPriority {
	switch (priority) {
		case 'interactive': return 'interactive';
		case 'visible': return 'visible';
		case 'background': return 'background';
	}
}
