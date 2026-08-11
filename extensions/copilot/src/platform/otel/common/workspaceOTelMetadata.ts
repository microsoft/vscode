/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../util/vs/base/common/uri';
import { isEqualOrParent, relativePath } from '../../../util/vs/base/common/resources';
import { getGithubRepoIdFromFetchUrl, getOrderedRemoteUrlsFromContext, getOrderedRepoInfosFromContext, type IGitService, normalizeFetchUrl, parseRemoteUrl, type RepoContext } from '../../git/common/gitService';
import { CopilotChatAttr, GitHubCopilotAttr } from './genAiAttributes';

export interface WorkspaceOTelMetadata {
	readonly headBranchName?: string;
	readonly headCommitHash?: string;
	readonly remoteUrl?: string;
	readonly fileRelativePath?: string;
}

/**
 * Synchronously resolve workspace metadata from the active repository.
 * Uses `activeRepository.get()` which is non-blocking.
 */
export function resolveWorkspaceOTelMetadata(
	gitService: IGitService,
	fileUri?: URI,
): WorkspaceOTelMetadata {
	const repoContext = gitService.activeRepository?.get();
	if (!repoContext) {
		return {};
	}
	return buildWorkspaceMetadata(repoContext, fileUri);
}

function buildWorkspaceMetadata(repoContext: RepoContext, fileUri?: URI): WorkspaceOTelMetadata {
	const remoteUrl = pickRemoteUrl(repoContext);

	let fileRelativePath: string | undefined;
	if (fileUri && isEqualOrParent(fileUri, repoContext.rootUri)) {
		fileRelativePath = relativePath(repoContext.rootUri, fileUri);
	}

	return {
		headBranchName: repoContext.headBranchName,
		headCommitHash: repoContext.headCommitHash,
		remoteUrl,
		fileRelativePath,
	};
}

/**
 * Picks the normalized remote fetch URL to report for a repository.
 *
 * A remote that resolves to a repo id (github.com, `*.ghe.com`, Azure DevOps) always wins,
 * so repositories that already reported a URL keep reporting the same one. Only when no
 * remote resolves do we fall back to the highest-priority remote of any host: the branch
 * and commit attributes are read straight off the repo context with no host check, so the
 * repository must not be silently dropped for self-hosted GitHub Enterprise Server on a
 * custom domain, GitLab, Bitbucket Server, or a plain git server.
 *
 * Both passes walk remotes in the same priority order (a lone remote first, then the
 * upstream remote, then `origin`, then the rest). The fallback accepts only URLs that parse
 * as ssh, https, or http, which keeps local remotes (`file://`, absolute or relative paths)
 * out of telemetry rather than emitting a user's filesystem layout.
 */
function pickRemoteUrl(repoContext: RepoContext): string | undefined {
	const resolved = Array.from(getOrderedRepoInfosFromContext(repoContext))[0];
	if (resolved?.fetchUrl) {
		return normalizeFetchUrl(resolved.fetchUrl);
	}
	for (const remoteUrl of getOrderedRemoteUrlsFromContext(repoContext)) {
		// `getOrderedRemoteUrlsFromContext` types its result as `Iterable<string>` but reads
		// from `remoteFetchUrls: Array<string | undefined>`, so guard against empty entries.
		if (!remoteUrl || !parseRemoteUrl(remoteUrl)) {
			continue;
		}
		return normalizeFetchUrl(remoteUrl);
	}
	return undefined;
}

/**
 * Convert workspace metadata to OTel attributes, omitting undefined values.
 * Emits both the legacy `copilot_chat.repo.*` namespace and the canonical
 * `github.copilot.git.*` namespace.
 */
export function workspaceMetadataToOTelAttributes(
	metadata?: WorkspaceOTelMetadata,
): Record<string, string> {
	if (!metadata) {
		return {};
	}
	const attrs: Record<string, string> = {};
	if (metadata.headBranchName) {
		attrs[CopilotChatAttr.REPO_HEAD_BRANCH_NAME] = metadata.headBranchName;
		attrs[GitHubCopilotAttr.GIT_BRANCH] = metadata.headBranchName;
	}
	if (metadata.headCommitHash) {
		attrs[CopilotChatAttr.REPO_HEAD_COMMIT_HASH] = metadata.headCommitHash;
		attrs[GitHubCopilotAttr.GIT_COMMIT_SHA] = metadata.headCommitHash;
	}
	if (metadata.remoteUrl) {
		attrs[CopilotChatAttr.REPO_REMOTE_URL] = metadata.remoteUrl;
		attrs[GitHubCopilotAttr.GIT_REPOSITORY] = metadata.remoteUrl;
		const org = extractGitHubOrg(metadata.remoteUrl);
		if (org) {
			attrs[GitHubCopilotAttr.GITHUB_ORG] = org;
		}
	}
	if (metadata.fileRelativePath) {
		attrs[CopilotChatAttr.FILE_RELATIVE_PATH] = metadata.fileRelativePath;
	}
	return attrs;
}

/**
 * Extract the `owner` segment from a remote URL that resolves to a GitHub repository.
 *
 * Unlike the remote URL itself, this stays scoped to hosts recognized as GitHub —
 * github.com, `*.ghe.com`, and the ssh host aliases those resolve through. Returns
 * undefined for every other host, which notably includes self-hosted GitHub Enterprise
 * Server on a custom domain: telling that apart from an arbitrary git server needs the
 * configured `github-enterprise.uri`, which this module has no access to.
 */
function extractGitHubOrg(remoteUrl: string): string | undefined {
	return getGithubRepoIdFromFetchUrl(remoteUrl)?.org;
}
