/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TypeScriptVersion } from './versionProvider';
import * as languageModeIds from './languageModeIds';

export default class VersionStatus {
	private readonly onChangeEditorSub: vscode.Disposable;
	private readonly versionBarEntry: vscode.StatusBarItem;

	constructor(
		private readonly normalizePath: (resource: vscode.Uri) => string | null
	) {
		this.versionBarEntry = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, Number.MIN_VALUE);
		this.onChangeEditorSub = vscode.window.onDidChangeActiveTextEditor(this.showHideStatus, this);
	}

	dispose() {
		this.versionBarEntry.dispose();
		this.onChangeEditorSub.dispose();
	}

	public onDidChangeTypeScriptVersion(version: TypeScriptVersion) {
		this.showHideStatus();
		this.versionBarEntry.text = version.versionString;
		this.versionBarEntry.tooltip = version.path;
		this.versionBarEntry.command = 'typescript.selectTypeScriptVersion';
	}

	private showHideStatus() {
		if (!vscode.window.activeTextEditor) {
			this.versionBarEntry.hide();
			return;
		}

		const doc = vscode.window.activeTextEditor.document;
		if (vscode.languages.match([languageModeIds.typescript, languageModeIds.typescriptreact], doc)) {
			if (this.normalizePath(doc.uri)) {
				this.versionBarEntry.show();
			} else {
				this.versionBarEntry.hide();
			}
			return;
		}

		if (!vscode.window.activeTextEditor.viewColumn) {
			// viewColumn is undefined for the debug/output panel, but we still want
			// to show the version info in the existing editor
			return;
		}

		this.versionBarEntry.hide();
	}
}
