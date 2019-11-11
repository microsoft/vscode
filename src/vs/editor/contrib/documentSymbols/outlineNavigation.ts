/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/outlineTree';
import 'vs/css!./media/symbol-icons';
import { Range } from 'vs/editor/common/core/range';
import { OutlineElement, OutlineModel } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { localize } from 'vs/nls';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { EditorStateCancellationTokenSource, CodeEditorStateFlag } from 'vs/editor/browser/core/editorState';
import { EditorAction, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { values } from 'vs/base/common/collections';

class Navigator {

	private static readonly _instances = new WeakMap<OutlineElement, Navigator>();

	static for(element: OutlineElement): Navigator {
		let res = this._instances.get(element);
		if (!res) {
			res = new Navigator(element);
			this._instances.set(element, res);
		}
		return res;
	}

	private readonly _children: OutlineElement[] = [];

	private constructor(readonly element: OutlineElement) {
		this._children = values(element.children).sort(Navigator._compare);
	}

	parent(): OutlineElement | undefined {
		const { parent } = this.element;
		return parent instanceof OutlineElement ? parent : undefined;
	}

	firstChild(): OutlineElement | undefined {
		return this._children[0];
	}

	lastChild(): OutlineElement | undefined {
		return this._children[this._children.length - 1];
	}

	nextSibling(): OutlineElement | undefined {
		const parent = this.parent();
		if (!parent) {
			return undefined;
		}
		const parentNav = Navigator.for(parent);
		const idx = parentNav._children.indexOf(this.element);
		if (idx < 0 || idx + 1 >= parentNav._children.length) {
			return undefined;
		}
		return parentNav._children[idx + 1];
	}

	previousSibling(): OutlineElement | undefined {
		const parent = this.parent();
		if (!parent) {
			return undefined;
		}
		const parentNav = Navigator.for(parent);
		const idx = parentNav._children.indexOf(this.element);
		if (idx - 1 < 0) {
			return undefined;
		}
		return parentNav._children[idx - 1];
	}

	navigate(next: boolean): OutlineElement | undefined {
		return next ? this._navNext() : this._navPrev();
	}

	private _navNext(): OutlineElement | undefined {
		return undefined;
	}

	private _navPrev(): OutlineElement | undefined {
		return undefined;
	}

	private static _compare(a: OutlineElement, b: OutlineElement): number {
		return Range.compareRangesUsingStarts(a.symbol.range, b.symbol.range);
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

	async goto(next: boolean) {

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
		let nextElement = nav.navigate(next);

		if (nextElement) {
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
		});
	}

	run(_accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		OutlineNavigation.get(editor).goto(true);
	}
});

registerEditorAction(class extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.gotoPrevSymbol',
			label: localize('label.prev', "Go to Previous Symbol"),
			alias: 'Go to Previous Symbol',
			precondition: EditorContextKeys.hasDocumentSymbolProvider,
		});
	}

	run(_accessor: ServicesAccessor, editor: ICodeEditor): void | Promise<void> {
		OutlineNavigation.get(editor).goto(false);
	}
});
