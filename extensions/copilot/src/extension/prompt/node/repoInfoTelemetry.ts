/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICopilotTokenStore } from '../../../platform/authentication/common/copilotTokenStore';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IGitDiffService } from '../../../platform/git/common/gitDiffService';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { getOrderedRepoInfosFromContext, IGitService, normalizeFetchUrl, RepoContext, ResolvedRepoRemoteInfo } from '../../../platform/git/common/gitService';
import { Change, Repository } from '../../../platform/git/vscode/git';
import { ILogService } from '../../../platform/log/common/logService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { extUriBiasedIgnorePathCase } from '../../../util/vs/base/common/resources';
import { IWorkspaceFileIndex } from '../../../platform/workspaceChunkSearch/node/workspaceFileIndex';

// Create a mapping for the git status enum to put the actual status string in telemetry
// The enum is a const enum and part of the public git extension API, so the order should stay stable
const STATUS_TO_STRING: Record<number, string> = {
	0: 'INDEX_MODIFIED',
	1: 'INDEX_ADDED',
	2: 'INDEX_DELETED',
	3: 'INDEX_RENAMED',
	4: 'INDEX_COPIED',
	5: 'MODIFIED',
	6: 'DELETED',
	7: 'UNTRACKED',
	8: 'IGNORED',
	9: 'INTENT_TO_ADD',
	10: 'INTENT_TO_RENAME',
	11: 'TYPE_CHANGED',
	12: 'ADDED_BY_US',
	13: 'ADDED_BY_THEM',
	14: 'DELETED_BY_US',
	15: 'DELETED_BY_THEM',
	16: 'BOTH_ADDED',
	17: 'BOTH_DELETED',
	18: 'BOTH_MODIFIED',
};

// Max telemetry payload size is 1MB, we add shared properties in further code and JSON structure overhead to that
// so check our diff JSON size against 900KB to be conservative with space
const MAX_DIFFS_JSON_SIZE = 900 * 1024;

// Max changes to avoid degenerate cases like mass renames
const MAX_CHANGES = 100;

// Max age of the merge base commit in days before we skip the diff
const MAX_MERGE_BASE_AGE_DAYS = 30;

// Max number of commits between merge base and HEAD before we skip the diff
const MAX_DIFF_COMMITS = 30;

// EVENT: repoInfo
type RepoInfoTelemetryResult = 'success' | 'filesChanged' | 'diffTooLarge' | 'noChanges' | 'tooManyChanges' | 'mergeBaseTooOld' | 'virtualFileSystem' | 'tooManyCommits';

type RepoInfoTelemetryProperties = {
	remoteUrl: string | undefined;
	repoId: string | undefined;
	repoType: 'github' | 'ado';
	headCommitHash: string | undefined;
	headBranchName: string | undefined;
	fileRelativePaths: string | undefined;
	diffsJSON: string | undefined;
	result: RepoInfoTelemetryResult;
};

type RepoInfoTelemetryMeasurements = {
	workspaceFileCount: number;
	changedFileCount: number;
	diffSizeBytes: number;
};

type RepoInfoTelemetryData = {
	properties: RepoInfoTelemetryProperties;
	measurements: RepoInfoTelemetryMeasurements;
};

type RepoInfoInternalTelemetryProperties = RepoInfoTelemetryProperties & {
	location: 'begin' | 'end';
	telemetryMessageId: string;
};

// Only send ending telemetry on states where we capture repo info or no changes currently
function shouldSendEndTelemetry(result: RepoInfoTelemetryResult | undefined): boolean {
	return result === 'success' || result === 'noChanges';
}

/*
* Handles sending telemetry about the current git repository.
* Repo metadata and diffsJSON are sent via sendEnhancedGHTelemetryEvent.
* Full repo info is additionally sent for internal users via sendInternalMSFTTelemetryEvent.
*/
export class RepoInfoTelemetry {
	private _beginTelemetrySent = false;
	private _beginTelemetryPromise: Promise<RepoInfoTelemetryData | undefined> | undefined;
	private _beginTelemetryResult: RepoInfoTelemetryResult | undefined;

