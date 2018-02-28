/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as strings from 'vs/base/common/strings';
import { onUnexpectedError } from 'vs/base/common/errors';
import { CursorCollection } from 'vs/editor/common/controller/cursorCollection';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection, SelectionDirection, ISelection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { CursorColumns, CursorConfiguration, EditOperationResult, CursorContext, CursorState, RevealTarget, IColumnSelectData, ICursors, EditOperationType } from 'vs/editor/common/controller/cursorCommon';
import { DeleteOperations } from 'vs/editor/common/controller/cursorDeleteOperations';
import { TypeOperations } from 'vs/editor/common/controller/cursorTypeOperations';
import { RawContentChangedType } from 'vs/editor/common/model/textModelEvents';
import { CursorChangeReason } from 'vs/editor/common/controller/cursorEvents';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import Event, { Emitter } from 'vs/base/common/event';
import { ITextModel, IIdentifiedSingleEditOperation, TrackedRangeStickiness } from 'vs/editor/common/model';

function containsLineMappingChanged(events: viewEvents.ViewEvent[]): boolean {
	for (let i = 0, len = events.length; i < len; i++) {
		if (events[i].type === viewEvents.ViewEventType.ViewLineMappingChanged) {
			return true;
		}
	}
	return false;
}

export class CursorStateChangedEvent {
	/**
	 * The new selections.
	 * The primary selection is always at index 0.
	 */
	readonly selections: Selection[];
	/**
	 * Source of the call that caused the event.
	 */
	readonly source: string;
	/**
	 * Reason.
	 */
	readonly reason: CursorChangeReason;

	constructor(selections: Selection[], source: string, reason: CursorChangeReason) {
		this.selections = selections;
		this.source = source;
		this.reason = reason;
	}
}

/**
 * A snapshot of the cursor and the model state
 */
export class CursorModelState {

	public readonly modelVersionId: number;
	public readonly cursorState: CursorState[];

	constructor(model: ITextModel, cursor: Cursor) {
		this.modelVersionId = model.getVersionId();
		this.cursorState = cursor.getAll();
	}

	public equals(other: CursorModelState): boolean {
		if (!other) {
			return false;
		}
		if (this.modelVersionId !== other.modelVersionId) {
			return false;
		}
		if (this.cursorState.length !== other.cursorState.length) {
			return false;
		}
		for (let i = 0, len = this.cursorState.length; i < len; i++) {
			if (!this.cursorState[i].equals(other.cursorState[i])) {
				return false;
			}
		}
		return true;
	}
}

export class Cursor extends viewEvents.ViewEventEmitter implements ICursors {

	private readonly _onDidChange: Emitter<CursorStateChangedEvent> = this._register(new Emitter<CursorStateChangedEvent>());
	public readonly onDidChange: Event<CursorStateChangedEvent> = this._onDidChange.event;

	private readonly _configuration: editorCommon.IConfiguration;
	private readonly _model: ITextModel;
	private _knownModelVersionId: number;
	private readonly _viewModel: IViewModel;
	public context: CursorContext;
	private _cursors: CursorCollection;

	private _isHandling: boolean;
	private _isDoingComposition: boolean;
	private _columnSelectData: IColumnSelectData;
	private _prevEditOperationType: EditOperationType;

