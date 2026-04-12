"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionButton = void 0;
const vscode_1 = require("vscode");
const git_constants_1 = require("./api/git.constants");
const util_1 = require("./util");
function isActionButtonStateEqual(state1, state2) {
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
class ActionButton {
    repository;
    postCommitCommandCenter;
    logger;
    _onDidChange = new vscode_1.EventEmitter();
    get onDidChange() { return this._onDidChange.event; }
    _state;
    get state() { return this._state; }
    set state(state) {
        if (isActionButtonStateEqual(this._state, state)) {
            return;
        }
        this.logger.trace(`[ActionButton][setState] ${JSON.stringify(state)}`);
        this._state = state;
        this._onDidChange.fire();
    }
    disposables = [];
    constructor(repository, postCommitCommandCenter, logger) {
        this.repository = repository;
        this.postCommitCommandCenter = postCommitCommandCenter;
        this.logger = logger;
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
        const root = vscode_1.Uri.file(repository.root);
        this.disposables.push(vscode_1.workspace.onDidChangeConfiguration(e => {
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
    get button() {
        if (!this.state.HEAD) {
            return undefined;
        }
        let actionButton;
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
    getCommitActionButton() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        const showActionButton = config.get('showActionButton', { commit: true });
        // The button is disabled
        if (!showActionButton.commit) {
            return undefined;
        }
        const primaryCommand = this.getCommitActionButtonPrimaryCommand();
        return {
            command: primaryCommand,
            secondaryCommands: this.getCommitActionButtonSecondaryCommands(),
            enabled: (this.state.repositoryHasChangesToCommit ||
                (this.state.isRebaseInProgress && !this.state.repositoryHasUnresolvedConflicts) ||
                (this.state.isMergeInProgress && !this.state.repositoryHasUnresolvedConflicts)) &&
                !this.state.isCommitInProgress
        };
    }
    getCommitActionButtonPrimaryCommand() {
        // Rebase Continue
        if (this.state.isRebaseInProgress) {
            return {
                command: 'git.commit',
                title: vscode_1.l10n.t('{0} Continue', '$(check)'),
                tooltip: this.state.isCommitInProgress ? vscode_1.l10n.t('Continuing Rebase...') : vscode_1.l10n.t('Continue Rebase'),
                arguments: [this.repository.sourceControl, null]
            };
        }
        // Merge Continue
        if (this.state.isMergeInProgress) {
            return {
                command: 'git.commit',
                title: vscode_1.l10n.t('{0} Continue', '$(check)'),
                tooltip: this.state.isCommitInProgress ? vscode_1.l10n.t('Continuing Merge...') : vscode_1.l10n.t('Continue Merge'),
                arguments: [this.repository.sourceControl, null]
            };
        }
        // Not a branch (tag, detached)
        if (this.state.HEAD?.type === git_constants_1.RefType.Tag || !this.state.HEAD?.name) {
            return {
                command: 'git.commit',
                title: vscode_1.l10n.t('{0} Commit', '$(check)'),
                tooltip: this.state.isCommitInProgress ? vscode_1.l10n.t('Committing Changes...') : vscode_1.l10n.t('Commit Changes'),
                arguments: [this.repository.sourceControl, null]
            };
        }
        // Commit
        return this.postCommitCommandCenter.getPrimaryCommand();
    }
    getCommitActionButtonSecondaryCommands() {
        // Rebase Continue
        if (this.state.isRebaseInProgress) {
            return [];
        }
        // Merge Continue
        if (this.state.isMergeInProgress) {
            return [];
        }
        // Not a branch (tag, detached)
        if (this.state.HEAD?.type === git_constants_1.RefType.Tag || !this.state.HEAD?.name) {
            return [];
        }
        // Commit
        const commandGroups = [];
        for (const commands of this.postCommitCommandCenter.getSecondaryCommands()) {
            commandGroups.push(commands.map(c => {
                return { command: c.command, title: c.title, tooltip: c.tooltip, arguments: c.arguments };
            }));
        }
        return commandGroups;
    }
    getPublishBranchActionButton() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        const showActionButton = config.get('showActionButton', { publish: true });
        // Not a branch (tag, detached), branch does have an upstream, commit/merge/rebase is in progress, or the button is disabled
        if (this.state.HEAD?.type === git_constants_1.RefType.Tag || !this.state.HEAD?.name || this.state.HEAD?.upstream || this.state.isCommitInProgress || this.state.isMergeInProgress || this.state.isRebaseInProgress || !showActionButton.publish) {
            return undefined;
        }
        // Button icon
        const icon = this.state.isSyncInProgress ? '$(sync~spin)' : '$(cloud-upload)';
        return {
            command: {
                command: 'git.publish',
                title: vscode_1.l10n.t({ message: '{0} Publish Branch', args: [icon], comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] }),
                tooltip: this.state.isSyncInProgress ?
                    (this.state.HEAD?.name ?
                        vscode_1.l10n.t({ message: 'Publishing Branch "{0}"...', args: [this.state.HEAD.name], comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] }) :
                        vscode_1.l10n.t({ message: 'Publishing Branch...', comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] })) :
                    (this.repository.HEAD?.name ?
                        vscode_1.l10n.t({ message: 'Publish Branch "{0}"', args: [this.state.HEAD?.name], comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] }) :
                        vscode_1.l10n.t({ message: 'Publish Branch', comment: ['{Locked="Branch"}', 'Do not translate "Branch" as it is a git term'] })),
                arguments: [this.repository.sourceControl],
            },
            enabled: !this.state.isCheckoutInProgress && !this.state.isSyncInProgress
        };
    }
    getSyncChangesActionButton() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        const showActionButton = config.get('showActionButton', { sync: true });
        const branchIsAheadOrBehind = (this.state.HEAD?.behind ?? 0) > 0 || (this.state.HEAD?.ahead ?? 0) > 0;
        // Branch does not have an upstream, branch is not ahead/behind the remote branch, commit/merge/rebase is in progress, or the button is disabled
        if (!this.state.HEAD?.upstream || !branchIsAheadOrBehind || this.state.isCommitInProgress || this.state.isMergeInProgress || this.state.isRebaseInProgress || !showActionButton.sync) {
            return undefined;
        }
        const ahead = this.state.HEAD.ahead ? ` ${this.state.HEAD.ahead}$(arrow-up)` : '';
        const behind = this.state.HEAD.behind ? ` ${this.state.HEAD.behind}$(arrow-down)` : '';
        const icon = this.state.isSyncInProgress ? '$(sync~spin)' : '$(sync)';
        return {
            command: {
                command: 'git.sync',
                title: vscode_1.l10n.t('{0} Sync Changes{1}{2}', icon, behind, ahead),
                shortTitle: `${icon}${behind}${ahead}`,
                tooltip: this.state.isSyncInProgress ?
                    vscode_1.l10n.t('Synchronizing Changes...')
                    : this.repository.syncTooltip,
                arguments: [this.repository.sourceControl],
            },
            enabled: !this.state.isCheckoutInProgress && !this.state.isSyncInProgress
        };
    }
    onDidChangeOperations() {
        const isCheckoutInProgress = this.repository.operations.isRunning("Checkout" /* OperationKind.Checkout */) ||
            this.repository.operations.isRunning("CheckoutTracking" /* OperationKind.CheckoutTracking */);
        const isCommitInProgress = this.repository.operations.isRunning("Commit" /* OperationKind.Commit */) ||
            this.repository.operations.isRunning("PostCommitCommand" /* OperationKind.PostCommitCommand */) ||
            this.repository.operations.isRunning("RebaseContinue" /* OperationKind.RebaseContinue */);
        const isSyncInProgress = this.repository.operations.isRunning("Sync" /* OperationKind.Sync */) ||
            this.repository.operations.isRunning("Push" /* OperationKind.Push */) ||
            this.repository.operations.isRunning("Pull" /* OperationKind.Pull */);
        this.state = { ...this.state, isCheckoutInProgress, isCommitInProgress, isSyncInProgress };
    }
    onDidChangeSmartCommitSettings() {
        this.state = {
            ...this.state,
            repositoryHasChangesToCommit: this.repositoryHasChangesToCommit()
        };
    }
    onDidRunGitStatus() {
        this.state = {
            ...this.state,
            HEAD: this.repository.HEAD,
            isMergeInProgress: this.repository.mergeInProgress,
            isRebaseInProgress: !!this.repository.rebaseCommit,
            repositoryHasChangesToCommit: this.repositoryHasChangesToCommit(),
            repositoryHasUnresolvedConflicts: this.repository.mergeGroup.resourceStates.length > 0
        };
    }
    repositoryHasChangesToCommit() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        const enableSmartCommit = config.get('enableSmartCommit') === true;
        const suggestSmartCommit = config.get('suggestSmartCommit') === true;
        const smartCommitChanges = config.get('smartCommitChanges', 'all');
        const resources = [...this.repository.indexGroup.resourceStates];
        if (
        // Smart commit enabled (all)
        (enableSmartCommit && smartCommitChanges === 'all') ||
            // Smart commit disabled, smart suggestion enabled
            (!enableSmartCommit && suggestSmartCommit)) {
            resources.push(...this.repository.workingTreeGroup.resourceStates);
        }
        // Smart commit enabled (tracked only)
        if (enableSmartCommit && smartCommitChanges === 'tracked') {
            resources.push(...this.repository.workingTreeGroup.resourceStates.filter(r => r.type !== git_constants_1.Status.UNTRACKED));
        }
        return resources.length !== 0;
    }
    dispose() {
        this.disposables = (0, util_1.dispose)(this.disposables);
    }
}
exports.ActionButton = ActionButton;
//# sourceMappingURL=actionButton.js.map