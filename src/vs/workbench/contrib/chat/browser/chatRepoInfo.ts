/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { linesDiffComputers } from '../../../../editor/common/diff/linesDiffComputers.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ISCMService, ISCMResource } from '../../scm/common/scm.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ChatConfiguration } from '../common/constants.js';
import { IChatModel, IExportableRepoData, IExportableRepoDiff } from '../common/model/chatModel.js';
import * as nls from '../../../../nls.js';

const MAX_CHANGES = 100;
const MAX_DIFFS_SIZE_BYTES = 900 * 1024;
const MAX_SESSIONS_WITH_FULL_DIFFS = 5;
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
 *
 * Note: This implementation has a known limitation - if the only change between
 * files is the presence/absence of a trailing newline (content otherwise identical),
 * no diff will be generated because VS Code's diff algorithm treats the lines as equal.
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

		// Track whether files end with newline for git apply compatibility
		// split('\n') on "line1\nline2\n" gives ["line1", "line2", ""]
		// split('\n') on "line1\nline2" gives ["line1", "line2"]
		const originalEndsWithNewline = originalContent.length > 0 && originalContent.endsWith('\n');
		const modifiedEndsWithNewline = modifiedContent.length > 0 && modifiedContent.endsWith('\n');

		// Remove trailing empty element if file ends with newline
		if (originalEndsWithNewline && originalLines.length > 0 && originalLines[originalLines.length - 1] === '') {
			originalLines.pop();
		}
		if (modifiedEndsWithNewline && modifiedLines.length > 0 && modifiedLines[modifiedLines.length - 1] === '') {
			modifiedLines.pop();
		}

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
				if (!modifiedEndsWithNewline) {
					diffLines.push('\\ No newline at end of file');
				}
			}
		} else if (changeType === 'deleted') {
			if (originalLines.length > 0) {
				diffLines.push(`@@ -1,${originalLines.length} +0,0 @@`);
				for (const line of originalLines) {
					diffLines.push(`-${line}`);
				}
				if (!originalEndsWithNewline) {
					diffLines.push('\\ No newline at end of file');
				}
			}
		} else {
			const hunks = computeDiffHunks(originalLines, modifiedLines, originalEndsWithNewline, modifiedEndsWithNewline);
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
 * Merges adjacent/overlapping hunks to produce a valid patch.
 */
function computeDiffHunks(
	originalLines: string[],
	modifiedLines: string[],
	originalEndsWithNewline: boolean,
	modifiedEndsWithNewline: boolean
): string[] {
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

	// Group changes that should be merged into the same hunk
	// Changes are merged if their context regions would overlap
	type Change = typeof diffResult.changes[number];
	const hunkGroups: Change[][] = [];
	let currentGroup: Change[] = [];

	for (const change of diffResult.changes) {
		if (currentGroup.length === 0) {
			currentGroup.push(change);
		} else {
			const lastChange = currentGroup[currentGroup.length - 1];
			const lastContextEnd = lastChange.original.endLineNumberExclusive - 1 + contextSize;
			const currentContextStart = change.original.startLineNumber - contextSize;

			// Merge if context regions overlap or are adjacent
			if (currentContextStart <= lastContextEnd + 1) {
				currentGroup.push(change);
			} else {
				hunkGroups.push(currentGroup);
				currentGroup = [change];
			}
		}
	}
	if (currentGroup.length > 0) {
		hunkGroups.push(currentGroup);
	}

	// Generate a single hunk for each group
	for (const group of hunkGroups) {
		const firstChange = group[0];
		const lastChange = group[group.length - 1];

		const hunkOrigStart = Math.max(1, firstChange.original.startLineNumber - contextSize);
		const hunkOrigEnd = Math.min(originalLines.length, lastChange.original.endLineNumberExclusive - 1 + contextSize);
		const hunkModStart = Math.max(1, firstChange.modified.startLineNumber - contextSize);

		const hunkLines: string[] = [];
		// Track which line in hunkLines corresponds to the last line of each file
		let lastOriginalLineIndex = -1;
		let lastModifiedLineIndex = -1;

		let origLineNum = hunkOrigStart;
		let origCount = 0;
		let modCount = 0;

		// Process each change in the group, emitting context lines between them
		for (const change of group) {
			const origStart = change.original.startLineNumber;
			const origEnd = change.original.endLineNumberExclusive;
			const modStart = change.modified.startLineNumber;
			const modEnd = change.modified.endLineNumberExclusive;

			// Emit context lines before this change
			while (origLineNum < origStart) {
				const idx = hunkLines.length;
				hunkLines.push(` ${originalLines[origLineNum - 1]}`);
				// Context lines are in both files
				if (origLineNum === originalLines.length) {
					lastOriginalLineIndex = idx;
				}
				const modLineNum = hunkModStart + modCount;
				if (modLineNum === modifiedLines.length) {
					lastModifiedLineIndex = idx;
				}
				origLineNum++;
				origCount++;
				modCount++;
			}

			// Emit deleted lines
			for (let i = origStart; i < origEnd; i++) {
				const idx = hunkLines.length;
				hunkLines.push(`-${originalLines[i - 1]}`);
				if (i === originalLines.length) {
					lastOriginalLineIndex = idx;
				}
				origLineNum++;
				origCount++;
			}

			// Emit added lines
			for (let i = modStart; i < modEnd; i++) {
				const idx = hunkLines.length;
				hunkLines.push(`+${modifiedLines[i - 1]}`);
				if (i === modifiedLines.length) {
					lastModifiedLineIndex = idx;
				}
				modCount++;
			}
		}

		// Emit trailing context lines
		while (origLineNum <= hunkOrigEnd) {
			const idx = hunkLines.length;
			hunkLines.push(` ${originalLines[origLineNum - 1]}`);
			// Context lines are in both files
			if (origLineNum === originalLines.length) {
				lastOriginalLineIndex = idx;
			}
			const modLineNum = hunkModStart + modCount;
			if (modLineNum === modifiedLines.length) {
				lastModifiedLineIndex = idx;
			}
			origLineNum++;
			origCount++;
			modCount++;
		}

		result.push(`@@ -${hunkOrigStart},${origCount} +${hunkModStart},${modCount} @@`);

		// Add "No newline at end of file" markers for git apply compatibility
		// The marker must appear immediately after the line that lacks a newline
		for (let i = 0; i < hunkLines.length; i++) {
			result.push(hunkLines[i]);

			const isLastOriginal = i === lastOriginalLineIndex;
			const isLastModified = i === lastModifiedLineIndex;

			if (isLastOriginal && isLastModified) {
				// Context line is the last line of both files
				// If either lacks newline, we need a marker (but only one)
				if (!originalEndsWithNewline || !modifiedEndsWithNewline) {
					result.push('\\ No newline at end of file');
				}
			} else if (isLastOriginal && !originalEndsWithNewline) {
				// Deletion or context line that's only the last of original
				result.push('\\ No newline at end of file');
			} else if (isLastModified && !modifiedEndsWithNewline) {
				// Addition or context line that's only the last of modified
				result.push('\\ No newline at end of file');
			}
		}
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

	let hasGit = false;
	try {
		const gitDirUri = rootUri.with({ path: `${rootUri.path}/.git` });
		hasGit = await fileService.exists(gitDirUri);
	} catch {
		// ignore
	}

	if (!hasGit) {
		return {
			workspaceType: 'plain-folder',
			syncStatus: 'no-git',
			diffs: undefined
		};
	}

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
		// ignore
	}

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

		const historyItemRemoteRef = historyProvider.historyItemRemoteRef.get();
		if (historyItemRemoteRef) {
			remoteTrackingBranch = historyItemRemoteRef.name;
			remoteHeadCommit = historyItemRemoteRef.revision;
		}

		const historyItemBaseRef = historyProvider.historyItemBaseRef.get();
		if (historyItemBaseRef) {
			remoteBaseBranch = historyItemBaseRef.name;
		}
	}

	let workspaceType: IExportableRepoData['workspaceType'];
	let syncStatus: IExportableRepoData['syncStatus'];

	if (!remoteUrl) {
		workspaceType = 'local-git';
		syncStatus = 'local-only';
	} else {
		workspaceType = 'remote-git';

		if (!remoteTrackingBranch) {
			syncStatus = 'unpublished';
		} else if (localHeadCommit === remoteHeadCommit) {
			syncStatus = 'synced';
		} else {
			syncStatus = 'unpushed';
		}
	}

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

	let totalChangeCount = 0;
	for (const group of repository.provider.groups) {
		totalChangeCount += group.resources.length;
	}

	const baseRepoData: Omit<IExportableRepoData, 'diffs' | 'diffsStatus' | 'changedFileCount'> = {
		workspaceType,
		syncStatus,
		remoteUrl,
		remoteVendor,
		localBranch,
		remoteTrackingBranch,
		remoteBaseBranch,
		localHeadCommit,
		remoteHeadCommit,
	};

	if (totalChangeCount === 0) {
		return {
			...baseRepoData,
			diffs: undefined,
			diffsStatus: 'noChanges',
			changedFileCount: 0
		};
	}

	if (totalChangeCount > MAX_CHANGES) {
		return {
			...baseRepoData,
			diffs: undefined,
			diffsStatus: 'tooManyChanges',
			changedFileCount: totalChangeCount
		};
	}

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

	const diffsJson = JSON.stringify(diffs);
	const diffsSizeBytes = new TextEncoder().encode(diffsJson).length;

	if (diffsSizeBytes > MAX_DIFFS_SIZE_BYTES) {
		return {
			...baseRepoData,
			diffs: undefined,
			diffsStatus: 'tooLarge',
			changedFileCount: totalChangeCount
		};
	}

	return {
		...baseRepoData,
		diffs,
		diffsStatus: 'included',
		changedFileCount: totalChangeCount
	};
}

