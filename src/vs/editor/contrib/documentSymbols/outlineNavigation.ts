/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/outlineTree';
import 'vs/css!./media/symbol-icons';
import { Range } from 'vs/editor/common/core/range';
import { OutlineElement, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { localize } from 'vs/nls';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { EditorStateCancellationTokenSource, CodeEditorStateFlag } from 'vs/editor/browser/core/editorState';
import { EditorAction, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { values } from 'vs/base/common/collections';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';
import { KeyMod } from 'vs/editor/common/standalone/standaloneBase';

class Navigator {

	private static readonly _instances = new WeakMap<TreeElement, Navigator>();

	static for(element: TreeElement): Navigator {
		let res = this._instances.get(element);
		if (!res) {
			res = new Navigator(element);
			this._instances.set(element, res);
		}
		return res;
	}

	private readonly _children: TreeElement[] = [];

	private constructor(readonly element: TreeElement) {
		this._children = values(element.children).sort(Navigator._compare);
	}

	navigate(up: boolean): TreeElement | undefined {
		return up ? this._up() : this._down();
	}

	private _up(): TreeElement | undefined {
		const sibling = this._sibling(true);
		if (sibling) {
			return sibling._child(true) ?? sibling.element;
		}
		return undefined;
	}

	private _down(): TreeElement | undefined {
		const firstChild = this._child(false);
		if (firstChild) {
			return firstChild;
		}
		const sibling = this._sibling(false);
		if (sibling) {
			return sibling.element;
		}
		return undefined;
	}

	private _sibling(up: boolean): Navigator | undefined {
		if (!this.element.parent) {
			return undefined;
		}
		const parent = Navigator.for(this.element.parent);
		const idx = parent._children.indexOf(this.element);
		const nexIdx = idx + (up ? -1 : +1);
		const element = parent._children[nexIdx];
		return element && Navigator.for(element);
	}

	private _child(last: boolean): TreeElement | undefined {
		return this._children[last ? this._children.length - 1 : 0];
	}

	private static _compare(a: TreeElement, b: TreeElement): number {
		return (a instanceof OutlineElement && b instanceof OutlineElement)
			? Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range)
			: 0;
	}
}

export class OutlineNavigation implements IEditorContribution {

	public static readonly ID = 'editor.contrib.OutlineNavigation';

	public static get(editor: ICodeEditor): OutlineNavigation {
		return editor.getContribution<OutlineNavigation>(OutlineNavigation.ID);
	}

	private readonly _editor: ICodeEditor;

	private _cts?: CancellationTokenSource;

	constructor(
		editor: ICodeEditor,
	) {
		this._editor = editor;
	}

	dispose(): void {
		if (this._cts) {
			this._cts.dispose(true);
		}
	}

	async goto(up: boolean) {

		if (this._cts) {
			this._cts.cancel();
		}

		if (!this._editor.hasModel()) {
			return;
		}

		const textModel = this._editor.getModel();
		const position = this._editor.getPosition();

		this._cts = new EditorStateCancellationTokenSource(this._editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value | CodeEditorStateFlag.Scroll);

		const outlineModel = await OutlineModel.create(textModel, this._cts.token);
		const element = outlineModel.getItemEnclosingPosition(position);

		if (!element || this._cts.token.isCancellationRequested) {
			return;
		}

		let nav = Navigator.for(element);
		let nextElement = nav.navigate(up);

		if (nextElement instanceof OutlineElement) {
			this._editor.setPosition(Range.lift(nextElement.symbol.selectionRange).getStartPosition());
		}
	}

}

registerEditorContribution(OutlineNavigation.ID, OutlineNavigation);

registerEditorAction(class extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.gotoNextSymbol',
			label: localize('label.next', "Go to Next Symbol"),
			alias: 'Go to Next Symbol',
			precondition: EditorContextKeys.hasDocumentSymbolProvider,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyMod.Shift | KeyCode.DownArrow,
					secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.DownArrow],
				},
			}
		});
	}

	run(_accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		OutlineNavigation.get(editor).goto(false);
	}
});

registerEditorAction(class extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.gotoPrevSymbol',
			label: localize('label.prev', "Go to Previous Symbol"),
			alias: 'Go to Previous Symbol',
			precondition: EditorContextKeys.hasDocumentSymbolProvider,
			kbOpts: {
				weight: KeybindingWeight.EditorContrib,
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyMod.Shift | KeyCode.UpArrow,
					secondary: [KeyMod.WinCtrl | KeyMod.Shift | KeyCode.UpArrow],
				},
			}
		});
	}

	run(_accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		OutlineNavigation.get(editor).goto(true);
	}
});
