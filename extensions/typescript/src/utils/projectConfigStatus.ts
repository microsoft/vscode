/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

import { ITypescriptServiceClient } from '../typescriptService';

import { loadMessageBundle } from 'vscode-nls';
const localize = loadMessageBundle();

export default class ProjectConfigStatus implements vscode.Disposable {
	private entry: vscode.StatusBarItem;
	private subscription: vscode.Disposable;

	constructor(private client: ITypescriptServiceClient) {
		this.entry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
		this.entry.color = 'white';
		this.entry.command = 'typescript.goToProjectConfig';

		this.subscription = vscode.window.onDidChangeActiveTextEditor(editor => this.showHideStatus(editor));
		if (vscode.window.activeTextEditor) {
			this.showHideStatus(vscode.window.activeTextEditor);
		}
	}

	private showHideStatus(editor: vscode.TextEditor | undefined) {
		editor = editor || vscode.window.activeTextEditor;
		if (!editor || !vscode.workspace.rootPath) {
			this.hide();
			return;
		}
		const doc = editor.document;
		const isTypeScript = !!(vscode.languages.match('typescript', doc) || vscode.languages.match('typescriptreact', doc));
		if (isTypeScript || vscode.languages.match('javascript', doc) || vscode.languages.match('javascriptreact', doc)) {
			this.showStatusForResource(doc.uri, isTypeScript);
		} else {
			this.hide();
		}
	}

	private showStatusForResource(resource: vscode.Uri, isTypeScript: boolean) {
		const file = this.client.normalizePath(resource);
		if (!file) {
			this.hide();
			return;
		}
		return this.client.execute('projectInfo', { file, needFileNameList: false }).then(res => {
			if (!res || !res.body || !res.body.configFileName) {
				this.hide();
				return;
			}

			const { configFileName } = res.body;
			this.entry.tooltip = configFileName;
			this.entry.command = isTypeScript ? 'typescript.goToProjectConfig' : 'javascript.goToProjectConfig';

			if (configFileName.toLowerCase().endsWith('tsconfig.json')) {
				this.entry.text = 'tsconfig';
			} else if (configFileName.toLowerCase().endsWith('jsconfig.json')) {
				this.entry.text = 'jsconfig';
			} else {
				this.entry.text = isTypeScript
					? localize('typescript.projectConfigStatus.noTypeScriptProject', 'No TS Project')
					: localize('typescript.projectConfigStatus.noJavaScriptProject', 'No JS Project');
			}
			this.entry.show();
		});
	}

	private hide() {
		this.entry.hide();
		this.entry.text = '';
		this.entry.tooltip = '';
	}

	dispose() {
		this.entry.dispose();
		this.subscription.dispose();
	}
}
