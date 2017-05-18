/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import { onUnexpectedError } from 'vs/base/common/errors';
import { EventEmitter, BulkListenerCallback } from 'vs/base/common/eventEmitter';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { CursorCollection } from 'vs/editor/common/controller/cursorCollection';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection, SelectionDirection, ISelection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CursorColumns, CursorConfiguration, EditOperationResult, IViewModelHelper, CursorContext, CursorState, RevealTarget, IColumnSelectData, ICursors } from 'vs/editor/common/controller/cursorCommon';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { DeleteOperations } from 'vs/editor/common/controller/cursorDeleteOperations';
import { TypeOperations } from 'vs/editor/common/controller/cursorTypeOperations';
import { TextModelEventType, ModelRawContentChangedEvent, RawContentChangedType } from 'vs/editor/common/model/textModelEvents';
import { CursorEventType, CursorChangeReason, ICursorPositionChangedEvent, VerticalRevealType, ICursorSelectionChangedEvent, ICursorRevealRangeEvent, CursorScrollRequest } from 'vs/editor/common/controller/cursorEvents';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { CoreEditorCommand } from 'vs/editor/common/controller/coreCommands';

class CursorOperationArgs<T> {
	public readonly eventSource: string;
	public readonly eventData: T;

	constructor(eventSource: string, eventData: T) {
		this.eventSource = eventSource;
		this.eventData = eventData;
	}
}

interface ICommandData {
	operations: editorCommon.IIdentifiedSingleEditOperation[];
	hadTrackedEditOperation: boolean;
}

interface ICommandsData {
	operations: editorCommon.IIdentifiedSingleEditOperation[];
	hadTrackedEditOperation: boolean;
}

export class Cursor extends Disposable implements ICursors {

	public onDidChangePosition(listener: (e: ICursorPositionChangedEvent) => void): IDisposable {
		return this._eventEmitter.addListener(CursorEventType.CursorPositionChanged, listener);
	}
	public onDidChangeSelection(listener: (e: ICursorSelectionChangedEvent) => void): IDisposable {
		return this._eventEmitter.addListener(CursorEventType.CursorSelectionChanged, listener);
	}
	public addBulkListener(listener: BulkListenerCallback): IDisposable {
		return this._eventEmitter.addBulkListener(listener);
	}

	private readonly _eventEmitter: EventEmitter;
	private readonly _configuration: editorCommon.IConfiguration;
	private readonly _model: editorCommon.IModel;
	private readonly _viewModelHelper: IViewModelHelper;
	public context: CursorContext;
	private _cursors: CursorCollection;

	private _isHandling: boolean;
	private _isDoingComposition: boolean;
	private _columnSelectData: IColumnSelectData;

	private _handlers: {
		[key: string]: (args: CursorOperationArgs<any>) => EditOperationResult;
	};

	constructor(configuration: editorCommon.IConfiguration, model: editorCommon.IModel, viewModelHelper: IViewModelHelper) {
		super();
		this._eventEmitter = this._register(new EventEmitter());
		this._configuration = configuration;
		this._model = model;
		this._viewModelHelper = viewModelHelper;
		this.context = new CursorContext(this._configuration, this._model, this._viewModelHelper);
		this._cursors = new CursorCollection(this.context);

		this._isHandling = false;
		this._isDoingComposition = false;
		this._columnSelectData = null;

		this._handlers = {};
		this._registerHandlers();

		this._register(this._model.addBulkListener((events) => {
			if (this._isHandling) {
				return;
			}

			let hadContentChange = false;
			let hadFlushEvent = false;
			for (let i = 0, len = events.length; i < len; i++) {
				const event = events[i];
				const eventType = event.type;

				if (eventType === TextModelEventType.ModelRawContentChanged2) {
					hadContentChange = true;
					const rawChangeEvent = <ModelRawContentChangedEvent>event.data;
					hadFlushEvent = hadFlushEvent || rawChangeEvent.containsEvent(RawContentChangedType.Flush);
				}
			}

			if (!hadContentChange) {
				return;
			}

			this._onModelContentChanged(hadFlushEvent);
		}));

		const updateCursorContext = () => {
			this.context = new CursorContext(this._configuration, this._model, this._viewModelHelper);
			this._cursors.updateContext(this.context);
		};
		this._register(this._model.onDidChangeLanguage((e) => {
			updateCursorContext();
		}));
		this._register(LanguageConfigurationRegistry.onDidChange(() => {
			// TODO@Alex: react only if certain supports changed? (and if my model's mode changed)
			updateCursorContext();
		}));
		this._register(model.onDidChangeOptions(() => {
			updateCursorContext();
		}));
		this._register(this._configuration.onDidChange((e) => {
			if (CursorConfiguration.shouldRecreate(e)) {
				updateCursorContext();
			}
		}));
	}

