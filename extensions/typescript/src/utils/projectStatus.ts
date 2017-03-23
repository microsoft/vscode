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

interface ProjectHintedMap {
	[k: string]: boolean;
}

const fileLimit = 500;

class ExcludeHintItem {
	private _item: vscode.StatusBarItem;
	private _client: ITypescriptServiceClient;
	private _currentHint: Hint;

	constructor(client: ITypescriptServiceClient) {
		this._client = client;
		this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
		this._item.command = 'js.projectStatus.command';
	}

	public getCurrentHint(): Hint {
		return this._currentHint;
	}

	public hide() {
		this._item.hide();
	}

	public show(configFileName: string, largeRoots: string, onExecute: () => void) {
		this._currentHint = {
			message: largeRoots.length > 0
				? localize('hintExclude', "To enable project-wide JavaScript/TypeScript language features, exclude folders with many files, like: {0}", largeRoots)
				: localize('hintExclude.generic', "To enable project-wide JavaScript/TypeScript language features, exclude large folders with source files that you do not work on."),
			options: [{
				title: localize('open', "Configure Excludes"),
				execute: () => {
					this._client.logTelemetry('js.hintProjectExcludes.accepted');
					onExecute();
					this._item.hide();

					let configFileUri: vscode.Uri;
					if (vscode.workspace.rootPath && dirname(configFileName).indexOf(vscode.workspace.rootPath) === 0) {
						configFileUri = vscode.Uri.file(configFileName);
					} else {
						configFileUri = vscode.Uri.parse('untitled://' + join(vscode.workspace.rootPath || '', 'jsconfig.json'));
					}

					return vscode.workspace.openTextDocument(configFileName)
						.then(vscode.window.showTextDocument);
				}
			}]
		};
		this._item.tooltip = this._currentHint.message;
		this._item.text = localize('large.label', "Configure Excludes");
		this._item.tooltip = localize('hintExclude.tooltip', "To enable project-wide JavaScript/TypeScript language features, exclude large folders with source files that you do not work on.");
		this._item.color = '#A5DF3B';
		this._item.show();
		this._client.logTelemetry('js.hintProjectExcludes');
	}
}

function createLargeProjectMonitorForProject(item: ExcludeHintItem, client: ITypescriptServiceClient, isOpen: (path: string) => Promise<boolean>, memento: vscode.Memento): vscode.Disposable[] {
	const toDispose: vscode.Disposable[] = [];
	const projectHinted: ProjectHintedMap = Object.create(null);

	const projectHintIgnoreList = memento.get<string[]>('projectHintIgnoreList', []);
	for (let path of projectHintIgnoreList) {
		if (path === null) {
			path = 'undefined';
		}
		projectHinted[path] = true;
	}

	function onEditor(editor: vscode.TextEditor | undefined): void {
		if (!editor
			|| !vscode.languages.match(selector, editor.document)
			|| !client.normalizePath(editor.document.uri)) {

			item.hide();
			return;
		}

		const file = client.normalizePath(editor.document.uri);
		if (!file) {
			return;
		}
		isOpen(file).then(value => {
			if (!value) {
				return;
			}

			return client.execute('projectInfo', { file, needFileNameList: true } as protocol.ProjectInfoRequestArgs).then(res => {
				if (!res.body) {
					return;
				}
				let {configFileName, fileNames} = res.body;

				if (projectHinted[configFileName] === true || !fileNames) {
					return;
				}

				if (fileNames.length > fileLimit || res.body.languageServiceDisabled) {
					let largeRoots = computeLargeRoots(configFileName, fileNames).map(f => `'/${f}/'`).join(', ');
					item.show(configFileName, largeRoots, () => {
						projectHinted[configFileName] = true;
					});
				} else {
					item.hide();
				}
			});
		}).catch(err => {
			client.warn(err);
		});
	}

	toDispose.push(vscode.workspace.onDidChangeTextDocument(e => {
		delete projectHinted[e.document.fileName];
	}));

	toDispose.push(vscode.window.onDidChangeActiveTextEditor(onEditor));
	onEditor(vscode.window.activeTextEditor);

	return toDispose;
}

function createLargeProjectMonitorFromTypeScript(item: ExcludeHintItem, client: ITypescriptServiceClient): vscode.Disposable {
	return client.onProjectLanguageServiceStateChanged(body => {
		if (body.languageServiceEnabled) {
			item.hide();
		} else {
			item.show(body.projectName, '', () => { });
		}
	});
}

export function create(client: ITypescriptServiceClient, isOpen: (path: string) => Promise<boolean>, memento: vscode.Memento) {
	const toDispose: vscode.Disposable[] = [];

	let item = new ExcludeHintItem(client);
	toDispose.push(vscode.commands.registerCommand('js.projectStatus.command', () => {
		let {message, options} = item.getCurrentHint();
		return vscode.window.showInformationMessage(message, ...options).then(selection => {
			if (selection) {
				return selection.execute();
			}
		});
	}));

	if (client.apiVersion.has213Features()) {
		toDispose.push(createLargeProjectMonitorFromTypeScript(item, client));
	} else {
		toDispose.push(...createLargeProjectMonitorForProject(item, client, isOpen, memento));
	}

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
