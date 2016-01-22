/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	IPCMessageReader, IPCMessageWriter,
	createConnection, IConnection, TextDocumentSyncKind,
	TextDocuments, ITextDocument, Diagnostic, DiagnosticSeverity,
	InitializeParams, InitializeResult, TextDocumentIdentifier, TextDocumentPosition,
	CompletionItem, CompletionItemKind, Files, Hover, SymbolInformation, TextEdit, DocumentFormattingParams,
	DocumentRangeFormattingParams, NotificationType, RequestType
} from 'vscode-languageserver';

import {xhr, IXHROptions, IXHRResponse} from './utils/httpRequest';
import path = require('path');
import fs = require('fs');
import URI from './utils/uri';
import Strings = require('./utils/strings');
import {create as createLinesModel, LinesModel} from './utils/lines';
import {IWorkspaceContextService, ITelemetryService, JSONSchemaService, ISchemaContributions, ISchemaAssociations} from './jsonSchemaService';
import {parse as parseJSON, ObjectASTNode, JSONDocument} from './jsonParser';
import {JSONCompletion} from './jsonCompletion';
import {JSONHover} from './jsonHover';
import {JSONDocumentSymbols} from './jsonDocumentSymbols';
import {format as formatJSON} from './jsonFormatter';
import {schemaContributions} from './configuration';

namespace TelemetryNotification {
	export const type: NotificationType<{ key: string, data: any }> = { get method() { return 'telemetry'; } };
}

namespace SchemaAssociationNotification {
	export const type: NotificationType<ISchemaAssociations> = { get method() { return 'json/schemaAssociations'; } };
}

namespace VSCodeContentRequest {
	export const type: RequestType<string, string, any> = { get method() { return 'vscode/content'; } };
}

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
let workspaceRoot: URI;
connection.onInitialize((params: InitializeResult) => {
	workspaceRoot = URI.parse(params.rootPath);
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			completionProvider: { resolveProvider: false },
			hoverProvider: true,
			documentSymbolProvider: true,
			documentRangeFormattingProvider: true,
			documentFormattingProvider: true
		}
	}
});

let workspaceContext = {
	toResource: (workspaceRelativePath: string) => {
		if (typeof workspaceRelativePath === 'string' && workspaceRoot) {
			return URI.file(path.join(workspaceRoot.fsPath, workspaceRelativePath)).toString();
		}
		return workspaceRelativePath;
	}
}

let telemetry = {
	log: (key: string, data: any) => {
		connection.sendNotification(TelemetryNotification.type, { key, data });
	}
}

let request = (options: IXHROptions): Thenable<IXHRResponse>  => {
	if (Strings.startsWith(options.url, 'file://')) {
		let fsPath = URI.parse(options.url).fsPath;
		return new Promise<IXHRResponse>((c, e) => {
			fs.readFile(fsPath, 'UTF-8', (err, result) => {
				err ? e({ responseText: '', status: 404 }) : c({ responseText: result.toString(), status: 200 })
			});
		});
	} else if (Strings.startsWith(options.url, 'vscode-schema://')) {
		return connection.sendRequest(VSCodeContentRequest.type, options.url).then(responseText => {
			return {
				responseText: responseText,
				status: 200
			};
		}, error => {
			return {
				responseText: error.message,
				status: 404
			}
		});
	}
	return xhr(options);
}

let jsonSchemaService = new JSONSchemaService(request, workspaceContext, telemetry);
jsonSchemaService.setSchemaContributions(schemaContributions);

let jsonCompletion = new JSONCompletion(jsonSchemaService);
let jsonHover = new JSONHover(jsonSchemaService);
let jsonDocumentSymbols = new JSONDocumentSymbols();

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	validateTextDocument(change.document);
});

// The settings interface describe the server relevant settings part
interface Settings {
	json: {
		schemas: JSONSchemaSettings[]
	};
}

interface JSONSchemaSettings {
	fileMatch: string[],
	url: string,
	schema?: any;
}

let jsonConfigurationSettings : JSONSchemaSettings[] = void 0;
let schemaAssociations : ISchemaAssociations = void 0;

// The settings have changed. Is send on server activation as well.
connection.onDidChangeConfiguration((change) => {
	var jsonSettings = (<Settings>change.settings).json;
	jsonConfigurationSettings = jsonSettings && jsonSettings.schemas;
	updateConfiguration();
});

// The jsonValidation extension configuration has changed
connection.onNotification(SchemaAssociationNotification.type, (associations) => {
	schemaAssociations = associations;
	updateConfiguration();
});

