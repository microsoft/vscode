"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBarCommands = void 0;
const vscode_1 = require("vscode");
const util_1 = require("./util");
const git_constants_1 = require("./api/git.constants");
class CheckoutStatusBar {
    repository;
    _onDidChange = new vscode_1.EventEmitter();
    get onDidChange() { return this._onDidChange.event; }
    disposables = [];
    _state;
    get state() { return this._state; }
    set state(state) {
        this._state = state;
        this._onDidChange.fire();
    }
    constructor(repository) {
        this.repository = repository;
        this._state = {
            isCheckoutRunning: false,
            isCommitRunning: false,
            isSyncRunning: false
        };
        repository.onDidChangeOperations(this.onDidChangeOperations, this, this.disposables);
        repository.onDidRunGitStatus(this._onDidChange.fire, this._onDidChange, this.disposables);
        repository.onDidChangeBranchProtection(this._onDidChange.fire, this._onDidChange, this.disposables);
    }
    get command() {
        const operationData = [
            ...this.repository.operations.getOperations("Checkout" /* OperationKind.Checkout */),
            ...this.repository.operations.getOperations("CheckoutTracking" /* OperationKind.CheckoutTracking */)
        ];
        const rebasing = !!this.repository.rebaseCommit;
        const label = operationData[0]?.refLabel ?? `${this.repository.headLabel}${rebasing ? ` (${vscode_1.l10n.t('Rebasing')})` : ''}`;
        const command = (this.state.isCheckoutRunning || this.state.isCommitRunning || this.state.isSyncRunning) ? '' : 'git.checkout';
        return {
            command,
            tooltip: `${label}, ${this.getTooltip()}`,
            title: `${this.getIcon()} ${label}`,
            arguments: [this.repository.sourceControl]
        };
    }
    getIcon() {
        if (!this.repository.HEAD) {
            return '';
        }
        // Checkout
        if (this.state.isCheckoutRunning) {
            return '$(loading~spin)';
        }
        // Branch
        if (this.repository.HEAD.type === git_constants_1.RefType.Head && this.repository.HEAD.name) {
            switch (true) {
                case this.repository.isBranchProtected():
                    return '$(lock)';
                case this.repository.mergeInProgress || !!this.repository.rebaseCommit:
                    return '$(git-branch-conflicts)';
                case this.repository.indexGroup.resourceStates.length > 0:
                    return '$(git-branch-staged-changes)';
                case this.repository.workingTreeGroup.resourceStates.length + this.repository.untrackedGroup.resourceStates.length > 0:
                    return '$(git-branch-changes)';
                default:
                    return '$(git-branch)';
            }
        }
        // Tag
        if (this.repository.HEAD.type === git_constants_1.RefType.Tag) {
            return '$(tag)';
        }
        // Commit
        return '$(git-commit)';
    }
    getTooltip() {
        if (this.state.isCheckoutRunning) {
            return vscode_1.l10n.t('Checking Out Branch/Tag...');
        }
        if (this.state.isCommitRunning) {
            return vscode_1.l10n.t('Committing Changes...');
        }
        if (this.state.isSyncRunning) {
            return vscode_1.l10n.t('Synchronizing Changes...');
        }
        return vscode_1.l10n.t('Checkout Branch/Tag...');
    }
    onDidChangeOperations() {
        const isCommitRunning = this.repository.operations.isRunning("Commit" /* OperationKind.Commit */);
        const isCheckoutRunning = this.repository.operations.isRunning("Checkout" /* OperationKind.Checkout */) ||
            this.repository.operations.isRunning("CheckoutTracking" /* OperationKind.CheckoutTracking */);
        const isSyncRunning = this.repository.operations.isRunning("Sync" /* OperationKind.Sync */) ||
            this.repository.operations.isRunning("Push" /* OperationKind.Push */) ||
            this.repository.operations.isRunning("Pull" /* OperationKind.Pull */);
        this.state = { ...this.state, isCheckoutRunning, isCommitRunning, isSyncRunning };
    }
    dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}
