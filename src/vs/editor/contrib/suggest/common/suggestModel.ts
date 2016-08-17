/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { forEach } from 'vs/base/common/collections';
import Event, { Emitter } from 'vs/base/common/event';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {startsWith} from 'vs/base/common/strings';
import {TPromise} from 'vs/base/common/winjs.base';
import {ICommonCodeEditor, ICursorSelectionChangedEvent, CursorChangeReason, IModel, IPosition} from 'vs/editor/common/editorCommon';
import {ISuggestSupport, SuggestRegistry} from 'vs/editor/common/modes';
import {ISuggestionItem, provideSuggestionItems} from './suggest';
import {CompletionModel} from './completionModel';

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

class Context {

	lineNumber: number;
	column: number;
	isInEditableRange: boolean;

	lineContentBefore: string;
	lineContentAfter: string;

	wordBefore: string;
	wordAfter: string;

	constructor(model: IModel, position: IPosition, private auto: boolean) {
		const lineContent = model.getLineContent(position.lineNumber);
		const wordUnderCursor = model.getWordAtPosition(position);

		if (wordUnderCursor) {
			this.wordBefore = lineContent.substring(wordUnderCursor.startColumn - 1, position.column - 1);
			this.wordAfter = lineContent.substring(position.column - 1, wordUnderCursor.endColumn - 1);
		} else {
			this.wordBefore = '';
			this.wordAfter = '';
		}

		this.lineNumber = position.lineNumber;
		this.column = position.column;
		this.lineContentBefore = lineContent.substr(0, position.column - 1);
		this.lineContentAfter = lineContent.substr(position.column - 1);

		this.isInEditableRange = true;

		if (model.hasEditableRange()) {
			const editableRange = model.getEditableRange();

			if (!editableRange.containsPosition(position)) {
				this.isInEditableRange = false;
			}
		}
	}

	shouldAutoTrigger(): boolean {

		if (this.wordBefore.length === 0) {
			// Word before position is empty
			return false;
		}

		if (!isNaN(Number(this.wordBefore))) {
			// Word before is number only
			return false;
		}

		if (this.wordAfter.length > 0) {
			// Word after position is non empty
			return false;
		}

		return true;
	}

	isDifferentContext(context: Context): boolean {
		if (this.lineNumber !== context.lineNumber) {
			// Line number has changed
			return true;
		}

		if (context.column < this.column - this.wordBefore.length) {
			// column went before word start
			return true;
		}

		if (!startsWith(context.lineContentBefore, this.lineContentBefore) || this.lineContentAfter !== context.lineContentAfter) {
			// Line has changed before position
			return true;
		}

		if (context.wordBefore === '' && context.lineContentBefore !== this.lineContentBefore) {
			// Most likely a space has been typed
			return true;
		}

		return false;
	}

	shouldRetrigger(context: Context): boolean {
		if (!startsWith(this.lineContentBefore, context.lineContentBefore) || this.lineContentAfter !== context.lineContentAfter) {
			// Doesn't look like the same line
			return false;
		}

		if (this.lineContentBefore.length > context.lineContentBefore.length && this.wordBefore.length === 0) {
			// Text was deleted and previous current word was empty
			return false;
		}

		if (this.auto && context.wordBefore.length === 0) {
			// Currently in auto mode and new current word is empty
			return false;
		}

		return true;
	}
}

enum State {
	Idle = 0,
	Manual = 1,
	Auto = 2
}

export class SuggestModel implements IDisposable {

	private toDispose: IDisposable[] = [];
	private quickSuggestDelay: number;
	private triggerCharacterListeners: IDisposable[] = [];

	private triggerAutoSuggestPromise: TPromise<void>;
	private state: State;

	private requestPromise: TPromise<void>;
	private context: Context;

	private suggestionItems: ISuggestionItem[];
	private completionModel: CompletionModel;
	private incomplete: boolean;

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
		this.suggestionItems = null;
		this.completionModel = null;
		this.incomplete = false;
		this.context = null;

