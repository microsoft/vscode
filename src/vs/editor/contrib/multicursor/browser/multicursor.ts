/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Constants } from '../../../../base/common/uint.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, ServicesAccessor } from '../../../browser/editorExtensions.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { CursorState } from '../../../common/cursorCommon.js';
import { CursorChangeReason, ICursorSelectionChangedEvent } from '../../../common/cursorEvents.js';
import { CursorMoveCommands } from '../../../common/cursor/cursorMoveCommands.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { IEditorContribution, IEditorDecorationsCollection, ScrollType } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { FindMatch, ITextModel } from '../../../common/model.js';
import { CommonFindController } from '../../find/browser/findController.js';
import { FindOptionOverride, INewFindReplaceState } from '../../find/browser/findState.js';
import * as nls from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { getSelectionHighlightDecorationOptions } from '../../wordHighlighter/browser/highlightDecorations.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

function announceCursorChange(previousCursorState: CursorState[], cursorState: CursorState[]): void {
	const cursorDiff = cursorState.filter(cs => !previousCursorState.find(pcs => pcs.equals(cs)));
	if (cursorDiff.length >= 1) {
		const cursorPositions = cursorDiff.map(cs => `line ${cs.viewState.position.lineNumber} column ${cs.viewState.position.column}`).join(', ');
		const msg = cursorDiff.length === 1 ? nls.localize('cursorAdded', "Cursor added: {0}", cursorPositions) : nls.localize('cursorsAdded', "Cursors added: {0}", cursorPositions);
		status(msg);
	}
}

interface InsertCursorArgs {
	source?: string;
	logicalLine?: boolean;
}

export class InsertCursorAbove extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.insertCursorAbove',
			label: nls.localize2('mutlicursor.insertAbove', "Add Cursor Above"),
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.UpArrow,
				linux: {
					primary: KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow]
				},
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '3_multi',
				title: nls.localize({ key: 'miInsertCursorAbove', comment: ['&& denotes a mnemonic'] }, "&&Add Cursor Above"),
				order: 2
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: InsertCursorArgs): void {
		if (!editor.hasModel()) {
			return;
		}

		let useLogicalLine = true;
		if (args && args.logicalLine === false) {
			useLogicalLine = false;
		}
		const viewModel = editor._getViewModel();

		if (viewModel.cursorConfig.readOnly) {
			return;
		}

		viewModel.model.pushStackElement();
		const previousCursorState = viewModel.getCursorStates();
		viewModel.setCursorStates(
			args.source,
			CursorChangeReason.Explicit,
			CursorMoveCommands.addCursorUp(viewModel, previousCursorState, useLogicalLine)
		);
		viewModel.revealTopMostCursor(args.source);
		announceCursorChange(previousCursorState, viewModel.getCursorStates());
	}
}

export class InsertCursorBelow extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.insertCursorBelow',
			label: nls.localize2('mutlicursor.insertBelow', "Add Cursor Below"),
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.DownArrow,
				linux: {
					primary: KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
					secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow]
				},
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '3_multi',
				title: nls.localize({ key: 'miInsertCursorBelow', comment: ['&& denotes a mnemonic'] }, "A&&dd Cursor Below"),
				order: 3
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: InsertCursorArgs): void {
		if (!editor.hasModel()) {
			return;
		}

		let useLogicalLine = true;
		if (args && args.logicalLine === false) {
			useLogicalLine = false;
		}
		const viewModel = editor._getViewModel();

		if (viewModel.cursorConfig.readOnly) {
			return;
		}

		viewModel.model.pushStackElement();
		const previousCursorState = viewModel.getCursorStates();
		viewModel.setCursorStates(
			args.source,
			CursorChangeReason.Explicit,
			CursorMoveCommands.addCursorDown(viewModel, previousCursorState, useLogicalLine)
		);
		viewModel.revealBottomMostCursor(args.source);
		announceCursorChange(previousCursorState, viewModel.getCursorStates());
	}
}

