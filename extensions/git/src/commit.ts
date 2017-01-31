/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { workspace, window, languages, Disposable, Uri, TextDocumentChangeEvent, HoverProvider, Hover, TextEditor, Position, TextDocument, Range, TextEditorDecorationType } from 'vscode';
import { Model } from './model';
import { filterEvent } from './util';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

function isSCMInput(uri: Uri) {
	return uri.toString() === 'scm:input';
}

interface Diagnostic {
	range: Range;
	message: string;
}

// TODO@Joao: hover dissapears if editor is scrolled
export class CommitHandler implements HoverProvider {

	private visibleTextEditorsDisposable: Disposable;
	private editor: TextEditor;
	private diagnostics: Diagnostic[] = [];
	private decorationType: TextEditorDecorationType;
	private disposables: Disposable[] = [];

	constructor(private model: Model) {
		this.visibleTextEditorsDisposable = window.onDidChangeVisibleTextEditors(this.onVisibleTextEditors, this);
		this.onVisibleTextEditors(window.visibleTextEditors);

		this.decorationType = window.createTextEditorDecorationType({
			isWholeLine: true,
			color: 'rgb(228, 157, 43)',
			dark: {
				color: 'rgb(220, 211, 71)'
			}
		});
	}

	private onVisibleTextEditors(editors: TextEditor[]): void {
		const [editor] = editors.filter(e => isSCMInput(e.document.uri));

		if (!editor) {
			return;
		}

		this.visibleTextEditorsDisposable.dispose();
		this.editor = editor;

		const onDidChange = filterEvent(workspace.onDidChangeTextDocument, e => e.document && isSCMInput(e.document.uri));
		onDidChange(this.onSCMInputChange, this, this.disposables);

		languages.registerHoverProvider({ scheme: 'scm' }, this);
	}

	private onSCMInputChange(e: TextDocumentChangeEvent): void {
		this.diagnostics = [];

		const range = e.document.lineAt(0).range;
		const length = range.end.character - range.start.character;

		if (length > 80) {
			const message = localize('too long', "You should keep the first line under 50 characters.\n\nYou can use more lines for extra information.");
			this.diagnostics.push({ range, message });
		}

		this.editor.setDecorations(this.decorationType, this.diagnostics.map(d => d.range));
	}

	provideHover(document: TextDocument, position: Position): Hover | undefined {
		const [decoration] = this.diagnostics.filter(d => d.range.contains(position));

		if (!decoration) {
			return;
		}

		return new Hover(decoration.message, decoration.range);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}
