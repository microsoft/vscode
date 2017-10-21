/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { RunOnceScheduler } from 'vs/base/common/async';
import { ICommonCodeEditor, ScrollType, IEditorContribution, FindMatch, TrackedRangeStickiness, OverviewRulerLane } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { editorAction, commonEditorContribution, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { CursorChangeReason, ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { CursorMoveCommands } from 'vs/editor/common/controller/cursorMoveCommands';
import { CursorState, RevealTarget } from 'vs/editor/common/controller/cursorCommon';
import { Constants } from 'vs/editor/common/core/uint';
import { DocumentHighlightProviderRegistry } from 'vs/editor/common/modes';
import { CommonFindController } from 'vs/editor/contrib/find/common/findController';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { overviewRulerSelectionHighlightForeground } from 'vs/platform/theme/common/colorRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';

@editorAction
export class InsertCursorAbove extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.insertCursorAbove',
			label: nls.localize('mutlicursor.insertAbove', "Add Cursor Above"),
			alias: 'Add Cursor Above',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow,
				linux: {
					primary: KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow]
				}
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor, args: any): void {
		const cursors = editor._getCursors();
		const context = cursors.context;

		if (context.config.readOnly) {
			return;
		}

		context.model.pushStackElement();
		cursors.setStates(
			args.source,
			CursorChangeReason.Explicit,
			CursorState.ensureInEditableRange(
				context,
				CursorMoveCommands.addCursorUp(context, cursors.getAll())
			)
		);
		cursors.reveal(true, RevealTarget.TopMost, ScrollType.Smooth);
	}
}

@editorAction
export class InsertCursorBelow extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.insertCursorBelow',
			label: nls.localize('mutlicursor.insertBelow', "Add Cursor Below"),
			alias: 'Add Cursor Below',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow,
				linux: {
					primary: KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow]
				}
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor, args: any): void {
		const cursors = editor._getCursors();
		const context = cursors.context;

		if (context.config.readOnly) {
			return;
		}

		context.model.pushStackElement();
		cursors.setStates(
			args.source,
			CursorChangeReason.Explicit,
			CursorState.ensureInEditableRange(
				context,
				CursorMoveCommands.addCursorDown(context, cursors.getAll())
			)
		);
		cursors.reveal(true, RevealTarget.BottomMost, ScrollType.Smooth);
	}
}

@editorAction
class InsertCursorAtEndOfEachLineSelected extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.insertCursorAtEndOfEachLineSelected',
			label: nls.localize('mutlicursor.insertAtEndOfEachLineSelected', "Add Cursors to Line Ends"),
			alias: 'Add Cursors to Line Ends',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_I
			}
		});
	}

	private getCursorsForSelection(selection: Selection, editor: ICommonCodeEditor): Selection[] {
		if (selection.isEmpty()) {
			return [];
		}

		let model = editor.getModel();
		let newSelections: Selection[] = [];
		for (let i = selection.startLineNumber; i < selection.endLineNumber; i++) {
			let currentLineMaxColumn = model.getLineMaxColumn(i);
			newSelections.push(new Selection(i, currentLineMaxColumn, i, currentLineMaxColumn));
		}
		if (selection.endColumn > 1) {
			newSelections.push(new Selection(selection.endLineNumber, selection.endColumn, selection.endLineNumber, selection.endColumn));
		}

		return newSelections;
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		let selections = editor.getSelections();
		let newSelections = selections
			.map((selection) => this.getCursorsForSelection(selection, editor))
			.reduce((prev, curr) => { return prev.concat(curr); });

		if (newSelections.length > 0) {
			editor.setSelections(newSelections);
		}
	}
}

export interface IMultiCursorFindInput {
	changeFindSearchString: boolean;
	allowMultiline: boolean;
	highlightFindOptions: boolean;
}

export interface IMultiCursorFindResult {
	searchText: string;
	matchCase: boolean;
	wholeWord: boolean;

