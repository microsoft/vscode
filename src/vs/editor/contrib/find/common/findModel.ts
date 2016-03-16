/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {RunOnceScheduler} from 'vs/base/common/async';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import {ReplaceCommand} from 'vs/editor/common/commands/replaceCommand';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {FindDecorations} from './findDecorations';
import {FindReplaceState, FindReplaceStateChangedEvent} from './findState';
import {ReplaceAllCommand} from './replaceAllCommand';

export const FIND_IDS = {
	StartFindAction: 'actions.find',
	NextMatchFindAction: 'editor.action.nextMatchFindAction',
	PreviousMatchFindAction: 'editor.action.previousMatchFindAction',
	NextSelectionMatchFindAction: 'editor.action.nextSelectionMatchFindAction',
	PreviousSelectionMatchFindAction: 'editor.action.previousSelectionMatchFindAction',
	AddSelectionToNextFindMatchAction: 'editor.action.addSelectionToNextFindMatch',
	MoveSelectionToNextFindMatchAction: 'editor.action.moveSelectionToNextFindMatch',
	StartFindReplaceAction: 'editor.action.startFindReplaceAction',
	CloseFindWidgetCommand: 'closeFindWidget',
	ToggleCaseSensitiveCommand: 'toggleFindCaseSensitive',
	ToggleWholeWordCommand: 'toggleFindWholeWord',
	ToggleRegexCommand: 'toggleFindRegex',
	ReplaceOneAction: 'editor.action.replaceOne',
	ReplaceAllAction: 'editor.action.replaceAll'
};

export const MATCHES_LIMIT = 999;

export class FindModelBoundToEditorModel {

	private _editor:editorCommon.ICommonCodeEditor;
	private _state:FindReplaceState;
	private _toDispose:IDisposable[];
	private _decorations: FindDecorations;
	private _ignoreModelContentChanged:boolean;

	private _updateDecorationsScheduler:RunOnceScheduler;

	constructor(editor:editorCommon.ICommonCodeEditor, state:FindReplaceState) {
		this._editor = editor;
		this._state = state;
		this._toDispose = [];

		this._decorations = new FindDecorations(editor);
		this._toDispose.push(this._decorations);

		this._updateDecorationsScheduler = new RunOnceScheduler(() => this.research(false), 100);
		this._toDispose.push(this._updateDecorationsScheduler);

		this._toDispose.push(this._editor.addListener2(editorCommon.EventType.CursorPositionChanged, (e:editorCommon.ICursorPositionChangedEvent) => {
			if (e.reason === 'explicit' || e.reason === 'undo' || e.reason === 'redo') {
				this._decorations.setStartPosition(this._editor.getPosition());
			}
		}));

		this._ignoreModelContentChanged = false;
		this._toDispose.push(this._editor.addListener2(editorCommon.EventType.ModelContentChanged, (e:editorCommon.IModelContentChangedEvent) => {
			if (this._ignoreModelContentChanged) {
				return;
			}
			if (e.changeType === editorCommon.EventType.ModelContentChangedFlush) {
				// a model.setValue() was called
				this._decorations.reset();
			}
			this._decorations.setStartPosition(this._editor.getPosition());
			this._updateDecorationsScheduler.schedule();
		}));

		this._toDispose.push(this._state.addChangeListener((e) => this._onStateChanged(e)));

		this.research(false, this._state.searchScope);
	}

	public dispose(): void {
		this._toDispose = disposeAll(this._toDispose);
	}

	private _onStateChanged(e:FindReplaceStateChangedEvent): void {
		if (e.searchString || e.isReplaceRevealed || e.isRegex || e.wholeWord || e.matchCase || e.searchScope) {
			if (e.searchScope) {
				this.research(e.moveCursor, this._state.searchScope);
			} else {
				this.research(e.moveCursor);
			}
		}
	}

	private static _getSearchRange(model:editorCommon.IModel, searchOnlyEditableRange:boolean, findScope:editorCommon.IEditorRange): editorCommon.IEditorRange {
		let searchRange:editorCommon.IEditorRange;

		if (searchOnlyEditableRange) {
			searchRange = model.getEditableRange();
		} else {
			searchRange = model.getFullModelRange();
		}

		// If we have set now or before a find scope, use it for computing the search range
		if (findScope) {
			searchRange = searchRange.intersectRanges(findScope);
		}

		return searchRange;
	}

