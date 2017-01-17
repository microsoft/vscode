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
	{ kind: CompletionItemKind.Value, label: localize('fileLabel', "Files by Extension"), insertText: '"**/*.${1:extension}": true', insertTextFormat: InsertTextFormat.Snippet, documentation: localize('fileDescription', "Match all files of a specific file extension.") },
	{ kind: CompletionItemKind.Value, label: localize('filesLabel', "Files with Multiple Extensions"), insertText: '"**/*.{ext1,ext2,ext3}": true', documentation: localize('filesDescription', "Match all files with any of the file extensions.") },
	{ kind: CompletionItemKind.Value, label: localize('derivedLabel', "Files with Siblings by Name"), insertText: '"**/*.${1:source-extension}": { "when": "$(basename).${2:target-extension}" }', insertTextFormat: InsertTextFormat.Snippet, documentation: localize('derivedDescription', "Match files that have siblings with the same name but a different extension.") },
	{ kind: CompletionItemKind.Value, label: localize('topFolderLabel', "Folder by Name (Top Level)"), insertText: '"${1:name}": true', insertTextFormat: InsertTextFormat.Snippet, documentation: localize('topFolderDescription', "Match a top level folder with a specific name.") },
	{ kind: CompletionItemKind.Value, label: localize('topFoldersLabel', "Folders with Multiple Names (Top Level)"), insertText: '"{folder1,folder2,folder3}": true', documentation: localize('topFoldersDescription', "Match multiple top level folders.") },
	{ kind: CompletionItemKind.Value, label: localize('folderLabel', "Folder by Name (Any Location)"), insertText: '"**/${1:name}": true', insertTextFormat: InsertTextFormat.Snippet, documentation: localize('folderDescription', "Match a folder with a specific name in any location.") },
];

let globValues: CompletionItem[] = [
	{ kind: CompletionItemKind.Value, label: localize('trueLabel', "true"), filterText: 'true', insertText: 'true', documentation: localize('trueDescription', "Enable the pattern.") },
	{ kind: CompletionItemKind.Value, label: localize('falseLabel', "false"), filterText: 'false', insertText: 'false', documentation: localize('falseDescription', "Disable the pattern.") },
	{ kind: CompletionItemKind.Value, label: localize('derivedLabel', "Files with Siblings by Name"), insertText: '{ "when": "$(basename).${1:extension}" }', insertTextFormat: InsertTextFormat.Snippet, documentation: localize('siblingsDescription', "Match files that have siblings with the same name but a different extension.") }
];

export class GlobPatternContribution implements JSONWorkerContribution {

	constructor() {
	}

	private isSettingsFile(resource: string): boolean {
		return Strings.endsWith(resource, '/settings.json');
	}

	public collectDefaultCompletions(resource: string, result: CompletionsCollector): Thenable<any> {
		return null;
	}

	public collectPropertyCompletions(resource: string, location: JSONPath, currentWord: string, addValue: boolean, isLast: boolean, result: CompletionsCollector): Thenable<any> {
		if (this.isSettingsFile(resource) && location.length === 1 && ((location[0] === 'files.exclude') || (location[0] === 'search.exclude'))) {
			globProperties.forEach(e => {
				result.add(e);
			});
		}

		return null;
	}

	public collectValueCompletions(resource: string, location: JSONPath, currentKey: string, result: CompletionsCollector): Thenable<any> {
		if (this.isSettingsFile(resource) && location.length === 1 && ((location[0] === 'files.exclude') || (location[0] === 'search.exclude'))) {
			globValues.forEach(e => {
				result.add(e);
			});
		}

		return null;
	}

	public getInfoContribution(resource: string, location: JSONPath): Thenable<MarkedString[]> {
		return null;
	}
}