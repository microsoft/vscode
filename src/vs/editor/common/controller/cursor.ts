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
import { CursorColumns, CursorConfiguration, EditOperationResult, SingleCursorState, IViewModelHelper, CursorContext, CursorState, RevealTarget, IColumnSelectData, ICursors } from 'vs/editor/common/controller/cursorCommon';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { DeleteOperations } from 'vs/editor/common/controller/cursorDeleteOperations';
import { TypeOperations } from 'vs/editor/common/controller/cursorTypeOperations';
import { TextModelEventType, ModelRawContentChangedEvent, RawContentChangedType } from 'vs/editor/common/model/textModelEvents';
import { CursorEventType, CursorChangeReason, ICursorPositionChangedEvent, VerticalRevealType, ICursorSelectionChangedEvent, ICursorRevealRangeEvent, CursorScrollRequest } from 'vs/editor/common/controller/cursorEvents';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { CoreEditorCommand } from 'vs/editor/common/controller/coreCommands';

interface IMultipleCursorOperationContext {
	cursorPositionChangeReason: CursorChangeReason;
	shouldReveal: boolean;
	shouldPushStackElementBefore: boolean;
	shouldPushStackElementAfter: boolean;
	eventSource: string;
	eventData: any;
	executeCommands: editorCommon.ICommand[];
	isAutoWhitespaceCommand: boolean[];
}

interface IExecContext {
	selectionStartMarkers: string[];
	positionMarkers: string[];
}

interface ICommandData {
	operations: editorCommon.IIdentifiedSingleEditOperation[];
	hadTrackedRange: boolean;
	hadTrackedEditOperation: boolean;
}

interface ICommandsData {
	operations: editorCommon.IIdentifiedSingleEditOperation[];
	hadTrackedRanges: boolean[];
	anyoneHadTrackedRange: boolean;
	anyoneHadTrackedEditOperation: boolean;
}

export class Cursor extends Disposable implements ICursors {

	public onDidChangePosition(listener: (e: ICursorPositionChangedEvent) => void): IDisposable {
		return this._eventEmitter.addListener(CursorEventType.CursorPositionChanged, listener);
	}
	public onDidChangeSelection(listener: (e: ICursorSelectionChangedEvent) => void): IDisposable {
		return this._eventEmitter.addListener(CursorEventType.CursorSelectionChanged, listener);
	}

	private configuration: editorCommon.IConfiguration;
	public context: CursorContext;
	private model: editorCommon.IModel;
	private _eventEmitter: EventEmitter;

	public addBulkListener(listener: BulkListenerCallback): IDisposable {
		return this._eventEmitter.addBulkListener(listener);
	}

	private cursors: CursorCollection;
	private viewModelHelper: IViewModelHelper;

	private _isHandling: boolean;
	private _isDoingComposition: boolean;
	private _columnSelectData: IColumnSelectData;

	private enableEmptySelectionClipboard: boolean;

	private _handlers: {
		[key: string]: (ctx: IMultipleCursorOperationContext) => void;
	};

