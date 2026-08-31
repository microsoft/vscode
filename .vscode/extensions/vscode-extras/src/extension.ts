/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { NpmUpToDateFeature } from './npmUpToDateFeature';
import { TodoFeature } from './todoFeature'; // Yeni eklenen import

export class Extension extends vscode.Disposable {
	private readonly _output: vscode.LogOutputChannel;
	private _npmFeature: NpmUpToDateFeature | undefined;
	private _todoFeature: TodoFeature | undefined; // Yeni özellik alanı

	constructor(_context: vscode.ExtensionContext) {
		const disposables: vscode.Disposable[] = [];
		super(() => disposables.forEach(d => d.dispose()));

		this._output = vscode.window.createOutputChannel('VS Code Extras', { log: true });
		disposables.push(this._output);

		this._updateFeatures();  

		disposables.push(
			vscode.workspace.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('vscode-extras')) {
					this._updateFeatures();
				}
			})
		);
	}

	private _updateFeatures(): void {
 
		const npmEnabled = vscode.workspace.getConfiguration('vscode-extras').get<boolean>('npmUpToDateFeature.enabled', true);
		if (npmEnabled && !this._npmFeature) {
			this._npmFeature = new NpmUpToDateFeature(this._output);
		} else if (!npmEnabled && this._npmFeature) {
			this._npmFeature.dispose();
			this._npmFeature = undefined;
		}

 
		const todoEnabled = vscode.workspace.getConfiguration('vscode-extras').get<boolean>('todoFeature.enabled', true);
		if (todoEnabled && !this._todoFeature) {
			this._todoFeature = new TodoFeature(this._output);
		} else if (!todoEnabled && this._todoFeature) {
			this._todoFeature.dispose();
			this._todoFeature = undefined;
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
