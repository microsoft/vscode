/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createConnection, IConnection, TextDocuments, InitializeParams, InitializeResult, RequestType } from 'vscode-languageserver';
import { DocumentContext } from 'vscode-html-languageservice';
import { TextDocument, Diagnostic, DocumentLink, Range, TextEdit, SymbolInformation } from 'vscode-languageserver-types';
import { getLanguageModes, LanguageModes } from './modes/languageModes';

import * as url from 'url';
import * as path from 'path';
import uri from 'vscode-uri';

import * as nls from 'vscode-nls';
nls.config(process.env['VSCODE_NLS_CONFIG']);

namespace ColorSymbolRequest {
	export const type: RequestType<string, Range[], any, any> = { get method() { return 'css/colorSymbols'; }, _: null };
}

// Create a connection for the server
let connection: IConnection = createConnection();

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let workspacePath: string;
var languageModes: LanguageModes;

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites
connection.onInitialize((params: InitializeParams): InitializeResult => {
	let initializationOptions = params.initializationOptions;

	workspacePath = params.rootPath;

	languageModes = getLanguageModes(initializationOptions ? initializationOptions.embeddedLanguages : { css: true, javascript: true });
	documents.onDidClose(e => {
		languageModes.onDocumentRemoved(e.document);
	});
	connection.onShutdown(() => {
		languageModes.dispose();
	});

	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			completionProvider: { resolveProvider: true, triggerCharacters: ['.', ':', '<', '"', '=', '/'] },
			hoverProvider: true,
			documentHighlightProvider: true,
			documentRangeFormattingProvider: initializationOptions && initializationOptions['format.enable'],
			documentLinkProvider: true,
			documentSymbolProvider: true,
			definitionProvider: true,
			signatureHelpProvider: { triggerCharacters: ['('] },
			referencesProvider: true
		}
	};
});


// The settings have changed. Is send on server activation as well.
connection.onDidChangeConfiguration((change) => {
	languageModes.getAllModes().forEach(m => {
		if (m.configure) {
			m.configure(change.settings);
		}
	});
	documents.all().forEach(triggerValidation);
});

let pendingValidationRequests: { [uri: string]: NodeJS.Timer } = {};
const validationDelayMs = 200;

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
	triggerValidation(change.document);
});

// a document has closed: clear all diagnostics
documents.onDidClose(event => {
	cleanPendingValidation(event.document);
	connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

function cleanPendingValidation(textDocument: TextDocument): void {
	let request = pendingValidationRequests[textDocument.uri];
	if (request) {
		clearTimeout(request);
		delete pendingValidationRequests[textDocument.uri];
	}
}

function triggerValidation(textDocument: TextDocument): void {
	cleanPendingValidation(textDocument);
	pendingValidationRequests[textDocument.uri] = setTimeout(() => {
		delete pendingValidationRequests[textDocument.uri];
		validateTextDocument(textDocument);
	}, validationDelayMs);
}

function validateTextDocument(textDocument: TextDocument): void {
	let diagnostics: Diagnostic[] = [];
	languageModes.getAllModesInDocument(textDocument).forEach(mode => {
		if (mode.doValidation) {
			pushAll(diagnostics, mode.doValidation(textDocument));
		}
	});
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

function pushAll<T>(to: T[], from: T[]) {
	if (from) {
		for (var i = 0; i < from.length; i++) {
			to.push(from[i]);
		}
	}
}

connection.onCompletion(textDocumentPosition => {
	let document = documents.get(textDocumentPosition.textDocument.uri);
	let mode = languageModes.getModeAtPosition(document, textDocumentPosition.position);
	if (mode && mode.doComplete) {
		return mode.doComplete(document, textDocumentPosition.position);
	}
	return { isIncomplete: true, items: [] };
});

connection.onCompletionResolve(item => {
	let data = item.data;
	if (data && data.languageId && data.uri) {
		let mode = languageModes.getMode(data.languageId);
		let document = documents.get(data.uri);
		if (mode && mode.doResolve && document) {
			return mode.doResolve(document, item);
		}
	}
	return item;
});

connection.onHover(textDocumentPosition => {
	let document = documents.get(textDocumentPosition.textDocument.uri);
	let mode = languageModes.getModeAtPosition(document, textDocumentPosition.position);
	if (mode && mode.doHover) {
		return mode.doHover(document, textDocumentPosition.position);
	}
	return null;
});

connection.onDocumentHighlight(documentHighlightParams => {
	let document = documents.get(documentHighlightParams.textDocument.uri);
	let mode = languageModes.getModeAtPosition(document, documentHighlightParams.position);
	if (mode && mode.findDocumentHighlight) {
		return mode.findDocumentHighlight(document, documentHighlightParams.position);
	}
	return [];
});

connection.onDefinition(definitionParams => {
	let document = documents.get(definitionParams.textDocument.uri);
	let mode = languageModes.getModeAtPosition(document, definitionParams.position);
	if (mode && mode.findDefinition) {
		return mode.findDefinition(document, definitionParams.position);
	}
	return [];
});

connection.onReferences(referenceParams => {
	let document = documents.get(referenceParams.textDocument.uri);
	let mode = languageModes.getModeAtPosition(document, referenceParams.position);
	if (mode && mode.findReferences) {
		return mode.findReferences(document, referenceParams.position);
	}
	return [];
});

connection.onSignatureHelp(signatureHelpParms => {
	let document = documents.get(signatureHelpParms.textDocument.uri);
	let mode = languageModes.getModeAtPosition(document, signatureHelpParms.position);
	if (mode && mode.doSignatureHelp) {
		return mode.doSignatureHelp(document, signatureHelpParms.position);
	}
	return null;
});

connection.onDocumentRangeFormatting(formatParams => {
	let document = documents.get(formatParams.textDocument.uri);
	let ranges = languageModes.getModesInRange(document, formatParams.range);
	let result: TextEdit[] = [];
	ranges.forEach(r => {
		let mode = r.mode;
		if (mode && mode.format && !r.attributeValue) {
			let edits = mode.format(document, r, formatParams.options);
			pushAll(result, edits);
		}
	});
	return result;
});

connection.onDocumentLinks(documentLinkParam => {
	let document = documents.get(documentLinkParam.textDocument.uri);
	let documentContext: DocumentContext = {
		resolveReference: ref => {
			if (workspacePath && ref[0] === '/') {
				return uri.file(path.join(workspacePath, ref)).toString();
			}
			return url.resolve(document.uri, ref);
		}
	};
	let links: DocumentLink[] = [];
	languageModes.getAllModesInDocument(document).forEach(m => {
		if (m.findDocumentLinks) {
			pushAll(links, m.findDocumentLinks(document, documentContext));
		}
	});
	return links;
});

connection.onDocumentSymbol(documentSymbolParms => {
	let document = documents.get(documentSymbolParms.textDocument.uri);
	let symbols: SymbolInformation[] = [];
	languageModes.getAllModesInDocument(document).forEach(m => {
		if (m.findDocumentSymbols) {
			pushAll(symbols, m.findDocumentSymbols(document));
		}
	});
	return symbols;
});

connection.onRequest(ColorSymbolRequest.type, uri => {
	let ranges: Range[] = [];
	let document = documents.get(uri);
	if (document) {
		languageModes.getAllModesInDocument(document).forEach(m => {
			if (m.findColorSymbols) {
				pushAll(ranges, m.findColorSymbols(document));
			}
		});
	}
	return ranges;
});

// Listen on the connection
connection.listen();