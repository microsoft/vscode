/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { RunOnceScheduler } from 'vs/base/common/async';
import { ScrollType, IEditorContribution } from 'vs/editor/common/editorCommon';
import { FindMatch, TrackedRangeStickiness, OverviewRulerLane, ITextModel } from 'vs/editor/common/model';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { registerEditorAction, registerEditorContribution, ServicesAccessor, EditorAction } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { CursorChangeReason, ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { CursorMoveCommands } from 'vs/editor/common/controller/cursorMoveCommands';
import { RevealTarget } from 'vs/editor/common/controller/cursorCommon';
import { Constants } from 'vs/editor/common/core/uint';
import { DocumentHighlightProviderRegistry } from 'vs/editor/common/modes';
import { CommonFindController } from 'vs/editor/contrib/find/findController';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { overviewRulerSelectionHighlightForeground } from 'vs/platform/theme/common/colorRegistry';
import { themeColorFromId } from 'vs/platform/theme/common/themeService';
import { INewFindReplaceState, FindOptionOverride } from 'vs/editor/contrib/find/findState';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

export class InsertCursorAbove extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.insertCursorAbove',
			label: nls.localize('mutlicursor.insertAbove', "Add Cursor Above"),
			alias: 'Add Cursor Above',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow,
				linux: {
					primary: KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow]
				}
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		const cursors = editor._getCursors();
		const context = cursors.context;

		if (context.config.readOnly) {
			return;
		}

		context.model.pushStackElement();
		cursors.setStates(
			args.source,
			CursorChangeReason.Explicit,
			CursorMoveCommands.addCursorUp(context, cursors.getAll())
		);
		cursors.reveal(true, RevealTarget.TopMost, ScrollType.Smooth);
	}
}

export class InsertCursorBelow extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.insertCursorBelow',
			label: nls.localize('mutlicursor.insertBelow', "Add Cursor Below"),
			alias: 'Add Cursor Below',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow,
				linux: {
					primary: KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow]
				}
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): void {
		const cursors = editor._getCursors();
		const context = cursors.context;

		if (context.config.readOnly) {
			return;
		}

		context.model.pushStackElement();
		cursors.setStates(
			args.source,
			CursorChangeReason.Explicit,
			CursorMoveCommands.addCursorDown(context, cursors.getAll())
		);
		cursors.reveal(true, RevealTarget.BottomMost, ScrollType.Smooth);
	}
}

class InsertCursorAtEndOfEachLineSelected extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.insertCursorAtEndOfEachLineSelected',
			label: nls.localize('mutlicursor.insertAtEndOfEachLineSelected', "Add Cursors to Line Ends"),
			alias: 'Add Cursors to Line Ends',
			precondition: null,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_I
			}
		});
	}

	private getCursorsForSelection(selection: Selection, editor: ICodeEditor): Selection[] {
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

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		let selections = editor.getSelections();
		let newSelections = selections
			.map((selection) => this.getCursorsForSelection(selection, editor))
			.reduce((prev, curr) => { return prev.concat(curr); });

		if (newSelections.length > 0) {
			editor.setSelections(newSelections);
		}
	}
}

export class MultiCursorSessionResult {
	constructor(
		public readonly selections: Selection[],
		public readonly revealRange: Range,
		public readonly revealScrollType: ScrollType
	) { }
}

export class MultiCursorSession {

	public static create(editor: ICodeEditor, findController: CommonFindController): MultiCursorSession {
		const findState = findController.getState();

		// Find widget owns entirely what we search for if:
		//  - focus is not in the editor (i.e. it is in the find widget)
		//  - and the search widget is visible
		//  - and the search string is non-empty
		if (!editor.isFocused() && findState.isRevealed && findState.searchString.length > 0) {
			// Find widget owns what is searched for
			return new MultiCursorSession(editor, findController, false, findState.searchString, findState.wholeWord, findState.matchCase, null);
		}

		// Otherwise, the selection gives the search text, and the find widget gives the search settings
		// The exception is the find state disassociation case: when beginning with a single, collapsed selection
		let isDisconnectedFromFindController = false;
		let wholeWord: boolean;
		let matchCase: boolean;
		const selections = editor.getSelections();
		if (selections.length === 1 && selections[0].isEmpty()) {
			isDisconnectedFromFindController = true;
			wholeWord = true;
			matchCase = true;
		} else {
			wholeWord = findState.wholeWord;
			matchCase = findState.matchCase;
		}

		// Selection owns what is searched for
		const s = editor.getSelection();

		let searchText: string;
		let currentMatch: Selection = null;

		if (s.isEmpty()) {
			// selection is empty => expand to current word
			const word = editor.getModel().getWordAtPosition(s.getStartPosition());
			if (!word) {
				return null;
			}
			searchText = word.word;
			currentMatch = new Selection(s.startLineNumber, word.startColumn, s.startLineNumber, word.endColumn);
		} else {
			searchText = editor.getModel().getValueInRange(s).replace(/\r\n/g, '\n');
		}

		return new MultiCursorSession(editor, findController, isDisconnectedFromFindController, searchText, wholeWord, matchCase, currentMatch);
	}

