/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { RunOnceScheduler } from 'vs/base/common/async';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ReplacePattern, parseReplaceString } from 'vs/editor/contrib/find/common/replacePattern';
import { ReplaceCommand } from 'vs/editor/common/commands/replaceCommand';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { FindDecorations } from './findDecorations';
import { FindReplaceState, FindReplaceStateChangedEvent } from './findState';
import { ReplaceAllCommand } from './replaceAllCommand';
import { Selection } from 'vs/editor/common/core/selection';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IKeybindings } from 'vs/platform/keybinding/common/keybinding';

export const ToggleCaseSensitiveKeybinding: IKeybindings = {
	primary: KeyMod.Alt | KeyCode.KEY_C,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_C }
};
export const ToggleWholeWordKeybinding: IKeybindings = {
	primary: KeyMod.Alt | KeyCode.KEY_W,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_W }
};
export const ToggleRegexKeybinding: IKeybindings = {
	primary: KeyMod.Alt | KeyCode.KEY_R,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_R }
};
export const ShowPreviousFindTermKeybinding: IKeybindings = {
	primary: KeyMod.Alt | KeyCode.UpArrow
};
export const ShowNextFindTermKeybinding: IKeybindings = {
	primary: KeyMod.Alt | KeyCode.DownArrow
};

export const FIND_IDS = {
	StartFindAction: 'actions.find',
	NextMatchFindAction: 'editor.action.nextMatchFindAction',
	PreviousMatchFindAction: 'editor.action.previousMatchFindAction',
	NextSelectionMatchFindAction: 'editor.action.nextSelectionMatchFindAction',
	PreviousSelectionMatchFindAction: 'editor.action.previousSelectionMatchFindAction',
	AddSelectionToNextFindMatchAction: 'editor.action.addSelectionToNextFindMatch',
	AddSelectionToPreviousFindMatchAction: 'editor.action.addSelectionToPreviousFindMatch',
	MoveSelectionToNextFindMatchAction: 'editor.action.moveSelectionToNextFindMatch',
	MoveSelectionToPreviousFindMatchAction: 'editor.action.moveSelectionToPreviousFindMatch',
	StartFindReplaceAction: 'editor.action.startFindReplaceAction',
	CloseFindWidgetCommand: 'closeFindWidget',
	ToggleCaseSensitiveCommand: 'toggleFindCaseSensitive',
	ToggleWholeWordCommand: 'toggleFindWholeWord',
	ToggleRegexCommand: 'toggleFindRegex',
	ReplaceOneAction: 'editor.action.replaceOne',
	ReplaceAllAction: 'editor.action.replaceAll',
	SelectAllMatchesAction: 'editor.action.selectAllMatches',
	ShowPreviousFindTermAction: 'find.history.showPrevious',
	ShowNextFindTermAction: 'find.history.showNext'
};

export const MATCHES_LIMIT = 999;

export class FindModelBoundToEditorModel {

	private _editor: editorCommon.ICommonCodeEditor;
	private _state: FindReplaceState;
	private _toDispose: IDisposable[];
	private _decorations: FindDecorations;
	private _ignoreModelContentChanged: boolean;

	private _updateDecorationsScheduler: RunOnceScheduler;
	private _isDisposed: boolean;

