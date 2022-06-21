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

		const root = Uri.file(repository.root);
		this.disposables.push(workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('git.postCommitCommand', root) ||
				e.affectsConfiguration('git.showCommitActionButton', root)
			) {
				this._onDidChange.fire();
			}
		}));
	}

	get button(): SourceControlActionButton | undefined {
		if (!this.state.HEAD || !this.state.HEAD.name || !this.state.HEAD.commit) { return undefined; }

		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const showActionButtonCommitChanges = config.get<boolean>('showCommitActionButton', false);
		const showActionButtonUnpublishedChanges = config.get<string>('showUnpublishedCommitsButton', 'whenEmpty');
		const postCommitCommand = config.get<string>('postCommitCommand');

		let actionButton: SourceControlActionButton | undefined;

		if (this.state.repositoryHasNoChanges) {
			if (showActionButtonUnpublishedChanges === 'always' || showActionButtonUnpublishedChanges === 'whenEmpty') {
				if (this.state.HEAD.upstream) {
					if (this.state.HEAD.ahead) {
						// Sync Changes
						const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
						const rebaseWhenSync = config.get<string>('rebaseWhenSync');

						const ahead = `${this.state.HEAD.ahead}$(arrow-up)`;
						const behind = this.state.HEAD.behind ? `${this.state.HEAD.behind}$(arrow-down) ` : '';
						const icon = this.state.isActionRunning ? '$(sync~spin)' : '$(sync)';

						actionButton = {
							command: {
								command: this.state.isActionRunning ? '' : rebaseWhenSync ? 'git.syncRebase' : 'git.sync',
								title: localize('scm button sync title', "{0} {1}{2}", icon, behind, ahead),
								tooltip: this.state.isActionRunning ?
									localize('syncing changes', "Synchronizing Changes...")
									: this.repository.syncTooltip,
								arguments: [this.repository.sourceControl],
							},
							description: localize('scm button sync description', "{0} Sync Changes {1}{2}", icon, behind, ahead)
						};
					}
				} else {
					// Publish Branch
					actionButton = {
						command: {
							command: this.state.isActionRunning ? '' : 'git.publish',
							title: localize('scm button publish title', "$(cloud-upload) Publish Branch"),
							tooltip: this.state.isActionRunning ?
								localize('scm button publish branch running', "Publishing Branch...") :
								localize('scm button publish branch', "Publish Branch"),
							arguments: [this.repository.sourceControl],
						}
					};
				}
			}
		} else {
			if (showActionButtonCommitChanges) {
				let title: string, tooltip: string;
				switch (postCommitCommand) {
					case 'push': {
						title = localize('scm button commit and push title', "$(arrow-up) Commit & Push");
						tooltip = this.state.isActionRunning ?
							localize('scm button committing pushing tooltip', "Committing & Pushing Changes...") :
							localize('scm button commit push tooltip', "Commit & Push Changes");
						break;
					}
					case 'sync': {
						title = localize('scm button commit and sync title', "$(sync) Commit & Sync");
						tooltip = this.state.isActionRunning ?
							localize('scm button committing synching tooltip', "Committing & Synching Changes...") :
							localize('scm button commit sync tooltip', "Commit & Sync Changes");
						break;
					}
					default: {
						title = localize('scm button commit title', "$(check) Commit");
						tooltip = this.state.isActionRunning ?
							localize('scm button committing tooltip', "Committing Changes...") :
							localize('scm button commit tooltip', "Commit Changes");
						break;
					}
				}

				// Commit
				actionButton = {
					command: {
						command: this.state.isActionRunning ? '' : 'git.commit',
						title: title,
						tooltip: tooltip,
						arguments: [this.repository.sourceControl],
					}
				};
			}
		}

		return actionButton;
	}

	private onDidChangeOperations(): void {
		const isActionRunning =
			this.repository.operations.isRunning(Operation.Commit) ||
			this.repository.operations.isRunning(Operation.Sync) ||
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
