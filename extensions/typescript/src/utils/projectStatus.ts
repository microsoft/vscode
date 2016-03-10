/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import {ITypescriptServiceClient} from '../typescriptService';
import {loadMessageBundle} from 'vscode-nls';

const localize = loadMessageBundle();
const selector = ['javascript', 'javascriptreact'];

interface Option extends vscode.MessageItem {
	execute(): void;
}

interface Hint {
	message: string;
	option: Option;
}

export function create(client: ITypescriptServiceClient) {

	const fileLimit = 10;
	const toDispose: vscode.Disposable[] = [];
	const projectHinted = new Set<string>();

	let currentHint: Hint;
	let item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
	item.command = 'js.projectStatus.command';
	toDispose.push(vscode.commands.registerCommand('js.projectStatus.command', () => {
		let {message, option} = currentHint;
		return vscode.window.showInformationMessage(message, option).then(selection => {
			if (selection === option) {
				return selection.execute();
			}
		});
	}));

	toDispose.push(vscode.workspace.onDidChangeTextDocument(e => {
		projectHinted.delete(e.document.fileName);
	}));

	function onEditor(editor: vscode.TextEditor): void {
		if (!editor || !vscode.languages.match(selector, editor.document)) {
			item.hide();
			return;
		}

		const file = client.asAbsolutePath(editor.document.uri);
		client.execute('open', { file }, false); // tsserver will fail if document isn't open
		client.execute('projectInfo', { file, needFileNameList: true }).then(res => {

			let {configFileName, fileNames} = res.body;

			if (projectHinted.has(configFileName)) {
				return;
			}

			if (!configFileName) {
				currentHint = {
					message: localize('hintCreate', "Create a project and experience better IntelliSense and code navigation."),
					option: {
						title: localize('cmdCreate', "Create jsconfig.json-file..."),
						execute: () => {
							projectHinted.add(configFileName);
							item.hide();

							return vscode.workspace.openTextDocument(vscode.Uri.parse('untitled://' + vscode.workspace.rootPath + '/jsconfig.json'))
								.then(vscode.window.showTextDocument)
								.then(editor => editor.edit(builder => builder.insert(new vscode.Position(0, 0), defaultConfig)));
						}
					}
				};
				item.text = '$(light-bulb)';
				item.tooltip = localize('hint.tooltip', "Create a project and have better IntelliSense, better symbol search, and much more.");
				item.color = 'lime';
				item.show();

			} else if (fileNames.length > fileLimit) {
				currentHint = {
					message: localize('hintExclude', "'{0}' is a large project. For better performance exclude library files like 'node_modules'.", vscode.workspace.asRelativePath(configFileName)),
					option: {
						title: localize('open', "Edit excludes..."),
						execute: () => {
							projectHinted.add(configFileName);
							item.hide();

							return vscode.workspace.openTextDocument(configFileName)
								.then(vscode.window.showTextDocument);
						}
					}
				};
				item.tooltip = currentHint.message;
				item.text = localize('large.label', "+{0} files", fileLimit);
				item.tooltip = localize('large.tooltip', "Too many files in a project might result in bad performance. Exclude library files like 'node_modules'.");
				item.color = 'orange';
				item.show();

			} else {
				item.hide();
			}
		}).catch(err => {
			console.log(err);
		});
	}

	toDispose.push(vscode.window.onDidChangeActiveTextEditor(onEditor));
	onEditor(vscode.window.activeTextEditor);

	return vscode.Disposable.from(...toDispose);
}

const defaultConfig = `{
	"compilerOptions": {
		"module": "commonjs"
	},
	"exclude": [
		"node_modules",
		"bower_components",
		"jspm_packages",
		"tmp",
		"temp"
	]
}
`;
