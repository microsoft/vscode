/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	createConnection, IConnection, TextDocuments, InitializeParams, InitializeResult, RequestType,
	DocumentRangeFormattingRequest, Disposable, DocumentSelector, TextDocumentPositionParams, ServerCapabilities,
	Position, ConfigurationRequest, ConfigurationParams, DidChangeWorkspaceFoldersNotification,
	WorkspaceFolder, DocumentColorRequest, ColorInformation, ColorPresentationRequest
} from 'vscode-languageserver';
import { TextDocument, Diagnostic, DocumentLink, SymbolInformation } from 'vscode-languageserver-types';
import { getLanguageModes, LanguageModes, Settings } from './modes/languageModes';

import { format } from './modes/formatting';
import { pushAll } from './utils/arrays';
import { getDocumentContext } from './utils/documentContext';
import { URI } from 'vscode-uri';
import { formatError, runSafe, runSafeAsync } from './utils/runner';

import { getFoldingRanges } from './modes/htmlFolding';
import { getDataProviders } from './customData';

namespace TagCloseRequest {
	export const type: RequestType<TextDocumentPositionParams, string | null, any, any> = new RequestType('html/tag');
}

// Create a connection for the server
const connection: IConnection = createConnection();

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

process.on('unhandledRejection', (e: any) => {
	console.error(formatError(`Unhandled exception`, e));
});
process.on('uncaughtException', (e: any) => {
	console.error(formatError(`Unhandled exception`, e));
});

// Create a text document manager.
const documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let workspaceFolders: WorkspaceFolder[] = [];

let languageModes: LanguageModes;

let clientSnippetSupport = false;
let clientDynamicRegisterSupport = false;
let scopedSettingsSupport = false;
let workspaceFoldersSupport = false;
let foldingRangeLimit = Number.MAX_VALUE;

let globalSettings: Settings = {};
let documentSettings: { [key: string]: Thenable<Settings> } = {};
// remove document settings on close
documents.onDidClose(e => {
	delete documentSettings[e.document.uri];
});

function getDocumentSettings(textDocument: TextDocument, needsDocumentSettings: () => boolean): Thenable<Settings | undefined> {
	if (scopedSettingsSupport && needsDocumentSettings()) {
		let promise = documentSettings[textDocument.uri];
		if (!promise) {
			const scopeUri = textDocument.uri;
			const configRequestParam: ConfigurationParams = { items: [{ scopeUri, section: 'css' }, { scopeUri, section: 'html' }, { scopeUri, section: 'javascript' }] };
			promise = connection.sendRequest(ConfigurationRequest.type, configRequestParam).then(s => ({ css: s[0], html: s[1], javascript: s[2] }));
			documentSettings[textDocument.uri] = promise;
		}
		return promise;
	}
	return Promise.resolve(undefined);
}

// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities
connection.onInitialize((params: InitializeParams): InitializeResult => {
	const initializationOptions = params.initializationOptions;

	workspaceFolders = (<any>params).workspaceFolders;
	if (!Array.isArray(workspaceFolders)) {
		workspaceFolders = [];
		if (params.rootPath) {
			workspaceFolders.push({ name: '', uri: URI.file(params.rootPath).toString() });
		}
	}

	const dataPaths: string[] = params.initializationOptions.dataPaths;
	const providers = getDataProviders(dataPaths);

	const workspace = {
		get settings() { return globalSettings; },
		get folders() { return workspaceFolders; }
	};

	languageModes = getLanguageModes(initializationOptions ? initializationOptions.embeddedLanguages : { css: true, javascript: true }, workspace, params.capabilities, providers);

	documents.onDidClose(e => {
		languageModes.onDocumentRemoved(e.document);
	});
	connection.onShutdown(() => {
		languageModes.dispose();
	});

	function getClientCapability<T>(name: string, def: T) {
		const keys = name.split('.');
		let c: any = params.capabilities;
		for (let i = 0; c && i < keys.length; i++) {
			if (!c.hasOwnProperty(keys[i])) {
				return def;
			}
			c = c[keys[i]];
		}
		return c;
	}

	clientSnippetSupport = getClientCapability('textDocument.completion.completionItem.snippetSupport', false);
	clientDynamicRegisterSupport = getClientCapability('workspace.symbol.dynamicRegistration', false);
	scopedSettingsSupport = getClientCapability('workspace.configuration', false);
	workspaceFoldersSupport = getClientCapability('workspace.workspaceFolders', false);
	foldingRangeLimit = getClientCapability('textDocument.foldingRange.rangeLimit', Number.MAX_VALUE);
	const capabilities: ServerCapabilities = {
		// Tell the client that the server works in FULL text document sync mode
		textDocumentSync: documents.syncKind,
		completionProvider: clientSnippetSupport ? { resolveProvider: true, triggerCharacters: ['.', ':', '<', '"', '=', '/'] } : undefined,
		hoverProvider: true,
		documentHighlightProvider: true,
		documentRangeFormattingProvider: false,
		documentLinkProvider: { resolveProvider: false },
		documentSymbolProvider: true,
		definitionProvider: true,
		signatureHelpProvider: { triggerCharacters: ['('] },
		referencesProvider: true,
		colorProvider: {},
		foldingRangeProvider: true,
		selectionRangeProvider: true
	};
	return { capabilities };
});

connection.onInitialized(() => {
	if (workspaceFoldersSupport) {
		connection.client.register(DidChangeWorkspaceFoldersNotification.type);

		connection.onNotification(DidChangeWorkspaceFoldersNotification.type, e => {
			const toAdd = e.event.added;
			const toRemove = e.event.removed;
			const updatedFolders = [];
			if (workspaceFolders) {
				for (const folder of workspaceFolders) {
					if (!toRemove.some(r => r.uri === folder.uri) && !toAdd.some(r => r.uri === folder.uri)) {
						updatedFolders.push(folder);
					}
				}
			}
			workspaceFolders = updatedFolders.concat(toAdd);
			documents.all().forEach(triggerValidation);
		});
	}
});

let formatterRegistration: Thenable<Disposable> | null = null;

// The settings have changed. Is send on server activation as well.
connection.onDidChangeConfiguration((change) => {
	globalSettings = change.settings;
	documentSettings = {}; // reset all document settings
	documents.all().forEach(triggerValidation);

	// dynamically enable & disable the formatter
	if (clientDynamicRegisterSupport) {
		const enableFormatter = globalSettings && globalSettings.html && globalSettings.html.format && globalSettings.html.format.enable;
		if (enableFormatter) {
			if (!formatterRegistration) {
				const documentSelector: DocumentSelector = [{ language: 'html' }, { language: 'handlebars' }];
				formatterRegistration = connection.client.register(DocumentRangeFormattingRequest.type, { documentSelector });
			}
		} else if (formatterRegistration) {
			formatterRegistration.then(r => r.dispose());
			formatterRegistration = null;
		}
	}
});

const pendingValidationRequests: { [uri: string]: NodeJS.Timer } = {};
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
	const request = pendingValidationRequests[textDocument.uri];
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
	const validationSettings = settings && settings.html && settings.html.validate;
	if (validationSettings) {
		return languageId === 'css' && validationSettings.styles !== false || languageId === 'javascript' && validationSettings.scripts !== false;
	}
	return true;
}

async function validateTextDocument(textDocument: TextDocument) {
	try {
		const version = textDocument.version;
		const diagnostics: Diagnostic[] = [];
		if (textDocument.languageId === 'html') {
			const modes = languageModes.getAllModesInDocument(textDocument);
			const settings = await getDocumentSettings(textDocument, () => modes.some(m => !!m.doValidation));
			const latestTextDocument = documents.get(textDocument.uri);
			if (latestTextDocument && latestTextDocument.version === version) { // check no new version has come in after in after the async op
				modes.forEach(mode => {
					if (mode.doValidation && isValidationEnabled(mode.getId(), settings)) {
						pushAll(diagnostics, mode.doValidation(latestTextDocument, settings));
					}
				});
				connection.sendDiagnostics({ uri: latestTextDocument.uri, diagnostics });
			}
		}
	} catch (e) {
		connection.console.error(formatError(`Error while validating ${textDocument.uri}`, e));
	}
}

