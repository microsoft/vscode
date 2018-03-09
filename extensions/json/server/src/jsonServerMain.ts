/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	createConnection, IConnection,
	TextDocuments, TextDocument, InitializeParams, InitializeResult, NotificationType, RequestType,
	DocumentRangeFormattingRequest, Disposable, ServerCapabilities, DocumentColorRequest, ColorPresentationRequest
} from 'vscode-languageserver';

import { xhr, XHRResponse, configure as configureHttpRequests, getErrorStatusDescription } from 'request-light';
import * as fs from 'fs';
import URI from 'vscode-uri';
import * as URL from 'url';
import { startsWith } from './utils/strings';
import { formatError, runSafe, runSafeAsync } from './utils/errors';
import { JSONDocument, JSONSchema, getLanguageService, DocumentLanguageSettings, SchemaConfiguration } from 'vscode-json-languageservice';
import { getLanguageModelCache } from './languageModelCache';
import { getFoldingRegions } from './folding';

import { FoldingRangesRequest, FoldingProviderServerCapabilities } from './protocol/foldingProvider.proposed';

interface ISchemaAssociations {
	[pattern: string]: string[];
}

namespace SchemaAssociationNotification {
	export const type: NotificationType<ISchemaAssociations, any> = new NotificationType('json/schemaAssociations');
}

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any, any> = new RequestType('vscode/content');
}

namespace SchemaContentChangeNotification {
	export const type: NotificationType<string, any> = new NotificationType('json/schemaContent');
}

// Create a connection for the server
let connection: IConnection = createConnection();

process.on('unhandledRejection', (e: any) => {
	connection.console.error(formatError(`Unhandled exception`, e));
});

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

let clientSnippetSupport = false;
let clientDynamicRegisterSupport = false;

// After the server has started the client sends an initilize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
connection.onInitialize((params: InitializeParams): InitializeResult => {

	function hasClientCapability(...keys: string[]) {
		let c = params.capabilities as any;
		for (let i = 0; c && i < keys.length; i++) {
			c = c[keys[i]];
		}
		return !!c;
	}

	clientSnippetSupport = hasClientCapability('textDocument', 'completion', 'completionItem', 'snippetSupport');
	clientDynamicRegisterSupport = hasClientCapability('workspace', 'symbol', 'dynamicRegistration');
	let capabilities: ServerCapabilities & FoldingProviderServerCapabilities = {
		// Tell the client that the server works in FULL text document sync mode
		textDocumentSync: documents.syncKind,
		completionProvider: clientSnippetSupport ? { resolveProvider: true, triggerCharacters: ['"', ':'] } : void 0,
		hoverProvider: true,
		documentSymbolProvider: true,
		documentRangeFormattingProvider: false,
		colorProvider: true,
		foldingProvider: true
	};

	return { capabilities };
});

let workspaceContext = {
	resolveRelativePath: (relativePath: string, resource: string) => {
		return URL.resolve(resource, relativePath);
	}
};

let schemaRequestService = (uri: string): Thenable<string> => {
	if (startsWith(uri, 'file://')) {
		let fsPath = URI.parse(uri).fsPath;
		return new Promise<string>((c, e) => {
			fs.readFile(fsPath, 'UTF-8', (err, result) => {
				err ? e('') : c(result.toString());
			});
		});
	} else if (startsWith(uri, 'vscode://')) {
		return connection.sendRequest(VSCodeContentRequest.type, uri).then(responseText => {
			return responseText;
		}, error => {
			return Promise.reject(error.message);
		});
	}
	if (uri.indexOf('//schema.management.azure.com/') !== -1) {
		/* __GDPR__
			"json.schema" : {
				"schemaURL" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		 */
		connection.telemetry.logEvent({
			key: 'json.schema',
			value: {
				schemaURL: uri
			}
		});
	}
	let headers = { 'Accept-Encoding': 'gzip, deflate' };
	return xhr({ url: uri, followRedirects: 5, headers }).then(response => {
		return response.responseText;
	}, (error: XHRResponse) => {
		return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString());
	});
};

// create the JSON language service
let languageService = getLanguageService({
	schemaRequestService,
	workspaceContext,
	contributions: []
});

// The settings interface describes the server relevant settings part
interface Settings {
	json: {
		schemas: JSONSchemaSettings[];
		format: { enable: boolean; };
	};
	http: {
		proxy: string;
		proxyStrictSSL: boolean;
	};
}

interface JSONSchemaSettings {
	fileMatch?: string[];
	url?: string;
	schema?: JSONSchema;
}

let jsonConfigurationSettings: JSONSchemaSettings[] | undefined = void 0;
let schemaAssociations: ISchemaAssociations | undefined = void 0;
let formatterRegistration: Thenable<Disposable> | null = null;

// The settings have changed. Is send on server activation as well.
connection.onDidChangeConfiguration((change) => {
	var settings = <Settings>change.settings;
	configureHttpRequests(settings.http && settings.http.proxy, settings.http && settings.http.proxyStrictSSL);

	jsonConfigurationSettings = settings.json && settings.json.schemas;
	updateConfiguration();

	// dynamically enable & disable the formatter
	if (clientDynamicRegisterSupport) {
		let enableFormatter = settings && settings.json && settings.json.format && settings.json.format.enable;
		if (enableFormatter) {
			if (!formatterRegistration) {
				formatterRegistration = connection.client.register(DocumentRangeFormattingRequest.type, { documentSelector: [{ language: 'json' }, { language: 'jsonc' }] });
			}
		} else if (formatterRegistration) {
			formatterRegistration.then(r => r.dispose());
			formatterRegistration = null;
		}
	}
});

