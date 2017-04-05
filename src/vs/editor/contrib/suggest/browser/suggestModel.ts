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
import { ICommonCodeEditor, ICursorSelectionChangedEvent, CursorChangeReason, IModel, IPosition, IWordAtPosition } from 'vs/editor/common/editorCommon';
import { ISuggestSupport, SuggestRegistry, StandardTokenType } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import { provideSuggestionItems, getSuggestionComparator, ISuggestionItem } from './suggest';
import { CompletionModel } from './completionModel';

export interface ICancelEvent {
	retrigger: boolean;
}

export interface ITriggerEvent {
	auto: boolean;
}

export interface ISuggestEvent {
	completionModel: CompletionModel;
	isFrozen: boolean;
	auto: boolean;
}

export class LineContext {

	static shouldAutoTrigger(editor: ICommonCodeEditor): boolean {
		const model = editor.getModel();
		if (!model) {
			return false;
		}
		const pos = editor.getPosition();
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

	static isInEditableRange(editor: ICommonCodeEditor): boolean {
		const model = editor.getModel();
		const position = editor.getPosition();
		if (model.hasEditableRange()) {
			const editableRange = model.getEditableRange();
			if (!editableRange.containsPosition(position)) {
				return false;
			}
		}
		return true;
	}

	readonly lineNumber: number;
	readonly column: number;
	readonly leadingLineContent: string;
	readonly leadingWord: IWordAtPosition;
	readonly auto;

	constructor(model: IModel, position: IPosition, auto: boolean) {
		this.leadingLineContent = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
		this.leadingWord = model.getWordUntilPosition(position);
		this.lineNumber = position.lineNumber;
		this.column = position.column;
		this.auto = auto;
	}
}

const enum State {
	Idle = 0,
	Manual = 1,
	Auto = 2
}

export class SuggestModel implements IDisposable {

	private toDispose: IDisposable[] = [];
	private quickSuggestDelay: number;
	private triggerCharacterListener: IDisposable;
	private triggerAutoSuggestPromise: TPromise<void>;
	private triggerRefilter = new TimeoutTimer();
	private state: State;

	private requestPromise: TPromise<void>;
	private context: LineContext;
	private currentPosition: Position;

	private completionModel: CompletionModel;

	private _onDidCancel: Emitter<ICancelEvent> = new Emitter();
	get onDidCancel(): Event<ICancelEvent> { return this._onDidCancel.event; }

	private _onDidTrigger: Emitter<ITriggerEvent> = new Emitter();
	get onDidTrigger(): Event<ITriggerEvent> { return this._onDidTrigger.event; }

	private _onDidSuggest: Emitter<ISuggestEvent> = new Emitter();
	get onDidSuggest(): Event<ISuggestEvent> { return this._onDidSuggest.event; }

	constructor(private editor: ICommonCodeEditor) {
		this.state = State.Idle;
		this.triggerAutoSuggestPromise = null;
		this.requestPromise = null;
		this.completionModel = null;
		this.context = null;
		this.currentPosition = editor.getPosition() || new Position(1, 1);

		// wire up various listeners
		this.toDispose.push(this.editor.onDidChangeModel(() => {
			this.updateTriggerCharacters();
			this.cancel();
		}));
		this.toDispose.push(editor.onDidChangeModelLanguage(() => {
			this.updateTriggerCharacters();
			this.cancel();
		}));
		this.toDispose.push(this.editor.onDidChangeConfiguration(() => {
			this.updateTriggerCharacters();
			this.updateQuickSuggest();
		}));
		this.toDispose.push(SuggestRegistry.onDidChange(() => {
			this.updateTriggerCharacters();
			this.updateActiveSuggestSession();
		}));
		this.toDispose.push(this.editor.onDidChangeCursorSelection(e => {
			this.onCursorChange(e);
		}));

		this.updateTriggerCharacters();
		this.updateQuickSuggest();
	}

	dispose(): void {
		dispose([this._onDidCancel, this._onDidSuggest, this._onDidTrigger, this.triggerCharacterListener, this.triggerRefilter]);
		this.toDispose = dispose(this.toDispose);
		this.cancel();
	}