function updateConfiguration() {
	jsonSchemaService.clearExternalSchemas();
	if (schemaAssociations) {
		for (var pattern in schemaAssociations) {
			let association = schemaAssociations[pattern];
			if (Array.isArray(association)) {
				association.forEach(url => {
					jsonSchemaService.registerExternalSchema(url, [pattern]);
				})
			}
		}
	}
	if (jsonConfigurationSettings) {
		jsonConfigurationSettings.forEach((schema) => {
			if (schema.url && (schema.fileMatch || schema.schema)) {
				let url = schema.url;
				if (!Strings.startsWith(url, 'http://') && !Strings.startsWith(url, 'https://') && !Strings.startsWith(url, 'file://')) {
					let resourceURL = workspaceContext.toResource(url);
					if (resourceURL) {
						url = resourceURL.toString();
					}
				}
				if (url) {
					jsonSchemaService.registerExternalSchema(url, schema.fileMatch, schema.schema);
				}
			}
		});
	}
	// Revalidate any open text documents
	documents.all().forEach(validateTextDocument);
}


function validateTextDocument(textDocument: ITextDocument): void {
	let jsonDocument = getJSONDocument(textDocument);
	jsonSchemaService.getSchemaForResource(textDocument.uri, jsonDocument).then(schema => {
		if (schema) {
			if (schema.errors.length && jsonDocument.root) {
				let astRoot = jsonDocument.root;
				let property = astRoot.type === 'object' ? (<ObjectASTNode>astRoot).getFirstProperty('$schema') : null;
				if (property) {
					let node = property.value || property;
					jsonDocument.warnings.push({ location: { start: node.start, end: node.end }, message: schema.errors[0] });
				} else {
					jsonDocument.warnings.push({ location: { start: astRoot.start, end: astRoot.start + 1 }, message: schema.errors[0] });
				}
			} else {
				jsonDocument.validate(schema.schema);
			}
		}

		let diagnostics: Diagnostic[] = [];
		let lineModel = getLinesModel(textDocument);
		let added: { [signature: string]: boolean } = {};
		jsonDocument.errors.concat(jsonDocument.warnings).forEach((error, idx) => {
			// remove duplicated messages
			let signature = error.location.start + ' ' + error.location.end + ' ' + error.message;
			if (!added[signature]) {
				added[signature] = true;
				let range = {
					start: lineModel.positionAt(error.location.start),
					end: lineModel.positionAt(error.location.end)
				};
				diagnostics.push({
					severity: idx >= jsonDocument.errors.length ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
					range: range,
					message: error.message
				});
			}
		});
		// Send the computed diagnostics to VSCode.
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
	});
}

connection.onDidChangeWatchedFiles((change) => {
	// Monitored files have change in VSCode
	let hasChanges = false;
	change.changes.forEach(c => {
		if (jsonSchemaService.onResourceChange(c.uri)) {
			hasChanges = true;
		}
	});
	if (hasChanges) {
		documents.all().forEach(validateTextDocument);
	}
});


function getLinesModel(document: ITextDocument): LinesModel {
	return createLinesModel(document.getText());
}

function getJSONDocument(document: ITextDocument): JSONDocument {
	return parseJSON(document.getText());
}

connection.onCompletion((textDocumentPosition: TextDocumentPosition): Thenable<CompletionItem[]> => {
	let document = documents.get(textDocumentPosition.uri);
	let lines = getLinesModel(document);
	let jsonDocument = getJSONDocument(document);
	return jsonCompletion.doSuggest(document, textDocumentPosition, lines, jsonDocument);
});

connection.onHover((textDocumentPosition: TextDocumentPosition): Thenable<Hover> => {
	let document = documents.get(textDocumentPosition.uri);
	let lines = getLinesModel(document);
	let jsonDocument = getJSONDocument(document);
	return jsonHover.doHover(document, textDocumentPosition, lines, jsonDocument);
});

connection.onDocumentSymbol((textDocumentIdentifier: TextDocumentIdentifier): Thenable<SymbolInformation[]> => {
	let document = documents.get(textDocumentIdentifier.uri);
	let lines = getLinesModel(document);
	let jsonDocument = getJSONDocument(document);
	return jsonDocumentSymbols.compute(document, lines, jsonDocument);
});

connection.onDocumentFormatting((formatParams: DocumentFormattingParams) => {
	let document = documents.get(formatParams.textDocument.uri);
	let lines = getLinesModel(document);
	return formatJSON(document, lines, null, formatParams.options);
});

connection.onDocumentRangeFormatting((formatParams: DocumentRangeFormattingParams) => {
	let document = documents.get(formatParams.textDocument.uri);
	let lines = getLinesModel(document);
	return formatJSON(document, lines, formatParams.range, formatParams.options);
});

// Listen on the connection
connection.listen();