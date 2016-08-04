/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import {KeyCode, KeyMod} from 'vs/base/common/keyCodes';
import {TPromise} from 'vs/base/common/winjs.base';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {Range} from 'vs/editor/common/core/range';
import {ICommonCodeEditor, ICursorPositionChangedEvent, IEditorContribution} from 'vs/editor/common/editorCommon';
import {ServicesAccessor, EditorKbExpr, EditorAction2, CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {TokenSelectionSupport, ILogicalSelectionEntry} from './tokenSelectionSupport';

// --- selection state machine

class State {

	public editor:ICommonCodeEditor;
	public next:State;
	public previous:State;
	public selection:Range;

	constructor(editor:ICommonCodeEditor) {
		this.editor = editor;
		this.next = null;
		this.previous = null;
		this.selection = editor.getSelection();
	}
}

// --- shared state between grow and shrink actions
var state:State = null;
var ignoreSelection = false;

// -- action implementation

class SmartSelectController implements IEditorContribution {

	private static ID = 'editor.contrib.smartSelectController';

	public static get(editor:ICommonCodeEditor): SmartSelectController {
		return <SmartSelectController>editor.getContribution(SmartSelectController.ID);
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

	public run(forward:boolean): TPromise<void> {

		var selection = this.editor.getSelection();
		var model = this.editor.getModel();

		// forget about current state
		if (state) {
			if (state.editor !== this.editor) {
				state = null;
			}
		}

		var promise:TPromise<void> = TPromise.as(null);
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

abstract class AbstractSmartSelect extends EditorAction2 {

	private _forward: boolean;

	constructor(id:string, label:string, alias:string, forward: boolean) {
		super(id, label, alias, false);
		this._forward = forward;
	}

	public run(accessor:ServicesAccessor, editor:ICommonCodeEditor): TPromise<void> {
		return SmartSelectController.get(editor).run(this._forward);
	}
}

class GrowSelectionAction extends AbstractSmartSelect {
	constructor() {
		super(
			'editor.action.smartSelect.grow',
			nls.localize('smartSelect.grow', "Expand Select"),
			'Expand Select',
			true
		);

		this.kbOpts = {
			kbExpr: EditorKbExpr.TextFocus,
			primary: KeyMod.Shift | KeyMod.Alt | KeyCode.RightArrow,
			mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyMod.Shift | KeyCode.RightArrow }
		};
	}
}

class ShrinkSelectionAction extends AbstractSmartSelect {
	constructor() {
		super(
			'editor.action.smartSelect.shrink',
			nls.localize('smartSelect.shrink', "Shrink Select"),
			'Shrink Select',
			false
		);

		this.kbOpts = {
			kbExpr: EditorKbExpr.TextFocus,
			primary: KeyMod.Shift | KeyMod.Alt | KeyCode.LeftArrow,
			mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyMod.Shift | KeyCode.LeftArrow }
		};
	}
}

// register actions
CommonEditorRegistry.registerEditorContribution(SmartSelectController);
CommonEditorRegistry.registerEditorAction2(new GrowSelectionAction());
CommonEditorRegistry.registerEditorAction2(new ShrinkSelectionAction());
