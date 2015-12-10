/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import EditorCommon = require('vs/editor/common/editorCommon');
import Strings = require('vs/base/common/strings');
import Events = require('vs/base/common/eventEmitter');
import ReplaceAllCommand = require('./replaceAllCommand');
import Lifecycle = require('vs/base/common/lifecycle');
import Schedulers = require('vs/base/common/async');
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import {ReplaceCommand} from 'vs/editor/common/commands/replaceCommand';

export const START_FIND_ACTION_ID = 'actions.find';
export const NEXT_MATCH_FIND_ACTION_ID = 'editor.action.nextMatchFindAction';
export const PREVIOUS_MATCH_FIND_ACTION_ID = 'editor.action.previousMatchFindAction';
export const START_FIND_REPLACE_ACTION_ID = 'editor.action.startFindReplaceAction';
export const CLOSE_FIND_WIDGET_COMMAND_ID = 'closeFindWidget';
export const TOGGLE_CASE_SENSITIVE_COMMAND_ID = 'toggleFindCaseSensitive';
export const TOGGLE_WHOLE_WORD_COMMAND_ID = 'toggleFindWholeWord';
export const TOGGLE_REGEX_COMMAND_ID = 'toggleFindRegex';

export interface IFindMatchesEvent {
	position: number;
	count: number;
}

export interface IFindProperties {
	isRegex: boolean;
	wholeWord: boolean;
	matchCase: boolean;
}

export interface IFindState {
	searchString: string;
	replaceString: string;
	properties: IFindProperties;
	isReplaceRevealed: boolean;
}

export interface IFindStartEvent {
	state: IFindState;
	selectionFindEnabled: boolean;
	shouldAnimate: boolean;
}

export class FindModelBoundToEditorModel extends Events.EventEmitter {

	private static _START_EVENT = 'start';
	private static _MATCHES_UPDATED_EVENT = 'matches';

	private editor:EditorCommon.ICommonCodeEditor;
	private startPosition:EditorCommon.IEditorPosition;
	private searchString:string;
	private replaceString:string;
	private searchOnlyEditableRange:boolean;
	private decorations:string[];
	private decorationIndex:number;
	private findScopeDecorationId:string;
	private highlightedDecorationId:string;
	private listenersToRemove:Events.ListenerUnbind[];
	private updateDecorationsScheduler:Schedulers.RunOnceScheduler;
	private didReplace:boolean;

	private isRegex:boolean;
	private matchCase:boolean;
	private wholeWord:boolean;

	constructor(editor:EditorCommon.ICommonCodeEditor) {
		super([
			FindModelBoundToEditorModel._MATCHES_UPDATED_EVENT,
			FindModelBoundToEditorModel._START_EVENT
		]);
		this.editor = editor;
		this.startPosition = null;
		this.searchString = '';
		this.replaceString = '';
		this.searchOnlyEditableRange = false;
		this.decorations = [];
		this.decorationIndex = 0;
		this.findScopeDecorationId = null;
		this.highlightedDecorationId = null;
		this.listenersToRemove = [];
		this.didReplace = false;

		this.isRegex = false;
		this.matchCase = false;
		this.wholeWord = false;

		this.updateDecorationsScheduler = new Schedulers.RunOnceScheduler(() => {
			this.updateDecorations(false, false, null);
		}, 100);

		this.listenersToRemove.push(this.editor.addListener(EditorCommon.EventType.CursorPositionChanged, (e:EditorCommon.ICursorPositionChangedEvent) => {
			if (e.reason === 'explicit' || e.reason === 'undo' || e.reason === 'redo') {
				if (this.highlightedDecorationId !== null) {
					this.editor.changeDecorations((changeAccessor: EditorCommon.IModelDecorationsChangeAccessor) => {
						changeAccessor.changeDecorationOptions(this.highlightedDecorationId, this.createFindMatchDecorationOptions(false));
						this.highlightedDecorationId = null;
					});
				}
				this.startPosition = this.editor.getPosition();
				this.decorationIndex = -1;
			}
		}));

		this.listenersToRemove.push(this.editor.addListener(EditorCommon.EventType.ModelContentChanged, (e:EditorCommon.IModelContentChangedEvent) => {
			if (e.changeType === EditorCommon.EventType.ModelContentChangedFlush) {
				// a model.setValue() was called
				this.decorations = [];
				this.decorationIndex = -1;
				this.findScopeDecorationId = null;
				this.highlightedDecorationId = null;
			}
			this.startPosition = this.editor.getPosition();
			this.updateDecorationsScheduler.schedule();
		}));
	}

