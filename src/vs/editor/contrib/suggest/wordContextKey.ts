/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { RawContextKey, IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

export class WordContextKey {

	static readonly AtEnd = new RawContextKey<boolean>('atEndOfWord', false);

	private readonly _ckAtEnd: IContextKey<boolean>;
	private readonly _listener: IDisposable;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		this._ckAtEnd = WordContextKey.AtEnd.bindTo(contextKeyService);
		this._listener = editor.onDidChangeCursorSelection(e => {
			const model = editor.getModel();
			if (!model) {
				this._ckAtEnd.set(false);
				return;
			}
			let word = model.getWordAtPosition(e.selection.getStartPosition());
			if (!word) {
				this._ckAtEnd.set(false);
				return;
			}
			this._ckAtEnd.set(word.endColumn === e.selection.getStartPosition().column);
		});
	}

	dispose(): void {
		this._ckAtEnd.reset();
		this._listener.dispose();
	}
}
