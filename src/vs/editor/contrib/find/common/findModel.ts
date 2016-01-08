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
import {FindDecorations} from './findDecorations';
import {FindReplaceStateChangedEvent, FindReplaceState} from './findState';

export const FindIds = {
	START_FIND_ACTION_ID: 'actions.find',
	NEXT_MATCH_FIND_ACTION_ID: 'editor.action.nextMatchFindAction',
	PREVIOUS_MATCH_FIND_ACTION_ID: 'editor.action.previousMatchFindAction',
	START_FIND_REPLACE_ACTION_ID: 'editor.action.startFindReplaceAction',
	CLOSE_FIND_WIDGET_COMMAND_ID: 'closeFindWidget',
	TOGGLE_CASE_SENSITIVE_COMMAND_ID: 'toggleFindCaseSensitive',
	TOGGLE_WHOLE_WORD_COMMAND_ID: 'toggleFindWholeWord',
	TOGGLE_REGEX_COMMAND_ID: 'toggleFindRegex'
}

export class FindModelBoundToEditorModel {

	private editor:EditorCommon.ICommonCodeEditor;
	private _state:FindReplaceState;
	private _toDispose:Lifecycle.IDisposable[];
	private _decorations: FindDecorations;
	private _ignoreModelContentChanged:boolean;

	private updateDecorationsScheduler:Schedulers.RunOnceScheduler;

	constructor(editor:EditorCommon.ICommonCodeEditor, state:FindReplaceState) {
		this.editor = editor;
		this._state = state;
		this._toDispose = [];

		this._decorations = new FindDecorations(editor);
		this._toDispose.push(this._decorations);

		this.updateDecorationsScheduler = new Schedulers.RunOnceScheduler(() => this.research(false), 100);
		this._toDispose.push(this.updateDecorationsScheduler);

		this._toDispose.push(this.editor.addListener2(EditorCommon.EventType.CursorPositionChanged, (e:EditorCommon.ICursorPositionChangedEvent) => {
			if (e.reason === 'explicit' || e.reason === 'undo' || e.reason === 'redo') {
				this._decorations.setStartPosition(this.editor.getPosition());
			}
		}));

		this._ignoreModelContentChanged = false;
		this._toDispose.push(this.editor.addListener2(EditorCommon.EventType.ModelContentChanged, (e:EditorCommon.IModelContentChangedEvent) => {
			if (this._ignoreModelContentChanged) {
				return;
			}
			if (e.changeType === EditorCommon.EventType.ModelContentChangedFlush) {
				// a model.setValue() was called
				this._decorations.reset();
			}
			this._decorations.setStartPosition(this.editor.getPosition());
			this.updateDecorationsScheduler.schedule();
		}));

		this._toDispose.push(this._state.addChangeListener((e) => this._onStateChanged(e)));

		this.research(false, this._state.searchScope);
	}

	public dispose(): void {
		this._toDispose = Lifecycle.disposeAll(this._toDispose);
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

	private static _getSearchRange(model:EditorCommon.IModel, searchOnlyEditableRange:boolean, findScope:EditorCommon.IEditorRange): EditorCommon.IEditorRange {
		let searchRange:EditorCommon.IEditorRange;

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

	private research(moveCursor:boolean, newFindScope?:EditorCommon.IEditorRange): void {
		let findScope: EditorCommon.IEditorRange = null;
		if (typeof newFindScope !== 'undefined') {
			findScope = newFindScope;
		} else {
			findScope = this._decorations.getFindScope();
		}

		let findMatches = this._findMatches(findScope);
		this._decorations.set(findMatches, findScope);

		this._state.change({ matchesCount: findMatches.length }, false);

		if (moveCursor) {
			this._decorations.moveToFirstAfterStartPosition();
		}
	}

	public moveToPrevMatch(): void {
		this._decorations.movePrev();
	}

	public moveToNextMatch(): void {
		this._decorations.moveNext();
	}

	private getReplaceString(matchedString:string): string {
		if (!this._state.isRegex) {
			return this._state.replaceString;
		}
		let regexp = Strings.createRegExp(this._state.searchString, this._state.isRegex, this._state.matchCase, this._state.wholeWord);
		// Parse the replace string to support that \t or \n mean the right thing
		let parsedReplaceString = parseReplaceString(this._state.replaceString);
		return matchedString.replace(regexp, parsedReplaceString);
	}

	public replace(): void {
		if (!this._decorations.hasMatches()) {
			return;
		}

		let model = this.editor.getModel();
		let currentDecorationRange = this._decorations.getCurrentIndexRange();
		let selection = this.editor.getSelection();

		if (currentDecorationRange !== null &&
			selection.startColumn === currentDecorationRange.startColumn &&
			selection.endColumn === currentDecorationRange.endColumn &&
			selection.startLineNumber === currentDecorationRange.startLineNumber &&
			selection.endLineNumber === currentDecorationRange.endLineNumber) {

			let matchedString = model.getValueInRange(selection);
			let replaceString = this.getReplaceString(matchedString);

			let command = new ReplaceCommand(selection, replaceString);

			this._executeEditorCommand('replace', command);

			this._decorations.setStartPosition(new Position(selection.startLineNumber, selection.startColumn + replaceString.length));
			this.research(true);
		} else {
			this.moveToNextMatch();
		}
	}

	private _findMatches(findScope: EditorCommon.IEditorRange, limitResultCount?:number): EditorCommon.IEditorRange[] {
		let searchRange = FindModelBoundToEditorModel._getSearchRange(this.editor.getModel(), this._state.isReplaceRevealed, findScope);
		return this.editor.getModel().findMatches(this._state.searchString, searchRange, this._state.isRegex, this._state.matchCase, this._state.wholeWord, limitResultCount);
	}

	public replaceAll(): void {
		if (!this._decorations.hasMatches()) {
			return;
		}

		let model = this.editor.getModel();
		let findScope = this._decorations.getFindScope();

		// Get all the ranges (even more than the highlighted ones)
		let ranges = this._findMatches(findScope, Number.MAX_VALUE);

		this._decorations.set([], findScope);

		let replaceStrings:string[] = [];
		for (let i = 0, len = ranges.length; i < len; i++) {
			replaceStrings.push(this.getReplaceString(model.getValueInRange(ranges[i])));
		}

		let command = new ReplaceAllCommand.ReplaceAllCommand(ranges, replaceStrings);
		this._executeEditorCommand('replaceAll', command);
	}

	private _executeEditorCommand(source:string, command:EditorCommon.ICommand): void {
		try {
			this._ignoreModelContentChanged = true;
			this.editor.executeCommand(source, command);
		} finally {
			this._ignoreModelContentChanged = false;
		}
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
