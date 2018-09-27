/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as httpRequest from 'request-light';
import * as vscode from 'vscode';
import { addJSONProviders } from './features/jsonContributions';
import { NpmScriptsTreeDataProvider } from './npmView';
import { invalidateTasksCache, NpmTaskProvider } from './tasks';
import { invalidateHoverScriptsCache, NpmScriptHoverProvider } from './scriptHover';
import { runSelectedScript } from './commands';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const taskProvider = registerTaskProvider(context);
	const treeDataProvider = registerExplorer(context);
	const hoverProvider = registerHoverProvider(context);

	configureHttpRequest();
	let d = vscode.workspace.onDidChangeConfiguration((e) => {
		configureHttpRequest();
		if (e.affectsConfiguration('npm.exclude')) {
			invalidateTasksCache();
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
	context.subscriptions.push(d);

	d = vscode.workspace.onDidChangeTextDocument((e) => {
		invalidateHoverScriptsCache(e.document);
	});
	context.subscriptions.push(d);
	context.subscriptions.push(vscode.commands.registerCommand('npm.runSelectedScript', runSelectedScript));
	context.subscriptions.push(addJSONProviders(httpRequest.xhr));
}

function registerTaskProvider(context: vscode.ExtensionContext): vscode.Disposable | undefined {

	function invalidateScriptCaches() {
		invalidateHoverScriptsCache();
		invalidateTasksCache();
	}

	if (vscode.workspace.workspaceFolders) {
		let watcher = vscode.workspace.createFileSystemWatcher('**/package.json');
		watcher.onDidChange((_e) => invalidateScriptCaches());
		watcher.onDidDelete((_e) => invalidateScriptCaches());
		watcher.onDidCreate((_e) => invalidateScriptCaches());
		context.subscriptions.push(watcher);

		let workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders((_e) => invalidateScriptCaches());
		context.subscriptions.push(workspaceWatcher);

		let provider: vscode.TaskProvider = new NpmTaskProvider(context);
		let disposable = vscode.workspace.registerTaskProvider('npm', provider);
		context.subscriptions.push(disposable);
		return disposable;
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

function registerHoverProvider(context: vscode.ExtensionContext): NpmScriptHoverProvider | undefined {
	if (vscode.workspace.workspaceFolders) {
		let npmSelector: vscode.DocumentSelector = {
			language: 'json',
			scheme: 'file',
			pattern: '**/package.json'
		};
		let provider = new NpmScriptHoverProvider(context);
		context.subscriptions.push(vscode.languages.registerHoverProvider(npmSelector, provider));
		return provider;
	}
	return undefined;
}

function configureHttpRequest() {
	const httpSettings = vscode.workspace.getConfiguration('http');
	httpRequest.configure(httpSettings.get<string>('proxy', ''), httpSettings.get<boolean>('proxyStrictSSL', true));
}

export function deactivate(): void {
}
