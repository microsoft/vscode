/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../base/common/errors.js';
import * as strings from '../../../base/common/strings.js';
import { CursorCollection } from './cursorCollection.js';
import { CursorConfiguration, CursorState, EditOperationResult, EditOperationType, IColumnSelectData, PartialCursorState, ICursorSimpleModel } from '../cursorCommon.js';
import { CursorContext } from './cursorContext.js';
import { DeleteOperations } from './cursorDeleteOperations.js';
import { CursorChangeReason } from '../cursorEvents.js';
import { CompositionOutcome, TypeOperations } from './cursorTypeOperations.js';
import { BaseTypeWithAutoClosingCommand } from './cursorTypeEditOperations.js';
import { Position } from '../core/position.js';
import { Range, IRange } from '../core/range.js';
import { ISelection, Selection, SelectionDirection } from '../core/selection.js';
import * as editorCommon from '../editorCommon.js';
import { ITextModel, TrackedRangeStickiness, IModelDeltaDecoration, ICursorStateComputer, IIdentifiedSingleEditOperation, IValidEditOperation } from '../model.js';
import { RawContentChangedType, ModelInjectedTextChangedEvent, InternalModelContentChangeEvent } from '../textModelEvents.js';
import { VerticalRevealType, ViewCursorStateChangedEvent, ViewRevealRangeRequestEvent } from '../viewEvents.js';
import { dispose, Disposable } from '../../../base/common/lifecycle.js';
import { CursorStateChangedEvent, ViewModelEventsCollector } from '../viewModelEventDispatcher.js';
import { TextModelEditSource, EditSources } from '../textModelEditSource.js';
import { ICoordinatesConverter } from '../coordinatesConverter.js';

export class CursorsController extends Disposable {

	private readonly _model: ITextModel;
	private _knownModelVersionId: number;
	private readonly _viewModel: ICursorSimpleModel;
	private readonly _coordinatesConverter: ICoordinatesConverter;
	public context: CursorContext;
	private _cursors: CursorCollection;

	private _hasFocus: boolean;
	private _isHandling: boolean;
	private _compositionState: CompositionState | null;
	private _columnSelectData: IColumnSelectData | null;
	private _autoClosedActions: AutoClosedAction[];
	private _prevEditOperationType: EditOperationType;

	constructor(model: ITextModel, viewModel: ICursorSimpleModel, coordinatesConverter: ICoordinatesConverter, cursorConfig: CursorConfiguration) {
		super();
		this._model = model;
		this._knownModelVersionId = this._model.getVersionId();
		this._viewModel = viewModel;
		this._coordinatesConverter = coordinatesConverter;
		this.context = new CursorContext(this._model, this._viewModel, this._coordinatesConverter, cursorConfig);
		this._cursors = new CursorCollection(this.context);

		this._hasFocus = false;
		this._isHandling = false;
		this._compositionState = null;
		this._columnSelectData = null;
		this._autoClosedActions = [];
		this._prevEditOperationType = EditOperationType.Other;
	}

	public override dispose(): void {
		this._cursors.dispose();
		this._autoClosedActions = dispose(this._autoClosedActions);
		super.dispose();
	}

	public updateConfiguration(cursorConfig: CursorConfiguration): void {
		this.context = new CursorContext(this._model, this._viewModel, this._coordinatesConverter, cursorConfig);
		this._cursors.updateContext(this.context);
	}

	public onLineMappingChanged(eventsCollector: ViewModelEventsCollector): void {
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
		this.setStates(eventsCollector, 'viewModel', CursorChangeReason.NotSet, this.getCursorStates());
	}

	public setHasFocus(hasFocus: boolean): void {
		this._hasFocus = hasFocus;
	}

	private _validateAutoClosedActions(): void {
		if (this._autoClosedActions.length > 0) {
			const selections: Range[] = this._cursors.getSelections();
			for (let i = 0; i < this._autoClosedActions.length; i++) {
				const autoClosedAction = this._autoClosedActions[i];
				if (!autoClosedAction.isValid(selections)) {
					autoClosedAction.dispose();
					this._autoClosedActions.splice(i, 1);
					i--;
				}
			}
		}
	}

	// ------ some getters/setters

	public getPrimaryCursorState(): CursorState {
		return this._cursors.getPrimaryCursor();
	}

	public getLastAddedCursorIndex(): number {
		return this._cursors.getLastAddedCursorIndex();
	}

	public getCursorStates(): CursorState[] {
		return this._cursors.getAll();
	}

