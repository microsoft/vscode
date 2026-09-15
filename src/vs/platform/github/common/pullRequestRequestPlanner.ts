/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PullRequestFragment, PullRequestPriority } from './githubPullRequestService.js';
import { GitHubHostCapabilities, GitHubRequestPriority } from './githubTypes.js';

export type PullRequestRequestStrategy =
	| 'rest'
	| 'graphql'
	| 'restChecksFallback'
	| 'restMergeabilityFallback'
	| 'unavailable';

export interface PullRequestRequestPlan {
	readonly fragment: PullRequestFragment;
	readonly strategy: PullRequestRequestStrategy;
	readonly priority: GitHubRequestPriority;
	readonly completeWhenSuccessful: boolean;
}

export class PullRequestRequestPlanner {

	plan(fragment: PullRequestFragment, priority: PullRequestPriority, capabilities: GitHubHostCapabilities): PullRequestRequestPlan {
		const requestPriority = toGitHubRequestPriority(priority);
		switch (fragment) {
			case 'core':
			case 'topLevelComments':
			case 'submittedReviews':
			case 'inlineComments':
				return { fragment, strategy: 'rest', priority: requestPriority, completeWhenSuccessful: true };
			case 'reviewThreads':
				return capabilities.graphql && capabilities.reviewThreads
					? { fragment, strategy: 'graphql', priority: requestPriority, completeWhenSuccessful: true }
					: { fragment, strategy: 'unavailable', priority: requestPriority, completeWhenSuccessful: false };
			case 'checks':
				return capabilities.graphql
					? { fragment, strategy: 'graphql', priority: requestPriority, completeWhenSuccessful: capabilities.checkContextRequiredness }
					: { fragment, strategy: 'restChecksFallback', priority: requestPriority, completeWhenSuccessful: false };
			case 'mergeability':
				return capabilities.graphql
					? { fragment, strategy: 'graphql', priority: requestPriority, completeWhenSuccessful: true }
					: { fragment, strategy: 'restMergeabilityFallback', priority: requestPriority, completeWhenSuccessful: false };
			case 'participants':
				return { fragment, strategy: 'rest', priority: requestPriority, completeWhenSuccessful: true };
		}
	}
}

function toGitHubRequestPriority(priority: PullRequestPriority): GitHubRequestPriority {
	switch (priority) {
		case 'interactive': return 'interactive';
		case 'visible': return 'visible';
		case 'background': return 'background';
	}
}