	constructor(
		private readonly _telemetryMessageId: string,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IGitService private readonly _gitService: IGitService,
		@IGitDiffService private readonly _gitDiffService: IGitDiffService,
		@IGitExtensionService private readonly _gitExtensionService: IGitExtensionService,
		@ILogService private readonly _logService: ILogService,
		@IFileSystemService private readonly _fileSystemService: IFileSystemService,
		@IWorkspaceFileIndex private readonly _workspaceFileIndex: IWorkspaceFileIndex,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICopilotTokenStore private readonly _copilotTokenStore: ICopilotTokenStore,
	) { }

	/*
	* Sends the begin event telemetry, make sure to only send one time, as multiple PanelChatTelemetry instances
	* are created per user request.
	*/
	public async sendBeginTelemetryIfNeeded(): Promise<void> {
		if (this._beginTelemetrySent) {
			// Already sent or in progress
			await this._beginTelemetryPromise;
			return;
		}

		try {
			this._beginTelemetrySent = true;
			this._beginTelemetryPromise = this._sendRepoInfoTelemetry('begin');
			const gitInfo = await this._beginTelemetryPromise;
			this._beginTelemetryResult = gitInfo?.properties.result;
		} catch (error) {
			this._logService.warn(`Failed to send begin repo info telemetry ${error}`);
		}
	}

	/*
	* Sends the end event telemetry
	*/
	public async sendEndTelemetry(): Promise<void> {
		await this._beginTelemetryPromise;

		// Skip end telemetry if begin wasn't successful
		if (!shouldSendEndTelemetry(this._beginTelemetryResult)) {
			return;
		}

		try {
			await this._sendRepoInfoTelemetry('end');
		} catch (error) {
			this._logService.warn(`Failed to send end repo info telemetry ${error}`);
		}
	}

	private async _sendRepoInfoTelemetry(location: 'begin' | 'end'): Promise<RepoInfoTelemetryData | undefined> {
		if (this._configurationService.getConfig(ConfigKey.TeamInternal.DisableRepoInfoTelemetry)) {
			return undefined;
		}

		const repoInfo = await this._getRepoInfoTelemetry();
		if (!repoInfo) {
			return undefined;
		}

		const internalProperties: RepoInfoInternalTelemetryProperties = {
			...repoInfo.properties,
			location,
			telemetryMessageId: this._telemetryMessageId
		};

		const isInternal = !!this._copilotTokenStore.copilotToken?.isInternal;
		if (isInternal) {
			const { headBranchName: _, fileRelativePaths: _2, ...msftProperties } = internalProperties;
			this._telemetryService.sendInternalMSFTTelemetryEvent('request.repoInfo', msftProperties, repoInfo.measurements);
		}
		this._telemetryService.sendEnhancedGHTelemetryEvent('request.repoInfo', internalProperties, repoInfo.measurements);

		return repoInfo;
	}

	private async _resolveRepoContext(): Promise<{ repoContext: RepoContext; repoInfo: ResolvedRepoRemoteInfo; repository: Repository; upstreamCommit: string; headBranchName: string | undefined } | undefined> {
		const repoContext = this._gitService.activeRepository?.get();
		if (!repoContext) {
			return;
		}

		const repoInfo = Array.from(getOrderedRepoInfosFromContext(repoContext))[0];
		if (!repoInfo || !repoInfo.fetchUrl) {
			return;
		}

		const gitAPI = this._gitExtensionService.getExtensionApi();
		const repository = gitAPI?.getRepository(repoContext.rootUri);
		if (!repository) {
			return;
		}

		let upstreamCommit = await repository.getMergeBase('HEAD', '@{upstream}');
		if (!upstreamCommit) {
			const baseBranch = await repository.getBranchBase('HEAD');
			if (baseBranch) {
				const baseRef = `${baseBranch.remote}/${baseBranch.name}`;
				upstreamCommit = await repository.getMergeBase('HEAD', baseRef);
			}
		}

		if (!upstreamCommit) {
			return;
		}

		const headBranchName = repository.state.HEAD?.name;
		return { repoContext, repoInfo, repository, upstreamCommit, headBranchName };
	}

