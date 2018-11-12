/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { registerEditorAction, ServicesAccessor, IActionOptions, EditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { TokenSelectionSupport, ILogicalSelectionEntry } from './tokenSelectionSupport';
import { ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { MenuId } from 'vs/platform/actions/common/actions';

// --- selection state machine

class State {

	public editor: ICodeEditor;
	public next: State;
	public previous: State;
	public selection: Range;

	constructor(editor: ICodeEditor) {
		this.editor = editor;
		this.next = null;
		this.previous = null;
		this.selection = editor.getSelection();
	}
}

// -- action implementation

class SmartSelectController implements IEditorContribution {

	private static readonly ID = 'editor.contrib.smartSelectController';

	public static get(editor: ICodeEditor): SmartSelectController {
		return editor.getContribution<SmartSelectController>(SmartSelectController.ID);
	}

	private _tokenSelectionSupport: TokenSelectionSupport;
	private _state: State;
	private _ignoreSelection: boolean;

	constructor(
		private editor: ICodeEditor,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		this._tokenSelectionSupport = instantiationService.createInstance(TokenSelectionSupport);
		this._state = null;
		this._ignoreSelection = false;
	}

	public dispose(): void {
	}

	public getId(): string {
		return SmartSelectController.ID;
	}

	public run(forward: boolean): Promise<void> {

		const selection = this.editor.getSelection();
		const model = this.editor.getModel();

		// forget about current state
		if (this._state) {
			if (this._state.editor !== this.editor) {
				this._state = null;
			}
		}

		let promise: Promise<void> = Promise.resolve(null);
		if (!this._state) {
			promise = Promise.resolve(this._tokenSelectionSupport.getRangesToPositionSync(model.uri, selection.getStartPosition())).then((elements: ILogicalSelectionEntry[]) => {

				if (arrays.isFalsyOrEmpty(elements)) {
					return;
				}

				let lastState: State;
				elements.filter((element) => {
					// filter ranges inside the selection
					const selection = this.editor.getSelection();
					const range = new Range(element.range.startLineNumber, element.range.startColumn, element.range.endLineNumber, element.range.endColumn);
					return range.containsPosition(selection.getStartPosition()) && range.containsPosition(selection.getEndPosition());

				}).forEach((element) => {
					// create ranges
					const range = element.range;
					const state = new State(this.editor);
					state.selection = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
					if (lastState) {
						state.next = lastState;
						lastState.previous = state;
					}
					lastState = state;
				});

				// insert current selection
				const editorState = new State(this.editor);
				editorState.next = lastState;
				if (lastState) {
					lastState.previous = editorState;
				}
				this._state = editorState;

				// listen to caret move and forget about state
				const unhook = this.editor.onDidChangeCursorPosition((e: ICursorPositionChangedEvent) => {
					if (this._ignoreSelection) {
						return;
					}
					this._state = null;
					unhook.dispose();
				});
			});
		}

		return promise.then(() => {

			if (!this._state) {
				return;
			}

			this._state = forward ? this._state.next : this._state.previous;
			if (!this._state) {
				return;
			}

			this._ignoreSelection = true;
			try {
				this.editor.setSelection(this._state.selection);
			} finally {
				this._ignoreSelection = false;
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

	public run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		let controller = SmartSelectController.get(editor);
		if (controller) {
			return controller.run(this._forward);
		}
		return undefined;
	}
}

class GrowSelectionAction extends AbstractSmartSelect {
	constructor() {
		super(true, {
			id: 'editor.action.smartSelect.grow',
			label: nls.localize('smartSelect.grow', "Expand Select"),
			alias: 'Expand Select',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.RightArrow,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyMod.Shift | KeyCode.RightArrow },
				weight: KeybindingWeight.EditorContrib
			},
			menubarOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '1_basic',
				title: nls.localize({ key: 'miSmartSelectGrow', comment: ['&& denotes a mnemonic'] }, "&&Expand Selection"),
				order: 2
			}
		});
	}
}

class ShrinkSelectionAction extends AbstractSmartSelect {
	constructor() {
		super(false, {
			id: 'editor.action.smartSelect.shrink',
			label: nls.localize('smartSelect.shrink', "Shrink Select"),
			alias: 'Shrink Select',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.LeftArrow,
				mac: { primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyMod.Shift | KeyCode.LeftArrow },
				weight: KeybindingWeight.EditorContrib
			},
			menubarOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '1_basic',
				title: nls.localize({ key: 'miSmartSelectShrink', comment: ['&& denotes a mnemonic'] }, "&&Shrink Selection"),
				order: 3
			}
		});
	}
}

registerEditorContribution(SmartSelectController);
registerEditorAction(GrowSelectionAction);
registerEditorAction(ShrinkSelectionAction);
