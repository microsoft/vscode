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
exports.FindFileReferencesCommand = void 0;
exports.convertRange = convertRange;
exports.registerFindFileReferenceSupport = registerFindFileReferenceSupport;
const vscode = __importStar(require("vscode"));
class FindFileReferencesCommand {
    id = 'markdown.findAllFileReferences';
    #client;
    constructor(client) {
        this.#client = client;
    }
    async execute(resource) {
        resource ??= vscode.window.activeTextEditor?.document.uri;
        if (!resource) {
            vscode.window.showErrorMessage(vscode.l10n.t("Find file references failed. No resource provided."));
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: vscode.l10n.t("Finding file references")
        }, async (_progress, token) => {
            const locations = (await this.#client.getReferencesToFileInWorkspace(resource, token)).map(loc => {
                return new vscode.Location(vscode.Uri.parse(loc.uri), convertRange(loc.range));
            });
            const config = vscode.workspace.getConfiguration('references');
            const existingSetting = config.inspect('preferredLocation');
            await config.update('preferredLocation', 'view');
            try {
                await vscode.commands.executeCommand('editor.action.showReferences', resource, new vscode.Position(0, 0), locations);
            }
            finally {
                await config.update('preferredLocation', existingSetting?.workspaceFolderValue ?? existingSetting?.workspaceValue);
            }
        });
    }
}
exports.FindFileReferencesCommand = FindFileReferencesCommand;
function convertRange(range) {
    return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character);
}
function registerFindFileReferenceSupport(commandManager, client) {
    return commandManager.register(new FindFileReferencesCommand(client));
}
//# sourceMappingURL=fileReferences.js.map