	public setStates(eventsCollector: ViewModelEventsCollector, source: string | null | undefined, reason: CursorChangeReason, states: PartialCursorState[] | null): boolean {
		let reachedMaxCursorCount = false;
		const multiCursorLimit = this.context.cursorConfig.multiCursorLimit;
		if (states !== null && states.length > multiCursorLimit) {
			states = states.slice(0, multiCursorLimit);
			reachedMaxCursorCount = true;
		}

		const oldState = CursorModelState.from(this._model, this);

		this._cursors.setStates(states);
		this._cursors.normalize();
		this._columnSelectData = null;

		this._validateAutoClosedActions();

		return this._emitStateChangedIfNecessary(eventsCollector, source, reason, oldState, reachedMaxCursorCount);
	}

	public setCursorColumnSelectData(columnSelectData: IColumnSelectData): void {
		this._columnSelectData = columnSelectData;
	}

	public revealAll(eventsCollector: ViewModelEventsCollector, source: string | null | undefined, minimalReveal: boolean, verticalType: VerticalRevealType, revealHorizontal: boolean, scrollType: editorCommon.ScrollType): void {
		const viewPositions = this._cursors.getViewPositions();

		let revealViewRange: Range | null = null;
		let revealViewSelections: Selection[] | null = null;
		if (viewPositions.length > 1) {
			revealViewSelections = this._cursors.getViewSelections();
		} else {
			revealViewRange = Range.fromPositions(viewPositions[0], viewPositions[0]);
		}

		eventsCollector.emitViewEvent(new ViewRevealRangeRequestEvent(source, minimalReveal, revealViewRange, revealViewSelections, verticalType, revealHorizontal, scrollType));
	}

	public revealPrimary(eventsCollector: ViewModelEventsCollector, source: string | null | undefined, minimalReveal: boolean, verticalType: VerticalRevealType, revealHorizontal: boolean, scrollType: editorCommon.ScrollType): void {
		const primaryCursor = this._cursors.getPrimaryCursor();
		const revealViewSelections = [primaryCursor.viewState.selection];
		eventsCollector.emitViewEvent(new ViewRevealRangeRequestEvent(source, minimalReveal, null, revealViewSelections, verticalType, revealHorizontal, scrollType));
	}