	currentMatch: Selection;
}

@commonEditorContribution
export class MultiCursorSelectionController extends Disposable implements IEditorContribution {

	private static ID = 'editor.contrib.multiCursorController';

	private readonly _editor: ICommonCodeEditor;

	public static get(editor: ICommonCodeEditor): MultiCursorSelectionController {
		return editor.getContribution<MultiCursorSelectionController>(MultiCursorSelectionController.ID);
	}

	constructor(editor: ICommonCodeEditor) {
		super();
		this._editor = editor;
	}

	public dispose(): void {
		super.dispose();
	}

	public getId(): string {
		return MultiCursorSelectionController.ID;
	}

	public multiCursorFind(input: IMultiCursorFindInput): IMultiCursorFindResult {
		let controller = CommonFindController.get(this._editor);
		if (!controller) {
			return null;
		}
		let state = controller.getState();
		let searchText: string;
		let currentMatch: Selection;

		// In any case, if the find widget was ever opened, the options are taken from it
		let wholeWord = state.wholeWord;
		let matchCase = state.matchCase;

		// Find widget owns what we search for if:
		//  - focus is not in the editor (i.e. it is in the find widget)
		//  - and the search widget is visible
		//  - and the search string is non-empty
		if (!this._editor.isFocused() && state.isRevealed && state.searchString.length > 0) {
			// Find widget owns what is searched for
			searchText = state.searchString;
		} else {
			// Selection owns what is searched for
			let s = this._editor.getSelection();

			if (s.startLineNumber !== s.endLineNumber && !input.allowMultiline) {
				// multiline forbidden
				return null;
			}

			if (s.isEmpty()) {
				// selection is empty => expand to current word
				let word = this._editor.getModel().getWordAtPosition(s.getStartPosition());
				if (!word) {
					return null;
				}
				searchText = word.word;
				currentMatch = new Selection(s.startLineNumber, word.startColumn, s.startLineNumber, word.endColumn);
			} else {
				searchText = this._editor.getModel().getValueInRange(s).replace(/\r\n/g, '\n');
			}
			if (input.changeFindSearchString) {
				controller.setSearchString(searchText);
			}
		}

		if (input.highlightFindOptions) {
			controller.highlightFindOptions();
		}

		return {
			searchText: searchText,
			matchCase: matchCase,
			wholeWord: wholeWord,
			currentMatch: currentMatch
		};
	}

	private _getNextMatch(): Selection {
		let r = this.multiCursorFind({
			changeFindSearchString: true,
			allowMultiline: true,
			highlightFindOptions: true
		});
		if (!r) {
			return null;
		}
		if (r.currentMatch) {
			return r.currentMatch;
		}

		let allSelections = this._editor.getSelections();
		let lastAddedSelection = allSelections[allSelections.length - 1];

		let nextMatch = this._editor.getModel().findNextMatch(r.searchText, lastAddedSelection.getEndPosition(), false, r.matchCase, r.wholeWord ? this._editor.getConfiguration().wordSeparators : null, false);

		if (!nextMatch) {
			return null;
		}

		return new Selection(nextMatch.range.startLineNumber, nextMatch.range.startColumn, nextMatch.range.endLineNumber, nextMatch.range.endColumn);
	}

	private _getPreviousMatch(): Selection {
		let r = this.multiCursorFind({
			changeFindSearchString: true,
			allowMultiline: true,
			highlightFindOptions: true
		});
		if (!r) {
			return null;
		}
		if (r.currentMatch) {
			return r.currentMatch;
		}

		let allSelections = this._editor.getSelections();
		let lastAddedSelection = allSelections[allSelections.length - 1];

		let previousMatch = this._editor.getModel().findPreviousMatch(r.searchText, lastAddedSelection.getStartPosition(), false, r.matchCase, r.wholeWord ? this._editor.getConfiguration().wordSeparators : null, false);

		if (!previousMatch) {
			return null;
		}

		return new Selection(previousMatch.range.startLineNumber, previousMatch.range.startColumn, previousMatch.range.endLineNumber, previousMatch.range.endColumn);
	}

