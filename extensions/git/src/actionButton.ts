/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
import { Command, Disposable, Event, EventEmitter, SourceControlActionButton, Uri, workspace } from 'vscode';
import { Branch, CommitCommand, Status } from './api/git';
import { CommitCommandsCenter } from './postCommitCommands';
import { Repository, Operation } from './repository';
import { dispose } from './util';

const localize = nls.loadMessageBundle();

interface ActionButtonState {
	readonly HEAD: Branch | undefined;
	readonly isCommitInProgress: boolean;
	readonly isMergeInProgress: boolean;
	readonly isRebaseInProgress: boolean;
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
		readonly postCommitCommandCenter: CommitCommandsCenter) {
		this._state = {
			HEAD: undefined,
			isCommitInProgress: false,
			isMergeInProgress: false,
			isRebaseInProgress: false,
			isSyncInProgress: false,
			repositoryHasChangesToCommit: false
		};

		repository.onDidRunGitStatus(this.onDidRunGitStatus, this, this.disposables);
		repository.onDidChangeOperations(this.onDidChangeOperations, this, this.disposables);

		this.disposables.push(postCommitCommandCenter.onDidChange(() => this._onDidChange.fire()));

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
				e.affectsConfiguration('git.rememberPostCommitCommand', root) ||
				e.affectsConfiguration('git.showActionButton', root)) {
				this._onDidChange.fire();
			}
		}));
	}

	get button(): SourceControlActionButton | undefined {
		if (!this.state.HEAD) { return undefined; }

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

		const primaryCommand = this.getCommitActionButtonPrimaryCommand();

		return {
			command: primaryCommand,
			secondaryCommands: this.getCommitActionButtonSecondaryCommands(),
			description: primaryCommand.description ?? primaryCommand.title,
			enabled: (this.state.repositoryHasChangesToCommit || this.state.isRebaseInProgress) && !this.state.isCommitInProgress && !this.state.isMergeInProgress
		};
	}

	private getCommitActionButtonPrimaryCommand(): CommitCommand {
		// Rebase Continue
		if (this.state.isRebaseInProgress) {
			return {
				command: 'git.commit',
				title: localize('scm button continue title', "{0} Continue", '$(check)'),
				tooltip: this.state.isCommitInProgress ? localize('scm button continuing tooltip', "Continuing Rebase...") : localize('scm button continue tooltip', "Continue Rebase"),
				arguments: [this.repository.sourceControl, '']
			};
		}

		// Commit
		return this.postCommitCommandCenter.getPrimaryCommand();
	}

	private getCommitActionButtonSecondaryCommands(): Command[][] {
		// Rebase Continue
		if (this.state.isRebaseInProgress) {
			return [];
		}

		// Commit
		const commandGroups: Command[][] = [];
		for (const commands of this.postCommitCommandCenter.getSecondaryCommands()) {
			commandGroups.push(commands.map(c => {
				// Use the description as title if present
				return { command: 'git.commit', title: c.description ?? c.title, tooltip: c.tooltip, arguments: c.arguments };
			}));
		}

		return commandGroups;
	}

	private getPublishBranchActionButton(): SourceControlActionButton | undefined {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const showActionButton = config.get<{ publish: boolean }>('showActionButton', { publish: true });

		// Branch does have an upstream, commit/merge/rebase is in progress, or the button is disabled
		if (this.state.HEAD?.upstream || this.state.isCommitInProgress || this.state.isMergeInProgress || this.state.isRebaseInProgress || !showActionButton.publish) { return undefined; }

		return {
			command: {
				command: 'git.publish',
				title: localize({ key: 'scm publish branch action button title', comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] }, "{0} Publish Branch", '$(cloud-upload)'),
				tooltip: this.state.isSyncInProgress ?
					localize({ key: 'scm button publish branch running', comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] }, "Publishing Branch...") :
					localize({ key: 'scm button publish branch', comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] }, "Publish Branch"),
				arguments: [this.repository.sourceControl],
			},
			enabled: !this.state.isSyncInProgress
		};
	}

	private getSyncChangesActionButton(): SourceControlActionButton | undefined {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const showActionButton = config.get<{ sync: boolean }>('showActionButton', { sync: true });
		const branchIsAheadOrBehind = (this.state.HEAD?.behind ?? 0) > 0 || (this.state.HEAD?.ahead ?? 0) > 0;

		// Branch does not have an upstream, branch is not ahead/behind the remote branch, commit/merge/rebase is in progress, or the button is disabled
		if (!this.state.HEAD?.upstream || !branchIsAheadOrBehind || this.state.isCommitInProgress || this.state.isMergeInProgress || this.state.isRebaseInProgress || !showActionButton.sync) { return undefined; }

		const ahead = this.state.HEAD.ahead ? ` ${this.state.HEAD.ahead}$(arrow-up)` : '';
		const behind = this.state.HEAD.behind ? ` ${this.state.HEAD.behind}$(arrow-down)` : '';
		const icon = this.state.isSyncInProgress ? '$(sync~spin)' : '$(sync)';

		return {
			command: {
				command: 'git.sync',
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
			this.repository.operations.isRunning(Operation.Commit) ||
			this.repository.operations.isRunning(Operation.RebaseContinue);

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
			isMergeInProgress: this.repository.mergeInProgress,
			isRebaseInProgress: !!this.repository.rebaseCommit,
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
