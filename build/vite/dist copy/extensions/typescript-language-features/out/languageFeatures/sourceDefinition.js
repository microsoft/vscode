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
exports.register = register;
const vscode = __importStar(require("vscode"));
const languageIds_1 = require("../configuration/languageIds");
const api_1 = require("../tsServer/api");
const typeConverters = __importStar(require("../typeConverters"));
class SourceDefinitionCommand {
    client;
    static context = 'tsSupportsSourceDefinition';
    static minVersion = api_1.API.v470;
    id = 'typescript.goToSourceDefinition';
    constructor(client) {
        this.client = client;
    }
    async execute() {
        if (this.client.apiVersion.lt(SourceDefinitionCommand.minVersion)) {
            vscode.window.showErrorMessage(vscode.l10n.t("Go to Source Definition failed. Requires TypeScript 4.7+."));
            return;
        }
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage(vscode.l10n.t("Go to Source Definition failed. No resource provided."));
            return;
        }
        const resource = activeEditor.document.uri;
        const document = await vscode.workspace.openTextDocument(resource);
        if (!(0, languageIds_1.isSupportedLanguageMode)(document)) {
            vscode.window.showErrorMessage(vscode.l10n.t("Go to Source Definition failed. Unsupported file type."));
            return;
        }
        const openedFiledPath = this.client.toOpenTsFilePath(document);
        if (!openedFiledPath) {
            vscode.window.showErrorMessage(vscode.l10n.t("Go to Source Definition failed. Unknown file type."));
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: vscode.l10n.t("Finding source definitions")
        }, async (_progress, token) => {
            const position = activeEditor.selection.anchor;
            const args = typeConverters.Position.toFileLocationRequestArgs(openedFiledPath, position);
            const response = await this.client.execute('findSourceDefinition', args, token);
            if (response.type === 'response' && response.body) {
                const locations = response.body.map(reference => typeConverters.Location.fromTextSpan(this.client.toResource(reference.file), reference));
                if (locations.length) {
                    if (locations.length === 1) {
                        vscode.commands.executeCommand('vscode.open', locations[0].uri.with({
                            fragment: `L${locations[0].range.start.line + 1},${locations[0].range.start.character + 1}`
                        }));
                    }
                    else {
                        vscode.commands.executeCommand('editor.action.showReferences', resource, position, locations);
                    }
                    return;
                }
            }
            vscode.window.showErrorMessage(vscode.l10n.t("No source definitions found."));
        });
    }
}
function register(client, commandManager) {
    function updateContext(overrideValue) {
        vscode.commands.executeCommand('setContext', SourceDefinitionCommand.context, overrideValue ?? client.apiVersion.gte(SourceDefinitionCommand.minVersion));
    }
    updateContext();
    commandManager.register(new SourceDefinitionCommand(client));
    return vscode.Disposable.from(client.onTsServerStarted(() => updateContext()), new vscode.Disposable(() => updateContext(false)));
}
//# sourceMappingURL=sourceDefinition.js.map