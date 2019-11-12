/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { OutlineElement, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { localize } from 'vs/nls';
import { IEditorContribution, ScrollType } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { EditorStateCancellationTokenSource, CodeEditorStateFlag } from 'vs/editor/browser/core/editorState';
import { EditorAction, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { values } from 'vs/base/common/collections';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { OutlineFilter } from 'vs/editor/contrib/documentSymbols/outlineTree';

class Navigator {

	private readonly _children: TreeElement[] = [];

	constructor(
		readonly element: TreeElement,
		private readonly _filter: OutlineFilter
	) {
		this._children = values(element.children)
			.filter(entry => !(entry instanceof OutlineElement) || _filter.filter(entry))
			.sort(Navigator._compare);
	}

	navigate(up: boolean): TreeElement | undefined {
		return up ? this._up() : this._down();
	}

	private _up(): TreeElement | undefined {
		const sibling = this._sibling(true);
		if (!sibling) {
			return this.element.parent;
		}
		let nav: Navigator = sibling;
		while (nav) {
			let next = nav._child(true);
			if (!next) {
				return nav.element;
			}
			nav = new Navigator(next, this._filter);
		}
		return undefined;
	}

	private _down(): TreeElement | undefined {
		const firstChild = this._child(false);
		if (firstChild) {
			return firstChild;
		}
		let nav: Navigator | undefined = this;
		while (nav) {
			const next = nav._sibling(false);
			if (next) {
				return next.element;
			}
			nav = nav.element.parent && new Navigator(nav.element.parent, this._filter);
		}
		return undefined;
	}

	private _sibling(up: boolean): Navigator | undefined {
		if (!this.element.parent) {
			return undefined;
		}
		const parent = new Navigator(this.element.parent, this._filter);
		const idx = parent._children.indexOf(this.element);
		const nexIdx = idx + (up ? -1 : +1);
		const element = parent._children[nexIdx];
		return element && new Navigator(element, this._filter);
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
		@IConfigurationService private readonly _configService: IConfigurationService,
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
			this._cts.dispose(true);
		}

		if (!this._editor.hasModel()) {
			return;
		}

		const textModel = this._editor.getModel();
		const position = this._editor.getPosition();

		this._cts = new EditorStateCancellationTokenSource(this._editor, CodeEditorStateFlag.Position | CodeEditorStateFlag.Value | CodeEditorStateFlag.Scroll);

		const filter = new OutlineFilter('outline', this._configService);
		const outlineModel = await OutlineModel.create(textModel, this._cts.token);

		let element: TreeElement | undefined = outlineModel.getItemEnclosingPosition(position);
		if (!(element instanceof OutlineElement) || this._cts.token.isCancellationRequested) {
			return;
		}

		// don't start in a filtered element
		let stack: OutlineElement[] = [element];
		while (element instanceof OutlineElement) {
			if (!filter.filter(element)) {
				stack.length = 0;
			} else {
				stack.push(element);
			}
			element = element.parent;
		}
		element = stack[0];
		if (!(element instanceof OutlineElement)) {
			return;
		}

		// reveal container first (unless already at its range)
		let nextElement: TreeElement | undefined = element;
		if (!up || Range.containsPosition(element.symbol.selectionRange, position)) {
			nextElement = new Navigator(element, filter).navigate(up);
		}

		if (nextElement instanceof OutlineElement) {
			const pos = Range.lift(nextElement.symbol.selectionRange).getStartPosition();
			this._editor.setPosition(pos);
			this._editor.revealPosition(pos, ScrollType.Smooth);
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
					primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.DownArrow,
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
					primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.UpArrow,
				},
			}
		});
	}

	run(_accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		OutlineNavigation.get(editor).goto(true);
	}
});
