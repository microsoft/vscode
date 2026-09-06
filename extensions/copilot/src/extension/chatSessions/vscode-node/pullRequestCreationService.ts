/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { getGitHubRepoInfoFromContext, IGitService } from '../../../platform/git/common/gitService';
import { Diff } from '../../../platform/git/common/gitDiffService';
import { Repository } from '../../../platform/git/vscode/git';
import { createServiceIdentifier } from '../../../util/common/services';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { GitHubPullRequestTitleAndDescriptionGenerator } from '../../prompt/node/githubPullRequestTitleAndDescriptionGenerator';
import { IOctoKitService } from '../../../platform/github/common/githubService';
import { escapeRegExpCharacters } from '../../../util/vs/base/common/strings';

export interface PullRequestContext {
	readonly commitMessages: string[];
	readonly patches: readonly Diff[];
}

export interface CreatePullRequestOptions {
	readonly repositoryUri: vscode.Uri;
	readonly branchName: string;
	readonly baseBranchName: string;
	readonly isDraft: boolean;
}

export interface IPullRequestCreationService {
	readonly _serviceBrand: undefined;

	/**
	 * Pushes the session branch to its remote, generates a title and description,
	 * and creates a pull request for the session.
	 *
	 * @returns The URL of the created pull request, or `undefined` if creation was
	 * cancelled before completion. Throws on any unrecoverable error.
	 */
	createPullRequest(options: CreatePullRequestOptions, token: vscode.CancellationToken): Promise<string | undefined>;
}

export const IPullRequestCreationService = createServiceIdentifier<IPullRequestCreationService>('IPullRequestCreationService');

export class PullRequestCreationService extends Disposable implements IPullRequestCreationService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IGitService private readonly gitService: IGitService,
		@IOctoKitService private readonly octoKitService: IOctoKitService,
	) {
		super();
	}

	async createPullRequest(options: CreatePullRequestOptions, token: vscode.CancellationToken): Promise<string | undefined> {
		const { repositoryUri, branchName, baseBranchName, isDraft } = options;

		const repository = await this.gitService.openRepository(repositoryUri);
		const repositoryContext = await this.gitService.getRepository(repositoryUri);

		if (!repository || !repositoryContext) {
			throw new Error(l10n.t('Could not find the repository for branch \'{0}\'.', branchName));
		}

		// Resolve owner/repo from the (preferred upstream's) remote.
		const githubRepoInfo = getGitHubRepoInfoFromContext(repositoryContext);
		const remoteInformation = githubRepoInfo
			? repository.state.remotes.find(remote =>
				githubRepoInfo.remoteUrl === remote.fetchUrl || githubRepoInfo.remoteUrl === remote.pushUrl)
			: undefined;

		if (!githubRepoInfo || !remoteInformation) {
			throw new Error(l10n.t('Could not determine the GitHub remote for branch \'{0}\'.', branchName));
		}

		// Push the branch (set upstream when missing).
		const head = repository.state.HEAD;
		const setUpstream = !head?.upstream;
		await repository.push(remoteInformation.name, branchName, setUpstream);

		if (token.isCancellationRequested) {
			return undefined;
		}

		// Collect commits and patches.
		const context = await collectPullRequestContext(repository, baseBranchName, branchName, token);
		if (token.isCancellationRequested) {
			return undefined;
		}

		let title: string | undefined;
		let description: string | undefined;
		if (context && (context.commitMessages.length > 0 || context.patches.length > 0)) {
			const generator = this.instantiationService.createInstance(GitHubPullRequestTitleAndDescriptionGenerator);
			try {
				const result = await generator.provideTitleAndDescription({
					commitMessages: context.commitMessages,
					patches: context.patches.map(p => p.diff),
					compareBranch: branchName,
				}, token);

				title = result?.title;
				description = result?.description;
			} finally {
				generator.dispose();
			}
		}

		if (token.isCancellationRequested) {
			return undefined;
		}

		// Base branch name may contain the remote name as a prefix, so we
		// need to remove it since the API expects just the branch name.
		const normalizedBaseBranchName = baseBranchName.replace(
			new RegExp(`^${escapeRegExpCharacters(remoteInformation.name)}/`),
			''
		);

		const createdPullRequest = await this.octoKitService.createPullRequest(
			githubRepoInfo.id.org,
			githubRepoInfo.id.repo,
			title ?? branchName,
			description ?? '',
			branchName,
			normalizedBaseBranchName,
			isDraft,
			{},
		);

		return createdPullRequest.url;
	}
}

async function collectPullRequestContext(
	repository: Repository,
	baseBranchName: string,
	branchName: string,
	token: CancellationToken
): Promise<PullRequestContext | undefined> {
	if (baseBranchName === branchName) {
		return { commitMessages: [], patches: [] };
	}

	if (token.isCancellationRequested) {
		return undefined;
	}

	const mergeBase = await repository.getMergeBase(baseBranchName, branchName);
	if (!mergeBase) {
		return undefined;
	}

	if (token.isCancellationRequested) {
		return undefined;
	}

	// Use `mergeBase..branchName` so that reverse merges from the base
	// branch are excluded; `reverse: true` returns commits oldest-first to
	// match the shape consumed by the PR title/description prompt.
	const commits = await repository.log({ range: `${mergeBase}..${branchName}`, reverse: true });
	const commitMessages = commits.map(commit => commit.message);

	if (token.isCancellationRequested) {
		return undefined;
	}

	const diffChanges = await repository.diffBetweenWithStats(mergeBase, branchName) ?? [];
	const patches: Diff[] = [];
	for (const change of diffChanges) {
		const patch = await repository.diffBetweenPatch(mergeBase, branchName, change.uri.fsPath);
		if (!patch) {
			continue;
		}

		patches.push({ ...change, diff: patch });
	}

	if (token.isCancellationRequested) {
		return undefined;
	}

	return { commitMessages, patches };
}
