/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Command, Disposable, Event, EventEmitter, SourceControlActionButton, Uri, workspace, l10n, LogOutputChannel } from 'vscode';
import { Branch, RefType, Status } from './api/git';
import { OperationKind } from './operation';
import { CommitCommandsCenter } from './postCommitCommands';
import { Repository } from './repository';
import { dispose } from './util';

function isActionButtonStateEqual(state1: ActionButtonState, state2: ActionButtonState): boolean {
	return state1.HEAD?.name === state2.HEAD?.name &&
		state1.HEAD?.commit === state2.HEAD?.commit &&
		state1.HEAD?.remote === state2.HEAD?.remote &&
		state1.HEAD?.type === state2.HEAD?.type &&
		state1.HEAD?.ahead === state2.HEAD?.ahead &&
		state1.HEAD?.behind === state2.HEAD?.behind &&
		state1.HEAD?.upstream?.name === state2.HEAD?.upstream?.name &&
		state1.HEAD?.upstream?.remote === state2.HEAD?.upstream?.remote &&
		state1.HEAD?.upstream?.commit === state2.HEAD?.upstream?.commit &&
		state1.isCheckoutInProgress === state2.isCheckoutInProgress &&
		state1.isCommitInProgress === state2.isCommitInProgress &&
		state1.isMergeInProgress === state2.isMergeInProgress &&
		state1.isRebaseInProgress === state2.isRebaseInProgress &&
		state1.isSyncInProgress === state2.isSyncInProgress &&
		state1.repositoryHasChangesToCommit === state2.repositoryHasChangesToCommit &&
		state1.repositoryHasUnresolvedConflicts === state2.repositoryHasUnresolvedConflicts;
}

interface ActionButtonState {
	readonly HEAD: Branch | undefined;
	readonly isCheckoutInProgress: boolean;
	readonly isCommitInProgress: boolean;
	readonly isMergeInProgress: boolean;
	readonly isRebaseInProgress: boolean;
	readonly isSyncInProgress: boolean;
	readonly repositoryHasChangesToCommit: boolean;
	readonly repositoryHasUnresolvedConflicts: boolean;
}

export class ActionButton {
	private _onDidChange = new EventEmitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	private _state: ActionButtonState;
	private get state() { return this._state; }
	private set state(state: ActionButtonState) {
		if (isActionButtonStateEqual(this._state, state)) {
			return;
		}

		this.logger.trace(`[ActionButton][setState] ${JSON.stringify(state)}`);

		this._state = state;
		this._onDidChange.fire();
	}

	private disposables: Disposable[] = [];

	constructor(
		private readonly repository: Repository,
		private readonly postCommitCommandCenter: CommitCommandsCenter,
		private readonly logger: LogOutputChannel) {
		this._state = {
			HEAD: undefined,
			isCheckoutInProgress: false,
			isCommitInProgress: false,
			isMergeInProgress: false,
			isRebaseInProgress: false,
			isSyncInProgress: false,
			repositoryHasChangesToCommit: false,
			repositoryHasUnresolvedConflicts: false
		};

		repository.onDidRunGitStatus(this.onDidRunGitStatus, this, this.disposables);
		repository.onDidChangeOperations(this.onDidChangeOperations, this, this.disposables);

		this.disposables.push(repository.onDidChangeBranchProtection(() => this._onDidChange.fire()));
		this.disposables.push(postCommitCommandCenter.onDidChange(() => this._onDidChange.fire()));

		const root = Uri.file(repository.root);
		this.disposables.push(workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('git.enableSmartCommit', root) ||
				e.affectsConfiguration('git.smartCommitChanges', root) ||
				e.affectsConfiguration('git.suggestSmartCommit', root)) {
				this.onDidChangeSmartCommitSettings();
			}

			if (e.affectsConfiguration('git.branchProtectionPrompt', root) ||
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
		actionButton = actionButton ?? this.getPublishBranchActionButton() ?? this.getSyncChangesActionButton() ?? this.getCommitActionButton();

		this.logger.trace(`[ActionButton][getButton] ${JSON.stringify({
			command: actionButton?.command.command,
			title: actionButton?.command.title,
			enabled: actionButton?.enabled
		})}`);

		return actionButton;
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
			enabled: (
				this.state.repositoryHasChangesToCommit ||
				(this.state.isRebaseInProgress && !this.state.repositoryHasUnresolvedConflicts) ||
				(this.state.isMergeInProgress && !this.state.repositoryHasUnresolvedConflicts)) &&
				!this.state.isCommitInProgress
		};
	}

