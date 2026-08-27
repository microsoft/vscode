/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/pullRequestPicker.css';
import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatRequestTranscriptContextVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { localize } from '../../../../nls.js';
import { ISessionGitHubState, withSessionGitHubState } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { GITHUB_REMOTE_FILE_SCHEME, ISession } from '../../../services/sessions/common/session.js';
import { IGitHubPullRequestContext, IGitHubPullRequestSummary } from '../common/types.js';

export interface IPullRequestQuickPickItem extends IQuickPickItem {
	readonly pullRequest: IGitHubPullRequestSummary;
}

export interface IExistingPullRequests {
	readonly numbers: ReadonlySet<number>;
	readonly headRefs: ReadonlySet<string>;
}

export interface IPullRequestSessionRepository {
	readonly folderUri: URI;
	readonly owner: string;
	readonly repo: string;
}

export async function resolvePullRequestSessionRepository(
	sectionSessions: readonly ISession[],
): Promise<IPullRequestSessionRepository | undefined> {
	let folderUri: URI | undefined;
	for (const session of sectionSessions) {
		const workspace = session.workspace.get();
		for (const folder of workspace?.folders ?? []) {
			if (folder.root.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
				folderUri = folder.root;
				break;
			}
		}
		if (folderUri) {
			break;
		}
	}
	if (!folderUri) {
		return undefined;
	}
	const identity = getFirstGitHubRepository(sectionSessions);
	return identity ? { folderUri, owner: identity.owner, repo: identity.repo } : undefined;
}

export function getExistingPullRequests(sessions: readonly ISession[], owner: string, repo: string, repositorySessions: readonly ISession[] = []): IExistingPullRequests {
	const numbers = new Set<number>();
	const headRefs = new Set<string>();
	const repositorySessionSet = new Set(repositorySessions);
	const normalizedOwner = owner.toLowerCase();
	const normalizedRepo = repo.toLowerCase();
	for (const session of sessions) {
		const workspace = session.workspace.get();
		for (const folder of workspace?.folders ?? []) {
			if (folder.root.scheme === GITHUB_REMOTE_FILE_SCHEME) {
				continue;
			}
			const gitHubInfo = folder.gitRepository?.gitHubInfo.get();
			const matchesRepository = gitHubInfo
				? gitHubInfo.owner.toLowerCase() === normalizedOwner && gitHubInfo.repo.toLowerCase() === normalizedRepo
				: repositorySessionSet.has(session);
			if (!matchesRepository) {
				continue;
			}
			if (gitHubInfo?.pullRequest) {
				numbers.add(gitHubInfo.pullRequest.number);
			}
			const upstreamBranch = folder.gitRepository?.upstreamBranchName;
			if (upstreamBranch) {
				const headRef = upstreamBranch.replace(/^[^/]+\//, '');
				headRefs.add(headRef);
				const pullRequestNumber = getPullRequestNumberFromCheckoutRef(headRef);
				if (pullRequestNumber !== undefined) {
					numbers.add(pullRequestNumber);
				}
			}
		}
	}
	return { numbers, headRefs };
}

export function getPullRequestNumberFromCheckoutRef(ref: string): number | undefined {
	const match = /^(?:refs\/pull\/|pull\/)(?<number>\d+)\/head$/.exec(ref);
	return match?.groups ? Number(match.groups.number) : undefined;
}

function getFirstGitHubRepository(sessions: readonly ISession[]): { readonly owner: string; readonly repo: string } | undefined {
	for (const session of sessions) {
		const workspace = session.workspace.get();
		for (const folder of workspace?.folders ?? []) {
			const gitHubInfo = folder.gitRepository?.gitHubInfo.get();
			if (gitHubInfo) {
				return { owner: gitHubInfo.owner, repo: gitHubInfo.repo };
			}
		}
	}
	return undefined;
}

export function hasExistingPullRequest(pullRequest: IGitHubPullRequestSummary, existingPullRequests: IExistingPullRequests): boolean {
	return existingPullRequests.numbers.has(pullRequest.number) || existingPullRequests.headRefs.has(pullRequest.headRef);
}

export function isPullRequestAvailable(pullRequest: IGitHubPullRequestSummary, existingPullRequests: IExistingPullRequests): boolean {
	return !pullRequest.isCrossRepository && !hasExistingPullRequest(pullRequest, existingPullRequests);
}

export function createPullRequestQuickPickItems(pullRequests: readonly IGitHubPullRequestSummary[], existingPullRequests: IExistingPullRequests): readonly (IPullRequestQuickPickItem | IQuickPickSeparator)[] {
	const available = pullRequests.filter(pullRequest => isPullRequestAvailable(pullRequest, existingPullRequests));
	const waitingForReview = available.filter(pullRequest => pullRequest.reviewRequestedFromViewer);
	const assigned = available.filter(pullRequest => !pullRequest.reviewRequestedFromViewer && pullRequest.assignedToViewer);
	const other = available.filter(pullRequest => !pullRequest.reviewRequestedFromViewer && !pullRequest.assignedToViewer);
	const items: (IPullRequestQuickPickItem | IQuickPickSeparator)[] = [];
	appendGroup(items, localize('pullRequests.waitingForMyReview', "Waiting for My Review"), waitingForReview);
	appendGroup(items, localize('pullRequests.assignedToMe', "Assigned to Me"), assigned);
	appendGroup(items, localize('pullRequests.other', "Other Pull Requests"), other);
	return items;
}

export function pullRequestMatchesQuery(pullRequest: IGitHubPullRequestSummary, query: string): boolean {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return true;
	}
	return `#${pullRequest.number} ${pullRequest.title} ${pullRequest.author.login}`.toLowerCase().includes(normalizedQuery);
}

