/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import Event, { Emitter } from 'vs/base/common/event';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {startsWith} from 'vs/base/common/strings';
import {TPromise} from 'vs/base/common/winjs.base';
import {ICommonCodeEditor, ICursorSelectionChangedEvent, CursorChangeReason, IModel, IPosition} from 'vs/editor/common/editorCommon';
import {ISuggestSupport, ISuggestion, SuggestRegistry} from 'vs/editor/common/modes';
import {CodeSnippet} from 'vs/editor/contrib/snippet/common/snippet';
import {ISuggestResult2, provideCompletionItems} from '../common/suggest';
import {CompletionModel} from './completionModel';
import {Position} from 'vs/editor/common/core/position';

export interface ICancelEvent {
	retrigger: boolean;
}

export interface ITriggerEvent {
	auto: boolean;
	characterTriggered: boolean;
	retrigger: boolean;
}

export interface ISuggestEvent {
	completionModel: CompletionModel;
	currentWord: string;
	isFrozen: boolean;
	auto: boolean;
}

export interface IAcceptEvent {
	snippet: CodeSnippet;
	overwriteBefore: number;
	overwriteAfter: number;
}

class Context {

	lineNumber: number;
	column: number;
	isInEditableRange: boolean;

	private isAutoTriggerEnabled: boolean;
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

		const supports = SuggestRegistry.all(model);
		this.isAutoTriggerEnabled = supports.some(s => s.shouldAutotriggerSuggest);
	}

	shouldAutoTrigger(): boolean {
		if (!this.isAutoTriggerEnabled) {
			// Support disallows it
			return false;
		}

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

	private toDispose: IDisposable[];
	private autoSuggestDelay: number;

	private triggerAutoSuggestPromise: TPromise<void>;
	private state: State;

	private requestPromise: TPromise<void>;
	private context: Context;

	private raw: ISuggestResult2[];
	private completionModel: CompletionModel;
	private incomplete: boolean;

	private _onDidCancel: Emitter<ICancelEvent> = new Emitter();
	get onDidCancel(): Event<ICancelEvent> { return this._onDidCancel.event; }

	private _onDidTrigger: Emitter<ITriggerEvent> = new Emitter();
	get onDidTrigger(): Event<ITriggerEvent> { return this._onDidTrigger.event; }

	private _onDidSuggest: Emitter<ISuggestEvent> = new Emitter();
	get onDidSuggest(): Event<ISuggestEvent> { return this._onDidSuggest.event; }

	private _onDidAccept: Emitter<IAcceptEvent> = new Emitter();
	get onDidAccept(): Event<IAcceptEvent> { return this._onDidAccept.event; }

	constructor(private editor: ICommonCodeEditor) {
		this.state = State.Idle;
		this.triggerAutoSuggestPromise = null;
		this.requestPromise = null;
		this.raw = null;
		this.completionModel = null;
		this.incomplete = false;
		this.context = null;

		this.toDispose = [];
		this.toDispose.push(this.editor.onDidChangeConfiguration(() => this.onEditorConfigurationChange()));
		this.toDispose.push(this.editor.onDidChangeCursorSelection(e => this.onCursorChange(e)));
		this.toDispose.push(this.editor.onDidChangeModel(() => this.cancel()));
		this.toDispose.push(SuggestRegistry.onDidChange(this.onSuggestRegistryChange, this));
		this.onEditorConfigurationChange();
	}

	cancel(silent: boolean = false, retrigger: boolean = false): boolean {
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
		this.raw = null;
		this.completionModel = null;
		this.incomplete = false;
		this.context = null;

		if (!silent) {
			this._onDidCancel.fire({ retrigger });
		}

		return actuallyCanceled;
	}

	getRequestPosition(): Position {
		if (!this.context) {
			return null;
		}

		return new Position(this.context.lineNumber, this.context.column);
	}

	private isAutoSuggest(): boolean {
		return this.state === State.Auto;
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
				this.triggerAutoSuggestPromise = TPromise.timeout(this.autoSuggestDelay);
				this.triggerAutoSuggestPromise.then(() => {
					this.triggerAutoSuggestPromise = null;
					this.trigger(true);
				});
			}

		} else if (this.raw && this.incomplete) {
			this.trigger(this.state === State.Auto, undefined, true);
		} else {
			this.onNewContext(ctx);
		}
	}

	private onSuggestRegistryChange(): void {
		if (this.state === State.Idle) {
			return;
		}

		if (!SuggestRegistry.has(this.editor.getModel())) {
			this.cancel();
			return;
		}

		this.trigger(this.state === State.Auto, undefined, true);
	}

	trigger(auto: boolean, triggerCharacter?: string, retrigger: boolean = false, groups?: ISuggestSupport[][]): void {
		const model = this.editor.getModel();

		if (!model) {
			return;
		}

		const characterTriggered = !!triggerCharacter;
		groups = groups || SuggestRegistry.orderedGroups(model);

		if (groups.length === 0) {
			return;
		}

		const ctx = new Context(model, this.editor.getPosition(), auto);

		if (!ctx.isInEditableRange) {
			return;
		}

		// Cancel previous requests, change state & update UI
		this.cancel(false, retrigger);
		this.state = (auto || characterTriggered) ? State.Auto : State.Manual;
		this._onDidTrigger.fire({ auto: this.isAutoSuggest(), characterTriggered, retrigger });

		// Capture context when request was sent
		this.context = ctx;

		const position = this.editor.getPosition();

		this.requestPromise = provideCompletionItems(model, position, groups).then(all => {
			this.requestPromise = null;

			if (this.state === State.Idle) {
				return;
			}

			this.raw = all;
			this.incomplete = all.some(result => result.incomplete);

			const model = this.editor.getModel();

			if (!model) {
				return;
			}

			this.onNewContext(new Context(model, this.editor.getPosition(), auto));
		}).then(null, onUnexpectedError);
	}

	private onNewContext(ctx: Context): void {
		if (this.context && this.context.isDifferentContext(ctx)) {
			if (this.context.shouldRetrigger(ctx)) {
				this.trigger(this.state === State.Auto, undefined, true);
			} else {
				this.cancel();
			}

			return;
		}

		if (this.raw) {
			let auto = this.isAutoSuggest();

			let isFrozen = false;
			if (this.completionModel && this.completionModel.raw === this.raw) {
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
				this.completionModel = new CompletionModel(this.raw, ctx.lineContentBefore);
			}

			this._onDidSuggest.fire({
				completionModel: this.completionModel,
				currentWord: ctx.wordBefore,
				isFrozen: isFrozen,
				auto: this.isAutoSuggest()
			});
		}
	}

	accept(suggestion: ISuggestion, overwriteBefore: number, overwriteAfter: number): boolean {
		if (this.raw === null) {
			return false;
		}

		this._onDidAccept.fire({
			snippet: new CodeSnippet(suggestion.codeSnippet),
			overwriteBefore: overwriteBefore + (this.editor.getPosition().column - this.context.column),
			overwriteAfter
		});

		this.cancel();
		return true;
	}

	private onEditorConfigurationChange(): void {
		this.autoSuggestDelay = this.editor.getConfiguration().contribInfo.quickSuggestionsDelay;

		if (isNaN(this.autoSuggestDelay) || (!this.autoSuggestDelay && this.autoSuggestDelay !== 0) || this.autoSuggestDelay < 0) {
			this.autoSuggestDelay = 10;
		}
	}

	dispose(): void {
		this.cancel(true);
		this.toDispose = dispose(this.toDispose);
	}
}
