/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { KeyCode } from 'vs/base/common/keyCodes';
import { RawContextKey, IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ISnippetsService, getNonWhitespacePrefix, ISnippet, SnippetSuggestion } from 'vs/workbench/parts/snippets/electron-browser/snippetsService';
import { Registry } from 'vs/platform/registry/common/platform';
import { endsWith } from 'vs/base/common/strings';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry, commonEditorContribution, EditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SuggestController } from 'vs/editor/contrib/suggest/browser/suggestController';
import { ISuggestSupport, ISuggestResult, SuggestRegistry } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import { IConfigurationRegistry, Extensions as ConfigExt } from 'vs/platform/configuration/common/configurationRegistry';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

class TabCompletionProvider implements ISuggestSupport {

	position: Position;
	snippets: ISnippet[];

	reset(): this {
		return this.set(undefined, undefined);
	}

	set(position: Position, snippets: ISnippet[]): this {
		this.position = position;
		this.snippets = snippets;
		return this;
	}

	provideCompletionItems(model: editorCommon.IModel, position: Position): ISuggestResult {
		if (!this.snippets
			|| this.position.lineNumber !== position.lineNumber
			|| this.position.column > position.column
		) {
			return undefined;
		}
		const delta = position.column - this.position.column;
		const suggestions: SnippetSuggestion[] = [];
		for (const snippet of this.snippets) {
			suggestions.push(new SnippetSuggestion(snippet, delta + snippet.prefix.length));
		}
		return { suggestions };
	}
}

@commonEditorContribution
export class TabCompletionController implements editorCommon.IEditorContribution {

	private static ID = 'editor.tabCompletionController';
	static ContextKey = new RawContextKey<boolean>('hasSnippetCompletions', undefined);

	public static get(editor: editorCommon.ICommonCodeEditor): TabCompletionController {
		return editor.getContribution<TabCompletionController>(TabCompletionController.ID);
	}

	private readonly _editor: editorCommon.ICommonCodeEditor;
	private readonly _snippetController: SnippetController2;
	private readonly _suggestController: SuggestController;
	private readonly _tabCompletionProvider: TabCompletionProvider;
	private readonly _dispoables: IDisposable[] = [];

	constructor(
		editor: editorCommon.ICommonCodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISnippetsService snippetService: ISnippetsService
	) {
		this._editor = editor;
		this._snippetController = SnippetController2.get(editor);
		this._suggestController = SuggestController.get(editor);
		this._tabCompletionProvider = new TabCompletionProvider();
		this._dispoables.push(SuggestRegistry.register('*', this._tabCompletionProvider));

		const hasSnippets = TabCompletionController.ContextKey.bindTo(contextKeyService);
		this._dispoables.push(editor.onDidChangeCursorSelection(e => {

			let snippets: ISnippet[] = [];
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
				snippetService.visitSnippets(editor.getModel().getLanguageIdentifier().id, s => {
					if (selectFn(s)) {
						snippets.push(s);
					}
					return true;
				});
			}
			this._tabCompletionProvider.set(editor.getPosition(), snippets);
			hasSnippets.set(this._tabCompletionProvider.snippets.length > 0);
		}));
	}

	getId(): string {
		return TabCompletionController.ID;
	}

	dispose(): void {
		dispose(this._dispoables);
	}

	performSnippetCompletions(): void {
		const { snippets } = this._tabCompletionProvider;
		if (snippets.length === 1) {
			// one -> just insert
			const [snippet] = snippets;
			this._snippetController.insert(snippet.codeSnippet, snippet.prefix.length, 0);

		} else if (snippets.length > 1) {
			// two or more -> show IntelliSense box
			this._suggestController.triggerSuggest([this._tabCompletionProvider]);
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