	constructor(editor: editorCommon.ICommonCodeEditor, state: FindReplaceState) {
		this._editor = editor;
		this._state = state;
		this._toDispose = [];
		this._isDisposed = false;

		this._decorations = new FindDecorations(editor);
		this._toDispose.push(this._decorations);

		this._updateDecorationsScheduler = new RunOnceScheduler(() => this.research(false), 100);
		this._toDispose.push(this._updateDecorationsScheduler);

		this._toDispose.push(this._editor.onDidChangeCursorPosition((e: editorCommon.ICursorPositionChangedEvent) => {
			if (
				e.reason === editorCommon.CursorChangeReason.Explicit
				|| e.reason === editorCommon.CursorChangeReason.Undo
				|| e.reason === editorCommon.CursorChangeReason.Redo
			) {
				this._decorations.setStartPosition(this._editor.getPosition());
			}
		}));

		this._ignoreModelContentChanged = false;
		this._toDispose.push(this._editor.onDidChangeModelRawContent((e: editorCommon.IModelContentChangedEvent) => {
			if (this._ignoreModelContentChanged) {
				return;
			}
			if (e.changeType === editorCommon.EventType.ModelRawContentChangedFlush) {
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
		this._isDisposed = true;
		this._toDispose = dispose(this._toDispose);
	}

	private _onStateChanged(e: FindReplaceStateChangedEvent): void {
		if (this._isDisposed) {
			// The find model is disposed during a find state changed event
			return;
		}
		if (e.searchString || e.isReplaceRevealed || e.isRegex || e.wholeWord || e.matchCase || e.searchScope) {
			if (e.searchScope) {
				this.research(e.moveCursor, this._state.searchScope);
			} else {
				this.research(e.moveCursor);
			}
		}
	}

	private static _getSearchRange(model: editorCommon.IModel, searchOnlyEditableRange: boolean, findScope: Range): Range {
		let searchRange: Range;

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

	private research(moveCursor: boolean, newFindScope?: Range): void {
		let findScope: Range = null;
		if (typeof newFindScope !== 'undefined') {
			findScope = newFindScope;
		} else {
			findScope = this._decorations.getFindScope();
		}
		if (findScope !== null) {
			findScope = new Range(findScope.startLineNumber, 1, findScope.endLineNumber, this._editor.getModel().getLineMaxColumn(findScope.endLineNumber));
		}

		let findMatches = this._findMatches(findScope, false, MATCHES_LIMIT);
		this._decorations.set(findMatches.map(match => match.range), findScope);

		this._state.changeMatchInfo(
			this._decorations.getCurrentMatchesPosition(this._editor.getSelection()),
			this._decorations.getCount(),
			undefined
		);

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

	private _setCurrentFindMatch(match: Range): void {
		let matchesPosition = this._decorations.setCurrentFindMatch(match);
		this._state.changeMatchInfo(
			matchesPosition,
			this._decorations.getCount(),
			match
		);

		this._editor.setSelection(match);
		this._editor.revealRangeInCenterIfOutsideViewport(match);
	}

	private _moveToPrevMatch(before: Position, isRecursed: boolean = false): void {
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

		let {lineNumber, column} = before;
		let model = this._editor.getModel();

		let position = new Position(lineNumber, column);

		let prevMatch = model.findPreviousMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord, false);

		if (prevMatch && prevMatch.range.isEmpty() && prevMatch.range.getStartPosition().equals(position)) {
			// Looks like we're stuck at this position, unacceptable!

			let isUsingLineStops = this._state.isRegex && (
				this._state.searchString.indexOf('^') >= 0
				|| this._state.searchString.indexOf('$') >= 0
			);

			if (isUsingLineStops || column === 1) {
				if (lineNumber === 1) {
					lineNumber = model.getLineCount();
				} else {
					lineNumber--;
				}
				column = model.getLineMaxColumn(lineNumber);
			} else {
				column--;
			}

			position = new Position(lineNumber, column);
			prevMatch = model.findPreviousMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord, false);
		}

		if (!prevMatch) {
			// there is precisely one match and selection is on top of it
			return null;
		}

		if (!isRecursed && !searchRange.containsRange(prevMatch.range)) {
			return this._moveToPrevMatch(prevMatch.range.getStartPosition(), true);
		}

		this._setCurrentFindMatch(prevMatch.range);
	}

	public moveToPrevMatch(): void {
		this._moveToPrevMatch(this._editor.getSelection().getStartPosition());
	}

	private _moveToNextMatch(after: Position): void {
		let nextMatch = this._getNextMatch(after, false);
		if (nextMatch) {
			this._setCurrentFindMatch(nextMatch.range);
		}
	}

	private _getNextMatch(after: Position, captureMatches: boolean, isRecursed: boolean = false): editorCommon.FindMatch {
		if (this._cannotFind()) {
			return null;
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

		let {lineNumber, column} = after;
		let model = this._editor.getModel();

		let position = new Position(lineNumber, column);

		let nextMatch = model.findNextMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord, captureMatches);

		if (nextMatch && nextMatch.range.isEmpty() && nextMatch.range.getStartPosition().equals(position)) {
			// Looks like we're stuck at this position, unacceptable!

			let isUsingLineStops = this._state.isRegex && (
				this._state.searchString.indexOf('^') >= 0
				|| this._state.searchString.indexOf('$') >= 0
			);

			if (isUsingLineStops || column === model.getLineMaxColumn(lineNumber)) {
				if (lineNumber === model.getLineCount()) {
					lineNumber = 1;
				} else {
					lineNumber++;
				}
				column = 1;
			} else {
				column++;
			}

			position = new Position(lineNumber, column);
			nextMatch = model.findNextMatch(this._state.searchString, position, this._state.isRegex, this._state.matchCase, this._state.wholeWord, captureMatches);
		}

		if (!nextMatch) {
			// there is precisely one match and selection is on top of it
			return null;
		}

		if (!isRecursed && !searchRange.containsRange(nextMatch.range)) {
			return this._getNextMatch(nextMatch.range.getEndPosition(), captureMatches, true);
		}

		return nextMatch;
	}

	public moveToNextMatch(): void {
		this._moveToNextMatch(this._editor.getSelection().getEndPosition());
	}

	private _getReplacePattern(): ReplacePattern {
		if (this._state.isRegex) {
			return parseReplaceString(this._state.replaceString);
		}
		return ReplacePattern.fromStaticValue(this._state.replaceString);
	}

	public replace(): void {
		if (!this._hasMatches()) {
			return;
		}

		let replacePattern = this._getReplacePattern();
		let selection = this._editor.getSelection();
		let nextMatch = this._getNextMatch(selection.getStartPosition(), replacePattern.hasReplacementPatterns);
		if (nextMatch) {
			if (selection.equalsRange(nextMatch.range)) {
				// selection sits on a find match => replace it!
				let replaceString = replacePattern.buildReplaceString(nextMatch.matches);

				let command = new ReplaceCommand(selection, replaceString);

				this._executeEditorCommand('replace', command);

				this._decorations.setStartPosition(new Position(selection.startLineNumber, selection.startColumn + replaceString.length));
				this.research(true);
			} else {
				this._decorations.setStartPosition(this._editor.getPosition());
				this._setCurrentFindMatch(nextMatch.range);
			}
		}
	}

	private _findMatches(findScope: Range, captureMatches: boolean, limitResultCount: number): editorCommon.FindMatch[] {
		let searchRange = FindModelBoundToEditorModel._getSearchRange(this._editor.getModel(), this._state.isReplaceRevealed, findScope);
		return this._editor.getModel().findMatches(this._state.searchString, searchRange, this._state.isRegex, this._state.matchCase, this._state.wholeWord, captureMatches, limitResultCount);
	}

	public replaceAll(): void {
		if (!this._hasMatches()) {
			return;
		}

		let findScope = this._decorations.getFindScope();
		let replacePattern = this._getReplacePattern();
		// Get all the ranges (even more than the highlighted ones)
		let matches = this._findMatches(findScope, replacePattern.hasReplacementPatterns, Number.MAX_VALUE);

		let replaceStrings: string[] = [];
		for (let i = 0, len = matches.length; i < len; i++) {
			replaceStrings[i] = replacePattern.buildReplaceString(matches[i].matches);
		}

		let command = new ReplaceAllCommand(this._editor.getSelection(), matches.map(m => m.range), replaceStrings);
		this._executeEditorCommand('replaceAll', command);

		this.research(false);
	}

	public selectAllMatches(): void {
		if (!this._hasMatches()) {
			return;
		}

		let findScope = this._decorations.getFindScope();

		// Get all the ranges (even more than the highlighted ones)
		let matches = this._findMatches(findScope, false, Number.MAX_VALUE);
		let selections = matches.map(m => new Selection(m.range.startLineNumber, m.range.startColumn, m.range.endLineNumber, m.range.endColumn));

		// If one of the ranges is the editor selection, then maintain it as primary
		let editorSelection = this._editor.getSelection();
		for (let i = 0, len = selections.length; i < len; i++) {
			let sel = selections[i];
			if (sel.equalsRange(editorSelection)) {
				selections = [editorSelection].concat(selections.slice(0, i)).concat(selections.slice(i + 1));
				break;
			}
		}

		this._editor.setSelections(selections);
	}

	private _executeEditorCommand(source: string, command: editorCommon.ICommand): void {
		try {
			this._ignoreModelContentChanged = true;
			this._editor.executeCommand(source, command);
		} finally {
			this._ignoreModelContentChanged = false;
		}
	}
}