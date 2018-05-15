/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as httpRequest from 'request-light';
import * as vscode from 'vscode';

import { addJSONProviders } from './features/jsonContributions';
import { NpmScriptsTreeDataProvider } from './npmView';
import { provideNpmScripts, invalidateScriptsCache } from './tasks';

let taskProvider: vscode.Disposable | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	taskProvider = registerTaskProvider(context);
	let treeDataProvider = registerExplorer(context);
	configureHttpRequest();
	vscode.workspace.onDidChangeConfiguration((e) => {
		configureHttpRequest();
		if (e.affectsConfiguration('npm.filterPrePostScripts')) {
			invalidateScriptsCache();
			if (treeDataProvider) {
				treeDataProvider.refresh();
			}
		}
	});
	context.subscriptions.push(addJSONProviders(httpRequest.xhr));
}

function registerTaskProvider(context: vscode.ExtensionContext): vscode.Disposable | undefined {
	if (vscode.workspace.workspaceFolders) {
		let watcher = vscode.workspace.createFileSystemWatcher('**/package.json');
		watcher.onDidChange((_e) => invalidateScriptsCache());
		watcher.onDidDelete((_e) => invalidateScriptsCache());
		watcher.onDidCreate((_e) => invalidateScriptsCache());
		context.subscriptions.push(watcher);

		let provider: vscode.TaskProvider = {
			provideTasks: async () => {
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

function registerExplorer(context: vscode.ExtensionContext): NpmScriptsTreeDataProvider | undefined {
	if (vscode.workspace.workspaceFolders) {
		let treeDataProvider = new NpmScriptsTreeDataProvider(context);
		let disposable = vscode.window.registerTreeDataProvider('npm', treeDataProvider);
		context.subscriptions.push(disposable);
		return treeDataProvider;
	}
	return undefined;
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
