/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import {sequence} from 'vs/base/common/async';
import { assign } from 'vs/base/common/objects';
import Event, { Emitter } from 'vs/base/common/event';
import { onUnexpectedError, isPromiseCanceledError } from 'vs/base/common/errors';
import strings = require('vs/base/common/strings');
import URI from 'vs/base/common/uri';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import timer = require('vs/base/common/timer');
import { getSnippets } from 'vs/editor/common/modes/modesRegistry';
import EditorCommon = require('vs/editor/common/editorCommon');
import { ISuggestSupport, ISuggestResult, ISuggestion, ISuggestionCompare, ISuggestionFilter } from 'vs/editor/common/modes';
import { DefaultFilter, IMatch } from 'vs/editor/common/modes/modesFilters';
import { CodeSnippet } from 'vs/editor/contrib/snippet/common/snippet';
import { IDisposable, disposeAll } from 'vs/base/common/lifecycle';
import { SuggestRegistry, ISuggestResult2, suggest } from '../common/suggest';

const DefaultCompare: ISuggestionCompare = (a, b) => a.label.localeCompare(b.label);

enum State {
	Idle = 0,
	Manual = 1,
	Auto = 2
}

export interface SuggestDataEvent {
	suggestions: { completionItems: CompletionItem[]; currentWord: string; };
	auto: boolean;
}

export class CompletionItem {

	private static _idPool = 0;
	public id: string;
	public suggestion: ISuggestion;
	public highlights: IMatch[];
	public support: ISuggestSupport;
	public container: ISuggestResult;
	private _resolveDetails:TPromise<CompletionItem>

	constructor(private group: CompletionGroup, suggestion: ISuggestion, container:ISuggestResult2) {
		this.id = '_completion_item_#' + CompletionItem._idPool++;
		this.support = container.support;
		this.suggestion = suggestion;
		this.container = container;
	}

	resolveDetails(resource:URI, position:EditorCommon.IPosition): TPromise<CompletionItem> {
		if (this._resolveDetails) {
			return this._resolveDetails;
		}

		if (!this.support || typeof this.support.getSuggestionDetails !== 'function') {
			return this._resolveDetails = TPromise.as(this);
		}

		return this._resolveDetails = this.support
			.getSuggestionDetails(resource, position, this.suggestion)
			.then(value => {
				this.suggestion = assign(this.suggestion, value);
				return this;
			}, err => {
				if (isPromiseCanceledError(err)) {
					this._resolveDetails = null;
				} else {
					onUnexpectedError(err);
				}
				return this;
			});
	}
}

export class CompletionGroup {

	private items: CompletionItem[];

	private _incomplete: boolean;
	public get incomplete(): boolean { return this._incomplete; }

	private _size: number;
	public get size(): number { return this._size; }

	private compare: ISuggestionCompare;
	private filter: ISuggestionFilter;

	constructor(private model: CompletionModel, private index: number, raw: ISuggestResult2[]) {
		this._incomplete = false;
		this._size = 0;

		this.items = raw.reduce<CompletionItem[]>((items, result) => {
			this._incomplete = this._incomplete || result.incomplete;
			this._size += result.suggestions.length;

			return items.concat(
				result.suggestions
					.map(suggestion => new CompletionItem(this, suggestion, result))
			);
		}, []);

		this.compare = DefaultCompare;
		this.filter = DefaultFilter;

		if (this.items.length > 0) {
			const [first] = this.items;

			if (first.support) {
				this.compare = first.support.getSorter && first.support.getSorter() || this.compare;
				this.filter = first.support.getFilter && first.support.getFilter() || this.filter;
			}
		}
	}

	select(ctx: Context): CompletionItem[] {
		return this.items
			.map(item => assign(item, { highlights: this.filter(ctx.wordBefore, item.suggestion) }))
			.filter(item => !isFalsyOrEmpty(item.highlights))
			.sort((a, b) => this.compare(a.suggestion, b.suggestion));
	}
}

export class CompletionModel {

	private groups: CompletionGroup[];

	private _incomplete: boolean;
	public get incomplete(): boolean { return this._incomplete; }

