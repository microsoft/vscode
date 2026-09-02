/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PullRequestFragment, PullRequestPriority, PullRequestSubscriptionOptions } from './githubPullRequestService.js';

export interface EffectivePullRequestFragmentInterest {
	readonly priority: PullRequestPriority;
	readonly includeBodies?: boolean;
	readonly requiredChecks?: boolean;
	readonly includeOptionalChecks?: boolean;
}

const priorityRank: Record<PullRequestPriority, number> = {
	background: 0,
	visible: 1,
	interactive: 2,
};

export function unionPullRequestInterests(options: Iterable<PullRequestSubscriptionOptions>): ReadonlyMap<PullRequestFragment, EffectivePullRequestFragmentInterest> {
	const result = new Map<PullRequestFragment, EffectivePullRequestFragmentInterest>();
	for (const value of options) {
		merge(result, 'core', { priority: value.priority });
		if (value.conversation?.topLevelComments) {
			merge(result, 'topLevelComments', { priority: value.priority, includeBodies: value.conversation.includeBodies === true });
		}
		if (value.conversation?.submittedReviews) {
			merge(result, 'submittedReviews', { priority: value.priority, includeBodies: value.conversation.includeBodies === true });
		}
		if (value.conversation?.inlineComments) {
			merge(result, 'inlineComments', { priority: value.priority, includeBodies: value.conversation.includeBodies === true });
		}
		if (value.conversation?.reviewThreads) {
			merge(result, 'reviewThreads', { priority: value.priority, includeBodies: value.conversation.includeBodies === true });
		}
		if (value.checks) {
			merge(result, 'checks', {
				priority: value.priority,
				requiredChecks: value.checks.required === true,
				includeOptionalChecks: value.checks.includeOptional === true,
			});
		}
		if (value.mergeability) {
			merge(result, 'mergeability', { priority: value.priority });
		}
		if (value.participants) {
			merge(result, 'participants', { priority: value.priority });
		}
	}
	return result;
}

export function pullRequestOptionsForFragment(
	fragment: PullRequestFragment,
	interest: EffectivePullRequestFragmentInterest,
): PullRequestSubscriptionOptions {
	switch (fragment) {
		case 'topLevelComments':
			return { priority: interest.priority, conversation: { topLevelComments: true, includeBodies: interest.includeBodies } };
		case 'submittedReviews':
			return { priority: interest.priority, conversation: { submittedReviews: true, includeBodies: interest.includeBodies } };
		case 'inlineComments':
			return { priority: interest.priority, conversation: { inlineComments: true, includeBodies: interest.includeBodies } };
		case 'reviewThreads':
			return { priority: interest.priority, conversation: { reviewThreads: true, includeBodies: interest.includeBodies } };
		case 'checks':
			return {
				priority: interest.priority,
				checks: { required: interest.requiredChecks, includeOptional: interest.includeOptionalChecks },
			};
		case 'mergeability':
			return { priority: interest.priority, mergeability: true };
		case 'participants':
			return { priority: interest.priority, participants: true };
		case 'core':
			return { priority: interest.priority, core: true };
	}
}

function merge(
	result: Map<PullRequestFragment, EffectivePullRequestFragmentInterest>,
	fragment: PullRequestFragment,
	incoming: EffectivePullRequestFragmentInterest,
): void {
	const current = result.get(fragment);
	if (!current) {
		result.set(fragment, incoming);
		return;
	}
	result.set(fragment, {
		priority: priorityRank[incoming.priority] > priorityRank[current.priority] ? incoming.priority : current.priority,
		includeBodies: current.includeBodies === true || incoming.includeBodies === true,
		requiredChecks: current.requiredChecks === true || incoming.requiredChecks === true,
		includeOptionalChecks: current.includeOptionalChecks === true || incoming.includeOptionalChecks === true,
	});
}