		// wire up various listeners
		this.toDispose.push(this.editor.onDidChangeModel(() => {
			this.updateTriggerCharacters();
			this.cancel();
		}));
		this.toDispose.push(editor.onDidChangeModelMode(() => {
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
		dispose([this._onDidCancel, this._onDidSuggest, this._onDidTrigger]);
		this.toDispose = dispose(this.toDispose);
		this.triggerCharacterListeners = dispose(this.triggerCharacterListeners);
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

		this.triggerCharacterListeners = dispose(this.triggerCharacterListeners);

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

		forEach(supportsByTriggerCharacter, entry => {
			this.triggerCharacterListeners.push(this.editor.addTypingListener(entry.key, () => {
				this.trigger(true, false, entry.value);
			}));
		});
	}

	// --- trigger/retrigger/cancel suggest

	cancel(retrigger: boolean = false): boolean {
		const actuallyCanceled = this.state !== State.Idle;

		if (this.triggerAutoSuggestPromise) {
			this.triggerAutoSuggestPromise.cancel();
			this.triggerAutoSuggestPromise = null;
		}

		if (this.requestPromise) {
			this.requestPromise.cancel();
			this.requestPromise = null;
		}

		this.state = State.Idle;
		this.suggestionItems = null;
		this.completionModel = null;
		this.incomplete = false;
		this.context = null;

		this._onDidCancel.fire({ retrigger });
		return actuallyCanceled;
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
		if (!e.selection.isEmpty()) {
			this.cancel();
			return;
		}

		if (e.source !== 'keyboard' || e.reason !== CursorChangeReason.NotSet) {
			this.cancel();
			return;
		}

		if (!SuggestRegistry.has(this.editor.getModel())) {
			return;
		}

		const isInactive = this.state === State.Idle;

		if (isInactive && !this.editor.getConfiguration().contribInfo.quickSuggestions) {
			return;
		}

		const model = this.editor.getModel();

		if (!model) {
			return;
		}

		const ctx = new Context(model, this.editor.getPosition(), false);

		if (isInactive) {
			// trigger was not called or it was canceled
			this.cancel();

			if (ctx.shouldAutoTrigger()) {
				this.triggerAutoSuggestPromise = TPromise.timeout(this.quickSuggestDelay);
				this.triggerAutoSuggestPromise.then(() => {
					this.triggerAutoSuggestPromise = null;
					this.trigger(true);
				});
			}

		} else if (this.suggestionItems && this.incomplete) {
			this.trigger(this.state === State.Auto, true);
		} else {
			this.onNewContext(ctx);
		}
	}

	public trigger(auto: boolean, retrigger: boolean = false, onlyFrom?: ISuggestSupport[]): void {

		const model = this.editor.getModel();

		if (!model) {
			return;
		}

		const ctx = new Context(model, this.editor.getPosition(), auto);

		if (!ctx.isInEditableRange) {
			return;
		}

		// Cancel previous requests, change state & update UI
		this.cancel(retrigger);
		this.state = auto ? State.Auto : State.Manual;
		this._onDidTrigger.fire({ auto: this.isAutoSuggest() });

		// Capture context when request was sent
		this.context = ctx;

		this.requestPromise = provideSuggestionItems(model, this.editor.getPosition(),
			this.editor.getConfiguration().contribInfo.snippetSuggestions, onlyFrom).then(items => {

			this.requestPromise = null;

			if (this.state === State.Idle) {
				return;
			}

			const model = this.editor.getModel();
			if (!model) {
				return;
			}

			this.suggestionItems = items;
			this.incomplete = items.some(result => result.container.incomplete);
			this.onNewContext(new Context(model, this.editor.getPosition(), auto));

		}).then(null, onUnexpectedError);
	}

	private isAutoSuggest(): boolean {
		return this.state === State.Auto;
	}

	public getTriggerPosition(): IPosition {
		const {lineNumber, column} = this.context;
		return { lineNumber, column };
	}

	private onNewContext(ctx: Context): void {
		if (this.context && this.context.isDifferentContext(ctx)) {
			if (this.context.shouldRetrigger(ctx)) {
				this.trigger(this.state === State.Auto, true);
			} else {
				this.cancel();
			}

			return;
		}

		if (this.suggestionItems) {
			let auto = this.isAutoSuggest();

			let isFrozen = false;
			if (this.completionModel && this.completionModel.raw === this.suggestionItems) {
				const oldLineContext = this.completionModel.lineContext;
				this.completionModel.lineContext = {
					leadingLineContent: ctx.lineContentBefore,
					characterCountDelta: this.context
						? ctx.column - this.context.column
						: 0
				};

				if (!auto && this.completionModel.items.length === 0) {
					this.completionModel.lineContext = oldLineContext;
					isFrozen = true;
				}
			} else {
				this.completionModel = new CompletionModel(this.suggestionItems, ctx.lineContentBefore);
			}

			this._onDidSuggest.fire({
				completionModel: this.completionModel,
				isFrozen: isFrozen,
				auto: this.isAutoSuggest()
			});
		}
	}
}
