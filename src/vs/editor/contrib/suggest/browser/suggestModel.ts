/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import {sequence} from 'vs/base/common/async';
import { assign } from 'vs/base/common/objects';
import { EventEmitter, ListenerUnbind } from 'vs/base/common/eventEmitter';
import {onUnexpectedError, isPromiseCanceledError} from 'vs/base/common/errors';
import strings = require('vs/base/common/strings');
import URI from 'vs/base/common/uri';
import timer = require('vs/base/common/timer');
import { getSnippets } from 'vs/editor/common/modes/modesRegistry';
import EditorCommon = require('vs/editor/common/editorCommon');
import { ISuggestSupport, ISuggestResult, ISuggestion, ISorter } from 'vs/editor/common/modes';
import {DefaultFilter} from 'vs/editor/common/modes/modesFilters';
import { CodeSnippet } from 'vs/editor/contrib/snippet/common/snippet';
import { IDisposable, disposeAll } from 'vs/base/common/lifecycle';
import {SuggestRegistry, ISuggestResult2, suggest} from '../common/suggest';

enum SuggestState {
	NOT_ACTIVE = 0,
	MANUAL_TRIGGER = 1,
	AUTO_TRIGGER = 2
}

export interface SuggestDataEvent {
	suggestions: { completionItems: CompletionItem[]; currentWord: string; };
	auto: boolean;
}

export class CompletionItem {

	private static _idPool = 0;

	public id: string;
	public support: ISuggestSupport;
	public suggestion: ISuggestion;
	public container: ISuggestResult;
	private _resolveDetails:TPromise<CompletionItem>

	constructor(support: ISuggestSupport, suggestion: ISuggestion, container:ISuggestResult) {
		this.id = '_completion_item_#' + CompletionItem._idPool++;
		this.support = support;
		this.suggestion = suggestion;
		this.container = container;
	}

	resolveDetails(resource:URI, position:EditorCommon.IPosition): TPromise<CompletionItem> {
		if (!this._resolveDetails) {
			if (!this.support || typeof this.support.getSuggestionDetails !== 'function') {
				this._resolveDetails = TPromise.as(this);
			} else {
				this._resolveDetails = this.support.getSuggestionDetails(<any>resource, position, this.suggestion).then(value => {
					this.suggestion = assign(this.suggestion, value);
					return this;
				}, err => {
					if (isPromiseCanceledError(err)) {
						this._resolveDetails = undefined;
					} else {
						onUnexpectedError(err);
					}
					return this;
				});
			}
		}
		return this._resolveDetails;
	}
}

class RawModel {

	private _items: CompletionItem[][] = [];

	public size: number = 0;
	public incomplete: boolean = false;

	insertSuggestions(rank: number, suggestions: ISuggestResult2[]): boolean {
		if (suggestions) {
			let items: CompletionItem[] = [];
			for (let _suggestions of suggestions) {

				for (let suggestionItem of _suggestions.suggestions) {
					items.push(new CompletionItem(_suggestions.support, suggestionItem, _suggestions));
				}

				this.size += _suggestions.suggestions.length;
				this.incomplete = this.incomplete || _suggestions.incomplete;
			}
			this._items[rank] = items;
			return true;
		}
	}

	select(ctx: SuggestionContext): CompletionItem[] {
		let result: CompletionItem[] = [];
		let seen: { [codeSnippet: string]: boolean } = Object.create(null);
		for (let item of this._items) {
			RawModel._sortAndFilter(ctx, result, seen, item);
		}
		return result;
	}

	private static _sortAndFilter(ctx: SuggestionContext, bucket: CompletionItem[], seen: { [codeSnippet: string]: boolean }, items: CompletionItem[]): void {
		if (items && items.length) {
			let compare = RawModel._compare;
			let filter = DefaultFilter;
			let [item] = items;
			if (item.support) {
				compare = item.support.getSorter && item.support.getSorter() || compare;
				filter = item.support.getFilter && item.support.getFilter() || DefaultFilter;
			}

			items = items
				.filter(item => {
					if (!seen[item.suggestion.codeSnippet]) {
						seen[item.suggestion.codeSnippet] = true;
						return filter(ctx.wordBefore, item.suggestion)
					}
				})
				.sort((a, b) => {
					return compare(a.suggestion, b.suggestion)
				});

			bucket.push(...items);
		}
	}

	private static _compare(a: ISuggestion, b: ISuggestion):number {
		return a.label.localeCompare(b.label);
	}
}

class SuggestionContext {

	public lineNumber:number;
	public column:number;
	public isInEditableRange:boolean;

	private auto: boolean;
	private shouldAuto: boolean;
	private lineContentBefore:string;
	private lineContentAfter:string;

	public wordBefore:string;
	public wordAfter:string;