	constructor(
		private readonly _editor: ICodeEditor,
		public readonly findController: CommonFindController,
		public readonly isDisconnectedFromFindController: boolean,
		public readonly searchText: string,
		public readonly wholeWord: boolean,
		public readonly matchCase: boolean,
		public currentMatch: Selection
	) { }

	public addSelectionToNextFindMatch(): MultiCursorSessionResult {
		const nextMatch = this._getNextMatch();
		if (!nextMatch) {
			return null;
		}

		const allSelections = this._editor.getSelections();
		return new MultiCursorSessionResult(allSelections.concat(nextMatch), nextMatch, ScrollType.Smooth);
	}

	public moveSelectionToNextFindMatch(): MultiCursorSessionResult {
		const nextMatch = this._getNextMatch();
		if (!nextMatch) {
			return null;
		}

		const allSelections = this._editor.getSelections();
		return new MultiCursorSessionResult(allSelections.slice(0, allSelections.length - 1).concat(nextMatch), nextMatch, ScrollType.Smooth);
	}

	private _getNextMatch(): Selection {
		if (this.currentMatch) {
			const result = this.currentMatch;
			this.currentMatch = null;
			return result;
		}

		this.findController.highlightFindOptions();

		const allSelections = this._editor.getSelections();
		const lastAddedSelection = allSelections[allSelections.length - 1];
		const nextMatch = this._editor.getModel().findNextMatch(this.searchText, lastAddedSelection.getEndPosition(), false, this.matchCase, this.wholeWord ? this._editor.getConfiguration().wordSeparators : null, false);

		if (!nextMatch) {
			return null;
		}
		return new Selection(nextMatch.range.startLineNumber, nextMatch.range.startColumn, nextMatch.range.endLineNumber, nextMatch.range.endColumn);
	}

	public addSelectionToPreviousFindMatch(): MultiCursorSessionResult {
		const previousMatch = this._getPreviousMatch();
		if (!previousMatch) {
			return null;
		}

		const allSelections = this._editor.getSelections();
		return new MultiCursorSessionResult(allSelections.concat(previousMatch), previousMatch, ScrollType.Smooth);
	}

	public moveSelectionToPreviousFindMatch(): MultiCursorSessionResult {
		const previousMatch = this._getPreviousMatch();
		if (!previousMatch) {
			return null;
		}

		const allSelections = this._editor.getSelections();
		return new MultiCursorSessionResult(allSelections.slice(0, allSelections.length - 1).concat(previousMatch), previousMatch, ScrollType.Smooth);
	}

	private _getPreviousMatch(): Selection {
		if (this.currentMatch) {
			const result = this.currentMatch;
			this.currentMatch = null;
			return result;
		}

		this.findController.highlightFindOptions();

		const allSelections = this._editor.getSelections();
		const lastAddedSelection = allSelections[allSelections.length - 1];
		const previousMatch = this._editor.getModel().findPreviousMatch(this.searchText, lastAddedSelection.getStartPosition(), false, this.matchCase, this.wholeWord ? this._editor.getConfiguration().wordSeparators : null, false);

		if (!previousMatch) {
			return null;
		}
		return new Selection(previousMatch.range.startLineNumber, previousMatch.range.startColumn, previousMatch.range.endLineNumber, previousMatch.range.endColumn);
	}

	public selectAll(): FindMatch[] {
		this.findController.highlightFindOptions();

		return this._editor.getModel().findMatches(this.searchText, true, false, this.matchCase, this.wholeWord ? this._editor.getConfiguration().wordSeparators : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
	}
}

export class MultiCursorSelectionController extends Disposable implements IEditorContribution {

	private static readonly ID = 'editor.contrib.multiCursorController';

	private readonly _editor: ICodeEditor;
	private _ignoreSelectionChange: boolean;
	private _session: MultiCursorSession;
	private _sessionDispose: IDisposable[];

