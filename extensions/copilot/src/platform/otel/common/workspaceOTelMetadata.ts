/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../util/vs/base/common/uri';
import { isEqualOrParent, relativePath } from '../../../util/vs/base/common/resources';
import { getOrderedRepoInfosFromContext, type IGitService, normalizeFetchUrl, type RepoContext } from '../../git/common/gitService';
import { CopilotChatAttr } from './genAiAttributes';

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
	let remoteUrl: string | undefined;
	const repoInfo = Array.from(getOrderedRepoInfosFromContext(repoContext))[0];
	if (repoInfo?.fetchUrl) {
		remoteUrl = normalizeFetchUrl(repoInfo.fetchUrl);
	}

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
 * Convert workspace metadata to OTel attributes, omitting undefined values.
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
	}
	if (metadata.headCommitHash) {
		attrs[CopilotChatAttr.REPO_HEAD_COMMIT_HASH] = metadata.headCommitHash;
	}
	if (metadata.remoteUrl) {
		attrs[CopilotChatAttr.REPO_REMOTE_URL] = metadata.remoteUrl;
	}
	if (metadata.fileRelativePath) {
		attrs[CopilotChatAttr.FILE_RELATIVE_PATH] = metadata.fileRelativePath;
	}
	return attrs;
}
