/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { convertSimple2RegExpPattern } from '../../../base/common/strings.js';
import { isArrayOf, isString } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ArtifactAutomationOption } from '../../artifactIntegrations/common/artifactIntegration.js';
import { FragmentState, PullRequestCheck, PullRequestReviewThread, PullRequestSnapshot } from '../../github/common/githubPullRequestService.js';
import { isPullRequestFeedbackAuthor } from '../../github/common/pullRequestFeedback.js';
import { deriveGitHubEndpoints } from './githubEndpoints.js';

export const gitHubPullRequestArtifactIntegrationId = 'github.pullRequest';
export const gitHubPullRequestMarkReadyIgnoredChecksSetting = 'chat.artifactIntegrations.githubPullRequests.autoMarkReadyIgnoredChecks';
export type GitHubPullRequestArtifactActionId = 'addressReviews' | 'fixCI' | 'resolveConflicts' | 'markReady' | 'merge';

export const gitHubPullRequestArtifactOptions: readonly ArtifactAutomationOption[] = [
	{
		id: 'addressReviews', kind: 'boolean', defaultValue: false, actionIds: ['addressReviews'], maxAttempts: 3,
		label: localize('prArtifact.autoReviews', "Automatically Address Reviews"),
		description: localize('prArtifact.autoReviews.description', "Address unresolved review threads from repository collaborators and Copilot, then commit and push the repairs."),
	},
	{
		id: 'fixCI', kind: 'boolean', defaultValue: false, actionIds: ['fixCI'], maxAttempts: 3,
		label: localize('prArtifact.autoCI', "Automatically Fix CI"),
		description: localize('prArtifact.autoCI.description', "Repair any failing check, including optional checks, then commit and push the repairs."),
	},
	{
		id: 'resolveConflicts', kind: 'boolean', defaultValue: false, actionIds: ['resolveConflicts'], maxAttempts: 3,
		label: localize('prArtifact.autoConflicts', "Automatically Update Branch"),
		description: localize('prArtifact.autoConflicts.description', "Resolve merge conflicts or update a behind branch, then commit and push the changes."),
	},
	{
		id: 'markReady', kind: 'boolean', defaultValue: false, actionIds: ['markReady'], maxAttempts: 1,
		label: localize('prArtifact.autoReady', "Automatically Mark Ready"),
		description: localize('prArtifact.autoReady.description', "Mark the draft ready when checks pass and no qualifying unresolved review threads remain. The check-exclusion setting applies only to this action."),
	},
	{
		id: 'merge', kind: 'enum', defaultValue: 'never', disabledValue: 'never', actionIds: ['merge'], maxAttempts: 1,
		label: localize('prArtifact.autoMerge', "Automatically Merge"),
		description: localize('prArtifact.autoMerge.description', "Merge when every check passes, qualifying review threads are resolved, and GitHub permits it."),
		choices: [
			{ value: 'never', label: localize('prArtifact.mergeOff', "Off") },
			{ value: 'always', label: localize('prArtifact.mergeAlways', "When Ready") },
			{ value: 'ifUnchanged', label: localize('prArtifact.mergeUnchanged', "Only if Repairs Make No Changes") },
		],
	},
];

export interface GitHubPullRequestArtifactTarget {
	readonly resource: URI;
	readonly apiHost: string;
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
}

export function parseGitHubPullRequestArtifact(resource: URI, apiBaseUri: string): GitHubPullRequestArtifactTarget | undefined {
	if (resource.scheme !== 'https' && resource.scheme !== 'http') {
		return undefined;
	}
	const match = /^\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)(?:\/(?:files|checks|commits))?\/?$/.exec(resource.path);
	const number = Number(match?.groups?.number);
	if (!match?.groups || !Number.isSafeInteger(number) || number < 1) {
		return undefined;
	}
	const endpoints = deriveGitHubEndpoints(`${resource.scheme}://${resource.authority}`);
	if (endpoints.apiBaseUri.toLowerCase() !== apiBaseUri.replace(/\/$/, '').toLowerCase()) {
		return undefined;
	}
	const { owner, repo } = match.groups;
	return {
		resource: resource.with({ scheme: endpoints.enterpriseHost ? resource.scheme : 'https', authority: endpoints.enterpriseHost ?? 'github.com', path: `/${owner}/${repo}/pull/${number}`, query: '', fragment: '' }),
		apiHost: URI.parse(apiBaseUri).authority.toLowerCase(), owner, repo, number,
	};
}

export function isCurrentPullRequestFragment<T>(fragment: FragmentState<T>, headSha?: string): fragment is FragmentState<T> & { readonly value: T } {
	return fragment.status === 'ready' && fragment.complete && fragment.value !== undefined
		&& (headSha === undefined || fragment.headSha === headSha);
}

