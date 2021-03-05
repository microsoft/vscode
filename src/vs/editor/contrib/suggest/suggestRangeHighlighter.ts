/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { CompletionItem } from 'vs/editor/contrib/suggest/suggest';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { Emitter } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';

export class SuggestRangeHighlighter {

	private readonly _disposables = new DisposableStore();

	private _decorations: string[] = [];
	private _widgetListener?: IDisposable;
	private _shiftKeyListener?: IDisposable;
	private _currentItem?: CompletionItem;

	constructor(private readonly _controller: SuggestController) {

		this._disposables.add(_controller.model.onDidSuggest(e => {
			if (!e.shy) {
				const widget = this._controller.widget.getValue();
				const focused = widget.getFocusedItem();
				if (focused) {
					this._highlight(focused.item);
				}
				if (!this._widgetListener) {
					this._widgetListener = widget.onDidFocus(e => this._highlight(e.item));
				}
			}
		}));

		this._disposables.add(_controller.model.onDidCancel(() => {
			this._reset();
		}));
	}

	dispose(): void {
		this._reset();
		this._disposables.dispose();
		dispose(this._widgetListener);
		dispose(this._shiftKeyListener);
	}

	private _reset(): void {
		this._decorations = this._controller.editor.deltaDecorations(this._decorations, []);
		if (this._shiftKeyListener) {
			this._shiftKeyListener.dispose();
			this._shiftKeyListener = undefined;
		}
	}

	private _highlight(item: CompletionItem) {

		this._currentItem = item;
		const opts = this._controller.editor.getOption(EditorOption.suggest);
		let newDeco: IModelDeltaDecoration[] = [];

		if (opts.insertHighlight) {
			if (!this._shiftKeyListener) {
				this._shiftKeyListener = shiftKey.event(() => this._highlight(this._currentItem!));
			}

			const info = this._controller.getOverwriteInfo(item, shiftKey.isPressed);
			const position = this._controller.editor.getPosition()!;

			if (opts.insertMode === 'insert' && info.overwriteAfter > 0) {
				// wants inserts but got replace-mode -> highlight AFTER range
				newDeco = [{
					range: new Range(position.lineNumber, position.column, position.lineNumber, position.column + info.overwriteAfter),
					options: { inlineClassName: 'suggest-insert-unexpected' }
				}];

			} else if (opts.insertMode === 'replace' && info.overwriteAfter === 0) {
				// want replace but likely got insert -> highlight AFTER range
				const wordInfo = this._controller.editor.getModel()?.getWordAtPosition(position);
				if (wordInfo && wordInfo.endColumn > position.column) {
					newDeco = [{
						range: new Range(position.lineNumber, position.column, position.lineNumber, wordInfo.endColumn),
						options: { inlineClassName: 'suggest-insert-unexpected' }
					}];
				}
			}
		}

		// update editor decorations
		this._decorations = this._controller.editor.deltaDecorations(this._decorations, newDeco);
	}
}

const shiftKey = new class ShiftKey extends Emitter<boolean> {

	private readonly _subscriptions = new DisposableStore();
	private _isPressed: boolean = false;

	constructor() {
		super();
		this._subscriptions.add(domEvent(document.body, 'keydown')(e => this.isPressed = e.shiftKey));
		this._subscriptions.add(domEvent(document.body, 'keyup')(() => this.isPressed = false));
		this._subscriptions.add(domEvent(document.body, 'mouseleave')(() => this.isPressed = false));
		this._subscriptions.add(domEvent(document.body, 'blur')(() => this.isPressed = false));
	}

	get isPressed(): boolean {
		return this._isPressed;
	}

	set isPressed(value: boolean) {
		if (this._isPressed !== value) {
			this._isPressed = value;
			this.fire(value);
		}
	}

	dispose() {
		this._subscriptions.dispose();
		super.dispose();
	}
};