class SyncStatusBar {
    repository;
    remoteSourcePublisherRegistry;
    _onDidChange = new vscode_1.EventEmitter();
    get onDidChange() { return this._onDidChange.event; }
    disposables = [];
    _state;
    get state() { return this._state; }
    set state(state) {
        this._state = state;
        this._onDidChange.fire();
    }
    constructor(repository, remoteSourcePublisherRegistry) {
        this.repository = repository;
        this.remoteSourcePublisherRegistry = remoteSourcePublisherRegistry;
        this._state = {
            enabled: true,
            isCheckoutRunning: false,
            isCommitRunning: false,
            isSyncRunning: false,
            hasRemotes: false,
            HEAD: undefined,
            remoteSourcePublishers: remoteSourcePublisherRegistry.getRemoteSourcePublishers()
        };
        repository.onDidRunGitStatus(this.onDidRunGitStatus, this, this.disposables);
        repository.onDidChangeOperations(this.onDidChangeOperations, this, this.disposables);
        (0, util_1.anyEvent)(remoteSourcePublisherRegistry.onDidAddRemoteSourcePublisher, remoteSourcePublisherRegistry.onDidRemoveRemoteSourcePublisher)(this.onDidChangeRemoteSourcePublishers, this, this.disposables);
        const onEnablementChange = (0, util_1.filterEvent)(vscode_1.workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.enableStatusBarSync'));
        onEnablementChange(this.updateEnablement, this, this.disposables);
        this.updateEnablement();
    }
    updateEnablement() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        const enabled = config.get('enableStatusBarSync', true);
        this.state = { ...this.state, enabled };
    }
    onDidChangeOperations() {
        const isCommitRunning = this.repository.operations.isRunning("Commit" /* OperationKind.Commit */);
        const isCheckoutRunning = this.repository.operations.isRunning("Checkout" /* OperationKind.Checkout */) ||
            this.repository.operations.isRunning("CheckoutTracking" /* OperationKind.CheckoutTracking */);
        const isSyncRunning = this.repository.operations.isRunning("Sync" /* OperationKind.Sync */) ||
            this.repository.operations.isRunning("Push" /* OperationKind.Push */) ||
            this.repository.operations.isRunning("Pull" /* OperationKind.Pull */);
        this.state = { ...this.state, isCheckoutRunning, isCommitRunning, isSyncRunning };
    }
    onDidRunGitStatus() {
        this.state = {
            ...this.state,
            hasRemotes: this.repository.remotes.length > 0,
            HEAD: this.repository.HEAD
        };
    }
    onDidChangeRemoteSourcePublishers() {
        this.state = {
            ...this.state,
            remoteSourcePublishers: this.remoteSourcePublisherRegistry.getRemoteSourcePublishers()
        };
    }
    get command() {
        if (!this.state.enabled) {
            return;
        }
        if (!this.state.hasRemotes) {
            if (this.state.remoteSourcePublishers.length === 0) {
                return;
            }
            const command = (this.state.isCheckoutRunning || this.state.isCommitRunning) ? '' : 'git.publish';
            const tooltip = this.state.isCheckoutRunning ? vscode_1.l10n.t('Checking Out Changes...') :
                this.state.isCommitRunning ? vscode_1.l10n.t('Committing Changes...') :
                    this.state.remoteSourcePublishers.length === 1
                        ? vscode_1.l10n.t('Publish to {0}', this.state.remoteSourcePublishers[0].name)
                        : vscode_1.l10n.t('Publish to...');
            return {
                command,
                title: `$(cloud-upload)`,
                tooltip,
                arguments: [this.repository.sourceControl]
            };
        }
        const HEAD = this.state.HEAD;
        let icon = '$(sync)';
        let text = '';
        let command = '';
        let tooltip = '';
        if (HEAD && HEAD.name && HEAD.commit) {
            if (HEAD.upstream) {
                if (HEAD.ahead || HEAD.behind) {
                    text += this.repository.syncLabel;
                }
                command = 'git.sync';
                tooltip = this.repository.syncTooltip;
            }
            else {
                icon = '$(cloud-upload)';
                command = 'git.publish';
                tooltip = vscode_1.l10n.t('Publish Branch');
            }
        }
        else {
            command = '';
            tooltip = '';
        }
        if (this.state.isCheckoutRunning) {
            command = '';
            tooltip = vscode_1.l10n.t('Checking Out Changes...');
        }
        if (this.state.isCommitRunning) {
            command = '';
            tooltip = vscode_1.l10n.t('Committing Changes...');
        }
        if (this.state.isSyncRunning) {
            icon = '$(sync~spin)';
            command = '';
            tooltip = vscode_1.l10n.t('Synchronizing Changes...');
        }
        return {
            command,
            title: [icon, text].join(' ').trim(),
            tooltip,
            arguments: [this.repository.sourceControl]
        };
    }
    dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}
class StatusBarCommands {
    repository;
    onDidChange;
    syncStatusBar;
    checkoutStatusBar;
    disposables = [];
    constructor(repository, remoteSourcePublisherRegistry) {
        this.repository = repository;
        this.syncStatusBar = new SyncStatusBar(repository, remoteSourcePublisherRegistry);
        this.checkoutStatusBar = new CheckoutStatusBar(repository);
        this.onDidChange = (0, util_1.anyEvent)(this.syncStatusBar.onDidChange, this.checkoutStatusBar.onDidChange);
    }
    get commands() {
        if (this.repository.isHidden) {
            return [];
        }
        return [this.checkoutStatusBar.command, this.syncStatusBar.command]
            .filter((c) => !!c);
    }
    dispose() {
        this.syncStatusBar.dispose();
        this.checkoutStatusBar.dispose();
        this.disposables = (0, util_1.dispose)(this.disposables);
    }
}
exports.StatusBarCommands = StatusBarCommands;
//# sourceMappingURL=statusbar.js.map