	public dispose(): void {
		this._cursors.dispose();
		super.dispose();
	}

	public getPrimaryCursor(): CursorState {
		return this._cursors.getPrimaryCursor();
	}

	public getLastAddedCursorIndex(): number {
		return this._cursors.getLastAddedCursorIndex();
	}

	public getAll(): CursorState[] {
		return this._cursors.getAll();
	}

	public setStates(source: string, reason: CursorChangeReason, states: CursorState[]): void {
		const oldSelections = this._cursors.getSelections();
		const oldViewSelections = this._cursors.getViewSelections();

		// TODO@Alex
		// ensure valid state on all cursors
		// this.cursors.ensureValidState();

		this._cursors.setStates(states);
		this._cursors.normalize();
		this._columnSelectData = null;

		const newSelections = this._cursors.getSelections();
		const newViewSelections = this._cursors.getViewSelections();

		let somethingChanged = false;
		if (oldSelections.length !== newSelections.length) {
			somethingChanged = true;
		} else {
			for (let i = 0, len = oldSelections.length; !somethingChanged && i < len; i++) {
				if (!oldSelections[i].equalsSelection(newSelections[i])) {
					somethingChanged = true;
				}
			}
			for (let i = 0, len = oldViewSelections.length; !somethingChanged && i < len; i++) {
				if (!oldViewSelections[i].equalsSelection(newViewSelections[i])) {
					somethingChanged = true;
				}
			}
		}

		if (somethingChanged) {
			this._emitCursorPositionChanged(source, reason);
			this._emitCursorSelectionChanged(source, reason);
		}
	}

	public setColumnSelectData(columnSelectData: IColumnSelectData): void {
		this._columnSelectData = columnSelectData;
	}

	public reveal(horizontal: boolean, target: RevealTarget): void {
		this._revealRange(target, VerticalRevealType.Simple, horizontal);
	}

	public revealRange(revealHorizontal: boolean, modelRange: Range, viewRange: Range, verticalType: VerticalRevealType) {
		this.emitCursorRevealRange(modelRange, viewRange, verticalType, revealHorizontal);
	}

	public scrollTo(desiredScrollTop: number): void {
		this._eventEmitter.emit(CursorEventType.CursorScrollRequest, new CursorScrollRequest(
			desiredScrollTop
		));
	}

	public saveState(): editorCommon.ICursorState[] {

		let result: editorCommon.ICursorState[] = [];

		const selections = this._cursors.getSelections();
		for (let i = 0, len = selections.length; i < len; i++) {
			const selection = selections[i];

			result.push({
				inSelectionMode: !selection.isEmpty(),
				selectionStart: {
					lineNumber: selection.selectionStartLineNumber,
					column: selection.selectionStartColumn,
				},
				position: {
					lineNumber: selection.positionLineNumber,
					column: selection.positionColumn,
				}
			});
		}

		return result;
	}