	public addSelectionToNextFindMatch(): void {
		const allSelections = this._editor.getSelections();

		// If there are mulitple cursors, handle the case where they do not all select the same text.
		if (allSelections.length > 1) {
			const model = this._editor.getModel();
			const controller = CommonFindController.get(this._editor);
			if (!controller) {
				return;
			}
			const findState = controller.getState();
			const caseSensitive = findState.matchCase;

			let selectionsContainSameText = true;

			let selectedText = model.getValueInRange(allSelections[0]);
			if (!caseSensitive) {
				selectedText = selectedText.toLowerCase();
			}
			for (let i = 1, len = allSelections.length; i < len; i++) {
				let selection = allSelections[i];
				if (selection.isEmpty()) {
					selectionsContainSameText = false;
					break;
				}

				let thisSelectedText = model.getValueInRange(selection);
				if (!caseSensitive) {
					thisSelectedText = thisSelectedText.toLowerCase();
				}
				if (selectedText !== thisSelectedText) {
					selectionsContainSameText = false;
					break;
				}
			}

			if (!selectionsContainSameText) {
				let resultingSelections: Selection[] = [];
				for (let i = 0, len = allSelections.length; i < len; i++) {
					let selection = allSelections[i];
					if (selection.isEmpty()) {
						let word = this._editor.getModel().getWordAtPosition(selection.getStartPosition());
						if (word) {
							resultingSelections[i] = new Selection(selection.startLineNumber, word.startColumn, selection.startLineNumber, word.endColumn);
							continue;
						}
					}
					resultingSelections[i] = selection;
				}
				this._editor.setSelections(resultingSelections);
				return;
			}
		}

		let nextMatch = this._getNextMatch();

		if (!nextMatch) {
			return;
		}

		this._editor.setSelections(allSelections.concat(nextMatch));
		this._editor.revealRangeInCenterIfOutsideViewport(nextMatch, ScrollType.Smooth);
	}

	public addSelectionToPreviousFindMatch(): void {
		let previousMatch = this._getPreviousMatch();

		if (!previousMatch) {
			return;
		}

		let allSelections = this._editor.getSelections();
		this._editor.setSelections(allSelections.concat(previousMatch));
		this._editor.revealRangeInCenterIfOutsideViewport(previousMatch, ScrollType.Smooth);
	}

	public moveSelectionToNextFindMatch(): void {
		let nextMatch = this._getNextMatch();

		if (!nextMatch) {
			return;
		}

		let allSelections = this._editor.getSelections();
		this._editor.setSelections(allSelections.slice(0, allSelections.length - 1).concat(nextMatch));
		this._editor.revealRangeInCenterIfOutsideViewport(nextMatch, ScrollType.Smooth);
	}

	public moveSelectionToPreviousFindMatch(): void {
		let previousMatch = this._getPreviousMatch();

		if (!previousMatch) {
			return;
		}

		let allSelections = this._editor.getSelections();
		this._editor.setSelections(allSelections.slice(0, allSelections.length - 1).concat(previousMatch));
		this._editor.revealRangeInCenterIfOutsideViewport(previousMatch, ScrollType.Smooth);
	}
}

export abstract class MultiCursorSelectionControllerAction extends EditorAction {

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		const controller = MultiCursorSelectionController.get(editor);
		if (!controller) {
			return;
		}
		this._run(controller);
	}

	protected abstract _run(controller: MultiCursorSelectionController): void;
}

function multiCursorFind(editor: ICommonCodeEditor, input: IMultiCursorFindInput): IMultiCursorFindResult {
	let controller = MultiCursorSelectionController.get(editor);
	if (!controller) {
		return null;
	}
	return controller.multiCursorFind(input);
}

@editorAction
export class AddSelectionToNextFindMatchAction extends MultiCursorSelectionControllerAction {