	public saveState(): editorCommon.ICursorState[] {

		const result: editorCommon.ICursorState[] = [];

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

	public restoreState(eventsCollector: ViewModelEventsCollector, states: editorCommon.ICursorState[]): void {

		const desiredSelections: ISelection[] = [];

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

		this.setStates(eventsCollector, 'restoreState', CursorChangeReason.NotSet, CursorState.fromModelSelections(desiredSelections));
		this.revealAll(eventsCollector, 'restoreState', false, VerticalRevealType.Simple, true, editorCommon.ScrollType.Immediate);
	}

	public onModelContentChanged(eventsCollector: ViewModelEventsCollector, event: InternalModelContentChangeEvent | ModelInjectedTextChangedEvent): void {
		if (event instanceof ModelInjectedTextChangedEvent) {
			// If injected texts change, the view positions of all cursors need to be updated.
			if (this._isHandling) {
				// The view positions will be updated when handling finishes
				return;
			}
			// setStates might remove markers, which could trigger a decoration change.
			// If there are injected text decorations for that line, `onModelContentChanged` is emitted again
			// and an endless recursion happens.
			// _isHandling prevents that.
			this._isHandling = true;
			try {
				this.setStates(eventsCollector, 'modelChange', CursorChangeReason.NotSet, this.getCursorStates());
			} finally {
				this._isHandling = false;
			}
		} else {
			const e = event.rawContentChangedEvent;
			this._knownModelVersionId = e.versionId;
			if (this._isHandling) {
				return;
			}

			const hadFlushEvent = e.containsEvent(RawContentChangedType.Flush);
			this._prevEditOperationType = EditOperationType.Other;

			if (hadFlushEvent) {
				// a model.setValue() was called
				this._cursors.dispose();
				this._cursors = new CursorCollection(this.context);
				this._validateAutoClosedActions();
				this._emitStateChangedIfNecessary(eventsCollector, 'model', CursorChangeReason.ContentFlush, null, false);
			} else {
				if (this._hasFocus && e.resultingSelection && e.resultingSelection.length > 0) {
					const cursorState = CursorState.fromModelSelections(e.resultingSelection);
					if (this.setStates(eventsCollector, 'modelChange', e.isUndoing ? CursorChangeReason.Undo : e.isRedoing ? CursorChangeReason.Redo : CursorChangeReason.RecoverFromMarkers, cursorState)) {
						this.revealAll(eventsCollector, 'modelChange', false, VerticalRevealType.Simple, true, editorCommon.ScrollType.Smooth);
					}
				} else {
					const selectionsFromMarkers = this._cursors.readSelectionFromMarkers();
					this.setStates(eventsCollector, 'modelChange', CursorChangeReason.RecoverFromMarkers, CursorState.fromModelSelections(selectionsFromMarkers));
				}
			}
		}
	}

	public getSelection(): Selection {
		return this._cursors.getPrimaryCursor().modelState.selection;
	}

	public getTopMostViewPosition(): Position {
		return this._cursors.getTopMostViewPosition();
	}

	public getBottomMostViewPosition(): Position {
		return this._cursors.getBottomMostViewPosition();
	}

	public getCursorColumnSelectData(): IColumnSelectData {
		if (this._columnSelectData) {
			return this._columnSelectData;
		}
		const primaryCursor = this._cursors.getPrimaryCursor();
		const viewSelectionStart = primaryCursor.viewState.selectionStart.getStartPosition();
		const viewPosition = primaryCursor.viewState.position;
		return {
			isReal: false,
			fromViewLineNumber: viewSelectionStart.lineNumber,
			fromViewVisualColumn: this.context.cursorConfig.visibleColumnFromColumn(this._viewModel, viewSelectionStart),
			toViewLineNumber: viewPosition.lineNumber,
			toViewVisualColumn: this.context.cursorConfig.visibleColumnFromColumn(this._viewModel, viewPosition),
		};
	}

	public getSelections(): Selection[] {
		return this._cursors.getSelections();
	}

	public getPosition(): Position {
		return this._cursors.getPrimaryCursor().modelState.position;
	}

	public setSelections(eventsCollector: ViewModelEventsCollector, source: string | null | undefined, selections: readonly ISelection[], reason: CursorChangeReason): void {
		this.setStates(eventsCollector, source, reason, CursorState.fromModelSelections(selections));
	}

	public getPrevEditOperationType(): EditOperationType {
		return this._prevEditOperationType;
	}

	public setPrevEditOperationType(type: EditOperationType): void {
		this._prevEditOperationType = type;
	}

	// ------ auxiliary handling logic

	private _pushAutoClosedAction(autoClosedCharactersRanges: Range[], autoClosedEnclosingRanges: Range[]): void {
		const autoClosedCharactersDeltaDecorations: IModelDeltaDecoration[] = [];
		const autoClosedEnclosingDeltaDecorations: IModelDeltaDecoration[] = [];

		for (let i = 0, len = autoClosedCharactersRanges.length; i < len; i++) {
			autoClosedCharactersDeltaDecorations.push({
				range: autoClosedCharactersRanges[i],
				options: {
					description: 'auto-closed-character',
					inlineClassName: 'auto-closed-character',
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
				}
			});
			autoClosedEnclosingDeltaDecorations.push({
				range: autoClosedEnclosingRanges[i],
				options: {
					description: 'auto-closed-enclosing',
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
				}
			});
		}

		const autoClosedCharactersDecorations = this._model.deltaDecorations([], autoClosedCharactersDeltaDecorations);
		const autoClosedEnclosingDecorations = this._model.deltaDecorations([], autoClosedEnclosingDeltaDecorations);
		this._autoClosedActions.push(new AutoClosedAction(this._model, autoClosedCharactersDecorations, autoClosedEnclosingDecorations));
	}

	private _executeEditOperation(opResult: EditOperationResult | null, editReason: TextModelEditSource): void {

		if (!opResult) {
			// Nothing to execute
			return;
		}

		if (opResult.shouldPushStackElementBefore) {
			this._model.pushStackElement();
		}

		const result = CommandExecutor.executeCommands(this._model, this._cursors.getSelections(), opResult.commands, editReason);
		if (result) {
			// The commands were applied correctly
			this._interpretCommandResult(result);

			// Check for auto-closing closed characters
			const autoClosedCharactersRanges: Range[] = [];
			const autoClosedEnclosingRanges: Range[] = [];

			for (let i = 0; i < opResult.commands.length; i++) {
				const command = opResult.commands[i];
				if (command instanceof BaseTypeWithAutoClosingCommand && command.enclosingRange && command.closeCharacterRange) {
					autoClosedCharactersRanges.push(command.closeCharacterRange);
					autoClosedEnclosingRanges.push(command.enclosingRange);
				}
			}

			if (autoClosedCharactersRanges.length > 0) {
				this._pushAutoClosedAction(autoClosedCharactersRanges, autoClosedEnclosingRanges);
			}

			this._prevEditOperationType = opResult.type;
		}

		if (opResult.shouldPushStackElementAfter) {
			this._model.pushStackElement();
		}
	}

	private _interpretCommandResult(cursorState: Selection[] | null): void {
		if (!cursorState || cursorState.length === 0) {
			cursorState = this._cursors.readSelectionFromMarkers();
		}

		this._columnSelectData = null;
		this._cursors.setSelections(cursorState);
		this._cursors.normalize();
	}

	// -----------------------------------------------------------------------------------------------------------
	// ----- emitting events

	private _emitStateChangedIfNecessary(eventsCollector: ViewModelEventsCollector, source: string | null | undefined, reason: CursorChangeReason, oldState: CursorModelState | null, reachedMaxCursorCount: boolean): boolean {
		const newState = CursorModelState.from(this._model, this);
		if (newState.equals(oldState)) {
			return false;
		}

		const selections = this._cursors.getSelections();
		const viewSelections = this._cursors.getViewSelections();

		// Let the view get the event first.
		eventsCollector.emitViewEvent(new ViewCursorStateChangedEvent(viewSelections, selections, reason));

		// Only after the view has been notified, let the rest of the world know...
		if (!oldState
			|| oldState.cursorState.length !== newState.cursorState.length
			|| newState.cursorState.some((newCursorState, i) => !newCursorState.modelState.equals(oldState.cursorState[i].modelState))
		) {
			const oldSelections = oldState ? oldState.cursorState.map(s => s.modelState.selection) : null;
			const oldModelVersionId = oldState ? oldState.modelVersionId : 0;
			eventsCollector.emitOutgoingEvent(new CursorStateChangedEvent(oldSelections, selections, oldModelVersionId, newState.modelVersionId, source || 'keyboard', reason, reachedMaxCursorCount));
		}

		return true;
	}

	// -----------------------------------------------------------------------------------------------------------
	// ----- handlers beyond this point

	private _findAutoClosingPairs(edits: IIdentifiedSingleEditOperation[]): [number, number][] | null {
		if (!edits.length) {
			return null;
		}

		const indices: [number, number][] = [];
		for (let i = 0, len = edits.length; i < len; i++) {
			const edit = edits[i];
			if (!edit.text || edit.text.indexOf('\n') >= 0) {
				return null;
			}

			const m = edit.text.match(/([)\]}>'"`])([^)\]}>'"`]*)$/);
			if (!m) {
				return null;
			}
			const closeChar = m[1];

			const autoClosingPairsCandidates = this.context.cursorConfig.autoClosingPairs.autoClosingPairsCloseSingleChar.get(closeChar);
			if (!autoClosingPairsCandidates || autoClosingPairsCandidates.length !== 1) {
				return null;
			}

			const openChar = autoClosingPairsCandidates[0].open;
			const closeCharIndex = edit.text.length - m[2].length - 1;
			const openCharIndex = edit.text.lastIndexOf(openChar, closeCharIndex - 1);
			if (openCharIndex === -1) {
				return null;
			}

			indices.push([openCharIndex, closeCharIndex]);
		}

		return indices;
	}

	public executeEdits(eventsCollector: ViewModelEventsCollector, source: string | null | undefined, edits: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer, reason: TextModelEditSource): void {
		let autoClosingIndices: [number, number][] | null = null;
		if (source === 'snippet') {
			autoClosingIndices = this._findAutoClosingPairs(edits);
		}

		if (autoClosingIndices) {
			edits[0]._isTracked = true;
		}
		const autoClosedCharactersRanges: Range[] = [];
		const autoClosedEnclosingRanges: Range[] = [];
		const selections = this._model.pushEditOperations(this.getSelections(), edits, (undoEdits) => {
			if (autoClosingIndices) {
				for (let i = 0, len = autoClosingIndices.length; i < len; i++) {
					const [openCharInnerIndex, closeCharInnerIndex] = autoClosingIndices[i];
					const undoEdit = undoEdits[i];
					const lineNumber = undoEdit.range.startLineNumber;
					const openCharIndex = undoEdit.range.startColumn - 1 + openCharInnerIndex;
					const closeCharIndex = undoEdit.range.startColumn - 1 + closeCharInnerIndex;

					autoClosedCharactersRanges.push(new Range(lineNumber, closeCharIndex + 1, lineNumber, closeCharIndex + 2));
					autoClosedEnclosingRanges.push(new Range(lineNumber, openCharIndex + 1, lineNumber, closeCharIndex + 2));
				}
			}
			const selections = cursorStateComputer(undoEdits);
			if (selections) {
				// Don't recover the selection from markers because
				// we know what it should be.
				this._isHandling = true;
			}

			return selections;
		}, undefined, reason);
		if (selections) {
			this._isHandling = false;
			this.setSelections(eventsCollector, source, selections, CursorChangeReason.NotSet);
		}
		if (autoClosedCharactersRanges.length > 0) {
			this._pushAutoClosedAction(autoClosedCharactersRanges, autoClosedEnclosingRanges);
		}
	}

	private _executeEdit(callback: () => void, eventsCollector: ViewModelEventsCollector, source: string | null | undefined, cursorChangeReason: CursorChangeReason = CursorChangeReason.NotSet): void {
		if (this.context.cursorConfig.readOnly) {
			// we cannot edit when read only...
			return;
		}

		const oldState = CursorModelState.from(this._model, this);
		this._cursors.stopTrackingSelections();
		this._isHandling = true;

		try {
			this._cursors.ensureValidState();
			callback();
		} catch (err) {
			onUnexpectedError(err);
		}

		this._isHandling = false;
		this._cursors.startTrackingSelections();
		this._validateAutoClosedActions();
		if (this._emitStateChangedIfNecessary(eventsCollector, source, cursorChangeReason, oldState, false)) {
			this.revealAll(eventsCollector, source, false, VerticalRevealType.Simple, true, editorCommon.ScrollType.Smooth);
		}
	}

	public getAutoClosedCharacters(): Range[] {
		return AutoClosedAction.getAllAutoClosedCharacters(this._autoClosedActions);
	}

	public startComposition(eventsCollector: ViewModelEventsCollector): void {
		this._compositionState = new CompositionState(this._model, this.getSelections());
	}

	public endComposition(eventsCollector: ViewModelEventsCollector, source?: string | null | undefined): void {
		const reason = EditSources.cursor({ kind: 'compositionEnd', detailedSource: source });

		const compositionOutcome = this._compositionState ? this._compositionState.deduceOutcome(this._model, this.getSelections()) : null;
		this._compositionState = null;

		this._executeEdit(() => {
			if (source === 'keyboard') {
				// composition finishes, let's check if we need to auto complete if necessary.
				this._executeEditOperation(TypeOperations.compositionEndWithInterceptors(this._prevEditOperationType, this.context.cursorConfig, this._model, compositionOutcome, this.getSelections(), this.getAutoClosedCharacters()), reason);
			}
		}, eventsCollector, source);
	}

	public type(eventsCollector: ViewModelEventsCollector, text: string, source?: string | null | undefined): void {
		const reason = EditSources.cursor({ kind: 'type', detailedSource: source });

		this._executeEdit(() => {
			if (source === 'keyboard') {
				// If this event is coming straight from the keyboard, look for electric characters and enter

				const len = text.length;
				let offset = 0;
				while (offset < len) {
					const charLength = strings.nextCharLength(text, offset);
					const chr = text.substr(offset, charLength);

					// Here we must interpret each typed character individually
					this._executeEditOperation(TypeOperations.typeWithInterceptors(!!this._compositionState, this._prevEditOperationType, this.context.cursorConfig, this._model, this.getSelections(), this.getAutoClosedCharacters(), chr), reason);

					offset += charLength;
				}

			} else {
				this._executeEditOperation(TypeOperations.typeWithoutInterceptors(this._prevEditOperationType, this.context.cursorConfig, this._model, this.getSelections(), text), reason);
			}
		}, eventsCollector, source);
	}

	public compositionType(eventsCollector: ViewModelEventsCollector, text: string, replacePrevCharCnt: number, replaceNextCharCnt: number, positionDelta: number, source?: string | null | undefined): void {
		const reason = EditSources.cursor({ kind: 'compositionType', detailedSource: source });

		if (text.length === 0 && replacePrevCharCnt === 0 && replaceNextCharCnt === 0) {
			// this edit is a no-op
			if (positionDelta !== 0) {
				// but it still wants to move the cursor
				const newSelections = this.getSelections().map(selection => {
					const position = selection.getPosition();
					return new Selection(position.lineNumber, position.column + positionDelta, position.lineNumber, position.column + positionDelta);
				});
				this.setSelections(eventsCollector, source, newSelections, CursorChangeReason.NotSet);
			}
			return;
		}
		this._executeEdit(() => {
			this._executeEditOperation(TypeOperations.compositionType(this._prevEditOperationType, this.context.cursorConfig, this._model, this.getSelections(), text, replacePrevCharCnt, replaceNextCharCnt, positionDelta), reason);
		}, eventsCollector, source);
	}

	public paste(eventsCollector: ViewModelEventsCollector, text: string, pasteOnNewLine: boolean, multicursorText?: string[] | null | undefined, source?: string | null | undefined): void {
		const reason = EditSources.cursor({ kind: 'paste', detailedSource: source });

		this._executeEdit(() => {
			this._executeEditOperation(TypeOperations.paste(this.context.cursorConfig, this._model, this.getSelections(), text, pasteOnNewLine, multicursorText || []), reason);
		}, eventsCollector, source, CursorChangeReason.Paste);
	}

	public cut(eventsCollector: ViewModelEventsCollector, source?: string | null | undefined): void {
		const reason = EditSources.cursor({ kind: 'cut', detailedSource: source });
		this._executeEdit(() => {
			this._executeEditOperation(DeleteOperations.cut(this.context.cursorConfig, this._model, this.getSelections()), reason);
		}, eventsCollector, source);
	}

	public executeCommand(eventsCollector: ViewModelEventsCollector, command: editorCommon.ICommand, source?: string | null | undefined): void {
		const reason = EditSources.cursor({ kind: 'executeCommand', detailedSource: source });

		this._executeEdit(() => {
			this._cursors.killSecondaryCursors();

			this._executeEditOperation(new EditOperationResult(EditOperationType.Other, [command], {
				shouldPushStackElementBefore: false,
				shouldPushStackElementAfter: false
			}), reason);
		}, eventsCollector, source);
	}

	public executeCommands(eventsCollector: ViewModelEventsCollector, commands: editorCommon.ICommand[], source?: string | null | undefined): void {
		const reason = EditSources.cursor({ kind: 'executeCommands', detailedSource: source });

		this._executeEdit(() => {
			this._executeEditOperation(new EditOperationResult(EditOperationType.Other, commands, {
				shouldPushStackElementBefore: false,
				shouldPushStackElementAfter: false
			}), reason);
		}, eventsCollector, source);
	}
}

/**
 * A snapshot of the cursor and the model state
 */
class CursorModelState {
	public static from(model: ITextModel, cursor: CursorsController): CursorModelState {
		return new CursorModelState(model.getVersionId(), cursor.getCursorStates());
	}