	public static get(editor: ICodeEditor): MultiCursorSelectionController {
		return editor.getContribution<MultiCursorSelectionController>(MultiCursorSelectionController.ID);
	}

	constructor(editor: ICodeEditor) {
		super();
		this._editor = editor;
		this._ignoreSelectionChange = false;
		this._session = null;
		this._sessionDispose = [];
	}

	public dispose(): void {
		this._endSession();
		super.dispose();
	}

	public getId(): string {
		return MultiCursorSelectionController.ID;
	}

	private _beginSessionIfNeeded(findController: CommonFindController): void {
		if (!this._session) {
			// Create a new session
			const session = MultiCursorSession.create(this._editor, findController);
			if (!session) {
				return;
			}

			this._session = session;

			const newState: INewFindReplaceState = { searchString: this._session.searchText };
			if (this._session.isDisconnectedFromFindController) {
				newState.wholeWordOverride = FindOptionOverride.True;
				newState.matchCaseOverride = FindOptionOverride.True;
				newState.isRegexOverride = FindOptionOverride.False;
			}
			findController.getState().change(newState, false);

			this._sessionDispose = [
				this._editor.onDidChangeCursorSelection((e) => {
					if (this._ignoreSelectionChange) {
						return;
					}
					this._endSession();
				}),
				this._editor.onDidBlurEditorText(() => {
					this._endSession();
				}),
				findController.getState().onFindReplaceStateChange((e) => {
					if (e.matchCase || e.wholeWord) {
						this._endSession();
					}
				})
			];
		}
	}

	private _endSession(): void {
		this._sessionDispose = dispose(this._sessionDispose);
		if (this._session && this._session.isDisconnectedFromFindController) {
			const newState: INewFindReplaceState = {
				wholeWordOverride: FindOptionOverride.NotSet,
				matchCaseOverride: FindOptionOverride.NotSet,
				isRegexOverride: FindOptionOverride.NotSet,
			};
			this._session.findController.getState().change(newState, false);
		}
		this._session = null;
	}

	private _setSelections(selections: Selection[]): void {
		this._ignoreSelectionChange = true;
		this._editor.setSelections(selections);
		this._ignoreSelectionChange = false;
	}

	private _expandEmptyToWord(model: ITextModel, selection: Selection): Selection {
		if (!selection.isEmpty()) {
			return selection;
		}
		const word = model.getWordAtPosition(selection.getStartPosition());
		if (!word) {
			return selection;
		}
		return new Selection(selection.startLineNumber, word.startColumn, selection.startLineNumber, word.endColumn);
	}

	private _applySessionResult(result: MultiCursorSessionResult): void {
		if (!result) {
			return;
		}
		this._setSelections(result.selections);
		if (result.revealRange) {
			this._editor.revealRangeInCenterIfOutsideViewport(result.revealRange, result.revealScrollType);
		}
	}

	public getSession(findController: CommonFindController): MultiCursorSession {
		return this._session;
	}

	public addSelectionToNextFindMatch(findController: CommonFindController): void {
		if (!this._session) {
			// If there are multiple cursors, handle the case where they do not all select the same text.
			const allSelections = this._editor.getSelections();
			if (allSelections.length > 1) {
				const findState = findController.getState();
				const matchCase = findState.matchCase;
				const selectionsContainSameText = modelRangesContainSameText(this._editor.getModel(), allSelections, matchCase);
				if (!selectionsContainSameText) {
					const model = this._editor.getModel();
					let resultingSelections: Selection[] = [];
					for (let i = 0, len = allSelections.length; i < len; i++) {
						resultingSelections[i] = this._expandEmptyToWord(model, allSelections[i]);
					}
					this._editor.setSelections(resultingSelections);
					return;
				}
			}
		}
		this._beginSessionIfNeeded(findController);
		if (this._session) {
			this._applySessionResult(this._session.addSelectionToNextFindMatch());
		}
	}

	public addSelectionToPreviousFindMatch(findController: CommonFindController): void {
		this._beginSessionIfNeeded(findController);
		if (this._session) {
			this._applySessionResult(this._session.addSelectionToPreviousFindMatch());
		}
	}

	public moveSelectionToNextFindMatch(findController: CommonFindController): void {
		this._beginSessionIfNeeded(findController);
		if (this._session) {
			this._applySessionResult(this._session.moveSelectionToNextFindMatch());
		}
	}