export function getPullRequestArtifactThreads(snapshot: PullRequestSnapshot): readonly PullRequestReviewThread[] {
	return snapshot.reviewThreads.value?.filter(thread => !thread.isResolved && thread.comments.some(comment => isPullRequestFeedbackAuthor(comment.author))) ?? [];
}

export function getPullRequestArtifactChecks(snapshot: PullRequestSnapshot): readonly PullRequestCheck[] {
	const checks = snapshot.checks.value;
	return checks ? [
		...checks.checks,
		...checks.expectedSuites.filter(suite => !suite.checkRunsReported).map(suite => ({
			id: `suite:${suite.id}`, type: 'checkRun' as const, name: suite.name, status: suite.status, conclusion: suite.conclusion,
		})),
	] : [];
}

export function getPullRequestArtifactCheckState(check: PullRequestCheck): 'passed' | 'pending' | 'failed' {
	const status = check.status?.toUpperCase();
	if (check.type === 'statusContext') {
		return !status || status === 'PENDING' ? 'pending' : status === 'SUCCESS' ? 'passed' : 'failed';
	}
	if (status !== 'COMPLETED' || !check.conclusion) {
		return 'pending';
	}
	return ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(check.conclusion.toUpperCase()) ? 'passed' : 'failed';
}

export function isPullRequestArtifactCheckExcluded(name: string, patterns: readonly string[]): boolean {
	return patterns.some(pattern => new RegExp(`^${convertSimple2RegExpPattern(pattern)}$`).test(name));
}

export function arePullRequestArtifactChecksReady(snapshot: PullRequestSnapshot, ignoredChecks: readonly string[] = []): boolean {
	const headSha = snapshot.core.value?.headSha;
	return !!headSha && isCurrentPullRequestFragment(snapshot.checks, headSha)
		&& snapshot.checks.value.headSha === headSha && snapshot.checks.value.expectedSuitesComplete
		&& getPullRequestArtifactChecks(snapshot).every(check => isPullRequestArtifactCheckExcluded(check.name, ignoredChecks) || getPullRequestArtifactCheckState(check) === 'passed');
}

export function isPullRequestArtifactReadyForReview(snapshot: PullRequestSnapshot, ignoredChecks: readonly string[]): boolean {
	return isCurrentPullRequestFragment(snapshot.core) && snapshot.core.value.state === 'open' && snapshot.core.value.draft
		&& isCurrentPullRequestFragment(snapshot.reviewThreads)
		&& getPullRequestArtifactThreads(snapshot).length === 0
		&& arePullRequestArtifactChecksReady(snapshot, ignoredChecks);
}

export function isPullRequestArtifactMergeable(snapshot: PullRequestSnapshot, automatic: boolean): boolean {
	if (!isCurrentPullRequestFragment(snapshot.core) || snapshot.core.value.state !== 'open' || snapshot.core.value.draft
		|| !isCurrentPullRequestFragment(snapshot.mergeability, snapshot.core.value.headSha)) {
		return false;
	}
	const mergeability = snapshot.mergeability.value;
	if (!mergeability.viewerCanMerge || mergeability.mergeable !== 'MERGEABLE' || !mergeability.queueRequirementKnown
		|| !['CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(mergeability.mergeStateStatus ?? '')
		|| mergeability.reviewDecision === 'CHANGES_REQUESTED'
		|| mergeability.mergeQueueEntryId || mergeability.autoMergeEnabled) {
		return false;
	}
	return !automatic || (isCurrentPullRequestFragment(snapshot.reviewThreads)
		&& getPullRequestArtifactThreads(snapshot).length === 0 && arePullRequestArtifactChecksReady(snapshot));
}

export interface GitHubPullRequestArtifactWorkspaceSettings {
	readonly chat: string;
	readonly workingDirectory: string;
	readonly ignoredChecks: readonly string[];
}

export function gitHubPullRequestArtifactWorkspaceSettingsKey(artifactId: string): string {
	return `githubPullRequestArtifactSettings.${encodeURIComponent(artifactId)}`;
}

export function isArtifactDataObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readGitHubPullRequestArtifactWorkspaceSettings(value: unknown): GitHubPullRequestArtifactWorkspaceSettings | undefined {
	if (!isArtifactDataObject(value)
		|| typeof value.chat !== 'string' || typeof value.workingDirectory !== 'string' || !isArrayOf(value.ignoredChecks, isString)) {
		return undefined;
	}
	return { chat: value.chat, workingDirectory: value.workingDirectory, ignoredChecks: value.ignoredChecks };
}
