/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {ReplaceCommand} from 'vs/editor/common/commands/replaceCommand';
import {CursorCollection, ICursorCollectionState} from 'vs/editor/common/controller/cursorCollection';
import {DispatcherEvent} from 'vs/editor/common/controller/handlerDispatcher';
import {WordNavigationType, IOneCursorOperationContext, IPostOperationRunnable, IViewModelHelper, OneCursor, OneCursorOp} from 'vs/editor/common/controller/oneCursor';
import {Position} from 'vs/editor/common/core/position';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {IColumnSelectResult} from 'vs/editor/common/controller/cursorMoveHelper';

export interface ITypingListener {
	(): void;
}

enum RevealTarget {
	Primary = 0,
	TopMost = 1,
	BottomMost = 2
}

interface IMultipleCursorOperationContext {
	cursorPositionChangeReason: string;
	shouldReveal: boolean;
	shouldRevealVerticalInCenter: boolean;
	shouldRevealHorizontal: boolean;
	shouldRevealTarget: RevealTarget;
	shouldPushStackElementBefore: boolean;
	shouldPushStackElementAfter: boolean;
	eventSource: string;
	eventData: any;
	hasExecutedCommands: boolean;
	isCursorUndo: boolean;
	executeCommands: editorCommon.ICommand[];
	postOperationRunnables: IPostOperationRunnable[];
	requestScrollDeltaLines: number;
	setColumnSelectToLineNumber: number;
	setColumnSelectToVisualColumn: number;
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

export class Cursor extends EventEmitter {

	private editorId:number;
	/* protected */public configuration:editorCommon.IConfiguration;
	private model:editorCommon.IModel;

	private modelUnbinds:IDisposable[];

	// Typing listeners
	private typingListeners:{
		[character:string]:ITypingListener[];
	};

	private cursors: CursorCollection;
	private cursorUndoStack: ICursorCollectionState[];
	private viewModelHelper:IViewModelHelper;

	private _isHandling:boolean;
	private charactersTyped:string;

	private enableEmptySelectionClipboard:boolean;

	constructor(editorId:number, configuration:editorCommon.IConfiguration, model:editorCommon.IModel, viewModelHelper:IViewModelHelper, enableEmptySelectionClipboard:boolean) {
		super([
			editorCommon.EventType.CursorPositionChanged,
			editorCommon.EventType.CursorSelectionChanged,
			editorCommon.EventType.CursorRevealRange,
			editorCommon.EventType.CursorScrollRequest
		]);
		this.editorId = editorId;
		this.configuration = configuration;
		this.model = model;
		this.viewModelHelper = viewModelHelper;
		this.enableEmptySelectionClipboard = enableEmptySelectionClipboard;
		if (!this.viewModelHelper) {
			this.viewModelHelper = {
				viewModel: this.model,
				convertModelPositionToViewPosition: (lineNumber:number, column:number) => {
					return new Position(lineNumber, column);
				},
				convertModelRangeToViewRange: (modelRange: editorCommon.IEditorRange) => {
					return modelRange;
				},
				convertViewToModelPosition: (lineNumber:number, column:number) => {
					return new Position(lineNumber, column);
				},
				convertViewSelectionToModelSelection: (viewSelection:editorCommon.IEditorSelection) => {
					return viewSelection;
				},
				validateViewPosition: (viewLineNumber:number, viewColumn:number, modelPosition:editorCommon.IEditorPosition) => {
					return modelPosition;
				},
				validateViewRange: (viewStartLineNumber:number, viewStartColumn:number, viewEndLineNumber:number, viewEndColumn:number, modelRange:editorCommon.IEditorRange) => {
					return modelRange;
				}

			};
		}

		this.cursors = new CursorCollection(this.editorId, this.model, this.configuration, this.viewModelHelper);
		this.cursorUndoStack = [];

		this.typingListeners = {};

		this._isHandling = false;

		this.modelUnbinds = [];
		this.modelUnbinds.push(this.model.addListener2(editorCommon.EventType.ModelContentChanged, (e:editorCommon.IModelContentChangedEvent) => {
			this._onModelContentChanged(e);
		}));
		this.modelUnbinds.push(this.model.addListener2(editorCommon.EventType.ModelModeChanged, (e:editorCommon.IModelModeChangedEvent) => {
			this._onModelModeChanged();
		}));
		this.modelUnbinds.push(this.model.addListener2(editorCommon.EventType.ModelModeSupportChanged, (e: editorCommon.IModeSupportChangedEvent) => {
			// TODO@Alex: react only if certain supports changed?
			this._onModelModeChanged();
		}));

		this._registerHandlers();
	}

	public dispose(): void {
		this.modelUnbinds = disposeAll(this.modelUnbinds);
		this.model = null;
		this.cursors.dispose();
		this.cursors = null;
		this.configuration.handlerDispatcher.clearHandlers();
		this.configuration = null;
		this.viewModelHelper = null;
		super.dispose();
	}

	public saveState(): editorCommon.ICursorState[] {

		var selections = this.cursors.getSelections(),
			result:editorCommon.ICursorState[] = [],
			selection: editorCommon.IEditorSelection;

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

	public restoreState(states:editorCommon.ICursorState[]): void {

		var desiredSelections:editorCommon.ISelection[] = [],
			state:editorCommon.ICursorState;

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

		this._onHandler('restoreState', (ctx:IMultipleCursorOperationContext) => {
			this.cursors.setSelections(desiredSelections);
			return false;
		}, new DispatcherEvent('restoreState', null));
	}

	public setEditableRange(range:editorCommon.IRange): void {
		this.model.setEditableRange(range);
	}

	public getEditableRange(): editorCommon.IEditorRange {
		return this.model.getEditableRange();
	}

	public addTypingListener(character:string, callback: ITypingListener): void {
		if (!this.typingListeners.hasOwnProperty(character)) {
			this.typingListeners[character] = [];
		}
		this.typingListeners[character].push(callback);
	}

	public removeTypingListener(character:string, callback: ITypingListener): void {
		if (this.typingListeners.hasOwnProperty(character)) {
			var listeners = this.typingListeners[character];
			for (var i = 0; i < listeners.length; i++) {
				if (listeners[i] === callback) {
					listeners.splice(i, 1);
					return;
				}
			}
		}
	}

	private _onModelModeChanged(): void {
		// the mode of this model has changed
		this.cursors.updateMode();
	}

	private _onModelContentChanged(e:editorCommon.IModelContentChangedEvent): void {
		if (e.changeType === editorCommon.EventType.ModelContentChangedFlush) {
			// a model.setValue() was called
			this.cursors.dispose();

			this.cursors = new CursorCollection(this.editorId, this.model, this.configuration, this.viewModelHelper);

			this.emitCursorPositionChanged('model', 'contentFlush');
			this.emitCursorSelectionChanged('model', 'contentFlush');
		} else {
			if (!this._isHandling) {
				this._onHandler('recoverSelectionFromMarkers', (ctx:IMultipleCursorOperationContext) => {
					var result = this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => oneCursor.recoverSelectionFromMarkers(oneCtx));
					ctx.shouldPushStackElementBefore = false;
					ctx.shouldPushStackElementAfter = false;
					return result;
				}, new DispatcherEvent('modelChange', null));
			}
		}
	}

