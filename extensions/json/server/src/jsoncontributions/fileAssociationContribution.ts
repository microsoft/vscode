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
	{ kind: CompletionItemKind.Value, label: localize('assocLabelFile', "Files with Extension"), insertText: '"*.{{extension}}": "{{language}}"', documentation: localize('assocDescriptionFile', "Map all files matching the glob pattern in their filename to the language with the given id.") },
	{ kind: CompletionItemKind.Value, label: localize('assocLabelPath', "Files with Path"), insertText: '"/{{path to file}}/*.{{extension}}": "{{language}}"', documentation: localize('assocDescriptionPath', "Map all files matching the absolute path glob pattern in their path to the language with the given id.") }
];

export class FileAssociationContribution implements IJSONWorkerContribution {
	private languageIds:string[];

	constructor() {
	}

	public setLanguageIds(ids:string[]): void {
		this.languageIds = ids;
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
			this.languageIds.forEach(l => {
				result.add({
					kind: CompletionItemKind.Value,
					label: l,
					insertText: '"{{' + l + '}}"',
				});
			});
		}

		return null;
	}

	public getInfoContribution(resource: string, location: JSONLocation): Thenable<MarkedString[]> {
		return null;
	}
}