/**
 * Captures repository information for chat sessions on creation and first message.
 */
export class ChatRepoInfoContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatRepoInfo';

	private _configurationRegistered = false;

	constructor(
		@IChatService private readonly chatService: IChatService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ISCMService private readonly scmService: ISCMService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.registerConfigurationIfInternal();
		this._register(this.chatEntitlementService.onDidChangeEntitlement(() => {
			this.registerConfigurationIfInternal();
		}));

		this._register(this.chatService.onDidSubmitRequest(async ({ chatSessionResource }) => {
			const model = this.chatService.getSession(chatSessionResource);
			if (!model) {
				return;
			}
			await this.captureAndSetRepoData(model);
		}));
	}

	private registerConfigurationIfInternal(): void {
		if (this._configurationRegistered) {
			return;
		}

		if (!this.chatEntitlementService.isInternal) {
			return;
		}

		const registry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
		registry.registerConfiguration({
			id: 'chatRepoInfo',
			title: nls.localize('chatRepoInfoConfigurationTitle', "Chat Repository Info"),
			type: 'object',
			properties: {
				[ChatConfiguration.RepoInfoEnabled]: {
					type: 'boolean',
					description: nls.localize('chat.repoInfo.enabled', "Controls whether repository information (branch, commit, working tree diffs) is captured at the start of chat sessions for internal diagnostics."),
					default: true,
				}
			}
		});

		this._configurationRegistered = true;
		this.logService.debug('[ChatRepoInfo] Configuration registered for internal user');
	}

	private async captureAndSetRepoData(model: IChatModel): Promise<void> {
		if (!this.chatEntitlementService.isInternal) {
			return;
		}

		// Check if repo info capture is enabled via configuration
		if (!this.configurationService.getValue<boolean>(ChatConfiguration.RepoInfoEnabled)) {
			return;
		}

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

				// Trim diffs from older sessions to manage storage
				this.trimOldSessionDiffs();
			} else {
				this.logService.debug('[ChatRepoInfo] No SCM repository available for chat session');
			}
		} catch (error) {
			this.logService.warn('[ChatRepoInfo] Failed to capture repo info:', error);
		}
	}

	/**
	 * Trims diffs from older sessions, keeping full diffs only for the most recent sessions.
	 */
	private trimOldSessionDiffs(): void {
		try {
			// Get all sessions with repoData that has diffs
			const sessionsWithDiffs: { model: IChatModel; timestamp: number }[] = [];

			for (const model of this.chatService.chatModels.get()) {
				if (model.repoData?.diffs && model.repoData.diffs.length > 0 && model.repoData.diffsStatus === 'included') {
					sessionsWithDiffs.push({ model, timestamp: model.timestamp });
				}
			}

			// Sort by timestamp descending (most recent first)
			sessionsWithDiffs.sort((a, b) => b.timestamp - a.timestamp);

			// Trim diffs from sessions beyond the limit
			for (let i = MAX_SESSIONS_WITH_FULL_DIFFS; i < sessionsWithDiffs.length; i++) {
				const { model } = sessionsWithDiffs[i];
				if (model.repoData) {
					const trimmedRepoData: IExportableRepoData = {
						...model.repoData,
						diffs: undefined,
						diffsStatus: 'trimmedForStorage'
					};
					model.setRepoData(trimmedRepoData);
					this.logService.trace(`[ChatRepoInfo] Trimmed diffs from older session: ${model.sessionResource.toString()}`);
				}
			}
		} catch (error) {
			this.logService.warn('[ChatRepoInfo] Failed to trim old session diffs:', error);
		}
	}
}
