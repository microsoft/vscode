/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNonEmptyArray } from 'vs/base/common/arrays';
import { TimeoutTimer } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { IDisposable, dispose, DisposableStore, isDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CursorChangeReason, ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { ITextModel, IWordAtPosition } from 'vs/editor/common/model';
import { CompletionItemProvider, StandardTokenType, CompletionContext, CompletionProviderRegistry, CompletionTriggerKind, CompletionItemKind, completionKindFromString } from 'vs/editor/common/modes';
import { CompletionModel } from './completionModel';
import { CompletionItem, getSuggestionComparator, provideSuggestionItems, getSnippetSuggestSupport, SnippetSortOrder, CompletionOptions } from './suggest';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { WordDistance } from 'vs/editor/contrib/suggest/wordDistance';

export interface ICancelEvent {
	readonly retrigger: boolean;
}

export interface ITriggerEvent {
	readonly auto: boolean;
	readonly shy: boolean;
}

export interface ISuggestEvent {
	readonly completionModel: CompletionModel;
	readonly isFrozen: boolean;
	readonly auto: boolean;
	readonly shy: boolean;
}

export interface SuggestTriggerContext {
	readonly auto: boolean;
	readonly shy: boolean;
	readonly triggerCharacter?: string;
}

export class LineContext {

	static shouldAutoTrigger(editor: ICodeEditor): boolean {
		if (!editor.hasModel()) {
			return false;
		}
		const model = editor.getModel();
		const pos = editor.getPosition();
		model.tokenizeIfCheap(pos.lineNumber);

		const word = model.getWordAtPosition(pos);
		if (!word) {
			return false;
		}
		if (word.endColumn !== pos.column) {
			return false;
		}
		if (!isNaN(Number(word.word))) {
			return false;
		}
		return true;
	}

	readonly lineNumber: number;
	readonly column: number;
	readonly leadingLineContent: string;
	readonly leadingWord: IWordAtPosition;
	readonly auto: boolean;
	readonly shy: boolean;

	constructor(model: ITextModel, position: Position, auto: boolean, shy: boolean) {
		this.leadingLineContent = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
		this.leadingWord = model.getWordUntilPosition(position);
		this.lineNumber = position.lineNumber;
		this.column = position.column;
		this.auto = auto;
		this.shy = shy;
	}
}

export const enum State {
	Idle = 0,
	Manual = 1,
	Auto = 2
}

export class SuggestModel implements IDisposable {

	private readonly _toDispose = new DisposableStore();
	private _quickSuggestDelay: number = 10;
	private _triggerCharacterListener?: IDisposable;
	private readonly _triggerQuickSuggest = new TimeoutTimer();
	private _state: State = State.Idle;

	private _requestToken?: CancellationTokenSource;
	private _context?: LineContext;
	private _currentSelection: Selection;

	private _completionModel: CompletionModel | undefined;
	private readonly _completionDisposables = new DisposableStore();
	private readonly _onDidCancel = new Emitter<ICancelEvent>();
	private readonly _onDidTrigger = new Emitter<ITriggerEvent>();
	private readonly _onDidSuggest = new Emitter<ISuggestEvent>();

	readonly onDidCancel: Event<ICancelEvent> = this._onDidCancel.event;
	readonly onDidTrigger: Event<ITriggerEvent> = this._onDidTrigger.event;
	readonly onDidSuggest: Event<ISuggestEvent> = this._onDidSuggest.event;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _editorWorker: IEditorWorkerService
	) {
		this._currentSelection = this._editor.getSelection() || new Selection(1, 1, 1, 1);

		// wire up various listeners
		this._toDispose.add(this._editor.onDidChangeModel(() => {
			this._updateTriggerCharacters();
			this.cancel();
		}));
		this._toDispose.add(this._editor.onDidChangeModelLanguage(() => {
			this._updateTriggerCharacters();
			this.cancel();
		}));
		this._toDispose.add(this._editor.onDidChangeConfiguration(() => {
			this._updateTriggerCharacters();
			this._updateQuickSuggest();
		}));
		this._toDispose.add(CompletionProviderRegistry.onDidChange(() => {
			this._updateTriggerCharacters();
			this._updateActiveSuggestSession();
		}));
		this._toDispose.add(this._editor.onDidChangeCursorSelection(e => {
			this._onCursorChange(e);
		}));

		let editorIsComposing = false;
		this._toDispose.add(this._editor.onCompositionStart(() => {
			editorIsComposing = true;
		}));
		this._toDispose.add(this._editor.onCompositionEnd(() => {
			// refilter when composition ends
			editorIsComposing = false;
			this._refilterCompletionItems();
		}));
		this._toDispose.add(this._editor.onDidChangeModelContent(() => {
			// only filter completions when the editor isn't
			// composing a character, e.g. ¨ + u makes ü but just
			// ¨ cannot be used for filtering
			if (!editorIsComposing) {
				this._refilterCompletionItems();
			}
		}));

		this._updateTriggerCharacters();
		this._updateQuickSuggest();
	}

	dispose(): void {
		dispose(this._triggerCharacterListener);
		dispose([this._onDidCancel, this._onDidSuggest, this._onDidTrigger, this._triggerQuickSuggest]);
		this._toDispose.dispose();
		this._completionDisposables.dispose();
		this.cancel();
	}

	// --- handle configuration & precondition changes

	private _updateQuickSuggest(): void {
		this._quickSuggestDelay = this._editor.getConfiguration().contribInfo.quickSuggestionsDelay;

		if (isNaN(this._quickSuggestDelay) || (!this._quickSuggestDelay && this._quickSuggestDelay !== 0) || this._quickSuggestDelay < 0) {
			this._quickSuggestDelay = 10;
		}
	}

	private _updateTriggerCharacters(): void {

		dispose(this._triggerCharacterListener);

		if (this._editor.getConfiguration().readOnly
			|| !this._editor.hasModel()
			|| !this._editor.getConfiguration().contribInfo.suggestOnTriggerCharacters) {

			return;
		}

		const supportsByTriggerCharacter: { [ch: string]: Set<CompletionItemProvider> } = Object.create(null);
		for (const support of CompletionProviderRegistry.all(this._editor.getModel())) {
			for (const ch of support.triggerCharacters || []) {
				let set = supportsByTriggerCharacter[ch];
				if (!set) {
					set = supportsByTriggerCharacter[ch] = new Set();
					set.add(getSnippetSuggestSupport());
				}
				set.add(support);
			}
		}

		this._triggerCharacterListener = this._editor.onDidType(text => {
			const lastChar = text.charAt(text.length - 1);
			const supports = supportsByTriggerCharacter[lastChar];

			if (supports) {
				// keep existing items that where not computed by the
				// supports/providers that want to trigger now
				const items: CompletionItem[] | undefined = this._completionModel ? this._completionModel.adopt(supports) : undefined;
				this.trigger({ auto: true, shy: false, triggerCharacter: lastChar }, Boolean(this._completionModel), supports, items);
			}
		});
	}

	// --- trigger/retrigger/cancel suggest

	get state(): State {
		return this._state;
	}

	cancel(retrigger: boolean = false): void {
		if (this._state !== State.Idle) {
			this._triggerQuickSuggest.cancel();
			if (this._requestToken) {
				this._requestToken.cancel();
				this._requestToken = undefined;
			}
			this._state = State.Idle;
			this._completionModel = undefined;
			this._context = undefined;
			this._onDidCancel.fire({ retrigger });
		}
	}

	clear() {
		this._completionDisposables.clear();
	}

	private _updateActiveSuggestSession(): void {
		if (this._state !== State.Idle) {
			if (!this._editor.hasModel() || !CompletionProviderRegistry.has(this._editor.getModel())) {
				this.cancel();
			} else {
				this.trigger({ auto: this._state === State.Auto, shy: false }, true);
			}
		}
	}

	private _onCursorChange(e: ICursorSelectionChangedEvent): void {

		if (!this._editor.hasModel()) {
			return;
		}

		const model = this._editor.getModel();
		const prevSelection = this._currentSelection;
		this._currentSelection = this._editor.getSelection();

		if (!e.selection.isEmpty()
			|| e.reason !== CursorChangeReason.NotSet
			|| (e.source !== 'keyboard' && e.source !== 'deleteLeft')
		) {
			// Early exit if nothing needs to be done!
			// Leave some form of early exit check here if you wish to continue being a cursor position change listener ;)
			if (this._state !== State.Idle) {
				this.cancel();
			}
			return;
		}

		if (!CompletionProviderRegistry.has(model)) {
			return;
		}

		if (this._state === State.Idle) {

			if (this._editor.getConfiguration().contribInfo.quickSuggestions === false) {
				// not enabled
				return;
			}

			if (!prevSelection.containsRange(this._currentSelection) && !prevSelection.getEndPosition().isBeforeOrEqual(this._currentSelection.getPosition())) {
				// cursor didn't move RIGHT
				return;
			}

			if (this._editor.getConfiguration().contribInfo.suggest.snippetsPreventQuickSuggestions && SnippetController2.get(this._editor).isInSnippet()) {
				// no quick suggestion when in snippet mode
				return;
			}

			this.cancel();

			this._triggerQuickSuggest.cancelAndSet(() => {
				if (this._state !== State.Idle) {
					return;
				}
				if (!LineContext.shouldAutoTrigger(this._editor)) {
					return;
				}
				if (!this._editor.hasModel()) {
					return;
				}
				const model = this._editor.getModel();
				const pos = this._editor.getPosition();
				// validate enabled now
				const { quickSuggestions } = this._editor.getConfiguration().contribInfo;
				if (quickSuggestions === false) {
					return;
				} else if (quickSuggestions === true) {
					// all good
				} else {
					// Check the type of the token that triggered this
					model.tokenizeIfCheap(pos.lineNumber);
					const lineTokens = model.getLineTokens(pos.lineNumber);
					const tokenType = lineTokens.getStandardTokenType(lineTokens.findTokenIndexAtOffset(Math.max(pos.column - 1 - 1, 0)));
					const inValidScope = quickSuggestions.other && tokenType === StandardTokenType.Other
						|| quickSuggestions.comments && tokenType === StandardTokenType.Comment
						|| quickSuggestions.strings && tokenType === StandardTokenType.String;

					if (!inValidScope) {
						return;
					}
				}

				// we made it till here -> trigger now
				this.trigger({ auto: true, shy: false });

			}, this._quickSuggestDelay);

		}
	}

	private _refilterCompletionItems(): void {
		// Re-filter suggestions. This MUST run async because filtering/scoring
		// uses the model content AND the cursor position. The latter is NOT
		// updated when the document has changed (the event which drives this method)
		// and therefore a little pause (next mirco task) is needed. See:
		// https://stackoverflow.com/questions/25915634/difference-between-microtask-and-macrotask-within-an-event-loop-context#25933985
		Promise.resolve().then(() => {
			if (this._state === State.Idle) {
				return;
			}
			if (!this._editor.hasModel()) {
				return;
			}
			const model = this._editor.getModel();
			const position = this._editor.getPosition();
			const ctx = new LineContext(model, position, this._state === State.Auto, false);
			this._onNewContext(ctx);
		});
	}

	trigger(context: SuggestTriggerContext, retrigger: boolean = false, onlyFrom?: Set<CompletionItemProvider>, existingItems?: CompletionItem[]): void {
		if (!this._editor.hasModel()) {
			return;
		}

		const model = this._editor.getModel();
		const auto = context.auto;
		const ctx = new LineContext(model, this._editor.getPosition(), auto, context.shy);

		// Cancel previous requests, change state & update UI
		this.cancel(retrigger);
		this._state = auto ? State.Auto : State.Manual;
		this._onDidTrigger.fire({ auto, shy: context.shy });

		// Capture context when request was sent
		this._context = ctx;

		// Build context for request
		let suggestCtx: CompletionContext;
		if (context.triggerCharacter) {
			suggestCtx = {
				triggerKind: CompletionTriggerKind.TriggerCharacter,
				triggerCharacter: context.triggerCharacter
			};
		} else if (onlyFrom && onlyFrom.size > 0) {
			suggestCtx = { triggerKind: CompletionTriggerKind.TriggerForIncompleteCompletions };
		} else {
			suggestCtx = { triggerKind: CompletionTriggerKind.Invoke };
		}

		this._requestToken = new CancellationTokenSource();

		// kind filter and snippet sort rules
		const { contribInfo } = this._editor.getConfiguration();
		let itemKindFilter = new Set<CompletionItemKind>();
		let snippetSortOrder = SnippetSortOrder.Inline;
		switch (contribInfo.suggest.snippets) {
			case 'top':
				snippetSortOrder = SnippetSortOrder.Top;
				break;
			// 	↓ that's the default anyways...
			// case 'inline':
			// 	snippetSortOrder = SnippetSortOrder.Inline;
			// 	break;
			case 'bottom':
				snippetSortOrder = SnippetSortOrder.Bottom;
				break;
			case 'none':
				itemKindFilter.add(CompletionItemKind.Snippet);
				break;
		}

		// kind filter
		for (const key in contribInfo.suggest.filteredTypes) {
			const kind = completionKindFromString(key, true);
			if (typeof kind !== 'undefined' && contribInfo.suggest.filteredTypes[key] === false) {
				itemKindFilter.add(kind);
			}
		}

		let wordDistance = WordDistance.create(this._editorWorker, this._editor);

		let items = provideSuggestionItems(
			model,
			this._editor.getPosition(),
			new CompletionOptions(snippetSortOrder, itemKindFilter, onlyFrom),
			suggestCtx,
			this._requestToken.token
		);

		Promise.all([items, wordDistance]).then(([items, wordDistance]) => {

			dispose(this._requestToken);

			if (this._state === State.Idle) {
				return;
			}

			if (!this._editor.hasModel()) {
				return;
			}

			const model = this._editor.getModel();

			if (isNonEmptyArray(existingItems)) {
				const cmpFn = getSuggestionComparator(snippetSortOrder);
				items = items.concat(existingItems).sort(cmpFn);
			}

			const ctx = new LineContext(model, this._editor.getPosition(), auto, context.shy);
			this._completionModel = new CompletionModel(items, this._context!.column, {
				leadingLineContent: ctx.leadingLineContent,
				characterCountDelta: ctx.column - this._context!.column
			},
				wordDistance,
				this._editor.getConfiguration().contribInfo.suggest
			);

			// store containers so that they can be disposed later
			for (const item of items) {
				if (isDisposable(item.container)) {
					this._completionDisposables.add(item.container);
				}
			}

			this._onNewContext(ctx);

		}).catch(onUnexpectedError);
	}

	private _onNewContext(ctx: LineContext): void {

		if (!this._context) {
			// happens when 24x7 IntelliSense is enabled and still in its delay
			return;
		}

		if (ctx.lineNumber !== this._context.lineNumber) {
			// e.g. happens when pressing Enter while IntelliSense is computed
			this.cancel();
			return;
		}

		if (ctx.leadingWord.startColumn < this._context.leadingWord.startColumn) {
			// happens when the current word gets outdented
			this.cancel();
			return;
		}

		if (ctx.column < this._context.column) {
			// typed -> moved cursor LEFT -> retrigger if still on a word
			if (ctx.leadingWord.word) {
				this.trigger({ auto: this._context.auto, shy: false }, true);
			} else {
				this.cancel();
			}
			return;
		}

		if (!this._completionModel) {
			// happens when IntelliSense is not yet computed
			return;
		}

		if (ctx.column > this._context.column && this._completionModel.incomplete.size > 0 && ctx.leadingWord.word.length !== 0) {
			// typed -> moved cursor RIGHT & incomple model & still on a word -> retrigger
			const { incomplete } = this._completionModel;
			const adopted = this._completionModel.adopt(incomplete);
			this.trigger({ auto: this._state === State.Auto, shy: false }, true, incomplete, adopted);

		} else {
			// typed -> moved cursor RIGHT -> update UI
			let oldLineContext = this._completionModel.lineContext;
			let isFrozen = false;

			this._completionModel.lineContext = {
				leadingLineContent: ctx.leadingLineContent,
				characterCountDelta: ctx.column - this._context.column
			};

			if (this._completionModel.items.length === 0) {

				if (LineContext.shouldAutoTrigger(this._editor) && this._context.leadingWord.endColumn < ctx.leadingWord.startColumn) {
					// retrigger when heading into a new word
					this.trigger({ auto: this._context.auto, shy: false }, true);
					return;
				}

				if (!this._context.auto) {
					// freeze when IntelliSense was manually requested
					this._completionModel.lineContext = oldLineContext;
					isFrozen = this._completionModel.items.length > 0;

					if (isFrozen && ctx.leadingWord.word.length === 0) {
						// there were results before but now there aren't
						// and also we are not on a word anymore -> cancel
						this.cancel();
						return;
					}

				} else {
					// nothing left
					this.cancel();
					return;
				}
			}

			this._onDidSuggest.fire({
				completionModel: this._completionModel,
				auto: this._context.auto,
				shy: this._context.shy,
				isFrozen,
			});
		}
	}
}
