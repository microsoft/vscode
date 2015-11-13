/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import FindWidget = require('./findWidget');
import FindModel = require('./findModel');
import nls = require('vs/nls');
import EventEmitter = require('vs/base/common/eventEmitter');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import Lifecycle = require('vs/base/common/lifecycle');
import config = require('vs/editor/common/config/config');
import EditorCommon = require('vs/editor/common/editorCommon');
import {Selection} from 'vs/editor/common/core/selection';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';
import {IContextViewService} from 'vs/platform/contextview/browser/contextView';
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {KeyMod, KeyCode} from 'vs/base/common/keyCodes';

/**
 * The Find controller will survive an editor.setModel(..) call
 */
export class FindController implements EditorCommon.IEditorContribution, FindWidget.IFindController {

	static ID = 'editor.contrib.findController';

	private editor:EditorBrowser.ICodeEditor;
	private _findWidgetVisible: IKeybindingContextKey<boolean>;

	private model:FindModel.IFindModel;
	private widget:FindWidget.IFindWidget;
	private widgetIsVisible:boolean;
	private widgetListeners:Lifecycle.IDisposable[];

	private editorListeners:EventEmitter.ListenerUnbind[];
	private lastState:FindModel.IFindState;

	static getFindController(editor:EditorCommon.ICommonCodeEditor): FindController {
		return <FindController>editor.getContribution(FindController.ID);
	}

	constructor(editor:EditorBrowser.ICodeEditor, @IContextViewService contextViewService: IContextViewService, @IKeybindingService keybindingService: IKeybindingService) {
		this._findWidgetVisible = keybindingService.createKey(CONTEXT_FIND_WIDGET_VISIBLE, false);

		this.editor = editor;
		this.model = null;
		this.widgetIsVisible = false;
		this.lastState = null;

		this.widget = new FindWidget.FindWidget(this.editor, this, contextViewService);

		this.widgetListeners = [];
		this.widgetListeners.push(this.widget.addUserInputEventListener((e) => this.onWidgetUserInput(e)));
		this.widgetListeners.push(this.widget.addClosedEventListener(() => this.onWidgetClosed()));

		this.editorListeners = [];
		this.editorListeners.push(this.editor.addListener(EditorCommon.EventType.ModelChanged, () => {
			this.disposeBindingAndModel();
			if (this.editor.getModel() && this.lastState && this.widgetIsVisible) {
				this._start(false, false, false, false);
			}
		}));
		this.editorListeners.push(this.editor.addListener(EditorCommon.EventType.Disposed, () => {
			this.editorListeners.forEach((element:EventEmitter.ListenerUnbind) => {
				element();
			});
			this.editorListeners = [];
		}));
	}

	public getId(): string {
		return FindController.ID;
	}

	public dispose(): void {
		this.widgetListeners = Lifecycle.disposeAll(this.widgetListeners);
		if (this.widget) {
			this.widget.dispose();
			this.widget = null;
		}
		this.disposeBindingAndModel();
	}

	private disposeBindingAndModel(): void {
		this._findWidgetVisible.reset();
		if (this.widget) {
			this.widget.setModel(null);
		}
		if (this.model) {
			this.model.dispose();
			this.model = null;
		}
	}

	public closeFindWidget(): void {
		this.widgetIsVisible = false;
		this.disposeBindingAndModel();
		this.editor.focus();
	}

	private onWidgetClosed(): void {
		this.widgetIsVisible = false;
		this.disposeBindingAndModel();
	}

	public getFindState(): FindModel.IFindState {
		return this.lastState;
	}

	public setSearchString(searchString:string): void {
		this.widget.setSearchString(searchString);
		this.lastState = this.widget.getState();
		if (this.model) {
			this.model.recomputeMatches(this.lastState, false);
		}
	}

	private onWidgetUserInput(e:FindWidget.IUserInputEvent): void {
		this.lastState = this.widget.getState();
		if (this.model) {
			this.model.recomputeMatches(this.lastState, e.jumpToNextMatch);
		}
	}

	private _start(forceRevealReplace:boolean, seedSearchStringFromSelection:boolean, seedSearchScopeFromSelection:boolean, shouldFocus:boolean): void {
		if (!this.model) {
			this.model = new FindModel.FindModelBoundToEditorModel(this.editor);
			this.widget.setModel(this.model);
		}

		this._findWidgetVisible.set(true);

		// Get a default state if none existed before
		this.lastState = this.lastState || this.widget.getState();

		// Consider editor selection and overwrite the state with it
		var selection = this.editor.getSelection();

		if (!selection) {
			// Someone started the find controller with an editor that doesn't have a model...
			return;
		}

		if (seedSearchStringFromSelection) {
			if (selection.startLineNumber === selection.endLineNumber) {
				if (selection.isEmpty()) {
					let wordAtPosition = this.editor.getModel().getWordAtPosition(selection.getStartPosition());
					if (wordAtPosition) {
						this.lastState.searchString = wordAtPosition.word;
					}
				} else {
					this.lastState.searchString = this.editor.getModel().getValueInRange(selection);
				}
			}
		}

		var searchScope:EditorCommon.IEditorRange = null;
		if (seedSearchScopeFromSelection && selection.startLineNumber < selection.endLineNumber) {
			// Take search scope into account only if it is more than one line.
			searchScope = selection;
		}

		// Overwrite isReplaceRevealed
		if (forceRevealReplace) {
			this.lastState.isReplaceRevealed = forceRevealReplace;
		}

		// Start searching
		this.model.start(this.lastState, searchScope, shouldFocus);
		this.widgetIsVisible = true;
	}