	public moveSelectionToPreviousFindMatch(findController: CommonFindController): void {
		this._beginSessionIfNeeded(findController);
		if (this._session) {
			this._applySessionResult(this._session.moveSelectionToPreviousFindMatch());
		}
	}

	public selectAll(findController: CommonFindController): void {
		let matches: FindMatch[] = null;

		const findState = findController.getState();

		// Special case: find widget owns entirely what we search for if:
		// - focus is not in the editor (i.e. it is in the find widget)
		// - and the search widget is visible
		// - and the search string is non-empty
		// - and we're searching for a regex
		if (findState.isRevealed && findState.searchString.length > 0 && findState.isRegex) {

			matches = this._editor.getModel().findMatches(findState.searchString, true, findState.isRegex, findState.matchCase, findState.wholeWord ? this._editor.getConfiguration().wordSeparators : null, false, Constants.MAX_SAFE_SMALL_INTEGER);

		} else {

			this._beginSessionIfNeeded(findController);
			if (!this._session) {
				return;
			}

			matches = this._session.selectAll();
		}

		if (matches.length > 0) {
			const editorSelection = this._editor.getSelection();
			// Have the primary cursor remain the one where the action was invoked
			for (let i = 0, len = matches.length; i < len; i++) {
				const match = matches[i];
				const intersection = match.range.intersectRanges(editorSelection);
				if (intersection) {
					// bingo!
					matches[i] = matches[0];
					matches[0] = match;
					break;
				}
			}

			this._setSelections(matches.map(m => new Selection(m.range.startLineNumber, m.range.startColumn, m.range.endLineNumber, m.range.endColumn)));
		}
	}
}

export abstract class MultiCursorSelectionControllerAction extends EditorAction {

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const multiCursorController = MultiCursorSelectionController.get(editor);
		if (!multiCursorController) {
			return;
		}
		const findController = CommonFindController.get(editor);
		if (!findController) {
			return null;
		}
		this._run(multiCursorController, findController);
	}

	protected abstract _run(multiCursorController: MultiCursorSelectionController, findController: CommonFindController): void;
}

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
	protected _run(multiCursorController: MultiCursorSelectionController, findController: CommonFindController): void {
		multiCursorController.addSelectionToNextFindMatch(findController);
	}
}

export class AddSelectionToPreviousFindMatchAction extends MultiCursorSelectionControllerAction {
	constructor() {
		super({
			id: 'editor.action.addSelectionToPreviousFindMatch',
			label: nls.localize('addSelectionToPreviousFindMatch', "Add Selection To Previous Find Match"),
			alias: 'Add Selection To Previous Find Match',
			precondition: null
		});
	}
	protected _run(multiCursorController: MultiCursorSelectionController, findController: CommonFindController): void {
		multiCursorController.addSelectionToPreviousFindMatch(findController);
	}
}

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
	protected _run(multiCursorController: MultiCursorSelectionController, findController: CommonFindController): void {
		multiCursorController.moveSelectionToNextFindMatch(findController);
	}
}

export class MoveSelectionToPreviousFindMatchAction extends MultiCursorSelectionControllerAction {
	constructor() {
		super({
			id: 'editor.action.moveSelectionToPreviousFindMatch',
			label: nls.localize('moveSelectionToPreviousFindMatch', "Move Last Selection To Previous Find Match"),
			alias: 'Move Last Selection To Previous Find Match',
			precondition: null
		});
	}
	protected _run(multiCursorController: MultiCursorSelectionController, findController: CommonFindController): void {
		multiCursorController.moveSelectionToPreviousFindMatch(findController);
	}
}

export class SelectHighlightsAction extends MultiCursorSelectionControllerAction {
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
	protected _run(multiCursorController: MultiCursorSelectionController, findController: CommonFindController): void {
		multiCursorController.selectAll(findController);
	}
}

export class CompatChangeAll extends MultiCursorSelectionControllerAction {
	constructor() {
		super({
			id: 'editor.action.changeAll',
			label: nls.localize('changeAll.label', "Change All Occurrences"),
			alias: 'Change All Occurrences',
			precondition: EditorContextKeys.writable,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.F2
			},
			menuOpts: {
				group: '1_modification',
				order: 1.2
			}
		});
	}
	protected _run(multiCursorController: MultiCursorSelectionController, findController: CommonFindController): void {
		multiCursorController.selectAll(findController);
	}
}

class SelectionHighlighterState {
	public readonly lastWordUnderCursor: Selection;
	public readonly searchText: string;
	public readonly matchCase: boolean;
	public readonly wordSeparators: string;