class InsertCursorAtEndOfEachLineSelected extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.insertCursorAtEndOfEachLineSelected',
			label: nls.localize2('mutlicursor.insertAtEndOfEachLineSelected', "Add Cursors to Line Ends"),
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyI,
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '3_multi',
				title: nls.localize({ key: 'miInsertCursorAtEndOfEachLineSelected', comment: ['&& denotes a mnemonic'] }, "Add C&&ursors to Line Ends"),
				order: 4
			}
		});
	}

	private getCursorsForSelection(selection: Selection, model: ITextModel, result: Selection[]): void {
		if (selection.isEmpty()) {
			return;
		}

		for (let i = selection.startLineNumber; i < selection.endLineNumber; i++) {
			const currentLineMaxColumn = model.getLineMaxColumn(i);
			result.push(new Selection(i, currentLineMaxColumn, i, currentLineMaxColumn));
		}
		if (selection.endColumn > 1) {
			result.push(new Selection(selection.endLineNumber, selection.endColumn, selection.endLineNumber, selection.endColumn));
		}
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.hasModel()) {
			return;
		}

		const model = editor.getModel();
		const selections = editor.getSelections();
		const viewModel = editor._getViewModel();
		const previousCursorState = viewModel.getCursorStates();
		const newSelections: Selection[] = [];
		selections.forEach((sel) => this.getCursorsForSelection(sel, model, newSelections));

		if (newSelections.length > 0) {
			editor.setSelections(newSelections);
		}
		announceCursorChange(previousCursorState, viewModel.getCursorStates());
	}
}

class InsertCursorAtEndOfLineSelected extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.addCursorsToBottom',
			label: nls.localize2('mutlicursor.addCursorsToBottom', "Add Cursors to Bottom"),
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.hasModel()) {
			return;
		}

		const selections = editor.getSelections();
		const lineCount = editor.getModel().getLineCount();

		const newSelections: Selection[] = [];
		for (let i = selections[0].startLineNumber; i <= lineCount; i++) {
			newSelections.push(new Selection(i, selections[0].startColumn, i, selections[0].endColumn));
		}

		const viewModel = editor._getViewModel();
		const previousCursorState = viewModel.getCursorStates();
		if (newSelections.length > 0) {
			editor.setSelections(newSelections);
		}
		announceCursorChange(previousCursorState, viewModel.getCursorStates());
	}
}

