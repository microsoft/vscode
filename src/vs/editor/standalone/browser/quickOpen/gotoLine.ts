/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./gotoLine';
import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { QuickOpenEntry, QuickOpenModel } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { IAutoFocus, Mode, IEntryRunContext } from 'vs/base/parts/quickopen/common/quickOpen';
import { ICodeEditor, IDiffEditor, isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ITextModel } from 'vs/editor/common/model';
import { BaseEditorQuickOpenAction, IDecorator } from 'vs/editor/standalone/browser/quickOpen/editorQuickOpen';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

interface ParseResult {
	position: Position;
	isValid: boolean;
	label: string;
}

export class GotoLineEntry extends QuickOpenEntry {
	private parseResult: ParseResult;
	private decorator: IDecorator;
	private editor: editorCommon.IEditor;

	constructor(line: string, editor: editorCommon.IEditor, decorator: IDecorator) {
		super();

		this.editor = editor;
		this.decorator = decorator;
		this.parseResult = this.parseInput(line);
	}

	private parseInput(line: string): ParseResult {
		const numbers = line.split(',').map(part => parseInt(part, 10)).filter(part => !isNaN(part));
		let position: Position;

		if (numbers.length === 0) {
			position = new Position(-1, -1);
		} else if (numbers.length === 1) {
			position = new Position(numbers[0], 1);
		} else {
			position = new Position(numbers[0], numbers[1]);
		}

		let model: ITextModel | null;
		if (isCodeEditor(this.editor)) {
			model = this.editor.getModel();
		} else {
			const diffModel = (<IDiffEditor>this.editor).getModel();
			model = diffModel ? diffModel.modified : null;
		}

		const isValid = model ? model.validatePosition(position).equals(position) : false;
		let label: string;

		if (isValid) {
			if (position.column && position.column > 1) {
				label = nls.localize('gotoLineLabelValidLineAndColumn', "Go to line {0} and character {1}", position.lineNumber, position.column);
			} else {
				label = nls.localize('gotoLineLabelValidLine', "Go to line {0}", position.lineNumber, position.column);
			}
		} else if (position.lineNumber < 1 || position.lineNumber > (model ? model.getLineCount() : 0)) {
			label = nls.localize('gotoLineLabelEmptyWithLineLimit', "Type a line number between 1 and {0} to navigate to", model ? model.getLineCount() : 0);
		} else {
			label = nls.localize('gotoLineLabelEmptyWithLineAndColumnLimit', "Type a character between 1 and {0} to navigate to", model ? model.getLineMaxColumn(position.lineNumber) : 0);
		}

		return {
			position: position,
			isValid: isValid,
			label: label
		};
	}

	getLabel(): string {
		return this.parseResult.label;
	}

	getAriaLabel(): string {
		const position = this.editor.getPosition();
		const currentLine = position ? position.lineNumber : 0;
		return nls.localize('gotoLineAriaLabel', "Current Line: {0}. Go to line {0}.", currentLine, this.parseResult.label);
	}

	run(mode: Mode, _context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			return this.runOpen();
		}

		return this.runPreview();
	}

	runOpen(): boolean {

		// No-op if range is not valid
		if (!this.parseResult.isValid) {
			return false;
		}

		// Apply selection and focus
		const range = this.toSelection();
		(<ICodeEditor>this.editor).setSelection(range);
		(<ICodeEditor>this.editor).revealRangeInCenter(range, editorCommon.ScrollType.Smooth);
		this.editor.focus();

		return true;
	}

	runPreview(): boolean {

		// No-op if range is not valid
		if (!this.parseResult.isValid) {
			this.decorator.clearDecorations();
			return false;
		}

		// Select Line Position
		const range = this.toSelection();
		this.editor.revealRangeInCenter(range, editorCommon.ScrollType.Smooth);

		// Decorate if possible
		this.decorator.decorateLine(range, this.editor);

		return false;
	}

	private toSelection(): Range {
		return new Range(
			this.parseResult.position.lineNumber,
			this.parseResult.position.column,
			this.parseResult.position.lineNumber,
			this.parseResult.position.column
		);
	}
}

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
				mac: { primary: KeyMod.WinCtrl | KeyCode.KEY_G },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): void {
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

registerEditorAction(GotoLineAction);
