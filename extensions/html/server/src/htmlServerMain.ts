/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	createConnection, IConnection,
	TextDocuments, TextDocument, InitializeParams, InitializeResult
} from 'vscode-languageserver';

import {HTMLDocument, LanguageSettings, getLanguageService} from './service/htmlLanguageService';

import * as nls from 'vscode-nls';
nls.config(process.env['VSCODE_NLS_CONFIG']);

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


// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites
connection.onInitialize((params: InitializeParams): InitializeResult => {
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			completionProvider: { resolveProvider: false, triggerCharacters: ['.', ':', '<', '"', '=', '/'] },
			documentHighlightProvider: true,
			documentRangeFormattingProvider: true,
			documentFormattingProvider: true
		}
	};
});

// create the JSON language service
var languageService = getLanguageService();

// The settings interface describes the server relevant settings part
interface Settings {
	html: LanguageSettings;
}

let languageSettings: LanguageSettings;

// The settings have changed. Is send on server activation as well.
connection.onDidChangeConfiguration((change) => {
	var settings = <Settings>change.settings;
	languageSettings = settings.html;
	updateConfiguration();
});

function updateConfiguration() {
	languageService.configure(languageSettings);

	// Revalidate any open text documents
	documents.all().forEach(triggerValidation);
}

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	triggerValidation(change.document);
});

// a document has closed: clear all diagnostics
documents.onDidClose(event => {
	cleanPendingValidation(event.document);
	connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

let pendingValidationRequests : {[uri:string]:NodeJS.Timer} = {};
const validationDelayMs = 200;

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
	if (textDocument.getText().length === 0) {
		// ignore empty documents
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
		return;
	}

	let htmlDocument = getHTMLDocument(textDocument);
	let diagnostics = languageService.doValidation(textDocument, htmlDocument);
	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

function getHTMLDocument(document: TextDocument): HTMLDocument {
	return languageService.parseHTMLDocument(document);
}

connection.onCompletion(textDocumentPosition => {
	let document = documents.get(textDocumentPosition.textDocument.uri);
	let htmlDocument = getHTMLDocument(document);
	return languageService.doComplete(document, textDocumentPosition.position, htmlDocument);
});

connection.onDocumentHighlight(documentHighlightParams => {
	let document = documents.get(documentHighlightParams.textDocument.uri);
	let htmlDocument = getHTMLDocument(document);
	return languageService.findDocumentHighlights(document, documentHighlightParams.position, htmlDocument);
});

function merge(src: any, dst: any) : any {
	for (var key in src) {
		if (src.hasOwnProperty(key)) {
			dst[key] = src[key];
		}
	}
	return dst;
}

function getFormattingOptions(formatParams : any) {
	let formatSettings = languageSettings && languageSettings.format;
	if (!formatSettings) {
		return formatParams;
	}
	return merge(formatParams, merge(formatSettings, {}));
}

connection.onDocumentFormatting(formatParams => {
	let document = documents.get(formatParams.textDocument.uri);
	return languageService.format(document, null, getFormattingOptions(formatParams));
});

connection.onDocumentRangeFormatting(formatParams => {
	let document = documents.get(formatParams.textDocument.uri);
	return languageService.format(document, formatParams.range, getFormattingOptions(formatParams));
});

// Listen on the connection
connection.listen();