	public startFromAction(withReplace:boolean): void {
		this._start(withReplace, true, true, true);
	}

	public next(): boolean {
		if (this.model) {
			this.model.next();
			return true;
		}
		return false;
	}

	public prev(): boolean {
		if (this.model) {
			this.model.prev();
			return true;
		}
		return false;
	}

	public enableSelectionFind(): void {
		if (this.model) {
			this.model.setFindScope(this.editor.getSelection());
		}
	}

	public disableSelectionFind(): void {
		if (this.model) {
			this.model.setFindScope(null);
		}
	}

	public replace(): boolean {
		if (this.model) {
			this.model.replace();
			return true;
		}
		return false;
	}

	public replaceAll(): boolean {
		if (this.model) {
			this.model.replaceAll();
			return true;
		}
		return false;
	}
}

export class BaseStartFindAction extends EditorAction {

	constructor(descriptor: EditorCommon.IEditorActionDescriptorData, editor: EditorCommon.ICommonCodeEditor, condition: Behaviour) {
		super(descriptor, editor, condition || Behaviour.WidgetFocus);
	}

	_startController(controller:FindController): void {
		controller.startFromAction(false);
	}

	public run(): TPromise<boolean> {

		var controller = FindController.getFindController(this.editor);
		this._startController(controller);
		return TPromise.as(true);
	}
}

export class StartFindAction extends BaseStartFindAction {
	constructor(descriptor: EditorCommon.IEditorActionDescriptorData, editor: EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus);
	}
}

export class NextMatchFindAction extends EditorAction {

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus);
	}

	public run(): TPromise<boolean> {
		var controller = FindController.getFindController(this.editor);
		if (!controller.next()) {
			controller.startFromAction(false);
			controller.next();
		}
		return TPromise.as(true);
	}
}

export class PreviousMatchFindAction extends EditorAction {

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus);
	}

	public run(): TPromise<boolean> {
		var controller = FindController.getFindController(this.editor);
		if (!controller.prev()) {
			controller.startFromAction(false);
			controller.prev();
		}
		return TPromise.as(true);
	}
}

export class StartFindReplaceAction extends BaseStartFindAction {

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.Writeable);
	}

	public getId(): string {
		return FindModel.START_FIND_REPLACE_ID;
	}

	_startController(controller:FindController): void {
		controller.startFromAction(true);
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
	var controller = FindController.getFindController(editor);
	var state = controller.getFindState();
	var searchText: string,
		isRegex = false,
		wholeWord = false,
		matchCase = false,
		nextMatch: EditorCommon.IEditorSelection;

	// In any case, if the find widget was ever opened, the options are taken from it
	if (state) {
		isRegex = state.properties.isRegex;
		wholeWord = state.properties.wholeWord;
		matchCase = state.properties.matchCase;
	}

	// Find widget owns what we search for if:
	//  - focus is not in the editor (i.e. it is in the find widget)
	//  - and the search widget is visible
	//  - and the search string is non-empty
	if (!editor.isFocused() && state && state.searchString.length > 0) {
		// Find widget owns what is searched for
		searchText = state.searchString;
	} else {
		// Selection owns what is searched for
		var s = editor.getSelection();

		if (s.startLineNumber !== s.endLineNumber) {
			// Cannot search for multiline string... yet...
			return null;
		}

		if (s.isEmpty()) {
			// selection is empty => expand to current word
			var word = editor.getModel().getWordAtPosition(s.getStartPosition());
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

class SelectNextFindMatchAction extends EditorAction {
	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus);
	}

	protected _getNextMatch(): EditorCommon.IEditorSelection {
		var r = multiCursorFind(this.editor, true);
		if (!r) {
			return null;
		}
		if (r.nextMatch) {
			return r.nextMatch;
		}

		var allSelections = this.editor.getSelections();
		var lastAddedSelection = allSelections[allSelections.length - 1];

		var nextMatch = this.editor.getModel().findNextMatch(r.searchText, lastAddedSelection.getEndPosition(), r.isRegex, r.matchCase, r.wholeWord);

		if (!nextMatch) {
			return null;
		}

		return Selection.createSelection(nextMatch.startLineNumber, nextMatch.startColumn, nextMatch.endLineNumber, nextMatch.endColumn);
	}
}

class AddSelectionToNextFindMatchAction extends SelectNextFindMatchAction {
	static ID = 'editor.action.addSelectionToNextFindMatch';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, ns);
	}

	public run(): TPromise<boolean> {
		var nextMatch = this._getNextMatch();

		if (!nextMatch) {
			return TPromise.as(false);
		}

		var allSelections = this.editor.getSelections();
		this.editor.setSelections(allSelections.concat(nextMatch));
		this.editor.revealRangeInCenterIfOutsideViewport(nextMatch);

		return TPromise.as(true);
	}
}

