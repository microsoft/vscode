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
	{ kind: CompletionItemKind.Value, label: localize('assocLabel', "Files with Extension"), insertText: '"*.{{extension}}": "{{language}}"', documentation: localize('assocDescription', "Map all files matching the given pattern to the language with the given id.") },
];

let globValues: CompletionItem[] = [
	{ kind: CompletionItemKind.Value, label: localize('languageId', "Language Identifier"), insertText: '"{{language}}"', documentation: localize('languageDescription', "The identifier of the language to associate with the file name pattern.") },
];

export class FileAssociationContribution implements IJSONWorkerContribution {

	constructor() {
	}

	private isSettingsFile(resource: string): boolean {
		return Strings.endsWith(resource, '/settings.json');
	}

	public collectDefaultSuggestions(resource: string, result: ISuggestionsCollector): Thenable<any> {
		return null;
	}

	public collectPropertySuggestions(resource: string, location: JSONLocation, currentWord: string, addValue: boolean, isLast: boolean, result: ISuggestionsCollector): Thenable<any> {
		if (this.isSettingsFile(resource) && location.matches(['files.associations'])) {
			globProperties.forEach((e) => result.add(e));
		}

		return null;
	}

	public collectValueSuggestions(resource: string, location: JSONLocation, currentKey: string, result: ISuggestionsCollector): Thenable<any> {
		if (this.isSettingsFile(resource) && location.matches(['files.associations'])) {
			globValues.forEach((e) => result.add(e));
		}

		return null;
	}

	public getInfoContribution(resource: string, location: JSONLocation): Thenable<MarkedString[]> {
		return null;
	}
}