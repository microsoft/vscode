/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as languageModeIds from './languageModeIds';
import { TypeScriptVersion } from './versionProvider';

export default class VersionStatus {
	private readonly _onChangeEditorSub: vscode.Disposable;
	private readonly _versionBarEntry: vscode.StatusBarItem;

	constructor(
		private readonly _normalizePath: (resource: vscode.Uri) => string | undefined
	) {
		this._versionBarEntry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99 /* to the right of editor status (100) */);
		this._onChangeEditorSub = vscode.window.onDidChangeActiveTextEditor(this.showHideStatus, this);
	}

	public dispose() {
		this._versionBarEntry.dispose();
		this._onChangeEditorSub.dispose();
	}

	public onDidChangeTypeScriptVersion(version: TypeScriptVersion) {
		this.showHideStatus();
		this._versionBarEntry.text = version.versionString;
		this._versionBarEntry.tooltip = version.path;
		this._versionBarEntry.command = 'typescript.selectTypeScriptVersion';
	}

	private showHideStatus() {
		if (!vscode.window.activeTextEditor) {
			this._versionBarEntry.hide();
			return;
		}

		const doc = vscode.window.activeTextEditor.document;
		if (vscode.languages.match([languageModeIds.typescript, languageModeIds.typescriptreact], doc)) {
			if (this._normalizePath(doc.uri)) {
				this._versionBarEntry.show();
			} else {
				this._versionBarEntry.hide();
			}
			return;
		}

		if (!vscode.window.activeTextEditor.viewColumn) {
			// viewColumn is undefined for the debug/output panel, but we still want
			// to show the version info in the existing editor
			return;
		}

		this._versionBarEntry.hide();
	}
}
