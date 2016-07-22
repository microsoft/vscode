/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {KeyCode} from 'vs/base/common/keyCodes';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {SnippetsRegistry} from 'vs/editor/common/modes/supports';
import {ISuggestion} from 'vs/editor/common/modes';
import {IDisposable} from 'vs/base/common/lifecycle';
import * as editor from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {CodeSnippet, ISnippetController, getSnippetController} from 'vs/editor/contrib/snippet/common/snippet';

class TabCompletionController implements editor.IEditorContribution {

	static Id = 'editor.tabCompletionController';
	static ContextKey = 'hasSnippetCompletions';

	private _snippetController: ISnippetController;
	private _cursorChangeSubscription: IDisposable;
	private _currentCompletions: ISuggestion[] = [];

	constructor(
		editor: editor.ICommonCodeEditor,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		this._snippetController = getSnippetController(editor);
		const hasSnippets = keybindingService.createKey(TabCompletionController.ContextKey, undefined);
		this._cursorChangeSubscription = editor.onDidChangeCursorPosition(e => {
			SnippetsRegistry.fillInSnippets(this._currentCompletions, editor.getModel(), editor.getPosition());
			hasSnippets.set(this._currentCompletions.length === 1); //todo@joh make it work with N
		});
	}

	dispose(): void {
		this._cursorChangeSubscription.dispose();
	}

	performSnippetCompletions(): void {
		if (this._currentCompletions.length === 1) {
			const suggestion = this._currentCompletions[0];
			const snippet = new CodeSnippet(suggestion.codeSnippet);
			this._snippetController.run(snippet, suggestion.label.length, 0);
		} else {
			// todo@joh - show suggest widget with proposals
		}
	}

	getId(): string {
		return TabCompletionController.Id;
	}
}

CommonEditorRegistry.registerEditorContribution(TabCompletionController);
CommonEditorRegistry.registerEditorCommand(
	'insertSnippet',
	KeybindingsRegistry.WEIGHT.editorContrib(),
	{ primary: KeyCode.Tab },
	true,
	TabCompletionController.ContextKey,
	(accessor, editor) => {
		const controller = <TabCompletionController>editor.getContribution(TabCompletionController.Id);
		controller.performSnippetCompletions();
	});
