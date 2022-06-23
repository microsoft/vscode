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
	readonly isActionRunning: boolean;
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
		this._state = { HEAD: undefined, isActionRunning: false, repositoryHasNoChanges: false };

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
				// Sync Changes
				actionButton = this.getSyncChangesActionButton();
			} else {
				// Publish Branch
				actionButton = this.getPublishBranchActionButton();
			}
		}

		return actionButton;
	}

	private getPublishBranchActionButton(): SourceControlActionButton {
		return {
			command: {
				command: 'git.publish',
				title: localize('scm publish branch action button title', "{0} Publish Branch", '$(cloud-upload)'),
				tooltip: this.state.isActionRunning ?
					localize('scm button publish branch running', "Publishing Branch...") :
					localize('scm button publish branch', "Publish Branch"),
				arguments: [this.repository.sourceControl],
			},
			enabled: !this.state.isActionRunning
		};
	}

	private getSyncChangesActionButton(): SourceControlActionButton | undefined {
		if (this.state.HEAD?.ahead) {
			const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
			const rebaseWhenSync = config.get<string>('rebaseWhenSync');

			const ahead = `${this.state.HEAD.ahead}$(arrow-up)`;
			const behind = this.state.HEAD.behind ? `${this.state.HEAD.behind}$(arrow-down) ` : '';
			const icon = this.state.isActionRunning ? '$(sync~spin)' : '$(sync)';

			return {
				command: {
					command: rebaseWhenSync ? 'git.syncRebase' : 'git.sync',
					title: `${icon} ${behind} ${ahead}`,
					tooltip: this.state.isActionRunning ?
						localize('syncing changes', "Synchronizing Changes...")
						: this.repository.syncTooltip,
					arguments: [this.repository.sourceControl],
				},
				description: localize('scm button sync description', "{0} Sync Changes {1}{2}", icon, behind, ahead),
				enabled: !this.state.isActionRunning
			};
		}

		return undefined;
	}

	private onDidChangeOperations(): void {
		const isActionRunning = this.repository.operations.isRunning(Operation.Sync) ||
			this.repository.operations.isRunning(Operation.Push) ||
			this.repository.operations.isRunning(Operation.Pull);

		this.state = { ...this.state, isActionRunning: isActionRunning };
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
