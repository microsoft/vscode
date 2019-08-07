/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isSupportedLanguageMode } from './languageModeIds';
import { Disposable } from './dispose';

/**
 * When clause context set when the current file is managed by vscode's built-in typescript extension.
 */
export default class ManagedFileContextManager extends Disposable {
	private static readonly contextName = 'typescript.isManagedFile';

	private isInManagedFileContext: boolean = false;

	public constructor(
		private readonly normalizePath: (resource: vscode.Uri) => string | undefined
	) {
		super();
		vscode.window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor, this, this._disposables);

		this.onDidChangeActiveTextEditor(vscode.window.activeTextEditor);
	}

	private onDidChangeActiveTextEditor(editor?: vscode.TextEditor): any {
		if (editor) {
			const isManagedFile = isSupportedLanguageMode(editor.document) && this.normalizePath(editor.document.uri) !== null;
			this.updateContext(isManagedFile);
		}
	}

	private updateContext(newValue: boolean) {
		if (newValue === this.isInManagedFileContext) {
			return;
		}

		vscode.commands.executeCommand('setContext', ManagedFileContextManager.contextName, newValue);
		this.isInManagedFileContext = newValue;
	}
}
