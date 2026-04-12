"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const vscode_languageserver_1 = require("vscode-languageserver");
const vscode_uri_1 = require("vscode-uri");
const vscode_css_languageservice_1 = require("vscode-css-languageservice");
const languageModelCache_1 = require("./languageModelCache");
const runner_1 = require("./utils/runner");
const validation_1 = require("./utils/validation");
const documentContext_1 = require("./utils/documentContext");
const customData_1 = require("./customData");
const requests_1 = require("./requests");
var CustomDataChangedNotification;
(function (CustomDataChangedNotification) {
    CustomDataChangedNotification.type = new vscode_languageserver_1.NotificationType('css/customDataChanged');
})(CustomDataChangedNotification || (CustomDataChangedNotification = {}));
function startServer(connection, runtime) {
    // Create a text document manager.
    const documents = new vscode_languageserver_1.TextDocuments(vscode_css_languageservice_1.TextDocument);
    // Make the text document manager listen on the connection
    // for open, change and close text document events
    documents.listen(connection);
    const stylesheets = (0, languageModelCache_1.getLanguageModelCache)(10, 60, document => getLanguageService(document).parseStylesheet(document));
    documents.onDidClose(e => {
        stylesheets.onDocumentRemoved(e.document);
    });
    connection.onShutdown(() => {
        stylesheets.dispose();
    });
    let scopedSettingsSupport = false;
    let foldingRangeLimit = Number.MAX_VALUE;
    let workspaceFolders;
    let formatterMaxNumberOfEdits = Number.MAX_VALUE;
    let dataProvidersReady = Promise.resolve();
    let diagnosticsSupport;
    const languageServices = {};
    const notReady = () => Promise.reject('Not Ready');
    let requestService = { getContent: notReady, stat: notReady, readDirectory: notReady };
    // After the server has started the client sends an initialize request. The server receives
    // in the passed params the rootPath of the workspace plus the client capabilities.
    connection.onInitialize((params) => {
        const initializationOptions = params.initializationOptions || {};
        if (!Array.isArray(params.workspaceFolders)) {
            workspaceFolders = [];
            if (params.rootPath) {
                workspaceFolders.push({ name: '', uri: vscode_uri_1.URI.file(params.rootPath).toString(true) });
            }
        }
        else {
            workspaceFolders = params.workspaceFolders;
        }
        requestService = (0, requests_1.getRequestService)(initializationOptions?.handledSchemas || ['file'], connection, runtime);
        function getClientCapability(name, def) {
            const keys = name.split('.');
            let c = params.capabilities;
            for (let i = 0; c && i < keys.length; i++) {
                if (!c.hasOwnProperty(keys[i])) {
                    return def;
                }
                c = c[keys[i]];
            }
            return c;
        }
        const snippetSupport = !!getClientCapability('textDocument.completion.completionItem.snippetSupport', false);
        scopedSettingsSupport = !!getClientCapability('workspace.configuration', false);
        foldingRangeLimit = getClientCapability('textDocument.foldingRange.rangeLimit', Number.MAX_VALUE);
        formatterMaxNumberOfEdits = initializationOptions?.customCapabilities?.rangeFormatting?.editLimit || Number.MAX_VALUE;
        languageServices.css = (0, vscode_css_languageservice_1.getCSSLanguageService)({ fileSystemProvider: requestService, clientCapabilities: params.capabilities });
        languageServices.scss = (0, vscode_css_languageservice_1.getSCSSLanguageService)({ fileSystemProvider: requestService, clientCapabilities: params.capabilities });
        languageServices.less = (0, vscode_css_languageservice_1.getLESSLanguageService)({ fileSystemProvider: requestService, clientCapabilities: params.capabilities });
        const supportsDiagnosticPull = getClientCapability('textDocument.diagnostic', undefined);
        if (supportsDiagnosticPull === undefined) {
            diagnosticsSupport = (0, validation_1.registerDiagnosticsPushSupport)(documents, connection, runtime, validateTextDocument);
        }
        else {
            diagnosticsSupport = (0, validation_1.registerDiagnosticsPullSupport)(documents, connection, runtime, validateTextDocument);
        }
        const capabilities = {
            textDocumentSync: vscode_languageserver_1.TextDocumentSyncKind.Incremental,
            completionProvider: snippetSupport ? { resolveProvider: false, triggerCharacters: ['/', '-', ':'] } : undefined,
            hoverProvider: true,
            documentSymbolProvider: true,
            referencesProvider: true,
            definitionProvider: true,
            documentHighlightProvider: true,
            documentLinkProvider: {
                resolveProvider: false
            },
            codeActionProvider: {
                codeActionKinds: [vscode_css_languageservice_1.CodeActionKind.QuickFix]
            },
            renameProvider: true,
            colorProvider: {},
            foldingRangeProvider: true,
            selectionRangeProvider: true,
            diagnosticProvider: {
                documentSelector: null,
                interFileDependencies: false,
                workspaceDiagnostics: false
            },
            documentRangeFormattingProvider: initializationOptions?.provideFormatter === true,
            documentFormattingProvider: initializationOptions?.provideFormatter === true,
        };
        return { capabilities };
    });
    function getLanguageService(document) {
        let service = languageServices[document.languageId];
        if (!service) {
            connection.console.log('Document type is ' + document.languageId + ', using css instead.');
            service = languageServices['css'];
        }
        return service;
    }
    let documentSettings = {};
    // remove document settings on close
    documents.onDidClose(e => {
        delete documentSettings[e.document.uri];
    });
    function getDocumentSettings(textDocument) {
        if (scopedSettingsSupport) {
            let promise = documentSettings[textDocument.uri];
            if (!promise) {
                const configRequestParam = { items: [{ scopeUri: textDocument.uri, section: textDocument.languageId }] };
                promise = connection.sendRequest(vscode_languageserver_1.ConfigurationRequest.type, configRequestParam).then(s => s[0]);
                documentSettings[textDocument.uri] = promise;
            }
            return promise;
        }
        return Promise.resolve(undefined);
    }
    // The settings have changed. Is send on server activation as well.
    connection.onDidChangeConfiguration(change => {
        updateConfiguration(change.settings);
    });
    function updateConfiguration(settings) {
        for (const languageId in languageServices) {
            languageServices[languageId].configure(settings[languageId]);
        }
        // reset all document settings
        documentSettings = {};
        diagnosticsSupport?.requestRefresh();
    }
    async function validateTextDocument(textDocument) {
        const settingsPromise = getDocumentSettings(textDocument);
        const [settings] = await Promise.all([settingsPromise, dataProvidersReady]);
        const stylesheet = stylesheets.get(textDocument);
        return getLanguageService(textDocument).doValidation(textDocument, stylesheet, settings);
    }
    function updateDataProviders(dataPaths) {
        dataProvidersReady = (0, customData_1.fetchDataProviders)(dataPaths, requestService).then(customDataProviders => {
            for (const lang in languageServices) {
                languageServices[lang].setDataProviders(true, customDataProviders);
            }
        });
    }
    connection.onCompletion((textDocumentPosition, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(textDocumentPosition.textDocument.uri);
            if (document) {
                const [settings,] = await Promise.all([getDocumentSettings(document), dataProvidersReady]);
                const styleSheet = stylesheets.get(document);
                const documentContext = (0, documentContext_1.getDocumentContext)(document.uri, workspaceFolders);
                return getLanguageService(document).doComplete2(document, textDocumentPosition.position, styleSheet, documentContext, settings?.completion);
            }
            return null;
        }, null, `Error while computing completions for ${textDocumentPosition.textDocument.uri}`, token);
    });
    connection.onHover((textDocumentPosition, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(textDocumentPosition.textDocument.uri);
            if (document) {
                const [settings,] = await Promise.all([getDocumentSettings(document), dataProvidersReady]);
                const styleSheet = stylesheets.get(document);
                return getLanguageService(document).doHover(document, textDocumentPosition.position, styleSheet, settings?.hover);
            }
            return null;
        }, null, `Error while computing hover for ${textDocumentPosition.textDocument.uri}`, token);
    });
    connection.onDocumentSymbol((documentSymbolParams, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(documentSymbolParams.textDocument.uri);
            if (document) {
                await dataProvidersReady;
                const stylesheet = stylesheets.get(document);
                return getLanguageService(document).findDocumentSymbols2(document, stylesheet);
            }
            return [];
        }, [], `Error while computing document symbols for ${documentSymbolParams.textDocument.uri}`, token);
    });
    connection.onDefinition((documentDefinitionParams, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(documentDefinitionParams.textDocument.uri);
            if (document) {
                await dataProvidersReady;
                const stylesheet = stylesheets.get(document);
                return getLanguageService(document).findDefinition(document, documentDefinitionParams.position, stylesheet);
            }
            return null;
        }, null, `Error while computing definitions for ${documentDefinitionParams.textDocument.uri}`, token);
    });
    connection.onDocumentHighlight((documentHighlightParams, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(documentHighlightParams.textDocument.uri);
            if (document) {
                await dataProvidersReady;
                const stylesheet = stylesheets.get(document);
                return getLanguageService(document).findDocumentHighlights(document, documentHighlightParams.position, stylesheet);
            }
            return [];
        }, [], `Error while computing document highlights for ${documentHighlightParams.textDocument.uri}`, token);
    });
    connection.onDocumentLinks(async (documentLinkParams, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(documentLinkParams.textDocument.uri);
            if (document) {
                await dataProvidersReady;
                const documentContext = (0, documentContext_1.getDocumentContext)(document.uri, workspaceFolders);
                const stylesheet = stylesheets.get(document);
                return getLanguageService(document).findDocumentLinks2(document, stylesheet, documentContext);
            }
            return [];
        }, [], `Error while computing document links for ${documentLinkParams.textDocument.uri}`, token);
    });
    connection.onReferences((referenceParams, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(referenceParams.textDocument.uri);
            if (document) {
                await dataProvidersReady;
                const stylesheet = stylesheets.get(document);
                return getLanguageService(document).findReferences(document, referenceParams.position, stylesheet);
            }
            return [];
        }, [], `Error while computing references for ${referenceParams.textDocument.uri}`, token);
    });
    connection.onCodeAction((codeActionParams, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(codeActionParams.textDocument.uri);
            if (document) {
                await dataProvidersReady;
                const stylesheet = stylesheets.get(document);
                return getLanguageService(document).doCodeActions2(document, codeActionParams.range, codeActionParams.context, stylesheet);
            }
            return [];
        }, [], `Error while computing code actions for ${codeActionParams.textDocument.uri}`, token);
    });
    connection.onDocumentColor((params, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(params.textDocument.uri);
            if (document) {
                await dataProvidersReady;
                const stylesheet = stylesheets.get(document);
                return getLanguageService(document).findDocumentColors(document, stylesheet);
            }
            return [];
        }, [], `Error while computing document colors for ${params.textDocument.uri}`, token);
    });
    connection.onColorPresentation((params, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(params.textDocument.uri);
            if (document) {
                await dataProvidersReady;
                const stylesheet = stylesheets.get(document);
                return getLanguageService(document).getColorPresentations(document, stylesheet, params.color, params.range);
            }
            return [];
        }, [], `Error while computing color presentations for ${params.textDocument.uri}`, token);
    });
    connection.onRenameRequest((renameParameters, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(renameParameters.textDocument.uri);
            if (document) {
                await dataProvidersReady;
                const stylesheet = stylesheets.get(document);
                return getLanguageService(document).doRename(document, renameParameters.position, renameParameters.newName, stylesheet);
            }
            return null;
        }, null, `Error while computing renames for ${renameParameters.textDocument.uri}`, token);
    });
    connection.onFoldingRanges((params, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(params.textDocument.uri);
            if (document) {
                await dataProvidersReady;
                return getLanguageService(document).getFoldingRanges(document, { rangeLimit: foldingRangeLimit });
            }
            return null;
        }, null, `Error while computing folding ranges for ${params.textDocument.uri}`, token);
    });
    connection.onSelectionRanges((params, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(params.textDocument.uri);
            const positions = params.positions;
            if (document) {
                await dataProvidersReady;
                const stylesheet = stylesheets.get(document);
                return getLanguageService(document).getSelectionRanges(document, positions, stylesheet);
            }
            return [];
        }, [], `Error while computing selection ranges for ${params.textDocument.uri}`, token);
    });
    async function onFormat(textDocument, range, options) {
        const document = documents.get(textDocument.uri);
        if (document) {
            const edits = getLanguageService(document).format(document, range ?? getFullRange(document), options);
            if (edits.length > formatterMaxNumberOfEdits) {
                const newText = vscode_css_languageservice_1.TextDocument.applyEdits(document, edits);
                return [vscode_languageserver_1.TextEdit.replace(getFullRange(document), newText)];
            }
            return edits;
        }
        return [];
    }
    connection.onDocumentRangeFormatting((formatParams, token) => {
        return (0, runner_1.runSafeAsync)(runtime, () => onFormat(formatParams.textDocument, formatParams.range, formatParams.options), [], `Error while formatting range for ${formatParams.textDocument.uri}`, token);
    });
    connection.onDocumentFormatting((formatParams, token) => {
        return (0, runner_1.runSafeAsync)(runtime, () => onFormat(formatParams.textDocument, undefined, formatParams.options), [], `Error while formatting ${formatParams.textDocument.uri}`, token);
    });
    connection.onNotification(CustomDataChangedNotification.type, updateDataProviders);
    // Listen on the connection
    connection.listen();
}
function getFullRange(document) {
    return vscode_languageserver_1.Range.create(vscode_css_languageservice_1.Position.create(0, 0), document.positionAt(document.getText().length));
}
//# sourceMappingURL=cssServer.js.map