	constructor(editor:EditorCommon.ICommonCodeEditor, auto: boolean) {
		this.auto = auto;

		var model = editor.getModel();
		var position = editor.getPosition();

		var lineContent = model.getLineContent(position.lineNumber);
		this.wordBefore = '';
		this.wordAfter = '';
		var wordUnderCursor = model.getWordAtPosition(position);

		if (wordUnderCursor) {
			this.wordBefore = lineContent.substring(wordUnderCursor.startColumn - 1, position.column - 1);
			this.wordAfter = lineContent.substring(position.column - 1, wordUnderCursor.endColumn - 1);
		}

		this.lineNumber = position.lineNumber;
		this.column = position.column;
		this.lineContentBefore = lineContent.substr(0, position.column - 1);
		this.lineContentAfter = lineContent.substr(position.column - 1);

		this.isInEditableRange = true;
		if (model.hasEditableRange()) {
			var editableRange = model.getEditableRange();
			if (!editableRange.containsPosition(position)) {
				this.isInEditableRange = false;
			}
		}

		var lineContext = model.getLineContext(position.lineNumber);
		var character = model.getLineContent(position.lineNumber).charAt(position.column - 1);
		this.shouldAuto = SuggestRegistry.all(model)
			.some(support => support.shouldAutotriggerSuggest(lineContext, position.column - 1, character));
	}

	public isValidForAutoSuggest(): boolean {
		if (this.wordBefore.length === 0) {
			// Word before position is empty
			return false;
		}
		if (this.wordAfter.length > 0) {
			// Word after position is non empty
			return false;
		}
		if (!this.shouldAuto) {
			// ISuggestSupport#shouldAutotriggerSuggest is againt this
			return false;
		}
		return true;
	}

	public isValidForNewContext(newCtx:SuggestionContext):boolean {
		if (this.lineNumber !== newCtx.lineNumber) {
			// Line number has changed
			return false;
		}

		if (newCtx.column < this.column - this.wordBefore.length) {
			// column went before word start
			return false;
		}

		if (!strings.startsWith(newCtx.lineContentBefore, this.lineContentBefore) || this.lineContentAfter !== newCtx.lineContentAfter) {
			// Line has changed before position
			return false;
		}

		if (newCtx.wordBefore === '' && newCtx.lineContentBefore !== this.lineContentBefore) {
			// Most likely a space has been typed
			return false;
		}

		return true;
	}

	public isValidForRetrigger(newCtx:SuggestionContext):boolean {
		if (!strings.startsWith(this.lineContentBefore, newCtx.lineContentBefore) || this.lineContentAfter !== newCtx.lineContentAfter) {
			return false;
		}

		if (this.lineContentBefore.length > newCtx.lineContentBefore.length && this.wordBefore.length === 0) {
			return false;
		}

		if (this.auto && newCtx.wordBefore.length === 0) {
			return false;
		}

		return true;
	}
}

export class SuggestModel extends EventEmitter {

	private editor: EditorCommon.ICommonCodeEditor;
	private onAccept:(snippet: CodeSnippet, overwriteBefore:number, overwriteAfter:number)=>void;
	private toDispose: IDisposable[];
	private autoSuggestDelay:number;

	private triggerAutoSuggestPromise:TPromise<void>;
	private state:SuggestState;

	// Members which make sense when state is active
	private requestPromise:TPromise<void>;
	private requestContext:SuggestionContext;
	private raw:RawModel;

	constructor(editor:EditorCommon.ICommonCodeEditor, onAccept:(snippet: CodeSnippet, overwriteBefore:number, overwriteAfter:number)=>void) {
		super();
		this.editor = editor;
		this.onAccept = onAccept;
		this.toDispose = [];

		this.toDispose.push(this.editor.addListener2(EditorCommon.EventType.ConfigurationChanged, () => this.onEditorConfigurationChange()));
		this.onEditorConfigurationChange();

		this.triggerAutoSuggestPromise = null;
		this.state = SuggestState.NOT_ACTIVE;

		this.requestPromise = null;
		this.raw = null;
		this.requestContext = null;

		this.toDispose.push(this.editor.addListener2(EditorCommon.EventType.CursorSelectionChanged, (e: EditorCommon.ICursorSelectionChangedEvent) => {
			if (!e.selection.isEmpty()) {
				this.cancel();
				return;
			}

			if (e.source !== 'keyboard' || e.reason !== '') {
				this.cancel();
				return;
			}

			this.onCursorChange();
		}));
		this.toDispose.push(this.editor.addListener2(EditorCommon.EventType.ModelChanged, (e) => {
			this.cancel();
		}));
	}

	public cancel(silent:boolean = false, retrigger:boolean = false):boolean {
		var actuallyCanceled = (this.state !== SuggestState.NOT_ACTIVE);

		if (this.triggerAutoSuggestPromise) {
			this.triggerAutoSuggestPromise.cancel();
			this.triggerAutoSuggestPromise = null;
		}

		if (this.requestPromise) {
			this.requestPromise.cancel();
			this.requestPromise = null;
		}

		this.state = SuggestState.NOT_ACTIVE;
		this.raw = null;
		this.requestContext = null;

		if (!silent) {
			this.emit('cancel', { retrigger: retrigger });
		}

		return actuallyCanceled;
	}

