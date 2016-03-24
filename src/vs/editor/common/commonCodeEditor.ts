/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {IAction, IActionProvider, isAction} from 'vs/base/common/actions';
import {onUnexpectedError} from 'vs/base/common/errors';
import {EventEmitter, IEventEmitter, ListenerUnbind} from 'vs/base/common/eventEmitter';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import * as timer from 'vs/base/common/timer';
import {TPromise} from 'vs/base/common/winjs.base';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingContextKey, IKeybindingScopeLocation, IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {CommonEditorConfiguration} from 'vs/editor/common/config/commonEditorConfig';
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';
import {Cursor} from 'vs/editor/common/controller/cursor';
import {CursorMoveHelper} from 'vs/editor/common/controller/cursorMoveHelper';
import {IViewModelHelper} from 'vs/editor/common/controller/oneCursor';
import {EditorState} from 'vs/editor/common/core/editorState';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import {DynamicEditorAction} from 'vs/editor/common/editorAction';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {CharacterHardWrappingLineMapperFactory} from 'vs/editor/common/viewModel/characterHardWrappingLineMapper';
import {SplitLinesCollection} from 'vs/editor/common/viewModel/splitLinesCollection';
import {ViewModel} from 'vs/editor/common/viewModel/viewModel';

var EDITOR_ID = 0;

export abstract class CommonCodeEditor extends EventEmitter implements IActionProvider, editorCommon.ICommonCodeEditor {

	protected domElement: IKeybindingScopeLocation;

	protected id:number;

	_lifetimeDispose: IDisposable[];
	_configuration:CommonEditorConfiguration;

	_telemetryService:ITelemetryService;

	protected contributions:{ [key:string]:editorCommon.IEditorContribution; };

	protected forcedWidgetFocusCount:number;

	// --- Members logically associated to a model
	protected model:editorCommon.IModel;
	protected listenersToRemove:ListenerUnbind[];
	protected hasView: boolean;

	protected viewModel:ViewModel;
	protected cursor:Cursor;

	protected _instantiationService: IInstantiationService;
	protected _keybindingService: IKeybindingService;

	private _decorationTypeKeysToIds: {[decorationTypeKey:string]:string[];};

	private _codeEditorService: ICodeEditorService;
	private _editorIdContextKey: IKeybindingContextKey<string>;
	protected _editorFocusContextKey: IKeybindingContextKey<boolean>;
	private _editorTabMovesFocusKey: IKeybindingContextKey<boolean>;
	private _hasMultipleSelectionsKey: IKeybindingContextKey<boolean>;
	private _hasNonEmptySelectionKey: IKeybindingContextKey<boolean>;
	private _langIdKey: IKeybindingContextKey<string>;

	constructor(
		domElement: IKeybindingScopeLocation,
		options:editorCommon.IEditorOptions,
		instantiationService: IInstantiationService,
		codeEditorService: ICodeEditorService,
		keybindingService: IKeybindingService,
		telemetryService: ITelemetryService
	) {
		super();

		this.domElement = domElement;

		this.id = (++EDITOR_ID);
		this._codeEditorService = codeEditorService;

		var timerEvent = timer.start(timer.Topic.EDITOR, 'CodeEditor.ctor');

		this._lifetimeDispose = [];

		this._keybindingService = keybindingService.createScoped(domElement);
		this._editorIdContextKey = this._keybindingService.createKey('editorId', this.getId());
		this._editorFocusContextKey = this._keybindingService.createKey(editorCommon.KEYBINDING_CONTEXT_EDITOR_FOCUS, undefined);
		this._editorTabMovesFocusKey = this._keybindingService.createKey(editorCommon.KEYBINDING_CONTEXT_EDITOR_TAB_MOVES_FOCUS, false);
		this._hasMultipleSelectionsKey = this._keybindingService.createKey(editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_MULTIPLE_SELECTIONS, false);
		this._hasNonEmptySelectionKey = this._keybindingService.createKey(editorCommon.KEYBINDING_CONTEXT_EDITOR_HAS_NON_EMPTY_SELECTION, false);
		this._langIdKey = this._keybindingService.createKey<string>(editorCommon.KEYBINDING_CONTEXT_EDITOR_LANGUAGE_ID, undefined);

		// listeners that are kept during the whole editor lifetime
		this._decorationTypeKeysToIds = {};

		options = options || {};
		if (typeof options.ariaLabel === 'undefined') {
			options.ariaLabel = DefaultConfig.editor.ariaLabel;
		}
		options.ariaLabel += this._ariaLabelAppendMessage();

		this._configuration = this._createConfiguration(options);
		if (this._configuration.editor.tabFocusMode) {
			this._editorTabMovesFocusKey.set(true);
		}
		this._lifetimeDispose.push(this._configuration.onDidChange((e) => this.emit(editorCommon.EventType.ConfigurationChanged, e)));

		this.forcedWidgetFocusCount = 0;

		this._telemetryService = telemetryService;
		this._instantiationService = instantiationService.createChild({
			keybindingService: this._keybindingService
		});

		this._attachModel(null);

		// Create editor contributions
		this.contributions = {};


		timerEvent.stop();

		this._codeEditorService.addCodeEditor(this);
	}

