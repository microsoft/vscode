/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {TPromise} from 'vs/base/common/winjs.base';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import {FindModelBoundToEditorModel, FIND_IDS} from 'vs/editor/contrib/find/common/findModel';
import {Disposable} from 'vs/base/common/lifecycle';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import {Selection} from 'vs/editor/common/core/selection';
import {IKeybindingService, IKeybindingContextKey, IKeybindings} from 'vs/platform/keybinding/common/keybindingService';
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';
import {Range} from 'vs/editor/common/core/range';
import {OccurrencesRegistry} from 'vs/editor/contrib/wordHighlighter/common/wordHighlighter';
import {INewFindReplaceState, FindReplaceStateChangedEvent, FindReplaceState} from 'vs/editor/contrib/find/common/findState';

export enum FindStartFocusAction {
	NoFocusChange,
	FocusFindInput,
	FocusReplaceInput
}

export interface IFindStartOptions {
	forceRevealReplace:boolean;
	seedSearchStringFromSelection:boolean;
	seedSearchScopeFromSelection:boolean;
	shouldFocus:FindStartFocusAction;
	shouldAnimate:boolean;
}

const CONTEXT_FIND_WIDGET_VISIBLE = 'findWidgetVisible';

export class CommonFindController extends Disposable implements EditorCommon.IEditorContribution {

	static ID = 'editor.contrib.findController';

	private _editor: EditorCommon.ICommonCodeEditor;
	private _findWidgetVisible: IKeybindingContextKey<boolean>;
	protected _state: FindReplaceState;
	private _model: FindModelBoundToEditorModel;

	static getFindController(editor:EditorCommon.ICommonCodeEditor): CommonFindController {
		return <CommonFindController>editor.getContribution(CommonFindController.ID);
	}

	constructor(editor:EditorCommon.ICommonCodeEditor, @IKeybindingService keybindingService: IKeybindingService) {
		super();
		this._editor = editor;
		this._findWidgetVisible = keybindingService.createKey(CONTEXT_FIND_WIDGET_VISIBLE, false);

		this._state = this._register(new FindReplaceState());
		this._register(this._state.addChangeListener((e) => this._onStateChanged(e)));

		this._model = null;

		this._register(this._editor.addListener2(EditorCommon.EventType.ModelChanged, () => {
			let shouldRestartFind = (this._editor.getModel() && this._state.isRevealed);

			this.disposeModel();

			if (shouldRestartFind) {
				this._start({
					forceRevealReplace: false,
					seedSearchStringFromSelection: false,
					seedSearchScopeFromSelection: false,
					shouldFocus: FindStartFocusAction.NoFocusChange,
					shouldAnimate: false
				});
			}
		}));
	}

	public dispose(): void {
		this.disposeModel();
		super.dispose();
	}

	private disposeModel(): void {
		if (this._model) {
			this._model.dispose();
			this._model = null;
		}
	}

	public getId(): string {
		return CommonFindController.ID;
	}

	private _onStateChanged(e:FindReplaceStateChangedEvent): void {
		if (e.isRevealed) {
			if (this._state.isRevealed) {
				this._findWidgetVisible.set(true);
			} else {
				this._findWidgetVisible.reset();
				this.disposeModel();
			}
		}
	}

	public getState(): FindReplaceState {
		return this._state;
	}

	public closeFindWidget(): void {
		this._state.change({ isRevealed: false }, false);
		this._editor.focus();
	}

	public toggleCaseSensitive(): void {
		this._state.change({ matchCase: !this._state.matchCase }, false);
	}

	public toggleWholeWords(): void {
		this._state.change({ wholeWord: !this._state.wholeWord }, false);
	}

	public toggleRegex(): void {
		this._state.change({ isRegex: !this._state.isRegex }, false);
	}

	public setSearchString(searchString:string): void {
		this._state.change({ searchString: searchString }, false);
	}

