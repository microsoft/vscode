/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Event, EventEmitter, SourceControlActionButton, Uri, workspace } from 'vscode';
import * as nls from 'vscode-nls';
import { Repository, Operation } from './repository';
import { dispose } from './util';
import { Branch } from './api/git';

const localize = nls.loadMessageBundle();

interface ActionButtonState {
	readonly HEAD: Branch | undefined;
	readonly isCommitInProgress: boolean;
	readonly isMergeInProgress: boolean;
	readonly isSyncInProgress: boolean;
	readonly repositoryHasChanges: boolean;
}

export class ActionButtonCommand {
	private _onDidChange = new EventEmitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	private _state: ActionButtonState;
	private get state() { return this._state; }
	private set state(state: ActionButtonState) {
		if (JSON.stringify(this._state) !== JSON.stringify(state)) {
			this._state = state;
			this._onDidChange.fire();
		}
	}

	private disposables: Disposable[] = [];

	constructor(readonly repository: Repository) {
		this._state = {
			HEAD: undefined,
			isCommitInProgress: false,
			isMergeInProgress: false,
			isSyncInProgress: false,
			repositoryHasChanges: false
		};

		repository.onDidRunGitStatus(this.onDidRunGitStatus, this, this.disposables);
		repository.onDidChangeOperations(this.onDidChangeOperations, this, this.disposables);

		const root = Uri.file(repository.root);
		this.disposables.push(workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('git.postCommitCommand', root) ||
				e.affectsConfiguration('git.showActionButton', root)
			) {
				this._onDidChange.fire();
			}
		}));
	}

	get button(): SourceControlActionButton | undefined {
		if (!this.state.HEAD || !this.state.HEAD.name) { return undefined; }

		let actionButton: SourceControlActionButton | undefined;

		if (this.state.repositoryHasChanges) {
			// Commit Changes (enabled)
			actionButton = this.getCommitActionButton();
		}

		// Commit Changes (enabled) -> Publish Branch -> Sync Changes -> Commit Changes (disabled)
		return actionButton ?? this.getPublishBranchActionButton() ?? this.getSyncChangesActionButton() ?? this.getCommitActionButton();
	}

	private getCommitActionButton(): SourceControlActionButton | undefined {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const showActionButton = config.get<{ commit: boolean }>('showActionButton', { commit: true });

		// The button is disabled
		if (!showActionButton.commit) { return undefined; }

		let title: string, tooltip: string;
		const postCommitCommand = config.get<string>('postCommitCommand');

		switch (postCommitCommand) {
			case 'push': {
				title = localize('scm button commit and push title', "$(arrow-up) Commit & Push");
				tooltip = this.state.isCommitInProgress ?
					localize('scm button committing pushing tooltip', "Committing & Pushing Changes...") :
					localize('scm button commit push tooltip', "Commit & Push Changes");
				break;
			}
			case 'sync': {
				title = localize('scm button commit and sync title', "$(sync) Commit & Sync");
				tooltip = this.state.isCommitInProgress ?
					localize('scm button committing synching tooltip', "Committing & Synching Changes...") :
					localize('scm button commit sync tooltip', "Commit & Sync Changes");
				break;
			}
			default: {
				title = localize('scm button commit title', "$(check) Commit");
				tooltip = this.state.isCommitInProgress ?
					localize('scm button committing tooltip', "Committing Changes...") :
					localize('scm button commit tooltip', "Commit Changes");
				break;
			}
		}

		return {
			command: {
				command: 'git.commit',
				title: title,
				tooltip: tooltip,
				arguments: [this.repository.sourceControl],
			},
			secondaryCommands: [
				[
					{
						command: 'git.commit',
						title: localize('scm secondary button commit', "Commit"),
						arguments: [this.repository.sourceControl, ''],
					},
					{
						command: 'git.commit',
						title: localize('scm secondary button commit and push', "Commit & Push"),
						arguments: [this.repository.sourceControl, 'push'],
					},
					{
						command: 'git.commit',
						title: localize('scm secondary button commit and sync', "Commit & Sync"),
						arguments: [this.repository.sourceControl, 'sync'],
					},
				]
			],
			enabled: this.state.repositoryHasChanges && !this.state.isCommitInProgress && !this.state.isMergeInProgress
		};
	}

	private getPublishBranchActionButton(): SourceControlActionButton | undefined {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const showActionButton = config.get<{ publish: boolean }>('showActionButton', { publish: true });

		// Branch does have an upstream, commit/merge is in progress, or the button is disabled
		if (this.state.HEAD?.upstream || this.state.isCommitInProgress || this.state.isMergeInProgress || !showActionButton.publish) { return undefined; }

		return {
			command: {
				command: 'git.publish',
				title: localize('scm publish branch action button title', "{0} Publish Branch", '$(cloud-upload)'),
				tooltip: this.state.isSyncInProgress ?
					localize('scm button publish branch running', "Publishing Branch...") :
					localize('scm button publish branch', "Publish Branch"),
				arguments: [this.repository.sourceControl],
			},
			enabled: !this.state.isSyncInProgress
		};
	}

	private getSyncChangesActionButton(): SourceControlActionButton | undefined {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const showActionButton = config.get<{ sync: boolean }>('showActionButton', { sync: true });

		// Branch does not have an upstream, commit/merge is in progress, or the button is disabled
		if (!this.state.HEAD?.upstream || this.state.isCommitInProgress || this.state.isMergeInProgress || !showActionButton.sync) { return undefined; }

		const ahead = this.state.HEAD.ahead ? ` ${this.state.HEAD.ahead}$(arrow-up)` : '';
		const behind = this.state.HEAD.behind ? ` ${this.state.HEAD.behind}$(arrow-down)` : '';
		const icon = this.state.isSyncInProgress ? '$(sync~spin)' : '$(sync)';

		const rebaseWhenSync = config.get<string>('rebaseWhenSync');

		return {
			command: {
				command: rebaseWhenSync ? 'git.syncRebase' : 'git.sync',
				title: `${icon}${behind}${ahead}`,
				tooltip: this.state.isSyncInProgress ?
					localize('syncing changes', "Synchronizing Changes...")
					: this.repository.syncTooltip,
				arguments: [this.repository.sourceControl],
			},
			description: localize('scm button sync description', "{0} Sync Changes{1}{2}", icon, behind, ahead),
			enabled: !this.state.isSyncInProgress
		};
	}

	private onDidChangeOperations(): void {
		const isCommitInProgress =
			this.repository.operations.isRunning(Operation.Commit);

		const isSyncInProgress =
			this.repository.operations.isRunning(Operation.Sync) ||
			this.repository.operations.isRunning(Operation.Push) ||
			this.repository.operations.isRunning(Operation.Pull);

		this.state = { ...this.state, isCommitInProgress, isSyncInProgress };
	}

	private onDidRunGitStatus(): void {
		this.state = {
			...this.state,
			HEAD: this.repository.HEAD,
			isMergeInProgress:
				this.repository.mergeGroup.resourceStates.length !== 0,
			repositoryHasChanges:
				this.repository.indexGroup.resourceStates.length !== 0 ||
				this.repository.untrackedGroup.resourceStates.length !== 0 ||
				this.repository.workingTreeGroup.resourceStates.length !== 0
		};
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
