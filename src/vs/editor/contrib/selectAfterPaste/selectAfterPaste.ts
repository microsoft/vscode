/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IEditorContribution, ICommand, ICursorStateComputerData, IEditOperationBuilder } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { TextEdit } from 'vs/editor/common/modes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

export class SelectAfterPasteCommand implements ICommand {

	private _edits: TextEdit[];

	private _initialSelection: Selection;
	private _selectionId: string;

	constructor(edits: TextEdit[], initialSelection: Selection) {
		this._initialSelection = initialSelection;
		this._edits = [];

		for (let edit of edits) {
			if (edit.range && typeof edit.text === 'string') {
				this._edits.push(edit);
			}
		}
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		for (let edit of this._edits) {
			builder.addEditOperation(Range.lift(edit.range), edit.text);
		}

		let selectionIsSet = false;
		if (Array.isArray(this._edits) && this._edits.length === 1 && this._initialSelection.isEmpty()) {
			if (this._edits[0].range.startColumn === this._initialSelection.endColumn &&
				this._edits[0].range.startLineNumber === this._initialSelection.endLineNumber) {
				selectionIsSet = true;
				this._selectionId = builder.trackSelection(this._initialSelection, true);
			} else if (this._edits[0].range.endColumn === this._initialSelection.startColumn &&
				this._edits[0].range.endLineNumber === this._initialSelection.startLineNumber) {
				selectionIsSet = true;
				this._selectionId = builder.trackSelection(this._initialSelection, false);
			}
		}

		if (!selectionIsSet) {
			this._selectionId = builder.trackSelection(this._initialSelection);
		}
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		return helper.getTrackedSelection(this._selectionId);
	}
}

export class SelectAfterPaste implements IEditorContribution {
	private static readonly ID = 'editor.contrib.selectAfterPaste';

	private editor: ICodeEditor;
	private callOnDispose: IDisposable[];
	private callOnModel: IDisposable[];

	constructor(editor: ICodeEditor) {
		this.editor = editor;
		this.callOnDispose = [];
		this.callOnModel = [];

		this.callOnDispose.push(editor.onDidChangeConfiguration(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModel(() => this.update()));
		this.callOnDispose.push(editor.onDidChangeModelLanguage(() => this.update()));
	}

	private update(): void {

		// clean up
		this.callOnModel = dispose(this.callOnModel);

		// we are disabled
		if (!this.editor.getConfiguration().contribInfo.selectAfterPaste) {
			return;
		}

		// no model
		if (!this.editor.getModel()) {
			return;
		}

		this.callOnModel.push(this.editor.onDidPaste((range: Range) => {
			this.trigger(range);
		}));
	}

	private trigger(range: Range): void {
		if (this.editor.getSelections().length > 1) {
			return;
		}

		let textEdits: TextEdit[] = [];

		const model = this.editor.getModel();
		if (!model.isCheapToTokenize(range.getStartPosition().lineNumber)) {
			return;
		}

		this.editor.setSelection(range);

		let cmd = new SelectAfterPasteCommand(textEdits, this.editor.getSelection());
		this.editor.executeCommand('selectAfterPaste', cmd);
		this.editor.pushUndoStop();
	}

	public getId(): string {
		return SelectAfterPaste.ID;
	}

	public dispose(): void {
		this.callOnDispose = dispose(this.callOnDispose);
		this.callOnModel = dispose(this.callOnModel);
	}
}

registerEditorContribution(SelectAfterPaste);