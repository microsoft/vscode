/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export class WordContextKey {

	static readonly AtEnd = new RawContextKey<boolean>('atEndOfWord', false);

	private readonly _ckAtEnd: IContextKey<boolean>;
	private readonly _configListener: IDisposable;

	private _enabled: boolean = false;
	private _selectionListener?: IDisposable;

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {

		this._ckAtEnd = WordContextKey.AtEnd.bindTo(contextKeyService);
		this._configListener = this._editor.onDidChangeConfiguration(e => e.hasChanged(EditorOption.tabCompletion) && this._update());
		this._update();
	}

	dispose(): void {
		this._configListener.dispose();
		this._selectionListener?.dispose();
		this._ckAtEnd.reset();
	}

	private _update(): void {
		// only update this when tab completions are enabled
		const enabled = this._editor.getOption(EditorOption.tabCompletion) === 'on';
		if (this._enabled === enabled) {
			return;
		}
		this._enabled = enabled;

		if (this._enabled) {
			const checkForWordEnd = () => {
				if (!this._editor.hasModel()) {
					this._ckAtEnd.set(false);
					return;
				}
				const model = this._editor.getModel();
				const selection = this._editor.getSelection();
				const word = model.getWordAtPosition(selection.getStartPosition());
				if (!word) {
					this._ckAtEnd.set(false);
					return;
				}
				this._ckAtEnd.set(word.endColumn === selection.getStartPosition().column);
			};
			this._selectionListener = this._editor.onDidChangeCursorSelection(checkForWordEnd);
			checkForWordEnd();

		} else if (this._selectionListener) {
			this._ckAtEnd.reset();
			this._selectionListener.dispose();
			this._selectionListener = undefined;
		}
	}
}
