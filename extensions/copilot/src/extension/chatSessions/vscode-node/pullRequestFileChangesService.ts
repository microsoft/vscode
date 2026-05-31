/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { PullRequestSearchItem } from '../../../platform/github/common/githubAPI';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { ILogService } from '../../../platform/log/common/logService';
import { createServiceIdentifier } from '../../../util/common/services';
import { toPRContentUri } from './prContentProvider';

export const IPullRequestFileChangesService = createServiceIdentifier<IPullRequestFileChangesService>('IPullRequestFileChangesService');

export interface IPullRequestFileChangesService {
	readonly _serviceBrand: undefined;
	getFileChangesMultiDiffPart(pullRequest: PullRequestSearchItem): Promise<vscode.ChatResponseMultiDiffPart | undefined>;
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

			const diffEntries: vscode.ChatResponseDiffEntry[] = [];

			for (const file of files) {
				// Always use remote URIs to ensure we show the exact PR content
				// Local files may be on different branches or have different changes
				this.logService.trace(`Creating remote URIs for ${file.filename}`);

				const goToFileUri = toPRContentUri(file.filename, {
					owner: repoOwner,
					repo: repoName,
					prNumber: pullRequest.number,
					commitSha: pullRequest.headRefOid,
					isBase: false,
					status: file.status
				});

				const originalUri = file.status !== 'added'
					? toPRContentUri(file.previous_filename || file.filename, {
						owner: repoOwner,
						repo: repoName,
						prNumber: pullRequest.number,
						commitSha: pullRequest.baseRefOid,
						isBase: true,
						previousFileName: file.previous_filename,
						status: file.status
					})
					: undefined;

				const modifiedUri = file.status !== 'removed'
					? goToFileUri
					: undefined;

				this.logService.trace(`DiffEntry -> original='${originalUri?.toString()}' modified='${modifiedUri?.toString()}' (+${file.additions} -${file.deletions})`);
				diffEntries.push({
					originalUri,
					modifiedUri,
					goToFileUri,
					added: file.additions,
					removed: file.deletions,
				});
			}

			const title = `Changes in Pull Request #${pullRequest.number}`;
			return new vscode.ChatResponseMultiDiffPart(diffEntries, title, false);
		} catch (error) {
			this.logService.error(`Failed to get file changes multi diff part: ${error}`);
			return undefined;
		}
	}
}
