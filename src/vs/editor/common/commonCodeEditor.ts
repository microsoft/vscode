/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import Event, { fromEventEmitter } from 'vs/base/common/event';
import { EventEmitter, IEventEmitter } from 'vs/base/common/eventEmitter';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKey, IContextKeyServiceTarget, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { CommonEditorConfiguration } from 'vs/editor/common/config/commonEditorConfig';
import { DefaultConfig } from 'vs/editor/common/config/defaultConfig';
import { Cursor } from 'vs/editor/common/controller/cursor';
import { CursorColumns } from 'vs/editor/common/controller/cursorCommon';
import { IViewModelHelper } from 'vs/editor/common/controller/oneCursor';
import { EditorState } from 'vs/editor/common/core/editorState';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CharacterHardWrappingLineMapperFactory } from 'vs/editor/common/viewModel/characterHardWrappingLineMapper';
import { SplitLinesCollection } from 'vs/editor/common/viewModel/splitLinesCollection';
import { ViewModel } from 'vs/editor/common/viewModel/viewModelImpl';
import { hash } from 'vs/base/common/hash';
import { EditorModeContext } from 'vs/editor/common/modes/editorModeContext';

import EditorContextKeys = editorCommon.EditorContextKeys;

let EDITOR_ID = 0;

export abstract class CommonCodeEditor extends EventEmitter implements editorCommon.ICommonCodeEditor {

	public readonly onDidChangeModelRawContent: Event<editorCommon.IModelContentChangedEvent> = fromEventEmitter(this, editorCommon.EventType.ModelRawContentChanged);
	public readonly onDidChangeModelContent: Event<editorCommon.IModelContentChangedEvent2> = fromEventEmitter(this, editorCommon.EventType.ModelContentChanged2);
	public readonly onDidChangeModelLanguage: Event<editorCommon.IModelLanguageChangedEvent> = fromEventEmitter(this, editorCommon.EventType.ModelLanguageChanged);
	public readonly onDidChangeModelOptions: Event<editorCommon.IModelOptionsChangedEvent> = fromEventEmitter(this, editorCommon.EventType.ModelOptionsChanged);
	public readonly onDidChangeModelDecorations: Event<editorCommon.IModelDecorationsChangedEvent> = fromEventEmitter(this, editorCommon.EventType.ModelDecorationsChanged);
	public readonly onDidChangeConfiguration: Event<editorCommon.IConfigurationChangedEvent> = fromEventEmitter(this, editorCommon.EventType.ConfigurationChanged);
	public readonly onDidChangeModel: Event<editorCommon.IModelChangedEvent> = fromEventEmitter(this, editorCommon.EventType.ModelChanged);
	public readonly onDidChangeCursorPosition: Event<editorCommon.ICursorPositionChangedEvent> = fromEventEmitter(this, editorCommon.EventType.CursorPositionChanged);
	public readonly onDidChangeCursorSelection: Event<editorCommon.ICursorSelectionChangedEvent> = fromEventEmitter(this, editorCommon.EventType.CursorSelectionChanged);
	public readonly onDidFocusEditorText: Event<void> = fromEventEmitter<void>(this, editorCommon.EventType.EditorTextFocus);
	public readonly onDidBlurEditorText: Event<void> = fromEventEmitter<void>(this, editorCommon.EventType.EditorTextBlur);
	public readonly onDidFocusEditor: Event<void> = fromEventEmitter<void>(this, editorCommon.EventType.EditorFocus);
	public readonly onDidBlurEditor: Event<void> = fromEventEmitter<void>(this, editorCommon.EventType.EditorBlur);
	public readonly onDidDispose: Event<void> = fromEventEmitter<void>(this, editorCommon.EventType.Disposed);
	public readonly onWillType: Event<string> = fromEventEmitter<string>(this, editorCommon.EventType.WillType);
	public readonly onDidType: Event<string> = fromEventEmitter<string>(this, editorCommon.EventType.DidType);
	public readonly onDidPaste: Event<Range> = fromEventEmitter<Range>(this, editorCommon.EventType.DidPaste);

	protected domElement: IContextKeyServiceTarget;

	protected id: number;

	protected _lifetimeDispose: IDisposable[];
	protected _configuration: CommonEditorConfiguration;

