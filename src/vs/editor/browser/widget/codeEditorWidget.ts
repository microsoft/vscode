/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/editor';
import 'vs/css!./media/tokens';
import 'vs/css!./media/default-theme';

import EditorCommon = require('vs/editor/common/editorCommon');
import Browser = require('vs/base/browser/browser');

import Colorizer = require('vs/editor/browser/standalone/colorizer');
import {TPromise} from 'vs/base/common/winjs.base';
import Objects = require('vs/base/common/objects');
import Errors = require('vs/base/common/errors');
import DOM = require('vs/base/browser/dom');
import EventEmitter = require('vs/base/common/eventEmitter');
import Configuration = require('vs/editor/browser/config/configuration');
import Cursor = require('vs/editor/common/controller/cursor');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import ViewImpl = require('vs/editor/browser/view/viewImpl');
import CharacterHardWrappingLineMapper = require('vs/editor/common/viewModel/characterHardWrappingLineMapper');
import SplitLinesCollection = require('vs/editor/common/viewModel/splitLinesCollection');
import ViewModel = require('vs/editor/common/viewModel/viewModel');
import Timer = require('vs/base/common/timer');
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import Actions = require('vs/base/common/actions');
import CursorMoveHelper = require('vs/editor/common/controller/cursorMoveHelper');
import OneCursor = require('vs/editor/common/controller/oneCursor');
import Lifecycle = require('vs/base/common/lifecycle');
import {DynamicEditorAction} from 'vs/editor/common/editorAction';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {Range} from 'vs/editor/common/core/range';
import {Position} from 'vs/editor/common/core/position';
import {Selection} from 'vs/editor/common/core/selection';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

import {EditorState} from 'vs/editor/common/core/editorState';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybindingService';

var EDITOR_ID = 0;

export class CodeEditorWidget extends EventEmitter.EventEmitter implements Actions.IActionProvider, EditorBrowser.ICodeEditor {

	private id:number;
	private domElement:HTMLElement;
	_lifetimeListeners:EventEmitter.ListenerUnbind[];
	_lifetimeDispose: Lifecycle.IDisposable[];
	_configuration:Configuration.Configuration;
	private focusTracker:DOM.IFocusTracker;
	_telemetryService:ITelemetryService;

	private contributions:{ [key:string]:EditorCommon.IEditorContribution; };
	private contentWidgets:{ [key:string]:EditorBrowser.IContentWidgetData; };
	private overlayWidgets:{ [key:string]:EditorBrowser.IOverlayWidgetData; };
	private forcedWidgetFocusCount:number;

	// --- Members logically associated to a model
	/*protected*/public model:EditorCommon.IModel;
	/*protected*/public listenersToRemove:EventEmitter.ListenerUnbind[];
	private hasView: boolean;
	_view:EditorBrowser.IView;
	private viewModel:ViewModel.ViewModel;
	/*protected*/public cursor:Cursor.Cursor;

	private _instantiationService: IInstantiationService;
	protected _keybindingService: IKeybindingService;

	private _decorationTypeKeysToIds: {[decorationTypeKey:string]:string[];};

	private _codeEditorService: ICodeEditorService;
	private _editorIdContextKey: IKeybindingContextKey<string>;
	private _editorFocusContextKey: IKeybindingContextKey<boolean>;
	private _editorTabMovesFocusKey: IKeybindingContextKey<boolean>;
	private _hasMultipleSelectionsKey: IKeybindingContextKey<boolean>;
	private _hasNonEmptySelectionKey: IKeybindingContextKey<boolean>;
	private _langIdKey: IKeybindingContextKey<string>;

	constructor(
		domElement:HTMLElement,
		options:EditorCommon.ICodeEditorWidgetCreationOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super();

		this.id = (++EDITOR_ID);
		this._codeEditorService = codeEditorService;

		var timerEvent = Timer.start(Timer.Topic.EDITOR, 'CodeEditor.ctor');

		this.domElement = domElement;

		this._lifetimeDispose = [];

		this._keybindingService = keybindingService.createScoped(domElement);
		this._editorIdContextKey = this._keybindingService.createKey('editorId', this.getId());
		this._editorFocusContextKey = this._keybindingService.createKey(EditorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS, undefined);
		this._editorTabMovesFocusKey = this._keybindingService.createKey(EditorCommon.KEYBINDING_CONTEXT_EDITOR_TAB_MOVES_FOCUS, false);
		this._hasMultipleSelectionsKey = this._keybindingService.createKey(EditorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS, false);
		this._hasNonEmptySelectionKey = this._keybindingService.createKey(EditorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION, false);
		this._langIdKey = this._keybindingService.createKey<string>(EditorCommon.KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID, undefined);

		// listeners that are kept during the whole editor lifetime
		this._lifetimeListeners = [];
		this._decorationTypeKeysToIds = {};

		options = options || {};
		var model: EditorCommon.IModel = null;
		if (options.model) {
			model = options.model;
			delete options.model;
		}

		this._configuration = new Configuration.Configuration(options, domElement, (tabSize:number) => {
			if (this.model) {
				return this.model.guessIndentation(tabSize);
			}
			return null;
		});
		if (this._configuration.editor.tabFocusMode) {
			this._editorTabMovesFocusKey.set(true);
		}
		this._lifetimeListeners.push(this._configuration.addListener(EditorCommon.EventType.ConfigurationChanged, (e) => this.emit(EditorCommon.EventType.ConfigurationChanged, e)));

		this.forcedWidgetFocusCount = 0;

		// track focus of the domElement and all its anchestors
		this.focusTracker = DOM.trackFocus(this.domElement);
		this.focusTracker.addFocusListener(() => {
			if (this.forcedWidgetFocusCount === 0) {
				this._editorFocusContextKey.set(true);
				this.emit(EditorCommon.EventType.EditorFocus, {});
			}
		});
		this.focusTracker.addBlurListener(() => {
			if (this.forcedWidgetFocusCount === 0) {
				this._editorFocusContextKey.reset();
				this.emit(EditorCommon.EventType.EditorBlur, {});
			}
		});

		this._telemetryService = telemetryService;
		this._instantiationService = instantiationService.createChild({
			keybindingService: this._keybindingService
		});

		this._attachModel(model);
		this.contentWidgets = {};
		this.overlayWidgets = {};

		// Create editor contributions
		this.contributions = {};
		var contributionDescriptors = [].concat(EditorBrowserRegistry.getEditorContributions()).concat(CommonEditorRegistry.getEditorContributions());
		for (var i = 0, len = contributionDescriptors.length; i < len; i++) {
			try {
				var contribution = contributionDescriptors[i].createInstance(this._instantiationService, this);
				this.contributions[contribution.getId()] = contribution;
			} catch (err) {
				console.error('Could not instantiate contribution ' + contribution.getId());
				Errors.onUnexpectedError(err);
			}
		}

		timerEvent.stop();

		this._codeEditorService.addCodeEditor(this);
	}

