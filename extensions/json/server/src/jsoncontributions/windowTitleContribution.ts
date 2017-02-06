/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { MarkedString } from 'vscode-languageserver';
import Strings = require('../utils/strings');
import { JSONWorkerContribution, JSONPath, CompletionsCollector } from 'vscode-json-languageservice';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

export class WindowTitleContribution implements JSONWorkerContribution {

	constructor() {
	}

	private isSettingsFile(resource: string): boolean {
		return Strings.endsWith(resource, '/settings.json');
	}

	public collectDefaultCompletions(resource: string, result: CompletionsCollector): Thenable<any> {
		return null;
	}

	public collectPropertyCompletions(resource: string, location: JSONPath, currentWord: string, addValue: boolean, isLast: boolean, result: CompletionsCollector): Thenable<any> {
		return null;
	}

	public collectValueCompletions(resource: string, location: JSONPath, currentKey: string, result: CompletionsCollector): Thenable<any> {
		return null;
	}

	public getInfoContribution(resource: string, location: JSONPath): Thenable<MarkedString[]> {
		if (this.isSettingsFile(resource) && location.length === 1 && location[0] === 'window.title') {
			return Promise.resolve([
				MarkedString.fromPlainText(localize('windowTitle.description', "Controls the window title based on the active editor. Variables are substituted based on the context:")),
				MarkedString.fromPlainText(localize('windowTitle.activeEditorName', "${activeEditorName}: e.g. myFile.txt")),
				MarkedString.fromPlainText(localize('windowTitle.activeFilePath', "${activeFilePath}: e.g. /Users/Development/myProject/myFile.txt")),
				MarkedString.fromPlainText(localize('windowTitle.rootName', "${rootName}: e.g. myProject")),
				MarkedString.fromPlainText(localize('windowTitle.rootPath', "${rootPath}: e.g. /Users/Development/myProject")),
				MarkedString.fromPlainText(localize('windowTitle.appName', "${appName}: e.g. VS Code")),
				MarkedString.fromPlainText(localize('windowTitle.dirty', "${dirty}: a dirty indicator if the active editor is dirty")),
				MarkedString.fromPlainText(localize('windowTitle.separator', "${separator}: a conditional separator (\" - \") that only shows when surrounded by variables with values"))
			]);
		}

		return null;
	}
}