/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { linesDiffComputers } from '../../../../editor/common/diff/linesDiffComputers.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ISCMService, ISCMResource } from '../../scm/common/scm.js';
import { IChatService } from '../common/chatService/chatService.js';
import { IChatModel, IExportableRepoData, IExportableRepoDiff } from '../common/model/chatModel.js';
/**
 * Regex to match `url = <remote-url>` lines in git config.
 */
const RemoteMatcher = /^\s*url\s*=\s*(.+\S)\s*$/mg;

/**
 * Extracts raw remote URLs from git config content.
 */
function getRawRemotes(text: string): string[] {
	const remotes: string[] = [];
	let match: RegExpExecArray | null;
	while (match = RemoteMatcher.exec(text)) {
		remotes.push(match[1]);
	}
	return remotes;
}

/**
 * Extracts a hostname from a git remote URL.
 *
 * Supports:
 * - URL-like remotes: https://github.com/..., ssh://git@github.com/..., git://github.com/...
 * - SCP-like remotes: git@github.com:owner/repo.git
 */
function getRemoteHost(remoteUrl: string): string | undefined {
	try {
		// Try standard URL parsing first (works for https://, ssh://, git://)
		const url = new URL(remoteUrl);
		return url.hostname.toLowerCase();
	} catch {
		// Fallback for SCP-like syntax: [user@]host:path
		const atIndex = remoteUrl.lastIndexOf('@');
		const hostAndPath = atIndex !== -1 ? remoteUrl.slice(atIndex + 1) : remoteUrl;
		const colonIndex = hostAndPath.indexOf(':');
		if (colonIndex !== -1) {
			const host = hostAndPath.slice(0, colonIndex);
			return host ? host.toLowerCase() : undefined;
		}

		// Fallback for hostname/path format without scheme (e.g., devdiv.visualstudio.com/...)
		const slashIndex = hostAndPath.indexOf('/');
		if (slashIndex !== -1) {
			const host = hostAndPath.slice(0, slashIndex);
			return host ? host.toLowerCase() : undefined;
		}

		return undefined;
	}
}

/**
 * Determines the change type based on SCM resource properties.
 */
function determineChangeType(resource: ISCMResource, groupId: string): 'added' | 'modified' | 'deleted' | 'renamed' {
	const contextValue = resource.contextValue?.toLowerCase() ?? '';
	const groupIdLower = groupId.toLowerCase();

	if (contextValue.includes('untracked') || contextValue.includes('add')) {
		return 'added';
	}
	if (contextValue.includes('delete')) {
		return 'deleted';
	}
	if (contextValue.includes('rename')) {
		return 'renamed';
	}
	if (groupIdLower.includes('untracked')) {
		return 'added';
	}
	if (resource.decorations.strikeThrough) {
		return 'deleted';
	}
	if (!resource.multiDiffEditorOriginalUri) {
		return 'added';
	}
	return 'modified';
}

/**
 * Generates a unified diff string compatible with `git apply`.
 */
async function generateUnifiedDiff(
	fileService: IFileService,
	relPath: string,
	originalUri: URI | undefined,
	modifiedUri: URI,
	changeType: 'added' | 'modified' | 'deleted' | 'renamed'
): Promise<string | undefined> {
	try {
		let originalContent = '';
		let modifiedContent = '';

		if (originalUri && changeType !== 'added') {
			try {
				const originalFile = await fileService.readFile(originalUri);
				originalContent = originalFile.value.toString();
			} catch {
				if (changeType === 'modified') {
					return undefined;
				}
			}
		}

		if (changeType !== 'deleted') {
			try {
				const modifiedFile = await fileService.readFile(modifiedUri);
				modifiedContent = modifiedFile.value.toString();
			} catch {
				return undefined;
			}
		}

		const originalLines = originalContent.split('\n');
		const modifiedLines = modifiedContent.split('\n');
		const diffLines: string[] = [];
		const aPath = changeType === 'added' ? '/dev/null' : `a/${relPath}`;
		const bPath = changeType === 'deleted' ? '/dev/null' : `b/${relPath}`;

		diffLines.push(`--- ${aPath}`);
		diffLines.push(`+++ ${bPath}`);

		if (changeType === 'added') {
			if (modifiedLines.length > 0) {
				diffLines.push(`@@ -0,0 +1,${modifiedLines.length} @@`);
				for (const line of modifiedLines) {
					diffLines.push(`+${line}`);
				}
			}
		} else if (changeType === 'deleted') {
			if (originalLines.length > 0) {
				diffLines.push(`@@ -1,${originalLines.length} +0,0 @@`);
				for (const line of originalLines) {
					diffLines.push(`-${line}`);
				}
			}
		} else {
			const hunks = computeDiffHunks(originalLines, modifiedLines);
			for (const hunk of hunks) {
				diffLines.push(hunk);
			}
		}

		return diffLines.join('\n');
	} catch {
		return undefined;
	}
}