	public getRequestPosition():EditorCommon.IPosition {
		if(!this.requestContext) {
			return null;
		}
		return {
			lineNumber: this.requestContext.lineNumber,
			column: this.requestContext.column
		};
	}

	private isAutoSuggest():boolean {
		return this.state === SuggestState.AUTO_TRIGGER;
	}

	private onCursorChange():void {
		if (!SuggestRegistry.has(this.editor.getModel())) {
			return;
		}

		var isInactive = this.state === SuggestState.NOT_ACTIVE;

		if (isInactive && !this.editor.getConfiguration().quickSuggestions) {
			return;
		}

		var ctx = new SuggestionContext(this.editor, false);

		if (isInactive) {
			// trigger was not called or it was canceled
			this.cancel();

			if (ctx.isValidForAutoSuggest()) {
				this.triggerAutoSuggestPromise = TPromise.timeout(this.autoSuggestDelay);
				this.triggerAutoSuggestPromise.then(() => {
					this.triggerAutoSuggestPromise = null;
					this.trigger(true);
				});
			}

		} else if (this.raw && this.raw.incomplete) {
			this.trigger(this.state === SuggestState.AUTO_TRIGGER, undefined, true);
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
		var ctx = new SuggestionContext(this.editor, auto);
		if (!ctx.isInEditableRange) {
			return;
		}

		var $tTrigger = timer.start(timer.Topic.EDITOR, 'suggest/TRIGGER');

		// Cancel previous requests, change state & update UI
		this.cancel(false, retrigger);
		this.state = (auto || characterTriggered) ? SuggestState.AUTO_TRIGGER : SuggestState.MANUAL_TRIGGER;
		this.emit('loading', { auto: this.isAutoSuggest(), characterTriggered: characterTriggered, retrigger: retrigger });

		// Capture context when request was sent
		this.requestContext = ctx;

		// Send mode request
		var $tRequest = timer.start(timer.Topic.EDITOR, 'suggest/REQUEST');
		var position = this.editor.getPosition();

		let raw = new RawModel();
		let rank = 0;
		this.requestPromise = suggest(model, position, triggerCharacter, groups).then(all => {
			for (let suggestions of all) {
				if (raw.insertSuggestions(rank, suggestions)) {
					rank++;
				}
			}
		});

		this.requestPromise.then(() => {
			$tRequest.stop();
			this.requestPromise = null;

			if (this.state === SuggestState.NOT_ACTIVE) {
				return;
			}

			var snippets = getSnippets(model, position);
			if (snippets && snippets.suggestions && snippets.suggestions.length > 0) {
				raw.insertSuggestions(rank, [snippets]);
			}

			if(raw.size > 0) {
				this.raw = raw;
				this.onNewContext(new SuggestionContext(this.editor, auto));
			} else {
				this.emit('empty', { auto: this.isAutoSuggest() });
			}
		}, () => {
			$tRequest.stop();
		}).done(() => $tTrigger.stop());
	}

	private onNewContext(ctx:SuggestionContext):void {
		if (this.requestContext && !this.requestContext.isValidForNewContext(ctx)) {
			if (this.requestContext.isValidForRetrigger(ctx)) {
				this.trigger(this.state === SuggestState.AUTO_TRIGGER, undefined, true);
			} else {
				this.cancel();
			}

			return;
		}

		if (this.raw) {

			let completionItems = this.raw.select(ctx);

			if (completionItems.length > 0) {
				this.emit('suggest', <SuggestDataEvent> {
					suggestions: {
						completionItems,
						currentWord: ctx.wordBefore
					},
					auto: this.isAutoSuggest()
				});
			} else {
				this.emit('empty', { auto: this.isAutoSuggest() });
			}
		}
	}

	public accept(item: CompletionItem): boolean {
		if (this.raw === null) {
			return false;
		}

		var parentSuggestions = item.container;
		var offsetFromInvocation = this.editor.getPosition().column - this.requestContext.column;

		var overwriteBefore = ((typeof parentSuggestions.overwriteBefore === 'undefined')
			? parentSuggestions.currentWord.length
			: parentSuggestions.overwriteBefore) + offsetFromInvocation;

		var overwriteAfter = (typeof parentSuggestions.overwriteAfter === 'undefined')
			? 0
			: Math.max(0, parentSuggestions.overwriteAfter);

		this.cancel();
		this.onAccept(new CodeSnippet(item.suggestion.codeSnippet), overwriteBefore, overwriteAfter);

		return true;
	}

	private onEditorConfigurationChange(): void {
		this.autoSuggestDelay = this.editor.getConfiguration().quickSuggestionsDelay;

		if (isNaN(this.autoSuggestDelay) || (!this.autoSuggestDelay && this.autoSuggestDelay !== 0) || this.autoSuggestDelay < 0) {
			this.autoSuggestDelay = 10;
		}
	}

	public destroy():void {
		this.cancel(true);
		this.toDispose = disposeAll(this.toDispose);
		this.emit('destroy', null);
	}
}