	protected _contributions: { [key: string]: editorCommon.IEditorContribution; };
	protected _actions: { [key: string]: editorCommon.IEditorAction; };

	// --- Members logically associated to a model
	protected model: editorCommon.IModel;
	protected listenersToRemove: IDisposable[];
	protected hasView: boolean;

	protected viewModel: ViewModel;
	protected cursor: Cursor;

	protected _instantiationService: IInstantiationService;
	protected _contextKeyService: IContextKeyService;

	/**
	 * map from "parent" decoration type to live decoration ids.
	 */
	private _decorationTypeKeysToIds: { [decorationTypeKey: string]: string[] };
	private _decorationTypeSubtypes: { [decorationTypeKey: string]: { [subtype: string]: boolean } };


	constructor(
		domElement: IContextKeyServiceTarget,
		options: editorCommon.IEditorOptions,
		instantiationService: IInstantiationService,
		contextKeyService: IContextKeyService
	) {
		super();

		this.domElement = domElement;

		this.id = (++EDITOR_ID);

		// listeners that are kept during the whole editor lifetime
		this._lifetimeDispose = [];


		this._decorationTypeKeysToIds = {};
		this._decorationTypeSubtypes = {};

		options = options || {};
		if (typeof options.ariaLabel === 'undefined') {
			options.ariaLabel = DefaultConfig.editor.ariaLabel;
		}

		this._configuration = this._createConfiguration(options);
		this._lifetimeDispose.push(this._configuration.onDidChange((e) => {
			this.emit(editorCommon.EventType.ConfigurationChanged, e);

			if (e.layoutInfo) {
				this.emit(editorCommon.EventType.EditorLayout, this._configuration.editor.layoutInfo);
			}
		}));

		this._contextKeyService = contextKeyService.createScoped(this.domElement);
		this._lifetimeDispose.push(new EditorContextKeysManager(this, this._contextKeyService));
		this._lifetimeDispose.push(new EditorModeContext(this, this._contextKeyService));

		this._instantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService]));

		this._attachModel(null);

		this._contributions = {};
		this._actions = {};
	}

	protected abstract _createConfiguration(options: editorCommon.ICodeEditorWidgetCreationOptions): CommonEditorConfiguration;

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
		this._lifetimeDispose = dispose(this._lifetimeDispose);

		let keys = Object.keys(this._contributions);
		for (let i = 0, len = keys.length; i < len; i++) {
			let contributionId = keys[i];
			this._contributions[contributionId].dispose();
		}
		this._contributions = {};

		// editor actions don't need to be disposed
		this._actions = {};

		this._postDetachModelCleanup(this._detachModel());
		this._configuration.dispose();
		this._contextKeyService.dispose();
		this.emit(editorCommon.EventType.Disposed);
		super.dispose();
	}

	public captureState(...flags: editorCommon.CodeEditorStateFlag[]): editorCommon.ICodeEditorState {
		return new EditorState(this, flags);
	}

	public invokeWithinContext<T>(fn: (accessor: ServicesAccessor) => T): T {
		return this._instantiationService.invokeFunction(fn);
	}

	public updateOptions(newOptions: editorCommon.IEditorOptions): void {
		this._configuration.updateOptions(newOptions);
	}

	public getConfiguration(): editorCommon.InternalEditorOptions {
		return this._configuration.editorClone;
	}

	public getRawConfiguration(): editorCommon.IEditorOptions {
		return this._configuration.getRawOptions();
	}

	public getValue(options: { preserveBOM: boolean; lineEnding: string; } = null): string {
		if (this.model) {
			let preserveBOM: boolean = (options && options.preserveBOM) ? true : false;
			let eolPreference = editorCommon.EndOfLinePreference.TextDefined;
			if (options && options.lineEnding && options.lineEnding === '\n') {
				eolPreference = editorCommon.EndOfLinePreference.LF;
			} else if (options && options.lineEnding && options.lineEnding === '\r\n') {
				eolPreference = editorCommon.EndOfLinePreference.CRLF;
			}
			return this.model.getValue(eolPreference, preserveBOM);
		}
		return '';
	}

	public setValue(newValue: string): void {
		if (this.model) {
			this.model.setValue(newValue);
		}
	}

	public getModel(): editorCommon.IModel {
		return this.model;
	}

	public setModel(model: editorCommon.IModel = null): void {
		if (this.model === model) {
			// Current model is the new model
			return;
		}

		let detachedModel = this._detachModel();
		this._attachModel(model);

		let e: editorCommon.IModelChangedEvent = {
			oldModelUrl: detachedModel ? detachedModel.uri : null,
			newModelUrl: model ? model.uri : null
		};

		this.emit(editorCommon.EventType.ModelChanged, e);
		this._postDetachModelCleanup(detachedModel);
	}

	public abstract getCenteredRangeInViewport(): Range;

	protected abstract _getCompletelyVisibleViewRange(): Range;

	public getVisibleColumnFromPosition(rawPosition: editorCommon.IPosition): number {
		if (!this.model) {
			return rawPosition.column;
		}

		let position = this.model.validatePosition(rawPosition);
		let tabSize = this.model.getOptions().tabSize;

		return CursorColumns.visibleColumnFromColumn(this.model.getLineContent(position.lineNumber), position.column, tabSize) + 1;
	}

	public getPosition(): Position {
		if (!this.cursor) {
			return null;
		}
		return this.cursor.getPosition().clone();
	}

	public setPosition(position: editorCommon.IPosition, reveal: boolean = false, revealVerticalInCenter: boolean = false, revealHorizontal: boolean = false): void {
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

	private _sendRevealRange(range: Range, verticalType: editorCommon.VerticalRevealType, revealHorizontal: boolean): void {
		if (!this.model || !this.cursor) {
			return;
		}
		if (!Range.isIRange(range)) {
			throw new Error('Invalid arguments');
		}
		let validatedRange = this.model.validateRange(range);

		let revealRangeEvent: editorCommon.ICursorRevealRangeEvent = {
			range: validatedRange,
			viewRange: null,
			verticalType: verticalType,
			revealHorizontal: revealHorizontal,
			revealCursor: false
		};
		this.cursor.emit(editorCommon.EventType.CursorRevealRange, revealRangeEvent);
	}

	public revealLine(lineNumber: number): void {
		this._revealLine(lineNumber, editorCommon.VerticalRevealType.Simple);
	}

	public revealLineInCenter(lineNumber: number): void {
		this._revealLine(lineNumber, editorCommon.VerticalRevealType.Center);
	}

	public revealLineInCenterIfOutsideViewport(lineNumber: number): void {
		this._revealLine(lineNumber, editorCommon.VerticalRevealType.CenterIfOutsideViewport);
	}

	private _revealLine(lineNumber: number, revealType: editorCommon.VerticalRevealType): void {
		if (typeof lineNumber !== 'number') {
			throw new Error('Invalid arguments');
		}

		this._sendRevealRange(
			new Range(lineNumber, 1, lineNumber, 1),
			revealType,
			false
		);
	}

	public revealPosition(position: editorCommon.IPosition, revealVerticalInCenter: boolean = false, revealHorizontal: boolean = false): void {
		this._revealPosition(
			position,
			revealVerticalInCenter ? editorCommon.VerticalRevealType.Center : editorCommon.VerticalRevealType.Simple,
			revealHorizontal
		);
	}

	public revealPositionInCenter(position: editorCommon.IPosition): void {
		this._revealPosition(
			position,
			editorCommon.VerticalRevealType.Center,
			true
		);
	}

	public revealPositionInCenterIfOutsideViewport(position: editorCommon.IPosition): void {
		this._revealPosition(
			position,
			editorCommon.VerticalRevealType.CenterIfOutsideViewport,
			true
		);
	}

	private _revealPosition(position: editorCommon.IPosition, verticalType: editorCommon.VerticalRevealType, revealHorizontal: boolean): void {
		if (!Position.isIPosition(position)) {
			throw new Error('Invalid arguments');
		}

		this._sendRevealRange(
			new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			verticalType,
			revealHorizontal
		);
	}

	public getSelection(): Selection {
		if (!this.cursor) {
			return null;
		}
		return this.cursor.getSelection().clone();
	}

	public getSelections(): Selection[] {
		if (!this.cursor) {
			return null;
		}
		let selections = this.cursor.getSelections();
		let result: Selection[] = [];
		for (let i = 0, len = selections.length; i < len; i++) {
			result[i] = selections[i].clone();
		}
		return result;
	}

	public setSelection(range: editorCommon.IRange, reveal?: boolean, revealVerticalInCenter?: boolean, revealHorizontal?: boolean): void;
	public setSelection(editorRange: Range, reveal?: boolean, revealVerticalInCenter?: boolean, revealHorizontal?: boolean): void;
	public setSelection(selection: editorCommon.ISelection, reveal?: boolean, revealVerticalInCenter?: boolean, revealHorizontal?: boolean): void;
	public setSelection(editorSelection: Selection, reveal?: boolean, revealVerticalInCenter?: boolean, revealHorizontal?: boolean): void;
	public setSelection(something: any, reveal: boolean = false, revealVerticalInCenter: boolean = false, revealHorizontal: boolean = false): void {
		let isSelection = Selection.isISelection(something);
		let isRange = Range.isIRange(something);

		if (!isSelection && !isRange) {
			throw new Error('Invalid arguments');
		}

		if (isSelection) {
			this._setSelectionImpl(<editorCommon.ISelection>something, reveal, revealVerticalInCenter, revealHorizontal);
		} else if (isRange) {
			// act as if it was an IRange
			let selection: editorCommon.ISelection = {
				selectionStartLineNumber: something.startLineNumber,
				selectionStartColumn: something.startColumn,
				positionLineNumber: something.endLineNumber,
				positionColumn: something.endColumn
			};
			this._setSelectionImpl(selection, reveal, revealVerticalInCenter, revealHorizontal);
		}
	}

	private _setSelectionImpl(sel: editorCommon.ISelection, reveal: boolean, revealVerticalInCenter: boolean, revealHorizontal: boolean): void {
		if (!this.cursor) {
			return;
		}
		let selection = new Selection(sel.selectionStartLineNumber, sel.selectionStartColumn, sel.positionLineNumber, sel.positionColumn);
		this.cursor.setSelections('api', [selection]);
		if (reveal) {
			this.revealRange(selection, revealVerticalInCenter, revealHorizontal);
		}
	}

	public revealLines(startLineNumber: number, endLineNumber: number): void {
		this._revealLines(
			startLineNumber,
			endLineNumber,
			editorCommon.VerticalRevealType.Simple
		);
	}

	public revealLinesInCenter(startLineNumber: number, endLineNumber: number): void {
		this._revealLines(
			startLineNumber,
			endLineNumber,
			editorCommon.VerticalRevealType.Center
		);
	}

	public revealLinesInCenterIfOutsideViewport(startLineNumber: number, endLineNumber: number): void {
		this._revealLines(
			startLineNumber,
			endLineNumber,
			editorCommon.VerticalRevealType.CenterIfOutsideViewport
		);
	}

	private _revealLines(startLineNumber: number, endLineNumber: number, verticalType: editorCommon.VerticalRevealType): void {
		if (typeof startLineNumber !== 'number' || typeof endLineNumber !== 'number') {
			throw new Error('Invalid arguments');
		}

		this._sendRevealRange(
			new Range(startLineNumber, 1, endLineNumber, 1),
			verticalType,
			false
		);
	}

	public revealRange(range: editorCommon.IRange, revealVerticalInCenter: boolean = false, revealHorizontal: boolean = true): void {
		this._revealRange(
			range,
			revealVerticalInCenter ? editorCommon.VerticalRevealType.Center : editorCommon.VerticalRevealType.Simple,
			revealHorizontal
		);
	}

	public revealRangeInCenter(range: editorCommon.IRange): void {
		this._revealRange(
			range,
			editorCommon.VerticalRevealType.Center,
			true
		);
	}

	public revealRangeInCenterIfOutsideViewport(range: editorCommon.IRange): void {
		this._revealRange(
			range,
			editorCommon.VerticalRevealType.CenterIfOutsideViewport,
			true
		);
	}

	public revealRangeAtTop(range: editorCommon.IRange): void {
		this._revealRange(
			range,
			editorCommon.VerticalRevealType.Top,
			true
		);
	}

	private _revealRange(range: editorCommon.IRange, verticalType: editorCommon.VerticalRevealType, revealHorizontal: boolean): void {
		if (!Range.isIRange(range)) {
			throw new Error('Invalid arguments');
		}

		this._sendRevealRange(
			Range.lift(range),
			verticalType,
			revealHorizontal
		);
	}

	public setSelections(ranges: editorCommon.ISelection[]): void {
		if (!this.cursor) {
			return;
		}
		if (!ranges || ranges.length === 0) {
			throw new Error('Invalid arguments');
		}
		for (let i = 0, len = ranges.length; i < len; i++) {
			if (!Selection.isISelection(ranges[i])) {
				throw new Error('Invalid arguments');
			}
		}
		this.cursor.setSelections('api', ranges);
	}

	public abstract getScrollWidth(): number;
	public abstract getScrollLeft(): number;

	public abstract getScrollHeight(): number;
	public abstract getScrollTop(): number;

	public abstract setScrollLeft(newScrollLeft: number): void;
	public abstract setScrollTop(newScrollTop: number): void;
	public abstract setScrollPosition(position: editorCommon.INewScrollPosition): void;

	public abstract saveViewState(): editorCommon.ICodeEditorViewState;
	public abstract restoreViewState(state: editorCommon.IEditorViewState): void;

	public onVisible(): void {
	}

	public onHide(): void {
	}

	public abstract layout(dimension?: editorCommon.IDimension): void;

	public abstract focus(): void;
	public abstract isFocused(): boolean;
	public abstract hasWidgetFocus(): boolean;

	public getContribution<T extends editorCommon.IEditorContribution>(id: string): T {
		return <T>(this._contributions[id] || null);
	}

	public getActions(): editorCommon.IEditorAction[] {
		let result: editorCommon.IEditorAction[] = [];

		let keys = Object.keys(this._actions);
		for (let i = 0, len = keys.length; i < len; i++) {
			let id = keys[i];
			result.push(this._actions[id]);
		}

		return result;
	}

	public getSupportedActions(): editorCommon.IEditorAction[] {
		let result = this.getActions();

		result = result.filter(action => action.isSupported());

		return result;
	}

	public getAction(id: string): editorCommon.IEditorAction {
		return this._actions[id] || null;
	}

	public trigger(source: string, handlerId: string, payload: any): void {
		payload = payload || {};

		// Special case for typing
		if (handlerId === editorCommon.Handler.Type) {
			if (!this.cursor || typeof payload.text !== 'string' || payload.text.length === 0) {
				// nothing to do
				return;
			}
			if (source === 'keyboard') {
				this.emit(editorCommon.EventType.WillType, payload.text);
			}
			this.cursor.trigger(source, handlerId, payload);
			if (source === 'keyboard') {
				this.emit(editorCommon.EventType.DidType, payload.text);
			}
			return;
		}

		if (handlerId === editorCommon.Handler.Paste) {
			if (!this.cursor || typeof payload.text !== 'string' || payload.text.length === 0) {
				// nothing to do
				return;
			}
			const startPosition = this.cursor.getSelection().getStartPosition();
			this.cursor.trigger(source, handlerId, payload);
			const endPosition = this.cursor.getSelection().getStartPosition();
			if (source === 'keyboard') {
				this.emit(editorCommon.EventType.DidPaste, new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column));
			}
			return;
		}

		let candidate = this.getAction(handlerId);
		if (candidate !== null) {
			TPromise.as(candidate.run()).done(null, onUnexpectedError);
		} else {
			if (!this.cursor) {
				return;
			}
			this.cursor.trigger(source, handlerId, payload);
		}
	}

	public executeCommand(source: string, command: editorCommon.ICommand): void {
		if (!this.cursor) {
			return;
		}
		this.cursor.trigger(source, editorCommon.Handler.ExecuteCommand, command);
	}

	public pushUndoStop(): boolean {
		if (!this.cursor) {
			// no view, no cursor
			return false;
		}
		if (this._configuration.editor.readOnly) {
			// read only editor => sorry!
			return false;
		}
		this.model.pushStackElement();
		return true;
	}

	public executeEdits(source: string, edits: editorCommon.IIdentifiedSingleEditOperation[], endCursorState?: Selection[]): boolean {
		if (!this.cursor) {
			// no view, no cursor
			return false;
		}
		if (this._configuration.editor.readOnly) {
			// read only editor => sorry!
			return false;
		}

		this.model.pushEditOperations(this.cursor.getSelections(), edits, () => {
			return endCursorState ? endCursorState : this.cursor.getSelections();
		});

		if (endCursorState) {
			this.cursor.setSelections(source, endCursorState);
		}

		return true;
	}

	public executeCommands(source: string, commands: editorCommon.ICommand[]): void {
		if (!this.cursor) {
			return;
		}
		this.cursor.trigger(source, editorCommon.Handler.ExecuteCommands, commands);
	}

	public changeDecorations(callback: (changeAccessor: editorCommon.IModelDecorationsChangeAccessor) => any): any {
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

	public deltaDecorations(oldDecorations: string[], newDecorations: editorCommon.IModelDeltaDecoration[]): string[] {
		if (!this.model) {
			return [];
		}

		if (oldDecorations.length === 0 && newDecorations.length === 0) {
			return oldDecorations;
		}

		return this.model.deltaDecorations(oldDecorations, newDecorations, this.id);
	}

	public setDecorations(decorationTypeKey: string, decorationOptions: editorCommon.IDecorationOptions[]): void {

		let newDecorationsSubTypes: { [key: string]: boolean } = {};
		let oldDecorationsSubTypes = this._decorationTypeSubtypes[decorationTypeKey] || {};
		this._decorationTypeSubtypes[decorationTypeKey] = newDecorationsSubTypes;

		let newModelDecorations: editorCommon.IModelDeltaDecoration[] = [];

		for (let decorationOption of decorationOptions) {
			let typeKey = decorationTypeKey;
			if (decorationOption.renderOptions) {
				// identify custom reder options by a hash code over all keys and values
				// For custom render options register a decoration type if necessary
				let subType = hash(decorationOption.renderOptions).toString(16);
				// The fact that `decorationTypeKey` appears in the typeKey has no influence
				// it is just a mechanism to get predictable and unique keys (repeatable for the same options and unique across clients)
				typeKey = decorationTypeKey + '-' + subType;
				if (!oldDecorationsSubTypes[subType] && !newDecorationsSubTypes[subType]) {
					// decoration type did not exist before, register new one
					this._registerDecorationType(typeKey, decorationOption.renderOptions, decorationTypeKey);
				}
				newDecorationsSubTypes[subType] = true;
			}
			let opts = this._resolveDecorationOptions(typeKey, !!decorationOption.hoverMessage);
			if (decorationOption.hoverMessage) {
				opts.hoverMessage = decorationOption.hoverMessage;
			}
			newModelDecorations.push({ range: decorationOption.range, options: opts });
		}

		// remove decoration sub types that are no longer used, deregister decoration type if necessary
		for (let subType in oldDecorationsSubTypes) {
			if (!newDecorationsSubTypes[subType]) {
				this._removeDecorationType(decorationTypeKey + '-' + subType);
			}
		}

		// update all decorations
		let oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey] || [];
		this._decorationTypeKeysToIds[decorationTypeKey] = this.deltaDecorations(oldDecorationsIds, newModelDecorations);
	}

	public removeDecorations(decorationTypeKey: string): void {
		// remove decorations for type and sub type
		let oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey];
		if (oldDecorationsIds) {
			this.deltaDecorations(oldDecorationsIds, []);
		}
		if (this._decorationTypeKeysToIds.hasOwnProperty(decorationTypeKey)) {
			delete this._decorationTypeKeysToIds[decorationTypeKey];
		}
		if (this._decorationTypeSubtypes.hasOwnProperty(decorationTypeKey)) {
			delete this._decorationTypeSubtypes[decorationTypeKey];
		}
	}

	public getLayoutInfo(): editorCommon.EditorLayoutInfo {
		return this._configuration.editor.layoutInfo;
	}

	protected _attachModel(model: editorCommon.IModel): void {
		this.model = model ? model : null;
		this.listenersToRemove = [];
		this.viewModel = null;
		this.cursor = null;

		if (this.model) {
			this.domElement.setAttribute('data-mode-id', this.model.getLanguageIdentifier().language);
			this._configuration.setIsDominatedByLongLines(this.model.isDominatedByLongLines());

			this.model.onBeforeAttached();

			let hardWrappingLineMapperFactory = new CharacterHardWrappingLineMapperFactory(
				this._configuration.editor.wrappingInfo.wordWrapBreakBeforeCharacters,
				this._configuration.editor.wrappingInfo.wordWrapBreakAfterCharacters,
				this._configuration.editor.wrappingInfo.wordWrapBreakObtrusiveCharacters
			);

			let linesCollection = new SplitLinesCollection(
				this.model,
				hardWrappingLineMapperFactory,
				this.model.getOptions().tabSize,
				this._configuration.editor.wrappingInfo.wrappingColumn,
				this._configuration.editor.fontInfo.typicalFullwidthCharacterWidth / this._configuration.editor.fontInfo.typicalHalfwidthCharacterWidth,
				this._configuration.editor.wrappingInfo.wrappingIndent
			);

			this.viewModel = new ViewModel(
				linesCollection,
				this.id,
				this._configuration,
				this.model
			);

			let viewModelHelper: IViewModelHelper = {
				viewModel: this.viewModel,
				coordinatesConverter: this.viewModel.coordinatesConverter,
				getCompletelyVisibleViewRange: (): Range => {
					return this._getCompletelyVisibleViewRange();
				}
			};

			this.listenersToRemove.push(this.model.addBulkListener((events) => {
				for (let i = 0, len = events.length; i < len; i++) {
					let eventType = events[i].getType();
					let e = events[i].getData();

					switch (eventType) {
						case editorCommon.EventType.ModelDecorationsChanged:
							this.emit(editorCommon.EventType.ModelDecorationsChanged, e);
							break;

						case editorCommon.EventType.ModelLanguageChanged:
							this.domElement.setAttribute('data-mode-id', this.model.getLanguageIdentifier().language);
							this.emit(editorCommon.EventType.ModelLanguageChanged, e);
							break;

						case editorCommon.EventType.ModelRawContentChanged:
							this.emit(editorCommon.EventType.ModelRawContentChanged, e);
							break;

						case editorCommon.EventType.ModelContentChanged2:
							this.emit(editorCommon.EventType.ModelContentChanged2, e);
							break;

						case editorCommon.EventType.ModelOptionsChanged:
							this.emit(editorCommon.EventType.ModelOptionsChanged, e);
							break;

						case editorCommon.EventType.ModelDispose:
							// Someone might destroy the model from under the editor, so prevent any exceptions by setting a null model
							this.setModel(null);
							break;

						default:
						// console.warn("Unhandled model event: ", e);
					}
				}
			}));

			this.cursor = new Cursor(
				this._configuration,
				this.model,
				viewModelHelper,
				this._enableEmptySelectionClipboard()
			);

			this.viewModel.addEventSource(this.cursor);

			this._createView();

			this.listenersToRemove.push(this._getViewInternalEventBus().addBulkListener2((events) => {
				for (let i = 0, len = events.length; i < len; i++) {
					let eventType = events[i].getType();
					let e = events[i].getData();

					switch (eventType) {
						case editorCommon.EventType.ViewFocusGained:
							this.emit(editorCommon.EventType.EditorTextFocus);
							// In IE, the focus is not synchronous, so we give it a little help
							this.emit(editorCommon.EventType.EditorFocus, {});
							break;

						case 'scroll':
							this.emit('scroll', e);
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

						case editorCommon.EventType.MouseDrag:
							this.emit(editorCommon.EventType.MouseDrag, e);
							break;

						case editorCommon.EventType.MouseDrop:
							this.emit(editorCommon.EventType.MouseDrop, e);
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

						default:
						// console.warn("Unhandled view event: ", e);
					}
				}
			}));

			this.listenersToRemove.push(this.cursor.addBulkListener2((events) => {
				for (let i = 0, len = events.length; i < len; i++) {
					let eventType = events[i].getType();
					let e = events[i].getData();

					switch (eventType) {
						case editorCommon.EventType.CursorPositionChanged:
							this.emit(editorCommon.EventType.CursorPositionChanged, e);
							break;

						case editorCommon.EventType.CursorSelectionChanged:
							this.emit(editorCommon.EventType.CursorSelectionChanged, e);
							break;

						default:
						// console.warn("Unhandled cursor event: ", e);
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

	protected _postDetachModelCleanup(detachedModel: editorCommon.IModel): void {
		if (detachedModel) {
			this._decorationTypeKeysToIds = {};
			if (this._decorationTypeSubtypes) {
				for (let decorationType in this._decorationTypeSubtypes) {
					let subTypes = this._decorationTypeSubtypes[decorationType];
					for (let subType in subTypes) {
						this._removeDecorationType(decorationType + '-' + subType);
					}
				}
				this._decorationTypeSubtypes = {};
			}
			detachedModel.removeAllDecorationsWithOwnerId(this.id);
		}
	}

	protected _detachModel(): editorCommon.IModel {
		if (this.model) {
			this.model.onBeforeDetached();
		}

		this.hasView = false;

		this.listenersToRemove = dispose(this.listenersToRemove);

		if (this.cursor) {
			this.cursor.dispose();
			this.cursor = null;
		}

		if (this.viewModel) {
			this.viewModel.dispose();
			this.viewModel = null;
		}

		let result = this.model;
		this.model = null;

		this.domElement.removeAttribute('data-mode-id');

		return result;
	}

	protected abstract _registerDecorationType(key: string, options: editorCommon.IDecorationRenderOptions, parentTypeKey?: string): void;
	protected abstract _removeDecorationType(key: string): void;
	protected abstract _resolveDecorationOptions(typeKey: string, writable: boolean): editorCommon.IModelDecorationOptions;

	public getTelemetryData(): { [key: string]: any; } {
		return null;
	}
}

class EditorContextKeysManager extends Disposable {

	private _editor: CommonCodeEditor;

	private _editorId: IContextKey<string>;
	private _editorFocus: IContextKey<boolean>;
	private _editorTextFocus: IContextKey<boolean>;
	private _editorTabMovesFocus: IContextKey<boolean>;
	private _editorReadonly: IContextKey<boolean>;
	private _hasMultipleSelections: IContextKey<boolean>;
	private _hasNonEmptySelection: IContextKey<boolean>;

	constructor(
		editor: CommonCodeEditor,
		contextKeyService: IContextKeyService
	) {
		super();

		this._editor = editor;

		this._editorId = contextKeyService.createKey('editorId', editor.getId());
		this._editorFocus = EditorContextKeys.Focus.bindTo(contextKeyService);
		this._editorTextFocus = EditorContextKeys.TextFocus.bindTo(contextKeyService);
		this._editorTabMovesFocus = EditorContextKeys.TabMovesFocus.bindTo(contextKeyService);
		this._editorReadonly = EditorContextKeys.ReadOnly.bindTo(contextKeyService);
		this._hasMultipleSelections = EditorContextKeys.HasMultipleSelections.bindTo(contextKeyService);
		this._hasNonEmptySelection = EditorContextKeys.HasNonEmptySelection.bindTo(contextKeyService);

		this._register(this._editor.onDidChangeConfiguration(() => this._updateFromConfig()));
		this._register(this._editor.onDidChangeCursorSelection(() => this._updateFromSelection()));
		this._register(this._editor.onDidFocusEditor(() => this._updateFromFocus()));
		this._register(this._editor.onDidBlurEditor(() => this._updateFromFocus()));
		this._register(this._editor.onDidFocusEditorText(() => this._updateFromFocus()));
		this._register(this._editor.onDidBlurEditorText(() => this._updateFromFocus()));

		this._updateFromConfig();
		this._updateFromSelection();
		this._updateFromFocus();
	}

	private _updateFromConfig(): void {
		let config = this._editor.getConfiguration();

		this._editorTabMovesFocus.set(config.tabFocusMode);
		this._editorReadonly.set(config.readOnly);
	}

	private _updateFromSelection(): void {
		let selections = this._editor.getSelections();
		if (!selections) {
			this._hasMultipleSelections.reset();
			this._hasNonEmptySelection.reset();
		} else {
			this._hasMultipleSelections.set(selections.length > 1);
			this._hasNonEmptySelection.set(selections.some(s => !s.isEmpty()));
		}
	}

	private _updateFromFocus(): void {
		this._editorFocus.set(this._editor.hasWidgetFocus());
		this._editorTextFocus.set(this._editor.isFocused());
	}
}