connection.onCompletion(async (textDocumentPosition, token) => {
	return runSafeAsync(async () => {
		const document = documents.get(textDocumentPosition.textDocument.uri);
		if (!document) {
			return null;
		}
		const mode = languageModes.getModeAtPosition(document, textDocumentPosition.position);
		if (!mode || !mode.doComplete) {
			return { isIncomplete: true, items: [] };
		}
		const doComplete = mode.doComplete!;

		if (mode.getId() !== 'html') {
			/* __GDPR__
				"html.embbedded.complete" : {
					"languageId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			 */
			connection.telemetry.logEvent({ key: 'html.embbedded.complete', value: { languageId: mode.getId() } });
		}

		const settings = await getDocumentSettings(document, () => doComplete.length > 2);
		const result = doComplete(document, textDocumentPosition.position, settings);
		return result;

	}, null, `Error while computing completions for ${textDocumentPosition.textDocument.uri}`, token);
});

connection.onCompletionResolve((item, token) => {
	return runSafe(() => {
		const data = item.data;
		if (data && data.languageId && data.uri) {
			const mode = languageModes.getMode(data.languageId);
			const document = documents.get(data.uri);
			if (mode && mode.doResolve && document) {
				return mode.doResolve(document, item);
			}
		}
		return item;
	}, item, `Error while resolving completion proposal`, token);
});

connection.onHover((textDocumentPosition, token) => {
	return runSafe(() => {
		const document = documents.get(textDocumentPosition.textDocument.uri);
		if (document) {
			const mode = languageModes.getModeAtPosition(document, textDocumentPosition.position);
			if (mode && mode.doHover) {
				return mode.doHover(document, textDocumentPosition.position);
			}
		}
		return null;
	}, null, `Error while computing hover for ${textDocumentPosition.textDocument.uri}`, token);
});

connection.onDocumentHighlight((documentHighlightParams, token) => {
	return runSafe(() => {
		const document = documents.get(documentHighlightParams.textDocument.uri);
		if (document) {
			const mode = languageModes.getModeAtPosition(document, documentHighlightParams.position);
			if (mode && mode.findDocumentHighlight) {
				return mode.findDocumentHighlight(document, documentHighlightParams.position);
			}
		}
		return [];
	}, [], `Error while computing document highlights for ${documentHighlightParams.textDocument.uri}`, token);
});

connection.onDefinition((definitionParams, token) => {
	return runSafe(() => {
		const document = documents.get(definitionParams.textDocument.uri);
		if (document) {
			const mode = languageModes.getModeAtPosition(document, definitionParams.position);
			if (mode && mode.findDefinition) {
				return mode.findDefinition(document, definitionParams.position);
			}
		}
		return [];
	}, null, `Error while computing definitions for ${definitionParams.textDocument.uri}`, token);
});

connection.onReferences((referenceParams, token) => {
	return runSafe(() => {
		const document = documents.get(referenceParams.textDocument.uri);
		if (document) {
			const mode = languageModes.getModeAtPosition(document, referenceParams.position);
			if (mode && mode.findReferences) {
				return mode.findReferences(document, referenceParams.position);
			}
		}
		return [];
	}, [], `Error while computing references for ${referenceParams.textDocument.uri}`, token);
});

connection.onSignatureHelp((signatureHelpParms, token) => {
	return runSafe(() => {
		const document = documents.get(signatureHelpParms.textDocument.uri);
		if (document) {
			const mode = languageModes.getModeAtPosition(document, signatureHelpParms.position);
			if (mode && mode.doSignatureHelp) {
				return mode.doSignatureHelp(document, signatureHelpParms.position);
			}
		}
		return null;
	}, null, `Error while computing signature help for ${signatureHelpParms.textDocument.uri}`, token);
});

