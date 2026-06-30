/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { PullRequestSearchItem } from '../../../platform/github/common/githubAPI';
import { IOctoKitService, PullRequestFile } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { createServiceIdentifier } from '../../../util/common/services';
import { toPRContentUri } from './prContentProvider';

export const IPullRequestFileChangesService = createServiceIdentifier<IPullRequestFileChangesService>('IPullRequestFileChangesService');

export interface IPullRequestFileChangesService {
	readonly _serviceBrand: undefined;
	getFileChangesMultiDiffPart(pullRequest: PullRequestSearchItem): Promise<vscode.ChatResponseMultiDiffPart | undefined>;
	/**
	 * Builds the changed-file list for a branch comparison (`base...head`), used to surface
	 * file changes for cloud tasks that pushed a branch but have no pull request yet.
	 */
	getComparisonChangedFiles(params: { owner: string; repo: string; baseRef: string; headRef: string }): Promise<vscode.ChatSessionChangedFile[] | undefined>;
}

export class PullRequestFileChangesService implements IPullRequestFileChangesService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IOctoKitService private readonly _octoKitService: IOctoKitService,
		@ILogService private readonly logService: ILogService,
	) { }

	async getFileChangesMultiDiffPart(pullRequest: PullRequestSearchItem): Promise<vscode.ChatResponseMultiDiffPart | undefined> {
		try {
			this.logService.trace(`Getting file changes for PR #${pullRequest.number}`);
			const repoOwner = pullRequest.repository.owner.login;
			const repoName = pullRequest.repository.name;

			if (!repoOwner || !repoName) {
				this.logService.warn('No repo ID available for fetching PR file changes');
				return undefined;
			}

			this.logService.trace(`Fetching PR files from ${repoOwner}/${repoName} for PR #${pullRequest.number}`);
			const files = await this._octoKitService.getPullRequestFiles(repoOwner, repoName, pullRequest.number, { createIfNone: { detail: l10n.t('Sign in to GitHub to view pull request file changes.') } });
			this.logService.trace(`Got ${files?.length || 0} files from API`);

			if (!files || files.length === 0) {
				this.logService.trace('No file changes found for pull request');
				return undefined;
			}

			// Check if we have base and head commit SHAs
			if (!pullRequest.baseRefOid || !pullRequest.headRefOid) {
				this.logService.warn('PR missing base or head commit SHA, cannot create diff URIs');
				return undefined;
			}

			const diffEntries: vscode.ChatResponseDiffEntry[] = files.map(file => {
				const { goToFileUri, originalUri, modifiedUri } = this.buildFileDiffUris(file, {
					owner: repoOwner,
					repo: repoName,
					prNumber: pullRequest.number,
					baseSha: pullRequest.baseRefOid!,
					headSha: pullRequest.headRefOid!,
				});
				return { originalUri, modifiedUri, goToFileUri, added: file.additions, removed: file.deletions };
			});

			const title = `Changes in Pull Request #${pullRequest.number}`;
			return new vscode.ChatResponseMultiDiffPart(diffEntries, title, false);
		} catch (error) {
			this.logService.error(`Failed to get file changes multi diff part: ${error}`);
			return undefined;
		}
	}

	/**
	 * Builds the changed-file list for a branch comparison (`base...head`) — used to surface
	 * file changes for cloud tasks that pushed a branch but have no pull request yet. Mirrors
	 * the PR path, but sources the file list (and the bounding commit SHAs) from the GitHub
	 * compare API instead of a pull request.
	 */
	async getComparisonChangedFiles(params: { owner: string; repo: string; baseRef: string; headRef: string }): Promise<vscode.ChatSessionChangedFile[] | undefined> {
		const { owner, repo, baseRef, headRef } = params;
		try {
			const comparison = await this._octoKitService.compareCommits(owner, repo, baseRef, headRef, { createIfNone: { detail: l10n.t('Sign in to GitHub to view file changes.') } });
			if (!comparison || comparison.files.length === 0) {
				return undefined;
			}
			return comparison.files.map(file => {
				const { goToFileUri, originalUri, modifiedUri } = this.buildFileDiffUris(file, { owner, repo, baseSha: comparison.baseSha, headSha: comparison.headSha });
				return new vscode.ChatSessionChangedFile(goToFileUri, originalUri, modifiedUri, file.additions, file.deletions);
			});
		} catch (error) {
			this.logService.error(`Failed to get comparison changed files for ${owner}/${repo} ${baseRef}...${headRef}: ${error}`);
			return undefined;
		}
	}

	/**
	 * Builds the base/head/go-to content URIs for one changed file. Both sides use remote
	 * `copilot-pr` URIs so we always show the exact remote content regardless of the local
	 * checkout. Shared by the pull-request and branch-comparison paths.
	 */
	private buildFileDiffUris(
		file: PullRequestFile,
		ctx: { owner: string; repo: string; prNumber?: number; baseSha: string; headSha: string },
	): { goToFileUri: vscode.Uri; originalUri?: vscode.Uri; modifiedUri?: vscode.Uri } {
		const { owner, repo, prNumber, baseSha, headSha } = ctx;
		const goToFileUri = toPRContentUri(file.filename, { owner, repo, prNumber, commitSha: headSha, isBase: false, status: file.status });
		const originalUri = file.status !== 'added'
			? toPRContentUri(file.previous_filename || file.filename, { owner, repo, prNumber, commitSha: baseSha, isBase: true, previousFileName: file.previous_filename, status: file.status })
			: undefined;
		const modifiedUri = file.status !== 'removed' ? goToFileUri : undefined;
		return { goToFileUri, originalUri, modifiedUri };
	}
}
