/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import * as editor from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {SuggestController} from 'vs/editor/contrib/suggest/browser/suggestController';
import { ISuggestSupport, SuggestRegistry } from 'vs/editor/common/modes';

class TriggerCharacterCompletion implements editor.IEditorContribution {

	static Id = 'editor.triggerCharacterCompletion';

	private _editor: editor.ICommonCodeEditor;
	private _disposables: IDisposable[] = [];
	private _onDidTypeSubscriptions: IDisposable[] = [];

	constructor(
		editor: editor.ICommonCodeEditor
	) {
		this._editor = editor;

		this._disposables.push(this._editor.onDidChangeConfiguration(() => this._updateTypingListener()));
		this._disposables.push(this._editor.onDidChangeModelMode(() => this._updateTypingListener()));
		this._disposables.push(SuggestRegistry.onDidChange(() => this._updateTypingListener()));
	}

	dispose(): void {
		dispose(this._disposables);
		dispose(this._onDidTypeSubscriptions);
	}

	getId(): string {
		return TriggerCharacterCompletion.Id;
	}

	private _updateTypingListener() {

		this._onDidTypeSubscriptions = dispose(this._onDidTypeSubscriptions);
		if (!this._editor.getConfiguration().contribInfo.suggestOnTriggerCharacters) {
			return;
		}

		const groups = SuggestRegistry.orderedGroups(this._editor.getModel());
		if (groups.length === 0) {
			return;
		}

		const triggerCharacters: { [ch: string]: ISuggestSupport[][] } = Object.create(null);

		for (const group of groups) {

			const groupTriggerCharacters: { [ch: string]: ISuggestSupport[] } = Object.create(null);
			for (const provider of group) {
				let localTriggerCharacters = provider.triggerCharacters;
				if (!localTriggerCharacters) {
					continue;
				}

				for (let ch of localTriggerCharacters) {
					let array = groupTriggerCharacters[ch];
					if (array) {
						array.push(provider);
					} else {
						array = [provider];
						groupTriggerCharacters[ch] = array;
						if (triggerCharacters[ch]) {
							triggerCharacters[ch].push(array);
						} else {
							triggerCharacters[ch] = [array];
						}
					}
				}
			}
		}

		const controller = SuggestController.getController(this._editor);

		Object.keys(triggerCharacters).forEach(ch => {
			this._onDidTypeSubscriptions.push(this._editor.addTypingListener(ch, () => {
				// this.triggerSuggest(ch, triggerCharacters[ch]).done(null, onUnexpectedError);
				controller.trigger(true);
			}));
		});
	}
}

CommonEditorRegistry.registerEditorContribution(TriggerCharacterCompletion);
