"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeVersionManager = void 0;
const vscode = __importStar(require("vscode"));
const async_1 = require("../utils/async");
const dispose_1 = require("../utils/dispose");
const useWorkspaceNodeStorageKey = 'typescript.useWorkspaceNode';
const lastKnownWorkspaceNodeStorageKey = 'typescript.lastKnownWorkspaceNode';
class NodeVersionManager extends dispose_1.Disposable {
    configuration;
    workspaceState;
    _currentVersion;
    constructor(configuration, workspaceState) {
        super();
        this.configuration = configuration;
        this.workspaceState = workspaceState;
        this._currentVersion = this.configuration.globalNodePath || undefined;
        if (vscode.workspace.isTrusted) {
            const workspaceVersion = this.configuration.localNodePath;
            if (workspaceVersion) {
                const useWorkspaceNode = this.canUseWorkspaceNode(workspaceVersion);
                if (useWorkspaceNode === undefined) {
                    (0, async_1.setImmediate)(() => {
                        this.promptAndSetWorkspaceNode();
                    });
                }
                else if (useWorkspaceNode) {
                    this._currentVersion = workspaceVersion;
                }
            }
        }
        else {
            this._disposables.push(vscode.workspace.onDidGrantWorkspaceTrust(() => {
                const workspaceVersion = this.configuration.localNodePath;
                if (workspaceVersion) {
                    const useWorkspaceNode = this.canUseWorkspaceNode(workspaceVersion);
                    if (useWorkspaceNode === undefined) {
                        (0, async_1.setImmediate)(() => {
                            this.promptAndSetWorkspaceNode();
                        });
                    }
                    else if (useWorkspaceNode) {
                        this.updateActiveVersion(workspaceVersion);
                    }
                }
            }));
        }
    }
    _onDidPickNewVersion = this._register(new vscode.EventEmitter());
    onDidPickNewVersion = this._onDidPickNewVersion.event;
    get currentVersion() {
        return this._currentVersion;
    }
    async updateConfiguration(nextConfiguration) {
        const oldConfiguration = this.configuration;
        this.configuration = nextConfiguration;
        if (oldConfiguration.globalNodePath !== nextConfiguration.globalNodePath
            || oldConfiguration.localNodePath !== nextConfiguration.localNodePath) {
            await this.computeNewVersion();
        }
    }
    async computeNewVersion() {
        let version = this.configuration.globalNodePath || undefined;
        const workspaceVersion = this.configuration.localNodePath;
        if (vscode.workspace.isTrusted && workspaceVersion) {
            const useWorkspaceNode = this.canUseWorkspaceNode(workspaceVersion);
            if (useWorkspaceNode === undefined) {
                version = await this.promptUseWorkspaceNode() || version;
            }
            else if (useWorkspaceNode) {
                version = workspaceVersion;
            }
        }
        this.updateActiveVersion(version);
    }
    async promptUseWorkspaceNode() {
        const workspaceVersion = this.configuration.localNodePath;
        if (workspaceVersion === null) {
            throw new Error('Could not prompt to use workspace Node installation because no workspace Node installation is specified');
        }
        const allow = vscode.l10n.t("Yes");
        const disallow = vscode.l10n.t("No");
        const dismiss = vscode.l10n.t("Not now");
        const result = await vscode.window.showInformationMessage(vscode.l10n.t("This workspace wants to use the Node installation at '{0}' to run TS Server. Would you like to use it?", workspaceVersion), allow, disallow, dismiss);
        let version = undefined;
        switch (result) {
            case allow:
                await this.setUseWorkspaceNodeState(true, workspaceVersion);
                version = workspaceVersion;
                break;
            case disallow:
                await this.setUseWorkspaceNodeState(false, workspaceVersion);
                break;
            case dismiss:
                await this.setUseWorkspaceNodeState(undefined, workspaceVersion);
                break;
        }
        return version;
    }
    async promptAndSetWorkspaceNode() {
        const version = await this.promptUseWorkspaceNode();
        if (version !== undefined) {
            this.updateActiveVersion(version);
        }
    }
    updateActiveVersion(pickedVersion) {
        const oldVersion = this.currentVersion;
        this._currentVersion = pickedVersion;
        if (oldVersion !== pickedVersion) {
            this._onDidPickNewVersion.fire();
        }
    }
    canUseWorkspaceNode(nodeVersion) {
        const lastKnownWorkspaceNode = this.workspaceState.get(lastKnownWorkspaceNodeStorageKey);
        if (lastKnownWorkspaceNode === nodeVersion) {
            return this.workspaceState.get(useWorkspaceNodeStorageKey);
        }
        return undefined;
    }
    async setUseWorkspaceNodeState(allow, nodeVersion) {
        await this.workspaceState.update(lastKnownWorkspaceNodeStorageKey, nodeVersion);
        await this.workspaceState.update(useWorkspaceNodeStorageKey, allow);
    }
}
exports.NodeVersionManager = NodeVersionManager;
//# sourceMappingURL=nodeManager.js.map