/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
import { Command, Disposable, Event, EventEmitter, SourceControlActionButton, Uri, workspace } from 'vscode';
import { ApiRepository } from './api/api1';
import { Branch, Status } from './api/git';
import { IPostCommitCommandsProviderRegistry } from './postCommitCommands';
import { Repository, Operation } from './repository';
import { dispose } from './util';

const localize = nls.loadMessageBundle();

interface ActionButtonState {
	readonly HEAD: Branch | undefined;
	readonly isCommitInProgress: boolean;
	readonly isMergeInProgress: boolean;
	readonly isSyncInProgress: boolean;
	readonly repositoryHasChangesToCommit: boolean;
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

	constructor(
		readonly repository: Repository,
		readonly postCommitCommandsProviderRegistry: IPostCommitCommandsProviderRegistry) {
		this._state = {
			HEAD: undefined,
			isCommitInProgress: false,
			isMergeInProgress: false,
			isSyncInProgress: false,
			repositoryHasChangesToCommit: false
		};

		repository.onDidRunGitStatus(this.onDidRunGitStatus, this, this.disposables);
		repository.onDidChangeOperations(this.onDidChangeOperations, this, this.disposables);

		const root = Uri.file(repository.root);
		this.disposables.push(workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('git.enableSmartCommit', root) ||
				e.affectsConfiguration('git.smartCommitChanges', root) ||
				e.affectsConfiguration('git.suggestSmartCommit', root)) {
				this.onDidChangeSmartCommitSettings();
			}

			if (e.affectsConfiguration('git.branchProtection', root) ||
				e.affectsConfiguration('git.branchProtectionPrompt', root) ||
				e.affectsConfiguration('git.postCommitCommand', root) ||
				e.affectsConfiguration('git.showActionButton', root)) {
				this._onDidChange.fire();
			}
		}));
	}

	get button(): SourceControlActionButton | undefined {
		if (!this.state.HEAD || !this.state.HEAD.name) { return undefined; }

		let actionButton: SourceControlActionButton | undefined;

		if (this.state.repositoryHasChangesToCommit) {
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

		let title: string, tooltip: string, commandArg: string;
		const postCommitCommand = config.get<string>('postCommitCommand');

		// Branch protection
		const isBranchProtected = this.repository.isBranchProtected();
		const branchProtectionPrompt = config.get<'alwaysCommit' | 'alwaysCommitToNewBranch' | 'alwaysPrompt'>('branchProtectionPrompt')!;
		const alwaysPrompt = isBranchProtected && branchProtectionPrompt === 'alwaysPrompt';
		const alwaysCommitToNewBranch = isBranchProtected && branchProtectionPrompt === 'alwaysCommitToNewBranch';

		// Icon
		const icon = alwaysPrompt ? '$(lock)' : alwaysCommitToNewBranch ? '$(git-branch)' : undefined;

		// Title, tooltip
		switch (postCommitCommand) {
			case 'push': {
				commandArg = 'git.push';
				title = localize('scm button commit and push title', "{0} Commit & Push", icon ?? '$(arrow-up)');
				if (alwaysCommitToNewBranch) {
					tooltip = this.state.isCommitInProgress ?
						localize('scm button committing to new branch and pushing tooltip', "Committing to New Branch & Pushing Changes...") :
						localize('scm button commit to new branch and push tooltip', "Commit to New Branch & Push Changes");
				} else {
					tooltip = this.state.isCommitInProgress ?
						localize('scm button committing and pushing tooltip', "Committing & Pushing Changes...") :
						localize('scm button commit and push tooltip', "Commit & Push Changes");
				}
				break;
			}
			case 'sync': {
				commandArg = 'git.sync';
				title = localize('scm button commit and sync title', "{0} Commit & Sync", icon ?? '$(sync)');
				if (alwaysCommitToNewBranch) {
					tooltip = this.state.isCommitInProgress ?
						localize('scm button committing to new branch and synching tooltip', "Committing to New Branch & Synching Changes...") :
						localize('scm button commit to new branch and sync tooltip', "Commit to New Branch & Sync Changes");
				} else {
					tooltip = this.state.isCommitInProgress ?
						localize('scm button committing and synching tooltip', "Committing & Synching Changes...") :
						localize('scm button commit and sync tooltip', "Commit & Sync Changes");
				}
				break;
			}
			default: {
				commandArg = '';
				title = localize('scm button commit title', "{0} Commit", icon ?? '$(check)');
				if (alwaysCommitToNewBranch) {
					tooltip = this.state.isCommitInProgress ?
						localize('scm button committing to new branch tooltip', "Committing Changes to New Branch...") :
						localize('scm button commit to new branch tooltip', "Commit Changes to New Branch");
				} else {
					tooltip = this.state.isCommitInProgress ?
						localize('scm button committing tooltip', "Committing Changes...") :
						localize('scm button commit tooltip', "Commit Changes");
				}
				break;
			}
		}

		return {
			command: {
				command: 'git.commit',
				title: title,
				tooltip: tooltip,
				arguments: [this.repository.sourceControl, commandArg],
			},
			secondaryCommands: this.getCommitActionButtonSecondaryCommands(),
			enabled: this.state.repositoryHasChangesToCommit && !this.state.isCommitInProgress && !this.state.isMergeInProgress
		};
	}

	private getCommitActionButtonSecondaryCommands(): Command[][] {
		const commandGroups: Command[][] = [];

		for (const provider of this.postCommitCommandsProviderRegistry.getPostCommitCommandsProviders()) {
			const commands = provider.getCommands(new ApiRepository(this.repository));
			commandGroups.push((commands ?? []).map(c => {
				return {
					command: 'git.commit',
					title: c.title,
					arguments: [this.repository.sourceControl, c.command]
				};
			}));
		}

		if (commandGroups.length > 0) {
			commandGroups[0].splice(0, 0, { command: 'git.commit', title: localize('scm secondary button commit', "Commit") });
		}

		return commandGroups;
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

	private onDidChangeSmartCommitSettings(): void {
		this.state = {
			...this.state,
			repositoryHasChangesToCommit: this.repositoryHasChangesToCommit()
		};
	}

	private onDidRunGitStatus(): void {
		this.state = {
			...this.state,
			HEAD: this.repository.HEAD,
			isMergeInProgress: this.repository.mergeGroup.resourceStates.length !== 0,
			repositoryHasChangesToCommit: this.repositoryHasChangesToCommit()
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
