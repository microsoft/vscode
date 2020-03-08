/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import * as strings from 'vs/base/common/strings';
import { CursorCollection } from 'vs/editor/common/controller/cursorCollection';
import { CursorColumns, CursorConfiguration, CursorContext, CursorState, EditOperationResult, EditOperationType, IColumnSelectData, ICursors, PartialCursorState, RevealTarget } from 'vs/editor/common/controller/cursorCommon';
import { DeleteOperations } from 'vs/editor/common/controller/cursorDeleteOperations';
import { CursorChangeReason } from 'vs/editor/common/controller/cursorEvents';
import { TypeOperations, TypeWithAutoClosingCommand } from 'vs/editor/common/controller/cursorTypeOperations';
import { Position } from 'vs/editor/common/core/position';
import { Range, IRange } from 'vs/editor/common/core/range';
import { ISelection, Selection, SelectionDirection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ITextModel, TrackedRangeStickiness, IModelDeltaDecoration, ICursorStateComputer, IIdentifiedSingleEditOperation, IValidEditOperation } from 'vs/editor/common/model';
import { RawContentChangedType, ModelRawContentChangedEvent } from 'vs/editor/common/model/textModelEvents';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { dispose } from 'vs/base/common/lifecycle';
import { EditorOption } from 'vs/editor/common/config/editorOptions';

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
	 * The new model version id that `selections` apply to.
	 */
	readonly modelVersionId: number;
	/**
	 * The old selections.
	 */
	readonly oldSelections: Selection[] | null;
	/**
	 * The model version id the that `oldSelections` apply to.
	 */
	readonly oldModelVersionId: number;
	/**
	 * Source of the call that caused the event.
	 */
	readonly source: string;
	/**
	 * Reason.
	 */
	readonly reason: CursorChangeReason;

	constructor(selections: Selection[], modelVersionId: number, oldSelections: Selection[] | null, oldModelVersionId: number, source: string, reason: CursorChangeReason) {
		this.selections = selections;
		this.modelVersionId = modelVersionId;
		this.oldSelections = oldSelections;
		this.oldModelVersionId = oldModelVersionId;
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
		let result: Range[] = [];
		for (let i = 0; i < this._autoClosedCharactersDecorations.length; i++) {
			const decorationRange = this._model.getDecorationRange(this._autoClosedCharactersDecorations[i]);
			if (decorationRange) {
				result.push(decorationRange);
			}
		}
		return result;
	}

	public isValid(selections: Range[]): boolean {
		let enclosingRanges: Range[] = [];
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

export class Cursor extends viewEvents.ViewEventEmitter implements ICursors {

	public static readonly MAX_CURSOR_COUNT = 10000;

	private readonly _onDidReachMaxCursorCount: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidReachMaxCursorCount: Event<void> = this._onDidReachMaxCursorCount.event;

	private readonly _onDidAttemptReadOnlyEdit: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidAttemptReadOnlyEdit: Event<void> = this._onDidAttemptReadOnlyEdit.event;

	private readonly _onDidChange: Emitter<CursorStateChangedEvent> = this._register(new Emitter<CursorStateChangedEvent>());
	public readonly onDidChange: Event<CursorStateChangedEvent> = this._onDidChange.event;

	private readonly _configuration: editorCommon.IConfiguration;
	private readonly _model: ITextModel;
	private _knownModelVersionId: number;
	private readonly _viewModel: IViewModel;
	public context: CursorContext;
	private _cursors: CursorCollection;

	private _hasFocus: boolean;
	private _isHandling: boolean;
	private _isDoingComposition: boolean;
	private _selectionsWhenCompositionStarted: Selection[] | null;
	private _columnSelectData: IColumnSelectData | null;
	private _autoClosedActions: AutoClosedAction[];
	private _prevEditOperationType: EditOperationType;

	constructor(configuration: editorCommon.IConfiguration, model: ITextModel, viewModel: IViewModel) {
		super();
		this._configuration = configuration;
		this._model = model;
		this._knownModelVersionId = this._model.getVersionId();
		this._viewModel = viewModel;
		this.context = new CursorContext(this._configuration, this._model, this._viewModel);
		this._cursors = new CursorCollection(this.context);

		this._hasFocus = false;
		this._isHandling = false;
		this._isDoingComposition = false;
		this._selectionsWhenCompositionStarted = null;
		this._columnSelectData = null;
		this._autoClosedActions = [];
		this._prevEditOperationType = EditOperationType.Other;

		this._register(this._model.onDidChangeRawContent((e) => {
			this._knownModelVersionId = e.versionId;
			if (this._isHandling) {
				return;
			}

			this._onModelContentChanged(e);
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
		this._autoClosedActions = dispose(this._autoClosedActions);
		super.dispose();
	}

	public setHasFocus(hasFocus: boolean): void {
		this._hasFocus = hasFocus;
	}

	private _validateAutoClosedActions(): void {
		if (this._autoClosedActions.length > 0) {
			let selections: Range[] = this._cursors.getSelections();
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

	public getPrimaryCursor(): CursorState {
		return this._cursors.getPrimaryCursor();
	}

	public getLastAddedCursorIndex(): number {
		return this._cursors.getLastAddedCursorIndex();
	}

	public getAll(): CursorState[] {
		return this._cursors.getAll();
	}

	public setStates(source: string, reason: CursorChangeReason, states: PartialCursorState[] | null): boolean {
		if (states !== null && states.length > Cursor.MAX_CURSOR_COUNT) {
			states = states.slice(0, Cursor.MAX_CURSOR_COUNT);
			this._onDidReachMaxCursorCount.fire(undefined);
		}

		const oldState = new CursorModelState(this._model, this);

		this._cursors.setStates(states);
		this._cursors.normalize();
		this._columnSelectData = null;

		this._validateAutoClosedActions();

		return this._emitStateChangedIfNecessary(source, reason, oldState);
	}

	public setColumnSelectData(columnSelectData: IColumnSelectData): void {
		this._columnSelectData = columnSelectData;
	}

	public reveal(source: string, horizontal: boolean, target: RevealTarget, scrollType: editorCommon.ScrollType): void {
		this._revealRange(source, target, viewEvents.VerticalRevealType.Simple, horizontal, scrollType);
	}

	public revealRange(source: string, revealHorizontal: boolean, viewRange: Range, verticalType: viewEvents.VerticalRevealType, scrollType: editorCommon.ScrollType) {
		this.emitCursorRevealRange(source, viewRange, null, verticalType, revealHorizontal, scrollType);
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
		this.reveal('restoreState', true, RevealTarget.Primary, editorCommon.ScrollType.Immediate);
	}

	private _onModelContentChanged(e: ModelRawContentChangedEvent): void {

		const hadFlushEvent = e.containsEvent(RawContentChangedType.Flush);
		this._prevEditOperationType = EditOperationType.Other;

		if (hadFlushEvent) {
			// a model.setValue() was called
			this._cursors.dispose();
			this._cursors = new CursorCollection(this.context);
			this._validateAutoClosedActions();
			this._emitStateChangedIfNecessary('model', CursorChangeReason.ContentFlush, null);
		} else {
			if (this._hasFocus && e.resultingSelection && e.resultingSelection.length > 0) {
				const cursorState = CursorState.fromModelSelections(e.resultingSelection);
				if (this.setStates('modelChange', e.isUndoing ? CursorChangeReason.Undo : e.isRedoing ? CursorChangeReason.Redo : CursorChangeReason.RecoverFromMarkers, cursorState)) {
					this._revealRange('modelChange', RevealTarget.Primary, viewEvents.VerticalRevealType.Simple, true, editorCommon.ScrollType.Smooth);
				}
			} else {
				const selectionsFromMarkers = this._cursors.readSelectionFromMarkers();
				this.setStates('modelChange', CursorChangeReason.RecoverFromMarkers, CursorState.fromModelSelections(selectionsFromMarkers));
			}
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
		const viewSelectionStart = primaryCursor.viewState.selectionStart.getStartPosition();
		const viewPosition = primaryCursor.viewState.position;
		return {
			isReal: false,
			fromViewLineNumber: viewSelectionStart.lineNumber,
			fromViewVisualColumn: CursorColumns.visibleColumnFromColumn2(this.context.config, this.context.viewModel, viewSelectionStart),
			toViewLineNumber: viewPosition.lineNumber,
			toViewVisualColumn: CursorColumns.visibleColumnFromColumn2(this.context.config, this.context.viewModel, viewPosition),
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

	public setSelections(source: string, selections: readonly ISelection[]): void {
		this.setStates(source, CursorChangeReason.NotSet, CursorState.fromModelSelections(selections));
	}

	public getPrevEditOperationType(): EditOperationType {
		return this._prevEditOperationType;
	}

	public setPrevEditOperationType(type: EditOperationType): void {
		this._prevEditOperationType = type;
	}

	// ------ auxiliary handling logic

	private _pushAutoClosedAction(autoClosedCharactersRanges: Range[], autoClosedEnclosingRanges: Range[]): void {
		let autoClosedCharactersDeltaDecorations: IModelDeltaDecoration[] = [];
		let autoClosedEnclosingDeltaDecorations: IModelDeltaDecoration[] = [];

		for (let i = 0, len = autoClosedCharactersRanges.length; i < len; i++) {
			autoClosedCharactersDeltaDecorations.push({
				range: autoClosedCharactersRanges[i],
				options: {
					inlineClassName: 'auto-closed-character',
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
				}
			});
			autoClosedEnclosingDeltaDecorations.push({
				range: autoClosedEnclosingRanges[i],
				options: {
					stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
				}
			});
		}

		const autoClosedCharactersDecorations = this._model.deltaDecorations([], autoClosedCharactersDeltaDecorations);
		const autoClosedEnclosingDecorations = this._model.deltaDecorations([], autoClosedEnclosingDeltaDecorations);
		this._autoClosedActions.push(new AutoClosedAction(this._model, autoClosedCharactersDecorations, autoClosedEnclosingDecorations));
	}

	private _executeEditOperation(opResult: EditOperationResult | null): void {

		if (!opResult) {
			// Nothing to execute
			return;
		}

		if (opResult.shouldPushStackElementBefore) {
			this._model.pushStackElement();
		}

		const result = CommandExecutor.executeCommands(this._model, this._cursors.getSelections(), opResult.commands);
		if (result) {
			// The commands were applied correctly
			this._interpretCommandResult(result);

			// Check for auto-closing closed characters
			let autoClosedCharactersRanges: Range[] = [];
			let autoClosedEnclosingRanges: Range[] = [];

			for (let i = 0; i < opResult.commands.length; i++) {
				const command = opResult.commands[i];
				if (command instanceof TypeWithAutoClosingCommand && command.enclosingRange && command.closeCharacterRange) {
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

	private _emitStateChangedIfNecessary(source: string, reason: CursorChangeReason, oldState: CursorModelState | null): boolean {
		const newState = new CursorModelState(this._model, this);
		if (newState.equals(oldState)) {
			return false;
		}

		const selections = this._cursors.getSelections();
		const viewSelections = this._cursors.getViewSelections();

		// Let the view get the event first.
		try {
			const eventsCollector = this._beginEmit();
			eventsCollector.emit(new viewEvents.ViewCursorStateChangedEvent(viewSelections, selections));
		} finally {
			this._endEmit();
		}

		// Only after the view has been notified, let the rest of the world know...
		if (!oldState
			|| oldState.cursorState.length !== newState.cursorState.length
			|| newState.cursorState.some((newCursorState, i) => !newCursorState.modelState.equals(oldState.cursorState[i].modelState))
		) {
			const oldSelections = oldState ? oldState.cursorState.map(s => s.modelState.selection) : null;
			const oldModelVersionId = oldState ? oldState.modelVersionId : 0;
			this._onDidChange.fire(new CursorStateChangedEvent(selections, newState.modelVersionId, oldSelections, oldModelVersionId, source || 'keyboard', reason));
		}

		return true;
	}

	private _revealRange(source: string, revealTarget: RevealTarget, verticalType: viewEvents.VerticalRevealType, revealHorizontal: boolean, scrollType: editorCommon.ScrollType): void {
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
				this.emitCursorRevealRange(source, null, this._cursors.getViewSelections(), verticalType, revealHorizontal, scrollType);
				return;
			}
		}

		const viewRange = new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column);
		this.emitCursorRevealRange(source, viewRange, null, verticalType, revealHorizontal, scrollType);
	}

	public emitCursorRevealRange(source: string, viewRange: Range | null, viewSelections: Selection[] | null, verticalType: viewEvents.VerticalRevealType, revealHorizontal: boolean, scrollType: editorCommon.ScrollType) {
		try {
			const eventsCollector = this._beginEmit();
			eventsCollector.emit(new viewEvents.ViewRevealRangeRequestEvent(source, viewRange, viewSelections, verticalType, revealHorizontal, scrollType));
		} finally {
			this._endEmit();
		}
	}

	// -----------------------------------------------------------------------------------------------------------
	// ----- handlers beyond this point

	private _findAutoClosingPairs(edits: IIdentifiedSingleEditOperation[]): [number, number][] | null {
		if (!edits.length) {
			return null;
		}

		let indices: [number, number][] = [];
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

			const autoClosingPairsCandidates = this.context.config.autoClosingPairsClose2.get(closeChar);
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

	public executeEdits(source: string, edits: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer): void {
		let autoClosingIndices: [number, number][] | null = null;
		if (source === 'snippet') {
			autoClosingIndices = this._findAutoClosingPairs(edits);
		}

		if (autoClosingIndices) {
			edits[0]._isTracked = true;
		}
		let autoClosedCharactersRanges: Range[] = [];
		let autoClosedEnclosingRanges: Range[] = [];
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
		});
		if (selections) {
			this._isHandling = false;
			this.setSelections(source, selections);
		}
		if (autoClosedCharactersRanges.length > 0) {
			this._pushAutoClosedAction(autoClosedCharactersRanges, autoClosedEnclosingRanges);
		}
	}

	public trigger(source: string, handlerId: string, payload: any): void {
		const H = editorCommon.Handler;

		if (handlerId === H.CompositionStart) {
			this._isDoingComposition = true;
			this._selectionsWhenCompositionStarted = this.getSelections().slice(0);
			return;
		}

		if (handlerId === H.CompositionEnd) {
			this._isDoingComposition = false;
		}

		if (this._configuration.options.get(EditorOption.readOnly)) {
			// All the remaining handlers will try to edit the model,
			// but we cannot edit when read only...
			this._onDidAttemptReadOnlyEdit.fire(undefined);
			return;
		}

		const oldState = new CursorModelState(this._model, this);
		let cursorChangeReason = CursorChangeReason.NotSet;

		this._cursors.stopTrackingSelections();

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
					this._paste(<string>payload.text, <boolean>payload.pasteOnNewLine, <string[]>payload.multicursorText || []);
					break;

				case H.Cut:
					this._cut();
					break;

				case H.ExecuteCommand:
					this._externalExecuteCommand(<editorCommon.ICommand>payload);
					break;

				case H.ExecuteCommands:
					this._externalExecuteCommands(<editorCommon.ICommand[]>payload);
					break;

				case H.CompositionEnd:
					this._interpretCompositionEnd(source);
					break;
			}
		} catch (err) {
			onUnexpectedError(err);
		}

		this._isHandling = false;

		this._cursors.startTrackingSelections();

		this._validateAutoClosedActions();

		if (this._emitStateChangedIfNecessary(source, cursorChangeReason, oldState)) {
			this._revealRange(source, RevealTarget.Primary, viewEvents.VerticalRevealType.Simple, true, editorCommon.ScrollType.Smooth);
		}
	}

	private _interpretCompositionEnd(source: string) {
		if (!this._isDoingComposition && source === 'keyboard') {
			// composition finishes, let's check if we need to auto complete if necessary.
			const autoClosedCharacters = AutoClosedAction.getAllAutoClosedCharacters(this._autoClosedActions);
			this._executeEditOperation(TypeOperations.compositionEndWithInterceptors(this._prevEditOperationType, this.context.config, this.context.model, this._selectionsWhenCompositionStarted, this.getSelections(), autoClosedCharacters));
			this._selectionsWhenCompositionStarted = null;
		}
	}

	private _type(source: string, text: string): void {
		if (source === 'keyboard') {
			// If this event is coming straight from the keyboard, look for electric characters and enter

			const len = text.length;
			let offset = 0;
			while (offset < len) {
				const charLength = strings.nextCharLength(text, offset);
				const chr = text.substr(offset, charLength);

				// Here we must interpret each typed character individually
				const autoClosedCharacters = AutoClosedAction.getAllAutoClosedCharacters(this._autoClosedActions);
				this._executeEditOperation(TypeOperations.typeWithInterceptors(this._isDoingComposition, this._prevEditOperationType, this.context.config, this.context.model, this.getSelections(), autoClosedCharacters, chr));

				offset += charLength;
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

	public static executeCommands(model: ITextModel, selectionsBefore: Selection[], commands: (editorCommon.ICommand | null)[]): Selection[] | null {

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

	private static _innerExecuteCommands(ctx: IExecContext, commands: (editorCommon.ICommand | null)[]): Selection[] | null {

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
			let groupedInverseEditOperations: IValidEditOperation[][] = [];
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
			let cursorSelections: Selection[] = [];
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
		});
		if (!selectionsAfter) {
			selectionsAfter = ctx.selectionsBefore;
		}

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
		let operations: IIdentifiedSingleEditOperation[] = [];
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
