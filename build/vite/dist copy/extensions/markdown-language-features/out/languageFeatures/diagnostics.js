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
exports.DiagnosticCode = void 0;
exports.registerDiagnosticSupport = registerDiagnosticSupport;
const vscode = __importStar(require("vscode"));
const file_1 = require("../util/file");
// Copied from markdown language service
var DiagnosticCode;
(function (DiagnosticCode) {
    DiagnosticCode["link_noSuchReferences"] = "link.no-such-reference";
    DiagnosticCode["link_noSuchHeaderInOwnFile"] = "link.no-such-header-in-own-file";
    DiagnosticCode["link_noSuchFile"] = "link.no-such-file";
    DiagnosticCode["link_noSuchHeaderInFile"] = "link.no-such-header-in-file";
})(DiagnosticCode || (exports.DiagnosticCode = DiagnosticCode = {}));
class AddToIgnoreLinksQuickFixProvider {
    static #addToIgnoreLinksCommandId = '_markdown.addToIgnoreLinks';
    static #metadata = {
        providedCodeActionKinds: [
            vscode.CodeActionKind.QuickFix
        ],
    };
    static register(selector, commandManager) {
        const reg = vscode.languages.registerCodeActionsProvider(selector, new AddToIgnoreLinksQuickFixProvider(), AddToIgnoreLinksQuickFixProvider.#metadata);
        const commandReg = commandManager.register({
            id: AddToIgnoreLinksQuickFixProvider.#addToIgnoreLinksCommandId,
            execute(resource, path) {
                const settingId = 'validate.ignoredLinks';
                const config = vscode.workspace.getConfiguration('markdown', resource);
                const paths = new Set(config.get(settingId, []));
                paths.add(path);
                config.update(settingId, [...paths], vscode.ConfigurationTarget.WorkspaceFolder);
            }
        });
        return vscode.Disposable.from(reg, commandReg);
    }
    provideCodeActions(document, _range, context, _token) {
        const fixes = [];
        for (const diagnostic of context.diagnostics) {
            switch (diagnostic.code) {
                case DiagnosticCode.link_noSuchReferences:
                case DiagnosticCode.link_noSuchHeaderInOwnFile:
                case DiagnosticCode.link_noSuchFile:
                case DiagnosticCode.link_noSuchHeaderInFile: {
                    const hrefText = diagnostic.data?.hrefText;
                    if (hrefText) {
                        const fix = new vscode.CodeAction(vscode.l10n.t("Exclude '{0}' from link validation.", hrefText), vscode.CodeActionKind.QuickFix);
                        fix.command = {
                            command: AddToIgnoreLinksQuickFixProvider.#addToIgnoreLinksCommandId,
                            title: '',
                            arguments: [document.uri, hrefText],
                        };
                        fixes.push(fix);
                    }
                    break;
                }
            }
        }
        return fixes;
    }
}
function registerMarkdownStatusItem(selector, commandManager) {
    const statusItem = vscode.languages.createLanguageStatusItem('markdownStatus', selector);
    const enabledSettingId = 'validate.enabled';
    const commandId = '_markdown.toggleValidation';
    const commandSub = commandManager.register({
        id: commandId,
        execute: (enabled) => {
            vscode.workspace.getConfiguration('markdown').update(enabledSettingId, enabled);
        }
    });
    const update = () => {
        const activeDoc = vscode.window.activeTextEditor?.document;
        const markdownDoc = activeDoc && (0, file_1.isMarkdownFile)(activeDoc) ? activeDoc : undefined;
        const enabled = vscode.workspace.getConfiguration('markdown', markdownDoc).get(enabledSettingId);
        if (enabled) {
            statusItem.text = vscode.l10n.t('Markdown link validation enabled');
            statusItem.command = {
                command: commandId,
                arguments: [false],
                title: vscode.l10n.t('Disable'),
                tooltip: vscode.l10n.t('Disable validation of Markdown links'),
            };
        }
        else {
            statusItem.text = vscode.l10n.t('Markdown link validation disabled');
            statusItem.command = {
                command: commandId,
                arguments: [true],
                title: vscode.l10n.t('Enable'),
                tooltip: vscode.l10n.t('Enable validation of Markdown links'),
            };
        }
    };
    update();
    return vscode.Disposable.from(statusItem, commandSub, vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('markdown.' + enabledSettingId)) {
            update();
        }
    }));
}
function registerDiagnosticSupport(selector, commandManager) {
    return vscode.Disposable.from(AddToIgnoreLinksQuickFixProvider.register(selector, commandManager), registerMarkdownStatusItem(selector, commandManager));
}
//# sourceMappingURL=diagnostics.js.map