	constructor(lastWordUnderCursor: Selection, searchText: string, matchCase: boolean, wordSeparators: string) {
		this.lastWordUnderCursor = lastWordUnderCursor;
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

export class SelectionHighlighter extends Disposable implements IEditorContribution {
	private static readonly ID = 'editor.contrib.selectionHighlighter';

	private editor: ICodeEditor;
	private _isEnabled: boolean;
	private decorations: string[];
	private updateSoon: RunOnceScheduler;
	private state: SelectionHighlighterState;

	constructor(editor: ICodeEditor) {
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
		this._register(CommonFindController.get(editor).getState().onFindReplaceStateChange((e) => {
			this._update();
		}));
	}

	public getId(): string {
		return SelectionHighlighter.ID;
	}

	private _update(): void {
		this._setState(SelectionHighlighter._createState(this._isEnabled, this.editor));
	}

	private static _createState(isEnabled: boolean, editor: ICodeEditor): SelectionHighlighterState {
		if (!isEnabled) {
			return null;
		}
		const model = editor.getModel();
		if (!model) {
			return null;
		}
		const s = editor.getSelection();
		if (s.startLineNumber !== s.endLineNumber) {
			// multiline forbidden for perf reasons
			return null;
		}
		const multiCursorController = MultiCursorSelectionController.get(editor);
		if (!multiCursorController) {
			return null;
		}
		const findController = CommonFindController.get(editor);
		if (!findController) {
			return null;
		}
		let r = multiCursorController.getSession(findController);
		if (!r) {
			const allSelections = editor.getSelections();
			if (allSelections.length > 1) {
				const findState = findController.getState();
				const matchCase = findState.matchCase;
				const selectionsContainSameText = modelRangesContainSameText(editor.getModel(), allSelections, matchCase);
				if (!selectionsContainSameText) {
					return null;
				}
			}

			r = MultiCursorSession.create(editor, findController);
		}
		if (!r) {
			return null;
		}

		let lastWordUnderCursor: Selection = null;
		const hasFindOccurrences = DocumentHighlightProviderRegistry.has(model);
		if (r.currentMatch) {
			// This is an empty selection
			if (hasFindOccurrences) {
				// Do not interfere with semantic word highlighting in the no selection case
				return null;
			}

			const config = editor.getConfiguration();
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

		// TODO: better handling of this case
		const findState = findController.getState();
		const caseSensitive = findState.matchCase;

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
		if (model.isTooLargeForTokenization()) {
			// the file is too large, so searching word under cursor in the whole document takes is blocking the UI.
			return;
		}

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

	private static readonly _SELECTION_HIGHLIGHT_OVERVIEW = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'selectionHighlight',
		overviewRuler: {
			color: themeColorFromId(overviewRulerSelectionHighlightForeground),
			darkColor: themeColorFromId(overviewRulerSelectionHighlightForeground),
			position: OverviewRulerLane.Center
		}
	});

	private static readonly _SELECTION_HIGHLIGHT = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'selectionHighlight',
	});

	public dispose(): void {
		this._setState(null);
		super.dispose();
	}
}

function modelRangesContainSameText(model: ITextModel, ranges: Range[], matchCase: boolean): boolean {
	const selectedText = getValueInRange(model, ranges[0], !matchCase);
	for (let i = 1, len = ranges.length; i < len; i++) {
		const range = ranges[i];
		if (range.isEmpty()) {
			return false;
		}
		const thisSelectedText = getValueInRange(model, range, !matchCase);
		if (selectedText !== thisSelectedText) {
			return false;
		}
	}
	return true;
}

function getValueInRange(model: ITextModel, range: Range, toLowerCase: boolean): string {
	const text = model.getValueInRange(range);
	return (toLowerCase ? text.toLowerCase() : text);
}

registerEditorContribution(MultiCursorSelectionController);
registerEditorContribution(SelectionHighlighter);

registerEditorAction(InsertCursorAbove);
registerEditorAction(InsertCursorBelow);
registerEditorAction(InsertCursorAtEndOfEachLineSelected);
registerEditorAction(AddSelectionToNextFindMatchAction);
registerEditorAction(AddSelectionToPreviousFindMatchAction);
registerEditorAction(MoveSelectionToNextFindMatchAction);
registerEditorAction(MoveSelectionToPreviousFindMatchAction);
registerEditorAction(SelectHighlightsAction);
registerEditorAction(CompatChangeAll);