	public restoreState(states: editorCommon.ICursorState[]): void {

		let desiredSelections: ISelection[] = [];

		for (let i = 0, len = states.length; i < len; i++) {
			const state = states[i];

			let positionLineNumber = 1;
			let positionColumn = 1;

			// Avoid missing properties on the literal
			if (state.position && state.position.lineNumber) {
				positionLineNumber = state.position.lineNumber;
			}
			if (state.position && state.position.column) {
				positionColumn = state.position.column;
			}

			let selectionStartLineNumber = positionLineNumber;
			let selectionStartColumn = positionColumn;

			// Avoid missing properties on the literal
			if (state.selectionStart && state.selectionStart.lineNumber) {
				selectionStartLineNumber = state.selectionStart.lineNumber;
			}
			if (state.selectionStart && state.selectionStart.column) {
				selectionStartColumn = state.selectionStart.column;
			}

			desiredSelections.push({
				selectionStartLineNumber: selectionStartLineNumber,
				selectionStartColumn: selectionStartColumn,
				positionLineNumber: positionLineNumber,
				positionColumn: positionColumn
			});
		}

		this.setStates('restoreState', CursorChangeReason.NotSet, CursorState.fromModelSelections(desiredSelections));
		this.reveal(true, RevealTarget.Primary);
	}

	private _onModelContentChanged(hadFlushEvent: boolean): void {
		if (hadFlushEvent) {
			// a model.setValue() was called
			this._cursors.dispose();
			this._cursors = new CursorCollection(this.context);

			this._emitCursorPositionChanged('model', CursorChangeReason.ContentFlush);
			this._emitCursorSelectionChanged('model', CursorChangeReason.ContentFlush);
		} else {
			const selectionsFromMarkers = this._cursors.readSelectionFromMarkers();
			this.setStates('modelChange', CursorChangeReason.RecoverFromMarkers, CursorState.fromModelSelections(selectionsFromMarkers));
		}
	}

	// ------ some getters/setters

	public getSelection(): Selection {
		return this._cursors.getPrimaryCursor().modelState.selection;
	}

	public getSelections(): Selection[] {
		return this._cursors.getSelections();
	}

	public getPosition(): Position {
		return this._cursors.getPrimaryCursor().modelState.position;
	}

	public setSelections(source: string, selections: ISelection[]): void {
		this.setStates(source, CursorChangeReason.NotSet, CursorState.fromModelSelections(selections));
	}

	// ------ auxiliary handling logic

	private _createAndInterpretHandlerCtx(callback: () => EditOperationResult): void {

		const opResult = callback();

		if (opResult && opResult.shouldPushStackElementBefore) {
			this._model.pushStackElement();
		}

		this._columnSelectData = null;

		if (opResult && !this._configuration.editor.readOnly) {
			const result = CommandExecutor.executeCommands(this._model, this._cursors.getSelections(), opResult.commands);
			if (result) {
				// The commands were applied correctly
				this._interpretCommandResult(result);
			}
		}

		if (opResult && opResult.shouldPushStackElementAfter) {
			this._model.pushStackElement();
		}

		this._cursors.normalize();
	}

	private _onHandler(command: string, handler: (args: CursorOperationArgs<any>) => EditOperationResult, args: CursorOperationArgs<any>): void {

		this._isHandling = true;

		try {
			const oldSelections = this._cursors.getSelections();
			const oldViewSelections = this._cursors.getViewSelections();

			// ensure valid state on all cursors
			this._cursors.ensureValidState();

			let cursorPositionChangeReason: CursorChangeReason;

			this._createAndInterpretHandlerCtx(() => {
				let r = handler(args);
				cursorPositionChangeReason = r ? r.reason : CursorChangeReason.NotSet;
				return r;
			});

			const newSelections = this._cursors.getSelections();
			const newViewSelections = this._cursors.getViewSelections();

			let somethingChanged = false;
			if (oldSelections.length !== newSelections.length) {
				somethingChanged = true;
			} else {
				for (let i = 0, len = oldSelections.length; !somethingChanged && i < len; i++) {
					if (!oldSelections[i].equalsSelection(newSelections[i])) {
						somethingChanged = true;
					}
				}
				for (let i = 0, len = oldViewSelections.length; !somethingChanged && i < len; i++) {
					if (!oldViewSelections[i].equalsSelection(newViewSelections[i])) {
						somethingChanged = true;
					}
				}
			}

			if (somethingChanged) {
				this._emitCursorPositionChanged(args.eventSource, cursorPositionChangeReason);
				this._revealRange(RevealTarget.Primary, VerticalRevealType.Simple, true);
				this._emitCursorSelectionChanged(args.eventSource, cursorPositionChangeReason);
			}

		} catch (err) {
			onUnexpectedError(err);
		}

		this._isHandling = false;
	}

