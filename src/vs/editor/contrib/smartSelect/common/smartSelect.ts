/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommonCodeEditor, IEditorContribution } from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { editorAction, ServicesAccessor, IActionOptions, EditorAction, commonEditorContribution } from 'vs/editor/common/editorCommonExtensions';
import { TokenSelectionSupport, ILogicalSelectionEntry } from './tokenSelectionSupport';
import { ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';

// --- selection state machine

class State {

	public editor: ICommonCodeEditor;
	public next: State;
	public previous: State;
	public selection: Range;

	constructor(editor: ICommonCodeEditor) {
		this.editor = editor;
		this.next = null;
		this.previous = null;
		this.selection = editor.getSelection();
	}
}

// --- shared state between grow and shrink actions
var state: State = null;
var ignoreSelection = false;

// -- action implementation

@commonEditorContribution
class SmartSelectController implements IEditorContribution {

	private static ID = 'editor.contrib.smartSelectController';

	public static get(editor: ICommonCodeEditor): SmartSelectController {
		return editor.getContribution<SmartSelectController>(SmartSelectController.ID);
	}

	private _tokenSelectionSupport: TokenSelectionSupport;

	constructor(
		private editor: ICommonCodeEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this._tokenSelectionSupport = instantiationService.createInstance(TokenSelectionSupport);
	}

	public dispose(): void {
	}

	public getId(): string {
		return SmartSelectController.ID;
	}

	public run(forward: boolean): TPromise<void> {

		var selection = this.editor.getSelection();
		var model = this.editor.getModel();

		// forget about current state
		if (state) {
			if (state.editor !== this.editor) {
				state = null;
			}
		}

		var promise: TPromise<void> = TPromise.as(null);
		if (!state) {
			promise = this._tokenSelectionSupport.getRangesToPosition(model.uri, selection.getStartPosition()).then((elements: ILogicalSelectionEntry[]) => {

				if (arrays.isFalsyOrEmpty(elements)) {
					return;
				}

				var lastState: State;
				elements.filter((element) => {
					// filter ranges inside the selection
					var selection = this.editor.getSelection();
					var range = new Range(element.range.startLineNumber, element.range.startColumn, element.range.endLineNumber, element.range.endColumn);
					return range.containsPosition(selection.getStartPosition()) && range.containsPosition(selection.getEndPosition());

				}).forEach((element) => {
					// create ranges
					var range = element.range;
					var state = new State(this.editor);
					state.selection = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
					if (lastState) {
						state.next = lastState;
						lastState.previous = state;
					}
					lastState = state;
				});

				// insert current selection
				var editorState = new State(this.editor);
				editorState.next = lastState;
				if (lastState) {
					lastState.previous = editorState;
				}
				state = editorState;

				// listen to caret move and forget about state
				var unhook = this.editor.onDidChangeCursorPosition((e: ICursorPositionChangedEvent) => {
					if (ignoreSelection) {
						return;
					}
					state = null;
					unhook.dispose();
				});
			});
		}

		return promise.then(() => {

			if (!state) {
				return;
			}

			state = forward ? state.next : state.previous;
			if (!state) {
				return;
			}

			ignoreSelection = true;
			try {
				this.editor.setSelection(state.selection);
			} finally {
				ignoreSelection = false;
			}

			return;
		});
	}
}

abstract class AbstractSmartSelect extends EditorAction {

	private _forward: boolean;

	constructor(forward: boolean, opts: IActionOptions) {
		super(opts);
		this._forward = forward;
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {
		let controller = SmartSelectController.get(editor);
		if (controller) {
			return controller.run(this._forward);
		}
		return undefined;
	}
}


@editorAction
class GrowSelectionAction extends AbstractSmartSelect {
	constructor() {
		super(true, {
			id: 'editor.action.smartSelect.grow',
			label: nls.localize('smartSelect.grow', "Expand Selection"),
			alias: 'Expand Selection',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.RightArrow,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyMod.Shift | KeyCode.RightArrow }
			}
		});
	}
}

@editorAction
class ShrinkSelectionAction extends AbstractSmartSelect {
	constructor() {
		super(false, {
			id: 'editor.action.smartSelect.shrink',
			label: nls.localize('smartSelect.shrink', "Shrink Selection"),
			alias: 'Shrink Selection',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.LeftArrow,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyMod.Shift | KeyCode.LeftArrow }
			}
		});
	}
}

@editorAction
class SelectBracketAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.expandSelectionToBrackets',
			label: nls.localize('smartSelect.expandSelectionToBrackets', "Expand Selection To Brackets"),
			alias: 'Expand Selection To Brackets',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_SLASH
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		const model = editor.getModel();
		if (!model) {
			return;
		}

		const selection = editor.getSelection();
		if (!selection.isEmpty()) {
			return;
		}

		const originalPosition = selection.getStartPosition();

		// find previous open bracket with no match
		let prevBracket = null;
		let currentPosition = new Position(originalPosition.lineNumber, originalPosition.column);
		let setCount = 0;
		do {
			prevBracket = model.findPrevBracket(currentPosition);
			if (prevBracket) {
				currentPosition = new Position(prevBracket.range.startLineNumber, prevBracket.range.startColumn);
				!prevBracket.isOpen ? setCount++ : setCount--;
			}
		} while (prevBracket && !(prevBracket.isOpen && setCount < 0));

		// find next closed bracket with no match
		let nextBracket = null;
		currentPosition = new Position(originalPosition.lineNumber, originalPosition.column);
		setCount = 0;
		do {
			nextBracket = model.findNextBracket(currentPosition);
			if (nextBracket) {
				currentPosition = new Position(nextBracket.range.endLineNumber, nextBracket.range.endColumn);
				nextBracket.isOpen ? setCount++ : setCount--;
			}
		} while (nextBracket && (nextBracket.isOpen && setCount < 0));

		// check validity of prev and next brackets
		if (!prevBracket && !nextBracket) {
			return;
		}

		// pick the outermost set of brackets
		const matchPrev = prevBracket ? model.matchBracket(new Position(prevBracket.range.startLineNumber, prevBracket.range.startColumn)) : null;
		const matchNext = nextBracket ? model.matchBracket(new Position(nextBracket.range.startLineNumber, nextBracket.range.startColumn)) : null;
		let bracketsToSelect = null;
		if (!matchPrev) {
			bracketsToSelect = matchNext;
		} else if (!matchNext) {
			bracketsToSelect = matchPrev;
		} else if (!new Position(matchPrev[1].endLineNumber, matchPrev[1].endColumn)
			.isBefore(new Position(matchNext[0].endLineNumber, matchNext[0].endColumn))) {
				bracketsToSelect = matchPrev;
		} else {
			bracketsToSelect = matchNext;
		}

		// select the brackets
		editor.setSelection(new Range(
			bracketsToSelect[0].endLineNumber,
			bracketsToSelect[0].endColumn,
			bracketsToSelect[1].startLineNumber,
			bracketsToSelect[1].startColumn));
	}
}
