/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as strings from 'vs/base/common/strings';
import {KeyCode} from 'vs/base/common/keyCodes';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybinding';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {ISnippetsRegistry, Extensions, getNonWhitespacePrefix, ISnippet} from 'vs/editor/common/modes/snippetsRegistry';
import {Registry} from 'vs/platform/platform';
import {IDisposable} from 'vs/base/common/lifecycle';
import * as editor from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {CodeSnippet, ISnippetController, getSnippetController} from 'vs/editor/contrib/snippet/common/snippet';

let snippetsRegistry = <ISnippetsRegistry>Registry.as(Extensions.Snippets);

class TabCompletionController implements editor.IEditorContribution {

	static Id = 'editor.tabCompletionController';
	static ContextKey = 'hasSnippetCompletions';

	private _snippetController: ISnippetController;
	private _cursorChangeSubscription: IDisposable;
	private _currentSnippets: ISnippet[] = [];

	constructor(
		editor: editor.ICommonCodeEditor,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		this._snippetController = getSnippetController(editor);
		const hasSnippets = keybindingService.createKey(TabCompletionController.ContextKey, undefined);
		this._cursorChangeSubscription = editor.onDidChangeCursorPosition(e => {
			this._currentSnippets.length = 0;
			var prefix = getNonWhitespacePrefix(editor.getModel(), editor.getPosition());
			if (prefix) {
				snippetsRegistry.visitSnippets(editor.getModel().getModeId(), s => {
					if (strings.endsWith(prefix, s.prefix)) {
						this._currentSnippets.push(s);
					}
					return true;
				});
			}
			hasSnippets.set(this._currentSnippets.length === 1); //todo@joh make it work with N
		});
	}

	dispose(): void {
		this._cursorChangeSubscription.dispose();
	}

	performSnippetCompletions(): void {
		if (this._currentSnippets.length === 1) {
			const snippet = this._currentSnippets[0];
			const codeSnippet = new CodeSnippet(snippet.codeSnippet);
			this._snippetController.run(codeSnippet, snippet.prefix.length, 0);
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
