"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalShellExecutionManager = exports.TerminalEnvironmentManager = void 0;
const vscode_1 = require("vscode");
const util_1 = require("./util");
class TerminalEnvironmentManager {
    context;
    envProviders;
    disposable;
    constructor(context, envProviders) {
        this.context = context;
        this.envProviders = envProviders;
        this.disposable = (0, util_1.filterEvent)(vscode_1.workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git'))(this.refresh, this);
        this.refresh();
    }
    refresh() {
        const config = vscode_1.workspace.getConfiguration('git', null);
        this.context.environmentVariableCollection.clear();
        if (!config.get('enabled', true)) {
            return;
        }
        const features = [];
        for (const envProvider of this.envProviders) {
            const terminalEnv = envProvider?.getTerminalEnv() ?? {};
            for (const name of Object.keys(terminalEnv)) {
                this.context.environmentVariableCollection.replace(name, terminalEnv[name]);
            }
            if (envProvider?.featureDescription && Object.keys(terminalEnv).length > 0) {
                features.push(envProvider.featureDescription);
            }
        }
        if (features.length) {
            this.context.environmentVariableCollection.description = vscode_1.l10n.t('Enables the following features: {0}', features.join(', '));
        }
    }
    dispose() {
        this.disposable.dispose();
    }
}
exports.TerminalEnvironmentManager = TerminalEnvironmentManager;
class TerminalShellExecutionManager {
    model;
    logger;
    subcommands = new Set([
        'add', 'branch', 'checkout', 'cherry-pick', 'clean', 'commit', 'fetch', 'merge',
        'mv', 'rebase', 'reset', 'restore', 'revert', 'rm', 'pull', 'push', 'stash', 'switch'
    ]);
    disposables = [];
    constructor(model, logger) {
        this.model = model;
        this.logger = logger;
        vscode_1.window.onDidEndTerminalShellExecution(this.onDidEndTerminalShellExecution, this, this.disposables);
    }
    onDidEndTerminalShellExecution(e) {
        const { execution, exitCode, shellIntegration } = e;
        const [executable, subcommand] = execution.commandLine.value.split(/\s+/);
        const cwd = execution.cwd ?? shellIntegration.cwd;
        if (executable.toLowerCase() !== 'git' || !this.subcommands.has(subcommand?.toLowerCase()) || !cwd || exitCode !== 0) {
            return;
        }
        this.logger.trace(`[TerminalShellExecutionManager][onDidEndTerminalShellExecution] Matched git subcommand: ${subcommand}`);
        const repository = this.model.getRepository(cwd);
        if (!repository) {
            this.logger.trace(`[TerminalShellExecutionManager][onDidEndTerminalShellExecution] Unable to find repository for current working directory: ${cwd.toString()}`);
            return;
        }
        repository.status();
    }
    dispose() {
        (0, util_1.dispose)(this.disposables);
    }
}
exports.TerminalShellExecutionManager = TerminalShellExecutionManager;
//# sourceMappingURL=terminal.js.map