	constructor(
		public readonly modelVersionId: number,
		public readonly cursorState: CursorState[],
	) {
	}

	public equals(other: CursorModelState | null): boolean {
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

class AutoClosedAction {

	public static getAllAutoClosedCharacters(autoClosedActions: AutoClosedAction[]): Range[] {
		let autoClosedCharacters: Range[] = [];
		for (const autoClosedAction of autoClosedActions) {
			autoClosedCharacters = autoClosedCharacters.concat(autoClosedAction.getAutoClosedCharactersRanges());
		}
		return autoClosedCharacters;
	}

	private readonly _model: ITextModel;

	private _autoClosedCharactersDecorations: string[];
	private _autoClosedEnclosingDecorations: string[];

	constructor(model: ITextModel, autoClosedCharactersDecorations: string[], autoClosedEnclosingDecorations: string[]) {
		this._model = model;
		this._autoClosedCharactersDecorations = autoClosedCharactersDecorations;
		this._autoClosedEnclosingDecorations = autoClosedEnclosingDecorations;
	}

	public dispose(): void {
		this._autoClosedCharactersDecorations = this._model.deltaDecorations(this._autoClosedCharactersDecorations, []);
		this._autoClosedEnclosingDecorations = this._model.deltaDecorations(this._autoClosedEnclosingDecorations, []);
	}

	public getAutoClosedCharactersRanges(): Range[] {
		const result: Range[] = [];
		for (let i = 0; i < this._autoClosedCharactersDecorations.length; i++) {
			const decorationRange = this._model.getDecorationRange(this._autoClosedCharactersDecorations[i]);
			if (decorationRange) {
				result.push(decorationRange);
			}
		}
		return result;
	}

	public isValid(selections: Range[]): boolean {
		const enclosingRanges: Range[] = [];
		for (let i = 0; i < this._autoClosedEnclosingDecorations.length; i++) {
			const decorationRange = this._model.getDecorationRange(this._autoClosedEnclosingDecorations[i]);
			if (decorationRange) {
				enclosingRanges.push(decorationRange);
				if (decorationRange.startLineNumber !== decorationRange.endLineNumber) {
					// Stop tracking if the range becomes multiline...
					return false;
				}
			}
		}
		enclosingRanges.sort(Range.compareRangesUsingStarts);

		selections.sort(Range.compareRangesUsingStarts);

		for (let i = 0; i < selections.length; i++) {
			if (i >= enclosingRanges.length) {
				return false;
			}
			if (!enclosingRanges[i].strictContainsRange(selections[i])) {
				return false;
			}
		}

		return true;
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

export class CommandExecutor {

	public static executeCommands(model: ITextModel, selectionsBefore: Selection[], commands: (editorCommon.ICommand | null)[], editReason: TextModelEditSource = EditSources.unknown({ name: 'executeCommands' })): Selection[] | null {

		const ctx: IExecContext = {
			model: model,
			selectionsBefore: selectionsBefore,
			trackedRanges: [],
			trackedRangesDirection: []
		};

		const result = this._innerExecuteCommands(ctx, commands, editReason);

		for (let i = 0, len = ctx.trackedRanges.length; i < len; i++) {
			ctx.model._setTrackedRange(ctx.trackedRanges[i], null, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges);
		}

		return result;
	}

	private static _innerExecuteCommands(ctx: IExecContext, commands: (editorCommon.ICommand | null)[], editReason: TextModelEditSource): Selection[] | null {

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
		const filteredOperations: IIdentifiedSingleEditOperation[] = [];
		for (let i = 0, len = rawOperations.length; i < len; i++) {
			if (!loserCursorsMap.hasOwnProperty(rawOperations[i].identifier!.major.toString())) {
				filteredOperations.push(rawOperations[i]);
			}
		}

		// TODO@Alex: find a better way to do this.
		// give the hint that edit operations are tracked to the model
		if (commandsData.hadTrackedEditOperation && filteredOperations.length > 0) {
			filteredOperations[0]._isTracked = true;
		}
		let selectionsAfter = ctx.model.pushEditOperations(ctx.selectionsBefore, filteredOperations, (inverseEditOperations: IValidEditOperation[]): Selection[] => {
			const groupedInverseEditOperations: IValidEditOperation[][] = [];
			for (let i = 0; i < ctx.selectionsBefore.length; i++) {
				groupedInverseEditOperations[i] = [];
			}
			for (const op of inverseEditOperations) {
				if (!op.identifier) {
					// perhaps auto whitespace trim edits
					continue;
				}
				groupedInverseEditOperations[op.identifier.major].push(op);
			}
			const minorBasedSorter = (a: IValidEditOperation, b: IValidEditOperation) => {
				return a.identifier!.minor - b.identifier!.minor;
			};
			const cursorSelections: Selection[] = [];
			for (let i = 0; i < ctx.selectionsBefore.length; i++) {
				if (groupedInverseEditOperations[i].length > 0) {
					groupedInverseEditOperations[i].sort(minorBasedSorter);
					cursorSelections[i] = commands[i]!.computeCursorState(ctx.model, {
						getInverseEditOperations: () => {
							return groupedInverseEditOperations[i];
						},

						getTrackedSelection: (id: string) => {
							const idx = parseInt(id, 10);
							const range = ctx.model._getTrackedRange(ctx.trackedRanges[idx])!;
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
		}, undefined, editReason);
		if (!selectionsAfter) {
			selectionsAfter = ctx.selectionsBefore;
		}

		// Extract losing cursors
		const losingCursors: number[] = [];
		for (const losingCursorIndex in loserCursorsMap) {
			if (loserCursorsMap.hasOwnProperty(losingCursorIndex)) {
				losingCursors.push(parseInt(losingCursorIndex, 10));
			}
		}

		// Sort losing cursors descending
		losingCursors.sort((a: number, b: number): number => {
			return b - a;
		});

		// Remove losing cursors
		for (const losingCursor of losingCursors) {
			selectionsAfter.splice(losingCursor, 1);
		}

		return selectionsAfter;
	}

	private static _arrayIsEmpty(commands: (editorCommon.ICommand | null)[]): boolean {
		for (let i = 0, len = commands.length; i < len; i++) {
			if (commands[i]) {
				return false;
			}
		}
		return true;
	}

	private static _getEditOperations(ctx: IExecContext, commands: (editorCommon.ICommand | null)[]): ICommandsData {
		let operations: IIdentifiedSingleEditOperation[] = [];
		let hadTrackedEditOperation: boolean = false;

		for (let i = 0, len = commands.length; i < len; i++) {
			const command = commands[i];
			if (command) {
				const r = this._getEditOperationsFromCommand(ctx, i, command);
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
		const operations: IIdentifiedSingleEditOperation[] = [];
		let operationMinor = 0;

		const addEditOperation = (range: IRange, text: string | null, forceMoveMarkers: boolean = false) => {
			if (Range.isEmpty(range) && text === '') {
				// This command wants to add a no-op => no thank you
				return;
			}
			operations.push({
				identifier: {
					major: majorIdentifier,
					minor: operationMinor++
				},
				range: range,
				text: text,
				forceMoveMarkers: forceMoveMarkers,
				isAutoWhitespaceEdit: command.insertsAutoWhitespace
			});
		};

		let hadTrackedEditOperation = false;
		const addTrackedEditOperation = (selection: IRange, text: string | null, forceMoveMarkers?: boolean) => {
			hadTrackedEditOperation = true;
			addEditOperation(selection, text, forceMoveMarkers);
		};

		const trackSelection = (_selection: ISelection, trackPreviousOnEmpty?: boolean) => {
			const selection = Selection.liftSelection(_selection);
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
			// TODO@Alex use notification service if this should be user facing
			// e.friendlyMessage = nls.localize('corrupt.commands', "Unexpected exception while executing command.");
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

	private static _getLoserCursorMap(operations: IIdentifiedSingleEditOperation[]): { [index: string]: boolean } {
		// This is destructive on the array
		operations = operations.slice(0);

		// Sort operations with last one first
		operations.sort((a: IIdentifiedSingleEditOperation, b: IIdentifiedSingleEditOperation): number => {
			// Note the minus!
			return -(Range.compareRangesUsingEnds(a.range, b.range));
		});

		// Operations can not overlap!
		const loserCursorsMap: { [index: string]: boolean } = {};

		for (let i = 1; i < operations.length; i++) {
			const previousOp = operations[i - 1];
			const currentOp = operations[i];

			if (Range.getStartPosition(previousOp.range).isBefore(Range.getEndPosition(currentOp.range))) {

				let loserMajor: number;

				if (previousOp.identifier!.major > currentOp.identifier!.major) {
					// previousOp loses the battle
					loserMajor = previousOp.identifier!.major;
				} else {
					loserMajor = currentOp.identifier!.major;
				}

				loserCursorsMap[loserMajor.toString()] = true;

				for (let j = 0; j < operations.length; j++) {
					if (operations[j].identifier!.major === loserMajor) {
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

class CompositionLineState {
	constructor(
		public readonly text: string,
		public readonly lineNumber: number,
		public readonly startSelectionOffset: number,
		public readonly endSelectionOffset: number
	) { }
}

class CompositionState {

	private readonly _original: CompositionLineState[] | null;

	private static _capture(textModel: ITextModel, selections: Selection[]): CompositionLineState[] | null {
		const result: CompositionLineState[] = [];
		for (const selection of selections) {
			if (selection.startLineNumber !== selection.endLineNumber) {
				return null;
			}
			const lineNumber = selection.startLineNumber;
			result.push(new CompositionLineState(
				textModel.getLineContent(lineNumber),
				lineNumber,
				selection.startColumn - 1,
				selection.endColumn - 1
			));
		}
		return result;
	}

	constructor(textModel: ITextModel, selections: Selection[]) {
		this._original = CompositionState._capture(textModel, selections);
	}

	/**
	 * Returns the inserted text during this composition.
	 * If the composition resulted in existing text being changed (i.e. not a pure insertion) it returns null.
	 */
	deduceOutcome(textModel: ITextModel, selections: Selection[]): CompositionOutcome[] | null {
		if (!this._original) {
			return null;
		}
		const current = CompositionState._capture(textModel, selections);
		if (!current) {
			return null;
		}
		if (this._original.length !== current.length) {
			return null;
		}
		const result: CompositionOutcome[] = [];
		for (let i = 0, len = this._original.length; i < len; i++) {
			result.push(CompositionState._deduceOutcome(this._original[i], current[i]));
		}
		return result;
	}

	private static _deduceOutcome(original: CompositionLineState, current: CompositionLineState): CompositionOutcome {
		const commonPrefix = Math.min(
			original.startSelectionOffset,
			current.startSelectionOffset,
			strings.commonPrefixLength(original.text, current.text)
		);
		const commonSuffix = Math.min(
			original.text.length - original.endSelectionOffset,
			current.text.length - current.endSelectionOffset,
			strings.commonSuffixLength(original.text, current.text)
		);
		const deletedText = original.text.substring(commonPrefix, original.text.length - commonSuffix);
		const insertedTextStartOffset = commonPrefix;
		const insertedTextEndOffset = current.text.length - commonSuffix;
		const insertedText = current.text.substring(insertedTextStartOffset, insertedTextEndOffset);
		const insertedTextRange = new Range(current.lineNumber, insertedTextStartOffset + 1, current.lineNumber, insertedTextEndOffset + 1);
		return new CompositionOutcome(
			deletedText,
			original.startSelectionOffset - commonPrefix,
			original.endSelectionOffset - commonPrefix,
			insertedText,
			current.startSelectionOffset - commonPrefix,
			current.endSelectionOffset - commonPrefix,
			insertedTextRange
		);
	}
}
