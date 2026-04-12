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
const vscode = __importStar(require("vscode"));
class MergeConflictCodeLensProvider {
    codeLensRegistrationHandle;
    config;
    tracker;
    constructor(trackerService) {
        this.tracker = trackerService.createTracker('codelens');
    }
    begin(config) {
        this.config = config;
        if (this.config.enableCodeLens) {
            this.registerCodeLensProvider();
        }
    }
    configurationUpdated(updatedConfig) {
        if (updatedConfig.enableCodeLens === false && this.codeLensRegistrationHandle) {
            this.codeLensRegistrationHandle.dispose();
            this.codeLensRegistrationHandle = null;
        }
        else if (updatedConfig.enableCodeLens === true && !this.codeLensRegistrationHandle) {
            this.registerCodeLensProvider();
        }
        this.config = updatedConfig;
    }
    dispose() {
        if (this.codeLensRegistrationHandle) {
            this.codeLensRegistrationHandle.dispose();
            this.codeLensRegistrationHandle = null;
        }
    }
    async provideCodeLenses(document, _token) {
        if (!this.config || !this.config.enableCodeLens) {
            return null;
        }
        const conflicts = await this.tracker.getConflicts(document);
        const conflictsCount = conflicts?.length ?? 0;
        vscode.commands.executeCommand('setContext', 'mergeConflictsCount', conflictsCount);
        if (!conflictsCount) {
            return null;
        }
        const items = [];
        conflicts.forEach(conflict => {
            const acceptCurrentCommand = {
                command: 'merge-conflict.accept.current',
                title: vscode.l10n.t("Accept Current Change"),
                arguments: ['known-conflict', conflict]
            };
            const acceptIncomingCommand = {
                command: 'merge-conflict.accept.incoming',
                title: vscode.l10n.t("Accept Incoming Change"),
                arguments: ['known-conflict', conflict]
            };
            const acceptBothCommand = {
                command: 'merge-conflict.accept.both',
                title: vscode.l10n.t("Accept Both Changes"),
                arguments: ['known-conflict', conflict]
            };
            const diffCommand = {
                command: 'merge-conflict.compare',
                title: vscode.l10n.t("Compare Changes"),
                arguments: [conflict]
            };
            const range = document.lineAt(conflict.range.start.line).range;
            items.push(new vscode.CodeLens(range, acceptCurrentCommand), new vscode.CodeLens(range, acceptIncomingCommand), new vscode.CodeLens(range, acceptBothCommand), new vscode.CodeLens(range, diffCommand));
        });
        return items;
    }
    registerCodeLensProvider() {
        this.codeLensRegistrationHandle = vscode.languages.registerCodeLensProvider([
            { scheme: 'file' },
            { scheme: 'vscode-vfs' },
            { scheme: 'untitled' },
            { scheme: 'vscode-userdata' },
        ], this);
    }
}
exports.default = MergeConflictCodeLensProvider;
//# sourceMappingURL=codelensProvider.js.map