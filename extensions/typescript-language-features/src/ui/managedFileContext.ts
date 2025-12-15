/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { disabledSchemes } from '../configuration/fileSchemes';
import { isJsConfigOrTsConfigFileName } from '../configuration/languageDescription';
import { isSupportedLanguageMode } from '../configuration/languageIds';
import { Disposable } from '../utils/dispose';
import { ActiveJsTsEditorTracker } from './activeJsTsEditorTracker';

/**
 * When clause context set when the current file is managed by vscode's built-in typescript extension.
 */
export default class ManagedFileContextManager extends Disposable {
	private static readonly contextName = 'typescript.isManagedFile';

	private isInManagedFileContext: boolean = false;

	constructor(activeJsTsEditorTracker: ActiveJsTsEditorTracker) {
		super();
		activeJsTsEditorTracker.onDidChangeActiveJsTsEditor(this.onDidChangeActiveTextEditor, this, this._disposables);

		this.onDidChangeActiveTextEditor(activeJsTsEditorTracker.activeJsTsEditor);
	}

	override dispose() {
		// Clear the context
		this.updateContext(false);

		super.dispose();
	}

	private onDidChangeActiveTextEditor(editor?: vscode.TextEditor): void {
		if (editor) {
			this.updateContext(this.isManagedFile(editor));
		} else {
			this.updateContext(false);
		}
	}

	private updateContext(newValue: boolean) {
		if (newValue === this.isInManagedFileContext) {
			return;
		}

		vscode.commands.executeCommand('setContext', ManagedFileContextManager.contextName, newValue);
		this.isInManagedFileContext = newValue;
	}

	private isManagedFile(editor: vscode.TextEditor): boolean {
		return this.isManagedScriptFile(editor) || this.isManagedConfigFile(editor);
	}

	private isManagedScriptFile(editor: vscode.TextEditor): boolean {
		return isSupportedLanguageMode(editor.document) && !disabledSchemes.has(editor.document.uri.scheme);
	}

	private isManagedConfigFile(editor: vscode.TextEditor): boolean {
		return isJsConfigOrTsConfigFileName(editor.document.fileName);
	}
}

