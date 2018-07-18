/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as httpRequest from 'request-light';
import * as vscode from 'vscode';

import { addJSONProviders } from './features/jsonContributions';
import { NpmScriptsTreeDataProvider } from './npmView';
import { provideNpmScripts, invalidateScriptsCache, findScriptAtPosition, createTask } from './tasks';

import * as nls from 'vscode-nls';

let taskProvider: vscode.Disposable | undefined;

const localize = nls.loadMessageBundle();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	taskProvider = registerTaskProvider(context);
	const treeDataProvider = registerExplorer(context);
	configureHttpRequest();
	vscode.workspace.onDidChangeConfiguration((e) => {
		configureHttpRequest();
		if (e.affectsConfiguration('npm.exclude')) {
			invalidateScriptsCache();
			if (treeDataProvider) {
				treeDataProvider.refresh();
			}
		}
		if (e.affectsConfiguration('npm.scriptExplorerAction')) {
			if (treeDataProvider) {
				treeDataProvider.refresh();
			}
		}
	});
	context.subscriptions.push(addJSONProviders(httpRequest.xhr));
	context.subscriptions.push(vscode.commands.registerCommand('npm.runScriptFromSource', runScriptFromSource));
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

async function runScriptFromSource() {
	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	let document = editor.document;
	let contents = document.getText();
	let selection = editor.selection;
	let offset = document.offsetAt(selection.anchor);
	let script = findScriptAtPosition(contents, offset);
	if (script) {
		let uri = document.uri;
		let folder = vscode.workspace.getWorkspaceFolder(uri);
		if (folder) {
			let task = createTask(script, `run ${script}`, folder, uri);
			vscode.tasks.executeTask(task);
		}
	} else {
		let message = localize('noScriptFound', 'Could not find a script at the selection.');
		vscode.window.showErrorMessage(message);
	}
}

export function deactivate(): void {
	if (taskProvider) {
		taskProvider.dispose();
	}
}
