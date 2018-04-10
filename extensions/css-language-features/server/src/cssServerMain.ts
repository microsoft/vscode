/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	createConnection, IConnection, TextDocuments, InitializeParams, InitializeResult, ServerCapabilities, ConfigurationRequest, WorkspaceFolder
} from 'vscode-languageserver';

import { TextDocument, CompletionList } from 'vscode-languageserver-types';

import { getCSSLanguageService, getSCSSLanguageService, getLESSLanguageService, LanguageSettings, LanguageService, Stylesheet } from 'vscode-css-languageservice';
import { getLanguageModelCache } from './languageModelCache';
import { formatError, runSafe } from './utils/runner';
import URI from 'vscode-uri';
import { getPathCompletionParticipant } from './pathCompletion';
import { FoldingProviderServerCapabilities, FoldingRangesRequest } from 'vscode-languageserver-protocol-foldingprovider';

export interface Settings {
	css: LanguageSettings;
	less: LanguageSettings;
	scss: LanguageSettings;
}

// Create a connection for the server.
let connection: IConnection = createConnection();

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

process.on('unhandledRejection', (e: any) => {
	connection.console.error(formatError(`Unhandled exception`, e));
});

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let stylesheets = getLanguageModelCache<Stylesheet>(10, 60, document => getLanguageService(document).parseStylesheet(document));
documents.onDidClose(e => {
	stylesheets.onDocumentRemoved(e.document);
});
connection.onShutdown(() => {
	stylesheets.dispose();
});

let scopedSettingsSupport = false;
let workspaceFolders: WorkspaceFolder[];

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
connection.onInitialize((params: InitializeParams): InitializeResult => {
	workspaceFolders = (<any>params).workspaceFolders;
	if (!Array.isArray(workspaceFolders)) {
		workspaceFolders = [];
		if (params.rootPath) {
			workspaceFolders.push({ name: '', uri: URI.file(params.rootPath).toString() });
		}
	}

	function hasClientCapability(name: string) {
		let keys = name.split('.');
		let c: any = params.capabilities;
		for (let i = 0; c && i < keys.length; i++) {
			c = c[keys[i]];
		}
		return !!c;
	}
	let snippetSupport = hasClientCapability('textDocument.completion.completionItem.snippetSupport');
	scopedSettingsSupport = hasClientCapability('workspace.configuration');

	let capabilities: ServerCapabilities & FoldingProviderServerCapabilities = {
		// Tell the client that the server works in FULL text document sync mode
		textDocumentSync: documents.syncKind,
		completionProvider: snippetSupport ? { resolveProvider: false } : undefined,
		hoverProvider: true,
		documentSymbolProvider: true,
		referencesProvider: true,
		definitionProvider: true,
		documentHighlightProvider: true,
		codeActionProvider: true,
		renameProvider: true,
		colorProvider: true,
		foldingProvider: true
	};
	return { capabilities };
});

let languageServices: { [id: string]: LanguageService } = {
	css: getCSSLanguageService(),
	scss: getSCSSLanguageService(),
	less: getLESSLanguageService()
};

function getLanguageService(document: TextDocument) {
	let service = languageServices[document.languageId];
	if (!service) {
		connection.console.log('Document type is ' + document.languageId + ', using css instead.');
		service = languageServices['css'];
	}
	return service;
}

let documentSettings: { [key: string]: Thenable<LanguageSettings | undefined> } = {};
// remove document settings on close
documents.onDidClose(e => {
	delete documentSettings[e.document.uri];
});
function getDocumentSettings(textDocument: TextDocument): Thenable<LanguageSettings | undefined> {
	if (scopedSettingsSupport) {
		let promise = documentSettings[textDocument.uri];
		if (!promise) {
			let configRequestParam = { items: [{ scopeUri: textDocument.uri, section: textDocument.languageId }] };
			promise = connection.sendRequest(ConfigurationRequest.type, configRequestParam).then(s => s[0]);
			documentSettings[textDocument.uri] = promise;
		}
		return promise;
	}
	return Promise.resolve(void 0);
}

// The settings have changed. Is send on server activation as well.
connection.onDidChangeConfiguration(change => {
	updateConfiguration(<Settings>change.settings);
});

function updateConfiguration(settings: Settings) {
	for (let languageId in languageServices) {
		languageServices[languageId].configure((settings as any)[languageId]);
	}
	// reset all document settings
	documentSettings = {};
	// Revalidate any open text documents
	documents.all().forEach(triggerValidation);
}

let pendingValidationRequests: { [uri: string]: NodeJS.Timer } = {};
const validationDelayMs = 500;

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
	let settingsPromise = getDocumentSettings(textDocument);
	settingsPromise.then(settings => {
		let stylesheet = stylesheets.get(textDocument);
		let diagnostics = getLanguageService(textDocument).doValidation(textDocument, stylesheet, settings);
		// Send the computed diagnostics to VSCode.
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
	}, e => {
		connection.console.error(formatError(`Error while validating ${textDocument.uri}`, e));
	});
}

