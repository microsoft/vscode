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

		if (!element) {
			return;
		}

		let nextElement = element.sibling(next);
		if (!nextElement && element.parent) {
			let nextParent = element.parent.sibling(next);
			if (nextParent) {
				nextElement = next ? nextParent.firstChild() : nextParent.lastChild();
			}
		}

		if (!(nextElement instanceof OutlineElement)) {
			return;
		}

		this._editor.setPosition(Range.lift(nextElement.symbol.selectionRange).getStartPosition());
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
