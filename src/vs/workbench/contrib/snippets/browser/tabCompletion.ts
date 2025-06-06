/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from '../../../../base/common/keyCodes.js';
import { RawContextKey, IContextKeyService, ContextKeyExpr, IContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ISnippetsService } from './snippets.js';
import { getNonWhitespacePrefix } from './snippetsService.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { Range } from '../../../../editor/common/core/range.js';
import { registerEditorContribution, EditorCommand, registerEditorCommand, EditorContributionInstantiation } from '../../../../editor/browser/editorExtensions.js';
import { SnippetController2 } from '../../../../editor/contrib/snippet/browser/snippetController2.js';
import { showSimpleSuggestions } from '../../../../editor/contrib/suggest/browser/suggest.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Snippet } from './snippetsFile.js';
import { SnippetCompletion } from './snippetCompletionProvider.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { EditorState, CodeEditorStateFlag } from '../../../../editor/contrib/editorState/browser/editorState.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CompletionItemProvider } from '../../../../editor/common/languages.js';

export class TabCompletionController implements IEditorContribution {

	static readonly ID = 'editor.tabCompletionController';

	static readonly ContextKey = new RawContextKey<boolean>('hasSnippetCompletions', undefined);

	static get(editor: ICodeEditor): TabCompletionController | null {
		return editor.getContribution<TabCompletionController>(TabCompletionController.ID);
	}

	private readonly _hasSnippets: IContextKey<boolean>;
	private readonly _configListener: IDisposable;
	private _enabled?: boolean;
	private _selectionListener?: IDisposable;

	private _activeSnippets: Snippet[] = [];
	private _completionProvider?: IDisposable & CompletionItemProvider;

	constructor(
		private readonly _editor: ICodeEditor,
		@ISnippetsService private readonly _snippetService: ISnippetsService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		this._hasSnippets = TabCompletionController.ContextKey.bindTo(contextKeyService);
		this._configListener = this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.tabCompletion)) {
				this._update();
			}
		});
		this._update();
	}

	dispose(): void {
		this._configListener.dispose();
		this._selectionListener?.dispose();
	}

	private _update(): void {
		const enabled = this._editor.getOption(EditorOption.tabCompletion) === 'onlySnippets';
		if (this._enabled !== enabled) {
			this._enabled = enabled;
			if (!this._enabled) {
				this._selectionListener?.dispose();
			} else {
				this._selectionListener = this._editor.onDidChangeCursorSelection(e => this._updateSnippets());
				if (this._editor.getModel()) {
					this._updateSnippets();
				}
			}
		}
	}

	private _updateSnippets(): void {

		// reset first
		this._activeSnippets = [];
		this._completionProvider?.dispose();

		if (!this._editor.hasModel()) {
			return;
		}

		// lots of dance for getting the
		const selection = this._editor.getSelection();
		const model = this._editor.getModel();
		model.tokenization.tokenizeIfCheap(selection.positionLineNumber);
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
					if (prefix.endsWith(snippet.prefix)) {
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

		const len = this._activeSnippets.length;
		if (len === 0) {
			this._hasSnippets.set(false);
		} else if (len === 1) {
			this._hasSnippets.set(true);
		} else {
			this._hasSnippets.set(true);
			this._completionProvider = {
				_debugDisplayName: 'tabCompletion',
				dispose: () => {
					registration.dispose();
				},
				provideCompletionItems: (_model, position) => {
					if (_model !== model || !selection.containsPosition(position)) {
						return;
					}
					const suggestions = this._activeSnippets.map(snippet => {
						const range = Range.fromPositions(position.delta(0, -snippet.prefix.length), position);
						return new SnippetCompletion(snippet, range);
					});
					return { suggestions };
				}
			};
			const registration = this._languageFeaturesService.completionProvider.register(
				{ language: model.getLanguageId(), pattern: model.uri.fsPath, scheme: model.uri.scheme },
				this._completionProvider
			);
		}
	}

	async performSnippetCompletions() {
		if (!this._editor.hasModel()) {
			return;
		}

		if (this._activeSnippets.length === 1) {
			// one -> just insert
			const [snippet] = this._activeSnippets;

			// async clipboard access might be required and in that case
			// we need to check if the editor has changed in flight and then
			// bail out (or be smarter than that)
			let clipboardText: string | undefined;
			if (snippet.needsClipboard) {
				const state = new EditorState(this._editor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);
				clipboardText = await this._clipboardService.readText();
				if (!state.validate(this._editor)) {
					return;
				}
			}
			SnippetController2.get(this._editor)?.insert(snippet.codeSnippet, {
				overwriteBefore: snippet.prefix.length, overwriteAfter: 0,
				clipboardText
			});

		} else if (this._activeSnippets.length > 1) {
			// two or more -> show IntelliSense box
			if (this._completionProvider) {
				showSimpleSuggestions(this._editor, this._completionProvider);
			}
		}
	}
}

registerEditorContribution(TabCompletionController.ID, TabCompletionController, EditorContributionInstantiation.Eager); // eager because it needs to define a context key

const TabCompletionCommand = EditorCommand.bindToContribution<TabCompletionController>(TabCompletionController.get);

registerEditorCommand(new TabCompletionCommand({
	id: 'insertSnippet',
	precondition: TabCompletionController.ContextKey,
	handler: x => x.performSnippetCompletions(),
	kbOpts: {
		weight: KeybindingWeight.EditorContrib,
		kbExpr: ContextKeyExpr.and(
			EditorContextKeys.editorTextFocus,
			EditorContextKeys.tabDoesNotMoveFocus,
			SnippetController2.InSnippetMode.toNegated()
		),
		primary: KeyCode.Tab
	}
}));
