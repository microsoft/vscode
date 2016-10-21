/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createConnection, IConnection, TextDocuments, InitializeParams, InitializeResult, FormattingOptions, RequestType, CompletionList, Position, Hover } from 'vscode-languageserver';

import { HTMLDocument, getLanguageService, CompletionConfiguration, HTMLFormatConfiguration, DocumentContext } from 'vscode-html-languageservice';
import { getLanguageModelCache } from './languageModelCache';
import { getEmbeddedContent, getEmbeddedLanguageAtPosition } from './embeddedSupport';
import * as url from 'url';
import * as path from 'path';
import uri from 'vscode-uri';

import * as nls from 'vscode-nls';
nls.config(process.env['VSCODE_NLS_CONFIG']);

interface EmbeddedCompletionParams {
	uri: string;
	version: number;
	embeddedLanguageId: string;
	position: Position;
}

namespace EmbeddedCompletionRequest {
	export const type: RequestType<EmbeddedCompletionParams, CompletionList, any> = { get method() { return 'embedded/completion'; } };
}

interface EmbeddedHoverParams {
	uri: string;
	version: number;
	embeddedLanguageId: string;
	position: Position;
}

namespace EmbeddedHoverRequest {
	export const type: RequestType<EmbeddedCompletionParams, Hover, any> = { get method() { return 'embedded/hover'; } };
}

interface EmbeddedContentParams {
	uri: string;
	embeddedLanguageId: string;
}

interface EmbeddedContent {
	content: string;
	version: number;
}

namespace EmbeddedContentRequest {
	export const type: RequestType<EmbeddedContentParams, EmbeddedContent, any> = { get method() { return 'embedded/content'; } };
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

let htmlDocuments = getLanguageModelCache<HTMLDocument>(10, 60, document => getLanguageService().parseHTMLDocument(document));
documents.onDidClose(e => {
	htmlDocuments.onDocumentRemoved(e.document);
});
connection.onShutdown(() => {
	htmlDocuments.dispose();
});

let workspacePath: string;
let embeddedLanguages: { [languageId: string]: boolean };

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites
connection.onInitialize((params: InitializeParams): InitializeResult => {
	workspacePath = params.rootPath;
	embeddedLanguages = params.initializationOptions.embeddedLanguages;
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			completionProvider: { resolveProvider: false, triggerCharacters: ['.', ':', '<', '"', '=', '/'] },
			hoverProvider: true,
			documentHighlightProvider: true,
			documentRangeFormattingProvider: params.initializationOptions['format.enable'],
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
	let list = languageService.doComplete(document, textDocumentPosition.position, htmlDocument, options);
	if (list.items.length === 0 && embeddedLanguages) {
		let embeddedLanguageId = getEmbeddedLanguageAtPosition(languageService, document, htmlDocument, textDocumentPosition.position);
		if (embeddedLanguageId && embeddedLanguages[embeddedLanguageId]) {
			return connection.sendRequest(EmbeddedCompletionRequest.type, { uri: document.uri, version: document.version, embeddedLanguageId, position: textDocumentPosition.position });
		}
	}
	return list;
});

connection.onHover(textDocumentPosition => {
	let document = documents.get(textDocumentPosition.textDocument.uri);
	let htmlDocument = htmlDocuments.get(document);
	let hover = languageService.doHover(document, textDocumentPosition.position, htmlDocument);
	if (!hover && embeddedLanguages) {
		let embeddedLanguageId = getEmbeddedLanguageAtPosition(languageService, document, htmlDocument, textDocumentPosition.position);
		if (embeddedLanguageId && embeddedLanguages[embeddedLanguageId]) {
			return connection.sendRequest(EmbeddedHoverRequest.type, { uri: document.uri, version: document.version, embeddedLanguageId, position: textDocumentPosition.position });
		}
	}
	return hover;
});

connection.onRequest(EmbeddedContentRequest.type, parms => {
	let document = documents.get(parms.uri);
	if (document) {
		let htmlDocument = htmlDocuments.get(document);
		return { content: getEmbeddedContent(languageService, document, htmlDocument, parms.embeddedLanguageId), version: document.version };
	}
	return void 0;
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

function getFormattingOptions(formatParams: FormattingOptions) {
	let formatSettings = languageSettings && languageSettings.format;
	if (!formatSettings) {
		return formatParams;
	}
	return merge(formatParams, merge(formatSettings, {}));
}

connection.onDocumentRangeFormatting(formatParams => {
	let document = documents.get(formatParams.textDocument.uri);
	return languageService.format(document, formatParams.range, getFormattingOptions(formatParams.options));
});

connection.onDocumentLinks(documentLinkParam => {
	let document = documents.get(documentLinkParam.textDocument.uri);
	let documentContext: DocumentContext = {
		resolveReference: ref => {
			if (ref[0] === '/') {
				return uri.file(path.join(workspacePath, ref)).toString();
			}
			return url.resolve(document.uri, ref);
		}
	};
	return languageService.findDocumentLinks(document, documentContext);
});


// Listen on the connection
connection.listen();