connection.onDocumentRangeFormatting(async (formatParams, token) => {
	return runSafeAsync(async () => {
		const document = documents.get(formatParams.textDocument.uri);
		if (document) {
			let settings = await getDocumentSettings(document, () => true);
			if (!settings) {
				settings = globalSettings;
			}
			const unformattedTags: string = settings && settings.html && settings.html.format && settings.html.format.unformatted || '';
			const enabledModes = { css: !unformattedTags.match(/\bstyle\b/), javascript: !unformattedTags.match(/\bscript\b/) };

			return format(languageModes, document, formatParams.range, formatParams.options, settings, enabledModes);
		}
		return [];
	}, [], `Error while formatting range for ${formatParams.textDocument.uri}`, token);
});

connection.onDocumentLinks((documentLinkParam, token) => {
	return runSafe(() => {
		const document = documents.get(documentLinkParam.textDocument.uri);
		const links: DocumentLink[] = [];
		if (document) {
			const documentContext = getDocumentContext(document.uri, workspaceFolders);
			languageModes.getAllModesInDocument(document).forEach(m => {
				if (m.findDocumentLinks) {
					pushAll(links, m.findDocumentLinks(document, documentContext));
				}
			});
		}
		return links;
	}, [], `Error while document links for ${documentLinkParam.textDocument.uri}`, token);
});

connection.onDocumentSymbol((documentSymbolParms, token) => {
	return runSafe(() => {
		const document = documents.get(documentSymbolParms.textDocument.uri);
		const symbols: SymbolInformation[] = [];
		if (document) {
			languageModes.getAllModesInDocument(document).forEach(m => {
				if (m.findDocumentSymbols) {
					pushAll(symbols, m.findDocumentSymbols(document));
				}
			});
		}
		return symbols;
	}, [], `Error while computing document symbols for ${documentSymbolParms.textDocument.uri}`, token);
});

connection.onRequest(DocumentColorRequest.type, (params, token) => {
	return runSafe(() => {
		const infos: ColorInformation[] = [];
		const document = documents.get(params.textDocument.uri);
		if (document) {
			languageModes.getAllModesInDocument(document).forEach(m => {
				if (m.findDocumentColors) {
					pushAll(infos, m.findDocumentColors(document));
				}
			});
		}
		return infos;
	}, [], `Error while computing document colors for ${params.textDocument.uri}`, token);
});

connection.onRequest(ColorPresentationRequest.type, (params, token) => {
	return runSafe(() => {
		const document = documents.get(params.textDocument.uri);
		if (document) {
			const mode = languageModes.getModeAtPosition(document, params.range.start);
			if (mode && mode.getColorPresentations) {
				return mode.getColorPresentations(document, params.color, params.range);
			}
		}
		return [];
	}, [], `Error while computing color presentations for ${params.textDocument.uri}`, token);
});

connection.onRequest(TagCloseRequest.type, (params, token) => {
	return runSafe(() => {
		const document = documents.get(params.textDocument.uri);
		if (document) {
			const pos = params.position;
			if (pos.character > 0) {
				const mode = languageModes.getModeAtPosition(document, Position.create(pos.line, pos.character - 1));
				if (mode && mode.doAutoClose) {
					return mode.doAutoClose(document, pos);
				}
			}
		}
		return null;
	}, null, `Error while computing tag close actions for ${params.textDocument.uri}`, token);
});

connection.onFoldingRanges((params, token) => {
	return runSafe(() => {
		const document = documents.get(params.textDocument.uri);
		if (document) {
			return getFoldingRanges(languageModes, document, foldingRangeLimit, token);
		}
		return null;
	}, null, `Error while computing folding regions for ${params.textDocument.uri}`, token);
});

connection.onSelectionRanges((params, token) => {
	return runSafe(() => {
		const document = documents.get(params.textDocument.uri);
		const positions: Position[] = params.positions;

		if (document) {
			const htmlMode = languageModes.getMode('html');
			if (htmlMode && htmlMode.getSelectionRanges) {
				return htmlMode.getSelectionRanges(document, positions);
			}
		}
		return [];
	}, [], `Error while computing selection ranges for ${params.textDocument.uri}`, token);
});


// Listen on the connection
connection.listen();