	// ------ some getters/setters

	public getSelection(): editorCommon.IEditorSelection {
		return this.cursors.getSelection(0);
	}

	public getSelections(): editorCommon.IEditorSelection[] {
		return this.cursors.getSelections();
	}

	public getPosition(): editorCommon.IEditorPosition {
		return this.cursors.getPosition(0);
	}

	public setSelections(source: string, selections: editorCommon.ISelection[]): void {
		this._onHandler('setSelections', (ctx:IMultipleCursorOperationContext) => {
			ctx.shouldReveal = false;
			this.cursors.setSelections(selections);
			return false;
		}, new DispatcherEvent(source, null));
	}

	// ------ auxiliary handling logic

	private _createAndInterpretHandlerCtx(eventSource: string, eventData: any, callback:(currentHandlerCtx:IMultipleCursorOperationContext)=>void): boolean {

		var currentHandlerCtx:IMultipleCursorOperationContext = {
			cursorPositionChangeReason: '',
			shouldReveal: true,
			shouldRevealVerticalInCenter: false,
			shouldRevealHorizontal: true,
			shouldRevealTarget: RevealTarget.Primary,
			eventSource: eventSource,
			eventData: eventData,
			executeCommands: [],
			hasExecutedCommands: false,
			isCursorUndo: false,
			postOperationRunnables: [],
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false,
			requestScrollDeltaLines: 0,
			setColumnSelectToLineNumber: 0,
			setColumnSelectToVisualColumn: 0
		};

		callback(currentHandlerCtx);

		this._interpretHandlerContext(currentHandlerCtx);
		this.cursors.normalize();

		return currentHandlerCtx.hasExecutedCommands;
	}

	private _onHandler(command:string, handler:(ctx:IMultipleCursorOperationContext)=>boolean, e:editorCommon.IDispatcherEvent): boolean {

		this._isHandling = true;
		this.charactersTyped = '';

		var handled = false;

		try {
			var oldSelections = this.cursors.getSelections();
			var oldViewSelections = this.cursors.getViewSelections();
			var prevCursorsState = this.cursors.saveState();

			var eventSource = e.getSource();
			var cursorPositionChangeReason: string;
			var shouldReveal: boolean;
			var shouldRevealVerticalInCenter: boolean;
			var shouldRevealHorizontal: boolean;
			var shouldRevealTarget: RevealTarget;
			var isCursorUndo: boolean;
			var requestScrollDeltaLines: number;

			var hasExecutedCommands = this._createAndInterpretHandlerCtx(eventSource, e.getData(), (currentHandlerCtx:IMultipleCursorOperationContext) => {
				handled = handler(currentHandlerCtx);

				cursorPositionChangeReason = currentHandlerCtx.cursorPositionChangeReason;
				shouldReveal = currentHandlerCtx.shouldReveal;
				shouldRevealTarget = currentHandlerCtx.shouldRevealTarget;
				shouldRevealVerticalInCenter = currentHandlerCtx.shouldRevealVerticalInCenter;
				shouldRevealHorizontal = currentHandlerCtx.shouldRevealHorizontal;
				isCursorUndo = currentHandlerCtx.isCursorUndo;
				requestScrollDeltaLines = currentHandlerCtx.requestScrollDeltaLines;
			});

			if (hasExecutedCommands) {
				this.cursorUndoStack = [];
			}

			// Ping typing listeners after the model emits events & after I emit events
			for (var i = 0; i < this.charactersTyped.length; i++) {
				var chr = this.charactersTyped.charAt(i);
				if (this.typingListeners.hasOwnProperty(chr)) {
					var listeners = this.typingListeners[chr].slice(0);
					for (var j = 0, lenJ = listeners.length; j < lenJ; j++) {
						// Hoping that listeners understand that the view might be in an awkward state
						try {
							listeners[j]();
						} catch (e) {
							onUnexpectedError(e);
						}
					}
				}
			}

			var newSelections = this.cursors.getSelections();
			var newViewSelections = this.cursors.getViewSelections();

			var somethingChanged = false;
			if (oldSelections.length !== newSelections.length) {
				somethingChanged = true;
			} else {
				for (var i = 0, len = oldSelections.length; !somethingChanged && i < len; i++) {
					if (!oldSelections[i].equalsSelection(newSelections[i])) {
						somethingChanged = true;
					}
				}
				for (var i = 0, len = oldViewSelections.length; !somethingChanged && i < len; i++) {
					if (!oldViewSelections[i].equalsSelection(newViewSelections[i])) {
						somethingChanged = true;
					}
				}
			}


			if (somethingChanged) {
				if (!hasExecutedCommands && !isCursorUndo) {
					this.cursorUndoStack.push(prevCursorsState);
				}
				if (this.cursorUndoStack.length > 50) {
					this.cursorUndoStack = this.cursorUndoStack.splice(0, this.cursorUndoStack.length - 50);
				}
				this.emitCursorPositionChanged(eventSource, cursorPositionChangeReason);

				if (shouldReveal) {
					this.emitCursorRevealRange(shouldRevealTarget, shouldRevealVerticalInCenter ? editorCommon.VerticalRevealType.Center : editorCommon.VerticalRevealType.Simple, shouldRevealHorizontal);
				}
				this.emitCursorSelectionChanged(eventSource, cursorPositionChangeReason);
			}

			if (requestScrollDeltaLines) {
				this.emitCursorScrollRequest(requestScrollDeltaLines);
			}
		} catch (err) {
			onUnexpectedError(err);
		}

		this._isHandling = false;

		return handled;
	}

	private _interpretHandlerContext(ctx: IMultipleCursorOperationContext): void {
		if (ctx.shouldPushStackElementBefore) {
			this.model.pushStackElement();
			ctx.shouldPushStackElementBefore = false;
		}

		this._columnSelectToLineNumber = ctx.setColumnSelectToLineNumber;
		this._columnSelectToVisualColumn = ctx.setColumnSelectToVisualColumn;

		ctx.hasExecutedCommands = this._internalExecuteCommands(ctx.executeCommands, ctx.postOperationRunnables) || ctx.hasExecutedCommands;
		ctx.executeCommands = [];

		if (ctx.shouldPushStackElementAfter) {
			this.model.pushStackElement();
			ctx.shouldPushStackElementAfter = false;
		}

		var hasPostOperationRunnables = false;
		for (var i = 0, len = ctx.postOperationRunnables.length; i < len; i++) {
			if (ctx.postOperationRunnables[i]) {
				hasPostOperationRunnables = true;
				break;
			}
		}

		if (hasPostOperationRunnables) {
			var postOperationRunnables = ctx.postOperationRunnables.slice(0);
			ctx.postOperationRunnables = [];

			this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
				if (postOperationRunnables[cursorIndex]) {
					postOperationRunnables[cursorIndex](oneCtx);
				}
				return false;
			});

