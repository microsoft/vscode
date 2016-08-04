/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {KeyCode} from 'vs/base/common/keyCodes';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IKeybindingService, KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {ISnippetsRegistry, Extensions, getNonWhitespacePrefix, ISnippet} from 'vs/editor/common/modes/snippetsRegistry';
import {Registry} from 'vs/platform/platform';
import {IDisposable} from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {CodeSnippet, ISnippetController, getSnippetController} from 'vs/editor/contrib/snippet/common/snippet';

const EditorKbExpr = editorCommon.EditorKbExpr;

let snippetsRegistry = <ISnippetsRegistry>Registry.as(Extensions.Snippets);

class TabCompletionController implements editorCommon.IEditorContribution {

	static Id = 'editor.tabCompletionController';
	static ContextKey = 'hasSnippetCompletions';

	private _snippetController: ISnippetController;
	private _cursorChangeSubscription: IDisposable;
	private _currentSnippets: ISnippet[] = [];

	constructor(
		editor: editorCommon.ICommonCodeEditor,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		this._snippetController = getSnippetController(editor);
		const hasSnippets = keybindingService.createKey(TabCompletionController.ContextKey, undefined);
		this._cursorChangeSubscription = editor.onDidChangeCursorSelection(e => {

			this._currentSnippets.length = 0;

			const prefix = e.selection.isEmpty()
				? getNonWhitespacePrefix(editor.getModel(), editor.getPosition())
				: editor.getModel().getValueInRange(e.selection);

			if (prefix) {
				snippetsRegistry.visitSnippets(editor.getModel().getModeId(), s => {
					if (prefix === s.prefix) {
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
		// } else {
			// todo@joh - show suggest widget with proposals
		}
	}

	getId(): string {
		return TabCompletionController.Id;
	}
}

CommonEditorRegistry.registerEditorContribution(TabCompletionController);

KeybindingsRegistry.registerCommandDesc({
	id: 'insertSnippet',
	weight: KeybindingsRegistry.WEIGHT.editorContrib(),
	primary: KeyCode.Tab,
	when: KbExpr.and(KbExpr.has(TabCompletionController.ContextKey),
		EditorKbExpr.TextFocus,
		EditorKbExpr.TabDoesNotMoveFocus,
		KbExpr.has('config.editor.tabCompletion')),
	handler(accessor) {
		const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (editor) {
			(<TabCompletionController>editor.getContribution(TabCompletionController.Id)).performSnippetCompletions();
		}
	}
});
