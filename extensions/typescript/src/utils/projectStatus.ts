/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { ITypescriptServiceClient } from '../typescriptService';
import { loadMessageBundle } from 'vscode-nls';
import { dirname, join } from 'path';

const localize = loadMessageBundle();
const selector = ['javascript', 'javascriptreact'];

interface Option extends vscode.MessageItem {
	execute(): void;
}

interface Hint {
	message: string;
	options: Option[];
}

const fileLimit = 500;

export function create(client: ITypescriptServiceClient, isOpen: (path: string) => Promise<boolean>, memento: vscode.Memento) {

	const toDispose: vscode.Disposable[] = [];
	const projectHinted: { [k: string]: boolean } = Object.create(null);

	const projectHintIgnoreList = memento.get<string[]>('projectHintIgnoreList', []);
	for (let path of projectHintIgnoreList) {
		if (path === null) {
			path = undefined;
		}
		projectHinted[path] = true;
	}

	let currentHint: Hint;
	let item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
	item.command = 'js.projectStatus.command';
	toDispose.push(vscode.commands.registerCommand('js.projectStatus.command', () => {
		let {message, options} = currentHint;
		return vscode.window.showInformationMessage(message, ...options).then(selection => {
			if (selection) {
				return selection.execute();
			}
		});
	}));

	toDispose.push(vscode.workspace.onDidChangeTextDocument(e => {
		delete projectHinted[e.document.fileName];
	}));

	function onEditor(editor: vscode.TextEditor): void {
		if (!editor
			|| !vscode.languages.match(selector, editor.document)
			|| !client.asAbsolutePath(editor.document.uri)) {

			item.hide();
			return;
		}

		const file = client.asAbsolutePath(editor.document.uri);
		isOpen(file).then(value => {
			if (!value) {
				return;
			}

			return client.execute('projectInfo', { file, needFileNameList: true }).then(res => {

				let {configFileName, fileNames} = res.body;

				if (projectHinted[configFileName] === true) {
					return;
				}

				if (fileNames.length > fileLimit) {
					let largeRoots = computeLargeRoots(configFileName, fileNames).map(f => `'/${f}/'`).join(', ');

					currentHint = {
						message: largeRoots.length > 0
							? localize('hintExclude', "For better performance exclude folders with many files, like: {0}", largeRoots)
							: localize('hintExclude.generic', "For better performance exclude folders with many files."),
						options: [{
							title: localize('open', "Configure Excludes"),
							execute: () => {
								client.logTelemetry('js.hintProjectExcludes.accepted');
								projectHinted[configFileName] = true;
								item.hide();

								let configFileUri: vscode.Uri;
								if (dirname(configFileName).indexOf(vscode.workspace.rootPath) === 0) {
									configFileUri = vscode.Uri.file(configFileName);
								} else {
									configFileUri = vscode.Uri.parse('untitled://' + join(vscode.workspace.rootPath, 'jsconfig.json'));
								}

								return vscode.workspace.openTextDocument(configFileUri)
									.then(vscode.window.showTextDocument);
							}
						}]
					};
					item.tooltip = currentHint.message;
					item.text = localize('large.label', "Configure Excludes");
					item.tooltip = localize('hintExclude.tooltip', "For better performance exclude folders with many files.");
					item.color = '#A5DF3B';
					item.show();
					client.logTelemetry('js.hintProjectExcludes');

				} else {
					item.hide();
				}
			});
		}).catch(err => {
			client.warn(err);
		});
	}

	toDispose.push(vscode.window.onDidChangeActiveTextEditor(onEditor));
	onEditor(vscode.window.activeTextEditor);

	return vscode.Disposable.from(...toDispose);
}

function computeLargeRoots(configFileName: string, fileNames: string[]): string[] {

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

	data
		.sort((a, b) => b.count - a.count)
		.filter(s => s.root === 'src' || s.root === 'test' || s.root === 'tests');

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
