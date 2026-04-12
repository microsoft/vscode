"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDiagnosticsPushSupport = registerDiagnosticsPushSupport;
exports.registerDiagnosticsPullSupport = registerDiagnosticsPullSupport;
const vscode_languageserver_1 = require("vscode-languageserver");
const runner_1 = require("./runner");
function registerDiagnosticsPushSupport(documents, connection, runtime, validate) {
    const pendingValidationRequests = {};
    const validationDelayMs = 500;
    const disposables = [];
    // The content of a text document has changed. This event is emitted
    // when the text document first opened or when its content has changed.
    documents.onDidChangeContent(change => {
        triggerValidation(change.document);
    }, undefined, disposables);
    // a document has closed: clear all diagnostics
    documents.onDidClose(event => {
        cleanPendingValidation(event.document);
        connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
    }, undefined, disposables);
    function cleanPendingValidation(textDocument) {
        const request = pendingValidationRequests[textDocument.uri];
        if (request) {
            request.dispose();
            delete pendingValidationRequests[textDocument.uri];
        }
    }
    function triggerValidation(textDocument) {
        cleanPendingValidation(textDocument);
        const request = pendingValidationRequests[textDocument.uri] = runtime.timer.setTimeout(async () => {
            if (request === pendingValidationRequests[textDocument.uri]) {
                try {
                    const diagnostics = await validate(textDocument);
                    if (request === pendingValidationRequests[textDocument.uri]) {
                        connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
                    }
                    delete pendingValidationRequests[textDocument.uri];
                }
                catch (e) {
                    connection.console.error((0, runner_1.formatError)(`Error while validating ${textDocument.uri}`, e));
                }
            }
        }, validationDelayMs);
    }
    return {
        requestRefresh: () => {
            documents.all().forEach(triggerValidation);
        },
        dispose: () => {
            disposables.forEach(d => d.dispose());
            disposables.length = 0;
            const keys = Object.keys(pendingValidationRequests);
            for (const key of keys) {
                pendingValidationRequests[key].dispose();
                delete pendingValidationRequests[key];
            }
        }
    };
}
function registerDiagnosticsPullSupport(documents, connection, runtime, validate) {
    function newDocumentDiagnosticReport(diagnostics) {
        return {
            kind: vscode_languageserver_1.DocumentDiagnosticReportKind.Full,
            items: diagnostics
        };
    }
    const registration = connection.languages.diagnostics.on(async (params, token) => {
        return (0, runner_1.runSafeAsync)(runtime, async () => {
            const document = documents.get(params.textDocument.uri);
            if (document) {
                return newDocumentDiagnosticReport(await validate(document));
            }
            return newDocumentDiagnosticReport([]);
        }, newDocumentDiagnosticReport([]), `Error while computing diagnostics for ${params.textDocument.uri}`, token);
    });
    function requestRefresh() {
        connection.languages.diagnostics.refresh();
    }
    return {
        requestRefresh,
        dispose: () => {
            registration.dispose();
        }
    };
}
//# sourceMappingURL=validation.js.map