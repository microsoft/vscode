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
	taskProvider = registerTaskProvider(context);
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

function registerTaskProvider(context: vscode.ExtensionContext): vscode.Disposable | undefined {
	if (vscode.workspace.workspaceFolders) {
		let cachedTasks: vscode.Task[] | undefined = undefined;

		let flushCache = () => cachedTasks = undefined;
		let watcher = vscode.workspace.createFileSystemWatcher('**/package.json');
		watcher.onDidChange((_e) => flushCache());
		watcher.onDidDelete((_e) => flushCache());
		watcher.onDidCreate((_e) => flushCache());
		context.subscriptions.push(watcher);

		let provider: vscode.TaskProvider = {
			provideTasks: async () => {
				if (!cachedTasks) {
					cachedTasks = await provideNpmScripts();
				}
				return cachedTasks;
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