connection.onCompletion((textDocumentPosition, token) => {
	return runSafe(() => {
		let document = documents.get(textDocumentPosition.textDocument.uri);
		const cssLS = getLanguageService(document);
		const pathCompletionList: CompletionList = {
			isIncomplete: false,
			items: []
		};
		cssLS.setCompletionParticipants([getPathCompletionParticipant(document, workspaceFolders, pathCompletionList)]);
		const result = cssLS.doComplete(document, textDocumentPosition.position, stylesheets.get(document))!; /* TODO: remove ! once LS has null annotations */
		return {
			isIncomplete: result.isIncomplete,
			items: [...pathCompletionList.items, ...result.items]
		};
	}, null, `Error while computing completions for ${textDocumentPosition.textDocument.uri}`, token);
});

connection.onHover((textDocumentPosition, token) => {
	return runSafe(() => {
		let document = documents.get(textDocumentPosition.textDocument.uri);
		let styleSheet = stylesheets.get(document);
		return getLanguageService(document).doHover(document, textDocumentPosition.position, styleSheet);
	}, null, `Error while computing hover for ${textDocumentPosition.textDocument.uri}`, token);
});

connection.onDocumentSymbol((documentSymbolParams, token) => {
	return runSafe(() => {
		let document = documents.get(documentSymbolParams.textDocument.uri);
		let stylesheet = stylesheets.get(document);
		return getLanguageService(document).findDocumentSymbols(document, stylesheet);
	}, [], `Error while computing document symbols for ${documentSymbolParams.textDocument.uri}`, token);
});

connection.onDefinition((documentSymbolParams, token) => {
	return runSafe(() => {
		let document = documents.get(documentSymbolParams.textDocument.uri);
		let stylesheet = stylesheets.get(document);
		return getLanguageService(document).findDefinition(document, documentSymbolParams.position, stylesheet);
	}, null, `Error while computing definitions for ${documentSymbolParams.textDocument.uri}`, token);
});

connection.onDocumentHighlight((documentSymbolParams, token) => {
	return runSafe(() => {
		let document = documents.get(documentSymbolParams.textDocument.uri);
		let stylesheet = stylesheets.get(document);
		return getLanguageService(document).findDocumentHighlights(document, documentSymbolParams.position, stylesheet);
	}, [], `Error while computing document highlights for ${documentSymbolParams.textDocument.uri}`, token);
});

connection.onReferences((referenceParams, token) => {
	return runSafe(() => {
		let document = documents.get(referenceParams.textDocument.uri);
		let stylesheet = stylesheets.get(document);
		return getLanguageService(document).findReferences(document, referenceParams.position, stylesheet);
	}, [], `Error while computing references for ${referenceParams.textDocument.uri}`, token);
});

connection.onCodeAction((codeActionParams, token) => {
	return runSafe(() => {
		let document = documents.get(codeActionParams.textDocument.uri);
		let stylesheet = stylesheets.get(document);
		return getLanguageService(document).doCodeActions(document, codeActionParams.range, codeActionParams.context, stylesheet);
	}, [], `Error while computing code actions for ${codeActionParams.textDocument.uri}`, token);
});

connection.onDocumentColor((params, token) => {
	return runSafe(() => {
		let document = documents.get(params.textDocument.uri);
		if (document) {
			let stylesheet = stylesheets.get(document);
			return getLanguageService(document).findDocumentColors(document, stylesheet);
		}
		return [];
	}, [], `Error while computing document colors for ${params.textDocument.uri}`, token);
});

connection.onColorPresentation((params, token) => {
	return runSafe(() => {
		let document = documents.get(params.textDocument.uri);
		if (document) {
			let stylesheet = stylesheets.get(document);
			return getLanguageService(document).getColorPresentations(document, stylesheet, params.color, params.range);
		}
		return [];
	}, [], `Error while computing color presentations for ${params.textDocument.uri}`, token);
});

connection.onRenameRequest((renameParameters, token) => {
	return runSafe(() => {
		let document = documents.get(renameParameters.textDocument.uri);
		let stylesheet = stylesheets.get(document);
		return getLanguageService(document).doRename(document, renameParameters.position, renameParameters.newName, stylesheet);
	}, null, `Error while computing renames for ${renameParameters.textDocument.uri}`, token);
});

connection.onRequest(FoldingRangesRequest.type, (params, token) => {
	return runSafe(() => {
		let document = documents.get(params.textDocument.uri);
		let stylesheet = stylesheets.get(document);
		return getLanguageService(document).findFoldingRegions(document, stylesheet);
	}, null, `Error while computing folding ranges for ${params.textDocument.uri}`, token);
});

// Listen on the connection
connection.listen();