	private _interpretCommandResult(cursorState: Selection[]): void {
		if (!cursorState || cursorState.length === 0) {
			return;
		}

		this._cursors.setSelections(cursorState);
	}

	// -----------------------------------------------------------------------------------------------------------
	// ----- emitting events

	private _emitCursorPositionChanged(source: string, reason: CursorChangeReason): void {
		const positions = this._cursors.getPositions();
		const primaryPosition = positions[0];
		const secondaryPositions = positions.slice(1);

		const viewPositions = this._cursors.getViewPositions();
		const primaryViewPosition = viewPositions[0];
		const secondaryViewPositions = viewPositions.slice(1);

		let isInEditableRange: boolean = true;
		if (this._model.hasEditableRange()) {
			const editableRange = this._model.getEditableRange();
			if (!editableRange.containsPosition(primaryPosition)) {
				isInEditableRange = false;
			}
		}
		const e: ICursorPositionChangedEvent = {
			position: primaryPosition,
			viewPosition: primaryViewPosition,
			secondaryPositions: secondaryPositions,
			secondaryViewPositions: secondaryViewPositions,
			reason: reason,
			source: source,
			isInEditableRange: isInEditableRange
		};
		this._eventEmitter.emit(CursorEventType.CursorPositionChanged, e);
	}

	private _emitCursorSelectionChanged(source: string, reason: CursorChangeReason): void {
		const selections = this._cursors.getSelections();
		const primarySelection = selections[0];
		const secondarySelections = selections.slice(1);

		const viewSelections = this._cursors.getViewSelections();
		const primaryViewSelection = viewSelections[0];
		const secondaryViewSelections = viewSelections.slice(1);

		const e: ICursorSelectionChangedEvent = {
			selection: primarySelection,
			viewSelection: primaryViewSelection,
			secondarySelections: secondarySelections,
			secondaryViewSelections: secondaryViewSelections,
			source: source || 'keyboard',
			reason: reason
		};
		this._eventEmitter.emit(CursorEventType.CursorSelectionChanged, e);
	}