	constructor(configuration: editorCommon.IConfiguration, model: editorCommon.IModel, viewModelHelper: IViewModelHelper, enableEmptySelectionClipboard: boolean) {
		super();
		this._eventEmitter = this._register(new EventEmitter());
		this.configuration = configuration;
		this.model = model;
		this.viewModelHelper = viewModelHelper;
		this.enableEmptySelectionClipboard = enableEmptySelectionClipboard;

		const createCursorContext = () => {
			const config = new CursorConfiguration(
				this.model.getLanguageIdentifier(),
				this.model.getOneIndent(),
				this.model.getOptions(),
				this.configuration
			);
			this.context = new CursorContext(
				this.model,
				this.viewModelHelper,
				config
			);
			if (this.cursors) {
				this.cursors.updateContext(this.context);
			}
		};
		createCursorContext();

		this.cursors = new CursorCollection(this.context);

		this._isHandling = false;
		this._isDoingComposition = false;
		this._columnSelectData = null;

		this._register(this.model.addBulkListener((events) => {
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
					const changeEvent = <ModelRawContentChangedEvent>event.data;

					for (let j = 0, lenJ = changeEvent.changes.length; j < lenJ; j++) {
						const change = changeEvent.changes[j];
						if (change.changeType === RawContentChangedType.Flush) {
							hadFlushEvent = true;
						}
					}
				}
			}

			if (!hadContentChange) {
				return;
			}

			this._onModelContentChanged(hadFlushEvent);
		}));

		this._register(this.model.onDidChangeLanguage((e) => {
			createCursorContext();
		}));
		this._register(LanguageConfigurationRegistry.onDidChange(() => {
			// TODO@Alex: react only if certain supports changed? (and if my model's mode changed)
			createCursorContext();
		}));
		this._register(model.onDidChangeOptions(() => {
			createCursorContext();
		}));
		this._register(this.configuration.onDidChange((e) => {
			if (CursorConfiguration.shouldRecreate(e)) {
				createCursorContext();
			}
		}));

		this._handlers = {};
		this._registerHandlers();
	}

	public dispose(): void {
		this.model = null;
		this.cursors.dispose();
		this.cursors = null;
		this.configuration = null;
		this.viewModelHelper = null;
		super.dispose();
	}

	public getPrimaryCursor(): CursorState {
		return this.cursors.getPrimaryCursor();
	}

	public getLastAddedCursorIndex(): number {
		return this.cursors.getLastAddedCursorIndex();
	}

	public getAll(): CursorState[] {
		return this.cursors.getAll();
	}

	public setStates(source: string, reason: CursorChangeReason, states: CursorState[]): void {
		const oldSelections = this.cursors.getSelections();
		const oldViewSelections = this.cursors.getViewSelections();

		// TODO@Alex
		// ensure valid state on all cursors
		// this.cursors.ensureValidState();

		this.cursors.setStates(states);
		this.cursors.normalize();
		this._columnSelectData = null;

		const newSelections = this.cursors.getSelections();
		const newViewSelections = this.cursors.getViewSelections();

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
			this.emitCursorPositionChanged(source, reason);
			this.emitCursorSelectionChanged(source, reason);
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

		var selections = this.cursors.getSelections(),
			result: editorCommon.ICursorState[] = [],
			selection: Selection;

		for (var i = 0; i < selections.length; i++) {
			selection = selections[i];

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

		var desiredSelections: ISelection[] = [],
			state: editorCommon.ICursorState;

		for (var i = 0; i < states.length; i++) {
			state = states[i];

			var positionLineNumber = 1, positionColumn = 1;

			// Avoid missing properties on the literal
			if (state.position && state.position.lineNumber) {
				positionLineNumber = state.position.lineNumber;
			}
			if (state.position && state.position.column) {
				positionColumn = state.position.column;
			}

			var selectionStartLineNumber = positionLineNumber, selectionStartColumn = positionColumn;

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

		this._onHandler('restoreState', (ctx: IMultipleCursorOperationContext) => {
			this.cursors.setSelections(desiredSelections);
			return false;
		}, 'restoreState', null);
	}

	private _onModelContentChanged(hadFlushEvent: boolean): void {
		if (hadFlushEvent) {
			// a model.setValue() was called
			this.cursors.dispose();

			this.cursors = new CursorCollection(this.context);

			this.emitCursorPositionChanged('model', CursorChangeReason.ContentFlush);
			this.emitCursorSelectionChanged('model', CursorChangeReason.ContentFlush);
		} else {
			if (!this._isHandling) {
				// Read the markers before entering `_onHandler`, since that would validate
				// the position and ruin the markers
				const selectionsFromMarkers = this.cursors.readSelectionFromMarkers();
				this._onHandler('recoverSelectionFromMarkers', (ctx: IMultipleCursorOperationContext) => {
					ctx.cursorPositionChangeReason = CursorChangeReason.RecoverFromMarkers;
					ctx.shouldReveal = false;
					ctx.shouldPushStackElementBefore = false;
					ctx.shouldPushStackElementAfter = false;
					this.cursors.setSelections(selectionsFromMarkers);
				}, 'modelChange', null);
			}
		}
	}

	// ------ some getters/setters

	public getSelection(): Selection {
		return this.cursors.getPrimaryCursor().modelState.selection;
	}

	public getSelections(): Selection[] {
		return this.cursors.getSelections();
	}

	public getPosition(): Position {
		return this.cursors.getPrimaryCursor().modelState.position;
	}

	public setSelections(source: string, selections: ISelection[]): void {
		this._onHandler('setSelections', (ctx: IMultipleCursorOperationContext) => {
			ctx.shouldReveal = false;
			this.cursors.setSelections(selections);
			return false;
		}, source, null);
	}

	// ------ auxiliary handling logic

	private _createAndInterpretHandlerCtx(eventSource: string, eventData: any, callback: (currentHandlerCtx: IMultipleCursorOperationContext) => void): void {

		var ctx: IMultipleCursorOperationContext = {
			cursorPositionChangeReason: CursorChangeReason.NotSet,
			shouldReveal: true,
			eventSource: eventSource,
			eventData: eventData,
			executeCommands: [],
			isAutoWhitespaceCommand: [],
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false
		};

		callback(ctx);

		this._interpretHandlerContext(ctx);
		this.cursors.normalize();
	}

	private _onHandler(command: string, handler: (ctx: IMultipleCursorOperationContext) => void, source: string, data: any): void {

		this._isHandling = true;

		try {
			const oldSelections = this.cursors.getSelections();
			const oldViewSelections = this.cursors.getViewSelections();

			// ensure valid state on all cursors
			this.cursors.ensureValidState();

			let cursorPositionChangeReason: CursorChangeReason;
			let shouldReveal: boolean;

			this._createAndInterpretHandlerCtx(source, data, (currentHandlerCtx: IMultipleCursorOperationContext) => {
				handler(currentHandlerCtx);

				cursorPositionChangeReason = currentHandlerCtx.cursorPositionChangeReason;
				shouldReveal = currentHandlerCtx.shouldReveal;
			});

			const newSelections = this.cursors.getSelections();
			const newViewSelections = this.cursors.getViewSelections();

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
				this.emitCursorPositionChanged(source, cursorPositionChangeReason);

				if (shouldReveal) {
					this._revealRange(RevealTarget.Primary, VerticalRevealType.Simple, true);
				}
				this.emitCursorSelectionChanged(source, cursorPositionChangeReason);
			}

		} catch (err) {
			onUnexpectedError(err);
		}

		this._isHandling = false;
	}

	private _interpretHandlerContext(ctx: IMultipleCursorOperationContext): void {
		if (ctx.shouldPushStackElementBefore) {
			this.model.pushStackElement();
			ctx.shouldPushStackElementBefore = false;
		}

		this._columnSelectData = null;

		this._internalExecuteCommands(ctx.executeCommands, ctx.isAutoWhitespaceCommand);
		ctx.executeCommands = [];

		if (ctx.shouldPushStackElementAfter) {
			this.model.pushStackElement();
			ctx.shouldPushStackElementAfter = false;
		}
	}

	private _interpretCommandResult(cursorState: Selection[]): void {
		if (!cursorState || cursorState.length === 0) {
			return;
		}

		this.cursors.setSelections(cursorState);
	}

	private _getEditOperationsFromCommand(ctx: IExecContext, majorIdentifier: number, command: editorCommon.ICommand, isAutoWhitespaceCommand: boolean): ICommandData {
		// This method acts as a transaction, if the command fails
		// everything it has done is ignored
		var operations: editorCommon.IIdentifiedSingleEditOperation[] = [],
			operationMinor = 0;

		var addEditOperation = (selection: Range, text: string) => {
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
				isAutoWhitespaceEdit: isAutoWhitespaceCommand
			});
		};

		var hadTrackedEditOperation = false;
		var addTrackedEditOperation = (selection: Range, text: string) => {
			hadTrackedEditOperation = true;
			addEditOperation(selection, text);
		};

		var hadTrackedRange = false;
		var trackSelection = (selection: Selection, trackPreviousOnEmpty?: boolean) => {
			var selectionMarkerStickToPreviousCharacter: boolean,
				positionMarkerStickToPreviousCharacter: boolean;

			if (selection.isEmpty()) {
				// Try to lock it with surrounding text
				if (typeof trackPreviousOnEmpty === 'boolean') {
					selectionMarkerStickToPreviousCharacter = trackPreviousOnEmpty;
					positionMarkerStickToPreviousCharacter = trackPreviousOnEmpty;
				} else {
					var maxLineColumn = this.model.getLineMaxColumn(selection.startLineNumber);
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

			var l = ctx.selectionStartMarkers.length;
			ctx.selectionStartMarkers[l] = this.model._addMarker(0, selection.selectionStartLineNumber, selection.selectionStartColumn, selectionMarkerStickToPreviousCharacter);
			ctx.positionMarkers[l] = this.model._addMarker(0, selection.positionLineNumber, selection.positionColumn, positionMarkerStickToPreviousCharacter);
			return l.toString();
		};

		var editOperationBuilder: editorCommon.IEditOperationBuilder = {
			addEditOperation: addEditOperation,
			addTrackedEditOperation: addTrackedEditOperation,
			trackSelection: trackSelection
		};

		try {
			command.getEditOperations(this.model, editOperationBuilder);
		} catch (e) {
			e.friendlyMessage = nls.localize('corrupt.commands', "Unexpected exception while executing command.");
			onUnexpectedError(e);
			return {
				operations: [],
				hadTrackedRange: false,
				hadTrackedEditOperation: false
			};
		}

		return {
			operations: operations,
			hadTrackedRange: hadTrackedRange,
			hadTrackedEditOperation: hadTrackedEditOperation
		};
	}

	private _getEditOperations(ctx: IExecContext, commands: editorCommon.ICommand[], isAutoWhitespaceCommand: boolean[]): ICommandsData {
		var oneResult: ICommandData;
		var operations: editorCommon.IIdentifiedSingleEditOperation[] = [];
		var hadTrackedRanges: boolean[] = [];
		var anyoneHadTrackedEditOperation: boolean = false;
		var anyoneHadTrackedRange: boolean;

		for (var i = 0; i < commands.length; i++) {
			if (commands[i]) {
				oneResult = this._getEditOperationsFromCommand(ctx, i, commands[i], isAutoWhitespaceCommand[i]);
				operations = operations.concat(oneResult.operations);
				hadTrackedRanges[i] = oneResult.hadTrackedRange;
				anyoneHadTrackedRange = anyoneHadTrackedRange || hadTrackedRanges[i];
				anyoneHadTrackedEditOperation = anyoneHadTrackedEditOperation || oneResult.hadTrackedEditOperation;
			} else {
				hadTrackedRanges[i] = false;
			}
		}
		return {
			operations: operations,
			hadTrackedRanges: hadTrackedRanges,
			anyoneHadTrackedRange: anyoneHadTrackedRange,
			anyoneHadTrackedEditOperation: anyoneHadTrackedEditOperation
		};
	}

	private _getLoserCursorMap(operations: editorCommon.IIdentifiedSingleEditOperation[]): { [index: string]: boolean; } {
		// This is destructive on the array
		operations = operations.slice(0);

		// Sort operations with last one first
		operations.sort((a: editorCommon.IIdentifiedSingleEditOperation, b: editorCommon.IIdentifiedSingleEditOperation): number => {
			// Note the minus!
			return -(Range.compareRangesUsingEnds(a.range, b.range));
		});

		// Operations can not overlap!
		var loserCursorsMap: { [index: string]: boolean; } = {};

		var previousOp: editorCommon.IIdentifiedSingleEditOperation;
		var currentOp: editorCommon.IIdentifiedSingleEditOperation;
		var loserMajor: number;

		for (var i = 1; i < operations.length; i++) {
			previousOp = operations[i - 1];
			currentOp = operations[i];

			if (previousOp.range.getStartPosition().isBefore(currentOp.range.getEndPosition())) {

				if (previousOp.identifier.major > currentOp.identifier.major) {
					// previousOp loses the battle
					loserMajor = previousOp.identifier.major;
				} else {
					loserMajor = currentOp.identifier.major;
				}

				loserCursorsMap[loserMajor.toString()] = true;

				for (var j = 0; j < operations.length; j++) {
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

	private _internalExecuteCommands(commands: editorCommon.ICommand[], isAutoWhitespaceCommand: boolean[]): void {
		var ctx: IExecContext = {
			selectionStartMarkers: [],
			positionMarkers: []
		};

		this._innerExecuteCommands(ctx, commands, isAutoWhitespaceCommand);
		for (var i = 0; i < ctx.selectionStartMarkers.length; i++) {
			this.model._removeMarker(ctx.selectionStartMarkers[i]);
			this.model._removeMarker(ctx.positionMarkers[i]);
		}
	}

	private _arrayIsEmpty(commands: editorCommon.ICommand[]): boolean {
		var i: number,
			len: number;

		for (i = 0, len = commands.length; i < len; i++) {
			if (commands[i]) {
				return false;
			}
		}

		return true;
	}

	private _innerExecuteCommands(ctx: IExecContext, commands: editorCommon.ICommand[], isAutoWhitespaceCommand: boolean[]): void {

		if (this.configuration.editor.readOnly) {
			return;
		}

		if (this._arrayIsEmpty(commands)) {
			return;
		}

		var selectionsBefore = this.cursors.getSelections();

		var commandsData = this._getEditOperations(ctx, commands, isAutoWhitespaceCommand);
		if (commandsData.operations.length === 0 && !commandsData.anyoneHadTrackedRange) {
			return;
		}

		var rawOperations = commandsData.operations;

		var editableRange = this.model.getEditableRange();
		var editableRangeStart = editableRange.getStartPosition();
		var editableRangeEnd = editableRange.getEndPosition();
		for (var i = 0; i < rawOperations.length; i++) {
			var operationRange = rawOperations[i].range;
			if (!editableRangeStart.isBeforeOrEqual(operationRange.getStartPosition()) || !operationRange.getEndPosition().isBeforeOrEqual(editableRangeEnd)) {
				// These commands are outside of the editable range
				return;
			}
		}

		var loserCursorsMap = this._getLoserCursorMap(rawOperations);
		if (loserCursorsMap.hasOwnProperty('0')) {
			// These commands are very messed up
			console.warn('Ignoring commands');
			return;
		}

		// Remove operations belonging to losing cursors
		var filteredOperations: editorCommon.IIdentifiedSingleEditOperation[] = [];
		for (var i = 0; i < rawOperations.length; i++) {
			if (!loserCursorsMap.hasOwnProperty(rawOperations[i].identifier.major.toString())) {
				filteredOperations.push(rawOperations[i]);
			}
		}

		// TODO@Alex: find a better way to do this.
		// give the hint that edit operations are tracked to the model
		if (commandsData.anyoneHadTrackedEditOperation && filteredOperations.length > 0) {
			filteredOperations[0]._isTracked = true;
		}
		var selectionsAfter = this.model.pushEditOperations(selectionsBefore, filteredOperations, (inverseEditOperations: editorCommon.IIdentifiedSingleEditOperation[]): Selection[] => {
			var groupedInverseEditOperations: editorCommon.IIdentifiedSingleEditOperation[][] = [];
			for (var i = 0; i < selectionsBefore.length; i++) {
				groupedInverseEditOperations[i] = [];
			}
			for (var i = 0; i < inverseEditOperations.length; i++) {
				var op = inverseEditOperations[i];
				if (!op.identifier) {
					// perhaps auto whitespace trim edits
					continue;
				}
				groupedInverseEditOperations[op.identifier.major].push(op);
			}
			var minorBasedSorter = (a: editorCommon.IIdentifiedSingleEditOperation, b: editorCommon.IIdentifiedSingleEditOperation) => {
				return a.identifier.minor - b.identifier.minor;
			};
			var cursorSelections: Selection[] = [];
			for (var i = 0; i < selectionsBefore.length; i++) {
				if (groupedInverseEditOperations[i].length > 0 || commandsData.hadTrackedRanges[i]) {
					groupedInverseEditOperations[i].sort(minorBasedSorter);
					cursorSelections[i] = commands[i].computeCursorState(this.model, {
						getInverseEditOperations: () => {
							return groupedInverseEditOperations[i];
						},

						getTrackedSelection: (id: string) => {
							var idx = parseInt(id, 10);
							var selectionStartMarker = this.model._getMarker(ctx.selectionStartMarkers[idx]);
							var positionMarker = this.model._getMarker(ctx.positionMarkers[idx]);
							return new Selection(selectionStartMarker.lineNumber, selectionStartMarker.column, positionMarker.lineNumber, positionMarker.column);
						}
					});
				} else {
					cursorSelections[i] = selectionsBefore[i];
				}
			}
			return cursorSelections;
		});

		// Extract losing cursors
		var losingCursorIndex: string;
		var losingCursors: number[] = [];
		for (losingCursorIndex in loserCursorsMap) {
			if (loserCursorsMap.hasOwnProperty(losingCursorIndex)) {
				losingCursors.push(parseInt(losingCursorIndex, 10));
			}
		}

		// Sort losing cursors descending
		losingCursors.sort((a: number, b: number): number => {
			return b - a;
		});

		// Remove losing cursors
		for (var i = 0; i < losingCursors.length; i++) {
			selectionsAfter.splice(losingCursors[i], 1);
		}

		this._interpretCommandResult(selectionsAfter);
	}


	// -----------------------------------------------------------------------------------------------------------
	// ----- emitting events

	private emitCursorPositionChanged(source: string, reason: CursorChangeReason): void {
		var positions = this.cursors.getPositions();
		var primaryPosition = positions[0];
		var secondaryPositions = positions.slice(1);

		var viewPositions = this.cursors.getViewPositions();
		var primaryViewPosition = viewPositions[0];
		var secondaryViewPositions = viewPositions.slice(1);

		var isInEditableRange: boolean = true;
		if (this.model.hasEditableRange()) {
			var editableRange = this.model.getEditableRange();
			if (!editableRange.containsPosition(primaryPosition)) {
				isInEditableRange = false;
			}
		}
		var e: ICursorPositionChangedEvent = {
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

	private emitCursorSelectionChanged(source: string, reason: CursorChangeReason): void {
		let selections = this.cursors.getSelections();
		let primarySelection = selections[0];
		let secondarySelections = selections.slice(1);

		let viewSelections = this.cursors.getViewSelections();
		let primaryViewSelection = viewSelections[0];
		let secondaryViewSelections = viewSelections.slice(1);

		let e: ICursorSelectionChangedEvent = {
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
		var positions = this.cursors.getPositions();
		var viewPositions = this.cursors.getViewPositions();

		var position = positions[0];
		var viewPosition = viewPositions[0];

		if (revealTarget === RevealTarget.TopMost) {
			for (var i = 1; i < positions.length; i++) {
				if (positions[i].isBefore(position)) {
					position = positions[i];
					viewPosition = viewPositions[i];
				}
			}
		} else if (revealTarget === RevealTarget.BottomMost) {
			for (var i = 1; i < positions.length; i++) {
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

		var range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		var viewRange = new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column);
		this.emitCursorRevealRange(range, viewRange, verticalType, revealHorizontal);
	}

	public emitCursorRevealRange(range: Range, viewRange: Range, verticalType: VerticalRevealType, revealHorizontal: boolean) {
		var e: ICursorRevealRangeEvent = {
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
		let handler = this._handlers[handlerId];
		this._onHandler(handlerId, handler, source, payload);
	}

	private _registerHandlers(): void {
		let H = editorCommon.Handler;

		this._handlers[H.LineInsertBefore] = (ctx) => this._lineInsertBefore(ctx);
		this._handlers[H.LineInsertAfter] = (ctx) => this._lineInsertAfter(ctx);
		this._handlers[H.LineBreakInsert] = (ctx) => this._lineBreakInsert(ctx);

		this._handlers[H.Type] = (ctx) => this._type(ctx);
		this._handlers[H.ReplacePreviousChar] = (ctx) => this._replacePreviousChar(ctx);
		this._handlers[H.CompositionStart] = (ctx) => this._compositionStart(ctx);
		this._handlers[H.CompositionEnd] = (ctx) => this._compositionEnd(ctx);
		this._handlers[H.Tab] = (ctx) => this._tab(ctx);
		this._handlers[H.Indent] = (ctx) => this._indent(ctx);
		this._handlers[H.Outdent] = (ctx) => this._outdent(ctx);
		this._handlers[H.Paste] = (ctx) => this._paste(ctx);

		this._handlers[H.DeleteLeft] = (ctx) => this._deleteLeft(ctx);
		this._handlers[H.DeleteRight] = (ctx) => this._deleteRight(ctx);

		this._handlers[H.Cut] = (ctx) => this._cut(ctx);

		this._handlers[H.Undo] = (ctx) => this._undo(ctx);
		this._handlers[H.Redo] = (ctx) => this._redo(ctx);

		this._handlers[H.ExecuteCommand] = (ctx) => this._externalExecuteCommand(ctx);
		this._handlers[H.ExecuteCommands] = (ctx) => this._externalExecuteCommands(ctx);
	}

	public getColumnSelectData(): IColumnSelectData {
		if (this._columnSelectData) {
			return this._columnSelectData;
		}
		const primaryCursor = this.cursors.getPrimaryCursor();
		const primaryPos = primaryCursor.viewState.position;
		return {
			toViewLineNumber: primaryPos.lineNumber,
			toViewVisualColumn: CursorColumns.visibleColumnFromColumn2(this.context.config, this.context.viewModel, primaryPos)
		};
	}

	// -------------------- START editing operations

	private _applyEdits(ctx: IMultipleCursorOperationContext, edits: EditOperationResult): void {
		ctx.shouldReveal = true;
		ctx.shouldPushStackElementBefore = edits.shouldPushStackElementBefore;
		ctx.shouldPushStackElementAfter = edits.shouldPushStackElementAfter;

		const commands = edits.commands;
		for (let i = 0, len = commands.length; i < len; i++) {
			const command = commands[i];
			ctx.executeCommands[i] = command ? command.command : null;
			ctx.isAutoWhitespaceCommand[i] = command ? command.isAutoWhitespaceCommand : false;
		}
	}

	private _getAllCursorsModelState(sorted: boolean = false): SingleCursorState[] {
		let cursors = this.cursors.getAll();

		if (sorted) {
			cursors = cursors.sort((a, b) => {
				return Range.compareRangesUsingStarts(a.modelState.selection, b.modelState.selection);
			});
		}

		let r: SingleCursorState[] = [];
		for (let i = 0, len = cursors.length; i < len; i++) {
			r[i] = cursors[i].modelState;
		}
		return r;
	}

	private _lineInsertBefore(ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, TypeOperations.lineInsertBefore(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _lineInsertAfter(ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, TypeOperations.lineInsertAfter(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _lineBreakInsert(ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, TypeOperations.lineBreakInsert(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _type(ctx: IMultipleCursorOperationContext): void {
		var text = ctx.eventData.text;

		if (!this._isDoingComposition && ctx.eventSource === 'keyboard') {
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
				this._createAndInterpretHandlerCtx(ctx.eventSource, ctx.eventData, (charHandlerCtx: IMultipleCursorOperationContext) => {

					// Decide what all cursors will do up-front
					this._applyEdits(charHandlerCtx, TypeOperations.typeWithInterceptors(this.context.config, this.context.model, this._getAllCursorsModelState(), chr));

					// The last typed character gets to win
					ctx.cursorPositionChangeReason = charHandlerCtx.cursorPositionChangeReason;
					ctx.shouldReveal = charHandlerCtx.shouldReveal;
				});

			}
		} else {
			this._applyEdits(ctx, TypeOperations.typeWithoutInterceptors(this.context.config, this.context.model, this._getAllCursorsModelState(), text));
		}
	}

	private _replacePreviousChar(ctx: IMultipleCursorOperationContext): void {
		let text = ctx.eventData.text;
		let replaceCharCnt = ctx.eventData.replaceCharCnt;
		this._applyEdits(ctx, TypeOperations.replacePreviousChar(this.context.config, this.context.model, this._getAllCursorsModelState(), text, replaceCharCnt));
	}

	private _compositionStart(ctx: IMultipleCursorOperationContext): void {
		this._isDoingComposition = true;
	}

	private _compositionEnd(ctx: IMultipleCursorOperationContext): void {
		this._isDoingComposition = false;
	}

	private _tab(ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, TypeOperations.tab(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _indent(ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, TypeOperations.indent(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _outdent(ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, TypeOperations.outdent(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _distributePasteToCursors(ctx: IMultipleCursorOperationContext): string[] {
		if (ctx.eventData.pasteOnNewLine) {
			return null;
		}

		var selections = this.cursors.getSelections();
		if (selections.length === 1) {
			return null;
		}

		for (var i = 0; i < selections.length; i++) {
			if (selections[i].startLineNumber !== selections[i].endLineNumber) {
				return null;
			}
		}

		var pastePieces = ctx.eventData.text.split(/\r\n|\r|\n/);
		if (pastePieces.length !== selections.length) {
			return null;
		}

		return pastePieces;
	}

	private _paste(ctx: IMultipleCursorOperationContext): void {
		var distributedPaste = this._distributePasteToCursors(ctx);

		ctx.cursorPositionChangeReason = CursorChangeReason.Paste;
		if (distributedPaste) {
			this._applyEdits(ctx, TypeOperations.distributedPaste(this.context.config, this.context.model, this._getAllCursorsModelState(true), distributedPaste));
		} else {
			this._applyEdits(ctx, TypeOperations.paste(this.context.config, this.context.model, this._getAllCursorsModelState(), ctx.eventData.text, ctx.eventData.pasteOnNewLine));
		}
	}

	private _deleteLeft(ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, DeleteOperations.deleteLeft(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _deleteRight(ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, DeleteOperations.deleteRight(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _cut(ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, DeleteOperations.cut(this.context.config, this.context.model, this._getAllCursorsModelState(), this.enableEmptySelectionClipboard));
	}

	// -------------------- END editing operations

	private _undo(ctx: IMultipleCursorOperationContext): void {
		ctx.cursorPositionChangeReason = CursorChangeReason.Undo;
		this._interpretCommandResult(this.model.undo());
	}

	private _redo(ctx: IMultipleCursorOperationContext): void {
		ctx.cursorPositionChangeReason = CursorChangeReason.Redo;
		this._interpretCommandResult(this.model.redo());
	}

	private _externalExecuteCommand(ctx: IMultipleCursorOperationContext): void {
		const command = <editorCommon.ICommand>ctx.eventData;

		this.cursors.killSecondaryCursors();

		ctx.shouldReveal = true;

		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;

		ctx.executeCommands[0] = command;
		ctx.isAutoWhitespaceCommand[0] = false;
	}

	private _externalExecuteCommands(ctx: IMultipleCursorOperationContext): void {
		const commands = <editorCommon.ICommand[]>ctx.eventData;

		ctx.shouldReveal = true;

		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;

		for (let i = 0; i < commands.length; i++) {
			ctx.executeCommands[i] = commands[i];
			ctx.isAutoWhitespaceCommand[i] = false;
		}
	}
}
