/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { derived, mapObservableArrayCached, observableFromEvent } from '../../../util/vs/base/common/observable';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';

export class ObservableVsCode {
	public static readonly instance = new ObservableVsCode();

	private readonly _visibleTextEditors = observableFromEvent(this, l => vscode.window.onDidChangeVisibleTextEditors(l), () => vscode.window.visibleTextEditors);
	public readonly visibleTextEditors = mapObservableArrayCached(this, this._visibleTextEditors, e => new ObservableTextEditor(e));
	private readonly _visibleTextEditorsMap = derived(this, reader => new Map(this.visibleTextEditors.read(reader).map(v => [v.editor, v])));

	private readonly _activeTextEditor = observableFromEvent(this, l => vscode.window.onDidChangeActiveTextEditor(l), () => vscode.window.activeTextEditor);
	public readonly activeTextEditor = derived(this, reader => {
		const editor = this._activeTextEditor.read(reader);
		if (!editor) { return undefined; }
		return this._visibleTextEditorsMap.read(reader).get(editor);
	});
}

export class ObservableTextEditor {
	public readonly selection = observableFromEvent(this, l => vscode.window.onDidChangeTextEditorSelection(l), () => this.editor.selections);

	constructor(
		public readonly editor: vscode.TextEditor,
	) { }
}

export function rangeToOffsetRange(range: vscode.Range, document: vscode.TextDocument): OffsetRange {
	const start = document.offsetAt(range.start);
	const end = document.offsetAt(range.end);
	return new OffsetRange(start, end);
}