	private _revealRange(revealTarget: RevealTarget, verticalType: VerticalRevealType, revealHorizontal: boolean): void {
		const positions = this._cursors.getPositions();
		const viewPositions = this._cursors.getViewPositions();

		let position = positions[0];
		let viewPosition = viewPositions[0];

		if (revealTarget === RevealTarget.TopMost) {
			for (let i = 1; i < positions.length; i++) {
				if (positions[i].isBefore(position)) {
					position = positions[i];
					viewPosition = viewPositions[i];
				}
			}
		} else if (revealTarget === RevealTarget.BottomMost) {
			for (let i = 1; i < positions.length; i++) {
				if (position.isBeforeOrEqual(positions[i])) {
					position = positions[i];
					viewPosition = viewPositions[i];
				}
			}
		} else {
			if (positions.length > 1) {
				// no revealing!
				return;
			}
		}

		const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		const viewRange = new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column);
		this.emitCursorRevealRange(range, viewRange, verticalType, revealHorizontal);
	}

	public emitCursorRevealRange(range: Range, viewRange: Range, verticalType: VerticalRevealType, revealHorizontal: boolean) {
		const e: ICursorRevealRangeEvent = {
			range: range,
			viewRange: viewRange,
			verticalType: verticalType,
			revealHorizontal: revealHorizontal
		};
		this._eventEmitter.emit(CursorEventType.CursorRevealRange, e);
	}

	// -----------------------------------------------------------------------------------------------------------
	// ----- handlers beyond this point

	public trigger(source: string, handlerId: string, payload: any): void {
		if (!this._handlers.hasOwnProperty(handlerId)) {
			const command = CommonEditorRegistry.getEditorCommand(handlerId);
			if (!command || !(command instanceof CoreEditorCommand)) {
				return;
			}

			payload = payload || {};
			payload.source = source;
			command.runCoreEditorCommand(this, payload);
			return;
		}
		const handler = this._handlers[handlerId];
		const args = new CursorOperationArgs(source, payload);
		this._onHandler(handlerId, handler, args);
	}

	private _registerHandlers(): void {
		let H = editorCommon.Handler;

		this._handlers[H.Type] = (args) => this._type(args);
		this._handlers[H.ReplacePreviousChar] = (args) => this._replacePreviousChar(args);
		this._handlers[H.CompositionStart] = (args) => this._compositionStart(args);
		this._handlers[H.CompositionEnd] = (args) => this._compositionEnd(args);
		this._handlers[H.Paste] = (args) => this._paste(args);

		this._handlers[H.Cut] = (args) => this._cut(args);

		this._handlers[H.Undo] = (args) => this._undo(args);
		this._handlers[H.Redo] = (args) => this._redo(args);

		this._handlers[H.ExecuteCommand] = (args) => this._externalExecuteCommand(args);
		this._handlers[H.ExecuteCommands] = (args) => this._externalExecuteCommands(args);
	}

	public getColumnSelectData(): IColumnSelectData {
		if (this._columnSelectData) {
			return this._columnSelectData;
		}
		const primaryCursor = this._cursors.getPrimaryCursor();
		const primaryPos = primaryCursor.viewState.position;
		return {
			toViewLineNumber: primaryPos.lineNumber,
			toViewVisualColumn: CursorColumns.visibleColumnFromColumn2(this.context.config, this.context.viewModel, primaryPos)
		};
	}

	// -------------------- START editing operations

	private _type(args: CursorOperationArgs<{ text: string; }>): EditOperationResult {
		const text = args.eventData.text;

		if (!this._isDoingComposition && args.eventSource === 'keyboard') {
			// If this event is coming straight from the keyboard, look for electric characters and enter

			for (let i = 0, len = text.length; i < len; i++) {
				let charCode = text.charCodeAt(i);
				let chr: string;
				if (strings.isHighSurrogate(charCode) && i + 1 < len) {
					chr = text.charAt(i) + text.charAt(i + 1);
					i++;
				} else {
					chr = text.charAt(i);
				}

				// Here we must interpret each typed character individually, that's why we create a new context
				this._createAndInterpretHandlerCtx(() => {

					// Decide what all cursors will do up-front
					return TypeOperations.typeWithInterceptors(this.context.config, this.context.model, this.getSelections(), chr);
				});

			}

			return null;
		} else {
			return TypeOperations.typeWithoutInterceptors(this.context.config, this.context.model, this.getSelections(), text);
		}
	}

	private _replacePreviousChar(args: CursorOperationArgs<{ text: string; replaceCharCnt: number; }>): EditOperationResult {
		let text = args.eventData.text;
		let replaceCharCnt = args.eventData.replaceCharCnt;
		return TypeOperations.replacePreviousChar(this.context.config, this.context.model, this.getSelections(), text, replaceCharCnt);
	}

	private _compositionStart(args: CursorOperationArgs<void>): EditOperationResult {
		this._isDoingComposition = true;
		return null;
	}

	private _compositionEnd(args: CursorOperationArgs<void>): EditOperationResult {
		this._isDoingComposition = false;
		return null;
	}

	private _distributePasteToCursors(args: CursorOperationArgs<{ pasteOnNewLine: boolean; text: string; }>): string[] {
		if (args.eventData.pasteOnNewLine) {
			return null;
		}

		const selections = this._cursors.getSelections();
		if (selections.length === 1) {
			return null;
		}

		for (let i = 0; i < selections.length; i++) {
			if (selections[i].startLineNumber !== selections[i].endLineNumber) {
				return null;
			}
		}

		let pastePieces = args.eventData.text.split(/\r\n|\r|\n/);
		if (pastePieces.length !== selections.length) {
			return null;
		}

		return pastePieces;
	}

	private _paste(args: CursorOperationArgs<{ pasteOnNewLine: boolean; text: string; }>): EditOperationResult {
		const distributedPaste = this._distributePasteToCursors(args);

		if (distributedPaste) {
			let selections = this.getSelections();
			selections = selections.sort(Range.compareRangesUsingStarts);
			return TypeOperations.distributedPaste(this.context.config, this.context.model, selections, distributedPaste);
		} else {
			return TypeOperations.paste(this.context.config, this.context.model, this.getSelections(), args.eventData.text, args.eventData.pasteOnNewLine);
		}
	}

	private _cut(args: CursorOperationArgs<void>): EditOperationResult {
		return DeleteOperations.cut(this.context.config, this.context.model, this.getSelections());
	}

	// -------------------- END editing operations

	private _undo(args: CursorOperationArgs<void>): EditOperationResult {
		this._interpretCommandResult(this._model.undo());

		return new EditOperationResult([], {
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false,
			reason: CursorChangeReason.Undo
		});
	}

	private _redo(args: CursorOperationArgs<void>): EditOperationResult {
		this._interpretCommandResult(this._model.redo());

		return new EditOperationResult([], {
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false,
			reason: CursorChangeReason.Redo
		});
	}

	private _externalExecuteCommand(args: CursorOperationArgs<editorCommon.ICommand>): EditOperationResult {
		const command = args.eventData;

		this._cursors.killSecondaryCursors();

		return new EditOperationResult([command], {
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false
		});
	}

	private _externalExecuteCommands(args: CursorOperationArgs<editorCommon.ICommand[]>): EditOperationResult {
		const commands = args.eventData;

		return new EditOperationResult(commands, {
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false
		});
	}
}