class InsertCursorAtTopOfLineSelected extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.addCursorsToTop',
			label: nls.localize2('mutlicursor.addCursorsToTop', "Add Cursors to Top"),
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		if (!editor.hasModel()) {
			return;
		}

		const selections = editor.getSelections();

		const newSelections: Selection[] = [];
		for (let i = selections[0].startLineNumber; i >= 1; i--) {
			newSelections.push(new Selection(i, selections[0].startColumn, i, selections[0].endColumn));
		}

		const viewModel = editor._getViewModel();
		const previousCursorState = viewModel.getCursorStates();
		if (newSelections.length > 0) {
			editor.setSelections(newSelections);
		}
		announceCursorChange(previousCursorState, viewModel.getCursorStates());
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

	public static create(editor: ICodeEditor, findController: CommonFindController): MultiCursorSession | null {
		if (!editor.hasModel()) {
			return null;
		}
		const findState = findController.getState();

		// Find widget owns entirely what we search for if:
		//  - focus is not in the editor (i.e. it is in the find widget)
		//  - and the search widget is visible
		//  - and the search string is non-empty
		if (!editor.hasTextFocus() && findState.isRevealed && findState.searchString.length > 0) {
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
		let currentMatch: Selection | null = null;

		if (s.isEmpty()) {
			// selection is empty => expand to current word
			const word = editor.getConfiguredWordAtPosition(s.getStartPosition());
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
		public currentMatch: Selection | null
	) { }

	public addSelectionToNextFindMatch(): MultiCursorSessionResult | null {
		if (!this._editor.hasModel()) {
			return null;
		}

		const nextMatch = this._getNextMatch();
		if (!nextMatch) {
			return null;
		}

		const allSelections = this._editor.getSelections();
		return new MultiCursorSessionResult(allSelections.concat(nextMatch), nextMatch, ScrollType.Smooth);
	}

	public moveSelectionToNextFindMatch(): MultiCursorSessionResult | null {
		if (!this._editor.hasModel()) {
			return null;
		}

		const nextMatch = this._getNextMatch();
		if (!nextMatch) {
			return null;
		}

		const allSelections = this._editor.getSelections();
		return new MultiCursorSessionResult(allSelections.slice(0, allSelections.length - 1).concat(nextMatch), nextMatch, ScrollType.Smooth);
	}

	private _getNextMatch(): Selection | null {
		if (!this._editor.hasModel()) {
			return null;
		}

		if (this.currentMatch) {
			const result = this.currentMatch;
			this.currentMatch = null;
			return result;
		}

		this.findController.highlightFindOptions();

		const allSelections = this._editor.getSelections();
		const lastAddedSelection = allSelections[allSelections.length - 1];
		const nextMatch = this._editor.getModel().findNextMatch(this.searchText, lastAddedSelection.getEndPosition(), false, this.matchCase, this.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false);

		if (!nextMatch) {
			return null;
		}
		return new Selection(nextMatch.range.startLineNumber, nextMatch.range.startColumn, nextMatch.range.endLineNumber, nextMatch.range.endColumn);
	}

	public addSelectionToPreviousFindMatch(): MultiCursorSessionResult | null {
		if (!this._editor.hasModel()) {
			return null;
		}

		const previousMatch = this._getPreviousMatch();
		if (!previousMatch) {
			return null;
		}

		const allSelections = this._editor.getSelections();
		return new MultiCursorSessionResult(allSelections.concat(previousMatch), previousMatch, ScrollType.Smooth);
	}

	public moveSelectionToPreviousFindMatch(): MultiCursorSessionResult | null {
		if (!this._editor.hasModel()) {
			return null;
		}

		const previousMatch = this._getPreviousMatch();
		if (!previousMatch) {
			return null;
		}

		const allSelections = this._editor.getSelections();
		return new MultiCursorSessionResult(allSelections.slice(0, allSelections.length - 1).concat(previousMatch), previousMatch, ScrollType.Smooth);
	}

	private _getPreviousMatch(): Selection | null {
		if (!this._editor.hasModel()) {
			return null;
		}

		if (this.currentMatch) {
			const result = this.currentMatch;
			this.currentMatch = null;
			return result;
		}

		this.findController.highlightFindOptions();

		const allSelections = this._editor.getSelections();
		const lastAddedSelection = allSelections[allSelections.length - 1];
		const previousMatch = this._editor.getModel().findPreviousMatch(this.searchText, lastAddedSelection.getStartPosition(), false, this.matchCase, this.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false);

		if (!previousMatch) {
			return null;
		}
		return new Selection(previousMatch.range.startLineNumber, previousMatch.range.startColumn, previousMatch.range.endLineNumber, previousMatch.range.endColumn);
	}

	public selectAll(searchScope: Range[] | null): FindMatch[] {
		if (!this._editor.hasModel()) {
			return [];
		}

		this.findController.highlightFindOptions();

		const editorModel = this._editor.getModel();
		if (searchScope) {
			return editorModel.findMatches(this.searchText, searchScope, false, this.matchCase, this.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
		}
		return editorModel.findMatches(this.searchText, true, false, this.matchCase, this.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
	}
}

export class MultiCursorSelectionController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.multiCursorController';

	private readonly _editor: ICodeEditor;
	private _ignoreSelectionChange: boolean;
	private _session: MultiCursorSession | null;
	private readonly _sessionDispose = this._register(new DisposableStore());

	public static get(editor: ICodeEditor): MultiCursorSelectionController | null {
		return editor.getContribution<MultiCursorSelectionController>(MultiCursorSelectionController.ID);
	}

	constructor(editor: ICodeEditor) {
		super();
		this._editor = editor;
		this._ignoreSelectionChange = false;
		this._session = null;
	}

	public override dispose(): void {
		this._endSession();
		super.dispose();
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

			this._sessionDispose.add(this._editor.onDidChangeCursorSelection((e) => {
				if (this._ignoreSelectionChange) {
					return;
				}
				this._endSession();
			}));
			this._sessionDispose.add(this._editor.onDidBlurEditorText(() => {
				this._endSession();
			}));
			this._sessionDispose.add(findController.getState().onFindReplaceStateChange((e) => {
				if (e.matchCase || e.wholeWord) {
					this._endSession();
				}
			}));
		}
	}

	private _endSession(): void {
		this._sessionDispose.clear();
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
		const word = this._editor.getConfiguredWordAtPosition(selection.getStartPosition());
		if (!word) {
			return selection;
		}
		return new Selection(selection.startLineNumber, word.startColumn, selection.startLineNumber, word.endColumn);
	}

	private _applySessionResult(result: MultiCursorSessionResult | null): void {
		if (!result) {
			return;
		}
		this._setSelections(result.selections);
		if (result.revealRange) {
			this._editor.revealRangeInCenterIfOutsideViewport(result.revealRange, result.revealScrollType);
		}
	}

	public getSession(findController: CommonFindController): MultiCursorSession | null {
		return this._session;
	}

	public addSelectionToNextFindMatch(findController: CommonFindController): void {
		if (!this._editor.hasModel()) {
			return;
		}
		if (!this._session) {
			// If there are multiple cursors, handle the case where they do not all select the same text.
			const allSelections = this._editor.getSelections();
			if (allSelections.length > 1) {
				const findState = findController.getState();
				const matchCase = findState.matchCase;
				const selectionsContainSameText = modelRangesContainSameText(this._editor.getModel(), allSelections, matchCase);
				if (!selectionsContainSameText) {
					const model = this._editor.getModel();
					const resultingSelections: Selection[] = [];
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
		if (!this._editor.hasModel()) {
			return;
		}

		let matches: FindMatch[] | null = null;

		const findState = findController.getState();

		// Special case: find widget owns entirely what we search for if:
		// - focus is not in the editor (i.e. it is in the find widget)
		// - and the search widget is visible
		// - and the search string is non-empty
		// - and we're searching for a regex
		if (findState.isRevealed && findState.searchString.length > 0 && findState.isRegex) {
			const editorModel = this._editor.getModel();
			if (findState.searchScope) {
				matches = editorModel.findMatches(findState.searchString, findState.searchScope, findState.isRegex, findState.matchCase, findState.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
			} else {
				matches = editorModel.findMatches(findState.searchString, true, findState.isRegex, findState.matchCase, findState.wholeWord ? this._editor.getOption(EditorOption.wordSeparators) : null, false, Constants.MAX_SAFE_SMALL_INTEGER);
			}
		} else {

			this._beginSessionIfNeeded(findController);
			if (!this._session) {
				return;
			}

			matches = this._session.selectAll(findState.searchScope);
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

	public selectAllUsingSelections(selections: Selection[]): void {
		if (selections.length > 0) {
			this._setSelections(selections);
		}
	}
}

export abstract class MultiCursorSelectionControllerAction extends EditorAction {

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const multiCursorController = MultiCursorSelectionController.get(editor);
		if (!multiCursorController) {
			return;
		}
		const viewModel = editor._getViewModel();
		if (viewModel) {
			const previousCursorState = viewModel.getCursorStates();
			const findController = CommonFindController.get(editor);
			if (findController) {
				this._run(multiCursorController, findController);
			} else {
				const newFindController = accessor.get(IInstantiationService).createInstance(CommonFindController, editor);
				this._run(multiCursorController, newFindController);
				newFindController.dispose();
			}

			announceCursorChange(previousCursorState, viewModel.getCursorStates());
		}
	}

	protected abstract _run(multiCursorController: MultiCursorSelectionController, findController: CommonFindController): void;
}

export class AddSelectionToNextFindMatchAction extends MultiCursorSelectionControllerAction {
	constructor() {
		super({
			id: 'editor.action.addSelectionToNextFindMatch',
			label: nls.localize2('addSelectionToNextFindMatch', "Add Selection to Next Find Match"),
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.CtrlCmd | KeyCode.KeyD,
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '3_multi',
				title: nls.localize({ key: 'miAddSelectionToNextFindMatch', comment: ['&& denotes a mnemonic'] }, "Add &&Next Occurrence"),
				order: 5
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
			label: nls.localize2('addSelectionToPreviousFindMatch', "Add Selection to Previous Find Match"),
			precondition: undefined,
			menuOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '3_multi',
				title: nls.localize({ key: 'miAddSelectionToPreviousFindMatch', comment: ['&& denotes a mnemonic'] }, "Add P&&revious Occurrence"),
				order: 6
			}
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
			label: nls.localize2('moveSelectionToNextFindMatch', "Move Last Selection to Next Find Match"),
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyD),
				weight: KeybindingWeight.EditorContrib
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
			label: nls.localize2('moveSelectionToPreviousFindMatch', "Move Last Selection to Previous Find Match"),
			precondition: undefined
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
			label: nls.localize2('selectAllOccurrencesOfFindMatch', "Select All Occurrences of Find Match"),
			precondition: undefined,
			kbOpts: {
				kbExpr: EditorContextKeys.focus,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
				weight: KeybindingWeight.EditorContrib
			},
			menuOpts: {
				menuId: MenuId.MenubarSelectionMenu,
				group: '3_multi',
				title: nls.localize({ key: 'miSelectHighlights', comment: ['&& denotes a mnemonic'] }, "Select All &&Occurrences"),
				order: 7
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
			label: nls.localize2('changeAll.label', "Change All Occurrences"),
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.editorTextFocus),
			kbOpts: {
				kbExpr: EditorContextKeys.editorTextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.F2,
				weight: KeybindingWeight.EditorContrib
			},
			contextMenuOpts: {
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
	private readonly _modelVersionId: number;
	private _cachedFindMatches: Range[] | null = null;

	constructor(
		private readonly _model: ITextModel,
		private readonly _searchText: string,
		private readonly _matchCase: boolean,
		private readonly _wordSeparators: string | null,
		prevState: SelectionHighlighterState | null
	) {
		this._modelVersionId = this._model.getVersionId();
		if (prevState
			&& this._model === prevState._model
			&& this._searchText === prevState._searchText
			&& this._matchCase === prevState._matchCase
			&& this._wordSeparators === prevState._wordSeparators
			&& this._modelVersionId === prevState._modelVersionId
		) {
			this._cachedFindMatches = prevState._cachedFindMatches;
		}
	}

	public findMatches(): Range[] {
		if (this._cachedFindMatches === null) {
			this._cachedFindMatches = this._model.findMatches(this._searchText, true, false, this._matchCase, this._wordSeparators, false).map(m => m.range);
			this._cachedFindMatches.sort(Range.compareRangesUsingStarts);
		}
		return this._cachedFindMatches;
	}
}

export class SelectionHighlighter extends Disposable implements IEditorContribution {
	public static readonly ID = 'editor.contrib.selectionHighlighter';

	private readonly editor: ICodeEditor;
	private _isEnabled: boolean;
	private _isEnabledMultiline: boolean;
	private _maxLength: number;
	private readonly _decorations: IEditorDecorationsCollection;
	private readonly updateSoon: RunOnceScheduler;
	private state: SelectionHighlighterState | null;

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService
	) {
		super();
		this.editor = editor;
		this._isEnabled = editor.getOption(EditorOption.selectionHighlight);
		this._isEnabledMultiline = editor.getOption(EditorOption.selectionHighlightMultiline);
		this._maxLength = editor.getOption(EditorOption.selectionHighlightMaxLength);
		this._decorations = editor.createDecorationsCollection();
		this.updateSoon = this._register(new RunOnceScheduler(() => this._update(), 300));
		this.state = null;

		this._register(editor.onDidChangeConfiguration((e) => {
			this._isEnabled = editor.getOption(EditorOption.selectionHighlight);
			this._isEnabledMultiline = editor.getOption(EditorOption.selectionHighlightMultiline);
			this._maxLength = editor.getOption(EditorOption.selectionHighlightMaxLength);
		}));
		this._register(editor.onDidChangeCursorSelection((e: ICursorSelectionChangedEvent) => {

			if (!this._isEnabled) {
				// Early exit if nothing needs to be done!
				// Leave some form of early exit check here if you wish to continue being a cursor position change listener ;)
				return;
			}

			if (e.selection.isEmpty()) {
				if (e.reason === CursorChangeReason.Explicit) {
					if (this.state) {
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
		this._register(editor.onDidChangeModelContent((e) => {
			if (this._isEnabled) {
				this.updateSoon.schedule();
			}
		}));
		const findController = CommonFindController.get(editor);
		if (findController) {
			this._register(findController.getState().onFindReplaceStateChange((e) => {
				this._update();
			}));
		}
		this.updateSoon.schedule();
	}

	private _update(): void {
		this._setState(SelectionHighlighter._createState(this.state, this._isEnabled, this._isEnabledMultiline, this._maxLength, this.editor));
	}

	private static _createState(oldState: SelectionHighlighterState | null, isEnabled: boolean, isEnabledMultiline: boolean, maxLength: number, editor: ICodeEditor): SelectionHighlighterState | null {
		if (!isEnabled) {
			return null;
		}
		if (!editor.hasModel()) {
			return null;
		}
		if (!isEnabledMultiline) {
			const s = editor.getSelection();
			if (s.startLineNumber !== s.endLineNumber) {
				// multiline forbidden for perf reasons
				return null;
			}
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

		if (r.currentMatch) {
			// This is an empty selection
			// Do not interfere with semantic word highlighting in the no selection case
			return null;
		}
		if (/^[ \t]+$/.test(r.searchText)) {
			// whitespace only selection
			return null;
		}
		if (maxLength > 0 && r.searchText.length > maxLength) {
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

		return new SelectionHighlighterState(editor.getModel(), r.searchText, r.matchCase, r.wholeWord ? editor.getOption(EditorOption.wordSeparators) : null, oldState);
	}

	private _setState(newState: SelectionHighlighterState | null): void {
		this.state = newState;

		if (!this.state) {
			this._decorations.clear();
			return;
		}

		if (!this.editor.hasModel()) {
			return;
		}

		const model = this.editor.getModel();
		if (model.isTooLargeForTokenization()) {
			// the file is too large, so searching word under cursor in the whole document would be blocking the UI.
			return;
		}

		const allMatches = this.state.findMatches();

		const selections = this.editor.getSelections();
		selections.sort(Range.compareRangesUsingStarts);

		// do not overlap with selection (issue #64 and #512)
		const matches: Range[] = [];
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
					if (selections[j].isEmpty() || !Range.areIntersecting(match, selections[j])) {
						matches.push(match);
					}
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

		const occurrenceHighlighting: boolean = this.editor.getOption(EditorOption.occurrencesHighlight) !== 'off';
		const hasSemanticHighlights = this._languageFeaturesService.documentHighlightProvider.has(model) && occurrenceHighlighting;
		const decorations = matches.map(r => {
			return {
				range: r,
				options: getSelectionHighlightDecorationOptions(hasSemanticHighlights)
			};
		});

		this._decorations.set(decorations);
	}

	public override dispose(): void {
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

interface FocusCursorArgs {
	source?: string;
}

export class FocusNextCursor extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.focusNextCursor',
			label: nls.localize2('mutlicursor.focusNextCursor', "Focus Next Cursor"),
			metadata: {
				description: nls.localize('mutlicursor.focusNextCursor.description', "Focuses the next cursor"),
				args: [],
			},
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: FocusCursorArgs): void {
		if (!editor.hasModel()) {
			return;
		}

		const viewModel = editor._getViewModel();

		if (viewModel.cursorConfig.readOnly) {
			return;
		}

		viewModel.model.pushStackElement();
		const previousCursorState = Array.from(viewModel.getCursorStates());
		const firstCursor = previousCursorState.shift();
		if (!firstCursor) {
			return;
		}
		previousCursorState.push(firstCursor);

		viewModel.setCursorStates(args.source, CursorChangeReason.Explicit, previousCursorState);
		viewModel.revealPrimaryCursor(args.source, true);
		announceCursorChange(previousCursorState, viewModel.getCursorStates());
	}
}

export class FocusPreviousCursor extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.focusPreviousCursor',
			label: nls.localize2('mutlicursor.focusPreviousCursor', "Focus Previous Cursor"),
			metadata: {
				description: nls.localize('mutlicursor.focusPreviousCursor.description', "Focuses the previous cursor"),
				args: [],
			},
			precondition: undefined
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor, args: FocusCursorArgs): void {
		if (!editor.hasModel()) {
			return;
		}

		const viewModel = editor._getViewModel();

		if (viewModel.cursorConfig.readOnly) {
			return;
		}

		viewModel.model.pushStackElement();
		const previousCursorState = Array.from(viewModel.getCursorStates());
		const firstCursor = previousCursorState.pop();
		if (!firstCursor) {
			return;
		}
		previousCursorState.unshift(firstCursor);

		viewModel.setCursorStates(args.source, CursorChangeReason.Explicit, previousCursorState);
		viewModel.revealPrimaryCursor(args.source, true);
		announceCursorChange(previousCursorState, viewModel.getCursorStates());
	}
}

registerEditorContribution(MultiCursorSelectionController.ID, MultiCursorSelectionController, EditorContributionInstantiation.Lazy);
registerEditorContribution(SelectionHighlighter.ID, SelectionHighlighter, EditorContributionInstantiation.AfterFirstRender);

registerEditorAction(InsertCursorAbove);
registerEditorAction(InsertCursorBelow);
registerEditorAction(InsertCursorAtEndOfEachLineSelected);
registerEditorAction(AddSelectionToNextFindMatchAction);
registerEditorAction(AddSelectionToPreviousFindMatchAction);
registerEditorAction(MoveSelectionToNextFindMatchAction);
registerEditorAction(MoveSelectionToPreviousFindMatchAction);
registerEditorAction(SelectHighlightsAction);
registerEditorAction(CompatChangeAll);
registerEditorAction(InsertCursorAtEndOfLineSelected);
registerEditorAction(InsertCursorAtTopOfLineSelected);
registerEditorAction(FocusNextCursor);
registerEditorAction(FocusPreviousCursor);
