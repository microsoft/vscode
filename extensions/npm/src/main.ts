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
import { provideNpmScripts, hasNpmScripts, explorerIsEnabled } from './tasks';

let taskProvider: vscode.Disposable | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	taskProvider = registerTaskProvider(context);
	configureHttpRequest();
	vscode.workspace.onDidChangeConfiguration(() => configureHttpRequest());
	context.subscriptions.push(addJSONProviders(httpRequest.xhr));
}

function registerTaskProvider(context: vscode.ExtensionContext): vscode.Disposable | undefined {
	if (vscode.workspace.workspaceFolders) {
		let provider: vscode.TaskProvider = {
			provideTasks: () => {
				return provideNpmScripts(localize);
			},
			resolveTask(_task: vscode.Task): vscode.Task | undefined {
				return undefined;
			}
		};
		let disposable = vscode.workspace.registerTaskProvider('npm', provider);
		registerExplorer(context, provider);
		return disposable;
	}
	return undefined;
}

async function registerExplorer(context: vscode.ExtensionContext, provider: vscode.TaskProvider) {
	if (explorerIsEnabled()) {
		let treeDataProvider = vscode.window.registerTreeDataProvider('npm', new NpmScriptsTreeDataProvider(context, provider, localize));
		context.subscriptions.push(treeDataProvider);
		if (await hasNpmScripts()) {
			vscode.commands.executeCommand('setContext', 'hasNpmScripts', true);
		}
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