	constructor() {
		super({
			id: 'editor.action.addSelectionToNextFindMatch',
			label: nls.localize('addSelectionToNextFindMatch', "Add Selection To Next Find Match"),
			alias: 'Add Selection To Next Find Match',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_D
			}
		});
	}

	protected _run(controller: MultiCursorSelectionController): void {
		controller.addSelectionToNextFindMatch();
	}
}

@editorAction
export class AddSelectionToPreviousFindMatchAction extends MultiCursorSelectionControllerAction {

	constructor() {
		super({
			id: 'editor.action.addSelectionToPreviousFindMatch',
			label: nls.localize('addSelectionToPreviousFindMatch', "Add Selection To Previous Find Match"),
			alias: 'Add Selection To Previous Find Match',
			precondition: null
		});
	}

	protected _run(controller: MultiCursorSelectionController): void {
		controller.addSelectionToPreviousFindMatch();
	}
}

@editorAction
export class MoveSelectionToNextFindMatchAction extends MultiCursorSelectionControllerAction {

	constructor() {
		super({
			id: 'editor.action.moveSelectionToNextFindMatch',
			label: nls.localize('moveSelectionToNextFindMatch', "Move Last Selection To Next Find Match"),
			alias: 'Move Last Selection To Next Find Match',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_D)
			}
		});
	}

	protected _run(controller: MultiCursorSelectionController): void {
		controller.moveSelectionToNextFindMatch();
	}
}

@editorAction
export class MoveSelectionToPreviousFindMatchAction extends MultiCursorSelectionControllerAction {

	constructor() {
		super({
			id: 'editor.action.moveSelectionToPreviousFindMatch',
			label: nls.localize('moveSelectionToPreviousFindMatch', "Move Last Selection To Previous Find Match"),
			alias: 'Move Last Selection To Previous Find Match',
			precondition: null
		});
	}

	protected _run(controller: MultiCursorSelectionController): void {
		controller.moveSelectionToPreviousFindMatch();
	}
}

export abstract class AbstractSelectHighlightsAction extends EditorAction {
	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		const controller = CommonFindController.get(editor);
		if (!controller) {
			return null;
		}

		let matches: FindMatch[] = null;

		const findState = controller.getState();
		if (findState.isRevealed && findState.isRegex && findState.searchString.length > 0) {

			matches = editor.getModel().findMatches(findState.searchString, true, findState.isRegex, findState.matchCase, findState.wholeWord ? editor.getConfiguration().wordSeparators : null, false, Constants.MAX_SAFE_SMALL_INTEGER);

		} else {

			const r = multiCursorFind(editor, {
				changeFindSearchString: true,
				allowMultiline: true,
				highlightFindOptions: true
			});
			if (!r) {
				return;
			}

			matches = editor.getModel().findMatches(r.searchText, true, false, r.matchCase, r.wholeWord ? editor.getConfiguration().wordSeparators : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
		}

		if (matches.length > 0) {
			const editorSelection = editor.getSelection();
			for (let i = 0, len = matches.length; i < len; i++) {
				const match = matches[i];
				let intersection = match.range.intersectRanges(editorSelection);
				if (intersection) {
					// bingo!
					matches.splice(i, 1);
					matches.unshift(match);
					break;
				}
			}
			editor.setSelections(matches.map(m => new Selection(m.range.startLineNumber, m.range.startColumn, m.range.endLineNumber, m.range.endColumn)));
		}
	}
}

@editorAction
export class SelectHighlightsAction extends AbstractSelectHighlightsAction {
	constructor() {
		super({
			id: 'editor.action.selectHighlights',
			label: nls.localize('selectAllOccurrencesOfFindMatch', "Select All Occurrences of Find Match"),
			alias: 'Select All Occurrences of Find Match',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_L
			}
		});
	}
}

