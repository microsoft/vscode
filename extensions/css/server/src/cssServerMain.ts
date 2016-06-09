/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	IPCMessageReader, IPCMessageWriter, createConnection, IConnection,
	TextDocuments, TextDocument, InitializeParams, InitializeResult
} from 'vscode-languageserver';

import {Parser} from './parser/cssParser';
import {CSSCompletion} from './services/cssCompletion';
import {CSSHover} from './services/cssHover';
import {CSSSymbols} from './services/cssSymbols';
import {CSSCodeActions} from './services/cssCodeActions';
import {CSSValidation, Settings} from './services/cssValidation';

import {Stylesheet} from './parser/cssNodes';

import * as nls from 'vscode-nls';
nls.config(process.env['VSCODE_NLS_CONFIG']);


// Create a connection for the server. The connection uses for
// stdin / stdout for message passing
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);


// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites.
connection.onInitialize((params: InitializeParams): InitializeResult => {
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			completionProvider: { resolveProvider: false },
			hoverProvider: true,
			documentSymbolProvider: true,
			referencesProvider: true,
			definitionProvider: true,
			documentHighlightProvider: true,
			codeActionProvider: true
		}
	};
});

let cssCompletion = new CSSCompletion();
let cssHover = new CSSHover();
let cssValidation = new CSSValidation();
let cssSymbols = new CSSSymbols();
let cssCodeActions = new CSSCodeActions();

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	validateTextDocument(change.document);
});

// The settings have changed. Is send on server activation as well.
connection.onDidChangeConfiguration((change) => {
	updateConfiguration(<Settings>change.settings);
});

function updateConfiguration(settings: Settings) {
	cssValidation.configure(settings.css);
	// Revalidate any open text documents
	documents.all().forEach(validateTextDocument);
}


function validateTextDocument(textDocument: TextDocument): void {
	if (textDocument.getText().length === 0) {
		// ignore empty documents
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: [] });
		return;
	}

	let stylesheet = getStylesheet(textDocument);
	cssValidation.doValidation(textDocument, stylesheet).then(diagnostics => {
		// Send the computed diagnostics to VSCode.
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
	});
}

let parser = new Parser();

function getStylesheet(document: TextDocument): Stylesheet {
	return parser.parseStylesheet(document);
}

connection.onCompletion(textDocumentPosition => {
	let document = documents.get(textDocumentPosition.textDocument.uri);
	let stylesheet = getStylesheet(document);
	return cssCompletion.doComplete(document, textDocumentPosition.position, stylesheet);
});

connection.onHover(textDocumentPosition => {
	let document = documents.get(textDocumentPosition.textDocument.uri);
	let styleSheet = getStylesheet(document);
	return cssHover.doHover(document, textDocumentPosition.position, styleSheet);
});

connection.onDocumentSymbol(documentSymbolParams => {
	let document = documents.get(documentSymbolParams.textDocument.uri);
	let stylesheet = getStylesheet(document);
	return cssSymbols.findDocumentSymbols(document, stylesheet);
});

connection.onDefinition(documentSymbolParams => {
	let document = documents.get(documentSymbolParams.textDocument.uri);
	let stylesheet = getStylesheet(document);
	return cssSymbols.findDefinition(document, documentSymbolParams.position, stylesheet);
});

connection.onDocumentHighlight(documentSymbolParams => {
	let document = documents.get(documentSymbolParams.textDocument.uri);
	let stylesheet = getStylesheet(document);
	return cssSymbols.findDocumentHighlights(document, documentSymbolParams.position, stylesheet);
});

connection.onReferences(referenceParams => {
	let document = documents.get(referenceParams.textDocument.uri);
	let stylesheet = getStylesheet(document);
	return cssSymbols.findReferences(document, referenceParams.position, stylesheet);
});

connection.onCodeAction(codeActionParams => {
	let document = documents.get(codeActionParams.textDocument.uri);
	let stylesheet = getStylesheet(document);
	return cssCodeActions.doCodeActions(document, codeActionParams.range, codeActionParams.context, stylesheet);
});

// Listen on the connection
connection.listen();