	private removeOldDecorations(changeAccessor:EditorCommon.IModelDecorationsChangeAccessor, removeFindScopeDecoration:boolean): void {
		let toRemove: string[] = [];
		var i:number, len:number;
		for (i = 0, len = this.decorations.length; i < len; i++) {
			toRemove.push(this.decorations[i]);
		}
		this.decorations = [];

		if (removeFindScopeDecoration && this.hasFindScope()) {
			toRemove.push(this.findScopeDecorationId);
			this.findScopeDecorationId = null;
		}

		changeAccessor.deltaDecorations(toRemove, []);
	}

	private createFindMatchDecorationOptions(isCurrent:boolean): EditorCommon.IModelDecorationOptions {
		return {
			stickiness: EditorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			className: isCurrent ? 'currentFindMatch' : 'findMatch',
			overviewRuler: {
				color: 'rgba(246, 185, 77, 0.7)',
				darkColor: 'rgba(246, 185, 77, 0.7)',
				position: EditorCommon.OverviewRulerLane.Center
			}
		};
	}

	private createFindScopeDecorationOptions(): EditorCommon.IModelDecorationOptions {
		return {
			className: 'findScope',
			isWholeLine: true
		};
	}

	private addMatchesDecorations(changeAccessor:EditorCommon.IModelDecorationsChangeAccessor, matches:EditorCommon.IEditorRange[]): void {
		var newDecorations: EditorCommon.IModelDeltaDecoration[] = [];

		var i:number, len:number;
		for (i = 0, len = matches.length; i < len; i++) {
			newDecorations[i] = {
				range: matches[i],
				options: this.createFindMatchDecorationOptions(false)
			};
		}

		this.decorations = changeAccessor.deltaDecorations([], newDecorations);
	}

	private _getSearchRange(): EditorCommon.IEditorRange {
		var searchRange:EditorCommon.IEditorRange;

		if (this.searchOnlyEditableRange) {
			searchRange = this.editor.getModel().getEditableRange();
		} else {
			searchRange = this.editor.getModel().getFullModelRange();
		}

		if (this.hasFindScope()) {
			// If we have set now or before a find scope, use it for computing the search range
			searchRange = searchRange.intersectRanges(this.editor.getModel().getDecorationRange(this.findScopeDecorationId));
		}
		return searchRange;
	}

	private updateDecorations(jumpToNextMatch:boolean, resetFindScopeDecoration:boolean, newFindScope:EditorCommon.IEditorRange): void {
		if (this.didReplace) {
			this.next();
		}

		this.editor.changeDecorations((changeAccessor:EditorCommon.IModelDecorationsChangeAccessor) => {
			this.removeOldDecorations(changeAccessor, resetFindScopeDecoration);

			if (resetFindScopeDecoration && newFindScope) {
				// Add a decoration to track the find scope
				let decorations = changeAccessor.deltaDecorations([], [{
					range: newFindScope,
					options: this.createFindScopeDecorationOptions()
				}]);
				this.findScopeDecorationId = decorations[0];
			}

			this.addMatchesDecorations(changeAccessor, this._findMatches());
		});
		this.highlightedDecorationId = null;

		this.decorationIndex = this.indexAfterPosition(this.startPosition);

		if (!this.didReplace && !jumpToNextMatch) {
			this.decorationIndex = this.previousIndex(this.decorationIndex);
		} else if (this.decorations.length > 0) {
			this.setSelectionToDecoration(this.decorations[this.decorationIndex]);
		}

		var e:IFindMatchesEvent = {
			position: this.decorations.length > 0 ? (this.decorationIndex+1) : 0,
			count: this.decorations.length
		};

		this._emitMatchesUpdatedEvent(e);

		this.didReplace = false;
	}


	/**
	 * Updates selection find scope.
	 * Selection find scope just gets removed if passed findScope is null.
	 * Selection find scope does not take columns into account.
	 */
	public setFindScope(findScope:EditorCommon.IEditorRange): void {
		if (findScope === null) {
			this.updateDecorations(false, true, findScope);
		} else {
			this.updateDecorations(false, true, new Range(findScope.startLineNumber, 1, findScope.endLineNumber, this.editor.getModel().getLineMaxColumn(findScope.endLineNumber)));
		}
	}

	public recomputeMatches(newFindData:IFindState, jumpToNextMatch:boolean): void {
		var somethingChanged = false;
		if (this.isRegex !== newFindData.properties.isRegex) {
			this.isRegex = newFindData.properties.isRegex;
			somethingChanged = true;
		}
		if (this.matchCase !== newFindData.properties.matchCase) {
			this.matchCase = newFindData.properties.matchCase;
			somethingChanged = true;
		}
		if (this.wholeWord !== newFindData.properties.wholeWord) {
			this.wholeWord = newFindData.properties.wholeWord;
			somethingChanged = true;
		}
		if (newFindData.searchString !== this.searchString) {
			this.searchString = newFindData.searchString;
			somethingChanged = true;
		}
		this.replaceString = newFindData.replaceString;
		if (newFindData.isReplaceRevealed !== this.searchOnlyEditableRange) {
			this.searchOnlyEditableRange = newFindData.isReplaceRevealed;
			somethingChanged = true;
		}

		if (somethingChanged) {
			this.updateDecorations(jumpToNextMatch, false, null);
		}
	}