interface IExecContext {
	readonly model: editorCommon.IModel;
	readonly selectionsBefore: Selection[];
	readonly selectionStartMarkers: string[];
	readonly positionMarkers: string[];
}

class CommandExecutor {

	public static executeCommands(model: editorCommon.IModel, selectionsBefore: Selection[], commands: editorCommon.ICommand[]): Selection[] {

		const ctx: IExecContext = {
			model: model,
			selectionsBefore: selectionsBefore,
			selectionStartMarkers: [],
			positionMarkers: []
		};

		const result = this._innerExecuteCommands(ctx, commands);

		for (let i = 0; i < ctx.selectionStartMarkers.length; i++) {
			ctx.model._removeMarker(ctx.selectionStartMarkers[i]);
			ctx.model._removeMarker(ctx.positionMarkers[i]);
		}

		return result;
	}

	private static _innerExecuteCommands(ctx: IExecContext, commands: editorCommon.ICommand[]): Selection[] {

		if (this._arrayIsEmpty(commands)) {
			return null;
		}

		const commandsData = this._getEditOperations(ctx, commands);
		if (commandsData.operations.length === 0) {
			return null;
		}

		const rawOperations = commandsData.operations;

		const editableRange = ctx.model.getEditableRange();
		const editableRangeStart = editableRange.getStartPosition();
		const editableRangeEnd = editableRange.getEndPosition();
		for (let i = 0, len = rawOperations.length; i < len; i++) {
			const operationRange = rawOperations[i].range;
			if (!editableRangeStart.isBeforeOrEqual(operationRange.getStartPosition()) || !operationRange.getEndPosition().isBeforeOrEqual(editableRangeEnd)) {
				// These commands are outside of the editable range
				return null;
			}
		}

		const loserCursorsMap = this._getLoserCursorMap(rawOperations);
		if (loserCursorsMap.hasOwnProperty('0')) {
			// These commands are very messed up
			console.warn('Ignoring commands');
			return null;
		}

		// Remove operations belonging to losing cursors
		let filteredOperations: editorCommon.IIdentifiedSingleEditOperation[] = [];
		for (let i = 0, len = rawOperations.length; i < len; i++) {
			if (!loserCursorsMap.hasOwnProperty(rawOperations[i].identifier.major.toString())) {
				filteredOperations.push(rawOperations[i]);
			}
		}

		// TODO@Alex: find a better way to do this.
		// give the hint that edit operations are tracked to the model
		if (commandsData.hadTrackedEditOperation && filteredOperations.length > 0) {
			filteredOperations[0]._isTracked = true;
		}
		const selectionsAfter = ctx.model.pushEditOperations(ctx.selectionsBefore, filteredOperations, (inverseEditOperations: editorCommon.IIdentifiedSingleEditOperation[]): Selection[] => {
			let groupedInverseEditOperations: editorCommon.IIdentifiedSingleEditOperation[][] = [];
			for (let i = 0; i < ctx.selectionsBefore.length; i++) {
				groupedInverseEditOperations[i] = [];
			}
			for (let i = 0; i < inverseEditOperations.length; i++) {
				const op = inverseEditOperations[i];
				if (!op.identifier) {
					// perhaps auto whitespace trim edits
					continue;
				}
				groupedInverseEditOperations[op.identifier.major].push(op);
			}
			const minorBasedSorter = (a: editorCommon.IIdentifiedSingleEditOperation, b: editorCommon.IIdentifiedSingleEditOperation) => {
				return a.identifier.minor - b.identifier.minor;
			};
			let cursorSelections: Selection[] = [];
			for (let i = 0; i < ctx.selectionsBefore.length; i++) {
				if (groupedInverseEditOperations[i].length > 0) {
					groupedInverseEditOperations[i].sort(minorBasedSorter);
					cursorSelections[i] = commands[i].computeCursorState(ctx.model, {
						getInverseEditOperations: () => {
							return groupedInverseEditOperations[i];
						},

						getTrackedSelection: (id: string) => {
							const idx = parseInt(id, 10);
							const selectionStartMarker = ctx.model._getMarker(ctx.selectionStartMarkers[idx]);
							const positionMarker = ctx.model._getMarker(ctx.positionMarkers[idx]);
							return new Selection(selectionStartMarker.lineNumber, selectionStartMarker.column, positionMarker.lineNumber, positionMarker.column);
						}
					});
				} else {
					cursorSelections[i] = ctx.selectionsBefore[i];
				}
			}
			return cursorSelections;
		});

		// Extract losing cursors
		let losingCursors: number[] = [];
		for (let losingCursorIndex in loserCursorsMap) {
			if (loserCursorsMap.hasOwnProperty(losingCursorIndex)) {
				losingCursors.push(parseInt(losingCursorIndex, 10));
			}
		}

		// Sort losing cursors descending
		losingCursors.sort((a: number, b: number): number => {
			return b - a;
		});

		// Remove losing cursors
		for (let i = 0; i < losingCursors.length; i++) {
			selectionsAfter.splice(losingCursors[i], 1);
		}

		return selectionsAfter;
	}

