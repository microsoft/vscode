/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as languageModeIds from './languageModeIds';
import { TypeScriptVersion } from './versionProvider';
import { Disposable } from './dispose';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export default class VersionStatus extends Disposable {
	private readonly _versionBarEntry: vscode.StatusBarItem;

	constructor(
		private readonly _normalizePath: (resource: vscode.Uri) => string | undefined
	) {
		super();
		this._versionBarEntry = this._register(vscode.window.createStatusBarItem({
			id: 'status.typescript.version',
			name: localize('typescriptVersion', "TypeScript: Version"),
			alignment: vscode.StatusBarAlignment.Right,
			priority: 99 /* to the right of editor status (100) */
		}));
		vscode.window.onDidChangeActiveTextEditor(this.showHideStatus, this, this._disposables);
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
