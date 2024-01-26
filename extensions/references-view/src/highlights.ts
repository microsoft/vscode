/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SymbolItemEditorHighlights } from './references-view';

export class EditorHighlights<T> {

	private readonly _decorationType = vscode.window.createTextEditorDecorationType({
		backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
		rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
		overviewRulerLane: vscode.OverviewRulerLane.Center,
		overviewRulerColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
	});

	private readonly disposables: vscode.Disposable[] = [];
	private readonly _ignore = new Set<string>();

	constructor(private readonly _view: vscode.TreeView<T>, private readonly _delegate: SymbolItemEditorHighlights<T>) {
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument(e => this._ignore.add(e.document.uri.toString())),
			vscode.window.onDidChangeActiveTextEditor(() => _view.visible && this.update()),
			_view.onDidChangeVisibility(e => e.visible ? this._show() : this._hide()),
			_view.onDidChangeSelection(() => {
				if (_view.visible) {
					this.update();
				}
			})
		);
		this._show();
	}

	dispose() {
		vscode.Disposable.from(...this.disposables).dispose();
		for (const editor of vscode.window.visibleTextEditors) {
			editor.setDecorations(this._decorationType, []);
		}
	}

	private _show(): void {
		const { activeTextEditor: editor } = vscode.window;
		if (!editor || !editor.viewColumn) {
			return;
		}
		if (this._ignore.has(editor.document.uri.toString())) {
			return;
		}
		const [anchor] = this._view.selection;
		if (!anchor) {
			return;
		}
		const ranges = this._delegate.getEditorHighlights(anchor, editor.document.uri);
		if (ranges) {
			editor.setDecorations(this._decorationType, ranges);
		}
	}

	private _hide(): void {
		for (const editor of vscode.window.visibleTextEditors) {
			editor.setDecorations(this._decorationType, []);
		}
	}

	update(): void {
		this._hide();
		this._show();
	}
}