/**
 * Computes unified diff hunks using VS Code's diff algorithm.
 */
function computeDiffHunks(originalLines: string[], modifiedLines: string[]): string[] {
	const contextSize = 3;
	const result: string[] = [];

	const diffComputer = linesDiffComputers.getDefault();
	const diffResult = diffComputer.computeDiff(originalLines, modifiedLines, {
		ignoreTrimWhitespace: false,
		maxComputationTimeMs: 1000,
		computeMoves: false
	});

	if (diffResult.changes.length === 0) {
		return result;
	}

	for (const change of diffResult.changes) {
		const origStart = change.original.startLineNumber;
		const origEnd = change.original.endLineNumberExclusive;
		const modStart = change.modified.startLineNumber;
		const modEnd = change.modified.endLineNumberExclusive;

		const contextOrigStart = Math.max(1, origStart - contextSize);
		const contextOrigEnd = Math.min(originalLines.length, origEnd - 1 + contextSize);
		const contextModStart = Math.max(1, modStart - contextSize);
		const contextModEnd = Math.min(modifiedLines.length, modEnd - 1 + contextSize);

		const hunkLines: string[] = [];

		for (let i = contextOrigStart; i < origStart; i++) {
			hunkLines.push(` ${originalLines[i - 1]}`);
		}
		for (let i = origStart; i < origEnd; i++) {
			hunkLines.push(`-${originalLines[i - 1]}`);
		}
		for (let i = modStart; i < modEnd; i++) {
			hunkLines.push(`+${modifiedLines[i - 1]}`);
		}
		for (let i = origEnd; i <= contextOrigEnd; i++) {
			hunkLines.push(` ${originalLines[i - 1]}`);
		}

		const origCount = (origEnd - origStart) + (origStart - contextOrigStart) + (contextOrigEnd - origEnd + 1);
		const modCount = (modEnd - modStart) + (modStart - contextModStart) + (contextModEnd - modEnd + 1);

		result.push(`@@ -${contextOrigStart},${origCount} +${contextModStart},${modCount} @@`);
		result.push(...hunkLines);
	}

	return result;
}

/**
 * Captures repository state from the first available SCM repository.
 */