	private static _arrayIsEmpty(commands: editorCommon.ICommand[]): boolean {
		for (let i = 0, len = commands.length; i < len; i++) {
			if (commands[i]) {
				return false;
			}
		}
		return true;
	}

	private static _getEditOperations(ctx: IExecContext, commands: editorCommon.ICommand[]): ICommandsData {
		let operations: editorCommon.IIdentifiedSingleEditOperation[] = [];
		let hadTrackedEditOperation: boolean = false;

		for (let i = 0, len = commands.length; i < len; i++) {
			if (commands[i]) {
				const r = this._getEditOperationsFromCommand(ctx, i, commands[i]);
				operations = operations.concat(r.operations);
				hadTrackedEditOperation = hadTrackedEditOperation || r.hadTrackedEditOperation;
			}
		}
		return {
			operations: operations,
			hadTrackedEditOperation: hadTrackedEditOperation
		};
	}

	private static _getEditOperationsFromCommand(ctx: IExecContext, majorIdentifier: number, command: editorCommon.ICommand): ICommandData {
		// This method acts as a transaction, if the command fails
		// everything it has done is ignored
		let operations: editorCommon.IIdentifiedSingleEditOperation[] = [];
		let operationMinor = 0;

		const addEditOperation = (selection: Range, text: string) => {
			if (selection.isEmpty() && text === '') {
				// This command wants to add a no-op => no thank you
				return;
			}
			operations.push({
				identifier: {
					major: majorIdentifier,
					minor: operationMinor++
				},
				range: selection,
				text: text,
				forceMoveMarkers: false,
				isAutoWhitespaceEdit: command.insertsAutoWhitespace
			});
		};

		let hadTrackedEditOperation = false;
		const addTrackedEditOperation = (selection: Range, text: string) => {
			hadTrackedEditOperation = true;
			addEditOperation(selection, text);
		};

		const trackSelection = (selection: Selection, trackPreviousOnEmpty?: boolean) => {
			let selectionMarkerStickToPreviousCharacter: boolean;
			let positionMarkerStickToPreviousCharacter: boolean;

			if (selection.isEmpty()) {
				// Try to lock it with surrounding text
				if (typeof trackPreviousOnEmpty === 'boolean') {
					selectionMarkerStickToPreviousCharacter = trackPreviousOnEmpty;
					positionMarkerStickToPreviousCharacter = trackPreviousOnEmpty;
				} else {
					const maxLineColumn = ctx.model.getLineMaxColumn(selection.startLineNumber);
					if (selection.startColumn === maxLineColumn) {
						selectionMarkerStickToPreviousCharacter = true;
						positionMarkerStickToPreviousCharacter = true;
					} else {
						selectionMarkerStickToPreviousCharacter = false;
						positionMarkerStickToPreviousCharacter = false;
					}
				}
			} else {
				if (selection.getDirection() === SelectionDirection.LTR) {
					selectionMarkerStickToPreviousCharacter = false;
					positionMarkerStickToPreviousCharacter = true;
				} else {
					selectionMarkerStickToPreviousCharacter = true;
					positionMarkerStickToPreviousCharacter = false;
				}
			}

			const l = ctx.selectionStartMarkers.length;
			ctx.selectionStartMarkers[l] = ctx.model._addMarker(0, selection.selectionStartLineNumber, selection.selectionStartColumn, selectionMarkerStickToPreviousCharacter);
			ctx.positionMarkers[l] = ctx.model._addMarker(0, selection.positionLineNumber, selection.positionColumn, positionMarkerStickToPreviousCharacter);
			return l.toString();
		};

		const editOperationBuilder: editorCommon.IEditOperationBuilder = {
			addEditOperation: addEditOperation,
			addTrackedEditOperation: addTrackedEditOperation,
			trackSelection: trackSelection
		};

		try {
			command.getEditOperations(ctx.model, editOperationBuilder);
		} catch (e) {
			e.friendlyMessage = nls.localize('corrupt.commands', "Unexpected exception while executing command.");
			onUnexpectedError(e);
			return {
				operations: [],
				hadTrackedEditOperation: false
			};
		}

		return {
			operations: operations,
			hadTrackedEditOperation: hadTrackedEditOperation
		};
	}