			this._interpretHandlerContext(ctx);
		}
	}

	private _interpretCommandResult(cursorState:editorCommon.IEditorSelection[]): boolean {
		if (!cursorState) {
			return false;
		}

		this.cursors.setSelections(cursorState);
		return true;
	}

	private _getEditOperationsFromCommand(ctx: IExecContext, majorIdentifier: number, command: editorCommon.ICommand): ICommandData {
		// This method acts as a transaction, if the command fails
		// everything it has done is ignored
		var operations: editorCommon.IIdentifiedSingleEditOperation[] = [],
			operationMinor = 0;

		var addEditOperation = (selection:editorCommon.IEditorRange, text:string) => {
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
				forceMoveMarkers: false
			});
		};

		var hadTrackedRange = false;
		var trackSelection = (selection: editorCommon.IEditorSelection, trackPreviousOnEmpty?:boolean ) => {
			var selectionMarkerStickToPreviousCharacter:boolean,
				positionMarkerStickToPreviousCharacter:boolean;

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
				if (selection.getDirection() === editorCommon.SelectionDirection.LTR) {
					selectionMarkerStickToPreviousCharacter = false;
					positionMarkerStickToPreviousCharacter = true;
				} else {
					selectionMarkerStickToPreviousCharacter = true;
					positionMarkerStickToPreviousCharacter = false;
				}
			}

			var l = ctx.selectionStartMarkers.length;
			ctx.selectionStartMarkers[l] = this.model._addMarker(selection.selectionStartLineNumber, selection.selectionStartColumn, selectionMarkerStickToPreviousCharacter);
			ctx.positionMarkers[l] = this.model._addMarker(selection.positionLineNumber, selection.positionColumn, positionMarkerStickToPreviousCharacter);
			return l.toString();
		};

		var editOperationBuilder:editorCommon.IEditOperationBuilder = {
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

	private _getEditOperations(ctx: IExecContext, commands: editorCommon.ICommand[]): ICommandsData {
		var oneResult: ICommandData;
		var operations: editorCommon.IIdentifiedSingleEditOperation[] = [];
		var hadTrackedRanges: boolean[] = [];
		var anyoneHadTrackedRange: boolean;

		for (var i = 0; i < commands.length; i++) {
			if (commands[i]) {
				oneResult = this._getEditOperationsFromCommand(ctx, i, commands[i]);
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
		operations.sort((a:editorCommon.IIdentifiedSingleEditOperation, b:editorCommon.IIdentifiedSingleEditOperation): number => {
			// Note the minus!
			return -(Range.compareRangesUsingEnds(a.range, b.range));
		});

		// Operations can not overlap!
		var loserCursorsMap:{ [index:string]: boolean; } = {};

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

	private _collapseDeleteCommands(rawCmds: editorCommon.ICommand[], postOperationRunnables: IPostOperationRunnable[]): boolean {
		if (rawCmds.length === 1) {
			return ;
		}

		// Merge adjacent delete commands
		var allAreDeleteCommands = rawCmds.every((command) => {
			if (!(command instanceof ReplaceCommand)) {
				return false;
			}
			var replCmd = (<ReplaceCommand>command);
			if (replCmd.getText().length > 0) {
				return false;
			}
			return true;
		});

		if (!allAreDeleteCommands) {
			return;
		}

		var commands = <ReplaceCommand[]>rawCmds;
		var cursors = commands.map((cmd, i) => {
			return {
				range: commands[i].getRange(),
				postOperationRunnable: postOperationRunnables[i],
				order: i
			};
		});

		cursors.sort((a, b) => {
			return Range.compareRangesUsingStarts(a.range, b.range);
		});

		var previousCursor = cursors[0];
		for (var i = 1; i < cursors.length; i++) {
			if (previousCursor.range.endLineNumber === cursors[i].range.startLineNumber && previousCursor.range.endColumn === cursors[i].range.startColumn) {
				// Merge ranges
				var mergedRange = new Range(
					previousCursor.range.startLineNumber,
					previousCursor.range.startColumn,
					cursors[i].range.endLineNumber,
					cursors[i].range.endColumn
				);

				previousCursor.range = mergedRange;

				commands[cursors[i].order].setRange(mergedRange);
				commands[previousCursor.order].setRange(mergedRange);
			} else {
				// Push previous cursor
				previousCursor = cursors[i];
			}
		}
	}

	private _internalExecuteCommands(commands: editorCommon.ICommand[], postOperationRunnables: IPostOperationRunnable[]): boolean {
		var ctx:IExecContext = {
			selectionStartMarkers: [],
			positionMarkers: []
		};

		this._collapseDeleteCommands(commands, postOperationRunnables);

		var r = this._innerExecuteCommands(ctx, commands, postOperationRunnables);
		for (var i = 0; i < ctx.selectionStartMarkers.length; i++) {
			this.model._removeMarker(ctx.selectionStartMarkers[i]);
			this.model._removeMarker(ctx.positionMarkers[i]);
		}
		return r;
	}

	private _arrayIsEmpty(commands: editorCommon.ICommand[]): boolean {
		var i:number,
			len:number;

		for (i = 0, len = commands.length; i < len; i++) {
			if (commands[i]) {
				return false;
			}
		}

		return true;
	}

	private _innerExecuteCommands(ctx: IExecContext, commands: editorCommon.ICommand[], postOperationRunnables: IPostOperationRunnable[]): boolean {

		if (this.configuration.editor.readOnly) {
			return false;
		}

		if (this._arrayIsEmpty(commands)) {
			return false;
		}

		var selectionsBefore = this.cursors.getSelections();

		var commandsData = this._getEditOperations(ctx, commands);
		if (commandsData.operations.length === 0 && !commandsData.anyoneHadTrackedRange) {
			return false;
		}

		var rawOperations = commandsData.operations;

		var editableRange = this.model.getEditableRange();
		var editableRangeStart = editableRange.getStartPosition();
		var editableRangeEnd = editableRange.getEndPosition();
		for (var i = 0; i < rawOperations.length; i++) {
			var operationRange = rawOperations[i].range;
			if (!editableRangeStart.isBeforeOrEqual(operationRange.getStartPosition()) || !operationRange.getEndPosition().isBeforeOrEqual(editableRangeEnd)) {
				// These commands are outside of the editable range
				return false;
			}
		}

		var loserCursorsMap = this._getLoserCursorMap(rawOperations);
		if (loserCursorsMap.hasOwnProperty('0')) {
			// These commands are very messed up
			console.warn('Ignoring commands');
			return false;
		}

		// Remove operations belonging to losing cursors
		var filteredOperations: editorCommon.IIdentifiedSingleEditOperation[] = [];
		for (var i = 0; i < rawOperations.length; i++) {
			if (!loserCursorsMap.hasOwnProperty(rawOperations[i].identifier.major.toString())) {
				filteredOperations.push(rawOperations[i]);
			}
		}

		var selectionsAfter = this.model.pushEditOperations(selectionsBefore, filteredOperations, (inverseEditOperations:editorCommon.IIdentifiedSingleEditOperation[]): editorCommon.IEditorSelection[] => {
			var groupedInverseEditOperations:editorCommon.IIdentifiedSingleEditOperation[][] = [];
			for (var i = 0; i < selectionsBefore.length; i++) {
				groupedInverseEditOperations[i] = [];
			}
			for (var i = 0; i < inverseEditOperations.length; i++) {
				var op = inverseEditOperations[i];
				groupedInverseEditOperations[op.identifier.major].push(op);
			}
			var minorBasedSorter = (a:editorCommon.IIdentifiedSingleEditOperation, b:editorCommon.IIdentifiedSingleEditOperation) => {
				return a.identifier.minor - b.identifier.minor;
			};
			var cursorSelections: editorCommon.IEditorSelection[] = [];
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
		losingCursors.sort((a:number, b:number): number => {
			return b - a;
		});

		// Remove losing cursors
		for (var i = 0; i < losingCursors.length; i++) {
			selectionsAfter.splice(losingCursors[i], 1);
			postOperationRunnables.splice(losingCursors[i], 1);
		}

		return this._interpretCommandResult(selectionsAfter);
	}


	// -----------------------------------------------------------------------------------------------------------
	// ----- emitting events

	private emitCursorPositionChanged(source:string, reason:string): void {
		var positions = this.cursors.getPositions();
		var primaryPosition = positions[0];
		var secondaryPositions = positions.slice(1);

		var viewPositions = this.cursors.getViewPositions();
		var primaryViewPosition = viewPositions[0];
		var secondaryViewPositions = viewPositions.slice(1);

		var isInEditableRange:boolean = true;
		if (this.model.hasEditableRange()) {
			var editableRange = this.model.getEditableRange();
			if (!editableRange.containsPosition(primaryPosition)) {
				isInEditableRange = false;
			}
		}
		var e:editorCommon.ICursorPositionChangedEvent = {
			position: primaryPosition,
			viewPosition: primaryViewPosition,
			secondaryPositions: secondaryPositions,
			secondaryViewPositions: secondaryViewPositions,
			reason: reason,
			source: source,
			isInEditableRange: isInEditableRange
		};
		this.emit(editorCommon.EventType.CursorPositionChanged, e);
	}

	private emitCursorSelectionChanged(source:string, reason:string): void {
		let selections = this.cursors.getSelections();
		let primarySelection = selections[0];
		let secondarySelections = selections.slice(1);

		let viewSelections = this.cursors.getViewSelections();
		let primaryViewSelection = viewSelections[0];
		let secondaryViewSelections = viewSelections.slice(1);

		let e:editorCommon.ICursorSelectionChangedEvent = {
			selection: primarySelection,
			viewSelection: primaryViewSelection,
			secondarySelections: secondarySelections,
			secondaryViewSelections: secondaryViewSelections,
			source: source,
			reason: reason
		};
		this.emit(editorCommon.EventType.CursorSelectionChanged, e);
	}

	private emitCursorScrollRequest(lineScrollOffset: number): void {
		var e:editorCommon.ICursorScrollRequestEvent = {
			deltaLines: lineScrollOffset
		};
		this.emit(editorCommon.EventType.CursorScrollRequest, e);
	}

	private emitCursorRevealRange(revealTarget: RevealTarget, verticalType: editorCommon.VerticalRevealType, revealHorizontal: boolean): void {
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
		var e:editorCommon.ICursorRevealRangeEvent = {
			range: range,
			viewRange: viewRange,
			verticalType: verticalType,
			revealHorizontal: revealHorizontal
		};
		this.emit(editorCommon.EventType.CursorRevealRange, e);
	}

	// -----------------------------------------------------------------------------------------------------------
	// ----- handlers beyond this point

	private _registerHandlers(): void {
		var H = editorCommon.Handler;
		var handlersMap:{
			[key:string]:(ctx:IMultipleCursorOperationContext)=>boolean;
		} = {};

		handlersMap[H.JumpToBracket] =				(ctx:IMultipleCursorOperationContext) => this._jumpToBracket(ctx);

		handlersMap[H.MoveTo] = 					(ctx:IMultipleCursorOperationContext) => this._moveTo(false, ctx);
		handlersMap[H.MoveToSelect] = 				(ctx:IMultipleCursorOperationContext) => this._moveTo(true, ctx);
		handlersMap[H.ColumnSelect] = 				(ctx:IMultipleCursorOperationContext) => this._columnSelectMouse(ctx);
		handlersMap[H.AddCursorUp] = 				(ctx:IMultipleCursorOperationContext) => this._addCursorUp(ctx);
		handlersMap[H.AddCursorDown] = 				(ctx:IMultipleCursorOperationContext) => this._addCursorDown(ctx);
		handlersMap[H.CreateCursor] =				(ctx:IMultipleCursorOperationContext) => this._createCursor(ctx);
		handlersMap[H.LastCursorMoveToSelect] =		(ctx:IMultipleCursorOperationContext) => this._lastCursorMoveTo(ctx);


		handlersMap[H.CursorLeft] = 				(ctx:IMultipleCursorOperationContext) => this._moveLeft(false, ctx);
		handlersMap[H.CursorLeftSelect] =			(ctx:IMultipleCursorOperationContext) => this._moveLeft(true, ctx);

		handlersMap[H.CursorWordLeft] =				(ctx:IMultipleCursorOperationContext) => this._moveWordLeft(false, WordNavigationType.WordStart, ctx);
		handlersMap[H.CursorWordStartLeft] =		(ctx:IMultipleCursorOperationContext) => this._moveWordLeft(false, WordNavigationType.WordStart, ctx);
		handlersMap[H.CursorWordEndLeft] =			(ctx:IMultipleCursorOperationContext) => this._moveWordLeft(false, WordNavigationType.WordEnd, ctx);

		handlersMap[H.CursorWordLeftSelect] =		(ctx:IMultipleCursorOperationContext) => this._moveWordLeft(true, WordNavigationType.WordStart, ctx);
		handlersMap[H.CursorWordStartLeftSelect] =	(ctx:IMultipleCursorOperationContext) => this._moveWordLeft(true, WordNavigationType.WordStart, ctx);
		handlersMap[H.CursorWordEndLeftSelect] =	(ctx:IMultipleCursorOperationContext) => this._moveWordLeft(true, WordNavigationType.WordEnd, ctx);

		handlersMap[H.CursorRight] =				(ctx:IMultipleCursorOperationContext) => this._moveRight(false, ctx);
		handlersMap[H.CursorRightSelect] =			(ctx:IMultipleCursorOperationContext) => this._moveRight(true, ctx);

		handlersMap[H.CursorWordRight] =			(ctx:IMultipleCursorOperationContext) => this._moveWordRight(false, WordNavigationType.WordEnd, ctx);
		handlersMap[H.CursorWordStartRight] =		(ctx:IMultipleCursorOperationContext) => this._moveWordRight(false, WordNavigationType.WordStart, ctx);
		handlersMap[H.CursorWordEndRight] =			(ctx:IMultipleCursorOperationContext) => this._moveWordRight(false, WordNavigationType.WordEnd, ctx);

		handlersMap[H.CursorWordRightSelect] =		(ctx:IMultipleCursorOperationContext) => this._moveWordRight(true, WordNavigationType.WordEnd, ctx);
		handlersMap[H.CursorWordStartRightSelect] =	(ctx:IMultipleCursorOperationContext) => this._moveWordRight(true, WordNavigationType.WordStart, ctx);
		handlersMap[H.CursorWordEndRightSelect] =	(ctx:IMultipleCursorOperationContext) => this._moveWordRight(true, WordNavigationType.WordEnd, ctx);

		handlersMap[H.CursorUp] =					(ctx:IMultipleCursorOperationContext) => this._moveUp(false, false, ctx);
		handlersMap[H.CursorUpSelect] =				(ctx:IMultipleCursorOperationContext) => this._moveUp(true, false, ctx);
		handlersMap[H.CursorDown] =					(ctx:IMultipleCursorOperationContext) => this._moveDown(false, false, ctx);
		handlersMap[H.CursorDownSelect] =			(ctx:IMultipleCursorOperationContext) => this._moveDown(true, false, ctx);

		handlersMap[H.CursorPageUp] =				(ctx:IMultipleCursorOperationContext) => this._moveUp(false, true, ctx);
		handlersMap[H.CursorPageUpSelect] =			(ctx:IMultipleCursorOperationContext) => this._moveUp(true, true, ctx);
		handlersMap[H.CursorPageDown] =				(ctx:IMultipleCursorOperationContext) => this._moveDown(false, true, ctx);
		handlersMap[H.CursorPageDownSelect] =		(ctx:IMultipleCursorOperationContext) => this._moveDown(true, true, ctx);

		handlersMap[H.CursorHome] =					(ctx:IMultipleCursorOperationContext) => this._moveToBeginningOfLine(false, ctx);
		handlersMap[H.CursorHomeSelect] =			(ctx:IMultipleCursorOperationContext) => this._moveToBeginningOfLine(true, ctx);

		handlersMap[H.CursorEnd] =					(ctx:IMultipleCursorOperationContext) => this._moveToEndOfLine(false, ctx);
		handlersMap[H.CursorEndSelect] =			(ctx:IMultipleCursorOperationContext) => this._moveToEndOfLine(true, ctx);

		handlersMap[H.CursorTop] =					(ctx:IMultipleCursorOperationContext) => this._moveToBeginningOfBuffer(false, ctx);
		handlersMap[H.CursorTopSelect] =			(ctx:IMultipleCursorOperationContext) => this._moveToBeginningOfBuffer(true, ctx);
		handlersMap[H.CursorBottom] =				(ctx:IMultipleCursorOperationContext) => this._moveToEndOfBuffer(false, ctx);
		handlersMap[H.CursorBottomSelect] =			(ctx:IMultipleCursorOperationContext) => this._moveToEndOfBuffer(true, ctx);

		handlersMap[H.CursorColumnSelectLeft] =		(ctx:IMultipleCursorOperationContext) => this._columnSelectLeft(ctx);
		handlersMap[H.CursorColumnSelectRight] =	(ctx:IMultipleCursorOperationContext) => this._columnSelectRight(ctx);
		handlersMap[H.CursorColumnSelectUp] =		(ctx:IMultipleCursorOperationContext) => this._columnSelectUp(false, ctx);
		handlersMap[H.CursorColumnSelectPageUp] =	(ctx:IMultipleCursorOperationContext) => this._columnSelectUp(true, ctx);
		handlersMap[H.CursorColumnSelectDown] =		(ctx:IMultipleCursorOperationContext) => this._columnSelectDown(false, ctx);
		handlersMap[H.CursorColumnSelectPageDown] =	(ctx:IMultipleCursorOperationContext) => this._columnSelectDown(true, ctx);

		handlersMap[H.SelectAll] =					(ctx:IMultipleCursorOperationContext) => this._selectAll(ctx);

		handlersMap[H.LineSelect] = 				(ctx:IMultipleCursorOperationContext) => this._line(false, ctx);
		handlersMap[H.LineSelectDrag] =				(ctx:IMultipleCursorOperationContext) => this._line(true, ctx);
		handlersMap[H.LastCursorLineSelect] = 		(ctx:IMultipleCursorOperationContext) => this._lastCursorLine(false, ctx);
		handlersMap[H.LastCursorLineSelectDrag] = 	(ctx:IMultipleCursorOperationContext) => this._lastCursorLine(true, ctx);

		handlersMap[H.LineInsertBefore] =			(ctx:IMultipleCursorOperationContext) => this._lineInsertBefore(ctx);
		handlersMap[H.LineInsertAfter] =			(ctx:IMultipleCursorOperationContext) => this._lineInsertAfter(ctx);
		handlersMap[H.LineBreakInsert] =			(ctx:IMultipleCursorOperationContext) => this._lineBreakInsert(ctx);

		handlersMap[H.WordSelect] = 				(ctx:IMultipleCursorOperationContext) => this._word(false, ctx);
		handlersMap[H.WordSelectDrag] =				(ctx:IMultipleCursorOperationContext) => this._word(true, ctx);
		handlersMap[H.LastCursorWordSelect] =		(ctx:IMultipleCursorOperationContext) => this._lastCursorWord(ctx);
		handlersMap[H.CancelSelection] =			(ctx:IMultipleCursorOperationContext) => this._cancelSelection(ctx);
		handlersMap[H.RemoveSecondaryCursors] =		(ctx:IMultipleCursorOperationContext) => this._removeSecondaryCursors(ctx);

		handlersMap[H.Type] =						(ctx:IMultipleCursorOperationContext) => this._type(ctx);
		handlersMap[H.ReplacePreviousChar] =		(ctx:IMultipleCursorOperationContext) => this._replacePreviousChar(ctx);
		handlersMap[H.Tab] =						(ctx:IMultipleCursorOperationContext) => this._tab(ctx);
		handlersMap[H.Indent] =						(ctx:IMultipleCursorOperationContext) => this._indent(ctx);
		handlersMap[H.Outdent] =					(ctx:IMultipleCursorOperationContext) => this._outdent(ctx);
		handlersMap[H.Paste] =						(ctx:IMultipleCursorOperationContext) => this._paste(ctx);

		handlersMap[H.ScrollLineUp] =				(ctx:IMultipleCursorOperationContext) => this._scrollUp(false, ctx);
		handlersMap[H.ScrollLineDown] =				(ctx:IMultipleCursorOperationContext) => this._scrollDown(false, ctx);
		handlersMap[H.ScrollPageUp] =				(ctx:IMultipleCursorOperationContext) => this._scrollUp(true, ctx);
		handlersMap[H.ScrollPageDown] =				(ctx:IMultipleCursorOperationContext) => this._scrollDown(true, ctx);

		handlersMap[H.DeleteLeft] =					(ctx:IMultipleCursorOperationContext) => this._deleteLeft(ctx);

		handlersMap[H.DeleteWordLeft] =				(ctx:IMultipleCursorOperationContext) => this._deleteWordLeft(true, WordNavigationType.WordStart, ctx);
		handlersMap[H.DeleteWordStartLeft] =		(ctx:IMultipleCursorOperationContext) => this._deleteWordLeft(false, WordNavigationType.WordStart, ctx);
		handlersMap[H.DeleteWordEndLeft] =			(ctx:IMultipleCursorOperationContext) => this._deleteWordLeft(false, WordNavigationType.WordEnd, ctx);

		handlersMap[H.DeleteRight] =				(ctx:IMultipleCursorOperationContext) => this._deleteRight(ctx);

		handlersMap[H.DeleteWordRight] =			(ctx:IMultipleCursorOperationContext) => this._deleteWordRight(true, WordNavigationType.WordEnd, ctx);
		handlersMap[H.DeleteWordStartRight] =		(ctx:IMultipleCursorOperationContext) => this._deleteWordRight(false, WordNavigationType.WordStart, ctx);
		handlersMap[H.DeleteWordEndRight] =			(ctx:IMultipleCursorOperationContext) => this._deleteWordRight(false, WordNavigationType.WordEnd, ctx);

		handlersMap[H.DeleteAllLeft] =				(ctx:IMultipleCursorOperationContext) => this._deleteAllLeft(ctx);
		handlersMap[H.DeleteAllRight] =				(ctx:IMultipleCursorOperationContext) => this._deleteAllRight(ctx);
		handlersMap[H.Cut] =						(ctx:IMultipleCursorOperationContext) => this._cut(ctx);

		handlersMap[H.ExpandLineSelection] =		(ctx:IMultipleCursorOperationContext) => this._expandLineSelection(ctx);

		handlersMap[H.Undo] =						(ctx:IMultipleCursorOperationContext) => this._undo(ctx);
		handlersMap[H.CursorUndo] =					(ctx:IMultipleCursorOperationContext) => this._cursorUndo(ctx);
		handlersMap[H.Redo] =						(ctx:IMultipleCursorOperationContext) => this._redo(ctx);

		handlersMap[H.ExecuteCommand] =				(ctx:IMultipleCursorOperationContext) => this._externalExecuteCommand(ctx);
		handlersMap[H.ExecuteCommands] =			(ctx:IMultipleCursorOperationContext) => this._externalExecuteCommands(ctx);

		var createHandler = (handlerId:string, handlerExec:(ctx:IMultipleCursorOperationContext)=>boolean) => {
			return (e:editorCommon.IDispatcherEvent) => this._onHandler(handlerId, handlerExec, e);
		};

		var handler:string;
		for (handler in handlersMap) {
			if (handlersMap.hasOwnProperty(handler)) {
				this.configuration.handlerDispatcher.setHandler(handler, createHandler(handler, handlersMap[handler]));
			}
		}
	}

	private _invokeForAllSorted(ctx: IMultipleCursorOperationContext, callable: (cursorIndex: number, cursor: OneCursor, ctx: IOneCursorOperationContext) => boolean, pushStackElementBefore: boolean = true, pushStackElementAfter: boolean = true): boolean {
		return this._doInvokeForAll(ctx, true, callable, pushStackElementBefore, pushStackElementAfter);
	}

	private _invokeForAll(ctx: IMultipleCursorOperationContext, callable: (cursorIndex: number, cursor: OneCursor, ctx: IOneCursorOperationContext) => boolean, pushStackElementBefore: boolean = true, pushStackElementAfter: boolean = true): boolean {
		return this._doInvokeForAll(ctx, false, callable, pushStackElementBefore, pushStackElementAfter);
	}

	private _doInvokeForAll(ctx: IMultipleCursorOperationContext, sorted: boolean, callable: (cursorIndex: number, cursor: OneCursor, ctx: IOneCursorOperationContext) => boolean, pushStackElementBefore: boolean = true, pushStackElementAfter: boolean = true): boolean {
		let result = false;
		let cursors = this.cursors.getAll();

		if (sorted) {
			cursors = cursors.sort((a, b) => {
				return Range.compareRangesUsingStarts(a.getSelection(), b.getSelection());
			});
		}

		let context:IOneCursorOperationContext;

		ctx.shouldPushStackElementBefore = pushStackElementBefore;
		ctx.shouldPushStackElementAfter = pushStackElementAfter;

		for (let i = 0; i < cursors.length; i++) {
			context = {
				cursorPositionChangeReason: '',
				shouldReveal: true,
				shouldRevealVerticalInCenter: false,
				shouldRevealHorizontal: true,
				executeCommand: null,
				postOperationRunnable: null,
				shouldPushStackElementBefore: false,
				shouldPushStackElementAfter: false,
				requestScrollDeltaLines: 0
			};

			result = callable(i, cursors[i], context) || result;

			if (i === 0) {
				ctx.cursorPositionChangeReason = context.cursorPositionChangeReason;
				ctx.shouldRevealHorizontal = context.shouldRevealHorizontal;
				ctx.shouldReveal = context.shouldReveal;
				ctx.shouldRevealVerticalInCenter = context.shouldRevealVerticalInCenter;
				ctx.requestScrollDeltaLines = context.requestScrollDeltaLines;
			}

			ctx.shouldPushStackElementBefore = ctx.shouldPushStackElementBefore || context.shouldPushStackElementBefore;
			ctx.shouldPushStackElementAfter = ctx.shouldPushStackElementAfter || context.shouldPushStackElementAfter;

			ctx.executeCommands[i] = context.executeCommand;
			ctx.postOperationRunnables[i] = context.postOperationRunnable;
		}

		return result;
	}

	private _jumpToBracket(ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.jumpToBracket(oneCursor, oneCtx));
	}

	private _moveTo(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveTo(oneCursor, inSelectionMode, ctx.eventData.position, ctx.eventData.viewPosition, ctx.eventSource, oneCtx));
	}

	private _columnSelectToLineNumber: number = 0;
	private _getColumnSelectToLineNumber(): number {
		if (!this._columnSelectToLineNumber) {
			let primaryCursor = this.cursors.getAll()[0];
			let primaryPos = primaryCursor.getViewPosition();
			return primaryPos.lineNumber;
		}
		return this._columnSelectToLineNumber;
	}

	private _columnSelectToVisualColumn: number = 0;
	private _getColumnSelectToVisualColumn(): number {
		if (!this._columnSelectToVisualColumn) {
			let primaryCursor = this.cursors.getAll()[0];
			let primaryPos = primaryCursor.getViewPosition();
			return primaryCursor.getViewVisibleColumnFromColumn(primaryPos.lineNumber, primaryPos.column);
		}
		return this._columnSelectToVisualColumn;
	}

	private _columnSelectMouse(ctx: IMultipleCursorOperationContext): boolean {
		let cursors = this.cursors.getAll();
		let result = OneCursorOp.columnSelectMouse(cursors[0], ctx.eventData.position, ctx.eventData.viewPosition,  ctx.eventData.mouseColumn);

		ctx.shouldRevealTarget = (result.reversed ? RevealTarget.TopMost : RevealTarget.BottomMost);
		ctx.shouldReveal = true;
		ctx.setColumnSelectToLineNumber = result.toLineNumber;
		ctx.setColumnSelectToVisualColumn = result.toVisualColumn;

		this.cursors.setSelections(result.selections, result.viewSelections);
		return true;
	}

	private _columnSelectOp(ctx: IMultipleCursorOperationContext, op:(cursor:OneCursor, toViewLineNumber:number, toViewVisualColumn: number) => IColumnSelectResult): boolean {
		let primary = this.cursors.getAll()[0];
		let result = op(primary, this._getColumnSelectToLineNumber(), this._getColumnSelectToVisualColumn());

		ctx.shouldRevealTarget = (result.reversed ? RevealTarget.TopMost : RevealTarget.BottomMost);
		ctx.shouldReveal = true;
		ctx.setColumnSelectToLineNumber = result.toLineNumber;
		ctx.setColumnSelectToVisualColumn = result.toVisualColumn;

		this.cursors.setSelections(result.selections, result.viewSelections);
		return true;
	}

	private _columnSelectLeft(ctx: IMultipleCursorOperationContext): boolean {
		return this._columnSelectOp(ctx, (cursor, toViewLineNumber, toViewVisualColumn) => OneCursorOp.columnSelectLeft(cursor, toViewLineNumber, toViewVisualColumn));
	}

	private _columnSelectRight(ctx: IMultipleCursorOperationContext): boolean {
		return this._columnSelectOp(ctx, (cursor, toViewLineNumber, toViewVisualColumn) => OneCursorOp.columnSelectRight(cursor, toViewLineNumber, toViewVisualColumn));
	}

	private _columnSelectUp(isPaged:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._columnSelectOp(ctx, (cursor, toViewLineNumber, toViewVisualColumn) => OneCursorOp.columnSelectUp(isPaged, cursor, toViewLineNumber, toViewVisualColumn));
	}

	private _columnSelectDown(isPaged:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._columnSelectOp(ctx, (cursor, toViewLineNumber, toViewVisualColumn) => OneCursorOp.columnSelectDown(isPaged, cursor, toViewLineNumber, toViewVisualColumn));
	}

	private _createCursor(ctx: IMultipleCursorOperationContext): boolean {
		if (this.configuration.editor.readOnly || this.model.hasEditableRange()) {
			return false;
		}

		this.cursors.addSecondaryCursor({
			selectionStartLineNumber: 1,
			selectionStartColumn: 1,
			positionLineNumber: 1,
			positionColumn: 1
		});

		// Manually move to get events
		var lastAddedCursor = this.cursors.getLastAddedCursor();
		this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			if (oneCursor === lastAddedCursor) {
				if (ctx.eventData.wholeLine) {
					return OneCursorOp.line(oneCursor, false, ctx.eventData.position, ctx.eventData.viewPosition, oneCtx);
				} else {
					return OneCursorOp.moveTo(oneCursor, false, ctx.eventData.position, ctx.eventData.viewPosition, ctx.eventSource, oneCtx);
				}
			}
			return false;
		});

		ctx.shouldReveal = false;
		ctx.shouldRevealHorizontal = false;

		return true;
	}

	private _lastCursorMoveTo(ctx: IMultipleCursorOperationContext): boolean {
		if (this.configuration.editor.readOnly || this.model.hasEditableRange()) {
			return false;
		}

		var lastAddedCursor = this.cursors.getLastAddedCursor();
		this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			if (oneCursor === lastAddedCursor) {
				return OneCursorOp.moveTo(oneCursor,true, ctx.eventData.position, ctx.eventData.viewPosition, ctx.eventSource, oneCtx);
			}
			return false;
		});

		ctx.shouldReveal = false;
		ctx.shouldRevealHorizontal = false;

		return true;
	}

	private _addCursorUp(ctx: IMultipleCursorOperationContext): boolean {
		if (this.configuration.editor.readOnly) {
			return false;
		}

		var originalCnt = this.cursors.getSelections().length;
		this.cursors.duplicateCursors();
		ctx.shouldRevealTarget = RevealTarget.TopMost;

		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			if (cursorIndex >= originalCnt) {
				return OneCursorOp.translateUp(oneCursor, oneCtx);
			}
			return false;
		});
	}

	private _addCursorDown(ctx: IMultipleCursorOperationContext): boolean {
		if (this.configuration.editor.readOnly) {
			return false;
		}

		var originalCnt = this.cursors.getSelections().length;
		this.cursors.duplicateCursors();
		ctx.shouldRevealTarget = RevealTarget.BottomMost;

		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			if (cursorIndex >= originalCnt) {
				return OneCursorOp.translateDown(oneCursor, oneCtx);
			}
			return false;
		});
	}

	private _moveLeft(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveLeft(oneCursor, inSelectionMode, oneCtx));
	}

	private _moveWordLeft(inSelectionMode:boolean, wordNavigationType:WordNavigationType, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveWordLeft(oneCursor, inSelectionMode, wordNavigationType, oneCtx));
	}

	private _moveRight(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveRight(oneCursor, inSelectionMode, oneCtx));
	}

	private _moveWordRight(inSelectionMode:boolean, wordNavigationType:WordNavigationType, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveWordRight(oneCursor, inSelectionMode, wordNavigationType, oneCtx));
	}

	private _moveDown(inSelectionMode:boolean, isPaged:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveDown(oneCursor, inSelectionMode, isPaged, oneCtx));
	}

	private _moveUp(inSelectionMode:boolean, isPaged:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveUp(oneCursor, inSelectionMode, isPaged, oneCtx));
	}

	private _moveToBeginningOfLine(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveToBeginningOfLine(oneCursor, inSelectionMode, oneCtx));
	}

	private _moveToEndOfLine(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveToEndOfLine(oneCursor, inSelectionMode, oneCtx));
	}

	private _moveToBeginningOfBuffer(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveToBeginningOfBuffer(oneCursor, inSelectionMode, oneCtx));
	}

	private _moveToEndOfBuffer(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.moveToEndOfBuffer(oneCursor, inSelectionMode, oneCtx));
	}

	private _selectAll(ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.selectAll(oneCursor, oneCtx));
	}

	private _line(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.line(oneCursor, inSelectionMode, ctx.eventData.position, ctx.eventData.viewPosition, oneCtx));
	}

	private _lastCursorLine(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		if (this.configuration.editor.readOnly || this.model.hasEditableRange()) {
			return false;
		}

		var lastAddedCursor = this.cursors.getLastAddedCursor();
		this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			if (oneCursor === lastAddedCursor) {
				return OneCursorOp.line(oneCursor, inSelectionMode, ctx.eventData.position, ctx.eventData.viewPosition, oneCtx);
			}
			return false;
		});

		ctx.shouldReveal = false;
		ctx.shouldRevealHorizontal = false;

		return true;
	}

	private _expandLineSelection(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.expandLineSelection(oneCursor, oneCtx));
	}

	private _lineInsertBefore(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.lineInsertBefore(oneCursor, oneCtx));
	}

	private _lineInsertAfter(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.lineInsertAfter(oneCursor, oneCtx));
	}

	private _lineBreakInsert(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.lineBreakInsert(oneCursor, oneCtx));
	}

	private _word(inSelectionMode:boolean, ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.word(oneCursor, inSelectionMode, ctx.eventData.position, oneCtx));
	}

	private _lastCursorWord(ctx: IMultipleCursorOperationContext): boolean {
		if (this.configuration.editor.readOnly || this.model.hasEditableRange()) {
			return false;
		}

		var lastAddedCursor = this.cursors.getLastAddedCursor();
		this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			if (oneCursor === lastAddedCursor) {
				return OneCursorOp.word(oneCursor, true, ctx.eventData.position, oneCtx);
			}
			return false;
		});

		ctx.shouldReveal = false;
		ctx.shouldRevealHorizontal = false;

		return true;
	}

	private _removeSecondaryCursors(ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return true;
	}

	private _cancelSelection(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.cancelSelection(oneCursor, oneCtx));
	}

	private _type(ctx: IMultipleCursorOperationContext): boolean {
		var text = ctx.eventData.text;

		if (ctx.eventSource === 'keyboard') {
			// If this event is coming straight from the keyboard, look for electric characters and enter

			var i:number, len:number, chr:string;
			for (i = 0, len = text.length; i < len; i++) {
				chr = text.charAt(i);

				this.charactersTyped += chr;

				// Here we must interpret each typed character individually, that's why we create a new context
				ctx.hasExecutedCommands = this._createAndInterpretHandlerCtx(ctx.eventSource, ctx.eventData, (charHandlerCtx:IMultipleCursorOperationContext) => {

					this._invokeForAll(charHandlerCtx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.type(oneCursor, chr, oneCtx), false, false);

					// The last typed character gets to win
					ctx.cursorPositionChangeReason = charHandlerCtx.cursorPositionChangeReason;
					ctx.shouldReveal = charHandlerCtx.shouldReveal;
					ctx.shouldRevealVerticalInCenter = charHandlerCtx.shouldRevealVerticalInCenter;
					ctx.shouldRevealHorizontal = charHandlerCtx.shouldRevealHorizontal;
				}) || ctx.hasExecutedCommands;

			}
		} else {
			this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.actualType(oneCursor, text, false, oneCtx));
		}

		return true;
	}

	private _replacePreviousChar(ctx: IMultipleCursorOperationContext): boolean {
		let text = ctx.eventData.text;
		let replaceCharCnt = ctx.eventData.replaceCharCnt;
		return this._invokeForAll(ctx,(cursorIndex, oneCursor, oneCtx) => OneCursorOp.replacePreviousChar(oneCursor, text, replaceCharCnt, oneCtx));

	}

	private _tab(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.tab(oneCursor, oneCtx), false, false);
	}

	private _indent(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.indent(oneCursor, oneCtx));
	}

	private _outdent(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.outdent(oneCursor, oneCtx));
	}

	private _paste(ctx: IMultipleCursorOperationContext): boolean {
		var distributedPaste = this._distributePasteToCursors(ctx);

		if (distributedPaste) {
			return this._invokeForAllSorted(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.paste(oneCursor, distributedPaste[cursorIndex], false, oneCtx));
		} else {
			return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.paste(oneCursor, ctx.eventData.text, ctx.eventData.pasteOnNewLine, oneCtx));
		}
	}

	private _scrollUp(isPaged: boolean, ctx: IMultipleCursorOperationContext): boolean {
		ctx.requestScrollDeltaLines = isPaged ? -this.configuration.editor.pageSize : -1;
		return true;
	}

	private _scrollDown(isPaged: boolean, ctx: IMultipleCursorOperationContext): boolean {
		ctx.requestScrollDeltaLines = isPaged ? this.configuration.editor.pageSize : 1;
		return true;
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

	private _deleteLeft(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.deleteLeft(oneCursor, oneCtx), false, false);
	}

	private _deleteWordLeft(whitespaceHeuristics:boolean, wordNavigationType:WordNavigationType, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.deleteWordLeft(oneCursor, whitespaceHeuristics, wordNavigationType, oneCtx), false, false);
	}

	private _deleteRight(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.deleteRight(oneCursor, oneCtx), false, false);
	}

	private _deleteWordRight(whitespaceHeuristics:boolean, wordNavigationType:WordNavigationType, ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.deleteWordRight(oneCursor, whitespaceHeuristics, wordNavigationType, oneCtx), false, false);
	}

	private _deleteAllLeft(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.deleteAllLeft(oneCursor, oneCtx), false, false);
	}

	private _deleteAllRight(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.deleteAllRight(oneCursor, oneCtx), false, false);
	}

	private _cut(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => OneCursorOp.cut(oneCursor, this.enableEmptySelectionClipboard, oneCtx));
	}

	private _undo(ctx: IMultipleCursorOperationContext): boolean {
		ctx.cursorPositionChangeReason = 'undo';
		ctx.hasExecutedCommands = true;
		this._interpretCommandResult(this.model.undo());
		return true;
	}

	private _cursorUndo(ctx: IMultipleCursorOperationContext): boolean {
		if (this.cursorUndoStack.length === 0) {
			return false;
		}
		ctx.cursorPositionChangeReason = 'undo';
		ctx.isCursorUndo = true;
		this.cursors.restoreState(this.cursorUndoStack.pop());
		return true;
	}

	private _redo(ctx: IMultipleCursorOperationContext): boolean {
		ctx.cursorPositionChangeReason = 'redo';
		ctx.hasExecutedCommands = true;
		this._interpretCommandResult(this.model.redo());
		return true;
	}

	private _externalExecuteCommand(ctx: IMultipleCursorOperationContext): boolean {
		this.cursors.killSecondaryCursors();
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			oneCtx.shouldPushStackElementBefore = true;
			oneCtx.shouldPushStackElementAfter = true;
			oneCtx.executeCommand = ctx.eventData;
			return false;
		});
	}

	private _externalExecuteCommands(ctx: IMultipleCursorOperationContext): boolean {
		return this._invokeForAll(ctx, (cursorIndex: number, oneCursor: OneCursor, oneCtx: IOneCursorOperationContext) => {
			oneCtx.shouldPushStackElementBefore = true;
			oneCtx.shouldPushStackElementAfter = true;
			oneCtx.executeCommand = ctx.eventData[cursorIndex];
			return false;
		});
	}
}