	public getId(): string {
		return this.getEditorType() + ':' + this.id;
	}

	public getEditorType(): string {
		return EditorCommon.EditorType.ICodeEditor;
	}

	public destroy(): void {
		this.dispose();
	}

	public dispose(): void {
		this._codeEditorService.removeCodeEditor(this);
		this._lifetimeDispose = Lifecycle.disposeAll(this._lifetimeDispose);
		// unbind listeners
		while(this._lifetimeListeners.length > 0) {
			this._lifetimeListeners.pop()();
		}

		var contributionId:string;
		for (contributionId in this.contributions) {
			if (this.contributions.hasOwnProperty(contributionId)) {
				this.contributions[contributionId].dispose();
			}
		}
		this.contributions = {};
		this.contentWidgets = {};
		this.overlayWidgets = {};

		this.focusTracker.dispose();
		this._postDetachModelCleanup(this._detachModel());
		this._configuration.dispose();
		this._keybindingService.dispose();
		this.emit(EditorCommon.EventType.Disposed, {});
		super.dispose();
	}

	public captureState(...flags:EditorCommon.CodeEditorStateFlag[]): EditorCommon.ICodeEditorState {
		return new EditorState(this, flags);
	}

	public colorizeModelLine(lineNumber:number, model:EditorCommon.IModel = this.model): string {
		if (!model) {
			return '';
		}
		var content = model.getLineContent(lineNumber);
		var tokens = model.getLineTokens(lineNumber, false);
		var inflatedTokens = EditorCommon.LineTokensBinaryEncoding.inflateArr(tokens.getBinaryEncodedTokensMap(), tokens.getBinaryEncodedTokens());
		var indent = this._configuration.getIndentationOptions();
		return Colorizer.colorizeLine(content, inflatedTokens, indent.tabSize);
	}

	public updateOptions(newOptions:EditorCommon.IEditorOptions): void {
		this._configuration.updateOptions(newOptions);
		if (this._configuration.editor.tabFocusMode) {
			this._editorTabMovesFocusKey.set(true);
		} else {
			this._editorTabMovesFocusKey.reset();
		}
	}

	public getConfiguration(): EditorCommon.IInternalEditorOptions {
		return Objects.clone(this._configuration.editor);
	}

	public getRawConfiguration(): EditorCommon.IEditorOptions {
		return this._configuration.getRawOptions();
	}

	public getIndentationOptions(): EditorCommon.IInternalIndentationOptions {
		return Objects.clone(this._configuration.getIndentationOptions());
	}

	public normalizeIndentation(str:string): string {
		return this._configuration.normalizeIndentation(str);
	}

	public getValue(options:{ preserveBOM:boolean; lineEnding:string; }=null): string {
		if (this.model) {
			var preserveBOM:boolean = (options && options.preserveBOM) ? true : false;
			var eolPreference = EditorCommon.EndOfLinePreference.TextDefined;
			if (options && options.lineEnding && options.lineEnding === '\n') {
				eolPreference = EditorCommon.EndOfLinePreference.LF;
			} else if (options  && options.lineEnding && options.lineEnding === '\r\n') {
				eolPreference = EditorCommon.EndOfLinePreference.CRLF;
			}
			return this.model.getValue(eolPreference, preserveBOM);
		}
		return '';
	}

	public setValue(newValue:string): void {
		if (this.model) {
			this.model.setValue(newValue);
		}
	}

	public getView(): EditorBrowser.IView {
		return this._view;
	}

	public getModel(): EditorCommon.IModel {
		return this.model;
	}

	public setModel(model:EditorCommon.IModel = null): void {
		if (this.model === model) {
			// Current model is the new model
			return;
		}

		var timerEvent = Timer.start(Timer.Topic.EDITOR, 'CodeEditor.setModel');

		var detachedModel = this._detachModel();
		this._attachModel(model);

		var oldModelUrl: string = null;
		var newModelUrl: string = null;

		if (detachedModel) {
			oldModelUrl = detachedModel.getAssociatedResource().toString();
		}
		if (model) {
			newModelUrl = model.getAssociatedResource().toString();
		}
		var e: EditorCommon.IModelChangedEvent = {
			oldModelUrl: oldModelUrl,
			newModelUrl: newModelUrl
		};

		timerEvent.stop();

		this.emit(EditorCommon.EventType.ModelChanged, e);
		this._postDetachModelCleanup(detachedModel);
	}

