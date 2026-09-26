/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PullRequestSnapshot } from '../../../github/common/githubPullRequestService.js';

export function createPullRequestArtifactSnapshot(overrides: Partial<PullRequestSnapshot> = {}): PullRequestSnapshot {
	return {
		ref: { host: 'api.github.com', accountId: '1', owner: 'octo', repo: 'repo', number: 42 },
		generation: 1, headGeneration: 1,
		core: {
			status: 'ready', complete: true,
			value: {
				id: 'PR_42', repositoryNameWithOwner: 'octo/repo', number: 42, title: 'Example change',
				url: 'https://github.com/octo/repo/pull/42', state: 'open', draft: false,
				headSha: 'head', headRef: 'feature', baseSha: 'base', baseRef: 'main',
			},
		},
		checks: {
			status: 'ready', complete: true, headSha: 'head',
			value: {
				headSha: 'head', requirednessComplete: true, expectedSuitesComplete: true, expectedSuites: [],
				checks: [{ id: 'build', name: 'Build', type: 'checkRun', status: 'COMPLETED', conclusion: 'SUCCESS', required: true }],
			},
		},
		reviewThreads: { status: 'ready', complete: true, headSha: 'head', value: [] },
		mergeability: {
			status: 'ready', complete: true, headSha: 'head',
			value: {
				headSha: 'head', baseSha: 'base', mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN',
				viewerCanUpdate: true, viewerCanMerge: true, viewerCanEnableAutoMerge: true,
				allowedMergeMethods: ['SQUASH'], autoMergeEnabled: false, mergeQueueRequired: false, queueRequirementKnown: true,
			},
		},
		submittedReviews: { status: 'missing', complete: false },
		topLevelComments: { status: 'missing', complete: false },
		inlineComments: { status: 'missing', complete: false },
		participants: { status: 'missing', complete: false },
		...overrides,
	};
}