	private _size: number;
	public get size(): number { return this._size; }

	constructor(raw: ISuggestResult2[][]) {
		this._incomplete = false;
		this._size = 0;

		this.groups = raw
			.filter(s => !!s)
			.map((suggestResults, index) => {
				const group = new CompletionGroup(this, index, suggestResults);

				this._incomplete = this._incomplete || group.incomplete;
				this._size += group.size;

				return group;
			});
	}

	select(ctx: Context): CompletionItem[] {
		return this.groups.reduce((r, groups) => r.concat(groups.select(ctx)), []);
	}
}

export class Context {

	public lineNumber:number;
	public column:number;
	public isInEditableRange:boolean;

	private isAutoTriggerEnabled: boolean;
	private lineContentBefore:string;
	private lineContentAfter:string;

	public wordBefore:string;
	public wordAfter:string;

	constructor(editor:EditorCommon.ICommonCodeEditor, private auto: boolean) {
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

		if (this.wordAfter.length > 0) {
			// Word after position is non empty
			return false;
		}

		return true;
	}

	public isDifferentContext(context: Context):boolean {
		if (this.lineNumber !== context.lineNumber) {
			// Line number has changed
			return true;
		}

		if (context.column < this.column - this.wordBefore.length) {
			// column went before word start
			return true;
		}

		if (!strings.startsWith(context.lineContentBefore, this.lineContentBefore) || this.lineContentAfter !== context.lineContentAfter) {
			// Line has changed before position
			return true;
		}

		if (context.wordBefore === '' && context.lineContentBefore !== this.lineContentBefore) {
			// Most likely a space has been typed
			return true;
		}

		return false;
	}

