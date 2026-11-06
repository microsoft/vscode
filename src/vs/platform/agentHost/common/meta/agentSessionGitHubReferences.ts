/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readSessionFolderGitHubState, readSessionGitHubData, readSessionGitState, SESSION_META_GITHUB_DATA_KEY, SESSION_META_GITHUB_KEY } from '../state/sessionState.js';
import { hasAgentMetadata, type IAgentMetadataSource } from './metadata.js';
import { parseHeadBranchPullRequestUrl, readCopilotHeadBranchPullRequest, withCopilotHeadBranchPullRequest, type IAgentHeadBranchPullRequest } from './copilotd/sessionGitHubReferences.js';

export type { IAgentHeadBranchPullRequest } from './copilotd/sessionGitHubReferences.js';

/** VS Code folder metadata is authoritative, even when it contains no current PR. */
export function readAgentHeadBranchPullRequest(source: IAgentMetadataSource): IAgentHeadBranchPullRequest | undefined {
	return hasAgentMetadata(source, [SESSION_META_GITHUB_DATA_KEY, SESSION_META_GITHUB_KEY]) ? undefined : readCopilotHeadBranchPullRequest(source);
}

/** Retains only the validated head-branch reference when caching client metadata. */
export function toAgentHeadBranchPullRequestMeta(source: IAgentMetadataSource): IAgentMetadataSource['_meta'] {
	return withCopilotHeadBranchPullRequest(undefined, readAgentHeadBranchPullRequest(source));
}

/** Publishes the primary checkout's PR for clients using the Copilot GitHub-reference convention. */
export function withAgentSessionGitHubReferences<T extends IAgentMetadataSource & { readonly workingDirectories?: readonly string[] }>(source: T): T {
	const git = readSessionGitState(source._meta);
	const github = git?.branchName && readSessionGitHubData(source._meta).size ? readSessionFolderGitHubState(source) : undefined;
	const url = github?.pullRequestUrls?.[0];
	const parsed = url ? parseHeadBranchPullRequestUrl(url) : undefined;
	const matchesBranch = !!git?.branchName && github?.pullRequestBranchName === git.branchName;
	const matchesRepository = parsed && github?.owner?.toLowerCase() === parsed.owner.toLowerCase() && github.repo?.toLowerCase() === parsed.repo.toLowerCase();
	const state = github?.pullRequestStateUrl === url ? github?.pullRequestState : undefined;
	const _meta = withCopilotHeadBranchPullRequest(source._meta, matchesBranch && matchesRepository ? { ...parsed, title: '', ...(state ? { state } : {}) } : undefined);
	return _meta === source._meta ? source : { ...source, _meta };
}
