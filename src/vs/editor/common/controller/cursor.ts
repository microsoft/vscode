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
import { CursorColumns, CursorConfiguration, EditOperationResult, SingleCursorState, IViewModelHelper, CursorContext, CursorState } from 'vs/editor/common/controller/cursorCommon';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { ColumnSelection, IColumnSelectResult } from 'vs/editor/common/controller/cursorColumnSelection';
import { DeleteOperations } from 'vs/editor/common/controller/cursorDeleteOperations';
import { TypeOperations } from 'vs/editor/common/controller/cursorTypeOperations';
import { TextModelEventType, ModelRawContentChangedEvent, RawContentChangedType } from 'vs/editor/common/model/textModelEvents';
import { CursorEventType, CursorChangeReason, ICursorPositionChangedEvent, VerticalRevealType, ICursorSelectionChangedEvent, ICursorRevealRangeEvent, CursorScrollRequest } from "vs/editor/common/controller/cursorEvents";
import { ICommandHandlerDescription } from "vs/platform/commands/common/commands";
import * as types from 'vs/base/common/types';
import { CursorMoveCommands, CursorMove } from "vs/editor/common/controller/cursorMoveCommands";

const enum RevealTarget {
	Primary = 0,
	TopMost = 1,
	BottomMost = 2
}

interface IMultipleCursorOperationContext {
	cursorPositionChangeReason: CursorChangeReason;
	shouldReveal: boolean;
	shouldRevealHorizontal: boolean;
	shouldRevealTarget: RevealTarget;
	shouldPushStackElementBefore: boolean;
	shouldPushStackElementAfter: boolean;
	eventSource: string;
	eventData: any;
	executeCommands: editorCommon.ICommand[];
	isAutoWhitespaceCommand: boolean[];
	setColumnSelectData: IColumnSelectData;
}

interface IColumnSelectData {
	toViewLineNumber: number;
	toViewVisualColumn: number;
}

interface IExecContext {
	selectionStartMarkers: string[];
	positionMarkers: string[];
}

interface ICommandData {
	operations: editorCommon.IIdentifiedSingleEditOperation[];
	hadTrackedRange: boolean;
}

interface ICommandsData {
	operations: editorCommon.IIdentifiedSingleEditOperation[];
	hadTrackedRanges: boolean[];
	anyoneHadTrackedRange: boolean;
}

export class Cursor extends Disposable {

	public onDidChangePosition(listener: (e: ICursorPositionChangedEvent) => void): IDisposable {
		return this._eventEmitter.addListener(CursorEventType.CursorPositionChanged, listener);
	}
	public onDidChangeSelection(listener: (e: ICursorSelectionChangedEvent) => void): IDisposable {
		return this._eventEmitter.addListener(CursorEventType.CursorSelectionChanged, listener);
	}

	private configuration: editorCommon.IConfiguration;
	private context: CursorContext;
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
				const cursors = this.cursors.getAll();
				const selectionsFromMarkers: Selection[] = cursors.map((cursor) => {
					return cursor.readSelectionFromMarkers(this.context);
				});

