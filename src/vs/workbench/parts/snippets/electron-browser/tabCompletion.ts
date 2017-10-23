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
import { CommonEditorRegistry, commonEditorContribution, EditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { showSimpleSuggestions } from 'vs/editor/contrib/suggest/browser/suggest';
import { IConfigurationRegistry, Extensions as ConfigExt } from 'vs/platform/configuration/common/configurationRegistry';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

@commonEditorContribution
export class TabCompletionController implements editorCommon.IEditorContribution {

	private static ID = 'editor.tabCompletionController';
	static ContextKey = new RawContextKey<boolean>('hasSnippetCompletions', undefined);

	public static get(editor: editorCommon.ICommonCodeEditor): TabCompletionController {
		return editor.getContribution<TabCompletionController>(TabCompletionController.ID);
	}

	private readonly _hasSnippets: IContextKey<boolean>;

	private _snippets: Snippet[] = [];
	private _selectionListener: IDisposable;
	private _configListener: IDisposable;

	constructor(
		private readonly _editor: editorCommon.ICommonCodeEditor,
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
			this._updateSnippets();
		}
	}

	private _updateSnippets(): void {

		let selection = this._editor.getSelection();
		let model = this._editor.getModel();
		let selectFn: (snippet: Snippet) => boolean;

		if (!selection || !model) {
			// too early
			this._hasSnippets.set(false);
			this._snippets = undefined;
			return;
		}

		if (selection.isEmpty()) {
			// empty selection -> real text (no whitespace) left of cursor
			const prefix = getNonWhitespacePrefix(model, this._editor.getPosition());
			selectFn = prefix && (snippet => endsWith(prefix, snippet.prefix));

		} else if (selection.startLineNumber === selection.endLineNumber && model.getValueLengthInRange(selection) <= 100) {
			// actual selection -> snippet must be a full match
			const selected = model.getValueInRange(selection);
			selectFn = snippet => selected === snippet.prefix;
		}

		if (selectFn) {
			model.tokenizeIfCheap(selection.positionLineNumber);
			const id = model.getLanguageIdAtPosition(selection.positionLineNumber, selection.positionColumn);
			this._snippets = this._snippetService.getSnippetsSync(id).filter(selectFn);
		}

		this._hasSnippets.set(this._snippets.length > 0);
	}

	performSnippetCompletions(): void {

		if (this._snippets.length === 1) {
			// one -> just insert
			const [snippet] = this._snippets;
			SnippetController2.get(this._editor).insert(snippet.codeSnippet, snippet.prefix.length, 0);

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