	private static _getLoserCursorMap(operations: editorCommon.IIdentifiedSingleEditOperation[]): { [index: string]: boolean; } {
		// This is destructive on the array
		operations = operations.slice(0);

		// Sort operations with last one first
		operations.sort((a: editorCommon.IIdentifiedSingleEditOperation, b: editorCommon.IIdentifiedSingleEditOperation): number => {
			// Note the minus!
			return -(Range.compareRangesUsingEnds(a.range, b.range));
		});

		// Operations can not overlap!
		let loserCursorsMap: { [index: string]: boolean; } = {};

		for (let i = 1; i < operations.length; i++) {
			const previousOp = operations[i - 1];
			const currentOp = operations[i];

			if (previousOp.range.getStartPosition().isBefore(currentOp.range.getEndPosition())) {

				let loserMajor: number;

				if (previousOp.identifier.major > currentOp.identifier.major) {
					// previousOp loses the battle
					loserMajor = previousOp.identifier.major;
				} else {
					loserMajor = currentOp.identifier.major;
				}

				loserCursorsMap[loserMajor.toString()] = true;

				for (let j = 0; j < operations.length; j++) {
					if (operations[j].identifier.major === loserMajor) {
						operations.splice(j, 1);
						if (j < i) {
							i--;
						}
						j--;
					}
				}

				if (i > 0) {
					i--;
				}
			}
		}

		return loserCursorsMap;
	}
}
