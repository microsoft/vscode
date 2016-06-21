/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic,
	TextEdit, FormattingOptions} from 'vscode-languageserver';

import {JSONCompletion} from './jsonCompletion';
import {JSONHover} from './jsonHover';
import {JSONValidation} from './jsonValidation';
import {IJSONSchema} from './jsonSchema';
import {JSONDocumentSymbols} from './jsonDocumentSymbols';
import {parse as parseJSON, JSONDocument} from './jsonParser';
import {schemaContributions} from './configuration';
import {XHROptions, XHRResponse} from 'request-light';
import {JSONSchemaService} from './jsonSchemaService';
import {IJSONWorkerContribution} from './jsonContributions';
import {format as formatJSON} from './jsonFormatter';

export interface LanguageService {
	configure(schemaConfiguration: JSONSchemaConfiguration[]): void;
	doValidation(document: TextDocument, jsonDocument: JSONDocument): Thenable<Diagnostic[]>;
	parseJSONDocument(document: TextDocument): JSONDocument;
	resetSchema(uri: string): boolean;
	doResolve(item: CompletionItem): Thenable<CompletionItem>;
	doComplete(document: TextDocument, position: Position, doc: JSONDocument): Thenable<CompletionList>;
	findDocumentSymbols(document: TextDocument, doc: JSONDocument): Promise<SymbolInformation[]>;
	doHover(document: TextDocument, position: Position, doc: JSONDocument): Thenable<Hover>;
	format(document: TextDocument, range: Range, options: FormattingOptions): Thenable<TextEdit[]>;
}

export interface JSONSchemaConfiguration {
	uri: string;
	fileMatch?: string[];
	schema?: IJSONSchema;
}

export interface TelemetryService {
	log(key: string, data: any): void;
}

export interface WorkspaceContextService {
	resolveRelativePath(relativePath: string, resource: string): string;
}

export interface RequestService {
	(options: XHROptions): Thenable<XHRResponse>;
}

export function getLanguageService(contributions: IJSONWorkerContribution[], request: RequestService, workspaceContext: WorkspaceContextService, telemetry: TelemetryService): LanguageService {
	let jsonSchemaService = new JSONSchemaService(request, workspaceContext, telemetry);
	jsonSchemaService.setSchemaContributions(schemaContributions);

	let jsonCompletion = new JSONCompletion(jsonSchemaService, contributions);
	let jsonHover = new JSONHover(jsonSchemaService, contributions);
	let jsonDocumentSymbols = new JSONDocumentSymbols();
	let jsonValidation = new JSONValidation(jsonSchemaService);

	return {
		configure: (schemaConf: JSONSchemaConfiguration[]) => {
			schemaConf.forEach(settings => {
				jsonSchemaService.registerExternalSchema(settings.uri, settings.fileMatch, settings.schema);
			});
		},
		resetSchema: (uri: string) => {
			return jsonSchemaService.onResourceChange(uri);
		},
		doValidation: jsonValidation.doValidation.bind(jsonValidation),
		parseJSONDocument: (document: TextDocument) => parseJSON(document.getText()),
		doResolve: jsonCompletion.doResolve.bind(jsonCompletion),
		doComplete: jsonCompletion.doComplete.bind(jsonCompletion),
		findDocumentSymbols: jsonDocumentSymbols.findDocumentSymbols.bind(jsonDocumentSymbols),
		doHover: jsonHover.doHover.bind(jsonHover),
		format: (document, range, options) => Promise.resolve(formatJSON(document, range, options))
	};
}