	private async _getRepoInfoTelemetry(): Promise<RepoInfoTelemetryData | undefined> {
		const ctx = await this._resolveRepoContext();
		if (!ctx) {
			return;
		}

		const { repoContext, repoInfo, repository, upstreamCommit, headBranchName } = ctx;
		const normalizedFetchUrl = normalizeFetchUrl(repoInfo.fetchUrl!);

		const skipDiffResult = (result: RepoInfoTelemetryResult): RepoInfoTelemetryData => ({
			properties: {
				remoteUrl: normalizedFetchUrl,
				repoId: repoInfo.repoId.toString(),
				repoType: repoInfo.repoId.type,
				headCommitHash: upstreamCommit,
				headBranchName,
				fileRelativePaths: undefined,
				diffsJSON: undefined,
				result,
			},
			measurements: {
				workspaceFileCount: 0,
				changedFileCount: 0,
				diffSizeBytes: 0,
			}
		});

		// VFS and sparse checkout enlistments are unlikely to have all blobs available locally,
		// making diff operations expensive or impossible. Skip early if either is configured.
		// core.virtualfilesystem is a path to a hook script, any non-empty value means VFS is active.
		// core.sparsecheckout is a git boolean: true/yes/on/1 are truthy per git-config spec.
		// If we can't determine the config, skip to be safe.
		try {
			const virtualFileSystem = await repository.getConfig('core.virtualfilesystem');
			const sparseCheckout = await repository.getConfig('core.sparsecheckout');
			const GIT_TRUE_VALUES = new Set(['true', 'yes', 'on', '1']);
			if (virtualFileSystem || GIT_TRUE_VALUES.has(sparseCheckout.toLowerCase())) {
				return skipDiffResult('virtualFileSystem');
			}
		} catch {
			return skipDiffResult('virtualFileSystem');
		}

		// Check if the merge base commit is too old to avoid expensive diff operations
		// on very stale branches where rename detection can consume many GB of memory.
		// If we can't determine the commit age, treat it as too old to avoid the potentially expensive diff.
		try {
			const mergeBaseCommit = await repository.getCommit(upstreamCommit);
			const ageDays = mergeBaseCommit.commitDate
				? (Date.now() - mergeBaseCommit.commitDate.getTime()) / (1000 * 60 * 60 * 24)
				: undefined;

			if (ageDays === undefined || ageDays > MAX_MERGE_BASE_AGE_DAYS) {
				return skipDiffResult('mergeBaseTooOld');
			}
		} catch {
			return skipDiffResult('mergeBaseTooOld');
		}

		// Check if there are too many commits between the merge base and HEAD.
		// Extensive renames can make even the check for number of changed files expensive, and we are likely to have
		// too big a diff to log anyways
		try {
			const commitLog = await repository.log({ range: `${upstreamCommit}..HEAD`, maxEntries: MAX_DIFF_COMMITS });
			if (commitLog.length >= MAX_DIFF_COMMITS) {
				return skipDiffResult('tooManyCommits');
			}
		} catch {
			return skipDiffResult('tooManyCommits');
		}

		// Before we calculate our async diffs, sign up for file system change events
		// Any changes during the async operations will invalidate our diff data and we send it
		// as a failure without a diffs
		const watcher = this._fileSystemService.createFileSystemWatcher('**/*');
		let filesChanged = false;
		const createDisposable = watcher.onDidCreate(() => filesChanged = true);
		const changeDisposable = watcher.onDidChange(() => filesChanged = true);
		const deleteDisposable = watcher.onDidDelete(() => filesChanged = true);

		try {
			const baseProperties: Omit<RepoInfoTelemetryProperties, 'diffsJSON' | 'fileRelativePaths' | 'result'> = {
				remoteUrl: normalizedFetchUrl,
				repoId: repoInfo.repoId.toString(),
				repoType: repoInfo.repoId.type,
				headCommitHash: upstreamCommit,
				headBranchName,
			};

			// Workspace file index will be used to get a rough count of files in the repository
			// We need to call initialize here to have the count, but after first initialize call
			// further calls are no-ops so only a hit first time.
			await this._workspaceFileIndex.initialize();
			const measurements: RepoInfoTelemetryMeasurements = {
				workspaceFileCount: this._workspaceFileIndex.fileCount,
				changedFileCount: 0, // Will be updated
				diffSizeBytes: 0, // Will be updated
			};

			// Combine our diff against the upstream commit with untracked changes, and working tree changes
			// A change like a new untracked file could end up in either the untracked or working tree changes and won't be in the diffWith.
			const diffChanges = await this._gitService.diffWith(repoContext.rootUri, upstreamCommit) ?? [];

			const changeMap = new Map<string, Change>();

			// Prority to the diffWith changes, then working tree changes, then untracked changes.
			for (const change of diffChanges) {
				changeMap.set(change.uri.toString(), change);
			}
			for (const change of repository.state.workingTreeChanges) {
				if (!changeMap.has(change.uri.toString())) {
					changeMap.set(change.uri.toString(), change);
				}
			}
			for (const change of repository.state.untrackedChanges) {
				if (!changeMap.has(change.uri.toString())) {
					changeMap.set(change.uri.toString(), change);
				}
			}

			const changes = Array.from(changeMap.values());

			if (!changes || changes.length === 0) {
				return {
					properties: { ...baseProperties, fileRelativePaths: undefined, diffsJSON: undefined, result: 'noChanges' },
					measurements
				};
			}
			measurements.changedFileCount = changes.length;

			// Check if there are too many changes (e.g., mass renames)
			if (changes.length > MAX_CHANGES) {
				return {
					properties: { ...baseProperties, fileRelativePaths: undefined, diffsJSON: undefined, result: 'tooManyChanges' },
					measurements
				};
			}

			// Check if files changed during the git diff operation
			if (filesChanged) {
				return {
					properties: { ...baseProperties, fileRelativePaths: undefined, diffsJSON: undefined, result: 'filesChanged' },
					measurements
				};
			}

			const diffs = (await this._gitDiffService.getWorkingTreeDiffsFromRef(repoContext.rootUri, changes, upstreamCommit)).map(diff => {
				return {
					uri: diff.uri.toString(),
					originalUri: diff.originalUri.toString(),
					renameUri: diff.renameUri?.toString(),
					status: STATUS_TO_STRING[diff.status] ?? `UNKNOWN_${diff.status}`,
					diff: diff.diff,
				};
			});

			// Check if files changed during the individual file diffs
			if (filesChanged) {
				return {
					properties: { ...baseProperties, fileRelativePaths: undefined, diffsJSON: undefined, result: 'filesChanged' },
					measurements
				};
			}

			const rootUri = repoContext.rootUri;
			const fileRelativePaths = JSON.stringify(
				changes
					.filter(c => extUriBiasedIgnorePathCase.isEqualOrParent(c.uri, rootUri))
					.map(c => extUriBiasedIgnorePathCase.relativePath(rootUri, c.uri))
					.filter((p): p is string => p !== undefined)
			);

			const diffsJSON = diffs.length > 0 ? JSON.stringify(diffs) : undefined;

			// Check against our size limit to make sure our telemetry fits in the 1MB limit
			if (diffsJSON) {
				const diffSizeBytes = Buffer.byteLength(diffsJSON, 'utf8');
				measurements.diffSizeBytes = diffSizeBytes;

				if (diffSizeBytes > MAX_DIFFS_JSON_SIZE) {
					return {
						properties: { ...baseProperties, fileRelativePaths, diffsJSON: undefined, result: 'diffTooLarge' },
						measurements
					};
				}
			}

			return {
				properties: { ...baseProperties, fileRelativePaths, diffsJSON, result: 'success' },
				measurements
			};
		} finally {
			createDisposable.dispose();
			changeDisposable.dispose();
			deleteDisposable.dispose();
			watcher.dispose();
		}
	}
}