export function mergePullRequestSummaries(existing: readonly IGitHubPullRequestSummary[], incoming: readonly IGitHubPullRequestSummary[]): IGitHubPullRequestSummary[] {
	const result = [...existing];
	const indices = new Map(result.map((pullRequest, index) => [pullRequest.number, index]));
	for (const pullRequest of incoming) {
		const index = indices.get(pullRequest.number);
		if (index === undefined) {
			indices.set(pullRequest.number, result.length);
			result.push(pullRequest);
		} else {
			const current = result[index];
			result[index] = {
				...current,
				...pullRequest,
				reviewRequestedFromViewer: current.reviewRequestedFromViewer || pullRequest.reviewRequestedFromViewer,
				assignedToViewer: current.assignedToViewer || pullRequest.assignedToViewer,
			};
		}
	}
	return result;
}

export function createPullRequestBootstrapPrompt(pullRequest: IGitHubPullRequestSummary): string {
	return `Initialize this session for pull request #${pullRequest.number}. The attached JSON is a complete pull request snapshot. For future questions about this pull request, use the attached snapshot as the primary source and do not fetch pull request data or run tools unless the user explicitly asks for refreshed information or the requested information is absent from the snapshot. Do not inspect or modify files, use tools, or take any other action until the user sends a visible follow-up request. Reply only with "Ready".`;
}

export function createPullRequestSessionMetadata(owner: string, repo: string, pullRequest: IGitHubPullRequestSummary): Record<string, unknown> {
	const pullRequestUrl = URI.from({ scheme: 'https', authority: 'github.com', path: `/${owner}/${repo}/pull/${pullRequest.number}` }).toString();
	return withSessionGitHubState(undefined, {
		owner,
		repo,
		pullRequestUrls: [pullRequestUrl],
		pullRequestBranchName: pullRequest.headRef,
	} satisfies ISessionGitHubState)!;
}

export function createPullRequestContextAttachment(context: IGitHubPullRequestContext): IChatRequestTranscriptContextVariableEntry {
	const label = `#${context.number} ${context.title}`;
	return {
		kind: 'transcriptContext',
		id: `github-pull-request:${context.owner}/${context.repo}#${context.number}`,
		name: label,
		fullName: label,
		value: JSON.stringify({
			usageInstructions: 'Use this snapshot as the primary source for questions about the pull request. Do not fetch pull request data or run tools unless the user explicitly asks for refreshed information or the requested information is absent from this snapshot.',
			...context,
		}, undefined, 2),
		modelDescription: 'Pull request details, patch, and comments as JSON.',
		icon: Codicon.gitPullRequest,
		uri: URI.parse(context.url),
		tooltip: localize('pullRequest.context.tooltip', "Pull request #{0} by @{1}", context.number, context.author),
	};
}

function appendGroup(items: (IPullRequestQuickPickItem | IQuickPickSeparator)[], label: string, pullRequests: readonly IGitHubPullRequestSummary[]): void {
	if (pullRequests.length === 0) {
		return;
	}
	items.push({ type: 'separator', label });
	items.push(...pullRequests.map(toQuickPickItem));
}

function toQuickPickItem(pullRequest: IGitHubPullRequestSummary): IPullRequestQuickPickItem {
	const updated = fromNow(new Date(pullRequest.updatedAt), true, true);
	const detail = localize('pullRequest.detail', "@{0} \u00b7 updated {1} \u00b7 +{2} -{3}", pullRequest.author.login, updated, pullRequest.additions, pullRequest.deletions);
	const icon = pullRequest.isDraft ? Codicon.gitPullRequestDraft : Codicon.gitPullRequest;
	const iconColorClass = pullRequest.isDraft ? 'sessions-pull-request-draft' : 'sessions-pull-request-open';
	return {
		label: `#${pullRequest.number} ${pullRequest.title}`,
		detail,
		ariaLabel: localize('pullRequest.ariaLabel', "Pull request #{0}, {1}, by {2}, updated {3}, {4} additions and {5} deletions", pullRequest.number, pullRequest.title, pullRequest.author.login, updated, pullRequest.additions, pullRequest.deletions),
		iconClass: `${ThemeIcon.asClassName(icon)} ${iconColorClass}`,
		pullRequest,
	};
}