@editorAction
export class CompatChangeAll extends AbstractSelectHighlightsAction {
	constructor() {
		super({
			id: 'editor.action.changeAll',
			label: nls.localize('changeAll.label', "Change All Occurrences"),
			alias: 'Change All Occurrences',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyCode.F2
			},
			menuOpts: {
				group: '1_modification',
				order: 1.2
			}
		});
	}
}

class SelectionHighlighterState {
	public readonly lastWordUnderCursor: Selection;
	public readonly searchText: string;
	public readonly matchCase: boolean;
	public readonly wordSeparators: string;

	constructor(lastWordUnderCursor: Selection, searchText: string, matchCase: boolean, wordSeparators: string) {
		this.searchText = searchText;
		this.matchCase = matchCase;
		this.wordSeparators = wordSeparators;
	}

	/**
	 * Everything equals except for `lastWordUnderCursor`
	 */
	public static softEquals(a: SelectionHighlighterState, b: SelectionHighlighterState): boolean {
		if (!a && !b) {
			return true;
		}
		if (!a || !b) {
			return false;
		}
		return (
			a.searchText === b.searchText
			&& a.matchCase === b.matchCase
			&& a.wordSeparators === b.wordSeparators
		);
	}
}

@commonEditorContribution
export class SelectionHighlighter extends Disposable implements IEditorContribution {
	private static ID = 'editor.contrib.selectionHighlighter';

	private editor: ICommonCodeEditor;
	private _isEnabled: boolean;
	private decorations: string[];
	private updateSoon: RunOnceScheduler;
	private state: SelectionHighlighterState;

	constructor(editor: ICommonCodeEditor) {
		super();
		this.editor = editor;
		this._isEnabled = editor.getConfiguration().contribInfo.selectionHighlight;
		this.decorations = [];
		this.updateSoon = this._register(new RunOnceScheduler(() => this._update(), 300));
		this.state = null;

		this._register(editor.onDidChangeConfiguration((e) => {
			this._isEnabled = editor.getConfiguration().contribInfo.selectionHighlight;
		}));
		this._register(editor.onDidChangeCursorSelection((e: ICursorSelectionChangedEvent) => {

			if (!this._isEnabled) {
				// Early exit if nothing needs to be done!
				// Leave some form of early exit check here if you wish to continue being a cursor position change listener ;)
				return;
			}

			if (e.selection.isEmpty()) {
				if (e.reason === CursorChangeReason.Explicit) {
					if (this.state && (!this.state.lastWordUnderCursor || !this.state.lastWordUnderCursor.containsPosition(e.selection.getStartPosition()))) {
						// no longer valid
						this._setState(null);
					}
					this.updateSoon.schedule();
				} else {
					this._setState(null);

				}
			} else {
				this._update();
			}
		}));
		this._register(editor.onDidChangeModel((e) => {
			this._setState(null);
		}));
		this._register(CommonFindController.get(editor).getState().addChangeListener((e) => {
			this._update();
		}));
	}

	public getId(): string {
		return SelectionHighlighter.ID;
	}

	private _update(): void {
		this._setState(SelectionHighlighter._createState(this._isEnabled, this.editor));
	}

