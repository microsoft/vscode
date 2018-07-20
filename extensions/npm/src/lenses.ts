/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	ExtensionContext, CodeLensProvider, TextDocument, commands, ProviderResult, CodeLens, CancellationToken,
	workspace, tasks, Range, Command, Event, EventEmitter
} from 'vscode';
import {
	createTask, startDebugging, findAllScriptRanges, extractDebugArgFromScript
} from './tasks';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export class NpmLensProvider implements CodeLensProvider {
	private extensionContext: ExtensionContext;
	private _onDidChangeCodeLenses: EventEmitter<void> = new EventEmitter<void>();
	readonly onDidChangeCodeLenses: Event<void> = this._onDidChangeCodeLenses.event;

	constructor(context: ExtensionContext) {
		this.extensionContext = context;
		context.subscriptions.push(commands.registerCommand('npm.runScriptFromLens', this.runScriptFromLens, this));
		context.subscriptions.push(commands.registerCommand('npm.debugScriptFromLens', this.debugScriptFromLens, this));
	}

	public provideCodeLenses(document: TextDocument, _token: CancellationToken): ProviderResult<CodeLens[]> {
		let result = findAllScriptRanges(document.getText());
		let folder = workspace.getWorkspaceFolder(document.uri);
		let lenses: CodeLens[] = [];


		if (folder && !workspace.getConfiguration('npm', folder.uri).get<string>('scriptCodeLens.enable', 'true')) {
			return lenses;
		}

		result.forEach((value, key) => {
			let start = document.positionAt(value[0]);
			let end = document.positionAt(value[0] + value[1]);
			let range = new Range(start, end);

			let command: Command = {
				command: 'npm.runScriptFromLens',
				title: localize('run', "Run"),
				arguments: [document, key]
			};
			let lens: CodeLens = new CodeLens(range, command);
			lenses.push(lens);

			let debugArgs = extractDebugArgFromScript(value[2]);
			if (debugArgs) {
				command = {
					command: 'npm.debugScriptFromLens',
					title: localize('debug', "Debug"),
					arguments: [document, key, debugArgs[0], debugArgs[1]]
				};
				lens = new CodeLens(range, command);
				lenses.push(lens);
			}
		});
		return lenses;
	}

	public refresh() {
		this._onDidChangeCodeLenses.fire();
	}

	public runScriptFromLens(document: TextDocument, script: string) {
		let uri = document.uri;
		let folder = workspace.getWorkspaceFolder(uri);
		if (folder) {
			let task = createTask(script, `run ${script}`, folder, uri);
			tasks.executeTask(task);
		}
	}

	public debugScriptFromLens(document: TextDocument, script: string, protocol: string, port: number) {
		let uri = document.uri;
		let folder = workspace.getWorkspaceFolder(uri);
		if (folder) {
			startDebugging(script, protocol, port, folder);
		}
	}
}
