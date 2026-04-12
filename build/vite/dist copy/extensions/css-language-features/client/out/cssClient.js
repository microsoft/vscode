"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.startClient = startClient;
const vscode_1 = require("vscode");
const vscode_languageclient_1 = require("vscode-languageclient");
const customData_1 = require("./customData");
const requests_1 = require("./requests");
var CustomDataChangedNotification;
(function (CustomDataChangedNotification) {
    CustomDataChangedNotification.type = new vscode_languageclient_1.NotificationType('css/customDataChanged');
})(CustomDataChangedNotification || (CustomDataChangedNotification = {}));
const cssFormatSettingKeys = ['newlineBetweenSelectors', 'newlineBetweenRules', 'spaceAroundSelectorSeparator', 'braceStyle', 'preserveNewLines', 'maxPreserveNewLines'];
async function startClient(context, newLanguageClient, runtime) {
    const customDataSource = (0, customData_1.getCustomDataSource)(context.subscriptions);
    const documentSelector = ['css', 'scss', 'less'];
    const formatterRegistrations = documentSelector.map(languageId => ({
        languageId, settingId: `${languageId}.format.enable`, provider: undefined
    }));
    // Options to control the language client
    const clientOptions = {
        documentSelector,
        synchronize: {
            configurationSection: ['css', 'scss', 'less']
        },
        initializationOptions: {
            handledSchemas: ['file'],
            provideFormatter: false, // tell the server to not provide formatting capability
            customCapabilities: { rangeFormatting: { editLimit: 10000 } }
        },
        middleware: {
            provideCompletionItem(document, position, context, token, next) {
                // testing the replace / insert mode
                function updateRanges(item) {
                    const range = item.range;
                    if (range instanceof vscode_1.Range && range.end.isAfter(position) && range.start.isBeforeOrEqual(position)) {
                        item.range = { inserting: new vscode_1.Range(range.start, position), replacing: range };
                    }
                }
                function updateLabel(item) {
                    if (item.kind === vscode_1.CompletionItemKind.Color) {
                        item.label = {
                            label: item.label,
                            description: item.documentation
                        };
                    }
                }
                // testing the new completion
                function updateProposals(r) {
                    if (r) {
                        (Array.isArray(r) ? r : r.items).forEach(updateRanges);
                        (Array.isArray(r) ? r : r.items).forEach(updateLabel);
                    }
                    return r;
                }
                function isThenable(obj) {
                    return !!obj && typeof obj.then === 'function';
                }
                const r = next(document, position, context, token);
                if (isThenable(r)) {
                    return r.then(updateProposals);
                }
                return updateProposals(r);
            }
        }
    };
    // Create the language client and start the client.
    const client = newLanguageClient('css', vscode_1.l10n.t('CSS Language Server'), clientOptions);
    client.registerProposedFeatures();
    await client.start();
    client.sendNotification(CustomDataChangedNotification.type, customDataSource.uris);
    customDataSource.onDidChange(() => {
        client.sendNotification(CustomDataChangedNotification.type, customDataSource.uris);
    });
    // manually register / deregister format provider based on the `css/less/scss.format.enable` setting avoiding issues with late registration. See #71652.
    for (const registration of formatterRegistrations) {
        updateFormatterRegistration(registration);
        context.subscriptions.push({ dispose: () => registration.provider?.dispose() });
        context.subscriptions.push(vscode_1.workspace.onDidChangeConfiguration(e => e.affectsConfiguration(registration.settingId) && updateFormatterRegistration(registration)));
    }
    (0, requests_1.serveFileSystemRequests)(client, runtime);
    context.subscriptions.push(initCompletionProvider());
    function initCompletionProvider() {
        const regionCompletionRegExpr = /^(\s*)(\/(\*\s*(#\w*)?)?)?$/;
        return vscode_1.languages.registerCompletionItemProvider(documentSelector, {
            provideCompletionItems(doc, pos) {
                const lineUntilPos = doc.getText(new vscode_1.Range(new vscode_1.Position(pos.line, 0), pos));
                const match = lineUntilPos.match(regionCompletionRegExpr);
                if (match) {
                    const range = new vscode_1.Range(new vscode_1.Position(pos.line, match[1].length), pos);
                    const beginProposal = new vscode_1.CompletionItem('#region', vscode_1.CompletionItemKind.Snippet);
                    beginProposal.range = range;
                    vscode_1.TextEdit.replace(range, '/* #region */');
                    beginProposal.insertText = new vscode_1.SnippetString('/* #region $1*/');
                    beginProposal.documentation = vscode_1.l10n.t('Folding Region Start');
                    beginProposal.filterText = match[2];
                    beginProposal.sortText = 'za';
                    const endProposal = new vscode_1.CompletionItem('#endregion', vscode_1.CompletionItemKind.Snippet);
                    endProposal.range = range;
                    endProposal.insertText = '/* #endregion */';
                    endProposal.documentation = vscode_1.l10n.t('Folding Region End');
                    endProposal.sortText = 'zb';
                    endProposal.filterText = match[2];
                    return [beginProposal, endProposal];
                }
                return null;
            }
        });
    }
    vscode_1.commands.registerCommand('_css.applyCodeAction', applyCodeAction);
    function applyCodeAction(uri, documentVersion, edits) {
        const textEditor = vscode_1.window.activeTextEditor;
        if (textEditor && textEditor.document.uri.toString() === uri) {
            if (textEditor.document.version !== documentVersion) {
                vscode_1.window.showInformationMessage(vscode_1.l10n.t('CSS fix is outdated and can\'t be applied to the document.'));
            }
            textEditor.edit(mutator => {
                for (const edit of edits) {
                    mutator.replace(client.protocol2CodeConverter.asRange(edit.range), edit.newText);
                }
            }).then(success => {
                if (!success) {
                    vscode_1.window.showErrorMessage(vscode_1.l10n.t('Failed to apply CSS fix to the document. Please consider opening an issue with steps to reproduce.'));
                }
            });
        }
    }
    function updateFormatterRegistration(registration) {
        const formatEnabled = vscode_1.workspace.getConfiguration().get(registration.settingId);
        if (!formatEnabled && registration.provider) {
            registration.provider.dispose();
            registration.provider = undefined;
        }
        else if (formatEnabled && !registration.provider) {
            registration.provider = vscode_1.languages.registerDocumentRangeFormattingEditProvider(registration.languageId, {
                provideDocumentRangeFormattingEdits(document, range, options, token) {
                    const filesConfig = vscode_1.workspace.getConfiguration('files', document);
                    const fileFormattingOptions = {
                        trimTrailingWhitespace: filesConfig.get('trimTrailingWhitespace'),
                        trimFinalNewlines: filesConfig.get('trimFinalNewlines'),
                        insertFinalNewline: filesConfig.get('insertFinalNewline'),
                    };
                    const params = {
                        textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
                        range: client.code2ProtocolConverter.asRange(range),
                        options: client.code2ProtocolConverter.asFormattingOptions(options, fileFormattingOptions)
                    };
                    // add the css formatter options from the settings
                    const formatterSettings = vscode_1.workspace.getConfiguration(registration.languageId, document).get('format');
                    if (formatterSettings) {
                        for (const key of cssFormatSettingKeys) {
                            const val = formatterSettings[key];
                            if (val !== undefined && val !== null) {
                                params.options[key] = val;
                            }
                        }
                    }
                    return client.sendRequest(vscode_languageclient_1.DocumentRangeFormattingRequest.type, params, token).then(client.protocol2CodeConverter.asTextEdits, (error) => {
                        client.handleFailedRequest(vscode_languageclient_1.DocumentRangeFormattingRequest.type, undefined, error, []);
                        return Promise.resolve([]);
                    });
                }
            });
        }
    }
    return client;
}
//# sourceMappingURL=cssClient.js.map