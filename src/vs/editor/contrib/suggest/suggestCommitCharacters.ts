/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ISelectedSuggestion, SuggestWidget } from './suggestWidget';
import { CharacterClassifier } from 'vs/editor/common/core/characterClassifier';
import { EditorOption } from 'vs/editor/common/config/editorOptions';

enum CharacterInfo {
	NOT_COMMIT = 0,
	COMMIT_WITH_INSERT = 1,
	COMMIT_WITHOUT_INSERT = 2
}

export class CommitCharacterController {

	private readonly _disposables = new DisposableStore();

	private _active?: {
		readonly acceptCharacters: CharacterClassifier<CharacterInfo>;
		readonly item: ISelectedSuggestion;
	};

	constructor(editor: ICodeEditor, widget: SuggestWidget, accept: (selected: ISelectedSuggestion, charCode: number) => any) {

		this._disposables.add(widget.onDidShow(() => this._onItem(widget.getFocusedItem())));
		this._disposables.add(widget.onDidFocus(this._onItem, this));
		this._disposables.add(widget.onDidHide(this.reset, this));

		this._disposables.add(editor.onWillType(e => {
			if (this._active && !widget.isFrozen() && widget.isUserAware()) {
				const ch = e.text.charCodeAt(e.text.length - 1);
				const characterInfo = this._active.acceptCharacters.get(ch);
				if (characterInfo !== CharacterInfo.NOT_COMMIT && editor.getOption(EditorOption.acceptSuggestionOnCommitCharacter)) {
					accept(this._active.item, ch);
					if (characterInfo === CharacterInfo.COMMIT_WITHOUT_INSERT) {
						e.cancelType = true;
					}
				}
			}
		}));
	}

	private _onItem(selected: ISelectedSuggestion | undefined): void {
		if (!selected || (!selected.item.completion.commitCharacters || selected.item.completion.commitCharacters.length === 0)) {
			// no item or no commit characters
			this.reset();
			return;
		}

		if (this._active && this._active.item.item === selected.item) {
			// still the same item
			return;
		}

		// keep item and its commit characters
		const acceptCharacters = new CharacterClassifier<CharacterInfo>(CharacterInfo.NOT_COMMIT);
		for (const ch of selected.item.completion.commitCharacters) {
			if (typeof ch === 'string') {
				if (ch.length > 0) {
					acceptCharacters.set(ch.charCodeAt(0), CharacterInfo.COMMIT_WITH_INSERT);
				}
			} else {
				const { char, commitWithoutInsert } = ch;
				if (char.length > 0) {
					acceptCharacters.set(char.charCodeAt(0), commitWithoutInsert ? CharacterInfo.COMMIT_WITHOUT_INSERT : CharacterInfo.COMMIT_WITH_INSERT);
				}
			}
		}
		this._active = { acceptCharacters, item: selected };
	}

	reset(): void {
		this._active = undefined;
	}

	dispose() {
		this._disposables.dispose();
	}
}