	public getDomNode(): HTMLElement {
		if (!this.hasView) {
			return null;
		}
		return this._view.domNode;
	}

	public getCenteredRangeInViewport(): EditorCommon.IEditorRange {
		if (!this.hasView) {
			return null;
		}
		return this._view.getCenteredRangeInViewport();
	}

	public getVisibleColumnFromPosition(rawPosition:EditorCommon.IPosition): number {
		if (!this.model) {
			return rawPosition.column;
		}

		var position = this.model.validatePosition(rawPosition);

		return CursorMoveHelper.CursorMoveHelper.visibleColumnFromColumn(this.model, position.lineNumber, position.column, this._configuration.getIndentationOptions().tabSize) + 1;
	}

	public getPosition(): EditorCommon.IEditorPosition {
		if (!this.cursor) {
			return null;
		}
		return this.cursor.getPosition().clone();
	}

	public setPosition(position:EditorCommon.IPosition, reveal:boolean = false, revealVerticalInCenter:boolean = false, revealHorizontal:boolean = false): void {
		if (!this.cursor) {
			return;
		}
		if (!Position.isIPosition(position)) {
			throw new Error('Invalid arguments');
		}
		this.cursor.setSelections('api', [{
			selectionStartLineNumber: position.lineNumber,
			selectionStartColumn: position.column,
			positionLineNumber: position.lineNumber,
			positionColumn: position.column
		}]);
		if (reveal) {
			this.revealPosition(position, revealVerticalInCenter, revealHorizontal);
		}
	}

	private _sendRevealRange(range: EditorCommon.IRange, verticalType: EditorCommon.VerticalRevealType, revealHorizontal: boolean): void {
		if (!this.model || !this.cursor) {
			return;
		}
		if (!Range.isIRange(range)) {
			throw new Error('Invalid arguments');
		}
		var validatedRange = this.model.validateRange(range);

		var revealRangeEvent: EditorCommon.ICursorRevealRangeEvent = {
			range: validatedRange,
			viewRange: null,
			verticalType: verticalType,
			revealHorizontal: revealHorizontal
		};
		this.cursor.emit(EditorCommon.EventType.CursorRevealRange, revealRangeEvent);
	}

	public revealLine(lineNumber: number): void {
		this._sendRevealRange({
			startLineNumber: lineNumber,
			startColumn: 1,
			endLineNumber: lineNumber,
			endColumn: 1
		}, EditorCommon.VerticalRevealType.Simple, false);
	}

	public revealLineInCenter(lineNumber: number): void {
		this._sendRevealRange({
			startLineNumber: lineNumber,
			startColumn: 1,
			endLineNumber: lineNumber,
			endColumn: 1
		}, EditorCommon.VerticalRevealType.Center, false);
	}

	public revealLineInCenterIfOutsideViewport(lineNumber: number): void {
		this._sendRevealRange({
			startLineNumber: lineNumber,
			startColumn: 1,
			endLineNumber: lineNumber,
			endColumn: 1
		}, EditorCommon.VerticalRevealType.CenterIfOutsideViewport, false);
	}

	public revealPosition(position: EditorCommon.IPosition, revealVerticalInCenter:boolean=false, revealHorizontal:boolean=false): void {
		if (!Position.isIPosition(position)) {
			throw new Error('Invalid arguments');
		}
		this._sendRevealRange({
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		}, revealVerticalInCenter ? EditorCommon.VerticalRevealType.Center : EditorCommon.VerticalRevealType.Simple, revealHorizontal);
	}

	public revealPositionInCenter(position: EditorCommon.IPosition): void {
		if (!Position.isIPosition(position)) {
			throw new Error('Invalid arguments');
		}
		this._sendRevealRange({
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		}, EditorCommon.VerticalRevealType.Center, true);
	}

	public revealPositionInCenterIfOutsideViewport(position: EditorCommon.IPosition): void {
		if (!Position.isIPosition(position)) {
			throw new Error('Invalid arguments');
		}
		this._sendRevealRange({
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		}, EditorCommon.VerticalRevealType.CenterIfOutsideViewport, true);
	}

	public getSelection(): EditorCommon.IEditorSelection {
		if (!this.cursor) {
			return null;
		}
		return this.cursor.getSelection().clone();
	}

	public getSelections(): EditorCommon.IEditorSelection[] {
		if (!this.cursor) {
			return null;
		}
		var selections = this.cursor.getSelections();
		var result:EditorCommon.IEditorSelection[] = [];
		for (var i = 0, len = selections.length; i < len; i++) {
			result[i] = selections[i].clone();
		}
		return result;
	}

