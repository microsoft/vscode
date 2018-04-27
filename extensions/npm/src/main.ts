/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as httpRequest from 'request-light';
import * as vscode from 'vscode';

import { addJSONProviders } from './features/jsonContributions';
import { NpmScriptsTreeDataProvider } from './npmView';
import { provideNpmScripts, explorerIsEnabled } from './tasks';

let taskProvider: vscode.Disposable | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	taskProvider = registerTaskProvider();
	registerExplorer(context);
	configureHttpRequest();
	vscode.workspace.onDidChangeConfiguration((e) => {
		configureHttpRequest();
		if (e.affectsConfiguration('npm.enableScriptExplorer')) {
			updateExplorerVisibility();
		}
	});
	context.subscriptions.push(addJSONProviders(httpRequest.xhr));
}

function registerTaskProvider(): vscode.Disposable | undefined {
	if (vscode.workspace.workspaceFolders) {
		let provider: vscode.TaskProvider = {
			provideTasks: () => {
				return provideNpmScripts();
			},
			resolveTask(_task: vscode.Task): vscode.Task | undefined {
				return undefined;
			}
		};
		return vscode.workspace.registerTaskProvider('npm', provider);
	}
	return undefined;
}

function updateExplorerVisibility() {
	vscode.commands.executeCommand('setContext', 'showExplorer', explorerIsEnabled());
}

async function registerExplorer(context: vscode.ExtensionContext) {
	if (vscode.workspace.workspaceFolders) {
		let treeDataProvider = vscode.window.registerTreeDataProvider('npm', new NpmScriptsTreeDataProvider(context));
		context.subscriptions.push(treeDataProvider);
		updateExplorerVisibility();
	}
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
