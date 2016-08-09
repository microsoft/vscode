/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {KeyCode} from 'vs/base/common/keyCodes';
import {KbCtxKey, IKeybindingService, KbExpr} from 'vs/platform/keybinding/common/keybinding';
import {KeybindingsRegistry} from 'vs/platform/keybinding/common/keybindingsRegistry';
import {ISnippetsRegistry, Extensions, getNonWhitespacePrefix, ISnippet} from 'vs/editor/common/modes/snippetsRegistry';
import {Registry} from 'vs/platform/platform';
import {IDisposable} from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry, EditorCommand} from 'vs/editor/common/editorCommonExtensions';
import {CodeSnippet, ISnippetController, getSnippetController} from 'vs/editor/contrib/snippet/common/snippet';

import EditorContextKeys = editorCommon.EditorContextKeys;

let snippetsRegistry = <ISnippetsRegistry>Registry.as(Extensions.Snippets);

class TabCompletionController implements editorCommon.IEditorContribution {

	private static ID = 'editor.tabCompletionController';
	static ContextKey = new KbCtxKey<boolean>('hasSnippetCompletions', undefined);

	public static get(editor:editorCommon.ICommonCodeEditor): TabCompletionController {
		return <TabCompletionController>editor.getContribution(TabCompletionController.ID);
	}

	private _snippetController: ISnippetController;
	private _cursorChangeSubscription: IDisposable;
	private _currentSnippets: ISnippet[] = [];

	constructor(
		editor: editorCommon.ICommonCodeEditor,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		this._snippetController = getSnippetController(editor);
		const hasSnippets = TabCompletionController.ContextKey.bindTo(keybindingService);
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
		return TabCompletionController.ID;
	}
}

CommonEditorRegistry.registerEditorContribution(TabCompletionController);

const TabCompletionCommand = EditorCommand.bindToContribution<TabCompletionController>(TabCompletionController.get);

CommonEditorRegistry.registerEditorCommand2(new TabCompletionCommand({
	id: 'insertSnippet',
	precondition: TabCompletionController.ContextKey,
	handler: x => x.performSnippetCompletions(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(),
		kbExpr: KbExpr.and(
			EditorContextKeys.TextFocus,
			EditorContextKeys.TabDoesNotMoveFocus,
			KbExpr.has('config.editor.tabCompletion')
		),
		primary: KeyCode.Tab
	}
}));