	private getCommitActionButtonPrimaryCommand(): Command {
		// Rebase Continue
		if (this.state.isRebaseInProgress) {
			return {
				command: 'git.commit',
				title: l10n.t('{0} Continue', '$(check)'),
				tooltip: this.state.isCommitInProgress ? l10n.t('Continuing Rebase...') : l10n.t('Continue Rebase'),
				arguments: [this.repository.sourceControl, null]
			};
		}

		// Merge Continue
		if (this.state.isMergeInProgress) {
			return {
				command: 'git.commit',
				title: l10n.t('{0} Continue', '$(check)'),
				tooltip: this.state.isCommitInProgress ? l10n.t('Continuing Merge...') : l10n.t('Continue Merge'),
				arguments: [this.repository.sourceControl, null]
			};
		}

		// Not a branch (tag, detached)
		if (this.state.HEAD?.type === RefType.Tag || !this.state.HEAD?.name) {
			return {
				command: 'git.commit',
				title: l10n.t('{0} Commit', '$(check)'),
				tooltip: this.state.isCommitInProgress ? l10n.t('Committing Changes...') : l10n.t('Commit Changes'),
				arguments: [this.repository.sourceControl, null]
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

		// Merge Continue
		if (this.state.isMergeInProgress) {
			return [];
		}

		// Not a branch (tag, detached)
		if (this.state.HEAD?.type === RefType.Tag || !this.state.HEAD?.name) {
			return [];
		}

		// Commit
		const commandGroups: Command[][] = [];
		for (const commands of this.postCommitCommandCenter.getSecondaryCommands()) {
			commandGroups.push(commands.map(c => {
				return { command: c.command, title: c.title, tooltip: c.tooltip, arguments: c.arguments };
			}));
		}

		return commandGroups;
	}

	private getPublishBranchActionButton(): SourceControlActionButton | undefined {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const showActionButton = config.get<{ publish: boolean }>('showActionButton', { publish: true });

		// Not a branch (tag, detached), branch does have an upstream, commit/merge/rebase is in progress, or the button is disabled
		if (this.state.HEAD?.type === RefType.Tag || !this.state.HEAD?.name || this.state.HEAD?.upstream || this.state.isCommitInProgress || this.state.isMergeInProgress || this.state.isRebaseInProgress || !showActionButton.publish) { return undefined; }

		// Button icon
		const icon = this.state.isSyncInProgress ? '$(sync~spin)' : '$(cloud-upload)';

		return {
			command: {
				command: 'git.publish',
				title: l10n.t({ message: '{0} Publish Branch', args: [icon], comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] }),
				tooltip: this.state.isSyncInProgress ?
					(this.state.HEAD?.name ?
						l10n.t({ message: 'Publishing Branch "{0}"...', args: [this.state.HEAD.name], comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] }) :
						l10n.t({ message: 'Publishing Branch...', comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] })) :
					(this.repository.HEAD?.name ?
						l10n.t({ message: 'Publish Branch "{0}"', args: [this.state.HEAD?.name], comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] }) :
						l10n.t({ message: 'Publish Branch', comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] })),
				arguments: [this.repository.sourceControl],
			},
			enabled: !this.state.isCheckoutInProgress && !this.state.isSyncInProgress
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
				title: l10n.t('{0} Sync Changes{1}{2}', icon, behind, ahead),
				shortTitle: `${icon}${behind}${ahead}`,
				tooltip: this.state.isSyncInProgress ?
					l10n.t('Synchronizing Changes...')
					: this.repository.syncTooltip,
				arguments: [this.repository.sourceControl],
			},
			enabled: !this.state.isCheckoutInProgress && !this.state.isSyncInProgress
		};
	}

	private onDidChangeOperations(): void {
		const isCheckoutInProgress
			= this.repository.operations.isRunning(OperationKind.Checkout) ||
			this.repository.operations.isRunning(OperationKind.CheckoutTracking);

		const isCommitInProgress =
			this.repository.operations.isRunning(OperationKind.Commit) ||
			this.repository.operations.isRunning(OperationKind.PostCommitCommand) ||
			this.repository.operations.isRunning(OperationKind.RebaseContinue);

		const isSyncInProgress =
			this.repository.operations.isRunning(OperationKind.Sync) ||
			this.repository.operations.isRunning(OperationKind.Push) ||
			this.repository.operations.isRunning(OperationKind.Pull);

		this.state = { ...this.state, isCheckoutInProgress, isCommitInProgress, isSyncInProgress };
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
			repositoryHasChangesToCommit: this.repositoryHasChangesToCommit(),
			repositoryHasUnresolvedConflicts: this.repository.mergeGroup.resourceStates.length > 0
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
