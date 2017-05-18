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
	shouldPushStackElementBefore: boolean;
	shouldPushStackElementAfter: boolean;
	executeCommands: editorCommon.ICommand[];
	isAutoWhitespaceCommand: boolean[];
}

class CursorOperationArgs<T> {
	public readonly eventSource: string;
	public readonly eventData: T;

	constructor(eventSource: string, eventData: T) {
		this.eventSource = eventSource;
		this.eventData = eventData;
	}
}

interface IExecContext {
	selectionStartMarkers: string[];
	positionMarkers: string[];
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
		[key: string]: (args: CursorOperationArgs<any>, ctx: IMultipleCursorOperationContext) => void;
	};

	constructor(configuration: editorCommon.IConfiguration, model: editorCommon.IModel, viewModelHelper: IViewModelHelper) {
		super();
		this._eventEmitter = this._register(new EventEmitter());
		this._configuration = configuration;
		this._model = model;
		this._viewModelHelper = viewModelHelper;

		const createCursorContext = () => {
			const config = new CursorConfiguration(
				this._model.getLanguageIdentifier(),
				this._model.getOneIndent(),
				this._model.getOptions(),
				this._configuration
			);
			this.context = new CursorContext(
				this._model,
				this._viewModelHelper,
				config
			);
			if (this._cursors) {
				this._cursors.updateContext(this.context);
			}
		};
		createCursorContext();

		this._cursors = new CursorCollection(this.context);

		this._isHandling = false;
		this._isDoingComposition = false;
		this._columnSelectData = null;

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

		this._register(this._model.onDidChangeLanguage((e) => {
			createCursorContext();
		}));
		this._register(LanguageConfigurationRegistry.onDidChange(() => {
			// TODO@Alex: react only if certain supports changed? (and if my model's mode changed)
			createCursorContext();
		}));
		this._register(model.onDidChangeOptions(() => {
			createCursorContext();
		}));
		this._register(this._configuration.onDidChange((e) => {
			if (CursorConfiguration.shouldRecreate(e)) {
				createCursorContext();
			}
		}));

		this._handlers = {};
		this._registerHandlers();
	}

	public dispose(): void {
		this._cursors.dispose();
		this._cursors = null;
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

			this.emitCursorPositionChanged('model', CursorChangeReason.ContentFlush);
			this.emitCursorSelectionChanged('model', CursorChangeReason.ContentFlush);
		} else {
			if (!this._isHandling) {
				const selectionsFromMarkers = this._cursors.readSelectionFromMarkers();
				this.setStates('modelChange', CursorChangeReason.RecoverFromMarkers, CursorState.fromModelSelections(selectionsFromMarkers));
			}
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

	private _createAndInterpretHandlerCtx(callback: (currentHandlerCtx: IMultipleCursorOperationContext) => void): void {

		const ctx: IMultipleCursorOperationContext = {
			cursorPositionChangeReason: CursorChangeReason.NotSet,
			executeCommands: [],
			isAutoWhitespaceCommand: [],
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false
		};

		callback(ctx);

		if (ctx.shouldPushStackElementBefore) {
			this._model.pushStackElement();
			ctx.shouldPushStackElementBefore = false;
		}

		this._columnSelectData = null;

		const execCtx: IExecContext = {
			selectionStartMarkers: [],
			positionMarkers: []
		};

		this._innerExecuteCommands(execCtx, ctx.executeCommands, ctx.isAutoWhitespaceCommand);

		for (let i = 0; i < execCtx.selectionStartMarkers.length; i++) {
			this._model._removeMarker(execCtx.selectionStartMarkers[i]);
			this._model._removeMarker(execCtx.positionMarkers[i]);
		}

		ctx.executeCommands = [];

		if (ctx.shouldPushStackElementAfter) {
			this._model.pushStackElement();
			ctx.shouldPushStackElementAfter = false;
		}

		this._cursors.normalize();
	}

	private _onHandler(command: string, handler: (args: CursorOperationArgs<any>, ctx: IMultipleCursorOperationContext) => void, args: CursorOperationArgs<any>): void {

		this._isHandling = true;

		try {
			const oldSelections = this._cursors.getSelections();
			const oldViewSelections = this._cursors.getViewSelections();

			// ensure valid state on all cursors
			this._cursors.ensureValidState();

			let cursorPositionChangeReason: CursorChangeReason;

			this._createAndInterpretHandlerCtx((currentHandlerCtx: IMultipleCursorOperationContext) => {
				handler(args, currentHandlerCtx);

				cursorPositionChangeReason = currentHandlerCtx.cursorPositionChangeReason;
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
				this.emitCursorPositionChanged(args.eventSource, cursorPositionChangeReason);
				this._revealRange(RevealTarget.Primary, VerticalRevealType.Simple, true);
				this.emitCursorSelectionChanged(args.eventSource, cursorPositionChangeReason);
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

	private _getEditOperationsFromCommand(ctx: IExecContext, majorIdentifier: number, command: editorCommon.ICommand, isAutoWhitespaceCommand: boolean): ICommandData {
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
				isAutoWhitespaceEdit: isAutoWhitespaceCommand
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
					const maxLineColumn = this._model.getLineMaxColumn(selection.startLineNumber);
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
			ctx.selectionStartMarkers[l] = this._model._addMarker(0, selection.selectionStartLineNumber, selection.selectionStartColumn, selectionMarkerStickToPreviousCharacter);
			ctx.positionMarkers[l] = this._model._addMarker(0, selection.positionLineNumber, selection.positionColumn, positionMarkerStickToPreviousCharacter);
			return l.toString();
		};

		const editOperationBuilder: editorCommon.IEditOperationBuilder = {
			addEditOperation: addEditOperation,
			addTrackedEditOperation: addTrackedEditOperation,
			trackSelection: trackSelection
		};

		try {
			command.getEditOperations(this._model, editOperationBuilder);
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

	private _getEditOperations(ctx: IExecContext, commands: editorCommon.ICommand[], isAutoWhitespaceCommand: boolean[]): ICommandsData {
		let operations: editorCommon.IIdentifiedSingleEditOperation[] = [];
		let hadTrackedEditOperation: boolean = false;

		for (let i = 0, len = commands.length; i < len; i++) {
			if (commands[i]) {
				const r = this._getEditOperationsFromCommand(ctx, i, commands[i], isAutoWhitespaceCommand[i]);
				operations = operations.concat(r.operations);
				hadTrackedEditOperation = hadTrackedEditOperation || r.hadTrackedEditOperation;
			}
		}
		return {
			operations: operations,
			hadTrackedEditOperation: hadTrackedEditOperation
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

	private _arrayIsEmpty(commands: editorCommon.ICommand[]): boolean {
		for (let i = 0, len = commands.length; i < len; i++) {
			if (commands[i]) {
				return false;
			}
		}
		return true;
	}

	private _innerExecuteCommands(ctx: IExecContext, commands: editorCommon.ICommand[], isAutoWhitespaceCommand: boolean[]): void {

		if (this._configuration.editor.readOnly) {
			return;
		}

		if (this._arrayIsEmpty(commands)) {
			return;
		}

		const selectionsBefore = this._cursors.getSelections();

		const commandsData = this._getEditOperations(ctx, commands, isAutoWhitespaceCommand);
		if (commandsData.operations.length === 0) {
			return;
		}

		const rawOperations = commandsData.operations;

		const editableRange = this._model.getEditableRange();
		const editableRangeStart = editableRange.getStartPosition();
		const editableRangeEnd = editableRange.getEndPosition();
		for (let i = 0, len = rawOperations.length; i < len; i++) {
			const operationRange = rawOperations[i].range;
			if (!editableRangeStart.isBeforeOrEqual(operationRange.getStartPosition()) || !operationRange.getEndPosition().isBeforeOrEqual(editableRangeEnd)) {
				// These commands are outside of the editable range
				return;
			}
		}

		const loserCursorsMap = this._getLoserCursorMap(rawOperations);
		if (loserCursorsMap.hasOwnProperty('0')) {
			// These commands are very messed up
			console.warn('Ignoring commands');
			return;
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
		const selectionsAfter = this._model.pushEditOperations(selectionsBefore, filteredOperations, (inverseEditOperations: editorCommon.IIdentifiedSingleEditOperation[]): Selection[] => {
			let groupedInverseEditOperations: editorCommon.IIdentifiedSingleEditOperation[][] = [];
			for (let i = 0; i < selectionsBefore.length; i++) {
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
			for (let i = 0; i < selectionsBefore.length; i++) {
				if (groupedInverseEditOperations[i].length > 0) {
					groupedInverseEditOperations[i].sort(minorBasedSorter);
					cursorSelections[i] = commands[i].computeCursorState(this._model, {
						getInverseEditOperations: () => {
							return groupedInverseEditOperations[i];
						},

						getTrackedSelection: (id: string) => {
							const idx = parseInt(id, 10);
							const selectionStartMarker = this._model._getMarker(ctx.selectionStartMarkers[idx]);
							const positionMarker = this._model._getMarker(ctx.positionMarkers[idx]);
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

		this._interpretCommandResult(selectionsAfter);
	}


	// -----------------------------------------------------------------------------------------------------------
	// ----- emitting events

	private emitCursorPositionChanged(source: string, reason: CursorChangeReason): void {
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

	private emitCursorSelectionChanged(source: string, reason: CursorChangeReason): void {
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

		this._handlers[H.LineInsertBefore] = (args, ctx) => this._lineInsertBefore(args, ctx);
		this._handlers[H.LineInsertAfter] = (args, ctx) => this._lineInsertAfter(args, ctx);
		this._handlers[H.LineBreakInsert] = (args, ctx) => this._lineBreakInsert(args, ctx);

		this._handlers[H.Type] = (args, ctx) => this._type(args, ctx);
		this._handlers[H.ReplacePreviousChar] = (args, ctx) => this._replacePreviousChar(args, ctx);
		this._handlers[H.CompositionStart] = (args, ctx) => this._compositionStart(args, ctx);
		this._handlers[H.CompositionEnd] = (args, ctx) => this._compositionEnd(args, ctx);
		this._handlers[H.Tab] = (args, ctx) => this._tab(args, ctx);
		this._handlers[H.Indent] = (args, ctx) => this._indent(args, ctx);
		this._handlers[H.Outdent] = (args, ctx) => this._outdent(args, ctx);
		this._handlers[H.Paste] = (args, ctx) => this._paste(args, ctx);

		this._handlers[H.DeleteLeft] = (args, ctx) => this._deleteLeft(args, ctx);
		this._handlers[H.DeleteRight] = (args, ctx) => this._deleteRight(args, ctx);

		this._handlers[H.Cut] = (args, ctx) => this._cut(args, ctx);

		this._handlers[H.Undo] = (args, ctx) => this._undo(args, ctx);
		this._handlers[H.Redo] = (args, ctx) => this._redo(args, ctx);

		this._handlers[H.ExecuteCommand] = (args, ctx) => this._externalExecuteCommand(args, ctx);
		this._handlers[H.ExecuteCommands] = (args, ctx) => this._externalExecuteCommands(args, ctx);
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

	private _applyEdits(ctx: IMultipleCursorOperationContext, edits: EditOperationResult): void {
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
		let cursors = this._cursors.getAll();

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

	private _lineInsertBefore(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, TypeOperations.lineInsertBefore(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _lineInsertAfter(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, TypeOperations.lineInsertAfter(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _lineBreakInsert(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, TypeOperations.lineBreakInsert(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _type(args: CursorOperationArgs<{ text: string; }>, ctx: IMultipleCursorOperationContext): void {
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
				this._createAndInterpretHandlerCtx((charHandlerCtx: IMultipleCursorOperationContext) => {

					// Decide what all cursors will do up-front
					this._applyEdits(charHandlerCtx, TypeOperations.typeWithInterceptors(this.context.config, this.context.model, this._getAllCursorsModelState(), chr));

					// The last typed character gets to win
					ctx.cursorPositionChangeReason = charHandlerCtx.cursorPositionChangeReason;
				});

			}
		} else {
			this._applyEdits(ctx, TypeOperations.typeWithoutInterceptors(this.context.config, this.context.model, this._getAllCursorsModelState(), text));
		}
	}

	private _replacePreviousChar(args: CursorOperationArgs<{ text: string; replaceCharCnt: number; }>, ctx: IMultipleCursorOperationContext): void {
		let text = args.eventData.text;
		let replaceCharCnt = args.eventData.replaceCharCnt;
		this._applyEdits(ctx, TypeOperations.replacePreviousChar(this.context.config, this.context.model, this._getAllCursorsModelState(), text, replaceCharCnt));
	}

	private _compositionStart(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		this._isDoingComposition = true;
	}

	private _compositionEnd(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		this._isDoingComposition = false;
	}

	private _tab(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, TypeOperations.tab(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _indent(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, TypeOperations.indent(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _outdent(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, TypeOperations.outdent(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _distributePasteToCursors(args: CursorOperationArgs<{ pasteOnNewLine: boolean; text: string; }>, ctx: IMultipleCursorOperationContext): string[] {
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

	private _paste(args: CursorOperationArgs<{ pasteOnNewLine: boolean; text: string; }>, ctx: IMultipleCursorOperationContext): void {
		const distributedPaste = this._distributePasteToCursors(args, ctx);

		ctx.cursorPositionChangeReason = CursorChangeReason.Paste;
		if (distributedPaste) {
			this._applyEdits(ctx, TypeOperations.distributedPaste(this.context.config, this.context.model, this._getAllCursorsModelState(true), distributedPaste));
		} else {
			this._applyEdits(ctx, TypeOperations.paste(this.context.config, this.context.model, this._getAllCursorsModelState(), args.eventData.text, args.eventData.pasteOnNewLine));
		}
	}

	private _deleteLeft(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, DeleteOperations.deleteLeft(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _deleteRight(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, DeleteOperations.deleteRight(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	private _cut(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		this._applyEdits(ctx, DeleteOperations.cut(this.context.config, this.context.model, this._getAllCursorsModelState()));
	}

	// -------------------- END editing operations

	private _undo(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		ctx.cursorPositionChangeReason = CursorChangeReason.Undo;
		this._interpretCommandResult(this._model.undo());
	}

	private _redo(args: CursorOperationArgs<void>, ctx: IMultipleCursorOperationContext): void {
		ctx.cursorPositionChangeReason = CursorChangeReason.Redo;
		this._interpretCommandResult(this._model.redo());
	}

	private _externalExecuteCommand(args: CursorOperationArgs<editorCommon.ICommand>, ctx: IMultipleCursorOperationContext): void {
		const command = args.eventData;

		this._cursors.killSecondaryCursors();

		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;

		ctx.executeCommands[0] = command;
		ctx.isAutoWhitespaceCommand[0] = false;
	}

	private _externalExecuteCommands(args: CursorOperationArgs<editorCommon.ICommand[]>, ctx: IMultipleCursorOperationContext): void {
		const commands = args.eventData;

		ctx.shouldPushStackElementBefore = true;
		ctx.shouldPushStackElementAfter = true;

		for (let i = 0; i < commands.length; i++) {
			ctx.executeCommands[i] = commands[i];
			ctx.isAutoWhitespaceCommand[i] = false;
		}
	}
}