	public setSelection(range:EditorCommon.IRange, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void;
	public setSelection(editorRange:EditorCommon.IEditorRange, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void;
	public setSelection(selection:EditorCommon.ISelection, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void;
	public setSelection(editorSelection:EditorCommon.IEditorSelection, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void;
	public setSelection(something:any, reveal:boolean = false, revealVerticalInCenter:boolean = false, revealHorizontal:boolean = false): void {
		var isSelection = Selection.isISelection(something);
		var isRange = Range.isIRange(something);

		if (!isSelection && !isRange) {
			throw new Error('Invalid arguments');
		}

		if (isSelection) {
			this._setSelectionImpl(<EditorCommon.ISelection>something, reveal, revealVerticalInCenter, revealHorizontal);
		} else if (isRange) {
			// act as if it was an IRange
			var selection:EditorCommon.ISelection = {
				selectionStartLineNumber: something.startLineNumber,
				selectionStartColumn: something.startColumn,
				positionLineNumber: something.endLineNumber,
				positionColumn: something.endColumn
			};
			this._setSelectionImpl(selection, reveal, revealVerticalInCenter, revealHorizontal);
		}
	}

	private _setSelectionImpl(sel:EditorCommon.ISelection, reveal:boolean, revealVerticalInCenter:boolean, revealHorizontal:boolean): void {
		if (!this.cursor) {
			return;
		}
		var selection = Selection.createSelection(sel.selectionStartLineNumber, sel.selectionStartColumn, sel.positionLineNumber, sel.positionColumn);
		this.cursor.setSelections('api', [selection]);
		if (reveal) {
			this.revealRange(selection, revealVerticalInCenter, revealHorizontal);
		}
	}

	public revealLines(startLineNumber: number, endLineNumber: number): void {
		this._sendRevealRange({
			startLineNumber: startLineNumber,
			startColumn: 1,
			endLineNumber: endLineNumber,
			endColumn: 1
		}, EditorCommon.VerticalRevealType.Simple, false);
	}

	public revealLinesInCenter(startLineNumber: number, endLineNumber: number): void {
		this._sendRevealRange({
			startLineNumber: startLineNumber,
			startColumn: 1,
			endLineNumber: endLineNumber,
			endColumn: 1
		}, EditorCommon.VerticalRevealType.Center, false);
	}

	public revealLinesInCenterIfOutsideViewport(startLineNumber: number, endLineNumber: number): void {
		this._sendRevealRange({
			startLineNumber: startLineNumber,
			startColumn: 1,
			endLineNumber: endLineNumber,
			endColumn: 1
		}, EditorCommon.VerticalRevealType.CenterIfOutsideViewport, false);
	}

	public revealRange(range: EditorCommon.IRange, revealVerticalInCenter:boolean = false, revealHorizontal:boolean = false): void {
		this._sendRevealRange(range, revealVerticalInCenter ? EditorCommon.VerticalRevealType.Center : EditorCommon.VerticalRevealType.Simple, revealHorizontal);
	}

	public revealRangeInCenter(range: EditorCommon.IRange): void {
		this._sendRevealRange(range, EditorCommon.VerticalRevealType.Center, true);
	}

	public revealRangeInCenterIfOutsideViewport(range: EditorCommon.IRange): void {
		this._sendRevealRange(range, EditorCommon.VerticalRevealType.CenterIfOutsideViewport, true);
	}

	public setSelections(ranges: EditorCommon.ISelection[]): void {
		if (!this.cursor) {
			return;
		}
		if (!ranges || ranges.length === 0) {
			throw new Error('Invalid arguments');
		}
		for (var i = 0, len = ranges.length; i < len; i++) {
			if (!Selection.isISelection(ranges[i])) {
				throw new Error('Invalid arguments');
			}
		}
		this.cursor.setSelections('api', ranges);
	}

	public setScrollTop(newScrollTop:number): void {
		if (!this.hasView) {
			return;
		}
		if (typeof newScrollTop !== 'number') {
			throw new Error('Invalid arguments');
		}
		this._view.getCodeEditorHelper().setScrollTop(newScrollTop);
	}

	public getScrollTop(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollTop();
	}

	public delegateVerticalScrollbarMouseDown(browserEvent:MouseEvent): void {
		if (!this.hasView) {
			return;
		}
		this._view.getCodeEditorHelper().delegateVerticalScrollbarMouseDown(browserEvent);
	}

	public setScrollLeft(newScrollLeft:number): void {
		if (!this.hasView) {
			return;
		}
		if (typeof newScrollLeft !== 'number') {
			throw new Error('Invalid arguments');
		}
		this._view.getCodeEditorHelper().setScrollLeft(newScrollLeft);
	}

	public getScrollLeft(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollLeft();
	}

	public getScrollWidth(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollWidth();
	}

	public getScrollHeight(): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getScrollHeight();
	}

	public saveViewState(): EditorCommon.ICodeEditorViewState {
		if (!this.cursor || !this.hasView) {
			return null;
		}
		var cursorState = this.cursor.saveState();
		var viewState = this._view.saveState();
		return {
			cursorState: cursorState,
			viewState: viewState
		};
	}

	public restoreViewState(state:EditorCommon.IEditorViewState): void {
		if (!this.cursor || !this.hasView) {
			return;
		}
		var s = <any>state;
		if (s && s.cursorState && s.viewState) {
			var codeEditorState = <EditorCommon.ICodeEditorViewState>s;
			var cursorState = <any>codeEditorState.cursorState;
			if (Array.isArray(cursorState)) {
				this.cursor.restoreState(<EditorCommon.ICursorState[]>cursorState);
			} else {
				// Backwards compatibility
				this.cursor.restoreState([<EditorCommon.ICursorState>cursorState]);
			}
			this._view.restoreState(codeEditorState.viewState);
		}
	}

	public layout(dimension?:EditorCommon.IDimension): void {
		this._configuration.observeReferenceElement(dimension);
	}

	public onVisible(): void {
	}

	public onHide(): void {
	}

	public focus(): void {
		if (!this.hasView) {
			return;
		}
		this._view.focus();
	}

	public beginForcedWidgetFocus(): void {
		this.forcedWidgetFocusCount++;
	}

	public endForcedWidgetFocus(): void {
		this.forcedWidgetFocusCount--;
	}

	public isFocused(): boolean {
		return this.hasView && this._view.isFocused();
	}

	public getContribution(id: string): EditorCommon.IEditorContribution {
		return this.contributions[id] || null;
	}

	public addAction(descriptor:EditorCommon.IActionDescriptor): void {
		var action = this._instantiationService.createInstance(DynamicEditorAction, descriptor, this);
		this.contributions[action.getId()] = action;
	}

	public getActions(): Actions.IAction[] {
		var result: Actions.IAction[] = [];
		var id: string;
		for (id in this.contributions) {
			if (this.contributions.hasOwnProperty(id)) {
				var contribution = <any>this.contributions[id];
				// contribution instanceof IAction
				if (Actions.isAction(contribution)) {
					result.push(<Actions.IAction>contribution);
				}
			}
		}
		return result;
	}

	public getAction(id:string): Actions.IAction {
		var contribution = <any>this.contributions[id];
		if (contribution) {
			// contribution instanceof IAction
			if (Actions.isAction(contribution)) {
				return <Actions.IAction>contribution;
			}
		}
		return null;
	}

	public trigger(source:string, handlerId:string, payload:any): void {
		var candidate = this.getAction(handlerId);
		if(candidate !== null) {
			if (candidate.enabled) {
				this._telemetryService.publicLog('editorActionInvoked', {name: candidate.label} );
				TPromise.as(candidate.run()).done(null, Errors.onUnexpectedError);
			}
		} else {
			// forward to handler dispatcher
			var r = this._configuration.handlerDispatcher.trigger(source, handlerId, payload);

			if (!r) {
//				console.warn('Returning false from ' + handlerId + ' wont do anything special...');
			}
		}
	}

	public executeCommand(source: string, command: EditorCommon.ICommand): boolean {
		// forward to handler dispatcher
		return this._configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.ExecuteCommand, command);
	}

	public executeEdits(source: string, edits: EditorCommon.IIdentifiedSingleEditOperation[]): boolean {
		if (!this.cursor) {
			// no view, no cursor
			return false;
		}
		if (this._configuration.editor.readOnly) {
			// read only editor => sorry!
			return false;
		}
		this.model.pushEditOperations(this.cursor.getSelections(), edits, () => {
			return this.cursor.getSelections();
		});
		return true;
	}

	public executeCommands(source: string, commands: EditorCommon.ICommand[]): boolean {
		// forward to handler dispatcher
		return this._configuration.handlerDispatcher.trigger(source, EditorCommon.Handler.ExecuteCommands, commands);
	}

	public addContentWidget(widget: EditorBrowser.IContentWidget): void {
		var widgetData: EditorBrowser.IContentWidgetData = {
			widget: widget,
			position: widget.getPosition()
		};

		if (this.contentWidgets.hasOwnProperty(widget.getId())) {
			console.warn('Overwriting a content widget with the same id.');
		}

		this.contentWidgets[widget.getId()] = widgetData;

		if (this.hasView) {
			this._view.addContentWidget(widgetData);
		}
	}

	public layoutContentWidget(widget: EditorBrowser.IContentWidget): void {
		var widgetId = widget.getId();
		if (this.contentWidgets.hasOwnProperty(widgetId)) {
			var widgetData = this.contentWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this.hasView) {
				this._view.layoutContentWidget(widgetData);
			}
		}
	}

	public removeContentWidget(widget: EditorBrowser.IContentWidget): void {
		var widgetId = widget.getId();
		if (this.contentWidgets.hasOwnProperty(widgetId)) {
			var widgetData = this.contentWidgets[widgetId];
			delete this.contentWidgets[widgetId];
			if (this.hasView) {
				this._view.removeContentWidget(widgetData);
			}
		}
	}

	public addOverlayWidget(widget: EditorBrowser.IOverlayWidget): void {
		var widgetData: EditorBrowser.IOverlayWidgetData = {
			widget: widget,
			position: widget.getPosition()
		};

		if (this.overlayWidgets.hasOwnProperty(widget.getId())) {
			console.warn('Overwriting an overlay widget with the same id.');
		}

		this.overlayWidgets[widget.getId()] = widgetData;

		if (this.hasView) {
			this._view.addOverlayWidget(widgetData);
		}
	}

	public layoutOverlayWidget(widget: EditorBrowser.IOverlayWidget): void {
		var widgetId = widget.getId();
		if (this.overlayWidgets.hasOwnProperty(widgetId)) {
			var widgetData = this.overlayWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this.hasView) {
				this._view.layoutOverlayWidget(widgetData);
			}
		}
	}