	public start(newFindData:IFindState, findScope:EditorCommon.IEditorRange, shouldAnimate:boolean): void {
		this.startPosition = this.editor.getPosition();

		this.isRegex = newFindData.properties.isRegex;
		this.matchCase = newFindData.properties.matchCase;
		this.wholeWord = newFindData.properties.wholeWord;
		this.searchString = newFindData.searchString;
		this.replaceString = newFindData.replaceString;
		this.searchOnlyEditableRange = newFindData.isReplaceRevealed;

		this.setFindScope(findScope);
		this.decorationIndex = this.previousIndex(this.indexAfterPosition(this.startPosition));
		var e:IFindStartEvent = {
			state: newFindData,
			selectionFindEnabled: this.hasFindScope(),
			shouldAnimate: shouldAnimate
		};
		this._emitStartEvent(e);
	}

	public prev(): void {
		if (this.decorations.length > 0) {
			if (this.decorationIndex === -1) {
				this.decorationIndex = this.indexAfterPosition(this.startPosition);
			}
			this.decorationIndex = this.previousIndex(this.decorationIndex);
			this.setSelectionToDecoration(this.decorations[this.decorationIndex]);
		} else if (this.hasFindScope()) {
			// Reveal the selection so user is reminded that 'selection find' is on.
			this.editor.revealRangeInCenterIfOutsideViewport(this.editor.getModel().getDecorationRange(this.findScopeDecorationId));
		}
	}

	public next(): void {
		if (this.decorations.length > 0) {
			if (this.decorationIndex === -1) {
				this.decorationIndex = this.indexAfterPosition(this.startPosition);
			} else {
				this.decorationIndex = this.nextIndex(this.decorationIndex);
			}
			this.setSelectionToDecoration(this.decorations[this.decorationIndex]);
		} else if (this.hasFindScope()) {
			// Reveal the selection so user is reminded that 'selection find' is on.
			this.editor.revealRangeInCenterIfOutsideViewport(this.editor.getModel().getDecorationRange(this.findScopeDecorationId));
		}
	}

	private setSelectionToDecoration(decorationId:string): void {
		this.editor.changeDecorations((changeAccessor: EditorCommon.IModelDecorationsChangeAccessor) => {
			if (this.highlightedDecorationId !== null) {
				changeAccessor.changeDecorationOptions(this.highlightedDecorationId, this.createFindMatchDecorationOptions(false));
			}
			changeAccessor.changeDecorationOptions(decorationId, this.createFindMatchDecorationOptions(true));
			this.highlightedDecorationId = decorationId;
		});
		var decorationRange = this.editor.getModel().getDecorationRange(decorationId);
		if (Range.isIRange(decorationRange)) {
			this.editor.setSelection(decorationRange);
			this.editor.revealRangeInCenterIfOutsideViewport(decorationRange);
		}
	}

	private getReplaceString(matchedString:string): string {
		if (!this.isRegex) {
			return this.replaceString;
		}
		let regexp = Strings.createRegExp(this.searchString, this.isRegex, this.matchCase, this.wholeWord);
		// Parse the replace string to support that \t or \n mean the right thing
		let parsedReplaceString = parseReplaceString(this.replaceString);
		return matchedString.replace(regexp, parsedReplaceString);
	}

	public replace(): void {
		if (this.decorations.length === 0) {
			return;
		}

		var model = this.editor.getModel();
		var currentDecorationRange = model.getDecorationRange(this.decorations[this.decorationIndex]);
		var selection = this.editor.getSelection();

		if (currentDecorationRange !== null &&
			selection.startColumn === currentDecorationRange.startColumn &&
			selection.endColumn === currentDecorationRange.endColumn &&
			selection.startLineNumber === currentDecorationRange.startLineNumber &&
			selection.endLineNumber === currentDecorationRange.endLineNumber) {

			var matchedString = model.getValueInRange(selection);
			var replaceString = this.getReplaceString(matchedString);

			var command = new ReplaceCommand(selection, replaceString);
			this.editor.executeCommand('replace', command);

			this.startPosition = new Position(selection.startLineNumber, selection.startColumn + replaceString.length);
			this.decorationIndex = -1;
			this.didReplace = true;
		} else {
			this.next();
		}
	}