	private research(moveCursor:boolean, newFindScope?:editorCommon.IEditorRange): void {
		let findScope: editorCommon.IEditorRange = null;
		if (typeof newFindScope !== 'undefined') {
			findScope = newFindScope;
		} else {
			findScope = this._decorations.getFindScope();
		}
		if (findScope !== null) {
			findScope = new Range(findScope.startLineNumber, 1, findScope.endLineNumber, this._editor.getModel().getLineMaxColumn(findScope.endLineNumber));
		}

		let findMatches = this._findMatches(findScope, MATCHES_LIMIT);
		this._decorations.set(findMatches, findScope);

		this._state.changeMatchInfo(this._decorations.getCurrentMatchesPosition(this._editor.getSelection()), this._decorations.getCount());

		if (moveCursor) {
			this._moveToNextMatch(this._decorations.getStartPosition());
		}
	}

	private _hasMatches(): boolean {
		return (this._state.matchesCount > 0);
	}

	private _cannotFind(): boolean {
		if (!this._hasMatches()) {
			let findScope = this._decorations.getFindScope();
			if (findScope) {
				// Reveal the selection so user is reminded that 'selection find' is on.
				this._editor.revealRangeInCenterIfOutsideViewport(findScope);
			}
			return true;
		}
		return false;
	}