	public removeOverlayWidget(widget: EditorBrowser.IOverlayWidget): void {
		var widgetId = widget.getId();
		if (this.overlayWidgets.hasOwnProperty(widgetId)) {
			var widgetData = this.overlayWidgets[widgetId];
			delete this.overlayWidgets[widgetId];
			if (this.hasView) {
				this._view.removeOverlayWidget(widgetData);
			}
		}
	}

	public changeDecorations(callback:(changeAccessor:EditorCommon.IModelDecorationsChangeAccessor)=>any): any {
		if (!this.model) {
//			console.warn('Cannot change decorations on editor that is not attached to a model');
			// callback will not be called
			return null;
		}
		return this.model.changeDecorations(callback, this.id);
	}

	public getLineDecorations(lineNumber: number): EditorCommon.IModelDecoration[] {
		if (!this.model) {
			return null;
		}
		return this.model.getLineDecorations(lineNumber, this.id, this._configuration.editor.readOnly);
	}

	public deltaDecorations(oldDecorations:string[], newDecorations:EditorCommon.IModelDeltaDecoration[]): string[] {
		if (!this.model) {
			return [];
		}

		if (oldDecorations.length === 0 && newDecorations.length === 0) {
			return oldDecorations;
		}

		return this.model.deltaDecorations(oldDecorations, newDecorations, this.id);
	}

