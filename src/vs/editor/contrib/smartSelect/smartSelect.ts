/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import { asThenable, first } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, IActionOptions, registerEditorAction, registerEditorContribution, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { ITextModel } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import { DefaultSelectionRangeProvider } from 'vs/editor/contrib/smartSelect/defaultProvider';
import * as nls from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';

// --- selection state machine

class State {

	public editor: ICodeEditor;
	public next?: State;
	public previous?: State;
	public selection: Range | null;

	constructor(editor: ICodeEditor) {
		this.editor = editor;
		this.selection = editor.getSelection();
	}
}

// -- action implementation

class SmartSelectController implements IEditorContribution {

	private static readonly ID = 'editor.contrib.smartSelectController';

	public static get(editor: ICodeEditor): SmartSelectController {
		return editor.getContribution<SmartSelectController>(SmartSelectController.ID);
	}

	private _editor: ICodeEditor;
	private _state?: State;
	private _ignoreSelection: boolean;

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._ignoreSelection = false;
	}

	dispose(): void {
	}

	getId(): string {
		return SmartSelectController.ID;
	}

	run(forward: boolean): Promise<void> | void {
		if (!this._editor.hasModel()) {
			return;
		}

		const selection = this._editor.getSelection();
		const model = this._editor.getModel();

		if (!modes.SelectionRangeRegistry.has(model)) {
			return;
		}

		// forget about current state
		if (this._state) {
			if (this._state.editor !== this._editor) {
				this._state = undefined;
			}
		}

		let promise: Promise<void> = Promise.resolve(void 0);

		if (!this._state) {
			promise = provideSelectionRanges(model, selection.getStartPosition(), CancellationToken.None).then(ranges => {
				if (!arrays.isNonEmptyArray(ranges)) {
					// invalid result
					return;
				}
				if (!this._editor.hasModel() || !this._editor.getSelection().equalsSelection(selection)) {
					// invalid editor state
					return;
				}

				let lastState: State | undefined;
				ranges.filter(range => {
					// filter ranges inside the selection
					return range.containsPosition(selection.getStartPosition()) && range.containsPosition(selection.getEndPosition());

				}).forEach(range => {
					// create ranges
					const state = new State(this._editor);
					state.selection = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
					if (lastState) {
						state.next = lastState;
						lastState.previous = state;
					}
					lastState = state;
				});

				// insert current selection
				const editorState = new State(this._editor);
				editorState.next = lastState;
				if (lastState) {
					lastState.previous = editorState;
				}
				this._state = editorState;

				// listen to caret move and forget about state
				const unhook = this._editor.onDidChangeCursorPosition((e: ICursorPositionChangedEvent) => {
					if (this._ignoreSelection) {
						return;
					}
					this._state = undefined;
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
				if (this._state.selection) {
					this._editor.setSelection(this._state.selection);
				}
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

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		let controller = SmartSelectController.get(editor);
		if (controller) {
			await controller.run(this._forward);
		}
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

export function provideSelectionRanges(model: ITextModel, position: Position, token: CancellationToken): Promise<Range[] | undefined | null> {
	const provider = modes.SelectionRangeRegistry.ordered(model);
	return first(provider.map(pro => () => asThenable(() => pro.provideSelectionRanges(model, position, token))), arrays.isNonEmptyArray);
}

modes.SelectionRangeRegistry.register('*', new DefaultSelectionRangeProvider());
