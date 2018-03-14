/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { TimeoutTimer } from 'vs/base/common/async';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITextModel, IWordAtPosition } from 'vs/editor/common/model';
import { ISuggestSupport, SuggestRegistry, StandardTokenType, SuggestTriggerKind, SuggestContext } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { provideSuggestionItems, getSuggestionComparator, ISuggestionItem } from './suggest';
import { CompletionModel } from './completionModel';
import { CursorChangeReason, ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

export interface ICancelEvent {
	readonly retrigger: boolean;
}

export interface ITriggerEvent {
	readonly auto: boolean;
}

export interface ISuggestEvent {
	readonly completionModel: CompletionModel;
	readonly isFrozen: boolean;
	readonly auto: boolean;
}

export interface SuggestTriggerContext {
	readonly auto: boolean;
	readonly triggerCharacter?: string;
}

export class LineContext {

	static shouldAutoTrigger(editor: ICodeEditor): boolean {
		const model = editor.getModel();
		if (!model) {
			return false;
		}
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

	constructor(model: ITextModel, position: Position, auto: boolean) {
		this.leadingLineContent = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
		this.leadingWord = model.getWordUntilPosition(position);
		this.lineNumber = position.lineNumber;
		this.column = position.column;
		this.auto = auto;
	}
}

export const enum State {
	Idle = 0,
	Manual = 1,
	Auto = 2
}

export class SuggestModel implements IDisposable {

	private _editor: ICodeEditor;
	private _toDispose: IDisposable[] = [];
	private _quickSuggestDelay: number;
	private _triggerCharacterListener: IDisposable;
	private _triggerAutoSuggestPromise: TPromise<void>;
	private _triggerRefilter = new TimeoutTimer();
	private _state: State;

	private _requestPromise: TPromise<void>;
	private _context: LineContext;
	private _currentSelection: Selection;

	private _completionModel: CompletionModel;
	private readonly _onDidCancel: Emitter<ICancelEvent> = new Emitter<ICancelEvent>();
	private readonly _onDidTrigger: Emitter<ITriggerEvent> = new Emitter<ITriggerEvent>();
	private readonly _onDidSuggest: Emitter<ISuggestEvent> = new Emitter<ISuggestEvent>();

	readonly onDidCancel: Event<ICancelEvent> = this._onDidCancel.event;
	readonly onDidTrigger: Event<ITriggerEvent> = this._onDidTrigger.event;
	readonly onDidSuggest: Event<ISuggestEvent> = this._onDidSuggest.event;

	constructor(editor: ICodeEditor) {
		this._editor = editor;
		this._state = State.Idle;
		this._triggerAutoSuggestPromise = null;
		this._requestPromise = null;
		this._completionModel = null;
		this._context = null;
		this._currentSelection = this._editor.getSelection() || new Selection(1, 1, 1, 1);

		// wire up various listeners
		this._toDispose.push(this._editor.onDidChangeModel(() => {
			this._updateTriggerCharacters();
			this.cancel();
		}));
		this._toDispose.push(this._editor.onDidChangeModelLanguage(() => {
			this._updateTriggerCharacters();
			this.cancel();
		}));
		this._toDispose.push(this._editor.onDidChangeConfiguration(() => {
			this._updateTriggerCharacters();
			this._updateQuickSuggest();
		}));
		this._toDispose.push(SuggestRegistry.onDidChange(() => {
			this._updateTriggerCharacters();
			this._updateActiveSuggestSession();
		}));
		this._toDispose.push(this._editor.onDidChangeCursorSelection(e => {
			this._onCursorChange(e);
		}));
		this._toDispose.push(this._editor.onDidChangeModelContent(e => {
			this._refilterCompletionItems();
		}));

		this._updateTriggerCharacters();
		this._updateQuickSuggest();
	}

	dispose(): void {
		dispose([this._onDidCancel, this._onDidSuggest, this._onDidTrigger, this._triggerCharacterListener, this._triggerRefilter]);
		this._toDispose = dispose(this._toDispose);
		dispose(this._completionModel);
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
			|| !this._editor.getModel()
			|| !this._editor.getConfiguration().contribInfo.suggestOnTriggerCharacters) {

			return;
		}

		const supportsByTriggerCharacter: { [ch: string]: ISuggestSupport[] } = Object.create(null);
		for (const support of SuggestRegistry.all(this._editor.getModel())) {
			if (isFalsyOrEmpty(support.triggerCharacters)) {
				continue;
			}
			for (const ch of support.triggerCharacters) {
				const array = supportsByTriggerCharacter[ch];
				if (!array) {
					supportsByTriggerCharacter[ch] = [support];
				} else {
					array.push(support);
				}
			}
		}

		this._triggerCharacterListener = this._editor.onDidType(text => {
			const lastChar = text.charAt(text.length - 1);
			const supports = supportsByTriggerCharacter[lastChar];

			if (supports) {
				// keep existing items that where not computed by the
				// supports/providers that want to trigger now
				const items: ISuggestionItem[] = [];
				if (this._completionModel) {
					for (const item of this._completionModel.items) {
						if (supports.indexOf(item.support) < 0) {
							items.push(item);
						}
					}
				}
				this.trigger({ auto: true, triggerCharacter: lastChar }, Boolean(this._completionModel), supports, items);
			}
		});
	}

	// --- trigger/retrigger/cancel suggest

	get state(): State {
		return this._state;
	}

	cancel(retrigger: boolean = false): void {

		this._triggerRefilter.cancel();

		if (this._triggerAutoSuggestPromise) {
			this._triggerAutoSuggestPromise.cancel();
			this._triggerAutoSuggestPromise = null;
		}

		if (this._requestPromise) {
			this._requestPromise.cancel();
			this._requestPromise = null;
		}

		this._state = State.Idle;
		dispose(this._completionModel);
		this._completionModel = null;
		this._context = null;

		this._onDidCancel.fire({ retrigger });
	}

	private _updateActiveSuggestSession(): void {
		if (this._state !== State.Idle) {
			if (!SuggestRegistry.has(this._editor.getModel())) {
				this.cancel();
			} else {
				this.trigger({ auto: this._state === State.Auto }, true);
			}
		}
	}

	private _onCursorChange(e: ICursorSelectionChangedEvent): void {

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

		if (!SuggestRegistry.has(this._editor.getModel())) {
			return;
		}

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		if (this._state === State.Idle) {

			// trigger 24x7 IntelliSense when idle, enabled, when cursor
			// moved RIGHT, and when at a good position
			if (this._editor.getConfiguration().contribInfo.quickSuggestions !== false
				&& (prevSelection.containsRange(this._currentSelection)
					|| prevSelection.getEndPosition().isBeforeOrEqual(this._currentSelection.getPosition()))
			) {
				this.cancel();

				this._triggerAutoSuggestPromise = TPromise.timeout(this._quickSuggestDelay);
				this._triggerAutoSuggestPromise.then(() => {
					if (LineContext.shouldAutoTrigger(this._editor)) {
						const model = this._editor.getModel();
						const pos = this._editor.getPosition();

						if (!model) {
							return;
						}
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

						this.trigger({ auto: true });
					}
					this._triggerAutoSuggestPromise = null;
				});
			}
		}
	}

	private _refilterCompletionItems(): void {
		if (this._state === State.Idle) {
			return;
		}
		const model = this._editor.getModel();
		if (model) {
			// refine active suggestion
			this._triggerRefilter.cancelAndSet(() => {
				const position = this._editor.getPosition();
				const ctx = new LineContext(model, position, this._state === State.Auto);
				this._onNewContext(ctx);
			}, 25);
		}
	}

	trigger(context: SuggestTriggerContext, retrigger: boolean = false, onlyFrom?: ISuggestSupport[], existingItems?: ISuggestionItem[]): void {

		const model = this._editor.getModel();

		if (!model) {
			return;
		}
		const auto = context.auto;
		const ctx = new LineContext(model, this._editor.getPosition(), auto);

		// Cancel previous requests, change state & update UI
		this.cancel(retrigger);
		this._state = auto ? State.Auto : State.Manual;
		this._onDidTrigger.fire({ auto });

		// Capture context when request was sent
		this._context = ctx;

		// Build context for request
		let suggestCtx: SuggestContext;
		if (context.triggerCharacter) {
			suggestCtx = {
				triggerKind: SuggestTriggerKind.TriggerCharacter,
				triggerCharacter: context.triggerCharacter
			};
		} else if (onlyFrom && onlyFrom.length) {
			suggestCtx = { triggerKind: SuggestTriggerKind.TriggerForIncompleteCompletions };
		} else {
			suggestCtx = { triggerKind: SuggestTriggerKind.Invoke };
		}

		this._requestPromise = provideSuggestionItems(model, this._editor.getPosition(),
			this._editor.getConfiguration().contribInfo.snippetSuggestions,
			onlyFrom,
			suggestCtx
		).then(items => {

			this._requestPromise = null;
			if (this._state === State.Idle) {
				return;
			}
			const model = this._editor.getModel();
			if (!model) {
				return;
			}

			if (!isFalsyOrEmpty(existingItems)) {
				const cmpFn = getSuggestionComparator(this._editor.getConfiguration().contribInfo.snippetSuggestions);
				items = items.concat(existingItems).sort(cmpFn);
			}

			const ctx = new LineContext(model, this._editor.getPosition(), auto);
			dispose(this._completionModel);
			this._completionModel = new CompletionModel(items, this._context.column, {
				leadingLineContent: ctx.leadingLineContent,
				characterCountDelta: this._context ? ctx.column - this._context.column : 0
			}, this._editor.getConfiguration().contribInfo.snippetSuggestions);
			this._onNewContext(ctx);

		}).then(null, onUnexpectedError);
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
				this.trigger({ auto: this._context.auto }, true);
			} else {
				this.cancel();
			}
			return;
		}

		if (!this._completionModel) {
			// happens when IntelliSense is not yet computed
			return;
		}

		if (ctx.column > this._context.column && this._completionModel.incomplete && ctx.leadingWord.word.length !== 0) {
			// typed -> moved cursor RIGHT & incomple model & still on a word -> retrigger
			const { complete, incomplete } = this._completionModel.resolveIncompleteInfo();
			this.trigger({ auto: this._state === State.Auto }, true, incomplete, complete);

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
					this.trigger({ auto: this._context.auto }, true);
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
				isFrozen,
			});
		}
	}
}
