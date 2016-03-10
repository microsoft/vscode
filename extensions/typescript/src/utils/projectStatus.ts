/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import {ITypescriptServiceClient} from '../typescriptService';
import {loadMessageBundle} from 'vscode-nls';
import {dirname} from 'path';

const localize = loadMessageBundle();
const selector = ['javascript', 'javascriptreact'];

interface Option extends vscode.MessageItem {
	execute(): void;
}

interface Hint {
	message: string;
	option: Option;
}

const fileLimit = 500;

export function create(client: ITypescriptServiceClient) {

	const toDispose: vscode.Disposable[] = [];
	const projectHinted: { [k: string]:any} = Object.create(null);

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
		delete projectHinted[e.document.fileName];
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

			if (projectHinted[configFileName] === true) {
				return;
			}

			if (!configFileName) {
				currentHint = {
					message: localize('hintCreate', "Have a project and experience better IntelliSense and code navigation."),
					option: {
						title: localize('cmdCreate', "Create jsconfig.json-file..."),
						execute: () => {
							projectHinted[configFileName] = true;
							item.hide();

							return vscode.workspace.openTextDocument(vscode.Uri.parse('untitled://' + vscode.workspace.rootPath + '/jsconfig.json'))
								.then(vscode.window.showTextDocument)
								.then(editor => editor.edit(builder => builder.insert(new vscode.Position(0, 0), defaultConfig)));
						}
					}
				};
				item.text = '$(light-bulb)';
				item.tooltip = localize('hint.tooltip', "Have a project and have better IntelliSense, better symbol search, and much more.");
				item.color = 'lime';
				item.show();

			} else if (fileNames.length > fileLimit) {

				let largeRoots = computeLargeRoots(configFileName, fileNames).map(f => `'/${f}/'`).join(', ');

				currentHint = {
					message: localize('hintExclude', "'{0}' is a large project. For better performance exclude folders with many files, like: {1}...",
						vscode.workspace.asRelativePath(configFileName),
						largeRoots),
					option: {
						title: localize('open', "Edit excludes..."),
						execute: () => {
							projectHinted[configFileName] = true;
							item.hide();

							return vscode.workspace.openTextDocument(configFileName)
								.then(vscode.window.showTextDocument);
						}
					}
				};
				item.tooltip = currentHint.message;
				item.text = localize('large.label', "configure excludes");
				item.tooltip = localize('large.tooltip', "Too many files in a project might result in bad performance. Exclude folders with many files, like: {0}...", largeRoots);
				item.color = '#0CFF00';
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

function computeLargeRoots(configFileName:string, fileNames: string[]): string[] {

	let roots: { [first: string]: number } = Object.create(null);
	let dir = dirname(configFileName);

	// console.log(dir, fileNames);

	for (let fileName of fileNames) {
		if (fileName.indexOf(dir) === 0) {
			let first = fileName.substring(dir.length + 1);
			first = first.substring(0, first.indexOf('/'));
			if (first) {
				roots[first] = (roots[first] || 0) + 1;
			}
		}
	}

	let data: { root: string; count: number }[] = [];
	for (let key in roots) {
		data.push({ root: key, count: roots[key] });
	}
	data.sort((a, b) => b.count - a.count);

	let result: string[] = [];
	let sum = 0;
	for (let e of data) {
		sum += e.count;
		result.push(e.root);
		if (fileNames.length - sum < fileLimit) {
			break;
		}
	}

	return result;
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
