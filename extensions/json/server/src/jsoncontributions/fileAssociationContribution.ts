/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { MarkedString, CompletionItemKind, CompletionItem, InsertTextFormat } from 'vscode-languageserver';
import Strings = require('../utils/strings');
import { JSONWorkerContribution, JSONPath, CompletionsCollector } from 'vscode-json-languageservice';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

let globProperties: CompletionItem[] = [
	{ kind: CompletionItemKind.Value, label: localize('assocLabelFile', "Files with Extension"), insertText: '"*.${1:extension}": "${2:language}"', insertTextFormat: InsertTextFormat.Snippet, documentation: localize('assocDescriptionFile', "Map all files matching the glob pattern in their filename to the language with the given identifier.") },
	{ kind: CompletionItemKind.Value, label: localize('assocLabelPath', "Files with Path"), insertText: '"/${1:path to file}/*.${2:extension}": "${3:language}"', insertTextFormat: InsertTextFormat.Snippet, documentation: localize('assocDescriptionPath', "Map all files matching the absolute path glob pattern in their path to the language with the given identifier.") }
];

export class FileAssociationContribution implements JSONWorkerContribution {
	private languageIds: string[];

	constructor() {
	}

	public setLanguageIds(ids: string[]): void {
		this.languageIds = ids;
	}

	private isSettingsFile(resource: string): boolean {
		return Strings.endsWith(resource, '/settings.json');
	}

	public collectDefaultCompletions(resource: string, result: CompletionsCollector): Thenable<any> {
		return null;
	}

	public collectPropertyCompletions(resource: string, location: JSONPath, currentWord: string, addValue: boolean, isLast: boolean, result: CompletionsCollector): Thenable<any> {
		if (this.isSettingsFile(resource) && location.length === 1 && location[0] === 'files.associations') {
			globProperties.forEach(e => {
				result.add(e);
			});
		}

		return null;
	}

	public collectValueCompletions(resource: string, location: JSONPath, currentKey: string, result: CompletionsCollector): Thenable<any> {
		if (this.isSettingsFile(resource) && location.length === 1 && location[0] === 'files.associations') {
			this.languageIds.forEach(l => {
				result.add({
					kind: CompletionItemKind.Value,
					label: l,
					insertText: JSON.stringify('${1:' + l + '}'),
					insertTextFormat: InsertTextFormat.Snippet,
					filterText: JSON.stringify(l)
				});
			});
		}

		return null;
	}

	public getInfoContribution(resource: string, location: JSONPath): Thenable<MarkedString[]> {
		return null;
	}
}