/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {MarkedString, CompletionItemKind, CompletionItem} from 'vscode-languageserver';
import Strings = require('../utils/strings');
import {IJSONWorkerContribution, ISuggestionsCollector} from '../jsonContributions';
import {JSONLocation} from '../jsonLocation';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

let globProperties: CompletionItem[] = [
	{ kind: CompletionItemKind.Value, label: localize('fileLabel', "Files by Extension"), insertText: '"**/*.{{extension}}": true', documentation: localize('fileDescription', "Match all files of a specific file extension.") },
	{ kind: CompletionItemKind.Value, label: localize('filesLabel', "Files with Multiple Extensions"), insertText: '"**/*.{ext1,ext2,ext3}": true', documentation: localize('filesDescription', "Match all files with any of the file extensions.") },
	{ kind: CompletionItemKind.Value, label: localize('derivedLabel', "Files with Siblings by Name"), insertText: '"**/*.{{source-extension}}": { "when": "$(basename).{{target-extension}}" }', documentation: localize('derivedDescription', "Match files that have siblings with the same name but a different extension.") },
	{ kind: CompletionItemKind.Value, label: localize('topFolderLabel', "Folder by Name (Top Level)"), insertText: '"{{name}}": true', documentation: localize('topFolderDescription', "Match a top level folder with a specific name.") },
	{ kind: CompletionItemKind.Value, label: localize('topFoldersLabel', "Folders with Multiple Names (Top Level)"), insertText: '"{folder1,folder2,folder3}": true', documentation: localize('topFoldersDescription', "Match multiple top level folders.") },
	{ kind: CompletionItemKind.Value, label: localize('folderLabel', "Folder by Name (Any Location)"), insertText: '"**/{{name}}": true', documentation: localize('folderDescription', "Match a folder with a specific name in any location.") },
];

let globValues: CompletionItem[] = [
	{ kind: CompletionItemKind.Value, label: localize('trueLabel', "True"), insertText: 'true', documentation: localize('trueDescription', "Enable the pattern.") },
	{ kind: CompletionItemKind.Value, label: localize('falseLabel', "False"), insertText: 'false', documentation: localize('falseDescription', "Disable the pattern.") },
	{ kind: CompletionItemKind.Value, label: localize('derivedLabel', "Files with Siblings by Name"), insertText: '{ "when": "$(basename).{{extension}}" }', documentation: localize('siblingsDescription', "Match files that have siblings with the same name but a different extension.") }
];

export class GlobPatternContribution implements IJSONWorkerContribution {

	constructor() {
	}

	private isSettingsFile(resource: string): boolean {
		return Strings.endsWith(resource, '/settings.json');
	}

	public collectDefaultSuggestions(resource: string, result: ISuggestionsCollector): Thenable<any> {
		return null;
	}

	public collectPropertySuggestions(resource: string, location: JSONLocation, currentWord: string, addValue: boolean, isLast: boolean, result: ISuggestionsCollector): Thenable<any> {
		if (this.isSettingsFile(resource) && (location.matches(['files.exclude']) || location.matches(['search.exclude']))) {
			globProperties.forEach((e) => result.add(e));
		}

		return null;
	}

	public collectValueSuggestions(resource: string, location: JSONLocation, currentKey: string, result: ISuggestionsCollector): Thenable<any> {
		if (this.isSettingsFile(resource) && (location.matches(['files.exclude']) || location.matches(['search.exclude']))) {
			globValues.forEach((e) => result.add(e));
		}

		return null;
	}

	public getInfoContribution(resource: string, location: JSONLocation): Thenable<MarkedString[]> {
		return null;
	}
}