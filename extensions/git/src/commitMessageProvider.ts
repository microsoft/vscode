/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Disposable, Event, EventEmitter, Uri, workspace, SourceControlInputBoxActionButton, ThemeIcon, l10n } from 'vscode';
import { CommitMessageProvider, Status, Repository as ApiRepository } from './api/git';
import { Repository } from './repository';
import { dispose } from './util';

export interface ICommitMessageProviderRegistry {
	readonly onDidChangeCommitMessageProvider: Event<void>;

	commitMessageProvider: CommitMessageProvider | undefined;
	registerCommitMessageProvider(provider: CommitMessageProvider): Disposable;
}

export class TestCommitMessageProvider implements CommitMessageProvider {

	readonly icon = new ThemeIcon('rocket');
	readonly title = 'Generate Commit Message (Test)';

	private readonly _changesMap = new Map<string, [string[], number]>();

	async provideCommitMessage(repository: ApiRepository, changes: string[], token: CancellationToken): Promise<string | undefined> {
		console.log('Repository: ', repository.rootUri.fsPath);

		if (token.isCancellationRequested) {
			return undefined;
		}

		return new Promise(resolve => {
			token.onCancellationRequested(() => resolve(undefined));

			setTimeout(() => {
				const attemptCount = this.getAttemptCount(repository, changes);
				this._changesMap.set(repository.rootUri.fsPath, [changes, attemptCount]);

				resolve(`Test commit message (Attempt No. ${attemptCount})`);
			}, 5000);
		});
	}

	private getAttemptCount(repository: ApiRepository, changes: string[]): number {
		const [previousChanges, previousCount] = this._changesMap.get(repository.rootUri.fsPath) ?? [[], 1];
		if (previousChanges.length !== changes.length) {
			return 1;
		}

		for (let index = 0; index < changes.length; index++) {
			if (previousChanges[index] !== changes[index]) {
				return 1;
			}
		}

		return previousCount + 1;
	}

}

interface ActionButtonState {
	readonly isGenerating: boolean;
	readonly enabled: boolean;
}

export class GenerateCommitMessageActionButton {

	private _onDidChange = new EventEmitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	private _state: ActionButtonState;
	get state() { return this._state; }
	set state(state: ActionButtonState) {
		if (this._state.enabled === state.enabled &&
			this._state.isGenerating === state.isGenerating) {
			return;
		}

		this._state = state;
		this._onDidChange.fire();
	}

	get button(): SourceControlInputBoxActionButton | undefined {
		if (this.commitMessageProviderRegistry.commitMessageProvider === undefined) {
			return undefined;
		}

		return this.state.isGenerating ?
			{
				icon: new ThemeIcon('debug-stop'),
				command: {
					title: l10n.t('Cancel'),
					command: 'git.generateCommitMessageCancel',
					arguments: [this.repository.sourceControl]
				},
				enabled: this.state.enabled,
			} :
			{
				icon: this.commitMessageProviderRegistry.commitMessageProvider.icon ?? new ThemeIcon('sparkle'),
				command: {
					title: this.commitMessageProviderRegistry.commitMessageProvider.title,
					command: 'git.generateCommitMessage',
					arguments: [this.repository.sourceControl]
				},
				enabled: this.state.enabled
			};
	}

	private disposables: Disposable[] = [];

	constructor(
		private readonly repository: Repository,
		private readonly commitMessageProviderRegistry: ICommitMessageProviderRegistry
	) {
		this._state = {
			enabled: false,
			isGenerating: false
		};

		const root = Uri.file(repository.root);
		this.disposables.push(workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('git.enableSmartCommit', root) ||
				e.affectsConfiguration('git.smartCommitChanges', root) ||
				e.affectsConfiguration('git.suggestSmartCommit', root)) {
				this.onDidChangeSmartCommitSettings();
			}
		}));
		repository.onDidRunGitStatus(this.onDidRunGitStatus, this, this.disposables);
		repository.onDidStartCommitMessageGeneration(this.onDidStartCommitMessageGeneration, this, this.disposables);
		repository.onDidEndCommitMessageGeneration(this.onDidEndCommitMessageGeneration, this, this.disposables);
		commitMessageProviderRegistry.onDidChangeCommitMessageProvider(this.onDidChangeCommitMessageProvider, this, this.disposables);
	}

	private onDidChangeCommitMessageProvider(): void {
		this._onDidChange.fire();
	}

	private onDidStartCommitMessageGeneration(): void {
		this.state = { ...this.state, isGenerating: true };
	}

	private onDidEndCommitMessageGeneration(): void {
		this.state = { ...this.state, isGenerating: false };
	}

	private onDidChangeSmartCommitSettings(): void {
		this.state = {
			...this.state,
			enabled: this.repositoryHasChangesToCommit()
		};
	}

	private onDidRunGitStatus(): void {
		this.state = {
			...this.state,
			enabled: this.repositoryHasChangesToCommit()
		};
	}

	private repositoryHasChangesToCommit(): boolean {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const enableSmartCommit = config.get<boolean>('enableSmartCommit') === true;
		const suggestSmartCommit = config.get<boolean>('suggestSmartCommit') === true;
		const smartCommitChanges = config.get<'all' | 'tracked'>('smartCommitChanges', 'all');

		const resources = [...this.repository.indexGroup.resourceStates];

		if (
			// Smart commit enabled (all)
			(enableSmartCommit && smartCommitChanges === 'all') ||
			// Smart commit disabled, smart suggestion enabled
			(!enableSmartCommit && suggestSmartCommit)
		) {
			resources.push(...this.repository.workingTreeGroup.resourceStates);
		}

		// Smart commit enabled (tracked only)
		if (enableSmartCommit && smartCommitChanges === 'tracked') {
			resources.push(...this.repository.workingTreeGroup.resourceStates.filter(r => r.type !== Status.UNTRACKED));
		}

		return resources.length !== 0;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