class MoveSelectionToNextFindMatchAction extends SelectNextFindMatchAction {
	static ID = 'editor.action.moveSelectionToNextFindMatch';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, ns);
	}

	public run(): TPromise<boolean> {
		var nextMatch = this._getNextMatch();

		if (!nextMatch) {
			return TPromise.as(false);
		}

		var allSelections = this.editor.getSelections();
		var lastAddedSelection = allSelections[allSelections.length - 1];
		this.editor.setSelections(allSelections.slice(0, allSelections.length - 1).concat(nextMatch));
		this.editor.revealRangeInCenterIfOutsideViewport(nextMatch);

		return TPromise.as(true);
	}
}

class SelectHighlightsAction extends EditorAction {

	static ID = 'editor.action.selectHighlights';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus);
	}

	public run(): TPromise<boolean> {
		var r = multiCursorFind(this.editor, true);
		if (!r) {
			return TPromise.as(false);
		}

		var matches = this.editor.getModel().findMatches(r.searchText, true, r.isRegex, r.matchCase, r.wholeWord);

		if (matches.length > 0) {
			this.editor.setSelections(matches.map(m => Selection.createSelection(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn)));
		}
		return TPromise.as(true);
	}
}

export class SelectionHighlighter implements EditorCommon.IEditorContribution {

	static ID = 'editor.contrib.selectionHighlighter';

	private editor:EditorCommon.ICommonCodeEditor;
	private model:EditorCommon.IModel;
	private decorations:string[];
	private toUnhook:EventEmitter.ListenerUnbind[];

	constructor(editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		this.editor = editor;
		this.model = this.editor.getModel();
		this.decorations = [];
		this.toUnhook = [];

		this.toUnhook.push(editor.addListener(EditorCommon.EventType.CursorPositionChanged, e => this.onPositionChanged(e)));
		this.toUnhook.push(editor.addListener(EditorCommon.EventType.ModelChanged, (e) => {
			this.removeDecorations();
			this.model = this.editor.getModel();
		}));
	}

	public getId(): string {
		return SelectionHighlighter.ID;
	}

	private removeDecorations(): void {
		if (this.decorations.length > 0) {
			this.decorations = this.editor.deltaDecorations(this.decorations, []);
		}
	}

	private onPositionChanged(e:EditorCommon.ICursorPositionChangedEvent): void {
		if (!this.editor.getConfiguration().selectionHighlight) {
			return;
		}

		var r = multiCursorFind(this.editor, false);
		if (!r) {
			this.removeDecorations();
			return;
		}
		if (r.nextMatch) {
			// This is an empty selection
			this.removeDecorations();
			return;
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

		var matches = this.editor.getModel().findMatches(r.searchText, true, r.isRegex, r.matchCase, r.wholeWord);

		var decorations = matches.map(r => {
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
		while(this.toUnhook.length > 0) {
			this.toUnhook.pop()();
		}
	}
}


CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(SelectHighlightsAction, SelectHighlightsAction.ID, nls.localize('selectAllOccurencesOfFindMatch', "Select All Occurences of Find Match"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_L
}));

var CONTEXT_FIND_WIDGET_VISIBLE = 'findWidgetVisible';

// register actions
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(StartFindAction, FindModel.START_FIND_ID, nls.localize('startFindAction',"Find"), {
	context: ContextKey.None,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_F,
	secondary: [KeyMod.CtrlCmd | KeyCode.F3]
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(NextMatchFindAction, FindModel.NEXT_MATCH_FIND_ID, nls.localize('findNextMatchAction', "Find Next"), {
	context: ContextKey.EditorFocus,
	primary: KeyCode.F3,
	mac: { primary: KeyMod.CtrlCmd | KeyCode.KEY_G, secondary: [KeyCode.F3] }
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(PreviousMatchFindAction, FindModel.PREVIOUS_MATCH_FIND_ID, nls.localize('findPreviousMatchAction', "Find Previous"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.Shift | KeyCode.F3,
	mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G, secondary: [KeyMod.Shift | KeyCode.F3] }
}));
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(StartFindReplaceAction, FindModel.START_FIND_REPLACE_ID, nls.localize('startReplace', "Replace"), {
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
EditorBrowserRegistry.registerEditorContribution(FindController);
EditorBrowserRegistry.registerEditorContribution(SelectionHighlighter);
CommonEditorRegistry.registerEditorCommand('closeFindWidget', CommonEditorRegistry.commandWeight(5), { primary: KeyCode.Escape }, false, CONTEXT_FIND_WIDGET_VISIBLE, (ctx, editor, args) => {
	FindController.getFindController(editor).closeFindWidget();
});