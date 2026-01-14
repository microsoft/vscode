/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
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

// Max changes to avoid degenerate cases like mass renames
const MAX_CHANGES = 100;

// Max diff size to avoid excessive storage usage (aligned with telemetry limit)
const MAX_DIFFS_SIZE_BYTES = 900 * 1024;

// Number of recent sessions to keep full diffs for
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
 * Merges adjacent/overlapping hunks to produce a valid patch.
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
				hunkLines.push(` ${originalLines[origLineNum - 1]}`);
				origLineNum++;
				origCount++;
				modCount++;
			}

			// Emit deleted lines
			for (let i = origStart; i < origEnd; i++) {
				hunkLines.push(`-${originalLines[i - 1]}`);
				origLineNum++;
				origCount++;
			}

			// Emit added lines
			for (let i = modStart; i < modEnd; i++) {
				hunkLines.push(`+${modifiedLines[i - 1]}`);
				modCount++;
			}
		}

		// Emit trailing context lines
		while (origLineNum <= hunkOrigEnd) {
			hunkLines.push(` ${originalLines[origLineNum - 1]}`);
			origLineNum++;
			origCount++;
			modCount++;
		}

		result.push(`@@ -${hunkOrigStart},${origCount} +${hunkModStart},${modCount} @@`);
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

	// Count total changes across all groups
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

	// Check for no changes
	if (totalChangeCount === 0) {
		return {
			...baseRepoData,
			diffs: undefined,
			diffsStatus: 'noChanges',
			changedFileCount: 0
		};
	}

	// Check for too many changes (degenerate cases like mass renames)
	if (totalChangeCount > MAX_CHANGES) {
		return {
			...baseRepoData,
			diffs: undefined,
			diffsStatus: 'tooManyChanges',
			changedFileCount: totalChangeCount
		};
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

	// Check total size of diffs
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

	private readonly _pendingSessions = new DisposableStore();
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

		this._register(this._pendingSessions);

		// Register configuration for internal users
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
