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
	/**
	 * Normalized remote fetch URL for OTel attributes, reported for any host so that a
	 * repository is never silently dropped. Exported only to the user-configured OTel
	 * pipeline.
	 */
	readonly remoteUrl?: string;
	/**
	 * Normalized remote fetch URL restricted to remotes that resolve to a repo id
	 * (github.com, `*.ghe.com`, Azure DevOps) — the set that was reportable before
	 * host-agnostic reporting was introduced.
	 *
	 * Consumers that forward the remote to a channel other than the user's own OTel
	 * exporter (GitHub telemetry events) must use this field, so that broadening OTel
	 * coverage does not silently widen what those channels collect.
	 */
	readonly recognizedRemoteUrl?: string;
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
	const recognizedRemoteUrl = pickRecognizedRemoteUrl(repoContext);
	const remoteUrl = recognizedRemoteUrl ?? pickFallbackRemoteUrl(repoContext);

	let fileRelativePath: string | undefined;
	if (fileUri && isEqualOrParent(fileUri, repoContext.rootUri)) {
		fileRelativePath = relativePath(repoContext.rootUri, fileUri);
	}

	return {
		headBranchName: repoContext.headBranchName,
		headCommitHash: repoContext.headCommitHash,
		remoteUrl,
		recognizedRemoteUrl,
		fileRelativePath,
	};
}

/**
 * Picks the normalized remote fetch URL of the highest-priority remote that resolves to a
 * repo id (github.com, `*.ghe.com`, Azure DevOps).
 *
 * This is the set of remotes that was reportable before host-agnostic reporting existed, so
 * preferring it keeps every repository that already reported a URL reporting the same one.
 */
function pickRecognizedRemoteUrl(repoContext: RepoContext): string | undefined {
	const resolved = Array.from(getOrderedRepoInfosFromContext(repoContext))[0];
	return resolved?.fetchUrl ? normalizeFetchUrl(resolved.fetchUrl) : undefined;
}

/**
 * Picks the normalized remote fetch URL of the highest-priority remote on any host, used
 * only when no remote resolves to a repo id. The branch and commit attributes are read
 * straight off the repo context with no host check, so the repository must not be silently
 * dropped for self-hosted GitHub Enterprise Server on a custom domain, GitLab, Bitbucket
 * Server, or a plain git server.
 *
 * Remotes are walked in the same priority order as {@link pickRecognizedRemoteUrl} (a lone
 * remote first, then the upstream remote, then `origin`, then the rest).
 *
 * Local remotes are excluded so a user's filesystem layout is never reported: `parseRemoteUrl`
 * admits only ssh, https, and http, which rejects `file://` and bare paths, and loopback
 * hosts are rejected on top of that because scp-style syntax can smuggle a local path through
 * an accepted scheme (`git@localhost:/Users/alice/dev/repo.git`).
 */
function pickFallbackRemoteUrl(repoContext: RepoContext): string | undefined {
	for (const remoteUrl of getOrderedRemoteUrlsFromContext(repoContext)) {
		// `getOrderedRemoteUrlsFromContext` types its result as `Iterable<string>` but reads
		// from `remoteFetchUrls: Array<string | undefined>`, so guard against empty entries.
		if (!remoteUrl) {
			continue;
		}
		const parsed = parseRemoteUrl(remoteUrl);
		if (!parsed || isLoopbackHost(parsed.rawHost)) {
			continue;
		}
		return normalizeFetchUrl(remoteUrl);
	}
	return undefined;
}

/**
 * Whether a host refers to the local machine. `parseRemoteUrl` has already lowercased the
 * host and stripped any port.
 */
function isLoopbackHost(rawHost: string): boolean {
	const host = rawHost.replace(/^\[|\]$/g, '');
	return host === 'localhost'
		|| host.endsWith('.localhost')
		|| host === '::1'
		|| host === '0.0.0.0'
		|| /^127(?:\.\d{1,3}){3}$/.test(host);
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
 * Unlike the remote URL itself, this stays scoped to hosts recognized as GitHub: github.com,
 * `*.ghe.com`, and ssh host aliases that normalize to either (for example `alias-github.com`
 * or `github.com-alias`). Returns undefined for every other host, which notably includes
 * self-hosted GitHub Enterprise Server on a custom domain: telling that apart from an
 * arbitrary git server needs the configured `github-enterprise.uri`, which this module has
 * no access to.
 */
function extractGitHubOrg(remoteUrl: string): string | undefined {
	return getGithubRepoIdFromFetchUrl(remoteUrl)?.org;
}
