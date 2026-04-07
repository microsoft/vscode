/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { ProgressLocation, Uri, window } from 'vscode';
import { compute4GramTextSimilarity } from '../../../platform/editSurvivalTracking/common/editSurvivalTracker';
import { IGitCommitMessageService } from '../../../platform/git/common/gitCommitMessageService';
import { IGitDiffService } from '../../../platform/git/common/gitDiffService';
import { IGitExtensionService } from '../../../platform/git/common/gitExtensionService';
import { API, Repository } from '../../../platform/git/vscode/git';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { DisposableMap, DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { basename } from '../../../util/vs/base/common/resources';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { RecentCommitMessages } from '../common/repository';
import { GitCommitMessageGenerator } from '../node/gitCommitMessageGenerator';

interface CommitMessage {
	readonly attemptCount: number;
	readonly changes: string[];
	readonly message: string;
}

export class GitCommitMessageServiceImpl implements IGitCommitMessageService {

	declare readonly _serviceBrand: undefined;

	private _gitExtensionApi: API | undefined;
	private readonly _commitMessages = new Map<string, Map<string, CommitMessage>>();

	private readonly _disposables = new DisposableStore();
	private readonly _repositoryDisposables = new DisposableMap<Repository>();

	constructor(
		@IGitExtensionService private readonly _gitExtensionService: IGitExtensionService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IGitDiffService private readonly _gitDiffService: IGitDiffService,
	) {
		const initialize = () => {
			this._disposables.add(this._gitExtensionApi!.onDidOpenRepository(this._onDidOpenRepository, this));
			this._disposables.add(this._gitExtensionApi!.onDidCloseRepository(this._onDidCloseRepository, this));

			for (const repository of this._gitExtensionApi!.repositories) {
				this._onDidOpenRepository(repository);
			}
		};

		this._gitExtensionApi = this._gitExtensionService.getExtensionApi();

		if (this._gitExtensionApi) {
			initialize();
		} else {
			this._disposables.add(this._gitExtensionService.onDidChange((status) => {
				if (status.enabled) {
					this._gitExtensionApi = this._gitExtensionService.getExtensionApi()!;
					initialize();
				}
			}));
		}
	}

	async generateCommitMessage(repository: Repository, cancellationToken: CancellationToken = CancellationToken.None): Promise<string | undefined> {
		if (cancellationToken.isCancellationRequested) {
			return undefined;
		}

		return window.withProgress({ location: ProgressLocation.SourceControl }, async () => {
			try {
				// Explicitly refresh (best effort) the repository state to make
				// sure that the repository state is up-to-date before generating
				// the commit message.
				await repository.status();
			} catch (err) { }

			const indexChanges = repository.state.indexChanges.length;
			const workingTreeChanges = repository.state.workingTreeChanges.length;
			const untrackedChanges = repository.state.untrackedChanges?.length ?? 0;

			if (indexChanges + workingTreeChanges + untrackedChanges === 0) {
				window.showInformationMessage(l10n.t('Cannot generate a commit message because there are no changes.'));
				return undefined;
			}

			const resources = repository.state.indexChanges.length > 0
				// Index
				? repository.state.indexChanges
				// Working tree, untracked changes
				: [
					...repository.state.workingTreeChanges,
					...repository.state.untrackedChanges ?? []
				];

			const changes = await this._gitDiffService.getChangeDiffs(repository, resources);

			if (changes.length === 0) {
				window.showInformationMessage(l10n.t('Cannot generate a commit message because the changes were excluded from the context due to content exclusion rules.'));
				return undefined;
			}

			const diffs = changes.map(diff => diff.diff);
			const attemptCount = this._getAttemptCount(repository, diffs);
			const recentCommitMessages = await this._getRecentCommitMessages(repository);

			const repositoryName = basename(repository.rootUri);
			const branchName = repository.state.HEAD?.name ?? '';
			const gitCommitMessageGenerator = this._instantiationService.createInstance(GitCommitMessageGenerator);
			const commitMessage = await gitCommitMessageGenerator.generateGitCommitMessage(repositoryName, branchName, changes, recentCommitMessages, attemptCount, cancellationToken);

			// Save generated commit message
			if (commitMessage && repository.state.HEAD && repository.state.HEAD.commit) {
				const commitMessages = this._commitMessages.get(repository.rootUri.toString()) ?? new Map<string, CommitMessage>();
				commitMessages.set(repository.state.HEAD.commit, { attemptCount, changes: diffs, message: commitMessage });

				this._commitMessages.set(repository.rootUri.toString(), commitMessages);
			}

			return commitMessage;
		});
	}

	async getRepository(uri?: Uri): Promise<Repository | null> {
		if (!this._gitExtensionApi) {
			return null;
		}

		if (uri === undefined && this._gitExtensionApi.repositories.length === 1) {
			return this._gitExtensionApi.repositories[0];
		}

		uri = uri ?? window.activeTextEditor?.document.uri;
		if (!uri) {
			return null;
		}

		const repository = await this._gitExtensionApi.openRepository(uri);
		if (!repository) {
			return null;
		}

		// Refresh repository state
		await repository.status();

		return repository;
	}

	private _getAttemptCount(repository: Repository, changes: string[]): number {
		const commitMessages = this._commitMessages.get(repository.rootUri.toString());
		const commitMessage = commitMessages?.get(repository.state.HEAD?.commit ?? '');

		if (!commitMessage || commitMessage.changes.length !== changes.length) {
			return 0;
		}

		for (let index = 0; index < changes.length; index++) {
			if (commitMessage.changes[index] !== changes[index]) {
				return 0;
			}
		}

		return commitMessage.attemptCount + 1;
	}

	private async _getRecentCommitMessages(repository: Repository): Promise<RecentCommitMessages> {
		const repositoryCommitMessages: string[] = [];
		const userCommitMessages: string[] = [];

		try {
			// Last 5 commit messages (repository)
			const commits = await repository.log({ maxEntries: 5 });
			repositoryCommitMessages.push(...commits.map(commit => commit.message.split('\n')[0]));

			// Last 5 commit messages (user)
			const author =
				await repository.getConfig('user.name') ??
				await repository.getGlobalConfig('user.name');

			const userCommits = await repository.log({ maxEntries: 5, author });
			userCommitMessages.push(...userCommits.map(commit => commit.message.split('\n')[0]));
		}
		catch (err) { }

		return { repository: repositoryCommitMessages, user: userCommitMessages };
	}

	private _onDidOpenRepository(repository: Repository): void {
		if (typeof repository.onDidCommit !== undefined) {
			this._repositoryDisposables.set(repository, repository.onDidCommit(() => this._onDidCommit(repository), this));
		}
	}

	private _onDidCloseRepository(repository: Repository): void {
		this._repositoryDisposables.deleteAndDispose(repository);
		this._commitMessages.delete(repository.rootUri.toString());
	}

	private async _onDidCommit(repository: Repository): Promise<void> {
		const HEAD = repository.state.HEAD;
		if (!HEAD?.commit) {
			return;
		}

		const commitMessages = this._commitMessages.get(repository.rootUri.toString());
		if (!commitMessages) {
			return;
		}

		// Commit details
		const commit = await repository.getCommit(HEAD.commit);
		const commitParent = commit.parents.length > 0 ? commit.parents[0] : '';
		const commitMessage = commitMessages.get(commitParent);

		if (!commitMessage) {
			return;
		}

		// Compute survival rate
		const survivalRateFourGram = compute4GramTextSimilarity(commit.message, commitMessage.message);

		/* __GDPR__
			"git.generateCommitMessageSurvival" : {
				"owner": "lszomoru",
				"comment": "Tracks how much of the generated git commit message has survived",
				"attemptCount": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "How many times the user has retried." },
				"survivalRateFourGram": { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true, "comment": "The rate between 0 and 1 of how much of the suggested git commit message was used when the code change was committed." }
			}
		*/
		this._telemetryService.sendMSFTTelemetryEvent('git.generateCommitMessageSurvival', undefined, { attemptCount: commitMessage.attemptCount, survivalRateFourGram });

		// Delete commit message
		commitMessages.delete(commitParent);
		this._commitMessages.set(repository.rootUri.toString(), commitMessages);
	}

	dispose(): void {
		this._repositoryDisposables.dispose();
		this._disposables.dispose();
	}
}