	private _findMatches(limitResultCount?:number): EditorCommon.IEditorRange[] {
		return this.editor.getModel().findMatches(this.searchString, this._getSearchRange(), this.isRegex, this.matchCase, this.wholeWord, limitResultCount);
	}

	public replaceAll(): void {
		if (this.decorations.length === 0) {
			return;
		}

		let model = this.editor.getModel();

		// Get all the ranges (even more than the highlighted ones)
		let ranges = this._findMatches(Number.MAX_VALUE);

		// Remove all decorations
		this.editor.changeDecorations((changeAccessor:EditorCommon.IModelDecorationsChangeAccessor) => {
			this.removeOldDecorations(changeAccessor, false);
		});

		var replaceStrings:string[] = [];
		for (var i = 0, len = ranges.length; i < len; i++) {
			replaceStrings.push(this.getReplaceString(model.getValueInRange(ranges[i])));
		}

		var command = new ReplaceAllCommand.ReplaceAllCommand(ranges, replaceStrings);
		this.editor.executeCommand('replaceAll', command);
	}

	public dispose(): void {
		super.dispose();
		this.updateDecorationsScheduler.dispose();
		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];
		if (this.editor.getModel()) {
			this.editor.changeDecorations((changeAccessor:EditorCommon.IModelDecorationsChangeAccessor) => {
				this.removeOldDecorations(changeAccessor, true);
			});
		}
	}

	public hasFindScope(): boolean {
		return !!this.findScopeDecorationId;
	}

	private previousIndex(index:number): number {
		if (this.decorations.length > 0) {
			return (index - 1 + this.decorations.length) % this.decorations.length;
		}
		return 0;
	}

	private nextIndex(index:number): number {
		if (this.decorations.length > 0) {
			return (index + 1) % this.decorations.length;
		}
		return 0;
	}

	private indexAfterPosition(position:EditorCommon.IEditorPosition): number {
		if (this.decorations.length === 0) {
			return 0;
		}
		for (var i = 0, len = this.decorations.length; i < len; i++) {
			var decorationId = this.decorations[i];
			var r = this.editor.getModel().getDecorationRange(decorationId);
			if (!r || r.startLineNumber < position.lineNumber) {
				continue;
			}
			if (r.startLineNumber > position.lineNumber) {
				return i;
			}
			if (r.startColumn < position.column) {
				continue;
			}
			return i;
		}
		return 0;
	}

	public addStartEventListener(callback:(e:IFindStartEvent)=>void): Lifecycle.IDisposable {
		return this.addListener2(FindModelBoundToEditorModel._START_EVENT, callback);
	}

	private _emitStartEvent(e:IFindStartEvent): void {
		this.emit(FindModelBoundToEditorModel._START_EVENT, e);
	}

	public addMatchesUpdatedEventListener(callback:(e:IFindMatchesEvent)=>void): Lifecycle.IDisposable {
		return this.addListener2(FindModelBoundToEditorModel._MATCHES_UPDATED_EVENT, callback);
	}

	private _emitMatchesUpdatedEvent(e:IFindMatchesEvent): void {
		this.emit(FindModelBoundToEditorModel._MATCHES_UPDATED_EVENT, e);
	}

}

const BACKSLASH_CHAR_CODE = '\\'.charCodeAt(0);
const n_CHAR_CODE = 'n'.charCodeAt(0);
const t_CHAR_CODE = 't'.charCodeAt(0);

/**
 * \n => LF
 * \t => TAB
 * \\ => \
 * everything else stays untouched
 */
export function parseReplaceString(input:string): string {
	if (!input || input.length === 0) {
		return input;
	}

	let substrFrom = 0, result = '';
	for (let i = 0, len = input.length; i < len; i++) {
		let chCode = input.charCodeAt(i);

		if (chCode === BACKSLASH_CHAR_CODE) {

			// move to next char
			i++;

			if (i >= len) {
				// string ends with a \
				break;
			}

			let nextChCode = input.charCodeAt(i);
			let replaceWithCharacter: string = null;

			switch (nextChCode) {
				case BACKSLASH_CHAR_CODE:
					// \\ => \
					replaceWithCharacter = '\\';
					break;
				case n_CHAR_CODE:
					// \n => LF
					replaceWithCharacter = '\n';
					break;
				case t_CHAR_CODE:
					// \t => TAB
					replaceWithCharacter = '\t';
					break;
			}

			if (replaceWithCharacter) {
				result += input.substring(substrFrom, i - 1) + replaceWithCharacter;
				substrFrom = i + 1;
			}
		}
	}

	if (substrFrom === 0) {
		// no replacement occured
		return input;
	}

	return result + input.substring(substrFrom);
}
