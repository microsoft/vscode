/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export class TabSuggestContextKey {

	static readonly InTabSuggestContext = new RawContextKey<boolean>('inTabSuggestContext', false);

	private readonly _ckInTabSuggestContext: IContextKey<boolean>;
	private readonly _configListener: IDisposable;

	private _enabled: boolean = false;
	private _selectionListener?: IDisposable;

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {

		this._ckInTabSuggestContext = TabSuggestContextKey.InTabSuggestContext.bindTo(contextKeyService);
		this._configListener = this._editor.onDidChangeConfiguration(e => e.hasChanged(EditorOption.tabSuggest) && this._update());
		this._update();
	}

	dispose(): void {
		this._configListener.dispose();
		this._selectionListener?.dispose();
		this._ckInTabSuggestContext.reset();
	}

	private _update(): void {
		// only update this when suggest on tab is enabled
		const enabled = this._editor.getOption(EditorOption.tabSuggest) === 'on';
		if (this._enabled === enabled) {
			return;
		}
		this._enabled = enabled;

		if (this._enabled) {
			const checkForInTabSuggestContext = () => {
				if (!this._editor.hasModel()) {
					this._ckInTabSuggestContext.set(false);
					return;
				}

				const model = this._editor.getModel();
				const selection = this._editor.getSelection();

				if (!selection.isEmpty()) {
					// User selected some text, probably wants an actual tab
					this._ckInTabSuggestContext.set(false);
					return;
				}

				const position = selection.getStartPosition();
				const leadingText = model.getLineContent(position.lineNumber).substring(0, position.column - 1);

				if (leadingText.trim().length === 0) {
					// Leading text is all whitespace characters,
					// user likely wants to insert one or more tabs
					this._ckInTabSuggestContext.set(false);
					return;
				}

				this._ckInTabSuggestContext.set(true);
			};
			this._selectionListener = this._editor.onDidChangeCursorSelection(checkForInTabSuggestContext);
			checkForInTabSuggestContext();
		} else if (this._selectionListener) {
			this._ckInTabSuggestContext.reset();
			this._selectionListener.dispose();
			this._selectionListener = undefined;
		}
	}
}
