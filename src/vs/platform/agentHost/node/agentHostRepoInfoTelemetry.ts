/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import type { ISessionFileDiff } from '../common/state/sessionState.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import type { AgentHostRepoInfoResult, AgentHostTelemetryReporter } from './agentHostTelemetryReporter.js';
import type { IAgentHostRestrictedTelemetryContext } from './agentHostRestrictedTelemetry.js';

const MAX_DIFFS_JSON_BYTES = 900 * 1024;
const MAX_DIFFS_JSON_CHARS = 50 * 8192;
const MAX_CHANGES = 100;
const MAX_MERGE_BASE_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DIFF_COMMITS = 30;
const DIFF_PATCH_CONCURRENCY = 4;
const MAX_DIFF_SIZE = 100_000;

interface IRepoInfoContext extends IResolvedRepoInfoRemote {
	readonly headCommitHash: string;
	readonly headBranchName: string | undefined;
}

interface IRepoInfoFileDescriptor {
	readonly uri: string;
	readonly originalUri: string;
	readonly renameUri: string | undefined;
	readonly status: 'INDEX_ADDED' | 'MODIFIED' | 'DELETED' | 'INDEX_RENAMED' | 'UNTRACKED';
	readonly oldPath: string | undefined;
	readonly newPath: string | undefined;
}

type RepoInfoTelemetryReporter = Pick<AgentHostTelemetryReporter, 'reportRepoInfo'>;

export interface IResolvedRepoInfoRemote {
	readonly remoteUrl: string;
	readonly repoId: string;
	readonly repoType: 'github' | 'ado';
}

/** Resolves a GitHub, GitHub Enterprise, or Azure DevOps fetch URL. */
export function resolveRepoInfoRemote(remoteUrl: string, enterpriseHost: string | undefined): IResolvedRepoInfoRemote | undefined {
	const scpMatch = remoteUrl.includes('://') ? undefined : /^(?:[^@\s]+@)?(?<host>[^:\s]+):(?<path>.+)$/.exec(remoteUrl);
	let host: string;
	let path: string;
	let normalizedRemoteUrl: string;
	if (scpMatch?.groups) {
		host = scpMatch.groups['host'];
		path = scpMatch.groups['path'];
		normalizedRemoteUrl = `https://${host}/${path}`;
	} else {
		let parsed: URL;
		try {
			parsed = new URL(remoteUrl);
		} catch {
			return undefined;
		}
		host = parsed.host;
		path = parsed.pathname;
		normalizedRemoteUrl = `https://${host}${path}`;
	}

	const normalizedHost = host.toLowerCase();
	const normalizedHostname = normalizedHost.replace(/:\d+$/, '');
	const normalizedPath = path.replace(/^\/+|\/+$/g, '');
	if (normalizedHostname === 'github.com' || normalizedHost === enterpriseHost?.toLowerCase() || normalizedHostname === 'ghe.com' || normalizedHostname.endsWith('.ghe.com')) {
		const match = /^(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath);
		if (!match?.groups) {
			return undefined;
		}
		return {
			remoteUrl: normalizedRemoteUrl,
			repoId: `${match.groups['owner']}/${match.groups['repo']}`.toLowerCase(),
			repoType: 'github',
		};
	}

	let adoMatch: RegExpExecArray | null = null;
	if (normalizedHostname === 'dev.azure.com') {
		adoMatch = /^(?<org>[^/]+)\/(?<project>[^/]+)\/_git\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath);
	} else if (normalizedHostname === 'ssh.dev.azure.com') {
		adoMatch = /^v3\/(?<org>[^/]+)\/(?<project>[^/]+)\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath);
	} else if (normalizedHostname.endsWith('.visualstudio.com')) {
		adoMatch = /^v3\/(?<org>[^/]+)\/(?<project>[^/]+)\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath)
			?? /^(?:[^/]+\/)?(?<project>[^/]+)\/_git\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath);
		if (adoMatch?.groups && !adoMatch.groups['org']) {
			adoMatch.groups['org'] = normalizedHostname.substring(0, normalizedHostname.length - '.visualstudio.com'.length);
		}
	}
	if (!adoMatch?.groups?.['org'] || !adoMatch.groups['project'] || !adoMatch.groups['repo']) {
		return undefined;
	}
	return {
		remoteUrl: normalizedRemoteUrl,
		repoId: `${adoMatch.groups['org']}/${adoMatch.groups['project']}/${adoMatch.groups['repo']}`.toLowerCase(),
		repoType: 'ado',
	};
}