	constructor(configuration: editorCommon.IConfiguration, model: ITextModel, viewModel: IViewModel) {
		super();
		this._configuration = configuration;
		this._model = model;
		this._knownModelVersionId = this._model.getVersionId();
		this._viewModel = viewModel;
		this.context = new CursorContext(this._configuration, this._model, this._viewModel);
		this._cursors = new CursorCollection(this.context);

		this._isHandling = false;
		this._isDoingComposition = false;
		this._columnSelectData = null;
		this._prevEditOperationType = EditOperationType.Other;

		this._register(this._model.onDidChangeRawContent((e) => {
			this._knownModelVersionId = e.versionId;
			if (this._isHandling) {
				return;
			}

			let hadFlushEvent = e.containsEvent(RawContentChangedType.Flush);
			this._onModelContentChanged(hadFlushEvent);
		}));

		this._register(viewModel.addEventListener((events: viewEvents.ViewEvent[]) => {
			if (!containsLineMappingChanged(events)) {
				return;
			}

			if (this._knownModelVersionId !== this._model.getVersionId()) {
				// There are model change events that I didn't yet receive.
				//
				// This can happen when editing the model, and the view model receives the change events first,
				// and the view model emits line mapping changed events, all before the cursor gets a chance to
				// recover from markers.
				//
				// The model change listener above will be called soon and we'll ensure a valid cursor state there.
				return;
			}
			// Ensure valid state
			this.setStates('viewModel', CursorChangeReason.NotSet, this.getAll());
		}));

		const updateCursorContext = () => {
			this.context = new CursorContext(this._configuration, this._model, this._viewModel);
			this._cursors.updateContext(this.context);
		};
		this._register(this._model.onDidChangeLanguage((e) => {
			updateCursorContext();
		}));
		this._register(this._model.onDidChangeLanguageConfiguration(() => {
			updateCursorContext();
		}));
		this._register(this._model.onDidChangeOptions(() => {
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

	// ------ some getters/setters

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
		const oldState = new CursorModelState(this._model, this);

		this._cursors.setStates(states);
		this._cursors.normalize();
		this._columnSelectData = null;

		this._emitStateChangedIfNecessary(source, reason, oldState);
	}

	public setColumnSelectData(columnSelectData: IColumnSelectData): void {
		this._columnSelectData = columnSelectData;
	}

	public reveal(horizontal: boolean, target: RevealTarget, scrollType: editorCommon.ScrollType): void {
		this._revealRange(target, viewEvents.VerticalRevealType.Simple, horizontal, scrollType);
	}

	public revealRange(revealHorizontal: boolean, viewRange: Range, verticalType: viewEvents.VerticalRevealType, scrollType: editorCommon.ScrollType) {
		this.emitCursorRevealRange(viewRange, verticalType, revealHorizontal, scrollType);
	}

	public scrollTo(desiredScrollTop: number): void {
		this._viewModel.viewLayout.setScrollPositionSmooth({
			scrollTop: desiredScrollTop
		});
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
		this.reveal(true, RevealTarget.Primary, editorCommon.ScrollType.Immediate);
	}

	private _onModelContentChanged(hadFlushEvent: boolean): void {

		this._prevEditOperationType = EditOperationType.Other;

		if (hadFlushEvent) {
			// a model.setValue() was called
			this._cursors.dispose();
			this._cursors = new CursorCollection(this.context);

			this._emitStateChangedIfNecessary('model', CursorChangeReason.ContentFlush, null);
		} else {
			const selectionsFromMarkers = this._cursors.readSelectionFromMarkers();
			this.setStates('modelChange', CursorChangeReason.RecoverFromMarkers, CursorState.fromModelSelections(selectionsFromMarkers));
		}
	}

	public getSelection(): Selection {
		return this._cursors.getPrimaryCursor().modelState.selection;
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

	public getSelections(): Selection[] {
		return this._cursors.getSelections();
	}

	public getViewSelections(): Selection[] {
		return this._cursors.getViewSelections();
	}

	public getPosition(): Position {
		return this._cursors.getPrimaryCursor().modelState.position;
	}

	public setSelections(source: string, selections: ISelection[]): void {
		this.setStates(source, CursorChangeReason.NotSet, CursorState.fromModelSelections(selections));
	}

	public getPrevEditOperationType(): EditOperationType {
		return this._prevEditOperationType;
	}

	public setPrevEditOperationType(type: EditOperationType): void {
		this._prevEditOperationType = type;
	}

	// ------ auxiliary handling logic

	private _executeEditOperation(opResult: EditOperationResult): void {

		if (!opResult) {
			// Nothing to execute
			return;
		}

		if (this._configuration.editor.readOnly) {
			// Cannot execute when read only
			return;
		}

		if (opResult.shouldPushStackElementBefore) {
			this._model.pushStackElement();
		}

		const result = CommandExecutor.executeCommands(this._model, this._cursors.getSelections(), opResult.commands);
		if (result) {
			// The commands were applied correctly
			this._interpretCommandResult(result);

			this._prevEditOperationType = opResult.type;
		}

		if (opResult.shouldPushStackElementAfter) {
			this._model.pushStackElement();
		}
	}

	private _interpretCommandResult(cursorState: Selection[]): void {
		if (!cursorState || cursorState.length === 0) {
			return;
		}

		this._columnSelectData = null;
		this._cursors.setSelections(cursorState);
		this._cursors.normalize();
	}

	// -----------------------------------------------------------------------------------------------------------
	// ----- emitting events

	private _emitStateChangedIfNecessary(source: string, reason: CursorChangeReason, oldState: CursorModelState): boolean {
		const newState = new CursorModelState(this._model, this);
		if (newState.equals(oldState)) {
			return false;
		}

		const selections = this._cursors.getSelections();
		const viewSelections = this._cursors.getViewSelections();

		// Let the view get the event first.
		try {
			const eventsCollector = this._beginEmit();
			eventsCollector.emit(new viewEvents.ViewCursorStateChangedEvent(viewSelections));
		} finally {
			this._endEmit();
		}

		// Only after the view has been notified, let the rest of the world know...
		if (!oldState
			|| oldState.cursorState.length !== newState.cursorState.length
			|| newState.cursorState.some((newCursorState, i) => !newCursorState.modelState.equals(oldState.cursorState[i].modelState))
		) {
			this._onDidChange.fire(new CursorStateChangedEvent(selections, source || 'keyboard', reason));
		}

		return true;
	}

	private _revealRange(revealTarget: RevealTarget, verticalType: viewEvents.VerticalRevealType, revealHorizontal: boolean, scrollType: editorCommon.ScrollType): void {
		const viewPositions = this._cursors.getViewPositions();

		let viewPosition = viewPositions[0];

		if (revealTarget === RevealTarget.TopMost) {
			for (let i = 1; i < viewPositions.length; i++) {
				if (viewPositions[i].isBefore(viewPosition)) {
					viewPosition = viewPositions[i];
				}
			}
		} else if (revealTarget === RevealTarget.BottomMost) {
			for (let i = 1; i < viewPositions.length; i++) {
				if (viewPosition.isBeforeOrEqual(viewPositions[i])) {
					viewPosition = viewPositions[i];
				}
			}
		} else {
			if (viewPositions.length > 1) {
				// no revealing!
				return;
			}
		}

		const viewRange = new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column);
		this.emitCursorRevealRange(viewRange, verticalType, revealHorizontal, scrollType);
	}

	public emitCursorRevealRange(viewRange: Range, verticalType: viewEvents.VerticalRevealType, revealHorizontal: boolean, scrollType: editorCommon.ScrollType) {
		try {
			const eventsCollector = this._beginEmit();
			eventsCollector.emit(new viewEvents.ViewRevealRangeRequestEvent(viewRange, verticalType, revealHorizontal, scrollType));
		} finally {
			this._endEmit();
		}
	}

	// -----------------------------------------------------------------------------------------------------------
	// ----- handlers beyond this point

	public trigger(source: string, handlerId: string, payload: any): void {
		const H = editorCommon.Handler;

		if (handlerId === H.CompositionStart) {
			this._isDoingComposition = true;
			return;
		}

		if (handlerId === H.CompositionEnd) {
			this._isDoingComposition = false;
			return;
		}

		const oldState = new CursorModelState(this._model, this);
		let cursorChangeReason = CursorChangeReason.NotSet;

		// ensure valid state on all cursors
		this._cursors.ensureValidState();

		this._isHandling = true;

		try {
			switch (handlerId) {
				case H.Type:
					this._type(source, <string>payload.text);
					break;

				case H.ReplacePreviousChar:
					this._replacePreviousChar(<string>payload.text, <number>payload.replaceCharCnt);
					break;

				case H.Paste:
					cursorChangeReason = CursorChangeReason.Paste;
					this._paste(<string>payload.text, <boolean>payload.pasteOnNewLine, <string[]>payload.multicursorText);
					break;

				case H.Cut:
					this._cut();
					break;

				case H.Undo:
					cursorChangeReason = CursorChangeReason.Undo;
					this._interpretCommandResult(this._model.undo());
					break;

				case H.Redo:
					cursorChangeReason = CursorChangeReason.Redo;
					this._interpretCommandResult(this._model.redo());
					break;

				case H.ExecuteCommand:
					this._externalExecuteCommand(<editorCommon.ICommand>payload);
					break;

				case H.ExecuteCommands:
					this._externalExecuteCommands(<editorCommon.ICommand[]>payload);
					break;
			}
		} catch (err) {
			onUnexpectedError(err);
		}

		this._isHandling = false;

		if (this._emitStateChangedIfNecessary(source, cursorChangeReason, oldState)) {
			this._revealRange(RevealTarget.Primary, viewEvents.VerticalRevealType.Simple, true, editorCommon.ScrollType.Smooth);
		}
	}

	private _type(source: string, text: string): void {
		if (!this._isDoingComposition && source === 'keyboard') {
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
				this._executeEditOperation(TypeOperations.typeWithInterceptors(this._prevEditOperationType, this.context.config, this.context.model, this.getSelections(), chr));
			}

		} else {
			this._executeEditOperation(TypeOperations.typeWithoutInterceptors(this._prevEditOperationType, this.context.config, this.context.model, this.getSelections(), text));
		}
	}

	private _replacePreviousChar(text: string, replaceCharCnt: number): void {
		this._executeEditOperation(TypeOperations.replacePreviousChar(this._prevEditOperationType, this.context.config, this.context.model, this.getSelections(), text, replaceCharCnt));
	}

	private _paste(text: string, pasteOnNewLine: boolean, multicursorText: string[]): void {
		this._executeEditOperation(TypeOperations.paste(this.context.config, this.context.model, this.getSelections(), text, pasteOnNewLine, multicursorText));
	}

	private _cut(): void {
		this._executeEditOperation(DeleteOperations.cut(this.context.config, this.context.model, this.getSelections()));
	}

	private _externalExecuteCommand(command: editorCommon.ICommand): void {
		this._cursors.killSecondaryCursors();

		this._executeEditOperation(new EditOperationResult(EditOperationType.Other, [command], {
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false
		}));
	}

	private _externalExecuteCommands(commands: editorCommon.ICommand[]): void {
		this._executeEditOperation(new EditOperationResult(EditOperationType.Other, commands, {
			shouldPushStackElementBefore: false,
			shouldPushStackElementAfter: false
		}));
	}
}

interface IExecContext {
	readonly model: ITextModel;
	readonly selectionsBefore: Selection[];
	readonly trackedRanges: string[];
	readonly trackedRangesDirection: SelectionDirection[];
}

interface ICommandData {
	operations: IIdentifiedSingleEditOperation[];
	hadTrackedEditOperation: boolean;
}

interface ICommandsData {
	operations: IIdentifiedSingleEditOperation[];
	hadTrackedEditOperation: boolean;
}

class CommandExecutor {

	public static executeCommands(model: ITextModel, selectionsBefore: Selection[], commands: editorCommon.ICommand[]): Selection[] {

		const ctx: IExecContext = {
			model: model,
			selectionsBefore: selectionsBefore,
			trackedRanges: [],
			trackedRangesDirection: []
		};

		const result = this._innerExecuteCommands(ctx, commands);

		for (let i = 0, len = ctx.trackedRanges.length; i < len; i++) {
			ctx.model._setTrackedRange(ctx.trackedRanges[i], null, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges);
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

		const loserCursorsMap = this._getLoserCursorMap(rawOperations);
		if (loserCursorsMap.hasOwnProperty('0')) {
			// These commands are very messed up
			console.warn('Ignoring commands');
			return null;
		}

		// Remove operations belonging to losing cursors
		let filteredOperations: IIdentifiedSingleEditOperation[] = [];
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
		const selectionsAfter = ctx.model.pushEditOperations(ctx.selectionsBefore, filteredOperations, (inverseEditOperations: IIdentifiedSingleEditOperation[]): Selection[] => {
			let groupedInverseEditOperations: IIdentifiedSingleEditOperation[][] = [];
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
			const minorBasedSorter = (a: IIdentifiedSingleEditOperation, b: IIdentifiedSingleEditOperation) => {
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
							const range = ctx.model._getTrackedRange(ctx.trackedRanges[idx]);
							if (ctx.trackedRangesDirection[idx] === SelectionDirection.LTR) {
								return new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
							}
							return new Selection(range.endLineNumber, range.endColumn, range.startLineNumber, range.startColumn);
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
		let operations: IIdentifiedSingleEditOperation[] = [];
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
		let operations: IIdentifiedSingleEditOperation[] = [];
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
			let stickiness: TrackedRangeStickiness;
			if (selection.isEmpty()) {
				if (typeof trackPreviousOnEmpty === 'boolean') {
					if (trackPreviousOnEmpty) {
						stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
					} else {
						stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingAfter;
					}
				} else {
					// Try to lock it with surrounding text
					const maxLineColumn = ctx.model.getLineMaxColumn(selection.startLineNumber);
					if (selection.startColumn === maxLineColumn) {
						stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
					} else {
						stickiness = TrackedRangeStickiness.GrowsOnlyWhenTypingAfter;
					}
				}
			} else {
				stickiness = TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
			}

			const l = ctx.trackedRanges.length;
			const id = ctx.model._setTrackedRange(null, selection, stickiness);
			ctx.trackedRanges[l] = id;
			ctx.trackedRangesDirection[l] = selection.getDirection();
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

	private static _getLoserCursorMap(operations: IIdentifiedSingleEditOperation[]): { [index: string]: boolean; } {
		// This is destructive on the array
		operations = operations.slice(0);

		// Sort operations with last one first
		operations.sort((a: IIdentifiedSingleEditOperation, b: IIdentifiedSingleEditOperation): number => {
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
