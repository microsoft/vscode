/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from 'vs/base/common/arrays';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ISelectedSuggestion, SuggestWidget } from './suggestWidget';
import { CharacterSet } from 'vs/editor/common/core/characterClassifier';

export class CommitCharacterController extends Disposable {

	private _active?: {
		readonly acceptCharacters: CharacterSet;
		readonly item: ISelectedSuggestion;
	};

	constructor(editor: ICodeEditor, widget: SuggestWidget, accept: (selected: ISelectedSuggestion) => any) {
		super();

		this._register(widget.onDidShow(() => this._onItem(widget.getFocusedItem())));
		this._register(widget.onDidFocus(this._onItem, this));
		this._register(widget.onDidHide(this.reset, this));

		this._register(editor.onWillType(text => {
			if (this._active) {
				const ch = text.charCodeAt(text.length - 1);
				if (this._active.acceptCharacters.has(ch) && editor.getConfiguration().contribInfo.acceptSuggestionOnCommitCharacter) {
					accept(this._active.item);
				}
			}
		}));
	}

	private _onItem(selected: ISelectedSuggestion | undefined): void {
		if (!selected || !isNonEmptyArray(selected.item.completion.commitCharacters)) {
			this.reset();
			return;
		}

		const acceptCharacters = new CharacterSet();
		for (const ch of selected.item.completion.commitCharacters) {
			if (ch.length > 0) {
				acceptCharacters.add(ch.charCodeAt(0));
			}
		}
		this._active = { acceptCharacters, item: selected };
	}

	reset(): void {
		this._active = undefined;
	}
}