	public getSelectionSearchString(): string {
		let selection = this._editor.getSelection();

		if (selection.startLineNumber === selection.endLineNumber) {
			if (selection.isEmpty()) {
				let wordAtPosition = this._editor.getModel().getWordAtPosition(selection.getStartPosition());
				if (wordAtPosition) {
					return wordAtPosition.word;
				}
			} else {
				return this._editor.getModel().getValueInRange(selection);
			}
		}

		return null;
	}

	protected _start(opts:IFindStartOptions): void {
		this.disposeModel();

		if (!this._editor.getModel()) {
			// cannot do anything with an editor that doesn't have a model...
			return;
		}

		let stateChanges: INewFindReplaceState = {
			isRevealed: true
		};

		// Consider editor selection and overwrite the state with it
		if (opts.seedSearchStringFromSelection) {
			let selectionSearchString = this.getSelectionSearchString();
			if (selectionSearchString) {
				stateChanges.searchString = selectionSearchString;
			}
		}

		let selection = this._editor.getSelection();

		stateChanges.searchScope = null;
		if (opts.seedSearchScopeFromSelection && selection.startLineNumber < selection.endLineNumber) {
			// Take search scope into account only if it is more than one line.
			stateChanges.searchScope = selection;
		}

		// Overwrite isReplaceRevealed
		if (opts.forceRevealReplace) {
			stateChanges.isReplaceRevealed = true;
		}

		this._state.change(stateChanges, false);

		if (!this._model) {
			this._model = new FindModelBoundToEditorModel(this._editor, this._state);
		}
	}

	public start(opts:IFindStartOptions): void {
		this._start(opts);
	}

	public moveToNextMatch(): boolean {
		if (this._model) {
			this._model.moveToNextMatch();
			return true;
		}
		return false;
	}

	public moveToPrevMatch(): boolean {
		if (this._model) {
			this._model.moveToPrevMatch();
			return true;
		}
		return false;
	}

	public replace(): boolean {
		if (this._model) {
			this._model.replace();
			return true;
		}
		return false;
	}

	public replaceAll(): boolean {
		if (this._model) {
			this._model.replaceAll();
			return true;
		}
		return false;
	}
}

export class StartFindAction extends EditorAction {

	constructor(descriptor: EditorCommon.IEditorActionDescriptorData, editor: EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus);
	}

	public run(): TPromise<boolean> {
		let controller = CommonFindController.getFindController(this.editor);
		controller.start({
			forceRevealReplace: false,
			seedSearchStringFromSelection: true,
			seedSearchScopeFromSelection: true,
			shouldFocus: FindStartFocusAction.FocusFindInput,
			shouldAnimate: true
		});
		return TPromise.as(true);
	}
}

abstract class MatchFindAction extends EditorAction {
	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus);
	}

	public run(): TPromise<boolean> {
		let controller = CommonFindController.getFindController(this.editor);
		if (!this._run(controller)) {
			controller.start({
				forceRevealReplace: false,
				seedSearchStringFromSelection: (controller.getState().searchString.length === 0),
				seedSearchScopeFromSelection: false,
				shouldFocus: FindStartFocusAction.NoFocusChange,
				shouldAnimate: true
			});
			this._run(controller);
		}
		return TPromise.as(true);
	}

	protected abstract _run(controller:CommonFindController): boolean;
}

export class NextMatchFindAction extends MatchFindAction {
	protected _run(controller:CommonFindController): boolean {
		return controller.moveToNextMatch();
	}
}

export class PreviousMatchFindAction extends MatchFindAction {
	protected _run(controller:CommonFindController): boolean {
		return controller.moveToPrevMatch();
	}
}

abstract class SelectionMatchFindAction extends EditorAction {
	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus);
	}

	public run(): TPromise<boolean> {
		let controller = CommonFindController.getFindController(this.editor);
		let selectionSearchString = controller.getSelectionSearchString();
		if (selectionSearchString) {
			controller.setSearchString(selectionSearchString);
		}
		if (!this._run(controller)) {
			controller.start({
				forceRevealReplace: false,
				seedSearchStringFromSelection: false,
				seedSearchScopeFromSelection: false,
				shouldFocus: FindStartFocusAction.NoFocusChange,
				shouldAnimate: true
			});
			this._run(controller);
		}
		return TPromise.as(true);
	}

	protected abstract _run(controller:CommonFindController): boolean;
}

