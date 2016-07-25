/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import * as editor from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {SuggestController} from 'vs/editor/contrib/suggest/browser/suggestController';
import {startsWith} from 'vs/base/common/strings';

class WordContext {

	static create(editor: editor.ICommonCodeEditor): WordContext {
		const result = new WordContext();

		const model = editor.getModel();
		const position = editor.getPosition();
		const wordInfo = model.getWordAtPosition(position);

		result._position = position;
		result._word = wordInfo && wordInfo.endColumn === position.column ? wordInfo.word : '';

		return result;
	}

	private _word: string;
	private _position: editor.IPosition;

	isValid() {
		if (!this._word) {
			return false;
		}
		if (!isNaN(Number(this._word))) {
			return false;
		}
		return true;
	}

	isSameWord(other: WordContext): boolean {
		if(this._position.lineNumber !== other._position.lineNumber) {
			return false;
		}
		return startsWith(other._word, this._word);
	}
}

class TriggerCharacterCompletion implements editor.IEditorContribution {

	static Id = 'editor.triggerCharacterCompletion';

	private _editor: editor.ICommonCodeEditor;
	private _disposables: IDisposable[] = [];
	private _triggerHandle: number;
	private _wordContext: WordContext;

	// private _context: Context;

	constructor(
		editor: editor.ICommonCodeEditor
	) {
		this._editor = editor;

		this._disposables.push(this._editor.onDidChangeCursorSelection(e => this.onCursorChange(e)));
	}

	dispose(): void {
		dispose(this._disposables);
	}


	getId(): string {
		return TriggerCharacterCompletion.Id;
	}

	private onCursorChange(e: editor.ICursorSelectionChangedEvent): void {

		clearTimeout(this._triggerHandle);

		if (!this._editor.getConfiguration().contribInfo.quickSuggestions) {
			this._wordContext = null;
			return;
		}

		if (e.source !== 'keyboard' || e.reason !== editor.CursorChangeReason.NotSet) {
			this._wordContext = null;
			return;
		}

		const ctx = WordContext.create(this._editor);
		if (!ctx.isValid()) {
			this._wordContext = null;
			return;
		}

		if (!this._wordContext || !this._wordContext.isSameWord(ctx)) {
			this._wordContext = ctx;
			this._triggerHandle = setTimeout(() => SuggestController.getController(this._editor).trigger(true), this._getConfiguredDelay());
		}
	}

	private _getConfiguredDelay(): number {
		let delay = this._editor.getConfiguration().contribInfo.quickSuggestionsDelay;
		if (isNaN(delay)) {
			return 10;
		}
		if (delay < 10) {
			return 10;
		}
		return delay;
	}
}

CommonEditorRegistry.registerEditorContribution(TriggerCharacterCompletion);
