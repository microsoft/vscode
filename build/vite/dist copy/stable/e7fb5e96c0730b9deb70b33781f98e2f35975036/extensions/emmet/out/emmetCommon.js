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
exports.activateEmmetExtension = activateEmmetExtension;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const defaultCompletionProvider_1 = require("./defaultCompletionProvider");
const abbreviationActions_1 = require("./abbreviationActions");
const removeTag_1 = require("./removeTag");
const updateTag_1 = require("./updateTag");
const matchTag_1 = require("./matchTag");
const balance_1 = require("./balance");
const splitJoinTag_1 = require("./splitJoinTag");
const mergeLines_1 = require("./mergeLines");
const toggleComment_1 = require("./toggleComment");
const editPoint_1 = require("./editPoint");
const selectItem_1 = require("./selectItem");
const evaluateMathExpression_1 = require("./evaluateMathExpression");
const incrementDecrement_1 = require("./incrementDecrement");
const util_1 = require("./util");
const reflectCssValue_1 = require("./reflectCssValue");
const parseDocument_1 = require("./parseDocument");
function activateEmmetExtension(context) {
    (0, util_1.migrateEmmetExtensionsPath)();
    refreshCompletionProviders(context);
    (0, util_1.updateEmmetExtensionsPath)();
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.wrapWithAbbreviation', (args) => {
        (0, abbreviationActions_1.wrapWithAbbreviation)(args);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('emmet.expandAbbreviation', (args) => {
        (0, abbreviationActions_1.expandEmmetAbbreviation)(args);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.removeTag', () => {
        return (0, removeTag_1.removeTag)();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.updateTag', (inputTag) => {
        if (inputTag && typeof inputTag === 'string') {
            return (0, updateTag_1.updateTag)(inputTag);
        }
        return (0, updateTag_1.updateTag)(undefined);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.matchTag', () => {
        (0, matchTag_1.matchTag)();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.balanceOut', () => {
        (0, balance_1.balanceOut)();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.balanceIn', () => {
        (0, balance_1.balanceIn)();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.splitJoinTag', () => {
        return (0, splitJoinTag_1.splitJoinTag)();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.mergeLines', () => {
        (0, mergeLines_1.mergeLines)();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.toggleComment', () => {
        (0, toggleComment_1.toggleComment)();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.nextEditPoint', () => {
        (0, editPoint_1.fetchEditPoint)('next');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.prevEditPoint', () => {
        (0, editPoint_1.fetchEditPoint)('prev');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.selectNextItem', () => {
        (0, selectItem_1.fetchSelectItem)('next');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.selectPrevItem', () => {
        (0, selectItem_1.fetchSelectItem)('prev');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.evaluateMathExpression', () => {
        (0, evaluateMathExpression_1.evaluateMathExpression)();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.incrementNumberByOneTenth', () => {
        return (0, incrementDecrement_1.incrementDecrement)(0.1);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.incrementNumberByOne', () => {
        return (0, incrementDecrement_1.incrementDecrement)(1);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.incrementNumberByTen', () => {
        return (0, incrementDecrement_1.incrementDecrement)(10);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.decrementNumberByOneTenth', () => {
        return (0, incrementDecrement_1.incrementDecrement)(-0.1);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.decrementNumberByOne', () => {
        return (0, incrementDecrement_1.incrementDecrement)(-1);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.decrementNumberByTen', () => {
        return (0, incrementDecrement_1.incrementDecrement)(-10);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('editor.emmet.action.reflectCSSValue', () => {
        return (0, reflectCssValue_1.reflectCssValue)();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('workbench.action.showEmmetCommands', () => {
        vscode.commands.executeCommand('workbench.action.quickOpen', '>Emmet: ');
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('emmet.includeLanguages') || e.affectsConfiguration('emmet.useInlineCompletions')) {
            refreshCompletionProviders(context);
        }
        if (e.affectsConfiguration('emmet.extensionsPath')) {
            (0, util_1.updateEmmetExtensionsPath)();
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((e) => {
        const basefileName = (0, util_1.getPathBaseName)(e.fileName);
        if (basefileName.startsWith('snippets') && basefileName.endsWith('.json')) {
            (0, util_1.updateEmmetExtensionsPath)(true);
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((e) => {
        const emmetMode = (0, util_1.getEmmetMode)(e.languageId, {}, []) ?? '';
        const syntaxes = (0, util_1.getSyntaxes)();
        if (syntaxes.markup.includes(emmetMode) || syntaxes.stylesheet.includes(emmetMode)) {
            (0, parseDocument_1.addFileToParseCache)(e);
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((e) => {
        const emmetMode = (0, util_1.getEmmetMode)(e.languageId, {}, []) ?? '';
        const syntaxes = (0, util_1.getSyntaxes)();
        if (syntaxes.markup.includes(emmetMode) || syntaxes.stylesheet.includes(emmetMode)) {
            (0, parseDocument_1.removeFileFromParseCache)(e);
        }
    }));
}
/**
 * Holds any registered completion providers by their language strings
 */
const languageMappingForCompletionProviders = new Map();
const completionProviderDisposables = [];
function refreshCompletionProviders(_) {
    clearCompletionProviderInfo();
    const completionProvider = new defaultCompletionProvider_1.DefaultCompletionItemProvider();
    const inlineCompletionProvider = {
        async provideInlineCompletionItems(document, position, _, token) {
            const items = await completionProvider.provideCompletionItems(document, position, token, { triggerCharacter: undefined, triggerKind: vscode.CompletionTriggerKind.Invoke });
            if (!items) {
                return undefined;
            }
            const item = items.items[0];
            if (!item || !item.insertText) {
                return undefined;
            }
            const range = item.range;
            if (document.getText(range) !== item.label) {
                // We only want to show an inline completion if we are really sure the user meant emmet.
                // If the user types `d`, we don't want to suggest `<div></div>`.
                return undefined;
            }
            return [
                {
                    insertText: item.insertText,
                    filterText: item.label,
                    range
                }
            ];
        }
    };
    const useInlineCompletionProvider = vscode.workspace.getConfiguration('emmet').get('useInlineCompletions');
    const includedLanguages = (0, util_1.getMappingForIncludedLanguages)();
    Object.keys(includedLanguages).forEach(language => {
        if (languageMappingForCompletionProviders.has(language) && languageMappingForCompletionProviders.get(language) === includedLanguages[language]) {
            return;
        }
        if (useInlineCompletionProvider) {
            const inlineCompletionsProvider = vscode.languages.registerInlineCompletionItemProvider({ language, scheme: '*' }, inlineCompletionProvider);
            completionProviderDisposables.push(inlineCompletionsProvider);
        }
        const explicitProvider = vscode.languages.registerCompletionItemProvider({ language, scheme: '*' }, completionProvider, ...util_1.LANGUAGE_MODES[includedLanguages[language]]);
        completionProviderDisposables.push(explicitProvider);
        languageMappingForCompletionProviders.set(language, includedLanguages[language]);
    });
    Object.keys(util_1.LANGUAGE_MODES).forEach(language => {
        if (!languageMappingForCompletionProviders.has(language)) {
            if (useInlineCompletionProvider) {
                const inlineCompletionsProvider = vscode.languages.registerInlineCompletionItemProvider({ language, scheme: '*' }, inlineCompletionProvider);
                completionProviderDisposables.push(inlineCompletionsProvider);
            }
            const explicitProvider = vscode.languages.registerCompletionItemProvider({ language, scheme: '*' }, completionProvider, ...util_1.LANGUAGE_MODES[language]);
            completionProviderDisposables.push(explicitProvider);
            languageMappingForCompletionProviders.set(language, language);
        }
    });
}
function clearCompletionProviderInfo() {
    languageMappingForCompletionProviders.clear();
    let disposable;
    while (disposable = completionProviderDisposables.pop()) {
        disposable.dispose();
    }
}
function deactivate() {
    clearCompletionProviderInfo();
    (0, parseDocument_1.clearParseCache)();
}
//# sourceMappingURL=emmetCommon.js.map