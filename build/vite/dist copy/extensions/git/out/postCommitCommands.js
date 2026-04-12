"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommitCommandsCenter = exports.GitPostCommitCommandsProvider = void 0;
const vscode_1 = require("vscode");
const api1_1 = require("./api/api1");
const util_1 = require("./util");
class GitPostCommitCommandsProvider {
    _repositoryResolver;
    constructor(_repositoryResolver) {
        this._repositoryResolver = _repositoryResolver;
    }
    getCommands(apiRepository) {
        const repository = this._repositoryResolver.getRepository(apiRepository.rootUri);
        if (!repository) {
            return [];
        }
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(repository.root));
        // Branch protection
        const isBranchProtected = repository.isBranchProtected();
        const branchProtectionPrompt = config.get('branchProtectionPrompt');
        const alwaysPrompt = isBranchProtected && branchProtectionPrompt === 'alwaysPrompt';
        const alwaysCommitToNewBranch = isBranchProtected && branchProtectionPrompt === 'alwaysCommitToNewBranch';
        // Icon
        const isCommitInProgress = repository.operations.isRunning("Commit" /* OperationKind.Commit */) || repository.operations.isRunning("PostCommitCommand" /* OperationKind.PostCommitCommand */);
        const icon = isCommitInProgress ? '$(sync~spin)' : alwaysPrompt ? '$(lock)' : alwaysCommitToNewBranch ? '$(git-branch)' : undefined;
        // Tooltip (default)
        let pushCommandTooltip = !alwaysCommitToNewBranch ?
            vscode_1.l10n.t('Commit & Push Changes') :
            vscode_1.l10n.t('Commit to New Branch & Push Changes');
        let syncCommandTooltip = !alwaysCommitToNewBranch ?
            vscode_1.l10n.t('Commit & Sync Changes') :
            vscode_1.l10n.t('Commit to New Branch & Synchronize Changes');
        // Tooltip (in progress)
        if (isCommitInProgress) {
            pushCommandTooltip = !alwaysCommitToNewBranch ?
                vscode_1.l10n.t('Committing & Pushing Changes...') :
                vscode_1.l10n.t('Committing to New Branch & Pushing Changes...');
            syncCommandTooltip = !alwaysCommitToNewBranch ?
                vscode_1.l10n.t('Committing & Synchronizing Changes...') :
                vscode_1.l10n.t('Committing to New Branch & Synchronizing Changes...');
        }
        return [
            {
                command: 'git.push',
                title: vscode_1.l10n.t('{0} Commit & Push', icon ?? '$(arrow-up)'),
                tooltip: pushCommandTooltip
            },
            {
                command: 'git.sync',
                title: vscode_1.l10n.t('{0} Commit & Sync', icon ?? '$(sync)'),
                tooltip: syncCommandTooltip
            },
        ];
    }
}
exports.GitPostCommitCommandsProvider = GitPostCommitCommandsProvider;
class CommitCommandsCenter {
    globalState;
    repository;
    postCommitCommandsProviderRegistry;
    _onDidChange = new vscode_1.EventEmitter();
    get onDidChange() { return this._onDidChange.event; }
    disposables = [];
    set postCommitCommand(command) {
        if (command === undefined) {
            // Commit WAS NOT initiated using the action button
            // so there is no need to store the post-commit command
            return;
        }
        this.globalState.update(this.getGlobalStateKey(), command)
            .then(() => this._onDidChange.fire());
    }
    constructor(globalState, repository, postCommitCommandsProviderRegistry) {
        this.globalState = globalState;
        this.repository = repository;
        this.postCommitCommandsProviderRegistry = postCommitCommandsProviderRegistry;
        const root = vscode_1.Uri.file(repository.root);
        // Migrate post commit command storage
        this.migratePostCommitCommandStorage()
            .then(() => {
            const onRememberPostCommitCommandChange = async () => {
                const config = vscode_1.workspace.getConfiguration('git', root);
                if (!config.get('rememberPostCommitCommand')) {
                    await this.globalState.update(this.getGlobalStateKey(), undefined);
                }
            };
            this.disposables.push(vscode_1.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('git.rememberPostCommitCommand', root)) {
                    onRememberPostCommitCommandChange();
                }
            }));
            onRememberPostCommitCommandChange();
            this.disposables.push(postCommitCommandsProviderRegistry.onDidChangePostCommitCommandsProviders(() => this._onDidChange.fire()));
        });
    }
    getPrimaryCommand() {
        const allCommands = this.getSecondaryCommands().map(c => c).flat();
        const commandFromStorage = allCommands.find(c => c.arguments?.length === 2 && c.arguments[1] === this.getPostCommitCommandStringFromStorage());
        const commandFromSetting = allCommands.find(c => c.arguments?.length === 2 && c.arguments[1] === this.getPostCommitCommandStringFromSetting());
        return commandFromStorage ?? commandFromSetting ?? this.getCommitCommands()[0];
    }
    getSecondaryCommands() {
        const commandGroups = [];
        for (const provider of this.postCommitCommandsProviderRegistry.getPostCommitCommandsProviders()) {
            const commands = provider.getCommands(new api1_1.ApiRepository(this.repository));
            commandGroups.push((commands ?? []).map(c => {
                return { command: 'git.commit', title: c.title, tooltip: c.tooltip, arguments: [this.repository.sourceControl, c.command] };
            }));
        }
        if (commandGroups.length > 0) {
            commandGroups.splice(0, 0, this.getCommitCommands());
        }
        return commandGroups;
    }
    async executePostCommitCommand(command) {
        try {
            if (command === null) {
                // No post-commit command
                return;
            }
            if (command === undefined) {
                // Commit WAS NOT initiated using the action button (ex: keybinding, toolbar action,
                // command palette) so we have to honour the default post commit command (memento/setting).
                const primaryCommand = this.getPrimaryCommand();
                command = primaryCommand.arguments?.length === 2 ? primaryCommand.arguments[1] : null;
            }
            if (command !== null) {
                await vscode_1.commands.executeCommand(command.toString(), new api1_1.ApiRepository(this.repository));
            }
        }
        catch (err) {
            throw err;
        }
        finally {
            if (!this.isRememberPostCommitCommandEnabled()) {
                await this.globalState.update(this.getGlobalStateKey(), undefined);
                this._onDidChange.fire();
            }
        }
    }
    getGlobalStateKey() {
        return `postCommitCommand:${this.repository.root}`;
    }
    getCommitCommands() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        // Branch protection
        const isBranchProtected = this.repository.isBranchProtected();
        const branchProtectionPrompt = config.get('branchProtectionPrompt');
        const alwaysPrompt = isBranchProtected && branchProtectionPrompt === 'alwaysPrompt';
        const alwaysCommitToNewBranch = isBranchProtected && branchProtectionPrompt === 'alwaysCommitToNewBranch';
        // Icon
        const icon = alwaysPrompt ? '$(lock)' : alwaysCommitToNewBranch ? '$(git-branch)' : undefined;
        // Tooltip (default)
        const branch = this.repository.HEAD?.name;
        let tooltip = alwaysCommitToNewBranch ?
            vscode_1.l10n.t('Commit Changes to New Branch') :
            branch ?
                vscode_1.l10n.t('Commit Changes on "{0}"', branch) :
                vscode_1.l10n.t('Commit Changes');
        // Tooltip (in progress)
        if (this.repository.operations.isRunning("Commit" /* OperationKind.Commit */)) {
            tooltip = !alwaysCommitToNewBranch ?
                vscode_1.l10n.t('Committing Changes...') :
                vscode_1.l10n.t('Committing Changes to New Branch...');
        }
        return [
            { command: 'git.commit', title: vscode_1.l10n.t('{0} Commit', icon ?? '$(check)'), tooltip, arguments: [this.repository.sourceControl, null] },
            { command: 'git.commitAmend', title: vscode_1.l10n.t('{0} Commit (Amend)', icon ?? '$(check)'), tooltip, arguments: [this.repository.sourceControl, null] },
        ];
    }
    getPostCommitCommandStringFromSetting() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        const postCommitCommandSetting = config.get('postCommitCommand');
        return postCommitCommandSetting === 'push' || postCommitCommandSetting === 'sync' ? `git.${postCommitCommandSetting}` : undefined;
    }
    getPostCommitCommandStringFromStorage() {
        return this.globalState.get(this.getGlobalStateKey());
    }
    async migratePostCommitCommandStorage() {
        const postCommitCommandString = this.globalState.get(this.repository.root);
        if (postCommitCommandString !== undefined) {
            await this.globalState.update(this.getGlobalStateKey(), postCommitCommandString);
            await this.globalState.update(this.repository.root, undefined);
        }
    }
    isRememberPostCommitCommandEnabled() {
        const config = vscode_1.workspace.getConfiguration('git', vscode_1.Uri.file(this.repository.root));
        return config.get('rememberPostCommitCommand') === true;
    }
    dispose() {
        this.disposables = (0, util_1.dispose)(this.disposables);
    }
}
exports.CommitCommandsCenter = CommitCommandsCenter;
//# sourceMappingURL=postCommitCommands.js.map