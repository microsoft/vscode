/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createConnection, IConnection, TextDocuments, InitializeParams, InitializeResult, RequestType, DocumentRangeFormattingRequest, Disposable, DocumentSelector, TextDocumentPositionParams, ServerCapabilities, Position, CompletionTriggerKind } from 'vscode-languageserver';
import { TextDocument, Diagnostic, DocumentLink, SymbolInformation, CompletionList } from 'vscode-languageserver-types';
import { getLanguageModes, LanguageModes, Settings } from './modes/languageModes';

import { ConfigurationRequest, ConfigurationParams } from 'vscode-languageserver-protocol/lib/protocol.configuration.proposed';
import { DocumentColorRequest, ServerCapabilities as CPServerCapabilities, ColorInformation, ColorPresentationRequest } from 'vscode-languageserver-protocol/lib/protocol.colorProvider.proposed';
import { DidChangeWorkspaceFoldersNotification, WorkspaceFolder } from 'vscode-languageserver-protocol/lib/protocol.workspaceFolders.proposed';

import { format } from './modes/formatting';
import { pushAll } from './utils/arrays';
import { getDocumentContext } from './utils/documentContext';
import uri from 'vscode-uri';
import { formatError, runSafe } from './utils/errors';
import { doComplete as emmetDoComplete, updateExtensionsPath as updateEmmetExtensionsPath, getEmmetCompletionParticipants } from 'vscode-emmet-helper';

import { FoldingRangesRequest, FoldingProviderServerCapabilities } from './protocol/foldingProvider.proposed';

namespace TagCloseRequest {
	export const type: RequestType<TextDocumentPositionParams, string | null, any, any> = new RequestType('html/tag');
}

// Create a connection for the server
let connection: IConnection = createConnection();

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

process.on('unhandledRejection', (e: any) => {
	connection.console.error(formatError(`Unhandled exception`, e));
});
process.on('uncaughtException', (e) => {
	connection.console.error(formatError(`Unhandled exception`, e));
});

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let workspaceFolders: WorkspaceFolder[] | undefined;

var languageModes: LanguageModes;

let clientSnippetSupport = false;
let clientDynamicRegisterSupport = false;
let scopedSettingsSupport = false;
let workspaceFoldersSupport = false;

var globalSettings: Settings = {};
let documentSettings: { [key: string]: Thenable<Settings> } = {};
// remove document settings on close
documents.onDidClose(e => {
	delete documentSettings[e.document.uri];
});

function getDocumentSettings(textDocument: TextDocument, needsDocumentSettings: () => boolean): Thenable<Settings | undefined> {
	if (scopedSettingsSupport && needsDocumentSettings()) {
		let promise = documentSettings[textDocument.uri];
		if (!promise) {
			let scopeUri = textDocument.uri;
			let configRequestParam: ConfigurationParams = { items: [{ scopeUri, section: 'css' }, { scopeUri, section: 'html' }, { scopeUri, section: 'javascript' }] };
			promise = connection.sendRequest(ConfigurationRequest.type, configRequestParam).then(s => ({ css: s[0], html: s[1], javascript: s[2] }));
			documentSettings[textDocument.uri] = promise;
		}
		return promise;
	}
	return Promise.resolve(void 0);
}

