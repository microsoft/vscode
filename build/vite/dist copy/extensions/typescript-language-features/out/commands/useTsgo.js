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
exports.DisableTsgoCommand = exports.EnableTsgoCommand = exports.tsNativeExtensionId = void 0;
const vscode = __importStar(require("vscode"));
const configuration_1 = require("../utils/configuration");
exports.tsNativeExtensionId = 'typescriptteam.native-preview';
class EnableTsgoCommand {
    id = 'typescript.experimental.enableTsgo';
    async execute() {
        await updateTsgoSetting(true);
    }
}
exports.EnableTsgoCommand = EnableTsgoCommand;
class DisableTsgoCommand {
    id = 'typescript.experimental.disableTsgo';
    async execute() {
        await updateTsgoSetting(false);
    }
}
exports.DisableTsgoCommand = DisableTsgoCommand;
/**
 * Updates the TypeScript Go setting and reloads extension host.
 * @param enable Whether to enable or disable TypeScript Go
 */
async function updateTsgoSetting(enable) {
    const tsgoExtension = vscode.extensions.getExtension(exports.tsNativeExtensionId);
    // Error if the TypeScript Go extension is not installed with a button to open the GitHub repo
    if (!tsgoExtension) {
        const selection = await vscode.window.showErrorMessage(vscode.l10n.t('The TypeScript Go extension is not installed.'), {
            title: vscode.l10n.t('Open on GitHub'),
            isCloseAffordance: true,
        });
        if (selection) {
            await vscode.env.openExternal(vscode.Uri.parse('https://github.com/microsoft/typescript-go'));
        }
    }
    const currentValue = (0, configuration_1.readUnifiedConfig)('experimental.useTsgo', false, { fallbackSection: 'typescript' });
    if (currentValue === enable) {
        return;
    }
    // Determine the target scope for the configuration update
    let target = vscode.ConfigurationTarget.Global;
    const unifiedConfig = vscode.workspace.getConfiguration(configuration_1.unifiedConfigSection);
    const inspect = unifiedConfig.inspect('experimental.useTsgo');
    const legacyInspect = vscode.workspace.getConfiguration('typescript').inspect('experimental.useTsgo');
    if (inspect?.workspaceValue !== undefined || legacyInspect?.workspaceValue !== undefined) {
        target = vscode.ConfigurationTarget.Workspace;
    }
    else if (inspect?.workspaceFolderValue !== undefined || legacyInspect?.workspaceFolderValue !== undefined) {
        target = vscode.ConfigurationTarget.WorkspaceFolder;
    }
    else {
        // If setting is not defined yet, use the same scope as typescript-go.executablePath
        const tsgoConfig = vscode.workspace.getConfiguration('typescript-go');
        const tsgoInspect = tsgoConfig.inspect('executablePath');
        if (tsgoInspect?.workspaceValue !== undefined) {
            target = vscode.ConfigurationTarget.Workspace;
        }
        else if (tsgoInspect?.workspaceFolderValue !== undefined) {
            target = vscode.ConfigurationTarget.WorkspaceFolder;
        }
    }
    await unifiedConfig.update('experimental.useTsgo', enable, target);
}
//# sourceMappingURL=useTsgo.js.map