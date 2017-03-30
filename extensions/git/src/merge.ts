/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { window, workspace, Disposable, TextEditor, TextDocument, Range } from 'vscode';
import { Model, Status } from './model';
import { filterEvent } from './util';
import { debounce } from './decorators';
import { iterate } from './iterators';

function* lines(document: TextDocument): IterableIterator<string> {
	for (let i = 0; i < document.lineCount; i++) {
		yield document.lineAt(i).text;
	}
}

const pattern = /^<<<<<<<|^=======|^>>>>>>>/;

function decorate(document: TextDocument): Range[] {
	return iterate(lines(document))
		.map((line, i) => pattern.test(line) ? i : null)
		.filter(i => i !== null)
		.map((i: number) => new Range(i, 1, i, 1))
		.toArray();
}

class TextEditorMergeDecorator {

	private static DecorationType = window.createTextEditorDecorationType({
		backgroundColor: 'rgba(255, 139, 0, 0.3)',
		isWholeLine: true,
		dark: {
			backgroundColor: 'rgba(235, 59, 0, 0.3)'
		}
	});

	private uri: string;
	private disposables: Disposable[] = [];

	constructor(
		private model: Model,
		private editor: TextEditor
	) {
		this.uri = this.editor.document.uri.toString();

		const onDidChange = filterEvent(workspace.onDidChangeTextDocument, e => e.document && e.document.uri.toString() === this.uri);
		onDidChange(this.redecorate, this, this.disposables);
		model.onDidChange(this.redecorate, this, this.disposables);

		this.redecorate();
	}

	@debounce(300)
	private redecorate(): void {
		let decorations: Range[] = [];

		if (window.visibleTextEditors.every(e => e !== this.editor)) {
			this.dispose();
			return;
		}

		if (this.model.mergeGroup.resources.some(r => r.type === Status.BOTH_MODIFIED && r.resourceUri.toString() === this.uri)) {
			decorations = decorate(this.editor.document);
		}

		this.editor.setDecorations(TextEditorMergeDecorator.DecorationType, decorations);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

export class MergeDecorator {

	private textEditorDecorators: TextEditorMergeDecorator[] = [];
	private disposables: Disposable[] = [];

	constructor(private model: Model) {
		window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors, this, this.disposables);
		this.onDidChangeVisibleTextEditors(window.visibleTextEditors);
	}

	private onDidChangeVisibleTextEditors(editors: TextEditor[]): void {
		this.textEditorDecorators.forEach(d => d.dispose());
		this.textEditorDecorators = editors.map(e => new TextEditorMergeDecorator(this.model, e));
	}

	dispose(): void {
		this.textEditorDecorators.forEach(d => d.dispose());
		this.disposables.forEach(d => d.dispose());
	}
}
