/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createConnection, IConnection, TextDocuments, InitializeParams, InitializeResult, RequestType, DocumentRangeFormattingRequest, Disposable, DocumentSelector } from 'vscode-languageserver';
import { DocumentContext } from 'vscode-html-languageservice';
import { TextDocument, Diagnostic, DocumentLink, Range, SymbolInformation } from 'vscode-languageserver-types';
import { getLanguageModes, LanguageModes } from './modes/languageModes';

import { format } from './modes/formatting';

import * as url from 'url';
import * as path from 'path';
import uri from 'vscode-uri';

import * as nls from 'vscode-nls';
nls.config(process.env['VSCODE_NLS_CONFIG']);

namespace ColorSymbolRequest {
	export const type: RequestType<string, Range[], any, any> = new RequestType('css/colorSymbols');
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
var settings: any = {};

let clientSnippetSupport = false;
let clientDynamicRegisterSupport = false;

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

	function hasClientCapability(...keys: string[]) {
		let c = params.capabilities;
		for (let i = 0; c && i < keys.length; i++) {
			c = c[keys[i]];
		}
		return !!c;
	}

	clientSnippetSupport = hasClientCapability('textDocument', 'completion', 'completionItem', 'snippetSupport');
	clientDynamicRegisterSupport = hasClientCapability('workspace', 'symbol', 'dynamicRegistration');
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			completionProvider: clientDynamicRegisterSupport ? { resolveProvider: true, triggerCharacters: ['.', ':', '<', '"', '=', '/'] } : null,
			hoverProvider: true,
			documentHighlightProvider: true,
			documentRangeFormattingProvider: false,
			documentLinkProvider: { resolveProvider: false },
			documentSymbolProvider: true,
			definitionProvider: true,
			signatureHelpProvider: { triggerCharacters: ['('] },
			referencesProvider: true,
		}
	};
});

let validation = {
	html: true,
	css: true,
	javascript: true
};

let formatterRegistration: Thenable<Disposable> = null;

// The settings have changed. Is send on server activation as well.
connection.onDidChangeConfiguration((change) => {
	settings = change.settings;
	let validationSettings = settings && settings.html && settings.html.validate || {};
	validation.css = validationSettings.styles !== false;
	validation.javascript = validationSettings.scripts !== false;

	languageModes.getAllModes().forEach(m => {
		if (m.configure) {
			m.configure(change.settings);
		}
	});
	documents.all().forEach(triggerValidation);

	// dynamically enable & disable the formatter
	if (clientDynamicRegisterSupport) {
		let enableFormatter = settings && settings.html && settings.html.format && settings.html.format.enable;
		if (enableFormatter) {
			if (!formatterRegistration) {
				let documentSelector: DocumentSelector = [{ language: 'html' }, { language: 'handlebars' }]; // don't register razor, the formatter does more harm than good
				formatterRegistration = connection.client.register(DocumentRangeFormattingRequest.type, { documentSelector });
			}
		} else if (formatterRegistration) {
			formatterRegistration.then(r => r.dispose());
			formatterRegistration = null;
		}
	}

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
	if (textDocument.languageId === 'html') {
		languageModes.getAllModesInDocument(textDocument).forEach(mode => {
			if (mode.doValidation && validation[mode.getId()]) {
				pushAll(diagnostics, mode.doValidation(textDocument));
			}
		});
	}
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
		if (mode.getId() !== 'html') {
			connection.telemetry.logEvent({ key: 'html.embbedded.complete', value: { languageId: mode.getId() } });
		}
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

	let unformattedTags: string = settings && settings.html && settings.html.format && settings.html.format.unformatted || '';
	let enabledModes = { css: !unformattedTags.match(/\bstyle\b/), javascript: !unformattedTags.match(/\bscript\b/) };

	return format(languageModes, document, formatParams.range, formatParams.options, enabledModes);
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