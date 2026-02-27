/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { NpmUpToDateFeature } from './npmUpToDateFeature';

export class Extension extends vscode.Disposable {
	private readonly _output: vscode.LogOutputChannel;
	private _npmFeature: NpmUpToDateFeature | undefined;

	constructor(context: vscode.ExtensionContext) {
		const disposables: vscode.Disposable[] = [];
		super(() => disposables.forEach(d => d.dispose()));

		this._output = vscode.window.createOutputChannel('VS Code Extras', { log: true });
		disposables.push(this._output);

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
		} else if (!enabled && this._npmFeature) {
			this._npmFeature.dispose();
			this._npmFeature = undefined;
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
