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
exports.PreviewSecuritySelector = exports.ExtensionContentSecurityPolicyArbiter = void 0;
const vscode = __importStar(require("vscode"));
class ExtensionContentSecurityPolicyArbiter {
    #old_trusted_workspace_key = 'trusted_preview_workspace:';
    #security_level_key = 'preview_security_level:';
    #should_disable_security_warning_key = 'preview_should_show_security_warning:';
    #globalState;
    #workspaceState;
    constructor(globalState, workspaceState) {
        this.#globalState = globalState;
        this.#workspaceState = workspaceState;
    }
    getSecurityLevelForResource(resource) {
        // Use new security level setting first
        const level = this.#globalState.get(this.#security_level_key + this.#getRoot(resource), undefined);
        if (typeof level !== 'undefined') {
            return level;
        }
        // Fallback to old trusted workspace setting
        if (this.#globalState.get(this.#old_trusted_workspace_key + this.#getRoot(resource), false)) {
            return 2 /* MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent */;
        }
        return 0 /* MarkdownPreviewSecurityLevel.Strict */;
    }
    setSecurityLevelForResource(resource, level) {
        return this.#globalState.update(this.#security_level_key + this.#getRoot(resource), level);
    }
    shouldAllowSvgsForResource(resource) {
        const securityLevel = this.getSecurityLevelForResource(resource);
        return securityLevel === 1 /* MarkdownPreviewSecurityLevel.AllowInsecureContent */ || securityLevel === 2 /* MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent */;
    }
    shouldDisableSecurityWarnings() {
        return this.#workspaceState.get(this.#should_disable_security_warning_key, false);
    }
    setShouldDisableSecurityWarning(disabled) {
        return this.#workspaceState.update(this.#should_disable_security_warning_key, disabled);
    }
    #getRoot(resource) {
        if (vscode.workspace.workspaceFolders) {
            const folderForResource = vscode.workspace.getWorkspaceFolder(resource);
            if (folderForResource) {
                return folderForResource.uri;
            }
            if (vscode.workspace.workspaceFolders.length) {
                return vscode.workspace.workspaceFolders[0].uri;
            }
        }
        return resource;
    }
}
exports.ExtensionContentSecurityPolicyArbiter = ExtensionContentSecurityPolicyArbiter;
class PreviewSecuritySelector {
    #cspArbiter;
    #webviewManager;
    constructor(cspArbiter, webviewManager) {
        this.#cspArbiter = cspArbiter;
        this.#webviewManager = webviewManager;
    }
    async showSecuritySelectorForResource(resource) {
        function markActiveWhen(when) {
            return when ? '• ' : '';
        }
        const currentSecurityLevel = this.#cspArbiter.getSecurityLevelForResource(resource);
        const selection = await vscode.window.showQuickPick([
            {
                type: 0 /* MarkdownPreviewSecurityLevel.Strict */,
                label: markActiveWhen(currentSecurityLevel === 0 /* MarkdownPreviewSecurityLevel.Strict */) + vscode.l10n.t("Strict"),
                description: vscode.l10n.t("Only load secure content"),
            },
            {
                type: 3 /* MarkdownPreviewSecurityLevel.AllowInsecureLocalContent */,
                label: markActiveWhen(currentSecurityLevel === 3 /* MarkdownPreviewSecurityLevel.AllowInsecureLocalContent */) + vscode.l10n.t("Allow insecure local content"),
                description: vscode.l10n.t("Enable loading content over http served from localhost"),
            },
            {
                type: 1 /* MarkdownPreviewSecurityLevel.AllowInsecureContent */,
                label: markActiveWhen(currentSecurityLevel === 1 /* MarkdownPreviewSecurityLevel.AllowInsecureContent */) + vscode.l10n.t("Allow insecure content"),
                description: vscode.l10n.t("Enable loading content over http"),
            },
            {
                type: 2 /* MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent */,
                label: markActiveWhen(currentSecurityLevel === 2 /* MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent */) + vscode.l10n.t("Disable"),
                description: vscode.l10n.t("Allow all content and script execution. Not recommended"),
            },
            {
                type: 'moreinfo',
                label: vscode.l10n.t("More Information"),
                description: ''
            }, {
                type: 'toggle',
                label: this.#cspArbiter.shouldDisableSecurityWarnings()
                    ? vscode.l10n.t("Enable preview security warnings in this workspace")
                    : vscode.l10n.t("Disable preview security warning in this workspace"),
                description: vscode.l10n.t("Does not affect the content security level")
            },
        ], {
            placeHolder: vscode.l10n.t("Select security settings for Markdown previews in this workspace"),
        });
        if (!selection) {
            return;
        }
        if (selection.type === 'moreinfo') {
            vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://go.microsoft.com/fwlink/?linkid=854414'));
            return;
        }
        if (selection.type === 'toggle') {
            this.#cspArbiter.setShouldDisableSecurityWarning(!this.#cspArbiter.shouldDisableSecurityWarnings());
            this.#webviewManager.refresh();
            return;
        }
        else {
            await this.#cspArbiter.setSecurityLevelForResource(resource, selection.type);
        }
        this.#webviewManager.refresh();
    }
}
exports.PreviewSecuritySelector = PreviewSecuritySelector;
//# sourceMappingURL=security.js.map