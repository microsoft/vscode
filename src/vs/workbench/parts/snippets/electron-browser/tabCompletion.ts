/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { KeyCode } from 'vs/base/common/keyCodes';
import { RawContextKey, IContextKeyService, ContextKeyExpr, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ISnippetsService, Snippet } from 'vs/workbench/parts/snippets/electron-browser/snippets.contribution';
import { getNonWhitespacePrefix, SnippetSuggestion } from 'vs/workbench/parts/snippets/electron-browser/snippetsService';
import { Registry } from 'vs/platform/registry/common/platform';
import { endsWith } from 'vs/base/common/strings';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { registerEditorContribution, EditorCommand, registerEditorCommand } from 'vs/editor/browser/editorExtensions';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { showSimpleSuggestions } from 'vs/editor/contrib/suggest/suggest';
import { IConfigurationRegistry, Extensions as ConfigExt } from 'vs/platform/configuration/common/configurationRegistry';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

export class TabCompletionController implements editorCommon.IEditorContribution {

	private static readonly ID = 'editor.tabCompletionController';
	static ContextKey = new RawContextKey<boolean>('hasSnippetCompletions', undefined);

	public static get(editor: ICodeEditor): TabCompletionController {
		return editor.getContribution<TabCompletionController>(TabCompletionController.ID);
	}

	private _hasSnippets: IContextKey<boolean>;
	private _activeSnippets: Snippet[] = [];
	private _selectionListener: IDisposable;
	private _configListener: IDisposable;

	constructor(
		private readonly _editor: ICodeEditor,
		@ISnippetsService private readonly _snippetService: ISnippetsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		this._hasSnippets = TabCompletionController.ContextKey.bindTo(contextKeyService);
		this._configListener = this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.tabCompletion')) {
				this._update();
			}
		});
		this._update();
	}

	getId(): string {
		return TabCompletionController.ID;
	}

	dispose(): void {
		dispose(this._configListener);
		dispose(this._selectionListener);
	}

	private _update(): void {
		const enabled = this._configurationService.getValue<boolean>('editor.tabCompletion');
		if (!enabled) {
			dispose(this._selectionListener);
		} else {
			this._selectionListener = this._editor.onDidChangeCursorSelection(e => this._updateSnippets());
			if (this._editor.getModel()) {
				this._updateSnippets();
			}
		}
	}

	private _updateSnippets(): void {

		// reset first
		this._activeSnippets = [];

		// lots of dance for getting the
		const selection = this._editor.getSelection();
		const model = this._editor.getModel();
		model.tokenizeIfCheap(selection.positionLineNumber);
		const id = model.getLanguageIdAtPosition(selection.positionLineNumber, selection.positionColumn);
		const snippets = this._snippetService.getSnippetsSync(id);

		if (!snippets) {
			// nothing for this language
			this._hasSnippets.set(false);
			return;
		}

		if (Range.isEmpty(selection)) {
			// empty selection -> real text (no whitespace) left of cursor
			const prefix = getNonWhitespacePrefix(model, selection.getPosition());
			if (prefix) {
				for (const snippet of snippets) {
					if (endsWith(prefix, snippet.prefix)) {
						this._activeSnippets.push(snippet);
					}
				}
			}

		} else if (!Range.spansMultipleLines(selection) && model.getValueLengthInRange(selection) <= 100) {
			// actual selection -> snippet must be a full match
			const selected = model.getValueInRange(selection);
			if (selected) {
				for (const snippet of snippets) {
					if (selected === snippet.prefix) {
						this._activeSnippets.push(snippet);
					}
				}
			}
		}

		this._hasSnippets.set(this._activeSnippets.length > 0);
	}

	performSnippetCompletions(): void {

		if (this._activeSnippets.length === 1) {
			// one -> just insert
			const [snippet] = this._activeSnippets;
			SnippetController2.get(this._editor).insert(snippet.codeSnippet, snippet.prefix.length, 0);

		} else if (this._activeSnippets.length > 1) {
			// two or more -> show IntelliSense box
			showSimpleSuggestions(this._editor, this._activeSnippets.map(snippet => new SnippetSuggestion(snippet, snippet.prefix.length)));
		}
	}
}

registerEditorContribution(TabCompletionController);

const TabCompletionCommand = EditorCommand.bindToContribution<TabCompletionController>(TabCompletionController.get);

registerEditorCommand(new TabCompletionCommand({
	id: 'insertSnippet',
	precondition: TabCompletionController.ContextKey,
	handler: x => x.performSnippetCompletions(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(),
		kbExpr: ContextKeyExpr.and(
			EditorContextKeys.textFocus,
			EditorContextKeys.tabDoesNotMoveFocus,
			SnippetController2.InSnippetMode.toNegated()
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