	private _moveToPrevMatch(before:editorCommon.IEditorPosition, isRecursed:boolean = false): void {
		if (this._cannotFind()) {
			return;
		}

		let findScope = this._decorations.getFindScope();
		let searchRange = FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), this._state.isReplaceRevealed, findScope);

		// ...(----)...|...
		if (searchRange.getEndPosition().isBefore(before)) {
			before = searchRange.getEndPosition();
		}

		// ...|...(----)...
		if (before.isBefore(searchRange.getStartPosition())) {
			before = searchRange.getEndPosition();
		}

		let {lineNumber,column} = before;
		let model = this._editor.getModel();

		if (this._state.isRegex) {
			// Force advancing to the previous line if searching for $
			if (this._state.searchString === '$') {
				if (lineNumber === 1) {
					lineNumber = model.getLineCount();
				} else {
					lineNumber--;
				}
				column = model.getLineMaxColumn(lineNumber);
			}

			// Force advancing to the previous line if searching for ^ or ^$ and cursor is at the beginning
			if (this._state.searchString === '^' || this._state.searchString === '^$') {
				if (column === 1) {
					if (lineNumber === 1) {
						lineNumber = model.getLineCount();
					} else {
						lineNumber--;
					}
					column = model.getLineMaxColumn(lineNumber);
				}
			}
		}

		let position = new Position(lineNumber, column);

		let prevMatch = model.findPreviousMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord);
		if (!prevMatch) {
			// there is precisely one match and selection is on top of it
			return;
		}

		if (!isRecursed && !searchRange.containsRange(prevMatch)) {
			return this._moveToPrevMatch(prevMatch.getStartPosition(), true);
		}

		let matchesPosition = this._decorations.setCurrentFindMatch(prevMatch);
		this._state.changeMatchInfo(matchesPosition, this._decorations.getCount());
		this._editor.setSelection(prevMatch);
		this._editor.revealRangeInCenterIfOutsideViewport(prevMatch);
	}

	public moveToPrevMatch(): void {
		this._moveToPrevMatch(this._editor.getSelection().getStartPosition());
	}

	public _moveToNextMatch(after:editorCommon.IEditorPosition, isRecursed:boolean = false): void {
		if (this._cannotFind()) {
			return;
		}

		let findScope = this._decorations.getFindScope();
		let searchRange = FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), this._state.isReplaceRevealed, findScope);

		// ...(----)...|...
		if (searchRange.getEndPosition().isBefore(after)) {
			after = searchRange.getStartPosition();
		}

		// ...|...(----)...
		if (after.isBefore(searchRange.getStartPosition())) {
			after = searchRange.getStartPosition();
		}

		let {lineNumber,column} = after;
		let model = this._editor.getModel();

		if (this._state.isRegex) {
			// Force advancing to the next line if searching for ^ or ^$
			if (this._state.searchString === '^' || this._state.searchString === '^$') {
				if (lineNumber === model.getLineCount()) {
					lineNumber = 1;
				} else {
					lineNumber++;
				}
				column = 1;
			}

			// Force advancing to the next line if searching for $ and at the end of the line
			if (this._state.searchString === '$') {
				if (column === model.getLineMaxColumn(lineNumber)) {
					if (lineNumber === model.getLineCount()) {
						lineNumber = 1;
					} else {
						lineNumber++;
					}
					column = 1;
				}
			}
		}

		let position = new Position(lineNumber, column);

		let nextMatch = model.findNextMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord);

		if (!nextMatch) {
			// there is precisely one match and selection is on top of it
			return;
		}

		if (!isRecursed && !searchRange.containsRange(nextMatch)) {
			return this._moveToNextMatch(nextMatch.getEndPosition(), true);
		}

		let matchesPosition = this._decorations.setCurrentFindMatch(nextMatch);
		this._state.changeMatchInfo(matchesPosition, this._decorations.getCount());
		this._editor.setSelection(nextMatch);
		this._editor.revealRangeInCenterIfOutsideViewport(nextMatch);
	}

	public moveToNextMatch(): void {
		this._moveToNextMatch(this._editor.getSelection().getEndPosition());
	}

	private getReplaceString(matchedString:string): string {
		if (!this._state.isRegex) {
			return this._state.replaceString;
		}
		let regexp = strings.createRegExp(this._state.searchString, this._state.isRegex, this._state.matchCase, this._state.wholeWord, true);
		// Parse the replace string to support that \t or \n mean the right thing
		let parsedReplaceString = parseReplaceString(this._state.replaceString);
		return matchedString.replace(regexp, parsedReplaceString);
	}

	private _rangeIsMatch(range:editorCommon.IEditorRange): boolean {
		let selection = this._editor.getSelection();
		let selectionText = this._editor.getModel().getValueInRange(selection);
		let regexp = strings.createSafeRegExp(this._state.searchString, this._state.isRegex, this._state.matchCase, this._state.wholeWord);
		let m = selectionText.match(regexp);
		return (m && m[0].length === selectionText.length);
	}

	public replace(): void {
		if (!this._hasMatches()) {
			return;
		}

		let selection = this._editor.getSelection();
		let selectionText = this._editor.getModel().getValueInRange(selection);
		if (this._rangeIsMatch(selection)) {
			// selection sits on a find match => replace it!
			let replaceString = this.getReplaceString(selectionText);

			let command = new ReplaceCommand(selection, replaceString);

			this._executeEditorCommand('replace', command);

			this._decorations.setStartPosition(new Position(selection.startLineNumber, selection.startColumn + replaceString.length));
			this.research(true);
		} else {
			this._decorations.setStartPosition(this._editor.getPosition());
			this.moveToNextMatch();
		}
	}

	private _findMatches(findScope: editorCommon.IEditorRange, limitResultCount:number): editorCommon.IEditorRange[] {
		let searchRange = FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), this._state.isReplaceRevealed, findScope);
		return this._editor.getModel().findMatches(this._state.searchString, searchRange, this._state.isRegex, this._state.matchCase, this._state.wholeWord, limitResultCount);
	}

	public replaceAll(): void {
		if (!this._hasMatches()) {
			return;
		}

		let model = this._editor.getModel();
		let findScope = this._decorations.getFindScope();

		// Get all the ranges (even more than the highlighted ones)
		let ranges = this._findMatches(findScope, Number.MAX_VALUE);

		let replaceStrings:string[] = [];
		for (let i = 0, len = ranges.length; i < len; i++) {
			replaceStrings.push(this.getReplaceString(model.getValueInRange(ranges[i])));
		}

		let command = new ReplaceAllCommand(ranges, replaceStrings);
		this._executeEditorCommand('replaceAll', command);

		this.research(false);
	}

	private _executeEditorCommand(source:string, command:editorCommon.ICommand): void {
		try {
			this._ignoreModelContentChanged = true;
			this._editor.executeCommand(source, command);
		} finally {
			this._ignoreModelContentChanged = false;
		}
	}
}

const BACKSLASH_CHAR_CODE = '\\'.charCodeAt(0);
const DOLLAR_CHAR_CODE = '$'.charCodeAt(0);
const ZERO_CHAR_CODE = '0'.charCodeAt(0);
const n_CHAR_CODE = 'n'.charCodeAt(0);
const t_CHAR_CODE = 't'.charCodeAt(0);

/**
 * \n => LF
 * \t => TAB
 * \\ => \
 * $0 => $& (see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#Specifying_a_string_as_a_parameter)
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

		if (chCode === DOLLAR_CHAR_CODE) {

			// move to next char
			i++;

			if (i >= len) {
				// string ends with a $
				break;
			}

			let nextChCode = input.charCodeAt(i);
			let replaceWithCharacter: string = null;

			switch (nextChCode) {
				case ZERO_CHAR_CODE:
					// $0 => $&
					replaceWithCharacter = '$&';
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
