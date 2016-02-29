/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import HtmlContent = require('vs/base/common/htmlContent');
import Strings = require('vs/base/common/strings');
import Modes = require('vs/editor/common/modes');
import WinJS = require('vs/base/common/winjs.base');
import nls = require('vs/nls');
import JSONWorker = require('vs/languages/json/common/jsonWorker');
import URI from 'vs/base/common/uri';
import {JSONLocation} from 'vs/languages/json/common/parser/jsonLocation';

var globProperties:Modes.ISuggestion[] = [
	{ type: 'value', label: nls.localize('fileLabel', "Files by Extension"), codeSnippet: '"**/*.{{extension}}": true', documentationLabel: nls.localize('fileDescription', "Match all files of a specific file extension.")},
	{ type: 'value', label: nls.localize('filesLabel', "Files with Multiple Extensions"), codeSnippet: '"**/*.{ext1,ext2,ext3}": true', documentationLabel: nls.localize('filesDescription', "Match all files with any of the file extensions.")},
	{ type: 'value', label: nls.localize('derivedLabel', "Files with Siblings by Name"), codeSnippet: '"**/*.{{source-extension}}": { "when": "$(basename).{{target-extension}}" }', documentationLabel: nls.localize('derivedDescription', "Match files that have siblings with the same name but a different extension.")},
	{ type: 'value', label: nls.localize('topFolderLabel', "Folder by Name (Top Level)"), codeSnippet: '"{{name}}": true', documentationLabel: nls.localize('topFolderDescription', "Match a top level folder with a specific name.")},
	{ type: 'value', label: nls.localize('topFoldersLabel', "Folders with Multiple Names (Top Level)"), codeSnippet: '"{folder1,folder2,folder3}": true', documentationLabel: nls.localize('topFoldersDescription', "Match multiple top level folders.")},
	{ type: 'value', label: nls.localize('folderLabel', "Folder by Name (Any Location)"), codeSnippet: '"**/{{name}}": true', documentationLabel: nls.localize('folderDescription', "Match a folder with a specific name in any location.")},
];

var globValues:Modes.ISuggestion[] = [
	{ type: 'value', label: nls.localize('trueLabel', "True"), codeSnippet: 'true', documentationLabel: nls.localize('trueDescription', "Enable the pattern.")},
	{ type: 'value', label: nls.localize('falseLabel', "False"), codeSnippet: 'false', documentationLabel: nls.localize('falseDescription', "Disable the pattern.")},
	{ type: 'value', label: nls.localize('derivedLabel', "Files with Siblings by Name"), codeSnippet: '{ "when": "$(basename).{{extension}}" }', documentationLabel: nls.localize('siblingsDescription', "Match files that have siblings with the same name but a different extension.")}
];

export class GlobPatternContribution implements JSONWorker.IJSONWorkerContribution {

	constructor() {
	}

	private isSettingsFile(resource: URI): boolean {
		var path = resource.path;
		return Strings.endsWith(path, '/settings.json');
	}

	public collectDefaultSuggestions(resource: URI, result: JSONWorker.ISuggestionsCollector): WinJS.Promise {
		return null;
	}

	public collectPropertySuggestions(resource: URI, location: JSONLocation, currentWord: string, addValue: boolean, isLast:boolean, result: JSONWorker.ISuggestionsCollector) : WinJS.Promise {
		if (this.isSettingsFile(resource) && (location.matches(['files.exclude']) || location.matches(['search.exclude']))) {

			globProperties.forEach((e) => result.add(e));
		}

		return null;
	}

	public collectValueSuggestions(resource: URI, location: JSONLocation, currentKey: string, result: JSONWorker.ISuggestionsCollector): WinJS.Promise {
		if (this.isSettingsFile(resource) && (location.matches(['files.exclude']) || location.matches(['search.exclude']))) {

			globValues.forEach((e) => result.add(e));
		}

		return null;
	}

	public getInfoContribution(resource: URI, location: JSONLocation): WinJS.TPromise<HtmlContent.IHTMLContentElement[]> {
		return null;
	}
}