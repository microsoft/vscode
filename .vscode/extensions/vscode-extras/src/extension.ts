/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { NpmUpToDateFeature } from './npmUpToDateFeature';

export class Extension extends vscode.Disposable {
	private readonly _output: vscode.LogOutputChannel;
	private _npmFeature: NpmUpToDateFeature | undefined;
	private readonly _statusBarItem: vscode.StatusBarItem;

	constructor(context: vscode.ExtensionContext) {
		const disposables: vscode.Disposable[] = [];
		super(() => disposables.forEach(d => d.dispose()));

		this._output = vscode.window.createOutputChannel('VS Code Extras', { log: true });
		disposables.push(this._output);

		// Status Bar Item oluşturuluyor (Sağ taraf, öncelik 100)
		this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this._statusBarItem.command = 'vscode-extras.refreshNpmStatus';
		this._statusBarItem.text = '$(sync~spin) NPM: Initializing';
		this._statusBarItem.tooltip = 'Click to check NPM packages status manually';
		disposables.push(this._statusBarItem);

		// Manuel yenileme komutu kaydediliyor
		disposables.push(
			vscode.commands.registerCommand('vscode-extras.refreshNpmStatus', () => {
				this._output.info('Manual NPM status refresh triggered via Status Bar.');
				vscode.window.showInformationMessage('NPM Up-to-Date check triggered!');
				// İleride buraya _npmFeature üzerinden bir refresh metod tetiklemesi eklenebilir
			})
		);

		this._updateNpmFeature();

		disposables.push(
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('vscode-extras.npmUpToDateFeature.enabled')) {
					this._updateNpmFeature();
				}
			})
		);
	}

	private _updateNpmFeature(): void {
		const enabled = vscode.workspace.getConfiguration('vscode-extras').get<boolean>('npmUpToDateFeature.enabled', true);
		if (enabled && !this._npmFeature) {
			this._npmFeature = new NpmUpToDateFeature(this._output);
			this._statusBarItem.text = '$(check) NPM: Active';
			this._statusBarItem.show();
			this._output.info('NpmUpToDateFeature enabled and Status Bar activated.');
		} else if (!enabled && this._npmFeature) {
			this._npmFeature.dispose();
			this._npmFeature = undefined;
			this._statusBarItem.hide();
			this._output.info('NpmUpToDateFeature disabled and Status Bar hidden.');
		}
	}
}

let extension: Extension | undefined;

export function activate(context: vscode.ExtensionContext) {
	extension = new Extension(context);
	context.subscriptions.push(extension);
}

export function deactivate() {
	extension = undefined;
}
