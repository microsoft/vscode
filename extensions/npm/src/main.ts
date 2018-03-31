/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as httpRequest from 'request-light';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

import { addJSONProviders } from './features/jsonContributions';
import { NpmScriptsTreeDataProvider } from './npmView';
import { provideNpmScripts } from './tasks';

let taskProvider: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext): void {

	if (vscode.workspace.workspaceFolders) {
		let provider: vscode.TaskProvider = {
			provideTasks: () => {
				return provideNpmScripts(localize);
			},
			resolveTask(_task: vscode.Task): vscode.Task | undefined {
				return undefined;
			}
		};
		taskProvider = vscode.workspace.registerTaskProvider('npm', provider);
		let treeDataProvider = vscode.window.registerTreeDataProvider('npm', new NpmScriptsTreeDataProvider(context, provider, localize));
		context.subscriptions.push(treeDataProvider);
	}

	configureHttpRequest();
	vscode.workspace.onDidChangeConfiguration(() => configureHttpRequest());

	context.subscriptions.push(addJSONProviders(httpRequest.xhr));
}

function configureHttpRequest() {
	const httpSettings = vscode.workspace.getConfiguration('http');
	httpRequest.configure(httpSettings.get<string>('proxy', ''), httpSettings.get<boolean>('proxyStrictSSL', true));
}

export function deactivate(): void {
	if (taskProvider) {
		taskProvider.dispose();
	}
}
