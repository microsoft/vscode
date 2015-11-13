/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gotoLine';
import nls = require('vs/nls');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import QuickOpenWidget = require('vs/base/parts/quickopen/browser/quickOpenWidget');
import QuickOpenModel = require('vs/base/parts/quickopen/browser/quickOpenModel');
import QuickOpen = require('vs/base/parts/quickopen/browser/quickOpen');
import EditorQuickOpen = require('./editorQuickOpen');
import {INullService} from 'vs/platform/instantiation/common/instantiation';

interface ParseResult {
	position: EditorCommon.IPosition;
	isValid: boolean;
	label: string;
}

export class GotoLineEntry extends QuickOpenModel.QuickOpenEntry {

	private _parseResult:ParseResult;
	private decorator:EditorQuickOpen.IDecorator;
	private editor:EditorCommon.IEditor;

	constructor(line:string, editor:EditorCommon.IEditor, decorator:EditorQuickOpen.IDecorator) {
		super();

		this.editor = editor;
		this.decorator = decorator;
		this._parseResult = this._parseInput(line);
	}


	private _parseInput(line:string):ParseResult {

		var numbers = line.split(',').map(part => parseInt(part, 10)).filter(part => !isNaN(part)),
			position: EditorCommon.IPosition;

		if(numbers.length === 0) {
			position = { lineNumber: -1, column: -1 };
		} else if(numbers.length === 1) {
			position = { lineNumber: numbers[0], column: 1 };
		} else {
			position = { lineNumber: numbers[0], column: numbers[1] };
		}

		var editorType = (<EditorBrowser.ICodeEditor> this.editor).getEditorType(),
			model:EditorCommon.IModel;

		switch(editorType) {
			case EditorCommon.EditorType.IDiffEditor:
				model = (<EditorBrowser.IDiffEditor> this.editor).getModel().modified;
				break;

			case EditorCommon.EditorType.ICodeEditor:
				model = (<EditorBrowser.ICodeEditor> this.editor).getModel();
				break;

			default:
				throw new Error();
		}

		var isValid = model.validatePosition(position).equals(position),
			label:string;

		if (isValid) {
			if (position.column && position.column > 1) {
				label = nls.localize('gotoLineLabelValidLineAndColumn', "Go to line {0} and column {1}", position.lineNumber, position.column);
			} else {
				label = nls.localize('gotoLineLabelValidLine', "Go to line {0}", position.lineNumber, position.column);
			}
		} else if(position.lineNumber < 1 || position.lineNumber > model.getLineCount()) {
			label = nls.localize('gotoLineLabelEmptyWithLineLimit', "Type a line number between 1 and {0} to navigate to", model.getLineCount());
		} else {
			label = nls.localize('gotoLineLabelEmptyWithLineAndColumnLimit', "Type a column between 1 and {0} to navigate to", model.getLineMaxColumn(position.lineNumber));
		}

		return {
			position: position,
			isValid: isValid,
			label: label
		};
	}

	public getLabel(): string {
		return this._parseResult.label;
	}

	public run(mode:QuickOpen.Mode, context:QuickOpenModel.IContext):boolean {
		if (mode === QuickOpen.Mode.OPEN) {
			return this.runOpen();
		}

		return this.runPreview();
	}

	public runOpen():boolean {

		// No-op if range is not valid
		if (!this._parseResult.isValid) {
			return false;
		}

		// Apply selection and focus
		var range = this.toSelection();
		(<EditorBrowser.ICodeEditor>this.editor).setSelection(range);
		(<EditorBrowser.ICodeEditor>this.editor).revealRangeInCenter(range);
		this.editor.focus();

		return true;
	}

	public runPreview():boolean{

		// No-op if range is not valid
		if (!this._parseResult.isValid) {
			this.decorator.clearDecorations();
			return false;
		}

		// Select Line Position
		var range = this.toSelection();
		this.editor.revealRangeInCenter(range);

		// Decorate if possible
		this.decorator.decorateLine(range, this.editor);

		return false;
	}

	private toSelection():EditorCommon.IRange {
		return {
			startLineNumber: this._parseResult.position.lineNumber,
			startColumn: this._parseResult.position.column,
			endLineNumber: this._parseResult.position.lineNumber,
			endColumn: this._parseResult.position.column
		};
	}
}

export class GotoLineAction extends EditorQuickOpen.BaseEditorQuickOpenAction {

	public static ID = 'editor.action.gotoLine';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, nls.localize('GotoLineAction.label', "Go to Line..."));
	}

	_getModel(value:string):QuickOpenModel.QuickOpenModel {
		var model = new QuickOpenModel.QuickOpenModel();
		var entries = [new GotoLineEntry(value, this.editor, this)];
		model.addEntries(entries);

		return model;
	}

	_getAutoFocus(searchValue:string):QuickOpen.IAutoFocus {
		return {
			autoFocusFirstEntry: searchValue.length > 0
		};
	}

	_getInputAriaLabel(): string {
		return nls.localize('gotoLineActionInput', "Type a line number, followed by an optional colon and a column number to navigate to");
	}
}