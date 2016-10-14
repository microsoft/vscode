/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createConnection, IConnection, TextDocuments, InitializeParams, InitializeResult } from 'vscode-languageserver';

import { HTMLDocument, getLanguageService, CompletionConfiguration, HTMLFormatConfiguration, DocumentContext } from 'vscode-html-languageservice';
import { getLanguageModelCache } from './languageModelCache';
import * as url from 'url';


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

let htmlDocuments = getLanguageModelCache<HTMLDocument>(10, 60, document => getLanguageService().parseHTMLDocument(document));
documents.onDidClose(e => {
	htmlDocuments.onDocumentRemoved(e.document);
});
connection.onShutdown(() => {
	htmlDocuments.dispose();
});

let workspacePath: string;

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites
connection.onInitialize((params: InitializeParams): InitializeResult => {
	workspacePath = params.rootPath;
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			completionProvider: { resolveProvider: false, triggerCharacters: ['.', ':', '<', '"', '=', '/'] },
			documentHighlightProvider: true,
			documentRangeFormattingProvider: true,
			documentFormattingProvider: true,
			documentLinkProvider: true
		}
	};
});

// create the JSON language service
var languageService = getLanguageService();

// The settings interface describes the server relevant settings part
interface Settings {
	html: LanguageSettings;
}

interface LanguageSettings {
	suggest: CompletionConfiguration;
	format: HTMLFormatConfiguration;
}

let languageSettings: LanguageSettings;

// The settings have changed. Is send on server activation as well.
connection.onDidChangeConfiguration((change) => {
	var settings = <Settings>change.settings;
	languageSettings = settings.html;
});

connection.onCompletion(textDocumentPosition => {
	let document = documents.get(textDocumentPosition.textDocument.uri);
	let htmlDocument = htmlDocuments.get(document);
	let options = languageSettings && languageSettings.suggest;
	return languageService.doComplete(document, textDocumentPosition.position, htmlDocument, options);
});

connection.onDocumentHighlight(documentHighlightParams => {
	let document = documents.get(documentHighlightParams.textDocument.uri);
	let htmlDocument = htmlDocuments.get(document);
	return languageService.findDocumentHighlights(document, documentHighlightParams.position, htmlDocument);
});

function merge(src: any, dst: any): any {
	for (var key in src) {
		if (src.hasOwnProperty(key)) {
			dst[key] = src[key];
		}
	}
	return dst;
}

function getFormattingOptions(formatParams: any) {
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

connection.onDocumentLinks(documentLinkParam => {
	let document = documents.get(documentLinkParam.textDocument.uri);
	let documentContext: DocumentContext = { resolveReference: ref => url.resolve(document.uri, ref) };
	return languageService.findDocumentLinks(document, documentContext);
});


// Listen on the connection
connection.listen();