export async function captureRepoInfo(scmService: ISCMService, fileService: IFileService): Promise<IExportableRepoData | undefined> {
	const repositories = [...scmService.repositories];
	if (repositories.length === 0) {
		return undefined;
	}

	const repository = repositories[0];
	const rootUri = repository.provider.rootUri;
	if (!rootUri) {
		return undefined;
	}

	// Check if .git exists to determine if this is a git workspace
	let hasGit = false;
	try {
		const gitDirUri = rootUri.with({ path: `${rootUri.path}/.git` });
		hasGit = await fileService.exists(gitDirUri);
	} catch {
		// Ignore errors
	}

	if (!hasGit) {
		// Plain folder - no git
		return {
			workspaceType: 'plain-folder',
			syncStatus: 'no-git',
			diffs: undefined
		};
	}

	// Read remote URL from git config
	let remoteUrl: string | undefined;
	try {
		// TODO: Handle git worktrees where .git is a file pointing to the actual git directory
		const gitConfigUri = rootUri.with({ path: `${rootUri.path}/.git/config` });
		const exists = await fileService.exists(gitConfigUri);
		if (exists) {
			const content = await fileService.readFile(gitConfigUri);
			const remotes = getRawRemotes(content.value.toString());
			remoteUrl = remotes[0];
		}
	} catch {
		// Ignore errors reading git config
	}

	// Get branch and commit info from history provider
	let localBranch: string | undefined;
	let localHeadCommit: string | undefined;
	let remoteTrackingBranch: string | undefined;
	let remoteHeadCommit: string | undefined;
	let remoteBaseBranch: string | undefined;

	const historyProvider = repository.provider.historyProvider?.get();
	if (historyProvider) {
		const historyItemRef = historyProvider.historyItemRef.get();
		localBranch = historyItemRef?.name;
		localHeadCommit = historyItemRef?.revision;

		// Get remote tracking branch info
		const historyItemRemoteRef = historyProvider.historyItemRemoteRef.get();
		if (historyItemRemoteRef) {
			remoteTrackingBranch = historyItemRemoteRef.name;
			remoteHeadCommit = historyItemRemoteRef.revision;
		}

		// Get base branch info (for unpublished branches)
		const historyItemBaseRef = historyProvider.historyItemBaseRef.get();
		if (historyItemBaseRef) {
			remoteBaseBranch = historyItemBaseRef.name;
			// Note: remoteHeadCommit stays undefined if no tracking branch
		}
	}

	// Determine workspace type and sync status
	let workspaceType: IExportableRepoData['workspaceType'];
	let syncStatus: IExportableRepoData['syncStatus'];

	if (!remoteUrl) {
		// Local git only - no remote configured
		workspaceType = 'local-git';
		syncStatus = 'local-only';
	} else {
		workspaceType = 'remote-git';

		if (!remoteTrackingBranch) {
			// Branch has no remote tracking branch
			syncStatus = 'unpublished';
		} else if (localHeadCommit === remoteHeadCommit) {
			// Local HEAD matches remote tracking branch
			syncStatus = 'synced';
		} else {
			// Local has commits not pushed to remote
			syncStatus = 'unpushed';
		}
	}

	// Determine remote vendor from URL
	let remoteVendor: IExportableRepoData['remoteVendor'];
	if (remoteUrl) {
		const host = getRemoteHost(remoteUrl);
		if (host === 'github.com') {
			remoteVendor = 'github';
		} else if (host === 'dev.azure.com' || (host && host.endsWith('.visualstudio.com'))) {
			remoteVendor = 'ado';
		} else {
			remoteVendor = 'other';
		}
	}

	// Collect working tree diffs
	const diffs: IExportableRepoDiff[] = [];
	const diffPromises: Promise<IExportableRepoDiff | undefined>[] = [];

	for (const group of repository.provider.groups) {
		for (const resource of group.resources) {
			const relPath = relativePath(rootUri, resource.sourceUri) ?? resource.sourceUri.path;
			const changeType = determineChangeType(resource, group.id);

			const diffPromise = (async (): Promise<IExportableRepoDiff | undefined> => {
				const unifiedDiff = await generateUnifiedDiff(
					fileService,
					relPath,
					resource.multiDiffEditorOriginalUri,
					resource.sourceUri,
					changeType
				);

				return {
					relativePath: relPath,
					changeType,
					status: group.label || group.id,
					unifiedDiff
				};
			})();

			diffPromises.push(diffPromise);
		}
	}

	const generatedDiffs = await Promise.all(diffPromises);
	for (const diff of generatedDiffs) {
		if (diff) {
			diffs.push(diff);
		}
	}

	return {
		workspaceType,
		syncStatus,
		remoteUrl,
		remoteVendor,
		localBranch,
		remoteTrackingBranch,
		remoteBaseBranch,
		localHeadCommit,
		remoteHeadCommit,
		diffs
	};
}

/**
 * Captures repository information for chat sessions on creation and first message.
 */
export class ChatRepoInfoContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatRepoInfo';

	private readonly _pendingSessions = new DisposableStore();

	constructor(
		@IChatService private readonly chatService: IChatService,
		@ISCMService private readonly scmService: ISCMService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(this._pendingSessions);

		this._register(this.chatService.onDidSubmitRequest(async ({ chatSessionResource }) => {
			const model = this.chatService.getSession(chatSessionResource);
			if (!model) {
				return;
			}
			await this.captureAndSetRepoData(model);
		}));
	}

	private async captureAndSetRepoData(model: IChatModel): Promise<void> {
		if (model.repoData) {
			return;
		}

		try {
			const repoData = await captureRepoInfo(this.scmService, this.fileService);
			if (repoData) {
				model.setRepoData(repoData);
				if (!repoData.localHeadCommit && repoData.workspaceType !== 'plain-folder') {
					this.logService.warn('[ChatRepoInfo] Captured repo data without commit hash - git history may not be ready');
				}
			} else {
				this.logService.debug('[ChatRepoInfo] No SCM repository available for chat session');
			}
		} catch (error) {
			this.logService.warn('[ChatRepoInfo] Failed to capture repo info:', error);
		}
	}
}