// The jsonValidation extension configuration has changed
connection.onNotification(SchemaAssociationNotification.type, associations => {
	schemaAssociations = associations;
	updateConfiguration();
});

// A schema has changed
connection.onNotification(SchemaContentChangeNotification.type, uri => {
	languageService.resetSchema(uri);
});

function updateConfiguration() {
	let languageSettings = {
		validate: true,
		allowComments: true,
		schemas: new Array<SchemaConfiguration>()
	};
	if (schemaAssociations) {
		for (var pattern in schemaAssociations) {
			let association = schemaAssociations[pattern];
			if (Array.isArray(association)) {
				association.forEach(uri => {
					languageSettings.schemas.push({ uri, fileMatch: [pattern] });
				});
			}
		}
	}
	if (jsonConfigurationSettings) {
		jsonConfigurationSettings.forEach((schema, index) => {
			let uri = schema.url;
			if (!uri && schema.schema) {
				uri = schema.schema.id || `vscode://schemas/custom/${index}`;
			}
			if (uri) {
				languageSettings.schemas.push({ uri, fileMatch: schema.fileMatch, schema: schema.schema });
			}
		});
	}
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

let pendingValidationRequests: { [uri: string]: NodeJS.Timer; } = {};
const validationDelayMs = 500;

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
	try {
		let jsonDocument = getJSONDocument(textDocument);

		let documentSettings: DocumentLanguageSettings = textDocument.languageId === 'jsonc' ? { comments: 'ignore', trailingCommas: 'ignore' } : { comments: 'error', trailingCommas: 'error' };
		languageService.doValidation(textDocument, jsonDocument, documentSettings).then(diagnostics => {
			// Send the computed diagnostics to VSCode.
			connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
		});
	} catch (e) {
		connection.console.error(formatError(`Error while validating ${textDocument.uri}`, e));
	}
}

connection.onDidChangeWatchedFiles((change) => {
	// Monitored files have changed in VSCode
	let hasChanges = false;
	change.changes.forEach(c => {
		if (languageService.resetSchema(c.uri)) {
			hasChanges = true;
		}
	});
	if (hasChanges) {
		documents.all().forEach(validateTextDocument);
	}
});

let jsonDocuments = getLanguageModelCache<JSONDocument>(10, 60, document => languageService.parseJSONDocument(document));
documents.onDidClose(e => {
	jsonDocuments.onDocumentRemoved(e.document);
});
connection.onShutdown(() => {
	jsonDocuments.dispose();
});

function getJSONDocument(document: TextDocument): JSONDocument {
	return jsonDocuments.get(document);
}

connection.onCompletion(textDocumentPosition => {
	return runSafeAsync(() => {
		let document = documents.get(textDocumentPosition.textDocument.uri);
		let jsonDocument = getJSONDocument(document);
		return languageService.doComplete(document, textDocumentPosition.position, jsonDocument);
	}, null, `Error while computing completions for ${textDocumentPosition.textDocument.uri}`);
});

connection.onCompletionResolve(completionItem => {
	return runSafeAsync(() => {
		return languageService.doResolve(completionItem);
	}, completionItem, `Error while resolving completion proposal`);
});

connection.onHover(textDocumentPositionParams => {
	return runSafeAsync(() => {
		let document = documents.get(textDocumentPositionParams.textDocument.uri);
		let jsonDocument = getJSONDocument(document);
		return languageService.doHover(document, textDocumentPositionParams.position, jsonDocument);
	}, null, `Error while computing hover for ${textDocumentPositionParams.textDocument.uri}`);
});

connection.onDocumentSymbol(documentSymbolParams => {
	return runSafe(() => {
		let document = documents.get(documentSymbolParams.textDocument.uri);
		let jsonDocument = getJSONDocument(document);
		return languageService.findDocumentSymbols(document, jsonDocument);
	}, [], `Error while computing document symbols for ${documentSymbolParams.textDocument.uri}`);
});

connection.onDocumentRangeFormatting(formatParams => {
	return runSafe(() => {
		let document = documents.get(formatParams.textDocument.uri);
		return languageService.format(document, formatParams.range, formatParams.options);
	}, [], `Error while formatting range for ${formatParams.textDocument.uri}`);
});

connection.onRequest(DocumentColorRequest.type, params => {
	return runSafeAsync(() => {
		let document = documents.get(params.textDocument.uri);
		if (document) {
			let jsonDocument = getJSONDocument(document);
			return languageService.findDocumentColors(document, jsonDocument);
		}
		return Promise.resolve([]);
	}, [], `Error while computing document colors for ${params.textDocument.uri}`);
});

connection.onRequest(ColorPresentationRequest.type, params => {
	return runSafe(() => {
		let document = documents.get(params.textDocument.uri);
		if (document) {
			let jsonDocument = getJSONDocument(document);
			return languageService.getColorPresentations(document, jsonDocument, params.color, params.range);
		}
		return [];
	}, [], `Error while computing color presentations for ${params.textDocument.uri}`);
});

connection.onRequest(FoldingRangesRequest.type, params => {
	return runSafe(() => {
		let document = documents.get(params.textDocument.uri);
		if (document) {
			return getFoldingRegions(document);
		}
		return null;
	}, null, `Error while computing folding ranges for ${params.textDocument.uri}`);
});

// Listen on the connection
connection.listen();