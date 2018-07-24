/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as httpRequest from 'request-light';
import * as vscode from 'vscode';

import { addJSONProviders } from './features/jsonContributions';
import { NpmScriptsTreeDataProvider } from './npmView';
import { invalidateScriptsCache, NpmTaskProvider } from './tasks';
import { NpmLensProvider } from './lenses';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const taskProvider = registerTaskProvider(context);
	const treeDataProvider = registerExplorer(context);
	const lensProvider = registerLensProvider(context);

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
		if (e.affectsConfiguration('npm.scriptCodeLens.enable')) {
			if (lensProvider) {
				lensProvider.refresh();
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

function registerLensProvider(context: vscode.ExtensionContext): NpmLensProvider | undefined {
	if (vscode.workspace.workspaceFolders) {
		let npmSelector: vscode.DocumentSelector = {
			language: 'json',
			scheme: 'file',
			pattern: '**/package.json'
		};
		let provider = new NpmLensProvider(context);
		context.subscriptions.push(vscode.languages.registerCodeLensProvider(npmSelector, provider));
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