	private static _createState(isEnabled: boolean, editor: ICommonCodeEditor): SelectionHighlighterState {
		const model = editor.getModel();
		if (!model) {
			return null;
		}

		const config = editor.getConfiguration();

		let lastWordUnderCursor: Selection = null;
		if (!isEnabled) {
			return null;
		}

		const r = multiCursorFind(editor, {
			changeFindSearchString: false,
			allowMultiline: false,
			highlightFindOptions: false
		});
		if (!r) {
			return null;
		}

		const hasFindOccurrences = DocumentHighlightProviderRegistry.has(model);
		if (r.currentMatch) {
			// This is an empty selection
			if (hasFindOccurrences) {
				// Do not interfere with semantic word highlighting in the no selection case
				return null;
			}

			if (!config.contribInfo.occurrencesHighlight) {
				return null;
			}

			lastWordUnderCursor = r.currentMatch;
		}
		if (/^[ \t]+$/.test(r.searchText)) {
			// whitespace only selection
			return null;
		}
		if (r.searchText.length > 200) {
			// very long selection
			return null;
		}

		const controller = CommonFindController.get(editor);
		if (!controller) {
			return null;
		}
		const findState = controller.getState();
		const caseSensitive = findState.matchCase;

		const selections = editor.getSelections();
		let firstSelectedText = model.getValueInRange(selections[0]);
		if (!caseSensitive) {
			firstSelectedText = firstSelectedText.toLowerCase();
		}
		for (let i = 1; i < selections.length; i++) {
			let selectedText = model.getValueInRange(selections[i]);
			if (!caseSensitive) {
				selectedText = selectedText.toLowerCase();
			}
			if (firstSelectedText !== selectedText) {
				// not all selections have the same text
				return null;
			}
		}

		// Return early if the find widget shows the exact same matches
		if (findState.isRevealed) {
			let findStateSearchString = findState.searchString;
			if (!caseSensitive) {
				findStateSearchString = findStateSearchString.toLowerCase();
			}

			let mySearchString = r.searchText;
			if (!caseSensitive) {
				mySearchString = mySearchString.toLowerCase();
			}

			if (findStateSearchString === mySearchString && r.matchCase === findState.matchCase && r.wholeWord === findState.wholeWord && !findState.isRegex) {
				return null;
			}
		}

		return new SelectionHighlighterState(lastWordUnderCursor, r.searchText, r.matchCase, r.wholeWord ? editor.getConfiguration().wordSeparators : null);
	}


	private _setState(state: SelectionHighlighterState): void {
		if (SelectionHighlighterState.softEquals(this.state, state)) {
			this.state = state;
			return;
		}
		this.state = state;

		if (!this.state) {
			if (this.decorations.length > 0) {
				this.decorations = this.editor.deltaDecorations(this.decorations, []);
			}
			return;
		}

		const model = this.editor.getModel();
		const hasFindOccurrences = DocumentHighlightProviderRegistry.has(model);

		let allMatches = model.findMatches(this.state.searchText, true, false, this.state.matchCase, this.state.wordSeparators, false).map(m => m.range);
		allMatches.sort(Range.compareRangesUsingStarts);

		let selections = this.editor.getSelections();
		selections.sort(Range.compareRangesUsingStarts);

		// do not overlap with selection (issue #64 and #512)
		let matches: Range[] = [];
		for (let i = 0, j = 0, len = allMatches.length, lenJ = selections.length; i < len;) {
			const match = allMatches[i];

			if (j >= lenJ) {
				// finished all editor selections
				matches.push(match);
				i++;
			} else {
				const cmp = Range.compareRangesUsingStarts(match, selections[j]);
				if (cmp < 0) {
					// match is before sel
					matches.push(match);
					i++;
				} else if (cmp > 0) {
					// sel is before match
					j++;
				} else {
					// sel is equal to match
					i++;
					j++;
				}
			}
		}

		const decorations = matches.map(r => {
			return {
				range: r,
				// Show in overviewRuler only if model has no semantic highlighting
				options: (hasFindOccurrences ? SelectionHighlighter._SELECTION_HIGHLIGHT : SelectionHighlighter._SELECTION_HIGHLIGHT_OVERVIEW)
			};
		});

		this.decorations = this.editor.deltaDecorations(this.decorations, decorations);
	}

	private static _SELECTION_HIGHLIGHT_OVERVIEW = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'selectionHighlight',
		overviewRuler: {
			color: themeColorFromId(overviewRulerSelectionHighlightForeground),
			darkColor: themeColorFromId(overviewRulerSelectionHighlightForeground),
			position: OverviewRulerLane.Center
		}
	});

	private static _SELECTION_HIGHLIGHT = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'selectionHighlight',
	});

	public dispose(): void {
		this._setState(null);
		super.dispose();
	}
}