export class NextSelectionMatchFindAction extends SelectionMatchFindAction {
	protected _run(controller:CommonFindController): boolean {
		return controller.moveToNextMatch();
	}
}

export class PreviousSelectionMatchFindAction extends SelectionMatchFindAction {
	protected _run(controller:CommonFindController): boolean {
		return controller.moveToPrevMatch();
	}
}

export class StartFindReplaceAction extends EditorAction {

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.Writeable);
	}

	public run(): TPromise<boolean> {
		let controller = CommonFindController.getFindController(this.editor);
		controller.start({
			forceRevealReplace: true,
			seedSearchStringFromSelection: (controller.getState().searchString.length === 0),
			seedSearchScopeFromSelection: true,
			shouldFocus: FindStartFocusAction.FocusReplaceInput,
			shouldAnimate: true
		});
		return TPromise.as(true);
	}
}

export interface IMultiCursorFindResult {
	searchText:string;
	isRegex:boolean;
	matchCase:boolean;
	wholeWord:boolean;

	nextMatch: EditorCommon.IEditorSelection;
}

export function multiCursorFind(editor:EditorCommon.ICommonCodeEditor, changeFindSearchString:boolean): IMultiCursorFindResult {
	let controller = CommonFindController.getFindController(editor);
	let state = controller.getState();
	let searchText: string,
		nextMatch: EditorCommon.IEditorSelection;

	// In any case, if the find widget was ever opened, the options are taken from it
	let isRegex = state.isRegex;
	let wholeWord = state.wholeWord;
	let matchCase = state.matchCase;

	// Find widget owns what we search for if:
	//  - focus is not in the editor (i.e. it is in the find widget)
	//  - and the search widget is visible
	//  - and the search string is non-empty
	if (!editor.isFocused() && state.isRevealed && state.searchString.length > 0) {
		// Find widget owns what is searched for
		searchText = state.searchString;
	} else {
		// Selection owns what is searched for
		let s = editor.getSelection();

		if (s.startLineNumber !== s.endLineNumber) {
			// Cannot search for multiline string... yet...
			return null;
		}

		if (s.isEmpty()) {
			// selection is empty => expand to current word
			let word = editor.getModel().getWordAtPosition(s.getStartPosition());
			if (!word) {
				return null;
			}
			searchText = word.word;
			nextMatch = Selection.createSelection(s.startLineNumber, word.startColumn, s.startLineNumber, word.endColumn);
		} else {
			searchText = editor.getModel().getValueInRange(s);
		}
		if (changeFindSearchString) {
			controller.setSearchString(searchText);
		}
	}

	return {
		searchText: searchText,
		isRegex: isRegex,
		matchCase: matchCase,
		wholeWord: wholeWord,
		nextMatch: nextMatch
	};
}

export class SelectNextFindMatchAction extends EditorAction {
	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus);
	}

	protected _getNextMatch(): EditorCommon.IEditorSelection {
		let r = multiCursorFind(this.editor, true);
		if (!r) {
			return null;
		}
		if (r.nextMatch) {
			return r.nextMatch;
		}

		let allSelections = this.editor.getSelections();
		let lastAddedSelection = allSelections[allSelections.length - 1];

		let nextMatch = this.editor.getModel().findNextMatch(r.searchText, lastAddedSelection.getEndPosition(), r.isRegex, r.matchCase, r.wholeWord);

		if (!nextMatch) {
			return null;
		}

		return Selection.createSelection(nextMatch.startLineNumber, nextMatch.startColumn, nextMatch.endLineNumber, nextMatch.endColumn);
	}
}