				this._onHandler('recoverSelectionFromMarkers', (ctx: IMultipleCursorOperationContext) => {
					for (let i = 0, len = cursors.length; i < len; i++) {
						cursors[i].setSelection(this.context, selectionsFromMarkers[i]);
					}
					ctx.cursorPositionChangeReason = CursorChangeReason.RecoverFromMarkers;
					ctx.shouldReveal = false;
					ctx.shouldPushStackElementBefore = false;
					ctx.shouldPushStackElementAfter = false;
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
			shouldRevealHorizontal: true,
			shouldRevealTarget: RevealTarget.Primary,
			eventSource: eventSource,
			eventData: eventData,
			executeCommands: [],
			isAutoWhitespaceCommand: [],
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false,
			setColumnSelectData: null
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
			let shouldRevealHorizontal: boolean;
			let shouldRevealTarget: RevealTarget;

			this._createAndInterpretHandlerCtx(source, data, (currentHandlerCtx: IMultipleCursorOperationContext) => {
				handler(currentHandlerCtx);

				cursorPositionChangeReason = currentHandlerCtx.cursorPositionChangeReason;
				shouldReveal = currentHandlerCtx.shouldReveal;
				shouldRevealTarget = currentHandlerCtx.shouldRevealTarget;
				shouldRevealHorizontal = currentHandlerCtx.shouldRevealHorizontal;
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
					this.revealRange(shouldRevealTarget, VerticalRevealType.Simple, shouldRevealHorizontal);
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

		this._columnSelectData = ctx.setColumnSelectData;

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
			trackSelection: trackSelection
		};

		try {
			command.getEditOperations(this.model, editOperationBuilder);
		} catch (e) {
			e.friendlyMessage = nls.localize('corrupt.commands', "Unexpected exception while executing command.");
			onUnexpectedError(e);
			return {
				operations: [],
				hadTrackedRange: false
			};
		}

		return {
			operations: operations,
			hadTrackedRange: hadTrackedRange
		};
	}

	private _getEditOperations(ctx: IExecContext, commands: editorCommon.ICommand[], isAutoWhitespaceCommand: boolean[]): ICommandsData {
		var oneResult: ICommandData;
		var operations: editorCommon.IIdentifiedSingleEditOperation[] = [];
		var hadTrackedRanges: boolean[] = [];
		var anyoneHadTrackedRange: boolean;

		for (var i = 0; i < commands.length; i++) {
			if (commands[i]) {
				oneResult = this._getEditOperationsFromCommand(ctx, i, commands[i], isAutoWhitespaceCommand[i]);
				operations = operations.concat(oneResult.operations);
				hadTrackedRanges[i] = oneResult.hadTrackedRange;
				anyoneHadTrackedRange = anyoneHadTrackedRange || hadTrackedRanges[i];
			} else {
				hadTrackedRanges[i] = false;
			}
		}
		return {
			operations: operations,
			hadTrackedRanges: hadTrackedRanges,
			anyoneHadTrackedRange: anyoneHadTrackedRange
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
			source: source,
			reason: reason
		};
		this._eventEmitter.emit(CursorEventType.CursorSelectionChanged, e);
	}

	private revealRange(revealTarget: RevealTarget, verticalType: VerticalRevealType, revealHorizontal: boolean): void {
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
			return;
		}
		let handler = this._handlers[handlerId];
		this._onHandler(handlerId, handler, source, payload);
	}

	private _registerHandlers(): void {
		let H = editorCommon.Handler;

		this._handlers[H.CursorMove] = (ctx) => this._cursorMove(ctx);
		this._handlers[H.MoveTo] = (ctx) => this._moveTo(false, ctx);
		this._handlers[H.MoveToSelect] = (ctx) => this._moveTo(true, ctx);
		this._handlers[H.ColumnSelect] = (ctx) => this._columnSelectMouse(ctx);
		this._handlers[H.AddCursorUp] = (ctx) => this._addCursorUp(ctx);
		this._handlers[H.AddCursorDown] = (ctx) => this._addCursorDown(ctx);
		this._handlers[H.CreateCursor] = (ctx) => this._createCursor(ctx);
		this._handlers[H.LastCursorMoveToSelect] = (ctx) => this._lastCursorMoveTo(ctx);


		this._handlers[H.CursorLeft] = (ctx) => this._moveLeft(false, ctx);
		this._handlers[H.CursorLeftSelect] = (ctx) => this._moveLeft(true, ctx);

		this._handlers[H.CursorRight] = (ctx) => this._moveRight(false, ctx);
		this._handlers[H.CursorRightSelect] = (ctx) => this._moveRight(true, ctx);

		this._handlers[H.CursorUp] = (ctx) => this._moveUp(false, false, ctx);
		this._handlers[H.CursorUpSelect] = (ctx) => this._moveUp(true, false, ctx);
		this._handlers[H.CursorDown] = (ctx) => this._moveDown(false, false, ctx);
		this._handlers[H.CursorDownSelect] = (ctx) => this._moveDown(true, false, ctx);

		this._handlers[H.CursorPageUp] = (ctx) => this._moveUp(false, true, ctx);
		this._handlers[H.CursorPageUpSelect] = (ctx) => this._moveUp(true, true, ctx);
		this._handlers[H.CursorPageDown] = (ctx) => this._moveDown(false, true, ctx);
		this._handlers[H.CursorPageDownSelect] = (ctx) => this._moveDown(true, true, ctx);

		this._handlers[H.CursorHome] = (ctx) => this._moveToBeginningOfLine(false, ctx);
		this._handlers[H.CursorHomeSelect] = (ctx) => this._moveToBeginningOfLine(true, ctx);

		this._handlers[H.CursorEnd] = (ctx) => this._moveToEndOfLine(false, ctx);
		this._handlers[H.CursorEndSelect] = (ctx) => this._moveToEndOfLine(true, ctx);

		this._handlers[H.CursorTop] = (ctx) => this._moveToBeginningOfBuffer(false, ctx);
		this._handlers[H.CursorTopSelect] = (ctx) => this._moveToBeginningOfBuffer(true, ctx);
		this._handlers[H.CursorBottom] = (ctx) => this._moveToEndOfBuffer(false, ctx);
		this._handlers[H.CursorBottomSelect] = (ctx) => this._moveToEndOfBuffer(true, ctx);

		this._handlers[H.CursorColumnSelectLeft] = (ctx) => this._columnSelectLeft(ctx);
		this._handlers[H.CursorColumnSelectRight] = (ctx) => this._columnSelectRight(ctx);
		this._handlers[H.CursorColumnSelectUp] = (ctx) => this._columnSelectUp(false, ctx);
		this._handlers[H.CursorColumnSelectPageUp] = (ctx) => this._columnSelectUp(true, ctx);
		this._handlers[H.CursorColumnSelectDown] = (ctx) => this._columnSelectDown(false, ctx);
		this._handlers[H.CursorColumnSelectPageDown] = (ctx) => this._columnSelectDown(true, ctx);

		this._handlers[H.SelectAll] = (ctx) => this._selectAll(ctx);

		this._handlers[H.LineSelect] = (ctx) => this._line(false, ctx);
		this._handlers[H.LineSelectDrag] = (ctx) => this._line(true, ctx);
		this._handlers[H.LastCursorLineSelect] = (ctx) => this._lastCursorLine(false, ctx);
		this._handlers[H.LastCursorLineSelectDrag] = (ctx) => this._lastCursorLine(true, ctx);

		this._handlers[H.LineInsertBefore] = (ctx) => this._lineInsertBefore(ctx);
		this._handlers[H.LineInsertAfter] = (ctx) => this._lineInsertAfter(ctx);
		this._handlers[H.LineBreakInsert] = (ctx) => this._lineBreakInsert(ctx);

		this._handlers[H.WordSelect] = (ctx) => this._word(false, ctx);
		this._handlers[H.WordSelectDrag] = (ctx) => this._word(true, ctx);
		this._handlers[H.LastCursorWordSelect] = (ctx) => this._lastCursorWord(ctx);
		this._handlers[H.CancelSelection] = (ctx) => this._cancelSelection(ctx);
		this._handlers[H.RemoveSecondaryCursors] = (ctx) => this._removeSecondaryCursors(ctx);

		this._handlers[H.Type] = (ctx) => this._type(ctx);
		this._handlers[H.ReplacePreviousChar] = (ctx) => this._replacePreviousChar(ctx);
		this._handlers[H.CompositionStart] = (ctx) => this._compositionStart(ctx);
		this._handlers[H.CompositionEnd] = (ctx) => this._compositionEnd(ctx);
		this._handlers[H.Tab] = (ctx) => this._tab(ctx);
		this._handlers[H.Indent] = (ctx) => this._indent(ctx);
		this._handlers[H.Outdent] = (ctx) => this._outdent(ctx);
		this._handlers[H.Paste] = (ctx) => this._paste(ctx);

		this._handlers[H.EditorScroll] = (ctx) => this._editorScroll(ctx);

		this._handlers[H.ScrollLineUp] = (ctx) => this._scrollUp(false, ctx);
		this._handlers[H.ScrollLineDown] = (ctx) => this._scrollDown(false, ctx);
		this._handlers[H.ScrollPageUp] = (ctx) => this._scrollUp(true, ctx);
		this._handlers[H.ScrollPageDown] = (ctx) => this._scrollDown(true, ctx);

		this._handlers[H.DeleteLeft] = (ctx) => this._deleteLeft(ctx);
		this._handlers[H.DeleteRight] = (ctx) => this._deleteRight(ctx);

		this._handlers[H.Cut] = (ctx) => this._cut(ctx);

		this._handlers[H.ExpandLineSelection] = (ctx) => this._expandLineSelection(ctx);

		this._handlers[H.Undo] = (ctx) => this._undo(ctx);
		this._handlers[H.Redo] = (ctx) => this._redo(ctx);

		this._handlers[H.ExecuteCommand] = (ctx) => this._externalExecuteCommand(ctx);
		this._handlers[H.ExecuteCommands] = (ctx) => this._externalExecuteCommands(ctx);

		this._handlers[H.RevealLine] = (ctx) => this._revealLine(ctx);
	}

	private _moveTo(inSelectionMode: boolean, ctx: IMultipleCursorOperationContext): void {
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		if (ctx.eventSource === 'mouse') {
			ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		}
		const result = CursorMoveCommands.moveTo(this.context, this.cursors.getPrimaryCursor(), inSelectionMode, ctx.eventData.position, ctx.eventData.viewPosition);
		this.cursors.setStates([result], false);
	}

	private _cursorMove(ctx: IMultipleCursorOperationContext): void {
		const args = CursorMove.parse(ctx.eventData);
		if (!args) {
			// illegal arguments
			return;
		}
		return this._doCursorMove(ctx, args);
	}

	private _doCursorMove(ctx: IMultipleCursorOperationContext, args: CursorMove.ParsedArguments): void {
		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		ctx.shouldReveal = true;
		ctx.shouldRevealHorizontal = true;
		this.cursors.setStates(CursorMoveCommands.move(this.context, this.cursors.getAll(), args), true);
	}

	private _getColumnSelectData(): IColumnSelectData {
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

	private _applyColumnSelect(ctx: IMultipleCursorOperationContext, result: IColumnSelectResult): void {
		ctx.shouldRevealTarget = (result.reversed ? RevealTarget.TopMost : RevealTarget.BottomMost);
		ctx.shouldReveal = true;
		ctx.setColumnSelectData = {
			toViewLineNumber: result.toLineNumber,
			toViewVisualColumn: result.toVisualColumn
		};
		this.cursors.setStates(result.viewStates.map((viewState) => CursorState.fromViewState(viewState)), false);
	}

	private _columnSelectMouse(ctx: IMultipleCursorOperationContext): void {
		let primary = this.cursors.getPrimaryCursor();

		// validate `eventData`
		let validatedPosition = this.context.model.validatePosition(ctx.eventData.position);
		let validatedViewPosition: Position;
		if (ctx.eventData.viewPosition) {
			validatedViewPosition = this.context.validateViewPosition(new Position(ctx.eventData.viewPosition.lineNumber, ctx.eventData.viewPosition.column), validatedPosition);
		} else {
			validatedViewPosition = this.context.convertModelPositionToViewPosition(validatedPosition);
		}

		let result = ColumnSelection.columnSelect(this.context.config, this.context.viewModel, primary.viewState.selection, validatedViewPosition.lineNumber, ctx.eventData.mouseColumn - 1);
		this._applyColumnSelect(ctx, result);
	}

	private _columnSelectLeft(ctx: IMultipleCursorOperationContext): void {
		const primary = this.cursors.getPrimaryCursor();
		const prevColumnSelectData = this._getColumnSelectData();
		this._applyColumnSelect(ctx,
			ColumnSelection.columnSelectLeft(this.context.config, this.context.viewModel, primary.viewState, prevColumnSelectData.toViewLineNumber, prevColumnSelectData.toViewVisualColumn)
		);
	}

	private _columnSelectRight(ctx: IMultipleCursorOperationContext): void {
		const primary = this.cursors.getPrimaryCursor();
		const prevColumnSelectData = this._getColumnSelectData();
		this._applyColumnSelect(ctx,
			ColumnSelection.columnSelectRight(this.context.config, this.context.viewModel, primary.viewState, prevColumnSelectData.toViewLineNumber, prevColumnSelectData.toViewVisualColumn)
		);
	}

	private _columnSelectUp(isPaged: boolean, ctx: IMultipleCursorOperationContext): void {
		const primary = this.cursors.getPrimaryCursor();
		const prevColumnSelectData = this._getColumnSelectData();
		this._applyColumnSelect(ctx,
			ColumnSelection.columnSelectUp(this.context.config, this.context.viewModel, primary.viewState, isPaged, prevColumnSelectData.toViewLineNumber, prevColumnSelectData.toViewVisualColumn)
		);
	}

	private _columnSelectDown(isPaged: boolean, ctx: IMultipleCursorOperationContext): void {
		const primary = this.cursors.getPrimaryCursor();
		const prevColumnSelectData = this._getColumnSelectData();
		this._applyColumnSelect(ctx,
			ColumnSelection.columnSelectDown(this.context.config, this.context.viewModel, primary.viewState, isPaged, prevColumnSelectData.toViewLineNumber, prevColumnSelectData.toViewVisualColumn)
		);
	}

	private _createCursor(ctx: IMultipleCursorOperationContext): void {
		if (this.configuration.editor.readOnly || this.model.hasEditableRange()) {
			return;
		}

		this.cursors.addSecondaryCursor({
			selectionStartLineNumber: 1,
			selectionStartColumn: 1,
			positionLineNumber: 1,
			positionColumn: 1
		});

		const lastAddedCursor = this.cursors.getLastAddedCursor();
		if (ctx.eventData.wholeLine) {
			const result = CursorMoveCommands.line(this.context, lastAddedCursor, false, ctx.eventData.position, ctx.eventData.viewPosition);
			lastAddedCursor.setState(this.context, result.modelState, result.viewState, false);
		} else {
			const result = CursorMoveCommands.moveTo(this.context, lastAddedCursor, false, ctx.eventData.position, ctx.eventData.viewPosition);
			lastAddedCursor.setState(this.context, result.modelState, result.viewState, false);
		}

		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldReveal = false;
	}

	private _lastCursorMoveTo(ctx: IMultipleCursorOperationContext): void {
		if (this.configuration.editor.readOnly || this.model.hasEditableRange()) {
			return;
		}

		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		if (ctx.eventSource === 'mouse') {
			ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		}
		ctx.shouldReveal = false;

		const lastAddedCursor = this.cursors.getLastAddedCursor();
		const result = CursorMoveCommands.moveTo(this.context, lastAddedCursor, true, ctx.eventData.position, ctx.eventData.viewPosition);
		lastAddedCursor.setState(this.context, result.modelState, result.viewState, false);
	}

	private _addCursorUp(ctx: IMultipleCursorOperationContext): void {
		if (this.configuration.editor.readOnly) {
			return;
		}
		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldRevealTarget = RevealTarget.TopMost;
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;

		this.cursors.setStates(CursorMoveCommands.addCursorUp(this.context, this.cursors.getAll()), true);
	}

	private _addCursorDown(ctx: IMultipleCursorOperationContext): void {
		if (this.configuration.editor.readOnly) {
			return;
		}
		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldRevealTarget = RevealTarget.BottomMost;
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;

		this.cursors.setStates(CursorMoveCommands.addCursorDown(this.context, this.cursors.getAll()), true);
	}

	private _moveLeft(inSelectionMode: boolean, ctx: IMultipleCursorOperationContext): void {
		this._doCursorMove(ctx, {
			direction: CursorMove.Direction.Left,
			unit: CursorMove.Unit.None,
			select: inSelectionMode,
			value: 1
		});
	}

	private _moveRight(inSelectionMode: boolean, ctx: IMultipleCursorOperationContext): void {
		this._doCursorMove(ctx, {
			direction: CursorMove.Direction.Right,
			unit: CursorMove.Unit.None,
			select: inSelectionMode,
			value: 1
		});
	}

	private _moveDown(inSelectionMode: boolean, isPaged: boolean, ctx: IMultipleCursorOperationContext): void {
		this._doCursorMove(ctx, {
			direction: CursorMove.Direction.Down,
			unit: CursorMove.Unit.WrappedLine,
			select: inSelectionMode,
			value: (isPaged ? this.context.config.pageSize : 1)
		});
	}

	private _moveUp(inSelectionMode: boolean, isPaged: boolean, ctx: IMultipleCursorOperationContext): void {
		this._doCursorMove(ctx, {
			direction: CursorMove.Direction.Up,
			unit: CursorMove.Unit.WrappedLine,
			select: inSelectionMode,
			value: (isPaged ? this.context.config.pageSize : 1)
		});
	}

	private _moveToBeginningOfLine(inSelectionMode: boolean, ctx: IMultipleCursorOperationContext): void {
		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		this.cursors.setStates(CursorMoveCommands.moveToBeginningOfLine(this.context, this.cursors.getAll(), inSelectionMode), true);
	}

	private _moveToEndOfLine(inSelectionMode: boolean, ctx: IMultipleCursorOperationContext): void {
		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		this.cursors.setStates(CursorMoveCommands.moveToEndOfLine(this.context, this.cursors.getAll(), inSelectionMode), true);
	}

	private _moveToBeginningOfBuffer(inSelectionMode: boolean, ctx: IMultipleCursorOperationContext): void {
		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		this.cursors.setStates(CursorMoveCommands.moveToBeginningOfBuffer(this.context, this.cursors.getAll(), inSelectionMode), true);
	}

	private _moveToEndOfBuffer(inSelectionMode: boolean, ctx: IMultipleCursorOperationContext): void {
		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		this.cursors.setStates(CursorMoveCommands.moveToEndOfBuffer(this.context, this.cursors.getAll(), inSelectionMode), true);
	}

	private _selectAll(ctx: IMultipleCursorOperationContext): void {
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		ctx.shouldReveal = false;
		const result = CursorMoveCommands.selectAll(this.context, this.cursors.getPrimaryCursor());
		this.cursors.setStates([result], false);
	}

	private _line(inSelectionMode: boolean, ctx: IMultipleCursorOperationContext): void {
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldRevealHorizontal = false;

		const r = CursorMoveCommands.line(this.context, this.cursors.getPrimaryCursor(), inSelectionMode, ctx.eventData.position, ctx.eventData.viewPosition);
		this.cursors.setStates([r], false);
	}

	private _lastCursorLine(inSelectionMode: boolean, ctx: IMultipleCursorOperationContext): void {
		if (this.configuration.editor.readOnly || this.model.hasEditableRange()) {
			return;
		}

		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldReveal = false;

		const lastAddedCursor = this.cursors.getLastAddedCursor();
		const result = CursorMoveCommands.line(this.context, lastAddedCursor, inSelectionMode, ctx.eventData.position, ctx.eventData.viewPosition);
		lastAddedCursor.setState(this.context, result.modelState, result.viewState, false);
	}

	private _expandLineSelection(ctx: IMultipleCursorOperationContext): void {
		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		this.cursors.setStates(CursorMoveCommands.expandLineSelection(this.context, this.cursors.getAll()), true);
	}

	private _word(inSelectionMode: boolean, ctx: IMultipleCursorOperationContext): void {
		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;

		const primaryCursor = this.cursors.getPrimaryCursor();
		const r = CursorMoveCommands.word(this.context, primaryCursor, inSelectionMode, ctx.eventData.position);
		this.cursors.setStates([r], false);
	}

	private _lastCursorWord(ctx: IMultipleCursorOperationContext): void {
		if (this.configuration.editor.readOnly || this.model.hasEditableRange()) {
			return;
		}

		ctx.cursorPositionChangeReason = CursorChangeReason.Explicit;
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		ctx.shouldReveal = false;

		const lastAddedCursor = this.cursors.getLastAddedCursor();
		const r = CursorMoveCommands.word(this.context, lastAddedCursor, true, ctx.eventData.position);
		lastAddedCursor.setState(this.context, r.modelState, r.viewState, false);
	}

	private _removeSecondaryCursors(ctx: IMultipleCursorOperationContext): void {
		this.cursors.killSecondaryCursors();
	}

	private _cancelSelection(ctx: IMultipleCursorOperationContext): void {
		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;
		const r = CursorMoveCommands.cancelSelection(this.context, this.cursors.getPrimaryCursor());
		this.cursors.setStates([r], false);
	}

	// -------------------- START editing operations

	private _applyEdits(ctx: IMultipleCursorOperationContext, edits: EditOperationResult): void {
		ctx.shouldReveal = true;
		ctx.shouldRevealHorizontal = true;
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
					ctx.shouldRevealHorizontal = charHandlerCtx.shouldRevealHorizontal;
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


	private _revealLine(ctx: IMultipleCursorOperationContext): void {
		const revealLineArg = <RevealLine.RawArguments>ctx.eventData;
		let lineNumber = revealLineArg.lineNumber + 1;
		if (lineNumber < 1) {
			lineNumber = 1;
		}
		const lineCount = this.model.getLineCount();
		if (lineNumber > lineCount) {
			lineNumber = lineCount;
		}

		const range = new Range(
			lineNumber, 1,
			lineNumber, this.model.getLineMaxColumn(lineNumber)
		);

		let revealAt = VerticalRevealType.Simple;
		if (revealLineArg.at) {
			switch (revealLineArg.at) {
				case RevealLine.RawAtArgument.Top:
					revealAt = VerticalRevealType.Top;
					break;
				case RevealLine.RawAtArgument.Center:
					revealAt = VerticalRevealType.Center;
					break;
				case RevealLine.RawAtArgument.Bottom:
					revealAt = VerticalRevealType.Bottom;
					break;
				default:
					break;
			}
		}

		this.emitCursorRevealRange(range, null, revealAt, false);
	}

	private _scrollUp(isPaged: boolean, ctx: IMultipleCursorOperationContext): void {
		this._doEditorScroll({
			direction: EditorScroll.Direction.Up,
			unit: (isPaged ? EditorScroll.Unit.Page : EditorScroll.Unit.WrappedLine),
			value: 1,
			revealCursor: false
		}, ctx);
	}

	private _scrollDown(isPaged: boolean, ctx: IMultipleCursorOperationContext): void {
		this._doEditorScroll({
			direction: EditorScroll.Direction.Down,
			unit: (isPaged ? EditorScroll.Unit.Page : EditorScroll.Unit.WrappedLine),
			value: 1,
			revealCursor: false
		}, ctx);
	}

	private _editorScroll(ctx: IMultipleCursorOperationContext): void {
		const args = EditorScroll.parse(ctx.eventData);
		if (!args) {
			// illegal arguments
			return;
		}
		this._doEditorScroll(args, ctx);
	}

	private _doEditorScroll(args: EditorScroll.ParsedArguments, ctx: IMultipleCursorOperationContext): void {

		const desiredScrollTop = this._computeDesiredScrollTop(args);

		if (args.revealCursor) {
			// must ensure cursor is in new visible range
			const desiredVisibleViewRange = this.context.getCompletelyVisibleViewRangeAtScrollTop(desiredScrollTop);
			const r = CursorMoveCommands.findPositionInViewportIfOutside(this.context, this.cursors.getPrimaryCursor(), desiredVisibleViewRange, false);
			this.cursors.setStates([r], false);
		}

		this._eventEmitter.emit(CursorEventType.CursorScrollRequest, new CursorScrollRequest(
			desiredScrollTop
		));

		ctx.shouldReveal = false;
	}

	private _computeDesiredScrollTop(args: EditorScroll.ParsedArguments): number {

		if (args.unit === EditorScroll.Unit.Line) {
			// scrolling by model lines
			const visibleModelRange = this.context.getCompletelyVisibleModelRange();

			let desiredTopModelLineNumber: number;
			if (args.direction === EditorScroll.Direction.Up) {
				// must go x model lines up
				desiredTopModelLineNumber = Math.max(1, visibleModelRange.startLineNumber - args.value);
			} else {
				// must go x model lines down
				desiredTopModelLineNumber = Math.min(this.context.model.getLineCount(), visibleModelRange.startLineNumber + args.value);
			}

			const desiredTopViewPosition = this.context.convertModelPositionToViewPosition(new Position(desiredTopModelLineNumber, 1));
			return this.context.getVerticalOffsetForViewLine(desiredTopViewPosition.lineNumber);
		}

		let noOfLines: number;
		if (args.unit === EditorScroll.Unit.Page) {
			noOfLines = this.context.config.pageSize * args.value;
		} else if (args.unit === EditorScroll.Unit.HalfPage) {
			noOfLines = Math.round(this.context.config.pageSize / 2) * args.value;
		} else {
			noOfLines = args.value;
		}
		const deltaLines = (args.direction === EditorScroll.Direction.Up ? -1 : 1) * noOfLines;
		return this.context.getScrollTop() + deltaLines * this.context.config.lineHeight;
	}

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
		ctx.shouldRevealHorizontal = true;

		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;

		ctx.executeCommands[0] = command;
		ctx.isAutoWhitespaceCommand[0] = false;
	}

	private _externalExecuteCommands(ctx: IMultipleCursorOperationContext): void {
		const commands = <editorCommon.ICommand[]>ctx.eventData;

		ctx.shouldReveal = true;
		ctx.shouldRevealHorizontal = true;

		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;

		const cursors = this.cursors.getAll();
		for (let i = 0; i < cursors.length; i++) {
			ctx.executeCommands[i] = commands[i];
			ctx.isAutoWhitespaceCommand[i] = false;
		}
	}
}

export namespace EditorScroll {

	const isEditorScrollArgs = function (arg): boolean {
		if (!types.isObject(arg)) {
			return false;
		}

		let scrollArg: RawArguments = arg;

		if (!types.isString(scrollArg.to)) {
			return false;
		}

		if (!types.isUndefined(scrollArg.by) && !types.isString(scrollArg.by)) {
			return false;
		}

		if (!types.isUndefined(scrollArg.value) && !types.isNumber(scrollArg.value)) {
			return false;
		}

		if (!types.isUndefined(scrollArg.revealCursor) && !types.isBoolean(scrollArg.revealCursor)) {
			return false;
		}

		return true;
	};

	export const description = <ICommandHandlerDescription>{
		description: 'Scroll editor in the given direction',
		args: [
			{
				name: 'Editor scroll argument object',
				description: `Property-value pairs that can be passed through this argument:
					* 'to': A mandatory direction value.
						\`\`\`
						'up', 'down'
						\`\`\`
					* 'by': Unit to move. Default is computed based on 'to' value.
						\`\`\`
						'line', 'wrappedLine', 'page', 'halfPage'
						\`\`\`
					* 'value': Number of units to move. Default is '1'.
					* 'revealCursor': If 'true' reveals the cursor if it is outside view port.
				`,
				constraint: isEditorScrollArgs
			}
		]
	};

	/**
	 * Directions in the view for editor scroll command.
	 */
	export const RawDirection = {
		Up: 'up',
		Down: 'down',
	};

	/**
	 * Units for editor scroll 'by' argument
	 */
	export const RawUnit = {
		Line: 'line',
		WrappedLine: 'wrappedLine',
		Page: 'page',
		HalfPage: 'halfPage'
	};

	/**
	 * Arguments for editor scroll command
	 */
	export interface RawArguments {
		to: string;
		by?: string;
		value?: number;
		revealCursor?: boolean;
	};

	export function parse(args: RawArguments): ParsedArguments {
		let direction: Direction;
		switch (args.to) {
			case RawDirection.Up:
				direction = Direction.Up;
				break;
			case RawDirection.Down:
				direction = Direction.Down;
				break;
			default:
				// Illegal arguments
				return null;
		}

		let unit: Unit;
		switch (args.by) {
			case RawUnit.Line:
				unit = Unit.Line;
				break;
			case RawUnit.WrappedLine:
				unit = Unit.WrappedLine;
				break;
			case RawUnit.Page:
				unit = Unit.Page;
				break;
			case RawUnit.HalfPage:
				unit = Unit.HalfPage;
				break;
			default:
				unit = Unit.WrappedLine;
		}

		const value = Math.floor(args.value || 1);
		const revealCursor = !!args.revealCursor;

		return {
			direction: direction,
			unit: unit,
			value: value,
			revealCursor: revealCursor
		};
	}

	export interface ParsedArguments {
		direction: Direction;
		unit: Unit;
		value: number;
		revealCursor: boolean;
	}

	export const enum Direction {
		Up = 1,
		Down = 2
	}

	export const enum Unit {
		Line = 1,
		WrappedLine = 2,
		Page = 3,
		HalfPage = 4
	}
}

export namespace RevealLine {

	const isRevealLineArgs = function (arg): boolean {
		if (!types.isObject(arg)) {
			return false;
		}

		let reveaLineArg: RawArguments = arg;

		if (!types.isNumber(reveaLineArg.lineNumber)) {
			return false;
		}

		if (!types.isUndefined(reveaLineArg.at) && !types.isString(reveaLineArg.at)) {
			return false;
		}

		return true;
	};

	export const description = <ICommandHandlerDescription>{
		description: 'Reveal the given line at the given logical position',
		args: [
			{
				name: 'Reveal line argument object',
				description: `Property-value pairs that can be passed through this argument:
					* 'lineNumber': A mandatory line number value.
					* 'at': Logical position at which line has to be revealed .
						\`\`\`
						'top', 'center', 'bottom'
						\`\`\`
				`,
				constraint: isRevealLineArgs
			}
		]
	};

	/**
	 * Arguments for reveal line command
	 */
	export interface RawArguments {
		lineNumber?: number;
		at?: string;
	};

	/**
	 * Values for reveal line 'at' argument
	 */
	export const RawAtArgument = {
		Top: 'top',
		Center: 'center',
		Bottom: 'bottom'
	};
}
