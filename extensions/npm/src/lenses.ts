/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	ExtensionContext, CodeLensProvider, TextDocument, commands, ProviderResult, CodeLens, CancellationToken,
	workspace, tasks, Range, Command
} from 'vscode';
import {
	createTask, startDebugging, findAllScriptRanges, extractDebugArgFromScript
} from './tasks';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export class NpmLenseProvider implements CodeLensProvider {
	private extensionContext: ExtensionContext;

	constructor(context: ExtensionContext) {
		const subscriptions = context.subscriptions;
		this.extensionContext = context;
		context.subscriptions.push(commands.registerCommand('npm.runScriptFromLense', this.runScriptFromLense, this));
		context.subscriptions.push(commands.registerCommand('npm.debugScriptFromLense', this.debugScriptFromLense, this));
	}

	public provideCodeLenses(document: TextDocument, token: CancellationToken): ProviderResult<CodeLens[]> {
		let result = findAllScriptRanges(document.getText());
		let lenses: CodeLens[] = [];

		result.forEach((value, key) => {
			let start = document.positionAt(value[0]);
			let end = document.positionAt(value[0] + value[1]);
			let lens: CodeLens;
			let command: Command = {
				command: 'npm.runScriptFromLense',
				title: localize('run', "Run"),
				arguments: [document, key]
			};
			lens = new CodeLens(new Range(start, end), command);
			lenses.push(lens);
			let debugArgs = extractDebugArgFromScript(value[2]);
			if (debugArgs) {
				command = {
					command: 'npm.debugScriptFromLense',
					title: localize('debug', "Debug"),
					arguments: [document, key, debugArgs[0], debugArgs[1]]
				};
				lens = new CodeLens(new Range(start, end), command);
				lenses.push(lens);
			}
		});
		return lenses;
	}

	public runScriptFromLense(document: TextDocument, script: string) {
		let uri = document.uri;
		let folder = workspace.getWorkspaceFolder(uri);
		if (folder) {
			let task = createTask(script, `run ${script}`, folder, uri);
			tasks.executeTask(task);
		}
	}

	public debugScriptFromLense(document: TextDocument, script: string, protocol: string, port: number) {
		let uri = document.uri;
		let folder = workspace.getWorkspaceFolder(uri);
		if (folder) {
			startDebugging(script, protocol, port, folder);
		}
	}
}
