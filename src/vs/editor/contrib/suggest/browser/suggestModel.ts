/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import Event, { Emitter } from 'vs/base/common/event';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {startsWith} from 'vs/base/common/strings';
import {TPromise} from 'vs/base/common/winjs.base';
import {EventType, ICommonCodeEditor, ICursorSelectionChangedEvent, IPosition} from 'vs/editor/common/editorCommon';
import {ISuggestSupport, ISuggestion} from 'vs/editor/common/modes';
import {CodeSnippet} from 'vs/editor/contrib/snippet/common/snippet';
import {ISuggestResult2, SuggestRegistry, suggest} from '../common/suggest';
import {CompletionModel} from './completionModel';

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

	public lineNumber: number;
	public column: number;
	public isInEditableRange: boolean;

	private isAutoTriggerEnabled: boolean;
	private lineContentBefore: string;
	private lineContentAfter: string;

	public wordBefore: string;
	public wordAfter: string;

	constructor(editor: ICommonCodeEditor, private auto: boolean) {
		const model = editor.getModel();
		const position = editor.getPosition();
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

		const lineContext = model.getLineContext(position.lineNumber);
		const character = model.getLineContent(position.lineNumber).charAt(position.column - 1);
		const supports = SuggestRegistry.all(model);
		this.isAutoTriggerEnabled = supports.some(s => s.shouldAutotriggerSuggest(lineContext, position.column - 1, character));
	}

	public shouldAutoTrigger(): boolean {
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

	public isDifferentContext(context: Context): boolean {
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

	public shouldRetrigger(context: Context): boolean {
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

	private raw: ISuggestResult2[][];
	private completionModel: CompletionModel;
	private incomplete: boolean;

	private _onDidCancel: Emitter<ICancelEvent> = new Emitter();
	public get onDidCancel(): Event<ICancelEvent> { return this._onDidCancel.event; }

	private _onDidTrigger: Emitter<ITriggerEvent> = new Emitter();
	public get onDidTrigger(): Event<ITriggerEvent> { return this._onDidTrigger.event; }

	private _onDidSuggest: Emitter<ISuggestEvent> = new Emitter();
	public get onDidSuggest(): Event<ISuggestEvent> { return this._onDidSuggest.event; }

	private _onDidAccept: Emitter<IAcceptEvent> = new Emitter();
	public get onDidAccept(): Event<IAcceptEvent> { return this._onDidAccept.event; }

	constructor(private editor: ICommonCodeEditor) {
		this.state = State.Idle;
		this.triggerAutoSuggestPromise = null;
		this.requestPromise = null;
		this.raw = null;
		this.completionModel = null;
		this.incomplete = false;
		this.context = null;

		this.toDispose = [];
		this.toDispose.push(this.editor.addListener2(EventType.ConfigurationChanged, () => this.onEditorConfigurationChange()));
		this.toDispose.push(this.editor.addListener2(EventType.CursorSelectionChanged, e => this.onCursorChange(e)));
		this.toDispose.push(this.editor.addListener2(EventType.ModelChanged, () => this.cancel()));
		this.onEditorConfigurationChange();
	}

	public cancel(silent: boolean = false, retrigger: boolean = false): boolean {
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

	public getRequestPosition(): IPosition {
		if (!this.context) {
			return null;
		}

		return {
			lineNumber: this.context.lineNumber,
			column: this.context.column
		};
	}

	private isAutoSuggest(): boolean {
		return this.state === State.Auto;
	}

	private onCursorChange(e: ICursorSelectionChangedEvent): void {
		if (!e.selection.isEmpty()) {
			this.cancel();
			return;
		}

		if (e.source !== 'keyboard' || e.reason !== '') {
			this.cancel();
			return;
		}

		if (!SuggestRegistry.has(this.editor.getModel())) {
			return;
		}

		const isInactive = this.state === State.Idle;

		if (isInactive && !this.editor.getConfiguration().quickSuggestions) {
			return;
		}

		const ctx = new Context(this.editor, false);

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

	public trigger(auto: boolean, triggerCharacter?: string, retrigger: boolean = false, groups?: ISuggestSupport[][]): void {
		const model = this.editor.getModel();
		const characterTriggered = !!triggerCharacter;
		groups = groups || SuggestRegistry.orderedGroups(model);

		if (groups.length === 0) {
			return;
		}

		const ctx = new Context(this.editor, auto);

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

		this.requestPromise = suggest(model, position, triggerCharacter, groups).then(all => {
			this.requestPromise = null;

			if (this.state === State.Idle) {
				return;
			}

			this.raw = all;
			this.incomplete = all.reduce((r, s) => r || s.reduce((r, s) => r || s.incomplete, false), false);

			this.onNewContext(new Context(this.editor, auto));
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
				const oldCurrentWord = this.completionModel.currentWord;
				this.completionModel.currentWord = ctx.wordBefore;
				let visibleCount = this.completionModel.items.length;

				if (!auto && visibleCount === 0) {
					this.completionModel.currentWord = oldCurrentWord;
					isFrozen = true;
				}
			} else {
				this.completionModel = new CompletionModel(this.raw, ctx.wordBefore);
			}

			this._onDidSuggest.fire({
				completionModel: this.completionModel,
				currentWord: ctx.wordBefore,
				isFrozen: isFrozen,
				auto: this.isAutoSuggest()
			});
		}
	}

	public accept(suggestion: ISuggestion, overwriteBefore: number, overwriteAfter: number): boolean {
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
		this.autoSuggestDelay = this.editor.getConfiguration().quickSuggestionsDelay;

		if (isNaN(this.autoSuggestDelay) || (!this.autoSuggestDelay && this.autoSuggestDelay !== 0) || this.autoSuggestDelay < 0) {
			this.autoSuggestDelay = 10;
		}
	}

	public dispose(): void {
		this.cancel(true);
		this.toDispose = disposeAll(this.toDispose);
	}
}
