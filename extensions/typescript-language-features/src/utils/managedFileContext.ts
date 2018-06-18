/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isSupportedLanguageMode } from './languageModeIds';

/**
 * When clause context set when the current file is managed by vscode's built-in typescript extension.
 */
const isManagedFile_contextName = 'typescript.isManagedFile';

export default class ManagedFileContextManager {

	private isInManagedFileContext: boolean = false;

	private readonly onDidChangeActiveTextEditorSub: vscode.Disposable;

	public constructor(
		private readonly normalizePath: (resource: vscode.Uri) => string | null
	) {
		this.onDidChangeActiveTextEditorSub = vscode.window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor, this);

		this.onDidChangeActiveTextEditor(vscode.window.activeTextEditor);
	}

	public dispose() {
		this.onDidChangeActiveTextEditorSub.dispose();
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

		vscode.commands.executeCommand('setContext', isManagedFile_contextName, newValue);
		this.isInManagedFileContext = newValue;
	}
}

