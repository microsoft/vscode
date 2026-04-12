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
exports.activate = activate;
const jsonc_parser_1 = require("jsonc-parser");
const vscode = __importStar(require("vscode"));
const settingsDocumentHelper_1 = require("./settingsDocumentHelper");
const extensionsProposals_1 = require("./extensionsProposals");
require("./importExportProfiles");
function activate(context) {
    //settings.json suggestions
    context.subscriptions.push(registerSettingsCompletions());
    //extensions suggestions
    context.subscriptions.push(...registerExtensionsCompletions());
    // launch.json variable suggestions
    context.subscriptions.push(registerVariableCompletions('**/launch.json'));
    // task.json variable suggestions
    context.subscriptions.push(registerVariableCompletions('**/tasks.json'));
    // Workspace file launch/tasks variable completions
    context.subscriptions.push(registerVariableCompletions('**/*.code-workspace'));
    // keybindings.json/package.json context key suggestions
    context.subscriptions.push(registerContextKeyCompletions());
}
function registerSettingsCompletions() {
    return vscode.languages.registerCompletionItemProvider({ language: 'jsonc', pattern: '**/settings.json' }, {
        provideCompletionItems(document, position, token) {
            return new settingsDocumentHelper_1.SettingsDocument(document).provideCompletionItems(position, token);
        }
    });
}
function registerVariableCompletions(pattern) {
    return vscode.languages.registerCompletionItemProvider({ language: 'jsonc', pattern }, {
        provideCompletionItems(document, position, _token) {
            const location = (0, jsonc_parser_1.getLocation)(document.getText(), document.offsetAt(position));
            if (isCompletingInsidePropertyStringValue(document, location, position)) {
                if (document.fileName.endsWith('.code-workspace') && !isLocationInsideTopLevelProperty(location, ['launch', 'tasks'])) {
                    return [];
                }
                let range = document.getWordRangeAtPosition(position, /\$\{[^"\}]*\}?/);
                if (!range || range.start.isEqual(position) || range.end.isEqual(position) && document.getText(range).endsWith('}')) {
                    range = new vscode.Range(position, position);
                }
                return [
                    { label: 'workspaceFolder', detail: vscode.l10n.t("The path of the folder opened in VS Code") },
                    { label: 'workspaceFolderBasename', detail: vscode.l10n.t("The name of the folder opened in VS Code without any slashes (/)") },
                    { label: 'fileWorkspaceFolderBasename', detail: vscode.l10n.t("The current opened file workspace folder name without any slashes (/)") },
                    { label: 'relativeFile', detail: vscode.l10n.t("The current opened file relative to ${workspaceFolder}") },
                    { label: 'relativeFileDirname', detail: vscode.l10n.t("The current opened file's dirname relative to ${workspaceFolder}") },
                    { label: 'file', detail: vscode.l10n.t("The current opened file") },
                    { label: 'cwd', detail: vscode.l10n.t("The task runner's current working directory on startup") },
                    { label: 'lineNumber', detail: vscode.l10n.t("The current selected line number in the active file") },
                    { label: 'selectedText', detail: vscode.l10n.t("The current selected text in the active file") },
                    { label: 'fileDirname', detail: vscode.l10n.t("The current opened file's dirname") },
                    { label: 'fileDirnameBasename', detail: vscode.l10n.t("The current opened file's folder name") },
                    { label: 'fileExtname', detail: vscode.l10n.t("The current opened file's extension") },
                    { label: 'fileBasename', detail: vscode.l10n.t("The current opened file's basename") },
                    { label: 'fileBasenameNoExtension', detail: vscode.l10n.t("The current opened file's basename with no file extension") },
                    { label: 'defaultBuildTask', detail: vscode.l10n.t("The name of the default build task. If there is not a single default build task then a quick pick is shown to choose the build task.") },
                    { label: 'pathSeparator', detail: vscode.l10n.t("The character used by the operating system to separate components in file paths. Is also aliased to '/'.") },
                    { label: 'extensionInstallFolder', detail: vscode.l10n.t("The path where an extension is installed."), param: 'publisher.extension' },
                ].map(variable => ({
                    label: `\${${variable.label}}`,
                    range,
                    insertText: variable.param ? new vscode.SnippetString(`\${${variable.label}:`).appendPlaceholder(variable.param).appendText('}') : (`\${${variable.label}}`),
                    detail: variable.detail
                }));
            }
            return [];
        }
    });
}
function isCompletingInsidePropertyStringValue(document, location, pos) {
    if (location.isAtPropertyKey) {
        return false;
    }
    const previousNode = location.previousNode;
    if (previousNode && previousNode.type === 'string') {
        const offset = document.offsetAt(pos);
        return offset > previousNode.offset && offset < previousNode.offset + previousNode.length;
    }
    return false;
}
function isLocationInsideTopLevelProperty(location, values) {
    return values.includes(location.path[0]);
}
function registerExtensionsCompletions() {
    return [registerExtensionsCompletionsInExtensionsDocument(), registerExtensionsCompletionsInWorkspaceConfigurationDocument()];
}
function registerExtensionsCompletionsInExtensionsDocument() {
    return vscode.languages.registerCompletionItemProvider({ pattern: '**/extensions.json' }, {
        provideCompletionItems(document, position, _token) {
            const location = (0, jsonc_parser_1.getLocation)(document.getText(), document.offsetAt(position));
            if (location.path[0] === 'recommendations') {
                const range = getReplaceRange(document, location, position);
                const extensionsContent = (0, jsonc_parser_1.parse)(document.getText());
                return (0, extensionsProposals_1.provideInstalledExtensionProposals)(extensionsContent && extensionsContent.recommendations || [], '', range, false);
            }
            return [];
        }
    });
}
function registerExtensionsCompletionsInWorkspaceConfigurationDocument() {
    return vscode.languages.registerCompletionItemProvider({ pattern: '**/*.code-workspace' }, {
        provideCompletionItems(document, position, _token) {
            const location = (0, jsonc_parser_1.getLocation)(document.getText(), document.offsetAt(position));
            if (location.path[0] === 'extensions' && location.path[1] === 'recommendations') {
                const range = getReplaceRange(document, location, position);
                const extensionsContent = (0, jsonc_parser_1.parse)(document.getText())['extensions'];
                return (0, extensionsProposals_1.provideInstalledExtensionProposals)(extensionsContent && extensionsContent.recommendations || [], '', range, false);
            }
            return [];
        }
    });
}
function getReplaceRange(document, location, position) {
    const node = location.previousNode;
    if (node) {
        const nodeStart = document.positionAt(node.offset), nodeEnd = document.positionAt(node.offset + node.length);
        if (nodeStart.isBeforeOrEqual(position) && nodeEnd.isAfterOrEqual(position)) {
            return new vscode.Range(nodeStart, nodeEnd);
        }
    }
    return new vscode.Range(position, position);
}
vscode.languages.registerDocumentSymbolProvider({ pattern: '**/launch.json', language: 'jsonc' }, {
    provideDocumentSymbols(document, _token) {
        const result = [];
        let name = '';
        let lastProperty = '';
        let startOffset = 0;
        let depthInObjects = 0;
        (0, jsonc_parser_1.visit)(document.getText(), {
            onObjectProperty: (property, _offset, _length) => {
                lastProperty = property;
            },
            onLiteralValue: (value, _offset, _length) => {
                if (lastProperty === 'name') {
                    name = value;
                }
            },
            onObjectBegin: (offset, _length) => {
                depthInObjects++;
                if (depthInObjects === 2) {
                    startOffset = offset;
                }
            },
            onObjectEnd: (offset, _length) => {
                if (name && depthInObjects === 2) {
                    result.push(new vscode.SymbolInformation(name, vscode.SymbolKind.Object, new vscode.Range(document.positionAt(startOffset), document.positionAt(offset))));
                }
                depthInObjects--;
            },
        });
        return result;
    }
}, { label: 'Launch Targets' });
function registerContextKeyCompletions() {
    const paths = new Map([
        [{ language: 'jsonc', pattern: '**/keybindings.json' }, [
                ['*', 'when']
            ]],
        [{ language: 'json', pattern: '**/package.json' }, [
                ['contributes', 'menus', '*', '*', 'when'],
                ['contributes', 'views', '*', '*', 'when'],
                ['contributes', 'viewsWelcome', '*', 'when'],
                ['contributes', 'keybindings', '*', 'when'],
                ['contributes', 'keybindings', 'when'],
            ]]
    ]);
    return vscode.languages.registerCompletionItemProvider([...paths.keys()], {
        async provideCompletionItems(document, position, token) {
            const location = (0, jsonc_parser_1.getLocation)(document.getText(), document.offsetAt(position));
            if (location.isAtPropertyKey) {
                return;
            }
            let isValidLocation = false;
            for (const [key, value] of paths) {
                if (vscode.languages.match(key, document)) {
                    if (value.some(location.matches.bind(location))) {
                        isValidLocation = true;
                        break;
                    }
                }
            }
            if (!isValidLocation || !isCompletingInsidePropertyStringValue(document, location, position)) {
                return;
            }
            const replacing = document.getWordRangeAtPosition(position, /[a-zA-Z.]+/) || new vscode.Range(position, position);
            const inserting = replacing.with(undefined, position);
            const data = await vscode.commands.executeCommand('getContextKeyInfo');
            if (token.isCancellationRequested || !data) {
                return;
            }
            const result = new vscode.CompletionList();
            for (const item of data) {
                const completion = new vscode.CompletionItem(item.key, vscode.CompletionItemKind.Constant);
                completion.detail = item.type;
                completion.range = { replacing, inserting };
                completion.documentation = item.description;
                result.items.push(completion);
            }
            return result;
        }
    });
}
//# sourceMappingURL=configurationEditingMain.js.map