	public setDecorations(decorationTypeKey: string, ranges:EditorCommon.IRangeWithMessage[]): void {
		var opts = this._codeEditorService.resolveDecorationType(decorationTypeKey);
		var oldDecorationIds = this._decorationTypeKeysToIds[decorationTypeKey] || [];
		this._decorationTypeKeysToIds[decorationTypeKey] = this.deltaDecorations(oldDecorationIds, ranges.map((r) : EditorCommon.IModelDeltaDecoration => {
			let decOpts: EditorCommon.IModelDecorationOptions;
			if (r.hoverMessage) {
				decOpts = Objects.clone(opts);
				decOpts.htmlMessage = r.hoverMessage;
			} else {
				decOpts = opts;
			}
			return {
				range: r.range,
				options: decOpts
			};
		}));
	}

	public removeDecorations(decorationTypeKey: string): void {
		if (this._decorationTypeKeysToIds.hasOwnProperty(decorationTypeKey)) {
			this.deltaDecorations(this._decorationTypeKeysToIds[decorationTypeKey], []);
			delete this._decorationTypeKeysToIds[decorationTypeKey];
		}
	}

	public changeViewZones(callback:(accessor:EditorBrowser.IViewZoneChangeAccessor)=>void): void {
		if (!this.hasView) {
//			console.warn('Cannot change view zones on editor that is not attached to a model, since there is no view.');
			return;
		}
		var hasChanges = this._view.change(callback);
		if (hasChanges) {
			this.emit(EditorCommon.EventType.ViewZonesChanged);
		}
	}

	public getWhitespaces(): EditorCommon.IEditorWhitespace[] {
		if (!this.hasView) {
			return [];
		}
		return this._view.getWhitespaces();
	}

	public addTypingListener(character:string, callback: () => void): EventEmitter.ListenerUnbind {
		if (!this.cursor) {
			return () => {
				// no-op
			};
		}
		this.cursor.addTypingListener(character, callback);
		return () => {
			if (this.cursor) {
				this.cursor.removeTypingListener(character, callback);
			}
		};
	}