let emmetSettings = {};
let currentEmmetExtensionsPath: string;
const emmetTriggerCharacters = ['!', '.', '}', ':', '*', '$', ']', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilites
connection.onInitialize((params: InitializeParams): InitializeResult => {
	let initializationOptions = params.initializationOptions;

	workspaceFolders = (<any>params).workspaceFolders;
	if (!Array.isArray(workspaceFolders)) {
		workspaceFolders = [];
		if (params.rootPath) {
			workspaceFolders.push({ name: '', uri: uri.file(params.rootPath).toString() });
		}
	}

	languageModes = getLanguageModes(initializationOptions ? initializationOptions.embeddedLanguages : { css: true, javascript: true });
	documents.onDidClose(e => {
		languageModes.onDocumentRemoved(e.document);
	});
	connection.onShutdown(() => {
		languageModes.dispose();
	});

	function hasClientCapability(...keys: string[]) {
		let c = <any>params.capabilities;
		for (let i = 0; c && i < keys.length; i++) {
			c = c[keys[i]];
		}
		return !!c;
	}

	clientSnippetSupport = hasClientCapability('textDocument', 'completion', 'completionItem', 'snippetSupport');
	clientDynamicRegisterSupport = hasClientCapability('workspace', 'symbol', 'dynamicRegistration');
	scopedSettingsSupport = hasClientCapability('workspace', 'configuration');
	workspaceFoldersSupport = hasClientCapability('workspace', 'workspaceFolders');
	let capabilities: ServerCapabilities & CPServerCapabilities & FoldingProviderServerCapabilities = {
		// Tell the client that the server works in FULL text document sync mode
		textDocumentSync: documents.syncKind,
		completionProvider: clientSnippetSupport ? { resolveProvider: true, triggerCharacters: [...emmetTriggerCharacters, '.', ':', '<', '"', '=', '/'] } : undefined,
		hoverProvider: true,
		documentHighlightProvider: true,
		documentRangeFormattingProvider: false,
		documentLinkProvider: { resolveProvider: false },
		documentSymbolProvider: true,
		definitionProvider: true,
		signatureHelpProvider: { triggerCharacters: ['('] },
		referencesProvider: true,
		colorProvider: true,
		foldingProvider: true
	};
	return { capabilities };
});

connection.onInitialized((p) => {
	if (workspaceFoldersSupport) {
		connection.client.register(DidChangeWorkspaceFoldersNotification.type);

		connection.onNotification(DidChangeWorkspaceFoldersNotification.type, e => {
			let toAdd = e.event.added;
			let toRemove = e.event.removed;
			let updatedFolders = [];
			if (workspaceFolders) {
				for (let folder of workspaceFolders) {
					if (!toRemove.some(r => r.uri === folder.uri) && !toAdd.some(r => r.uri === folder.uri)) {
						updatedFolders.push(folder);
					}
				}
			}
			workspaceFolders = updatedFolders.concat(toAdd);
		});
	}
});

let formatterRegistration: Thenable<Disposable> | null = null;

// The settings have changed. Is send on server activation as well.
connection.onDidChangeConfiguration((change) => {
	globalSettings = change.settings;

	documentSettings = {}; // reset all document settings
	languageModes.getAllModes().forEach(m => {
		if (m.configure) {
			m.configure(change.settings);
		}
	});
	documents.all().forEach(triggerValidation);

	// dynamically enable & disable the formatter
	if (clientDynamicRegisterSupport) {
		let enableFormatter = globalSettings && globalSettings.html && globalSettings.html.format && globalSettings.html.format.enable;
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

	emmetSettings = globalSettings.emmet;
	if (currentEmmetExtensionsPath !== emmetSettings['extensionsPath']) {
		currentEmmetExtensionsPath = emmetSettings['extensionsPath'];
		const workspaceUri = (workspaceFolders && workspaceFolders.length === 1) ? uri.parse(workspaceFolders[0].uri) : null;
		updateEmmetExtensionsPath(currentEmmetExtensionsPath, workspaceUri ? workspaceUri.fsPath : null);
	}
});

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

function isValidationEnabled(languageId: string, settings: Settings = globalSettings) {
	let validationSettings = settings && settings.html && settings.html.validate;
	if (validationSettings) {
		return languageId === 'css' && validationSettings.styles !== false || languageId === 'javascript' && validationSettings.scripts !== false;
	}
	return true;
}

async function validateTextDocument(textDocument: TextDocument) {
	try {
		let diagnostics: Diagnostic[] = [];
		if (textDocument.languageId === 'html') {
			let modes = languageModes.getAllModesInDocument(textDocument);
			let settings = await getDocumentSettings(textDocument, () => modes.some(m => !!m.doValidation));
			modes.forEach(mode => {
				if (mode.doValidation && isValidationEnabled(mode.getId(), settings)) {
					pushAll(diagnostics, mode.doValidation(textDocument, settings));
				}
			});
		}
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
	} catch (e) {
		connection.console.error(formatError(`Error while validating ${textDocument.uri}`, e));
	}
}

let cachedCompletionList: CompletionList;
const hexColorRegex = /^#[\d,a-f,A-F]{1,6}$/;
connection.onCompletion(async textDocumentPosition => {
	return runSafe(async () => {
		let document = documents.get(textDocumentPosition.textDocument.uri);
		let mode = languageModes.getModeAtPosition(document, textDocumentPosition.position);
		if (!mode || !mode.doComplete) {
			return { isIncomplete: true, items: [] };
		}

		if (cachedCompletionList
			&& !cachedCompletionList.isIncomplete
			&& (mode.getId() === 'html' || mode.getId() === 'css')
			&& textDocumentPosition.context
			&& textDocumentPosition.context.triggerKind === CompletionTriggerKind.TriggerForIncompleteCompletions
		) {
			let result: CompletionList = emmetDoComplete(document, textDocumentPosition.position, mode.getId(), emmetSettings);
			if (result && result.items) {
				result.items.push(...cachedCompletionList.items);
			} else {
				result = cachedCompletionList;
				cachedCompletionList = null;
			}
			return result;
		}

		if (mode.getId() !== 'html') {
			connection.telemetry.logEvent({ key: 'html.embbedded.complete', value: { languageId: mode.getId() } });
		}

		cachedCompletionList = null;
		let emmetCompletionList: CompletionList = {
			isIncomplete: true,
			items: undefined
		};
		if (mode.setCompletionParticipants) {
			const emmetCompletionParticipant = getEmmetCompletionParticipants(document, textDocumentPosition.position, mode.getId(), emmetSettings, emmetCompletionList);
			mode.setCompletionParticipants([emmetCompletionParticipant]);
		}

		let settings = await getDocumentSettings(document, () => mode.doComplete.length > 2);
		let result = mode.doComplete(document, textDocumentPosition.position, settings);
		if (emmetCompletionList && emmetCompletionList.items) {
			cachedCompletionList = result;
			if (emmetCompletionList.items.length && hexColorRegex.test(emmetCompletionList.items[0].label) && result.items.some(x => x.label === emmetCompletionList.items[0].label)) {
				emmetCompletionList.items.shift();
			}
			return { isIncomplete: true, items: [...emmetCompletionList.items, ...result.items] };
		}
		return result;
	}, null, `Error while computing completions for ${textDocumentPosition.textDocument.uri}`);
});

connection.onCompletionResolve(item => {
	return runSafe(() => {
		let data = item.data;
		if (data && data.languageId && data.uri) {
			let mode = languageModes.getMode(data.languageId);
			let document = documents.get(data.uri);
			if (mode && mode.doResolve && document) {
				return mode.doResolve(document, item);
			}
		}
		return item;
	}, null, `Error while resolving completion proposal`);
});

connection.onHover(textDocumentPosition => {
	return runSafe(() => {
		let document = documents.get(textDocumentPosition.textDocument.uri);
		let mode = languageModes.getModeAtPosition(document, textDocumentPosition.position);
		if (mode && mode.doHover) {
			return mode.doHover(document, textDocumentPosition.position);
		}
		return null;
	}, null, `Error while computing hover for ${textDocumentPosition.textDocument.uri}`);
});

connection.onDocumentHighlight(documentHighlightParams => {
	return runSafe(() => {
		let document = documents.get(documentHighlightParams.textDocument.uri);
		let mode = languageModes.getModeAtPosition(document, documentHighlightParams.position);
		if (mode && mode.findDocumentHighlight) {
			return mode.findDocumentHighlight(document, documentHighlightParams.position);
		}
		return [];
	}, [], `Error while computing document highlights for ${documentHighlightParams.textDocument.uri}`);
});

connection.onDefinition(definitionParams => {
	return runSafe(() => {
		let document = documents.get(definitionParams.textDocument.uri);
		let mode = languageModes.getModeAtPosition(document, definitionParams.position);
		if (mode && mode.findDefinition) {
			return mode.findDefinition(document, definitionParams.position);
		}
		return [];
	}, null, `Error while computing definitions for ${definitionParams.textDocument.uri}`);
});

connection.onReferences(referenceParams => {
	return runSafe(() => {
		let document = documents.get(referenceParams.textDocument.uri);
		let mode = languageModes.getModeAtPosition(document, referenceParams.position);
		if (mode && mode.findReferences) {
			return mode.findReferences(document, referenceParams.position);
		}
		return [];
	}, [], `Error while computing references for ${referenceParams.textDocument.uri}`);
});

connection.onSignatureHelp(signatureHelpParms => {
	return runSafe(() => {
		let document = documents.get(signatureHelpParms.textDocument.uri);
		let mode = languageModes.getModeAtPosition(document, signatureHelpParms.position);
		if (mode && mode.doSignatureHelp) {
			return mode.doSignatureHelp(document, signatureHelpParms.position);
		}
		return null;
	}, null, `Error while computing signature help for ${signatureHelpParms.textDocument.uri}`);
});

connection.onDocumentRangeFormatting(async formatParams => {
	return runSafe(async () => {
		let document = documents.get(formatParams.textDocument.uri);
		let settings = await getDocumentSettings(document, () => true);
		if (!settings) {
			settings = globalSettings;
		}
		let unformattedTags: string = settings && settings.html && settings.html.format && settings.html.format.unformatted || '';
		let enabledModes = { css: !unformattedTags.match(/\bstyle\b/), javascript: !unformattedTags.match(/\bscript\b/) };

		return format(languageModes, document, formatParams.range, formatParams.options, settings, enabledModes);
	}, [], `Error while formatting range for ${formatParams.textDocument.uri}`);
});

connection.onDocumentLinks(documentLinkParam => {
	return runSafe(() => {
		let document = documents.get(documentLinkParam.textDocument.uri);
		let links: DocumentLink[] = [];
		if (document) {
			let documentContext = getDocumentContext(document.uri, workspaceFolders);
			languageModes.getAllModesInDocument(document).forEach(m => {
				if (m.findDocumentLinks) {
					pushAll(links, m.findDocumentLinks(document, documentContext));
				}
			});
		}
		return links;
	}, [], `Error while document links for ${documentLinkParam.textDocument.uri}`);
});



connection.onDocumentSymbol(documentSymbolParms => {
	return runSafe(() => {
		let document = documents.get(documentSymbolParms.textDocument.uri);
		let symbols: SymbolInformation[] = [];
		languageModes.getAllModesInDocument(document).forEach(m => {
			if (m.findDocumentSymbols) {
				pushAll(symbols, m.findDocumentSymbols(document));
			}
		});
		return symbols;
	}, [], `Error while computing document symbols for ${documentSymbolParms.textDocument.uri}`);
});

connection.onRequest(DocumentColorRequest.type, params => {
	return runSafe(() => {
		let infos: ColorInformation[] = [];
		let document = documents.get(params.textDocument.uri);
		if (document) {
			languageModes.getAllModesInDocument(document).forEach(m => {
				if (m.findDocumentColors) {
					pushAll(infos, m.findDocumentColors(document));
				}
			});
		}
		return infos;
	}, [], `Error while computing document colors for ${params.textDocument.uri}`);
});

connection.onRequest(ColorPresentationRequest.type, params => {
	return runSafe(() => {
		let document = documents.get(params.textDocument.uri);
		if (document) {
			let mode = languageModes.getModeAtPosition(document, params.range.start);
			if (mode && mode.getColorPresentations) {
				return mode.getColorPresentations(document, params.color, params.range);
			}
		}
		return [];
	}, [], `Error while computing color presentations for ${params.textDocument.uri}`);
});

connection.onRequest(TagCloseRequest.type, params => {
	return runSafe(() => {
		let document = documents.get(params.textDocument.uri);
		if (document) {
			let pos = params.position;
			if (pos.character > 0) {
				let mode = languageModes.getModeAtPosition(document, Position.create(pos.line, pos.character - 1));
				if (mode && mode.doAutoClose) {
					return mode.doAutoClose(document, pos);
				}
			}
		}
		return null;
	}, null, `Error while computing tag close actions for ${params.textDocument.uri}`);
});

connection.onRequest(FoldingRangesRequest.type, params => {
	return runSafe(() => {
		let document = documents.get(params.textDocument.uri);
		if (document) {
			let mode = languageModes.getMode('html');
			if (mode && mode.getFoldingRanges) {
				return mode.getFoldingRanges(document);
			}
			return null;
		}
		return null;
	}, null, `Error while computing folding regions for ${params.textDocument.uri}`);
});


// Listen on the connection
connection.listen();