	protected abstract _createConfiguration(options:editorCommon.ICodeEditorWidgetCreationOptions): CommonEditorConfiguration;

	public getId(): string {
		return this.getEditorType() + ':' + this.id;
	}

	public getEditorType(): string {
		return editorCommon.EditorType.ICodeEditor;
	}

	public destroy(): void {
		this.dispose();
	}

	public dispose(): void {
		this._codeEditorService.removeCodeEditor(this);
		this._lifetimeDispose = disposeAll(this._lifetimeDispose);

		var contributionId:string;
		for (contributionId in this.contributions) {
			if (this.contributions.hasOwnProperty(contributionId)) {
				this.contributions[contributionId].dispose();
			}
		}
		this.contributions = {};

		this._postDetachModelCleanup(this._detachModel());
		this._configuration.dispose();
		this._keybindingService.dispose();
		this.emit(editorCommon.EventType.Disposed, {});
		super.dispose();
	}

	public captureState(...flags:editorCommon.CodeEditorStateFlag[]): editorCommon.ICodeEditorState {
		return new EditorState(this, flags);
	}

	private _ariaLabelAppendMessage(): string {
		let keybindings = this._keybindingService.lookupKeybindings(editorCommon.SHOW_ACCESSIBILITY_HELP_ACTION_ID);
		if (keybindings.length > 0) {
			return nls.localize('showAccessibilityHelp', "Press {0} if you are using a screen reader.", this._keybindingService.getAriaLabelFor(keybindings[0]));
		}
		return '';
	}

	public updateOptions(newOptions:editorCommon.IEditorOptions): void {
		if (typeof newOptions.ariaLabel !== 'undefined') {
			newOptions.ariaLabel += this._ariaLabelAppendMessage();
		}
		this._configuration.updateOptions(newOptions);
		if (this._configuration.editor.tabFocusMode) {
			this._editorTabMovesFocusKey.set(true);
		} else {
			this._editorTabMovesFocusKey.reset();
		}
	}

	public getConfiguration(): editorCommon.IInternalEditorOptions {
		return this._configuration.editorClone;
	}

	public getRawConfiguration(): editorCommon.IEditorOptions {
		return this._configuration.getRawOptions();
	}