	public getTopForLineNumber(lineNumber: number): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getVerticalOffsetForPosition(lineNumber, 1);
	}

	public getTopForPosition(lineNumber: number, column: number): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getVerticalOffsetForPosition(lineNumber, column);
	}

	public getScrolledVisiblePosition(rawPosition:EditorCommon.IPosition): { top:number; left:number; height:number; } {
		if (!this.hasView) {
			return null;
		}

		var position = this.model.validatePosition(rawPosition);
		var helper = this._view.getCodeEditorHelper();
		var layoutInfo = this._configuration.editor.layoutInfo;

		var top = helper.getVerticalOffsetForPosition(position.lineNumber, position.column) - helper.getScrollTop();
		var left = helper.getOffsetForColumn(position.lineNumber, position.column) + layoutInfo.glyphMarginWidth + layoutInfo.lineNumbersWidth + layoutInfo.decorationsWidth - helper.getScrollLeft();

		return {
			top: top,
			left: left,
			height: this._configuration.editor.lineHeight
		};
	}

	public getOffsetForColumn(lineNumber:number, column:number): number {
		if (!this.hasView) {
			return -1;
		}
		return this._view.getCodeEditorHelper().getOffsetForColumn(lineNumber, column);
	}

	public getLayoutInfo(): EditorCommon.IEditorLayoutInfo {
		return this._configuration.editor.layoutInfo;
	}

	_attachModel(model:EditorCommon.IModel): void {
		this.model = model ? model : null;
		this.listenersToRemove = [];
		this._view = null;
		this.viewModel = null;
		this.cursor = null;

		if (this.model) {
			this._configuration.resetIndentationOptions();
			this.domElement.setAttribute('data-mode-id', this.model.getMode().getId());
			this._langIdKey.set(this.model.getMode().getId());
			this.model.setStopLineTokenizationAfter(this._configuration.editor.stopLineTokenizationAfter);
			this._configuration.setIsDominatedByLongLines(this.model.isDominatedByLongLines(this._configuration.editor.longLineBoundary));

			this.model.onBeforeAttached();

			var hardWrappingLineMapperFactory = new CharacterHardWrappingLineMapper.CharacterHardWrappingLineMapperFactory(
				this._configuration.editor.wordWrapBreakBeforeCharacters,
				this._configuration.editor.wordWrapBreakAfterCharacters,
				this._configuration.editor.wordWrapBreakObtrusiveCharacters
			);

			var linesCollection = new SplitLinesCollection.SplitLinesCollection(
				this.model,
				hardWrappingLineMapperFactory,
				this._configuration.getIndentationOptions().tabSize,
				this._configuration.editor.wrappingInfo.wrappingColumn,
				this._configuration.editor.typicalFullwidthCharacterWidth / this._configuration.editor.typicalHalfwidthCharacterWidth,
				EditorCommon.wrappingIndentFromString(this._configuration.editor.wrappingIndent)
			);

			this.viewModel = new ViewModel.ViewModel(
				linesCollection,
				this.id,
				this._configuration,
				this.model,
				() => {
					if (this._view) {
						return this._view.getCenteredRangeInViewport();
					}
					return null;
				}
			);

			var viewModelHelper:OneCursor.IViewModelHelper = {
				viewModel: this.viewModel,
				convertModelPositionToViewPosition: (lineNumber:number, column:number) => {
					return this.viewModel.convertModelPositionToViewPosition(lineNumber, column);
				},
				convertModelRangeToViewRange: (modelRange:EditorCommon.IEditorRange) => {
					return this.viewModel.convertModelRangeToViewRange(modelRange);
				},
				convertViewToModelPosition: (lineNumber:number, column:number) => {
					return this.viewModel.convertViewPositionToModelPosition(lineNumber, column);
				},
				validateViewPosition: (viewLineNumber:number, viewColumn:number, modelPosition:EditorCommon.IEditorPosition) => {
					return this.viewModel.validateViewPosition(viewLineNumber, viewColumn, modelPosition);
				},
				validateViewRange: (viewStartLineNumber:number, viewStartColumn:number, viewEndLineNumber:number, viewEndColumn:number, modelRange:EditorCommon.IEditorRange) => {
					return this.viewModel.validateViewRange(viewStartLineNumber, viewStartColumn, viewEndLineNumber, viewEndColumn, modelRange);
				}
			};

			this.cursor = new Cursor.Cursor(
				this.id,
				this._configuration,
				this.model,
				viewModelHelper,
				Browser.enableEmptySelectionClipboard
			);

			this.viewModel.addEventSource(this.cursor);

			this._view = new ViewImpl.View(
				this.id,
				this._configuration,
				this.viewModel,
				this._keybindingService
			);

			this.listenersToRemove.push(this._view.getInternalEventBus().addBulkListener((events) => {
				for (var i = 0, len = events.length; i < len; i++) {
					var eventType = events[i].getType();
					var e = events[i].getData();

					switch (eventType) {
						case EditorCommon.EventType.ViewFocusGained:
							this.emit(EditorCommon.EventType.EditorTextFocus);
							// In IE, the focus is not synchronous, so we give it a little help
							this.emit(EditorCommon.EventType.EditorFocus, {});
							break;

						case 'scroll':
							this.emit('scroll', e);
							break;

						case 'scrollSize':
							this.emit('scrollSize', e);
							break;

						case EditorCommon.EventType.ViewFocusLost:
							this.emit(EditorCommon.EventType.EditorTextBlur);
							break;

						case EditorCommon.EventType.ContextMenu:
							this.emit(EditorCommon.EventType.ContextMenu, e);
							break;

						case EditorCommon.EventType.MouseDown:
							this.emit(EditorCommon.EventType.MouseDown, e);
							break;

						case EditorCommon.EventType.MouseUp:
							this.emit(EditorCommon.EventType.MouseUp, e);
							break;

						case EditorCommon.EventType.KeyUp:
							this.emit(EditorCommon.EventType.KeyUp, e);
							break;

						case EditorCommon.EventType.MouseMove:
							this.emit(EditorCommon.EventType.MouseMove, e);
							break;

						case EditorCommon.EventType.MouseLeave:
							this.emit(EditorCommon.EventType.MouseLeave, e);
							break;

						case EditorCommon.EventType.KeyDown:
							this.emit(EditorCommon.EventType.KeyDown, e);
							break;

						case EditorCommon.EventType.ViewLayoutChanged:
							this.emit(EditorCommon.EventType.EditorLayout, e);
							break;

						default:
//							console.warn("Unhandled view event: ", e);
					}
				}
			}));

			this.listenersToRemove.push(this.model.addBulkListener((events) => {
				for (var i = 0, len = events.length; i < len; i++) {
					var eventType = events[i].getType();
					var e = events[i].getData();

					switch (eventType) {
						case EditorCommon.EventType.ModelDecorationsChanged:
							this.emit(EditorCommon.EventType.ModelDecorationsChanged, e);
							break;

						case EditorCommon.EventType.ModelModeChanged:
							this.domElement.setAttribute('data-mode-id', this.model.getMode().getId());
							this._langIdKey.set(this.model.getMode().getId());
							this.emit(EditorCommon.EventType.ModelModeChanged, e);
							break;

						case EditorCommon.EventType.ModelModeSupportChanged:
							this.emit(EditorCommon.EventType.ModelModeSupportChanged, e);
							break;

						case EditorCommon.EventType.ModelContentChanged:
							// TODO@Alex
							this.emit(EditorCommon.EventType.ModelContentChanged, e);
							this.emit('change', {});
							break;

						case EditorCommon.EventType.ModelDispose:
							// Someone might destroy the model from under the editor, so prevent any exceptions by setting a null model
							this.setModel(null);
							break;

						default:
//							console.warn("Unhandled model event: ", e);
					}
				}
			}));

			var _hasNonEmptySelection = (e: EditorCommon.ICursorSelectionChangedEvent) => {
				var allSelections = [e.selection].concat(e.secondarySelections);
				return allSelections.some(s => !s.isEmpty());
			};

			this.listenersToRemove.push(this.cursor.addBulkListener((events) => {
				var updateHasMultipleCursors = false,
					hasMultipleCursors = false,
					updateHasNonEmptySelection = false,
					hasNonEmptySelection = false;

				for (var i = 0, len = events.length; i < len; i++) {
					var eventType = events[i].getType();
					var e = events[i].getData();

					switch (eventType) {
						case EditorCommon.EventType.CursorPositionChanged:
							var cursorPositionChangedEvent = <EditorCommon.ICursorPositionChangedEvent>e;
							updateHasMultipleCursors = true;
							hasMultipleCursors = (cursorPositionChangedEvent.secondaryPositions.length > 0);
							this.emit(EditorCommon.EventType.CursorPositionChanged, e);
							break;

						case EditorCommon.EventType.CursorSelectionChanged:
							var cursorSelectionChangedEvent = <EditorCommon.ICursorSelectionChangedEvent>e;
							updateHasMultipleCursors = true;
							hasMultipleCursors = (cursorSelectionChangedEvent.secondarySelections.length > 0);
							updateHasNonEmptySelection = true;
							hasNonEmptySelection = _hasNonEmptySelection(cursorSelectionChangedEvent);
							this.emit(EditorCommon.EventType.CursorSelectionChanged, e);
							break;

						default:
//							console.warn("Unhandled cursor event: ", e);
					}
				}

				if (updateHasMultipleCursors) {
					if (hasMultipleCursors) {
						this._hasMultipleSelectionsKey.set(true);
					} else {
						this._hasMultipleSelectionsKey.reset();
					}
				}
				if (updateHasNonEmptySelection) {
					if (hasNonEmptySelection) {
						this._hasNonEmptySelectionKey.set(true);
					} else {
						this._hasNonEmptySelectionKey.reset();
					}
				}
			}));

			this.domElement.appendChild(this._view.domNode);

			this._view.renderOnce(() => {

				var widgetId:string;
				for (widgetId in this.contentWidgets) {
					if (this.contentWidgets.hasOwnProperty(widgetId)) {
						this._view.addContentWidget(this.contentWidgets[widgetId]);
					}
				}

				for (widgetId in this.overlayWidgets) {
					if (this.overlayWidgets.hasOwnProperty(widgetId)) {
						this._view.addOverlayWidget(this.overlayWidgets[widgetId]);
					}
				}

				this._view.render();
				this.hasView = true;
			});
		} else {
			this.hasView = false;
		}
	}

	_postDetachModelCleanup(detachedModel:EditorCommon.IModel): void {
		if (detachedModel) {
			this._decorationTypeKeysToIds = {};
			detachedModel.removeAllDecorationsWithOwnerId(this.id);
		}
	}

	private _detachModel(): EditorCommon.IModel {
		if (this.model) {
			this.model.onBeforeDetached();
		}

		this.hasView = false;

		this.listenersToRemove.forEach((element) => {
			element();
		});
		this.listenersToRemove = [];

		if (this.cursor) {
			this.cursor.dispose();
			this.cursor = null;
		}

		var removeDomNode:HTMLElement = null;

		if (this._view) {
			this._view.dispose();
			removeDomNode = this._view.domNode;
			this._view = null;
		}

		if (this.viewModel) {
			this.viewModel.dispose();
			this.viewModel = null;
		}

		var result = this.model;
		this.model = null;

		if (removeDomNode) {
			this.domElement.removeChild(removeDomNode);
		}

		this.domElement.removeAttribute('data-mode-id');

		return result;
	}
}

