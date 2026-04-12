"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitBranchProtectionProvider = void 0;
const vscode_1 = require("vscode");
const util_1 = require("./util");
class GitBranchProtectionProvider {
    repositoryRoot;
    _onDidChangeBranchProtection = new vscode_1.EventEmitter();
    onDidChangeBranchProtection = this._onDidChangeBranchProtection.event;
    branchProtection;
    disposables = [];
    constructor(repositoryRoot) {
        this.repositoryRoot = repositoryRoot;
        const onDidChangeBranchProtectionEvent = (0, util_1.filterEvent)(vscode_1.workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.branchProtection', repositoryRoot));
        onDidChangeBranchProtectionEvent(this.updateBranchProtection, this, this.disposables);
        this.updateBranchProtection();
    }
    provideBranchProtection() {
        return [this.branchProtection];
    }
    updateBranchProtection() {
        const scopedConfig = vscode_1.workspace.getConfiguration('git', this.repositoryRoot);
        const branchProtectionConfig = scopedConfig.get('branchProtection') ?? [];
        const branchProtectionValues = Array.isArray(branchProtectionConfig) ? branchProtectionConfig : [branchProtectionConfig];
        const branches = branchProtectionValues
            .map(bp => typeof bp === 'string' ? bp.trim() : '')
            .filter(bp => bp !== '');
        this.branchProtection = { remote: '', rules: [{ include: branches }] };
        this._onDidChangeBranchProtection.fire(this.repositoryRoot);
    }
    dispose() {
        this.disposables = (0, util_1.dispose)(this.disposables);
    }
}
exports.GitBranchProtectionProvider = GitBranchProtectionProvider;
//# sourceMappingURL=branchProtection.js.map