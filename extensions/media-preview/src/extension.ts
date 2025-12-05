/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { registerAudioPreviewSupport } from './audioPreview';
import { BinarySizeStatusBarEntry } from './binarySizeStatusBarEntry';
import { registerImagePreviewSupport } from './imagePreview';
import { registerVideoPreviewSupport } from './videoPreview';
export function activate(context: vscode.ExtensionContext) {
	const binarySizeStatusBarEntry = new BinarySizeStatusBarEntry();
	context.subscriptions.push(binarySizeStatusBarEntry);

	/**
	 * This helps show the binary size of any text file in the editor.
	 */
	class TextEditorBinarySizeController implements vscode.Disposable {
		private readonly _disposables: vscode.Disposable[] = [];
		constructor(private readonly _entry: BinarySizeStatusBarEntry) {
			this._disposables.push(vscode.window.onDidChangeActiveTextEditor(e => this.update(e)));
			this._disposables.push(vscode.workspace.onDidSaveTextDocument(doc => {
				if (vscode.window.activeTextEditor?.document === doc) {
					this.update(vscode.window.activeTextEditor);
				}
			}));

			// Update when the document's in-memory content changes; size on disk may not reflect edits,
			// but updating keeps the entry in sync with active editor visibility.
			this._disposables.push(vscode.workspace.onDidChangeTextDocument(e => {
				if (vscode.window.activeTextEditor?.document === e.document) {
					this.update(vscode.window.activeTextEditor);
				}
			}));

			this.update(vscode.window.activeTextEditor);
		}

		public dispose(): void {
			for (const d of this._disposables) { d.dispose(); }
			this._entry.hide(this);
		}

		private async update(editor: vscode.TextEditor | undefined): Promise<void> {
			if (!editor) {
				this._entry.hide(this);
				return;
			}

			const doc = editor.document;

			// For untitled, or modified but unsaved editors,
			// compute the in-memory UTF-8 byte length.
			if (doc.isUntitled || doc.isDirty) {
				// Use Buffer.byteLength to get the UTF-8
				// byte size of the document text.
				const text = doc.getText();
				const size = Buffer.byteLength(text, 'utf8');
				this._entry.show(this, size);
				return;
			}

			try {
				const stat = await vscode.workspace.fs.stat(doc.uri);
				this._entry.show(this, stat.size);
			} catch {
				// Could not stat resource (remote/unavailable) - hide the entry
				this._entry.hide(this);
			}
		}
	}

	const textEditorBinarySizeController = new TextEditorBinarySizeController(binarySizeStatusBarEntry);
	context.subscriptions.push(textEditorBinarySizeController);
	context.subscriptions.push(registerImagePreviewSupport(context, binarySizeStatusBarEntry));
	context.subscriptions.push(registerAudioPreviewSupport(context, binarySizeStatusBarEntry));
	context.subscriptions.push(registerVideoPreviewSupport(context, binarySizeStatusBarEntry));
}