export class AddSelectionToNextFindMatchAction extends SelectNextFindMatchAction {
	static ID = FIND_IDS.AddSelectionToNextFindMatchAction;

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, ns);
	}

	public run(): TPromise<boolean> {
		let nextMatch = this._getNextMatch();

		if (!nextMatch) {
			return TPromise.as(false);
		}

		let allSelections = this.editor.getSelections();
		this.editor.setSelections(allSelections.concat(nextMatch));
		this.editor.revealRangeInCenterIfOutsideViewport(nextMatch);

		return TPromise.as(true);
	}
}

export class MoveSelectionToNextFindMatchAction extends SelectNextFindMatchAction {
	static ID = FIND_IDS.MoveSelectionToNextFindMatchAction;

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, ns);
	}

	public run(): TPromise<boolean> {
		let nextMatch = this._getNextMatch();

		if (!nextMatch) {
			return TPromise.as(false);
		}

		let allSelections = this.editor.getSelections();
		let lastAddedSelection = allSelections[allSelections.length - 1];
		this.editor.setSelections(allSelections.slice(0, allSelections.length - 1).concat(nextMatch));
		this.editor.revealRangeInCenterIfOutsideViewport(nextMatch);

		return TPromise.as(true);
	}
}

export class SelectHighlightsAction extends EditorAction {
	static ID = 'editor.action.selectHighlights';
	static COMPAT_ID = 'editor.action.changeAll';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		let behaviour = Behaviour.WidgetFocus;
		if (descriptor.id === SelectHighlightsAction.COMPAT_ID) {
			behaviour |= Behaviour.ShowInContextMenu;
		}
		super(descriptor, editor, behaviour);
	}

	public getGroupId(): string {
		return '2_change/1_changeAll';
	}

	public run(): TPromise<boolean> {
		let r = multiCursorFind(this.editor, true);
		if (!r) {
			return TPromise.as(false);
		}

		let matches = this.editor.getModel().findMatches(r.searchText, true, r.isRegex, r.matchCase, r.wholeWord);

		if (matches.length > 0) {
			this.editor.setSelections(matches.map(m => Selection.createSelection(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn)));
		}
		return TPromise.as(true);
	}
}

export class SelectionHighlighter extends Disposable implements EditorCommon.IEditorContribution {
	static ID = 'editor.contrib.selectionHighlighter';

	private editor: EditorCommon.ICommonCodeEditor;
	private decorations: string[];

	constructor(editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super();
		this.editor = editor;
		this.decorations = [];

		this._register(editor.addListener2(EditorCommon.EventType.CursorPositionChanged, _ => this._update()));
		this._register(editor.addListener2(EditorCommon.EventType.ModelChanged, (e) => {
			this.removeDecorations();
		}));
		this._register(CommonFindController.getFindController(editor).getState().addChangeListener((e) => this._update()));
	}

	public getId(): string {
		return SelectionHighlighter.ID;
	}

	private removeDecorations(): void {
		if (this.decorations.length > 0) {
			this.decorations = this.editor.deltaDecorations(this.decorations, []);
		}
	}

