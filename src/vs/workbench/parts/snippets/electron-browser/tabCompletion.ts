/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { KeyCode } from 'vs/base/common/keyCodes';
import { RawContextKey, IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ISnippetsService, ISnippet } from 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';
import { getNonWhitespacePrefix, SnippetSuggestion } from 'vs/workbench/parts/snippets/electron-browser/snippetsService';
import { Registry } from 'vs/platform/registry/common/platform';
import { endsWith } from 'vs/base/common/strings';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry, commonEditorContribution, EditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { showSimpleSuggestions } from 'vs/editor/contrib/suggest/browser/suggest';
import { IConfigurationRegistry, Extensions as ConfigExt } from 'vs/platform/configuration/common/configurationRegistry';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

@commonEditorContribution
export class TabCompletionController implements editorCommon.IEditorContribution {

	private static ID = 'editor.tabCompletionController';
	static ContextKey = new RawContextKey<boolean>('hasSnippetCompletions', undefined);

	public static get(editor: editorCommon.ICommonCodeEditor): TabCompletionController {
		return editor.getContribution<TabCompletionController>(TabCompletionController.ID);
	}

	private readonly _editor: editorCommon.ICommonCodeEditor;
	private readonly _snippetController: SnippetController2;
	private readonly _dispoables: IDisposable[] = [];
	private _snippets: ISnippet[] = [];

	constructor(
		editor: editorCommon.ICommonCodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISnippetsService snippetService: ISnippetsService
	) {
		this._editor = editor;
		this._snippetController = SnippetController2.get(editor);

		const hasSnippets = TabCompletionController.ContextKey.bindTo(contextKeyService);
		this._dispoables.push(editor.onDidChangeCursorSelection(e => {

			this._snippets.length = 0;
			let selectFn: (snippet: ISnippet) => boolean;

			if (e.selection.isEmpty()) {
				// empty selection -> real text (no whitespace) left of cursor
				const prefix = getNonWhitespacePrefix(editor.getModel(), editor.getPosition());
				selectFn = prefix && (snippet => endsWith(prefix, snippet.prefix));

			} else {
				// actual selection -> snippet must be a full match
				const selected = editor.getModel().getValueInRange(e.selection);
				selectFn = snippet => selected === snippet.prefix;
			}

			if (selectFn) {
				const model = editor.getModel();
				model.tokenizeIfCheap(e.selection.positionLineNumber);
				const id = model.getLanguageIdAtPosition(e.selection.positionLineNumber, e.selection.positionColumn);
				this._snippets = snippetService.getSnippetsSync(id).filter(selectFn);
			}
			hasSnippets.set(this._snippets.length > 0);
		}));
	}

	getId(): string {
		return TabCompletionController.ID;
	}

	dispose(): void {
		dispose(this._dispoables);
	}

	performSnippetCompletions(): void {

		if (this._snippets.length === 1) {
			// one -> just insert
			const [snippet] = this._snippets;
			this._snippetController.insert(snippet.codeSnippet, snippet.prefix.length, 0);

		} else if (this._snippets.length > 1) {
			// two or more -> show IntelliSense box
			showSimpleSuggestions(this._editor, this._snippets.map(snippet => new SnippetSuggestion(snippet, snippet.prefix.length)));
		}
	}
}

const TabCompletionCommand = EditorCommand.bindToContribution<TabCompletionController>(TabCompletionController.get);

CommonEditorRegistry.registerEditorCommand(new TabCompletionCommand({
	id: 'insertSnippet',
	precondition: TabCompletionController.ContextKey,
	handler: x => x.performSnippetCompletions(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(),
		kbExpr: ContextKeyExpr.and(
			EditorContextKeys.textFocus,
			EditorContextKeys.tabDoesNotMoveFocus,
			SnippetController2.InSnippetMode.toNegated(),
			ContextKeyExpr.has('config.editor.tabCompletion')
		),
		primary: KeyCode.Tab
	}
}));


Registry.as<IConfigurationRegistry>(ConfigExt.Configuration).registerConfiguration({
	id: 'editor',
	order: 5,
	type: 'object',
	properties: {
		'editor.tabCompletion': {
			'type': 'boolean',
			'default': false,
			'description': localize('tabCompletion', "Insert snippets when their prefix matches. Works best when 'quickSuggestions' aren't enabled.")
		},
	}
});