	public getValue(options:{ preserveBOM:boolean; lineEnding:string; }=null): string {
		if (this.model) {
			var preserveBOM:boolean = (options && options.preserveBOM) ? true : false;
			var eolPreference = editorCommon.EndOfLinePreference.TextDefined;
			if (options && options.lineEnding && options.lineEnding === '\n') {
				eolPreference = editorCommon.EndOfLinePreference.LF;
			} else if (options  && options.lineEnding && options.lineEnding === '\r\n') {
				eolPreference = editorCommon.EndOfLinePreference.CRLF;
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

	public getModel(): editorCommon.IModel {
		return this.model;
	}

	public setModel(model:editorCommon.IModel = null): void {
		if (this.model === model) {
			// Current model is the new model
			return;
		}

		var timerEvent = timer.start(timer.Topic.EDITOR, 'CodeEditor.setModel');

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
		var e: editorCommon.IModelChangedEvent = {
			oldModelUrl: oldModelUrl,
			newModelUrl: newModelUrl
		};

		timerEvent.stop();

		this.emit(editorCommon.EventType.ModelChanged, e);
		this._postDetachModelCleanup(detachedModel);
	}

	public abstract getCenteredRangeInViewport(): editorCommon.IEditorRange;

	public getVisibleColumnFromPosition(rawPosition:editorCommon.IPosition): number {
		if (!this.model) {
			return rawPosition.column;
		}

		let position = this.model.validatePosition(rawPosition);
		let tabSize = this.model.getOptions().tabSize;

		return CursorMoveHelper.visibleColumnFromColumn(this.model, position.lineNumber, position.column, tabSize) + 1;
	}

	public getPosition(): editorCommon.IEditorPosition {
		if (!this.cursor) {
			return null;
		}
		return this.cursor.getPosition().clone();
	}

	public setPosition(position:editorCommon.IPosition, reveal:boolean = false, revealVerticalInCenter:boolean = false, revealHorizontal:boolean = false): void {
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

	private _sendRevealRange(range: editorCommon.IRange, verticalType: editorCommon.VerticalRevealType, revealHorizontal: boolean): void {
		if (!this.model || !this.cursor) {
			return;
		}
		if (!Range.isIRange(range)) {
			throw new Error('Invalid arguments');
		}
		var validatedRange = this.model.validateRange(range);

		var revealRangeEvent: editorCommon.ICursorRevealRangeEvent = {
			range: validatedRange,
			viewRange: null,
			verticalType: verticalType,
			revealHorizontal: revealHorizontal
		};
		this.cursor.emit(editorCommon.EventType.CursorRevealRange, revealRangeEvent);
	}

	public revealLine(lineNumber: number): void {
		this._sendRevealRange({
			startLineNumber: lineNumber,
			startColumn: 1,
			endLineNumber: lineNumber,
			endColumn: 1
		}, editorCommon.VerticalRevealType.Simple, false);
	}

	public revealLineInCenter(lineNumber: number): void {
		this._sendRevealRange({
			startLineNumber: lineNumber,
			startColumn: 1,
			endLineNumber: lineNumber,
			endColumn: 1
		}, editorCommon.VerticalRevealType.Center, false);
	}

	public revealLineInCenterIfOutsideViewport(lineNumber: number): void {
		this._sendRevealRange({
			startLineNumber: lineNumber,
			startColumn: 1,
			endLineNumber: lineNumber,
			endColumn: 1
		}, editorCommon.VerticalRevealType.CenterIfOutsideViewport, false);
	}

	public revealPosition(position: editorCommon.IPosition, revealVerticalInCenter:boolean=false, revealHorizontal:boolean=false): void {
		if (!Position.isIPosition(position)) {
			throw new Error('Invalid arguments');
		}
		this._sendRevealRange({
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		}, revealVerticalInCenter ? editorCommon.VerticalRevealType.Center : editorCommon.VerticalRevealType.Simple, revealHorizontal);
	}

	public revealPositionInCenter(position: editorCommon.IPosition): void {
		if (!Position.isIPosition(position)) {
			throw new Error('Invalid arguments');
		}
		this._sendRevealRange({
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		}, editorCommon.VerticalRevealType.Center, true);
	}

	public revealPositionInCenterIfOutsideViewport(position: editorCommon.IPosition): void {
		if (!Position.isIPosition(position)) {
			throw new Error('Invalid arguments');
		}
		this._sendRevealRange({
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		}, editorCommon.VerticalRevealType.CenterIfOutsideViewport, true);
	}

	public getSelection(): editorCommon.IEditorSelection {
		if (!this.cursor) {
			return null;
		}
		return this.cursor.getSelection().clone();
	}

	public getSelections(): editorCommon.IEditorSelection[] {
		if (!this.cursor) {
			return null;
		}
		var selections = this.cursor.getSelections();
		var result:editorCommon.IEditorSelection[] = [];
		for (var i = 0, len = selections.length; i < len; i++) {
			result[i] = selections[i].clone();
		}
		return result;
	}

	public setSelection(range:editorCommon.IRange, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void;
	public setSelection(editorRange:editorCommon.IEditorRange, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void;
	public setSelection(selection:editorCommon.ISelection, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void;
	public setSelection(editorSelection:editorCommon.IEditorSelection, reveal?:boolean, revealVerticalInCenter?:boolean, revealHorizontal?:boolean): void;
	public setSelection(something:any, reveal:boolean = false, revealVerticalInCenter:boolean = false, revealHorizontal:boolean = false): void {
		var isSelection = Selection.isISelection(something);
		var isRange = Range.isIRange(something);

		if (!isSelection && !isRange) {
			throw new Error('Invalid arguments');
		}

		if (isSelection) {
			this._setSelectionImpl(<editorCommon.ISelection>something, reveal, revealVerticalInCenter, revealHorizontal);
		} else if (isRange) {
			// act as if it was an IRange
			var selection:editorCommon.ISelection = {
				selectionStartLineNumber: something.startLineNumber,
				selectionStartColumn: something.startColumn,
				positionLineNumber: something.endLineNumber,
				positionColumn: something.endColumn
			};
			this._setSelectionImpl(selection, reveal, revealVerticalInCenter, revealHorizontal);
		}
	}

	private _setSelectionImpl(sel:editorCommon.ISelection, reveal:boolean, revealVerticalInCenter:boolean, revealHorizontal:boolean): void {
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
		}, editorCommon.VerticalRevealType.Simple, false);
	}

	public revealLinesInCenter(startLineNumber: number, endLineNumber: number): void {
		this._sendRevealRange({
			startLineNumber: startLineNumber,
			startColumn: 1,
			endLineNumber: endLineNumber,
			endColumn: 1
		}, editorCommon.VerticalRevealType.Center, false);
	}

	public revealLinesInCenterIfOutsideViewport(startLineNumber: number, endLineNumber: number): void {
		this._sendRevealRange({
			startLineNumber: startLineNumber,
			startColumn: 1,
			endLineNumber: endLineNumber,
			endColumn: 1
		}, editorCommon.VerticalRevealType.CenterIfOutsideViewport, false);
	}

	public revealRange(range: editorCommon.IRange, revealVerticalInCenter:boolean = false, revealHorizontal:boolean = true): void {
		this._sendRevealRange(range, revealVerticalInCenter ? editorCommon.VerticalRevealType.Center : editorCommon.VerticalRevealType.Simple, revealHorizontal);
	}

	public revealRangeInCenter(range: editorCommon.IRange): void {
		this._sendRevealRange(range, editorCommon.VerticalRevealType.Center, true);
	}

	public revealRangeInCenterIfOutsideViewport(range: editorCommon.IRange): void {
		this._sendRevealRange(range, editorCommon.VerticalRevealType.CenterIfOutsideViewport, true);
	}

	public setSelections(ranges: editorCommon.ISelection[]): void {
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

	public abstract setScrollTop(newScrollTop:number): void;

	public abstract getScrollTop(): number;

	public abstract setScrollLeft(newScrollLeft:number): void;

	public abstract getScrollLeft(): number;

	public abstract getScrollWidth(): number;

	public abstract getScrollHeight(): number;

	public abstract saveViewState(): editorCommon.ICodeEditorViewState;

	public abstract restoreViewState(state:editorCommon.IEditorViewState): void;

	public onVisible(): void {
	}

	public onHide(): void {
	}

	public abstract layout(dimension?:editorCommon.IDimension): void;

	public abstract focus(): void;

	public beginForcedWidgetFocus(): void {
		this.forcedWidgetFocusCount++;
	}

	public endForcedWidgetFocus(): void {
		this.forcedWidgetFocusCount--;
	}

	public abstract isFocused(): boolean;

	public getContribution(id: string): editorCommon.IEditorContribution {
		return this.contributions[id] || null;
	}

	public addAction(descriptor:editorCommon.IActionDescriptor): void {
		var action = this._instantiationService.createInstance(DynamicEditorAction, descriptor, this);
		this.contributions[action.getId()] = action;
	}

	public getActions(): IAction[] {
		var result: IAction[] = [];
		var id: string;
		for (id in this.contributions) {
			if (this.contributions.hasOwnProperty(id)) {
				var contribution = <any>this.contributions[id];
				// contribution instanceof IAction
				if (isAction(contribution)) {
					result.push(<IAction>contribution);
				}
			}
		}
		return result;
	}

	public getAction(id:string): IAction {
		var contribution = <any>this.contributions[id];
		if (contribution) {
			// contribution instanceof IAction
			if (isAction(contribution)) {
				return <IAction>contribution;
			}
		}
		return null;
	}

	public trigger(source:string, handlerId:string, payload:any): void {
		var candidate = this.getAction(handlerId);
		if(candidate !== null) {
			if (candidate.enabled) {
				this._telemetryService.publicLog('editorActionInvoked', {name: candidate.label, id: candidate.id} );
				TPromise.as(candidate.run()).done(null, onUnexpectedError);
			}
		} else {
			// forward to handler dispatcher
			var r = this._configuration.handlerDispatcher.trigger(source, handlerId, payload);

			if (!r) {
//				console.warn('Returning false from ' + handlerId + ' wont do anything special...');
			}
		}
	}

	public executeCommand(source: string, command: editorCommon.ICommand): boolean {
		// forward to handler dispatcher
		return this._configuration.handlerDispatcher.trigger(source, editorCommon.Handler.ExecuteCommand, command);
	}

	public executeEdits(source: string, edits: editorCommon.IIdentifiedSingleEditOperation[]): boolean {
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

	public executeCommands(source: string, commands: editorCommon.ICommand[]): boolean {
		// forward to handler dispatcher
		return this._configuration.handlerDispatcher.trigger(source, editorCommon.Handler.ExecuteCommands, commands);
	}

	public changeDecorations(callback:(changeAccessor:editorCommon.IModelDecorationsChangeAccessor)=>any): any {
		if (!this.model) {
//			console.warn('Cannot change decorations on editor that is not attached to a model');
			// callback will not be called
			return null;
		}
		return this.model.changeDecorations(callback, this.id);
	}

	public getLineDecorations(lineNumber: number): editorCommon.IModelDecoration[] {
		if (!this.model) {
			return null;
		}
		return this.model.getLineDecorations(lineNumber, this.id, this._configuration.editor.readOnly);
	}

	public deltaDecorations(oldDecorations:string[], newDecorations:editorCommon.IModelDeltaDecoration[]): string[] {
		if (!this.model) {
			return [];
		}

		if (oldDecorations.length === 0 && newDecorations.length === 0) {
			return oldDecorations;
		}

		return this.model.deltaDecorations(oldDecorations, newDecorations, this.id);
	}

	public setDecorations(decorationTypeKey: string, ranges:editorCommon.IRangeWithMessage[]): void {
		var opts = this._codeEditorService.resolveDecorationType(decorationTypeKey);
		var oldDecorationIds = this._decorationTypeKeysToIds[decorationTypeKey] || [];
		this._decorationTypeKeysToIds[decorationTypeKey] = this.deltaDecorations(oldDecorationIds, ranges.map((r) : editorCommon.IModelDeltaDecoration => {
			let decOpts: editorCommon.IModelDecorationOptions;
			if (r.hoverMessage) {
				// TODO@Alex: avoid objects.clone
				decOpts = objects.clone(opts);
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

	public addTypingListener(character:string, callback: () => void): ListenerUnbind {
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

	public getLayoutInfo(): editorCommon.IEditorLayoutInfo {
		return this._configuration.editor.layoutInfo;
	}

	_attachModel(model:editorCommon.IModel): void {
		this.model = model ? model : null;
		this.listenersToRemove = [];
		this.viewModel = null;
		this.cursor = null;

		if (this.model) {
			this.domElement.setAttribute('data-mode-id', this.model.getMode().getId());
			this._langIdKey.set(this.model.getMode().getId());
			this.model.setStopLineTokenizationAfter(this._configuration.editor.stopLineTokenizationAfter);
			this._configuration.setIsDominatedByLongLines(this.model.isDominatedByLongLines(this._configuration.editor.longLineBoundary));

			this.model.onBeforeAttached();

			var hardWrappingLineMapperFactory = new CharacterHardWrappingLineMapperFactory(
				this._configuration.editor.wordWrapBreakBeforeCharacters,
				this._configuration.editor.wordWrapBreakAfterCharacters,
				this._configuration.editor.wordWrapBreakObtrusiveCharacters
			);

			var linesCollection = new SplitLinesCollection(
				this.model,
				hardWrappingLineMapperFactory,
				this.model.getOptions().tabSize,
				this._configuration.editor.wrappingInfo.wrappingColumn,
				this._configuration.editor.typicalFullwidthCharacterWidth / this._configuration.editor.typicalHalfwidthCharacterWidth,
				editorCommon.wrappingIndentFromString(this._configuration.editor.wrappingIndent)
			);

			this.viewModel = new ViewModel(
				linesCollection,
				this.id,
				this._configuration,
				this.model,
				() => this.getCenteredRangeInViewport()
			);

			var viewModelHelper:IViewModelHelper = {
				viewModel: this.viewModel,
				convertModelPositionToViewPosition: (lineNumber:number, column:number) => {
					return this.viewModel.convertModelPositionToViewPosition(lineNumber, column);
				},
				convertModelRangeToViewRange: (modelRange:editorCommon.IEditorRange) => {
					return this.viewModel.convertModelRangeToViewRange(modelRange);
				},
				convertViewToModelPosition: (lineNumber:number, column:number) => {
					return this.viewModel.convertViewPositionToModelPosition(lineNumber, column);
				},
				convertViewSelectionToModelSelection: (viewSelection:editorCommon.ISelection) => {
					return this.viewModel.convertViewSelectionToModelSelection(viewSelection);
				},
				validateViewPosition: (viewLineNumber:number, viewColumn:number, modelPosition:editorCommon.IEditorPosition) => {
					return this.viewModel.validateViewPosition(viewLineNumber, viewColumn, modelPosition);
				},
				validateViewRange: (viewStartLineNumber:number, viewStartColumn:number, viewEndLineNumber:number, viewEndColumn:number, modelRange:editorCommon.IEditorRange) => {
					return this.viewModel.validateViewRange(viewStartLineNumber, viewStartColumn, viewEndLineNumber, viewEndColumn, modelRange);
				}
			};

			this.cursor = new Cursor(
				this.id,
				this._configuration,
				this.model,
				viewModelHelper,
				this._enableEmptySelectionClipboard()
			);

			this.viewModel.addEventSource(this.cursor);

			this._createView();

			this.listenersToRemove.push(this._getViewInternalEventBus().addBulkListener((events) => {
				for (var i = 0, len = events.length; i < len; i++) {
					var eventType = events[i].getType();
					var e = events[i].getData();

					switch (eventType) {
						case editorCommon.EventType.ViewFocusGained:
							this.emit(editorCommon.EventType.EditorTextFocus);
							// In IE, the focus is not synchronous, so we give it a little help
							this.emit(editorCommon.EventType.EditorFocus, {});
							break;

						case 'scroll':
							this.emit('scroll', e);
							break;

						case 'scrollSize':
							this.emit('scrollSize', e);
							break;

						case editorCommon.EventType.ViewFocusLost:
							this.emit(editorCommon.EventType.EditorTextBlur);
							break;

						case editorCommon.EventType.ContextMenu:
							this.emit(editorCommon.EventType.ContextMenu, e);
							break;

						case editorCommon.EventType.MouseDown:
							this.emit(editorCommon.EventType.MouseDown, e);
							break;

						case editorCommon.EventType.MouseUp:
							this.emit(editorCommon.EventType.MouseUp, e);
							break;

						case editorCommon.EventType.KeyUp:
							this.emit(editorCommon.EventType.KeyUp, e);
							break;

						case editorCommon.EventType.MouseMove:
							this.emit(editorCommon.EventType.MouseMove, e);
							break;

						case editorCommon.EventType.MouseLeave:
							this.emit(editorCommon.EventType.MouseLeave, e);
							break;

						case editorCommon.EventType.KeyDown:
							this.emit(editorCommon.EventType.KeyDown, e);
							break;

						case editorCommon.EventType.ViewLayoutChanged:
							this.emit(editorCommon.EventType.EditorLayout, e);
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
						case editorCommon.EventType.ModelDecorationsChanged:
							this.emit(editorCommon.EventType.ModelDecorationsChanged, e);
							break;

						case editorCommon.EventType.ModelModeChanged:
							this.domElement.setAttribute('data-mode-id', this.model.getMode().getId());
							this._langIdKey.set(this.model.getMode().getId());
							this.emit(editorCommon.EventType.ModelModeChanged, e);
							break;

						case editorCommon.EventType.ModelModeSupportChanged:
							this.emit(editorCommon.EventType.ModelModeSupportChanged, e);
							break;

						case editorCommon.EventType.ModelContentChanged:
							// TODO@Alex
							this.emit(editorCommon.EventType.ModelContentChanged, e);
							this.emit('change', {});
							break;

						case editorCommon.EventType.ModelOptionsChanged:
							this.emit(editorCommon.EventType.ModelOptionsChanged, e);
							break;

						case editorCommon.EventType.ModelDispose:
							// Someone might destroy the model from under the editor, so prevent any exceptions by setting a null model
							this.setModel(null);
							break;

						default:
//							console.warn("Unhandled model event: ", e);
					}
				}
			}));

			var _hasNonEmptySelection = (e: editorCommon.ICursorSelectionChangedEvent) => {
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
						case editorCommon.EventType.CursorPositionChanged:
							var cursorPositionChangedEvent = <editorCommon.ICursorPositionChangedEvent>e;
							updateHasMultipleCursors = true;
							hasMultipleCursors = (cursorPositionChangedEvent.secondaryPositions.length > 0);
							this.emit(editorCommon.EventType.CursorPositionChanged, e);
							break;

						case editorCommon.EventType.CursorSelectionChanged:
							var cursorSelectionChangedEvent = <editorCommon.ICursorSelectionChangedEvent>e;
							updateHasMultipleCursors = true;
							hasMultipleCursors = (cursorSelectionChangedEvent.secondarySelections.length > 0);
							updateHasNonEmptySelection = true;
							hasNonEmptySelection = _hasNonEmptySelection(cursorSelectionChangedEvent);
							this.emit(editorCommon.EventType.CursorSelectionChanged, e);
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
		} else {
			this.hasView = false;
		}
	}

	protected abstract _enableEmptySelectionClipboard(): boolean;

	protected abstract _createView(): void;

	protected abstract _getViewInternalEventBus(): IEventEmitter;

	_postDetachModelCleanup(detachedModel:editorCommon.IModel): void {
		if (detachedModel) {
			this._decorationTypeKeysToIds = {};
			detachedModel.removeAllDecorationsWithOwnerId(this.id);
		}
	}

	protected _detachModel(): editorCommon.IModel {
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

		if (this.viewModel) {
			this.viewModel.dispose();
			this.viewModel = null;
		}

		var result = this.model;
		this.model = null;

		this.domElement.removeAttribute('data-mode-id');

		return result;
	}
}