	private _update(): void {
		if (!this.editor.getConfiguration().selectionHighlight) {
			return;
		}

		let r = multiCursorFind(this.editor, false);
		if (!r) {
			this.removeDecorations();
			return;
		}

		let model = this.editor.getModel();
		if (r.nextMatch) {
			// This is an empty selection
			if (OccurrencesRegistry.has(model)) {
				// Do not interfere with semantic word highlighting in the no selection case
				this.removeDecorations();
				return;
			}
		}
		if (/^[ \t]+$/.test(r.searchText)) {
			// whitespace only selection
			this.removeDecorations();
			return;
		}
		if (r.searchText.length > 200) {
			// very long selection
			this.removeDecorations();
			return;
		}

		let allMatches = model.findMatches(r.searchText, true, r.isRegex, r.matchCase, r.wholeWord);
		allMatches.sort(Range.compareRangesUsingStarts);

		let selections = this.editor.getSelections();
		selections.sort(Range.compareRangesUsingStarts);

		// do not overlap with selection (issue #64 and #512)
		let matches: EditorCommon.IEditorRange[] = [];
		for (let i = 0, j = 0, len = allMatches.length, lenJ = selections.length; i < len; ) {
			let match = allMatches[i];

			if (j >= lenJ) {
				// finished all editor selections
				matches.push(match);
				i++;
			} else {
				let cmp = Range.compareRangesUsingStarts(match, selections[j]);
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

		let decorations = matches.map(r => {
			return {
				range: r,
				options: {
					stickiness: EditorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					className: 'selectionHighlight'
				}
			};
		});

		this.decorations = this.editor.deltaDecorations(this.decorations, decorations);
	}

	public dispose(): void {
		this.removeDecorations();
		super.dispose();
	}
}


CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(SelectHighlightsAction, SelectHighlightsAction.ID, nls.localize('selectAllOccurencesOfFindMatch', "Select All Occurences of Find Match"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_L
}));
// register SelectHighlightsAction again to replace the now removed Change All action
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(SelectHighlightsAction, SelectHighlightsAction.COMPAT_ID, nls.localize('changeAll.label', "Change All Occurrences"), {
	context: ContextKey.EditorTextFocus,
	primary: KeyMod.CtrlCmd | KeyCode.F2
}));

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(StartFindAction, FIND_IDS.StartFindAction, nls.localize('startFindAction',"Find"), {
	context: ContextKey.None,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_F
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(NextMatchFindAction, FIND_IDS.NextMatchFindAction, nls.localize('findNextMatchAction', "Find Next"), {
	context: ContextKey.EditorFocus,
	primary: KeyCode.F3,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3] }
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(PreviousMatchFindAction, FIND_IDS.PreviousMatchFindAction, nls.localize('findPreviousMatchAction', "Find Previous"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.Shift | KeyCode.F3,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G, secondary: [KeyMod.Shift | KeyCode.F3] }
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(NextSelectionMatchFindAction, FIND_IDS.NextSelectionMatchFindAction, nls.localize('nextSelectionMatchFindAction', "Find Next Selection"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyCode.F3
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(PreviousSelectionMatchFindAction, FIND_IDS.PreviousSelectionMatchFindAction, nls.localize('previousSelectionMatchFindAction', "Find Previous Selection"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F3
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(StartFindReplaceAction, FIND_IDS.StartFindReplaceAction, nls.localize('startReplace', "Replace"), {
	context: ContextKey.None,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_H,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_F }
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(MoveSelectionToNextFindMatchAction, MoveSelectionToNextFindMatchAction.ID, nls.localize('moveSelectionToNextFindMatch', "Move Last Selection To Next Find Match"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_D)
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(AddSelectionToNextFindMatchAction, AddSelectionToNextFindMatchAction.ID, nls.localize('addSelectionToNextFindMatch', "Add Selection To Next Find Match"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_D
}));

function registerFindCommand(id:string, callback:(controller:CommonFindController)=>void, keybindings:IKeybindings, needsKey:string = null): void {
	CommonEditorRegistry.registerEditorCommand(id, CommonEditorRegistry.commandWeight(5), keybindings, false, needsKey, (ctx, editor, args) => {
		callback(CommonFindController.getFindController(editor));
	});
}

registerFindCommand(FIND_IDS.CloseFindWidgetCommand, x => x.closeFindWidget(), {
	primary: KeyCode.Escape
}, CONTEXT_FIND_WIDGET_VISIBLE);
registerFindCommand(FIND_IDS.ToggleCaseSensitiveCommand, x => x.toggleCaseSensitive(), {
	primary: KeyMod.Alt | KeyCode.KEY_C,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_C }
});
registerFindCommand(FIND_IDS.ToggleWholeWordCommand, x => x.toggleWholeWords(), {
	primary: KeyMod.Alt | KeyCode.KEY_W,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_W }
});
registerFindCommand(FIND_IDS.ToggleRegexCommand, x => x.toggleRegex(), {
	primary: KeyMod.Alt | KeyCode.KEY_R,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_R }
});