/** Measures a serialized diff payload using the two limits applied by the legacy extension. */
export function measureRepoInfoDiffsJSON(diffsJSON: string): { readonly diffSizeBytes: number; readonly tooLarge: boolean } {
	const diffSizeBytes = Buffer.byteLength(diffsJSON, 'utf8');
	return {
		diffSizeBytes,
		tooLarge: diffSizeBytes > MAX_DIFFS_JSON_BYTES || diffsJSON.length > MAX_DIFFS_JSON_CHARS,
	};
}

export class AgentHostRepoInfoTelemetry extends Disposable {
	private readonly _beginResults = new Map<string, Promise<AgentHostRepoInfoResult | undefined>>();
	private _isDisposed = false;

	constructor(
		private readonly _reporter: RepoInfoTelemetryReporter,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async reportBegin(context: IAgentHostRestrictedTelemetryContext, sessionUri: string, telemetryMessageId: string, workingDirectory: URI | undefined, baseBranch: string | undefined, isContextCurrent: () => boolean): Promise<void> {
		let result = this._beginResults.get(telemetryMessageId);
		if (!result) {
			result = this._captureSafely(context, sessionUri, telemetryMessageId, 'begin', workingDirectory, baseBranch, isContextCurrent);
			this._beginResults.set(telemetryMessageId, result);
		}
		await result;
	}

	async reportEnd(context: IAgentHostRestrictedTelemetryContext, sessionUri: string, telemetryMessageId: string, workingDirectory: URI | undefined, baseBranch: string | undefined, isContextCurrent: () => boolean): Promise<void> {
		const begin = this._beginResults.get(telemetryMessageId);
		if (!begin) {
			return;
		}
		try {
			const beginResult = await begin;
			if (beginResult === 'success' || beginResult === 'noChanges') {
				await this._captureSafely(context, sessionUri, telemetryMessageId, 'end', workingDirectory, baseBranch, isContextCurrent);
			}
		} finally {
			this._beginResults.delete(telemetryMessageId);
		}
	}

	clearTurn(telemetryMessageId: string): void {
		this._beginResults.delete(telemetryMessageId);
	}

	override dispose(): void {
		this._isDisposed = true;
		this._beginResults.clear();
		super.dispose();
	}

	private async _captureSafely(context: IAgentHostRestrictedTelemetryContext, sessionUri: string, telemetryMessageId: string, location: 'begin' | 'end', workingDirectory: URI | undefined, baseBranch: string | undefined, isContextCurrent: () => boolean): Promise<AgentHostRepoInfoResult | undefined> {
		try {
			return await this._capture(context, sessionUri, telemetryMessageId, location, workingDirectory, baseBranch, isContextCurrent);
		} catch (error) {
			this._logService.warn(`[AgentHostRepoInfoTelemetry] Failed to capture ${location} repo info: ${error instanceof Error ? error.message : String(error)}`);
			return undefined;
		}
	}

	private async _capture(telemetryContext: IAgentHostRestrictedTelemetryContext, sessionUri: string, telemetryMessageId: string, location: 'begin' | 'end', workingDirectory: URI | undefined, persistedBaseBranch: string | undefined, isContextCurrent: () => boolean): Promise<AgentHostRepoInfoResult | undefined> {
		if (!workingDirectory || !isContextCurrent() || (!telemetryContext.restrictedTelemetryEnabled && !telemetryContext.isInternal)) {
			return undefined;
		}

		const [gitState, untrackedPaths] = await Promise.all([
			this._gitService.getSessionGitState(workingDirectory),
			this._gitService.getUntrackedPaths(workingDirectory),
		]);
		const upstreamRemote = gitState?.upstreamBranchName?.split('/')[0];
		const fetchRemoteUrls = await this._gitService.getFetchRemoteUrls(workingDirectory, upstreamRemote);
		const remote = fetchRemoteUrls
			?.map(url => resolveRepoInfoRemote(url, this._gitHubEndpointService.getEnterpriseHost()))
			.find((candidate): candidate is IResolvedRepoInfoRemote => candidate !== undefined);
		if (!remote) {
			return undefined;
		}

		const baseBranch = persistedBaseBranch ?? gitState?.upstreamBranchName ?? gitState?.baseBranchName ?? (await this._gitService.getDefaultBranch(workingDirectory))?.name;
		const [headBranchName, headCommitHash] = await Promise.all([
			gitState?.branchName ? Promise.resolve(gitState.branchName) : this._gitService.getCurrentBranch(workingDirectory),
			this._gitService.resolveBranchBaselineCommit(workingDirectory, baseBranch),
		]);
		if (!headCommitHash) {
			return undefined;
		}
		const repoInfo: IRepoInfoContext = { ...remote, headCommitHash, headBranchName };
		const safety = await this._gitService.getBranchDiffSafetyInfo(workingDirectory, headCommitHash);
		if (!safety) {
			return undefined;
		}
		if (safety.hasVirtualFileSystem) {
			return this._report(telemetryContext, isContextCurrent, telemetryMessageId, location, repoInfo, 'virtualFileSystem', 0, 0, 0);
		}
		if (safety.baselineCommitTimestamp === undefined || Date.now() - safety.baselineCommitTimestamp > MAX_MERGE_BASE_AGE_MS) {
			return this._report(telemetryContext, isContextCurrent, telemetryMessageId, location, repoInfo, 'mergeBaseTooOld', 0, 0, 0);
		}
		if (safety.commitCount === undefined || safety.commitCount >= MAX_DIFF_COMMITS) {
			return this._report(telemetryContext, isContextCurrent, telemetryMessageId, location, repoInfo, 'tooManyCommits', 0, 0, 0);
		}
		const tree = await this._gitService.captureWorkingTreeAsTree(workingDirectory);
		if (!tree) {
			return undefined;
		}

		const fileDiffs = await this._gitService.computeFileDiffsBetweenRefs(workingDirectory, {
			sessionUri,
			fromRef: headCommitHash,
			toRef: tree,
		});
		if (!fileDiffs) {
			return undefined;
		}
		if (fileDiffs.length === 0) {
			return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, location, repoInfo, workingDirectory, tree, 'noChanges', safety.workspaceFileCount, 0, 0);
		}
		if (fileDiffs.length > MAX_CHANGES) {
			return this._report(telemetryContext, isContextCurrent, telemetryMessageId, location, repoInfo, 'tooManyChanges', safety.workspaceFileCount, fileDiffs.length, 0);
		}

		const repositoryRoot = await this._gitService.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}
		const untracked = new Set(untrackedPaths ?? []);
		const descriptors = fileDiffs.map(diff => this._describeFileDiff(repositoryRoot, diff, untracked));
		if (descriptors.some(descriptor => descriptor === undefined)) {
			return undefined;
		}
		const resolvedDescriptors = descriptors as IRepoInfoFileDescriptor[];
		const fileRelativePaths = JSON.stringify([...new Set(resolvedDescriptors.map(descriptor => descriptor.newPath ?? descriptor.oldPath).filter((path): path is string => path !== undefined))]);
		// The SDK does not expose per-path exclusion decisions yet, so withhold patch content unless exclusion is explicitly disabled.
		if (telemetryContext.copilotIgnoreEnabled !== false) {
			return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, location, repoInfo, workingDirectory, tree, 'success', safety.workspaceFileCount, fileDiffs.length, 0, fileRelativePaths);
		}
		let patchTooLarge = false;
		const limiter = new Limiter<{ readonly uri: string; readonly originalUri: string; readonly renameUri: string | undefined; readonly status: string; readonly diff: string }>(DIFF_PATCH_CONCURRENCY);
		const diffs = await Promise.all(resolvedDescriptors.map(descriptor => limiter.queue(async () => {
			const paths = [descriptor.oldPath, descriptor.newPath].filter((path): path is string => path !== undefined);
			const result = await this._gitService.getDiffPatchBetweenRefs(workingDirectory, { fromRef: headCommitHash, toRef: tree, paths, maxBuffer: MAX_DIFFS_JSON_BYTES });
			if (!result) {
				throw new Error(`Failed to compute diff for ${paths.join(', ')}`);
			}
			if (result.tooLarge) {
				patchTooLarge = true;
			}
			return {
				uri: descriptor.uri,
				originalUri: descriptor.originalUri,
				renameUri: descriptor.renameUri,
				status: descriptor.status,
				diff: truncateRepoInfoDiff(result.patch ?? '', descriptor.uri),
			};
		})));
		if (patchTooLarge) {
			return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, location, repoInfo, workingDirectory, tree, 'diffTooLarge', safety.workspaceFileCount, fileDiffs.length, MAX_DIFFS_JSON_BYTES + 1, fileRelativePaths);
		}
		const diffsJSON = JSON.stringify(diffs);
		const measurement = measureRepoInfoDiffsJSON(diffsJSON);
		if (measurement.tooLarge) {
			return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, location, repoInfo, workingDirectory, tree, 'diffTooLarge', safety.workspaceFileCount, fileDiffs.length, measurement.diffSizeBytes, fileRelativePaths);
		}
		return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, location, repoInfo, workingDirectory, tree, 'success', safety.workspaceFileCount, fileDiffs.length, measurement.diffSizeBytes, fileRelativePaths, diffsJSON);
	}

	private async _reportIfTreeUnchanged(telemetryContext: IAgentHostRestrictedTelemetryContext, isContextCurrent: () => boolean, telemetryMessageId: string, location: 'begin' | 'end', repoInfo: IRepoInfoContext, workingDirectory: URI, capturedTree: string, stableResult: 'success' | 'noChanges' | 'diffTooLarge', workspaceFileCount: number, changedFileCount: number, diffSizeBytes: number, fileRelativePaths?: string, diffsJSON?: string): Promise<AgentHostRepoInfoResult> {
		const currentTree = await this._gitService.captureWorkingTreeAsTree(workingDirectory);
		if (!currentTree || currentTree !== capturedTree) {
			return this._report(telemetryContext, isContextCurrent, telemetryMessageId, location, repoInfo, 'filesChanged', workspaceFileCount, changedFileCount, 0);
		}
		return this._report(telemetryContext, isContextCurrent, telemetryMessageId, location, repoInfo, stableResult, workspaceFileCount, changedFileCount, diffSizeBytes, fileRelativePaths, diffsJSON);
	}

	private _describeFileDiff(repositoryRoot: URI, diff: ISessionFileDiff, untrackedPaths: ReadonlySet<string>): IRepoInfoFileDescriptor | undefined {
		const beforeUri = diff.before?.uri;
		const afterUri = diff.after?.uri;
		const oldPath = beforeUri ? relativePath(repositoryRoot, URI.parse(beforeUri)) : undefined;
		const newPath = afterUri ? relativePath(repositoryRoot, URI.parse(afterUri)) : undefined;
		if ((!oldPath && !newPath) || (!beforeUri && !afterUri)) {
			return undefined;
		}
		const uri = afterUri ?? beforeUri!;
		let status: IRepoInfoFileDescriptor['status'];
		if (!beforeUri) {
			status = newPath && untrackedPaths.has(newPath) ? 'UNTRACKED' : 'INDEX_ADDED';
		} else if (!afterUri) {
			status = 'DELETED';
		} else if (beforeUri !== afterUri) {
			status = 'INDEX_RENAMED';
		} else {
			status = 'MODIFIED';
		}
		return {
			uri,
			originalUri: beforeUri ?? uri,
			renameUri: status === 'INDEX_RENAMED' ? afterUri : undefined,
			status,
			oldPath,
			newPath,
		};
	}

	private _report(telemetryContext: IAgentHostRestrictedTelemetryContext, isContextCurrent: () => boolean, telemetryMessageId: string, location: 'begin' | 'end', repoInfo: IRepoInfoContext, result: AgentHostRepoInfoResult, workspaceFileCount: number, changedFileCount: number, diffSizeBytes: number, fileRelativePaths?: string, diffsJSON?: string): AgentHostRepoInfoResult {
		if (this._isDisposed || !isContextCurrent()) {
			return result;
		}
		this._reporter.reportRepoInfo(telemetryContext, {
			telemetryMessageId,
			location,
			remoteUrl: repoInfo.remoteUrl,
			repoId: repoInfo.repoId,
			repoType: repoInfo.repoType,
			headCommitHash: repoInfo.headCommitHash,
			headBranchName: repoInfo.headBranchName,
			fileRelativePaths,
			diffsJSON,
			result,
			isActiveRepository: 'true',
			workspaceFileCount,
			changedFileCount,
			diffSizeBytes,
		});
		return result;
	}
}

function truncateRepoInfoDiff(diff: string, uri: string): string {
	if (diff.length <= MAX_DIFF_SIZE) {
		return diff;
	}
	return `${diff.substring(0, MAX_DIFF_SIZE)}\n... Diff truncated (exceeded ${MAX_DIFF_SIZE} characters) for ${uri}`;
}