	// --- handle configuration & precondition changes

	private updateQuickSuggest(): void {
		this.quickSuggestDelay = this.editor.getConfiguration().contribInfo.quickSuggestionsDelay;

		if (isNaN(this.quickSuggestDelay) || (!this.quickSuggestDelay && this.quickSuggestDelay !== 0) || this.quickSuggestDelay < 0) {
			this.quickSuggestDelay = 10;
		}
	}

	private updateTriggerCharacters(): void {

		dispose(this.triggerCharacterListener);

		if (this.editor.getConfiguration().readOnly
			|| !this.editor.getModel()
			|| !this.editor.getConfiguration().contribInfo.suggestOnTriggerCharacters) {

			return;
		}

		const supportsByTriggerCharacter: { [ch: string]: ISuggestSupport[] } = Object.create(null);
		for (const support of SuggestRegistry.all(this.editor.getModel())) {
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

		this.triggerCharacterListener = this.editor.onDidType(text => {
			const lastChar = text.charAt(text.length - 1);
			const supports = supportsByTriggerCharacter[lastChar];

			if (supports) {
				// keep existing items that where not computed by the
				// supports/providers that want to trigger now
				const items: ISuggestionItem[] = [];
				if (this.completionModel) {
					for (const item of this.completionModel.items) {
						if (supports.indexOf(item.support) < 0) {
							items.push(item);
						}
					}
				}
				this.trigger(true, false, supports, items);
			}
		});
	}

	// --- trigger/retrigger/cancel suggest

	cancel(retrigger: boolean = false): void {

		if (this.triggerAutoSuggestPromise) {
			this.triggerAutoSuggestPromise.cancel();
			this.triggerAutoSuggestPromise = null;
		}

		if (this.requestPromise) {
			this.requestPromise.cancel();
			this.requestPromise = null;
		}

		this.state = State.Idle;
		this.completionModel = null;
		this.context = null;

		this._onDidCancel.fire({ retrigger });
	}

	private updateActiveSuggestSession(): void {
		if (this.state !== State.Idle) {
			if (!SuggestRegistry.has(this.editor.getModel())) {
				this.cancel();
			} else {
				this.trigger(this.state === State.Auto, true);
			}
		}
	}

	private onCursorChange(e: ICursorSelectionChangedEvent): void {

		const prevPosition = this.currentPosition;
		this.currentPosition = this.editor.getPosition();

		if (!e.selection.isEmpty()
			|| e.source !== 'keyboard'
			|| e.reason !== CursorChangeReason.NotSet) {

			this.cancel();
			return;
		}

		if (!SuggestRegistry.has(this.editor.getModel())) {
			return;
		}

		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		if (this.state === State.Idle) {

			// trigger 24x7 IntelliSense when idle, enabled, when cursor
			// moved RIGHT, and when at a good position
			if (this.editor.getConfiguration().contribInfo.quickSuggestions !== false
				&& prevPosition.isBefore(this.currentPosition)
			) {

				this.cancel();

				if (LineContext.shouldAutoTrigger(this.editor)) {
					this.triggerAutoSuggestPromise = TPromise.timeout(this.quickSuggestDelay);
					this.triggerAutoSuggestPromise.then(() => {
						const model = this.editor.getModel();
						const pos = this.editor.getPosition();

						if (!model) {
							return;
						}
						// validate enabled now
						const { quickSuggestions } = this.editor.getConfiguration().contribInfo;
						if (quickSuggestions === false) {
							return;
						} else if (quickSuggestions === true) {
							// all good
						} else {
							model.forceTokenization(pos.lineNumber);
							const { tokenType } = model
								.getLineTokens(pos.lineNumber)
								.findTokenAtOffset(pos.column - 1);

							const inValidScope = quickSuggestions.other && tokenType === StandardTokenType.Other
								|| quickSuggestions.comments && tokenType === StandardTokenType.Comment
								|| quickSuggestions.strings && tokenType === StandardTokenType.String;

							if (!inValidScope) {
								return;
							}
						}

						this.triggerAutoSuggestPromise = null;
						this.trigger(true);
					});
				}
			}

		} else {
			// refine active suggestion
			this.triggerRefilter.cancelAndSet(() => {
				const position = this.editor.getPosition();
				const ctx = new LineContext(model, position, this.state === State.Auto);
				this.onNewContext(ctx);
			}, 25);
		}
	}

	public trigger(auto: boolean, retrigger: boolean = false, onlyFrom?: ISuggestSupport[], existingItems?: ISuggestionItem[]): void {

		const model = this.editor.getModel();

		if (!model) {
			return;
		}

		const ctx = new LineContext(model, this.editor.getPosition(), auto);

		if (!LineContext.isInEditableRange(this.editor)) {
			return;
		}

		// Cancel previous requests, change state & update UI
		this.cancel(retrigger);
		this.state = auto ? State.Auto : State.Manual;
		this._onDidTrigger.fire({ auto });

		// Capture context when request was sent
		this.context = ctx;

		this.requestPromise = provideSuggestionItems(model, this.editor.getPosition(),
			this.editor.getConfiguration().contribInfo.snippetSuggestions,
			onlyFrom
		).then(items => {

			this.requestPromise = null;
			if (this.state === State.Idle) {
				return;
			}
			const model = this.editor.getModel();
			if (!model) {
				return;
			}

			if (!isFalsyOrEmpty(existingItems)) {
				const cmpFn = getSuggestionComparator(this.editor.getConfiguration().contribInfo.snippetSuggestions);
				items = items.concat(existingItems).sort(cmpFn);
			}

			const ctx = new LineContext(model, this.editor.getPosition(), auto);
			this.completionModel = new CompletionModel(items, this.context.column, {
				leadingLineContent: ctx.leadingLineContent,
				characterCountDelta: this.context ? ctx.column - this.context.column : 0
			});
			this.onNewContext(ctx);

		}).then(null, onUnexpectedError);
	}

	private onNewContext(ctx: LineContext): void {

		if (!this.context) {
			// happens when 24x7 IntelliSense is enabled and still in its delay
			return;
		}

		if (ctx.lineNumber !== this.context.lineNumber) {
			// e.g. happens when pressing Enter while IntelliSense is computed
			this.cancel();
			return;
		}

		if (ctx.column < this.context.column) {
			// typed -> moved cursor LEFT -> retrigger if still on a word
			if (ctx.leadingWord.word) {
				this.trigger(this.context.auto, true);
			} else {
				this.cancel();
			}
			return;
		}

		if (!this.completionModel) {
			// happens when IntelliSense is not yet computed
			return;
		}

		if (ctx.column > this.context.column && this.completionModel.incomplete) {
			// typed -> moved cursor RIGHT & incomple model -> retrigger
			const { complete, incomplete } = this.completionModel.resolveIncompleteInfo();
			this.trigger(this.state === State.Auto, true, incomplete, complete);

		} else {
			// typed -> moved cursor RIGHT -> update UI
			let oldLineContext = this.completionModel.lineContext;
			let isFrozen = false;

			this.completionModel.lineContext = {
				leadingLineContent: ctx.leadingLineContent,
				characterCountDelta: ctx.column - this.context.column
			};

			if (this.completionModel.items.length === 0) {

				if (LineContext.shouldAutoTrigger(this.editor) && this.context.leadingWord.endColumn < ctx.leadingWord.startColumn) {
					// retrigger when heading into a new word
					this.trigger(this.context.auto, true);
					return;
				}

				if (!this.context.auto) {
					// freeze when IntelliSense was manually requested
					this.completionModel.lineContext = oldLineContext;
					isFrozen = this.completionModel.items.length > 0;

				} else {
					// nothing left
					this.cancel();
					return;
				}
			}

			this._onDidSuggest.fire({
				completionModel: this.completionModel,
				auto: this.context.auto,
				isFrozen,
			});
		}
	}
}
