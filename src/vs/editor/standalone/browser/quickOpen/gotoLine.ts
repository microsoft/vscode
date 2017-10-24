/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./gotoLine';
import * as nls from 'vs/nls';
import { IContext, QuickOpenEntry, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IAutoFocus, Mode } from 'vs/base/parts/quickopen/common/quickOpen';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { BaseEditorQuickOpenAction, IDecorator } from './editorQuickOpen';
import { editorAction, ServicesAccessor } from 'vs/editor/common/editorCommonExtensions';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

interface ParseResult {
	position: Position;
	isValid: boolean;
	label: string;
}

export class GotoLineEntry extends QuickOpenEntry {

	private _parseResult: ParseResult;
	private decorator: IDecorator;
	private editor: editorCommon.IEditor;

	constructor(line: string, editor: editorCommon.IEditor, decorator: IDecorator) {
		super();

		this.editor = editor;
		this.decorator = decorator;
		this._parseResult = this._parseInput(line);
	}


	private _parseInput(line: string): ParseResult {

		let numbers = line.split(',').map(part => parseInt(part, 10)).filter(part => !isNaN(part)),
			position: Position;

		if (numbers.length === 0) {
			position = new Position(-1, -1);
		} else if (numbers.length === 1) {
			position = new Position(numbers[0], 1);
		} else {
			position = new Position(numbers[0], numbers[1]);
		}

		let model: editorCommon.IModel;
		if (editorCommon.isCommonCodeEditor(this.editor)) {
			model = this.editor.getModel();
		} else {
			model = (<IDiffEditor>this.editor).getModel().modified;
		}

		let isValid = model.validatePosition(position).equals(position),
			label: string;

		if (isValid) {
			if (position.column && position.column > 1) {
				label = nls.localize('gotoLineLabelValidLineAndColumn', "Go to line {0} and character {1}", position.lineNumber, position.column);
			} else {
				label = nls.localize('gotoLineLabelValidLine', "Go to line {0}", position.lineNumber, position.column);
			}
		} else if (position.lineNumber < 1 || position.lineNumber > model.getLineCount()) {
			label = nls.localize('gotoLineLabelEmptyWithLineLimit', "Type a line number between 1 and {0} to navigate to", model.getLineCount());
		} else {
			label = nls.localize('gotoLineLabelEmptyWithLineAndColumnLimit', "Type a character between 1 and {0} to navigate to", model.getLineMaxColumn(position.lineNumber));
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

	public getAriaLabel(): string {
		return nls.localize('gotoLineAriaLabel', "Go to line {0}", this._parseResult.label);
	}

	public run(mode: Mode, context: IContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen();
		}

		return this.runPreview();
	}

	public runOpen(): boolean {

		// No-op if range is not valid
		if (!this._parseResult.isValid) {
			return false;
		}

		// Apply selection and focus
		let range = this.toSelection();
		(<ICodeEditor>this.editor).setSelection(range);
		(<ICodeEditor>this.editor).revealRangeInCenter(range, editorCommon.ScrollType.Smooth);
		this.editor.focus();

		return true;
	}

	public runPreview(): boolean {

		// No-op if range is not valid
		if (!this._parseResult.isValid) {
			this.decorator.clearDecorations();
			return false;
		}

		// Select Line Position
		let range = this.toSelection();
		this.editor.revealRangeInCenter(range, editorCommon.ScrollType.Smooth);

		// Decorate if possible
		this.decorator.decorateLine(range, this.editor);

		return false;
	}

	private toSelection(): Range {
		return new Range(
			this._parseResult.position.lineNumber,
			this._parseResult.position.column,
			this._parseResult.position.lineNumber,
			this._parseResult.position.column
		);
	}
}

@editorAction
export class GotoLineAction extends BaseEditorQuickOpenAction {

	constructor() {
		super(nls.localize('gotoLineActionInput', "Type a line number, followed by an optional colon and a character number to navigate to"), {
			id: 'editor.action.gotoLine',
			label: nls.localize('GotoLineAction.label', "Go to Line..."),
			alias: 'Go to Line...',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_G,
				mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_G }
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		this._show(this.getController(editor), {
			getModel: (value: string): QuickOpenModel => {
				return new QuickOpenModel([new GotoLineEntry(value, editor, this.getController(editor))]);
			},

			getAutoFocus: (searchValue: string): IAutoFocus => {
				return {
					autoFocusFirstEntry: searchValue.length > 0
				};
			}
		});
	}
}
