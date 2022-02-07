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
	readonly isSyncRunning: boolean;
	readonly repositoryHasNoChanges: boolean;
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
		this._state = { HEAD: undefined, isSyncRunning: false, repositoryHasNoChanges: false };

		repository.onDidRunGitStatus(this.onDidRunGitStatus, this, this.disposables);
		repository.onDidChangeOperations(this.onDidChangeOperations, this, this.disposables);
	}

	get button(): SourceControlActionButton | undefined {
		if (!this.state.HEAD || !this.state.HEAD.name || !this.state.HEAD.commit) { return undefined; }

		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const showActionButton = config.get<string>('showUnpublishedCommitsButton', 'whenEmpty');
		const postCommitCommand = config.get<string>('postCommitCommand');
		const noPostCommitCommand = postCommitCommand !== 'sync' && postCommitCommand !== 'push';

		let actionButton: SourceControlActionButton | undefined;
		if (showActionButton === 'always' || (showActionButton === 'whenEmpty' && this.state.repositoryHasNoChanges && noPostCommitCommand)) {
			if (this.state.HEAD.upstream) {
				if (this.state.HEAD.ahead) {
					const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
					const rebaseWhenSync = config.get<string>('rebaseWhenSync');

					const ahead = `${this.state.HEAD.ahead}$(arrow-up)`;
					const behind = this.state.HEAD.behind ? `${this.state.HEAD.behind}$(arrow-down) ` : '';
					const icon = this.state.isSyncRunning ? '$(sync~spin)' : '$(sync)';

					actionButton = {
						command: {
							command: this.state.isSyncRunning ? '' : rebaseWhenSync ? 'git.syncRebase' : 'git.sync',
							title: localize('scm button sync title', "{0} {1}{2}", icon, behind, ahead),
							tooltip: this.state.isSyncRunning ?
								localize('syncing changes', "Synchronizing Changes...")
								: this.repository.syncTooltip,
							arguments: [this.repository.sourceControl],
						},
						description: localize('scm button sync description', "{0} Sync Changes {1}{2}", icon, behind, ahead)
					};
				}
			} else {
				actionButton = {
					command: {
						command: this.state.isSyncRunning ? '' : 'git.publish',
						title: localize('scm button publish title', "$(cloud-upload) Publish Branch"),
						tooltip: this.state.isSyncRunning ?
							localize('scm button publish branch running', "Publishing Branch...") :
							localize('scm button publish branch', "Publish Branch"),
						arguments: [this.repository.sourceControl],
					}
				};
			}
		}

		return actionButton;
	}

	private onDidChangeOperations(): void {
		const isSyncRunning = this.repository.operations.isRunning(Operation.Sync) ||
			this.repository.operations.isRunning(Operation.Push) ||
			this.repository.operations.isRunning(Operation.Pull);

		this.state = { ...this.state, isSyncRunning };
	}

	private onDidRunGitStatus(): void {
		this.state = {
			...this.state,
			HEAD: this.repository.HEAD,
			repositoryHasNoChanges:
				this.repository.indexGroup.resourceStates.length === 0 &&
				this.repository.mergeGroup.resourceStates.length === 0 &&
				this.repository.untrackedGroup.resourceStates.length === 0 &&
				this.repository.workingTreeGroup.resourceStates.length === 0
		};
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