	public shouldRetrigger(context: Context):boolean {
		if (!strings.startsWith(this.lineContentBefore, context.lineContentBefore) || this.lineContentAfter !== context.lineContentAfter) {
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

export interface ICancelEvent {
	retrigger: boolean;
}

export interface ITriggerEvent {
	auto: boolean;
	characterTriggered: boolean;
	retrigger: boolean;
}

export interface ISuggestEvent {
	completionItems: CompletionItem[];
	currentWord: string;
	auto: boolean;
}

export interface IAcceptEvent {
	snippet: CodeSnippet;
	overwriteBefore: number;
	overwriteAfter: number;
}

export class SuggestModel implements IDisposable {

	private toDispose: IDisposable[];
	private autoSuggestDelay:number;

	private triggerAutoSuggestPromise:TPromise<void>;
	private state:State;

	private requestPromise:TPromise<void>;
	private context:Context;
	private raw:CompletionModel;

	private _onDidCancel: Emitter<ICancelEvent> = new Emitter();
	public get onDidCancel(): Event<ICancelEvent> { return this._onDidCancel.event; }

	private _onDidTrigger: Emitter<ITriggerEvent> = new Emitter();
	public get onDidTrigger(): Event<ITriggerEvent> { return this._onDidTrigger.event; }

	private _onDidSuggest: Emitter<ISuggestEvent> = new Emitter();
	public get onDidSuggest(): Event<ISuggestEvent> { return this._onDidSuggest.event; }

	// TODO@joao: remove
	private _onDidAccept: Emitter<IAcceptEvent> = new Emitter();
	public get onDidAccept(): Event<IAcceptEvent> { return this._onDidAccept.event; }

	constructor(private editor: EditorCommon.ICommonCodeEditor) {
		this.state = State.Idle;
		this.triggerAutoSuggestPromise = null;
		this.requestPromise = null;
		this.raw = null;
		this.context = null;

		this.toDispose = [];
		this.toDispose.push(this.editor.addListener2(EditorCommon.EventType.ConfigurationChanged, () => this.onEditorConfigurationChange()));
		this.toDispose.push(this.editor.addListener2(EditorCommon.EventType.CursorSelectionChanged, e => this.onCursorChange(e)));
		this.toDispose.push(this.editor.addListener2(EditorCommon.EventType.ModelChanged, () => this.cancel()));
		this.onEditorConfigurationChange();
	}

	public cancel(silent:boolean = false, retrigger:boolean = false):boolean {
		var actuallyCanceled = this.state !== State.Idle;

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
		this.context = null;

		if (!silent) {
			this._onDidCancel.fire({ retrigger });
		}

		return actuallyCanceled;
	}

	public getRequestPosition():EditorCommon.IPosition {
		if(!this.context) {
			return null;
		}

		return {
			lineNumber: this.context.lineNumber,
			column: this.context.column
		};
	}

	private isAutoSuggest():boolean {
		return this.state === State.Auto;
	}

	private onCursorChange(e: EditorCommon.ICursorSelectionChangedEvent):void {
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

		var isInactive = this.state === State.Idle;

		if (isInactive && !this.editor.getConfiguration().quickSuggestions) {
			return;
		}

		var ctx = new Context(this.editor, false);

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

		} else if (this.raw && this.raw.incomplete) {
			this.trigger(this.state === State.Auto, undefined, true);
		} else {
			this.onNewContext(ctx);
		}
	}

	public trigger(auto: boolean, triggerCharacter?: string, retrigger: boolean = false, groups?: ISuggestSupport[][]): void {
		var model = this.editor.getModel();
		var characterTriggered = !!triggerCharacter;
		if (!groups) {
			groups = SuggestRegistry.orderedGroups(model);
		}
		if (groups.length === 0) {
			return;
		}
		var ctx = new Context(this.editor, auto);
		if (!ctx.isInEditableRange) {
			return;
		}

		// Cancel previous requests, change state & update UI
		this.cancel(false, retrigger);
		this.state = (auto || characterTriggered) ? State.Auto : State.Manual;
		this._onDidTrigger.fire({ auto: this.isAutoSuggest(), characterTriggered, retrigger });

		// Capture context when request was sent
		this.context = ctx;

		var position = this.editor.getPosition();

		this.requestPromise = suggest(model, position, triggerCharacter, groups).then(all => {
			this.requestPromise = null;

			if (this.state === State.Idle) {
				return;
			}

			let incomplete = false;
			const snippets = getSnippets(model, position);
			const raw = all.concat([[snippets]]);
			const completionModel = new CompletionModel(raw);
			const ctx = new Context(this.editor, auto);

			if(completionModel.size > 0) {
				this.raw = completionModel;
				this.onNewContext(ctx);
			} else {
				this._onDidSuggest.fire({ completionItems: null, currentWord: ctx.wordBefore, auto: this.isAutoSuggest() });
			}
		}).then(null, onUnexpectedError);
	}

	private onNewContext(context: Context):void {
		if (this.context && this.context.isDifferentContext(context)) {
			if (this.context.shouldRetrigger(context)) {
				this.trigger(this.state === State.Auto, undefined, true);
			} else {
				this.cancel();
			}

			return;
		}

		if (this.raw) {
			const suggestions = this.raw.select(context);

			if (suggestions.length > 0) {
				this._onDidSuggest.fire({ completionItems: suggestions, currentWord: context.wordBefore, auto: this.isAutoSuggest() });
			} else {
				this._onDidSuggest.fire({ completionItems: null, currentWord: context.wordBefore, auto: this.isAutoSuggest() });
			}
		}
	}

	public accept(suggestion: ISuggestion, overwriteBefore: number, overwriteAfter: number): boolean {
		if (this.raw === null) {
			return false;
		}

		var offsetFromInvocation = this.editor.getPosition().column - this.context.column;

		this.cancel();
		this._onDidAccept.fire({
			snippet: new CodeSnippet(suggestion.codeSnippet),
			overwriteBefore: overwriteBefore + offsetFromInvocation,
			overwriteAfter
		});

		return true;
	}

	private onEditorConfigurationChange(): void {
		this.autoSuggestDelay = this.editor.getConfiguration().quickSuggestionsDelay;

		if (isNaN(this.autoSuggestDelay) || (!this.autoSuggestDelay && this.autoSuggestDelay !== 0) || this.autoSuggestDelay < 0) {
			this.autoSuggestDelay = 10;
		}
	}

	public dispose():void {
		this.cancel(true);
		this.toDispose = disposeAll(this.toDispose);
	}
}