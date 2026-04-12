"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.languageServerDescription = void 0;
exports.startClient = startClient;
const vscode_1 = require("vscode");
const vscode_languageclient_1 = require("vscode-languageclient");
const requests_1 = require("./requests");
const customData_1 = require("./customData");
const autoInsertion_1 = require("./autoInsertion");
const languageParticipants_1 = require("./languageParticipants");
var CustomDataChangedNotification;
(function (CustomDataChangedNotification) {
    CustomDataChangedNotification.type = new vscode_languageclient_1.NotificationType('html/customDataChanged');
})(CustomDataChangedNotification || (CustomDataChangedNotification = {}));
var CustomDataContent;
(function (CustomDataContent) {
    CustomDataContent.type = new vscode_languageclient_1.RequestType('html/customDataContent');
})(CustomDataContent || (CustomDataContent = {}));
var AutoInsertRequest;
(function (AutoInsertRequest) {
    AutoInsertRequest.type = new vscode_languageclient_1.RequestType('html/autoInsert');
})(AutoInsertRequest || (AutoInsertRequest = {}));
var SemanticTokenRequest;
(function (SemanticTokenRequest) {
    SemanticTokenRequest.type = new vscode_languageclient_1.RequestType('html/semanticTokens');
})(SemanticTokenRequest || (SemanticTokenRequest = {}));
var SemanticTokenLegendRequest;
(function (SemanticTokenLegendRequest) {
    SemanticTokenLegendRequest.type = new vscode_languageclient_1.RequestType0('html/semanticTokenLegend');
})(SemanticTokenLegendRequest || (SemanticTokenLegendRequest = {}));
var SettingIds;
(function (SettingIds) {
    SettingIds.linkedEditing = 'editor.linkedEditing';
    SettingIds.formatEnable = 'html.format.enable';
})(SettingIds || (SettingIds = {}));
exports.languageServerDescription = vscode_1.l10n.t('HTML Language Server');
async function startClient(context, newLanguageClient, runtime) {
    const logOutputChannel = vscode_1.window.createOutputChannel(exports.languageServerDescription, { log: true });
    const languageParticipants = (0, languageParticipants_1.getLanguageParticipants)();
    context.subscriptions.push(languageParticipants);
    let client = await startClientWithParticipants(languageParticipants, newLanguageClient, logOutputChannel, runtime);
    const promptForLinkedEditingKey = 'html.promptForLinkedEditing';
    if (vscode_1.extensions.getExtension('formulahendry.auto-rename-tag') !== undefined && (context.globalState.get(promptForLinkedEditingKey) !== false)) {
        const config = vscode_1.workspace.getConfiguration('editor', { languageId: 'html' });
        if (!config.get('linkedEditing') && !config.get('renameOnType')) {
            const activeEditorListener = vscode_1.window.onDidChangeActiveTextEditor(async (e) => {
                if (e && languageParticipants.hasLanguage(e.document.languageId)) {
                    context.globalState.update(promptForLinkedEditingKey, false);
                    activeEditorListener.dispose();
                    const configure = vscode_1.l10n.t('Configure');
                    const res = await vscode_1.window.showInformationMessage(vscode_1.l10n.t('VS Code now has built-in support for auto-renaming tags. Do you want to enable it?'), configure);
                    if (res === configure) {
                        vscode_1.commands.executeCommand('workbench.action.openSettings', SettingIds.linkedEditing);
                    }
                }
            });
            context.subscriptions.push(activeEditorListener);
        }
    }
    let restartTrigger;
    languageParticipants.onDidChange(() => {
        if (restartTrigger) {
            restartTrigger.dispose();
        }
        restartTrigger = runtime.timer.setTimeout(async () => {
            if (client) {
                logOutputChannel.info('Extensions have changed, restarting HTML server...');
                logOutputChannel.info('');
                const oldClient = client;
                client = undefined;
                await oldClient.dispose();
                client = await startClientWithParticipants(languageParticipants, newLanguageClient, logOutputChannel, runtime);
            }
        }, 2000);
    });
    return {
        dispose: async () => {
            restartTrigger?.dispose();
            await client?.dispose();
            logOutputChannel.dispose();
        }
    };
}
async function startClientWithParticipants(languageParticipants, newLanguageClient, logOutputChannel, runtime) {
    const toDispose = [];
    const documentSelector = languageParticipants.documentSelector;
    const embeddedLanguages = { css: true, javascript: true };
    let rangeFormatting = undefined;
    // Options to control the language client
    const clientOptions = {
        documentSelector,
        synchronize: {
            configurationSection: ['html', 'css', 'javascript', 'js/ts'], // the settings to synchronize
        },
        initializationOptions: {
            embeddedLanguages,
            handledSchemas: ['file'],
            provideFormatter: false, // tell the server to not provide formatting capability and ignore the `html.format.enable` setting.
            customCapabilities: { rangeFormatting: { editLimit: 10000 } }
        },
        middleware: {
            // testing the replace / insert mode
            provideCompletionItem(document, position, context, token, next) {
                function updateRanges(item) {
                    const range = item.range;
                    if (range instanceof vscode_1.Range && range.end.isAfter(position) && range.start.isBeforeOrEqual(position)) {
                        item.range = { inserting: new vscode_1.Range(range.start, position), replacing: range };
                    }
                }
                function updateProposals(r) {
                    if (r) {
                        (Array.isArray(r) ? r : r.items).forEach(updateRanges);
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
    clientOptions.outputChannel = logOutputChannel;
    // Create the language client and start the client.
    const client = newLanguageClient('html', exports.languageServerDescription, clientOptions);
    client.registerProposedFeatures();
    await client.start();
    toDispose.push((0, requests_1.serveFileSystemRequests)(client, runtime));
    const customDataSource = (0, customData_1.getCustomDataSource)(runtime, toDispose);
    client.sendNotification(CustomDataChangedNotification.type, customDataSource.uris);
    customDataSource.onDidChange(() => {
        client.sendNotification(CustomDataChangedNotification.type, customDataSource.uris);
    }, undefined, toDispose);
    toDispose.push(client.onRequest(CustomDataContent.type, customDataSource.getContent));
    const insertRequestor = (kind, document, position) => {
        const param = {
            kind,
            textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document),
            position: client.code2ProtocolConverter.asPosition(position)
        };
        return client.sendRequest(AutoInsertRequest.type, param);
    };
    const disposable = (0, autoInsertion_1.activateAutoInsertion)(insertRequestor, languageParticipants, runtime);
    toDispose.push(disposable);
    const disposable2 = client.onTelemetry(e => {
        runtime.telemetry?.sendTelemetryEvent(e.key, e.data);
    });
    toDispose.push(disposable2);
    // manually register / deregister format provider based on the `html.format.enable` setting avoiding issues with late registration. See #71652.
    updateFormatterRegistration();
    toDispose.push({ dispose: () => rangeFormatting && rangeFormatting.dispose() });
    toDispose.push(vscode_1.workspace.onDidChangeConfiguration(e => e.affectsConfiguration(SettingIds.formatEnable) && updateFormatterRegistration()));
    client.sendRequest(SemanticTokenLegendRequest.type).then(legend => {
        if (legend) {
            const provider = {
                provideDocumentSemanticTokens(doc) {
                    const params = {
                        textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(doc),
                    };
                    return client.sendRequest(SemanticTokenRequest.type, params).then(data => {
                        return data && new vscode_1.SemanticTokens(new Uint32Array(data));
                    });
                },
                provideDocumentRangeSemanticTokens(doc, range) {
                    const params = {
                        textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(doc),
                        ranges: [client.code2ProtocolConverter.asRange(range)]
                    };
                    return client.sendRequest(SemanticTokenRequest.type, params).then(data => {
                        return data && new vscode_1.SemanticTokens(new Uint32Array(data));
                    });
                }
            };
            toDispose.push(vscode_1.languages.registerDocumentSemanticTokensProvider(documentSelector, provider, new vscode_1.SemanticTokensLegend(legend.types, legend.modifiers)));
        }
    });
    function updateFormatterRegistration() {
        const formatEnabled = vscode_1.workspace.getConfiguration().get(SettingIds.formatEnable);
        if (!formatEnabled && rangeFormatting) {
            rangeFormatting.dispose();
            rangeFormatting = undefined;
        }
        else if (formatEnabled && !rangeFormatting) {
            rangeFormatting = vscode_1.languages.registerDocumentRangeFormattingEditProvider(documentSelector, {
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
                    return client.sendRequest(vscode_languageclient_1.DocumentRangeFormattingRequest.type, params, token).then(client.protocol2CodeConverter.asTextEdits, (error) => {
                        client.handleFailedRequest(vscode_languageclient_1.DocumentRangeFormattingRequest.type, undefined, error, []);
                        return Promise.resolve([]);
                    });
                }
            });
        }
    }
    const regionCompletionRegExpr = /^(\s*)(<(!(-(-\s*(#\w*)?)?)?)?)?$/;
    const htmlSnippetCompletionRegExpr = /^(\s*)(<(h(t(m(l)?)?)?)?)?$/;
    toDispose.push(vscode_1.languages.registerCompletionItemProvider(documentSelector, {
        provideCompletionItems(doc, pos) {
            const results = [];
            const lineUntilPos = doc.getText(new vscode_1.Range(new vscode_1.Position(pos.line, 0), pos));
            const match = lineUntilPos.match(regionCompletionRegExpr);
            if (match) {
                const range = new vscode_1.Range(new vscode_1.Position(pos.line, match[1].length), pos);
                const beginProposal = new vscode_1.CompletionItem('#region', vscode_1.CompletionItemKind.Snippet);
                beginProposal.range = range;
                beginProposal.insertText = new vscode_1.SnippetString('<!-- #region $1-->');
                beginProposal.documentation = vscode_1.l10n.t('Folding Region Start');
                beginProposal.filterText = match[2];
                beginProposal.sortText = 'za';
                results.push(beginProposal);
                const endProposal = new vscode_1.CompletionItem('#endregion', vscode_1.CompletionItemKind.Snippet);
                endProposal.range = range;
                endProposal.insertText = new vscode_1.SnippetString('<!-- #endregion -->');
                endProposal.documentation = vscode_1.l10n.t('Folding Region End');
                endProposal.filterText = match[2];
                endProposal.sortText = 'zb';
                results.push(endProposal);
            }
            const match2 = lineUntilPos.match(htmlSnippetCompletionRegExpr);
            if (match2 && doc.getText(new vscode_1.Range(new vscode_1.Position(0, 0), pos)).match(htmlSnippetCompletionRegExpr)) {
                const range = new vscode_1.Range(new vscode_1.Position(pos.line, match2[1].length), pos);
                const snippetProposal = new vscode_1.CompletionItem('HTML sample', vscode_1.CompletionItemKind.Snippet);
                snippetProposal.range = range;
                const content = ['<!DOCTYPE html>',
                    '<html lang=\'${1:en}\'>',
                    '<head>',
                    '\t<meta charset=\'utf-8\'>',
                    '\t<meta name=\'viewport\' content=\'width=device-width, initial-scale=1\'>',
                    '\t<title>${2:Page Title}</title>',
                    '\t<link rel=\'stylesheet\' href=\'${3:main.css}\'>',
                    '</head>',
                    '<body>',
                    '\t$0',
                    '</body>',
                    '</html>'].join('\n');
                snippetProposal.insertText = new vscode_1.SnippetString(content);
                snippetProposal.documentation = vscode_1.l10n.t('Simple HTML5 starting point');
                snippetProposal.filterText = match2[2];
                snippetProposal.sortText = 'za';
                results.push(snippetProposal);
            }
            return results;
        }
    }));
    return {
        dispose: async () => {
            await client.stop();
            toDispose.forEach(d => d.dispose());
            rangeFormatting?.dispose();
        }
    };
}
//# sourceMappingURL=htmlClient.js.map