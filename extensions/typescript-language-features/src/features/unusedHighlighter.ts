/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DiagnosticSet } from './diagnostics';


export class UnusedHighlighter {

	private readonly _decorationType: vscode.TextEditorDecorationType;

	private readonly _diagnostics = new DiagnosticSet();
	private _validate: boolean = true;

	constructor(
	) {
		this._decorationType = vscode.window.createTextEditorDecorationType({
			opacity: '0.7'
		});
	}

	public dispose() {
		this._decorationType.dispose();
	}

	public reInitialize(): void {
		this._diagnostics.clear();

		for (const editor of vscode.window.visibleTextEditors) {
			editor.setDecorations(this._decorationType, []);
		}
	}

	public set validate(value: boolean) {
		if (this._validate === value) {
			return;
		}

		this._validate = value;
		if (!value) {
			for (const editor of vscode.window.visibleTextEditors) {
				editor.setDecorations(this._decorationType, []);
			}
		}
	}

	public diagnosticsReceived(
		file: vscode.Uri,
		diagnostics: vscode.Diagnostic[]
	): void {
		// Undocumented flag to enable
		if (!vscode.workspace.getConfiguration('typescript').get('showUnused.experimentalFade')) {
			return;
		}
		this._diagnostics.set(file, diagnostics);
		this._updateCurrentHighlights(file);
	}

	private _updateCurrentHighlights(file: vscode.Uri) {
		for (const editor of vscode.window.visibleTextEditors) {
			if (editor.document.uri.fsPath !== file.fsPath) {
				continue;
			}

			const diagnostics = this._diagnostics.get(editor.document.uri);
			if (diagnostics) {
				editor.setDecorations(this._decorationType, diagnostics.map(x => x.range));
			}
		}
	}
}