class OverlayWidget2 implements EditorBrowser.IOverlayWidget {

	private _id: string;
	private _position: EditorBrowser.IOverlayWidgetPosition;
	private _domNode: HTMLElement;

	constructor(id:string, position:EditorBrowser.IOverlayWidgetPosition) {
		this._id = id;
		this._position = position;
		this._domNode = document.createElement('div');
		this._domNode.className = this._id.replace(/\./g, '-').replace(/[^a-z0-9\-]/,'');
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): EditorBrowser.IOverlayWidgetPosition {
		return this._position;
	}
}

export enum EditCursorState {
	EndOfLastEditOperation = 0
}

export class CommandRunner implements EditorCommon.ICommand {

	private _ops: EditorCommon.ISingleEditOperation[];
	private _editCursorState: EditCursorState;

	constructor(ops: EditorCommon.ISingleEditOperation[], editCursorState: EditCursorState) {
		this._ops = ops;
		this._editCursorState = editCursorState;
	}

	public getEditOperations(model: EditorCommon.ITokenizedModel, builder: EditorCommon.IEditOperationBuilder): void {
		if (this._ops.length === 0) {
			return;
		}

		// Sort them in ascending order by range starts
		this._ops.sort((o1, o2) => {
			return Range.compareRangesUsingStarts(o1.range, o2.range);
		});

		// Merge operations that touch each other
		var resultOps:EditorCommon.ISingleEditOperation[] = [];
		var previousOp = this._ops[0];
		for (var i = 1; i < this._ops.length; i++) {
			if (previousOp.range.endLineNumber === this._ops[i].range.startLineNumber && previousOp.range.endColumn === this._ops[i].range.startColumn) {
				// These operations are one after another and can be merged
				previousOp.range = Range.plusRange(previousOp.range, this._ops[i].range);
				previousOp.text = previousOp.text + this._ops[i].text;
			} else {
				resultOps.push(previousOp);
				previousOp = this._ops[i];
			}
		}
		resultOps.push(previousOp);

		for (var i = 0; i < resultOps.length; i++) {
			builder.addEditOperation(Range.lift(resultOps[i].range), resultOps[i].text);
		}
	}

	public computeCursorState(model: EditorCommon.ITokenizedModel, helper: EditorCommon.ICursorStateComputerData): EditorCommon.IEditorSelection {
		var inverseEditOperations = helper.getInverseEditOperations();
		var srcRange = inverseEditOperations[inverseEditOperations.length - 1].range;
		return Selection.createSelection(
			srcRange.endLineNumber,
			srcRange.endColumn,
			srcRange.endLineNumber,
			srcRange.endColumn
		);
	}
}
