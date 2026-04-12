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
exports.startServer = startServer;
const vscode_languageserver_1 = require("vscode-languageserver");
const runner_1 = require("./utils/runner");
const validation_1 = require("./utils/validation");
const vscode_json_languageservice_1 = require("vscode-json-languageservice");
const languageModelCache_1 = require("./languageModelCache");
const vscode_uri_1 = require("vscode-uri");
const l10n = __importStar(require("@vscode/l10n"));
var SchemaAssociationNotification;
(function (SchemaAssociationNotification) {
    SchemaAssociationNotification.type = new vscode_languageserver_1.NotificationType('json/schemaAssociations');
})(SchemaAssociationNotification || (SchemaAssociationNotification = {}));
var VSCodeContentRequest;
(function (VSCodeContentRequest) {
    VSCodeContentRequest.type = new vscode_languageserver_1.RequestType('vscode/content');
})(VSCodeContentRequest || (VSCodeContentRequest = {}));
var SchemaContentChangeNotification;
(function (SchemaContentChangeNotification) {
    SchemaContentChangeNotification.type = new vscode_languageserver_1.NotificationType('json/schemaContent');
})(SchemaContentChangeNotification || (SchemaContentChangeNotification = {}));
var ForceValidateRequest;
(function (ForceValidateRequest) {
    ForceValidateRequest.type = new vscode_languageserver_1.RequestType('json/validate');
})(ForceValidateRequest || (ForceValidateRequest = {}));
var ForceValidateAllRequest;
(function (ForceValidateAllRequest) {
    ForceValidateAllRequest.type = new vscode_languageserver_1.RequestType('json/validateAll');
})(ForceValidateAllRequest || (ForceValidateAllRequest = {}));
var LanguageStatusRequest;
(function (LanguageStatusRequest) {
    LanguageStatusRequest.type = new vscode_languageserver_1.RequestType('json/languageStatus');
})(LanguageStatusRequest || (LanguageStatusRequest = {}));
var ValidateContentRequest;
(function (ValidateContentRequest) {
    ValidateContentRequest.type = new vscode_languageserver_1.RequestType('json/validateContent');
})(ValidateContentRequest || (ValidateContentRequest = {}));
var DocumentSortingRequest;
(function (DocumentSortingRequest) {
    DocumentSortingRequest.type = new vscode_languageserver_1.RequestType('json/sort');
})(DocumentSortingRequest || (DocumentSortingRequest = {}));
const workspaceContext = {
    resolveRelativePath: (relativePath, resource) => {
        const base = resource.substring(0, resource.lastIndexOf('/') + 1);
        return vscode_uri_1.Utils.resolvePath(vscode_uri_1.URI.parse(base), relativePath).toString();
    }
};
const sortCodeActionKind = vscode_languageserver_1.CodeActionKind.Source.concat('.sort', '.json');
function startServer(connection, runtime) {
    function getSchemaRequestService(handledSchemas = ['https', 'http', 'file']) {
        const builtInHandlers = {};
        for (const protocol of handledSchemas) {
            if (protocol === 'file') {
                builtInHandlers[protocol] = runtime.file;
            }
            else if (protocol === 'http' || protocol === 'https') {
                builtInHandlers[protocol] = runtime.http;
            }
        }
        return (uri) => {
            const protocol = uri.substr(0, uri.indexOf(':'));
            const builtInHandler = builtInHandlers[protocol];
            if (builtInHandler) {
                return builtInHandler.getContent(uri);
            }
            return connection.sendRequest(VSCodeContentRequest.type, uri).then(responseText => {
                return responseText;
            }, (error) => {
                return Promise.reject(error);
            });
        };
    }
    // create the JSON language service
    let languageService = (0, vscode_json_languageservice_1.getLanguageService)({
        workspaceContext,
        contributions: [],
        clientCapabilities: vscode_json_languageservice_1.ClientCapabilities.LATEST
    });
    // Create a text document manager.
    const documents = new vscode_languageserver_1.TextDocuments(vscode_json_languageservice_1.TextDocument);
    // Make the text document manager listen on the connection
    // for open, change and close text document events
    documents.listen(connection);
    let clientSnippetSupport = false;
    let dynamicFormatterRegistration = false;
    let hierarchicalDocumentSymbolSupport = false;
    let foldingRangeLimitDefault = Number.MAX_VALUE;
    let resultLimit = Number.MAX_VALUE;
    let jsonFoldingRangeLimit = Number.MAX_VALUE;
    let jsoncFoldingRangeLimit = Number.MAX_VALUE;
    let jsonColorDecoratorLimit = Number.MAX_VALUE;
    let jsoncColorDecoratorLimit = Number.MAX_VALUE;
    let formatterMaxNumberOfEdits = Number.MAX_VALUE;
    let diagnosticsSupport;
    // After the server has started the client sends an initialize request. The server receives
    // in the passed params the rootPath of the workspace plus the client capabilities.
    connection.onInitialize((params) => {
        const initializationOptions = params.initializationOptions || {};
        const handledProtocols = initializationOptions?.handledSchemaProtocols;
        languageService = (0, vscode_json_languageservice_1.getLanguageService)({
            schemaRequestService: getSchemaRequestService(handledProtocols),
            workspaceContext,
            contributions: [],
            clientCapabilities: params.capabilities
        });
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
        clientSnippetSupport = getClientCapability('textDocument.completion.completionItem.snippetSupport', false);
        dynamicFormatterRegistration = getClientCapability('textDocument.rangeFormatting.dynamicRegistration', false) && (typeof initializationOptions.provideFormatter !== 'boolean');
        foldingRangeLimitDefault = getClientCapability('textDocument.foldingRange.rangeLimit', Number.MAX_VALUE);
        hierarchicalDocumentSymbolSupport = getClientCapability('textDocument.documentSymbol.hierarchicalDocumentSymbolSupport', false);
        formatterMaxNumberOfEdits = initializationOptions.customCapabilities?.rangeFormatting?.editLimit || Number.MAX_VALUE;
        const supportsDiagnosticPull = getClientCapability('textDocument.diagnostic', undefined);
        if (supportsDiagnosticPull === undefined) {
            diagnosticsSupport = (0, validation_1.registerDiagnosticsPushSupport)(documents, connection, runtime, validateTextDocument);
        }
        else {
            diagnosticsSupport = (0, validation_1.registerDiagnosticsPullSupport)(documents, connection, runtime, validateTextDocument);
        }
        const capabilities = {
            textDocumentSync: vscode_languageserver_1.TextDocumentSyncKind.Incremental,
            completionProvider: clientSnippetSupport ? {
                resolveProvider: false, // turn off resolving as the current language service doesn't do anything on resolve. Also fixes #91747
                triggerCharacters: ['"', ':']
            } : undefined,
            hoverProvider: true,
            documentSymbolProvider: true,
            documentRangeFormattingProvider: initializationOptions.provideFormatter === true,
            documentFormattingProvider: initializationOptions.provideFormatter === true,
            colorProvider: {},
            foldingRangeProvider: true,
            selectionRangeProvider: true,
            documentLinkProvider: {},
            diagnosticProvider: {
                documentSelector: null,
                interFileDependencies: false,
                workspaceDiagnostics: false
            },
            codeActionProvider: {
                codeActionKinds: [sortCodeActionKind]
            }
        };
        return { capabilities };
    });
    let jsonConfigurationSettings = undefined;
    let schemaAssociations = undefined;
    let formatterRegistrations = null;
    let validateEnabled = true;
    let commentsSeverity = undefined;
    let trailingCommasSeverity = undefined;
    let schemaValidationSeverity = undefined;
    let schemaRequestSeverity = undefined;
    let keepLinesEnabled = false;
    // The settings have changed. Is sent on server activation as well.
    connection.onDidChangeConfiguration((change) => {
        const settings = change.settings;
        runtime.configureHttpRequests?.(settings?.http?.proxy, !!settings.http?.proxyStrictSSL);
        jsonConfigurationSettings = settings.json?.schemas;
        validateEnabled = !!settings.json?.validate?.enable;
        commentsSeverity = settings.json?.validate?.comments;
        trailingCommasSeverity = settings.json?.validate?.trailingCommas;
        schemaValidationSeverity = settings.json?.validate?.schemaValidation;
        schemaRequestSeverity = settings.json?.validate?.schemaRequest;
        keepLinesEnabled = settings.json?.keepLines?.enable || false;
        updateConfiguration();
        const sanitizeLimitSetting = (settingValue) => Math.trunc(Math.max(settingValue, 0));
        resultLimit = sanitizeLimitSetting(settings.json?.resultLimit || Number.MAX_VALUE);
        jsonFoldingRangeLimit = sanitizeLimitSetting(settings.json?.jsonFoldingLimit || foldingRangeLimitDefault);
        jsoncFoldingRangeLimit = sanitizeLimitSetting(settings.json?.jsoncFoldingLimit || foldingRangeLimitDefault);
        jsonColorDecoratorLimit = sanitizeLimitSetting(settings.json?.jsonColorDecoratorLimit || Number.MAX_VALUE);
        jsoncColorDecoratorLimit = sanitizeLimitSetting(settings.json?.jsoncColorDecoratorLimit || Number.MAX_VALUE);
        // dynamically enable & disable the formatter
        if (dynamicFormatterRegistration) {
            const enableFormatter = settings.json?.format?.enable;
            if (enableFormatter) {
                if (!formatterRegistrations) {
                    const documentSelector = [{ language: 'json' }, { language: 'jsonc' }];
                    formatterRegistrations = [
                        connection.client.register(vscode_languageserver_1.DocumentRangeFormattingRequest.type, { documentSelector }),
                        connection.client.register(vscode_languageserver_1.DocumentFormattingRequest.type, { documentSelector })
                    ];
                }
            }
            else if (formatterRegistrations) {
                formatterRegistrations.forEach(p => p.then(r => r.dispose()));
                formatterRegistrations = null;
            }
        }
    });
    // The jsonValidation extension configuration has changed
    connection.onNotification(SchemaAssociationNotification.type, associations => {
        schemaAssociations = associations;
        updateConfiguration();
    });
    // A schema has changed
    connection.onNotification(SchemaContentChangeNotification.type, uriOrUris => {
        let needsRevalidation = false;
        if (Array.isArray(uriOrUris)) {
            for (const uri of uriOrUris) {
                if (languageService.resetSchema(uri)) {
                    needsRevalidation = true;
                }
            }
        }
        else {
            needsRevalidation = languageService.resetSchema(uriOrUris);
        }
        if (needsRevalidation) {
            diagnosticsSupport?.requestRefresh();
        }
    });
    // Retry schema validation on all open documents
    connection.onRequest(ForceValidateAllRequest.type, async () => {
        diagnosticsSupport?.requestRefresh();
    });
    connection.onRequest(ForceValidateRequest.type, async (uri) => {
        const document = documents.get(uri);
        if (document) {
            updateConfiguration();
            return await validateTextDocument(document);
        }
        return [];
    });
    connection.onRequest(ValidateContentRequest.type, async ({ schemaUri, content }) => {
        const docURI = 'vscode://schemas/temp/' + new Date().getTime();
        const document = vscode_json_languageservice_1.TextDocument.create(docURI, 'json', 1, content);
        updateConfiguration([{ uri: schemaUri, fileMatch: [docURI] }]);
        return await validateTextDocument(document);
    });
    connection.onRequest(LanguageStatusRequest.type, async (uri) => {
        const document = documents.get(uri);
        if (document) {
            const jsonDocument = getJSONDocument(document);
            return languageService.getLanguageStatus(document, jsonDocument);
        }
        else {
            return { schemas: [] };
        }
    });
    connection.onRequest(DocumentSortingRequest.type, async (params) => {
        const uri = params.uri;
        const options = params.options;
        const document = documents.get(uri);
        if (document) {
            return languageService.sort(document, options);
        }
        return [];
    });
    function updateConfiguration(extraSchemas) {
        const languageSettings = {
            validate: validateEnabled,
            allowComments: true,
            schemas: new Array()
        };
        if (schemaAssociations) {
            if (Array.isArray(schemaAssociations)) {
                Array.prototype.push.apply(languageSettings.schemas, schemaAssociations);
            }
            else {
                for (const pattern in schemaAssociations) {
                    const association = schemaAssociations[pattern];
                    if (Array.isArray(association)) {
                        association.forEach(uri => {
                            languageSettings.schemas.push({ uri, fileMatch: [pattern] });
                        });
                    }
                }
            }
        }
        if (jsonConfigurationSettings) {
            jsonConfigurationSettings.forEach((schema, index) => {
                let uri = schema.url;
                if (!uri && schema.schema) {
                    uri = schema.schema.id || `vscode://schemas/custom/${index}`;
                }
                if (uri) {
                    languageSettings.schemas.push({ uri, fileMatch: schema.fileMatch, schema: schema.schema, folderUri: schema.folderUri });
                }
            });
        }
        if (extraSchemas) {
            languageSettings.schemas.push(...extraSchemas);
        }
        languageService.configure(languageSettings);
        diagnosticsSupport?.requestRefresh();
    }
    async function validateTextDocument(textDocument) {
        if (textDocument.getText().length === 0) {
            return []; // ignore empty documents
        }
        const jsonDocument = getJSONDocument(textDocument);
        const documentSettings = {
            comments: commentsSeverity ?? (textDocument.languageId === 'jsonc' ? 'ignore' : 'error'),
            trailingCommas: trailingCommasSeverity ?? (textDocument.languageId === 'jsonc' ? 'warning' : 'error'),
            schemaValidation: schemaValidationSeverity,
            schemaRequest: schemaRequestSeverity
        };
        return await languageService.doValidation(textDocument, jsonDocument, documentSettings);
    }
    connection.onDidChangeWatchedFiles((change) => {
        // Monitored files have changed in VSCode
        let hasChanges = false;
        for (const c of change.changes) {
            if (languageService.resetSchema(c.uri)) {
                hasChanges = true;
            }
        }
        if (hasChanges) {
            diagnosticsSupport?.requestRefresh();
        }
    });
    const jsonDocuments = (0, languageModelCache_1.getLanguageModelCache)(10, 60, document => languageService.parseJSONDocument(document));
    documents.onDidClose(e => {
        jsonDocuments.onDocumentRemoved(e.document);
    });
    connection.onShutdown(() => {
        jsonDocuments.dispose();
    });
    function getJSONDocument(document) {
        return jsonDocuments.get(document);
    }
    connection.onCompletion((textDocumentPosition, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(textDocumentPosition.textDocument.uri);
            if (document) {
                const jsonDocument = getJSONDocument(document);
                return languageService.doComplete(document, textDocumentPosition.position, jsonDocument);
            }
            return null;
        }, null, `Error while computing completions for ${textDocumentPosition.textDocument.uri}`, token);
    });
    connection.onHover((textDocumentPositionParams, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(textDocumentPositionParams.textDocument.uri);
            if (document) {
                const jsonDocument = getJSONDocument(document);
                return languageService.doHover(document, textDocumentPositionParams.position, jsonDocument);
            }
            return null;
        }, null, `Error while computing hover for ${textDocumentPositionParams.textDocument.uri}`, token);
    });
    connection.onDocumentSymbol((documentSymbolParams, token) => {
        return (0, runner_1.runSafe)(runtime, () => {
            const document = documents.get(documentSymbolParams.textDocument.uri);
            if (document) {
                const jsonDocument = getJSONDocument(document);
                if (hierarchicalDocumentSymbolSupport) {
                    return languageService.findDocumentSymbols2(document, jsonDocument, { resultLimit });
                }
                else {
                    return languageService.findDocumentSymbols(document, jsonDocument, { resultLimit });
                }
            }
            return [];
        }, [], `Error while computing document symbols for ${documentSymbolParams.textDocument.uri}`, token);
    });
    connection.onCodeAction((codeActionParams, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(codeActionParams.textDocument.uri);
            if (document) {
                const sortCodeAction = vscode_languageserver_1.CodeAction.create('Sort JSON', sortCodeActionKind);
                sortCodeAction.command = {
                    command: 'json.sort',
                    title: l10n.t('Sort JSON')
                };
                return [sortCodeAction];
            }
            return [];
        }, [], `Error while computing code actions for ${codeActionParams.textDocument.uri}`, token);
    });
    function onFormat(textDocument, range, options) {
        options.keepLines = keepLinesEnabled;
        const document = documents.get(textDocument.uri);
        if (document) {
            const edits = languageService.format(document, range ?? getFullRange(document), options);
            if (edits.length > formatterMaxNumberOfEdits) {
                const newText = vscode_json_languageservice_1.TextDocument.applyEdits(document, edits);
                return [vscode_languageserver_1.TextEdit.replace(getFullRange(document), newText)];
            }
            return edits;
        }
        return [];
    }
    connection.onDocumentRangeFormatting((formatParams, token) => {
        return (0, runner_1.runSafe)(runtime, () => onFormat(formatParams.textDocument, formatParams.range, formatParams.options), [], `Error while formatting range for ${formatParams.textDocument.uri}`, token);
    });
    connection.onDocumentFormatting((formatParams, token) => {
        return (0, runner_1.runSafe)(runtime, () => onFormat(formatParams.textDocument, undefined, formatParams.options), [], `Error while formatting ${formatParams.textDocument.uri}`, token);
    });
    connection.onDocumentColor((params, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(params.textDocument.uri);
            if (document) {
                const jsonDocument = getJSONDocument(document);
                const resultLimit = document.languageId === 'jsonc' ? jsoncColorDecoratorLimit : jsonColorDecoratorLimit;
                return languageService.findDocumentColors(document, jsonDocument, { resultLimit });
            }
            return [];
        }, [], `Error while computing document colors for ${params.textDocument.uri}`, token);
    });
    connection.onColorPresentation((params, token) => {
        return (0, runner_1.runSafe)(runtime, () => {
            const document = documents.get(params.textDocument.uri);
            if (document) {
                const jsonDocument = getJSONDocument(document);
                return languageService.getColorPresentations(document, jsonDocument, params.color, params.range);
            }
            return [];
        }, [], `Error while computing color presentations for ${params.textDocument.uri}`, token);
    });
    connection.onFoldingRanges((params, token) => {
        return (0, runner_1.runSafe)(runtime, () => {
            const document = documents.get(params.textDocument.uri);
            if (document) {
                const rangeLimit = document.languageId === 'jsonc' ? jsoncFoldingRangeLimit : jsonFoldingRangeLimit;
                return languageService.getFoldingRanges(document, { rangeLimit });
            }
            return null;
        }, null, `Error while computing folding ranges for ${params.textDocument.uri}`, token);
    });
    connection.onSelectionRanges((params, token) => {
        return (0, runner_1.runSafe)(runtime, () => {
            const document = documents.get(params.textDocument.uri);
            if (document) {
                const jsonDocument = getJSONDocument(document);
                return languageService.getSelectionRanges(document, params.positions, jsonDocument);
            }
            return [];
        }, [], `Error while computing selection ranges for ${params.textDocument.uri}`, token);
    });
    connection.onDocumentLinks((params, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(params.textDocument.uri);
            if (document) {
                const jsonDocument = getJSONDocument(document);
                return languageService.findLinks(document, jsonDocument);
            }
            return [];
        }, [], `Error while computing links for ${params.textDocument.uri}`, token);
    });
    // Listen on the connection
    connection.listen();
}
function getFullRange(document) {
    return vscode_json_languageservice_1.Range.create(vscode_json_languageservice_1.Position.create(0, 0), document.positionAt(document.getText().length));
}
//# sourceMappingURL=jsonServer.js.map