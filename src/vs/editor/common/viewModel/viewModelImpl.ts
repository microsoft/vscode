/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { EmitterEvent, EventEmitter, IEventEmitter } from 'vs/base/common/eventEmitter';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ViewModelCursors } from 'vs/editor/common/viewModel/viewModelCursors';
import { ViewModelDecorations } from 'vs/editor/common/viewModel/viewModelDecorations';
import { ViewLineRenderingData, ViewModelDecoration, IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { SplitLinesCollection } from 'vs/editor/common/viewModel/splitLinesCollection';

export class ViewModel extends EventEmitter implements IViewModel {

	private editorId: number;
	private configuration: editorCommon.IConfiguration;
	private model: editorCommon.IModel;

	private listenersToRemove: IDisposable[];
	private _toDispose: IDisposable[];
	private lines: SplitLinesCollection;
	private decorations: ViewModelDecorations;
	private cursors: ViewModelCursors;

	private _renderCustomLineNumbers: (lineNumber: number) => string;
	private _renderRelativeLineNumbers: boolean;
	private _lastCursorPosition: Position;

	private _centeredViewLine: number;

	constructor(lines: SplitLinesCollection, editorId: number, configuration: editorCommon.IConfiguration, model: editorCommon.IModel) {
		super();
		this.lines = lines;

		this.editorId = editorId;
		this.configuration = configuration;
		this.model = model;

		this._lastCursorPosition = new Position(1, 1);
		this._renderCustomLineNumbers = this.configuration.editor.viewInfo.renderCustomLineNumbers;
		this._renderRelativeLineNumbers = this.configuration.editor.viewInfo.renderRelativeLineNumbers;

		this._centeredViewLine = -1;

		this.decorations = new ViewModelDecorations(this.editorId, this.model, this.configuration, {
			convertModelRangeToViewRange: (modelRange: Range, isWholeLine: boolean): Range => {
				if (isWholeLine) {
					return this.convertWholeLineModelRangeToViewRange(modelRange);
				}
				return this.convertModelRangeToViewRange(modelRange);
			},
			convertViewRangeToModelRange: (viewRange: Range): Range => {
				return this.convertViewRangeToModelRange(viewRange);
			}
		});
		this.decorations.reset();

		this.cursors = new ViewModelCursors(this.configuration);

		this.listenersToRemove = [];
		this._toDispose = [];
		this.listenersToRemove.push(this.model.addBulkListener((events: EmitterEvent[]) => this.onEvents(events)));
		this._toDispose.push(this.configuration.onDidChange((e) => {
			this.onEvents([new EmitterEvent(editorCommon.EventType.ConfigurationChanged, e)]);
		}));
	}

	public setHiddenAreas(ranges: editorCommon.IRange[]): void {
		try {
			this._beginDeferredEmit();
			this._setHiddenAreas(ranges);
		} finally {
			this._endDeferredEmit();
		}
	}

	private _setHiddenAreas(ranges: editorCommon.IRange[]): void {
		let lineMappingChanged = this.lines.setHiddenAreas(ranges, (eventType: string, payload: any) => this.emit(eventType, payload));
		if (lineMappingChanged) {
			this.emit(editorCommon.ViewEventNames.LineMappingChangedEvent);
			this.decorations.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
			this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
		}
	}

	public dispose(): void {
		this.listenersToRemove = dispose(this.listenersToRemove);
		this._toDispose = dispose(this._toDispose);
		this.decorations.dispose();
		this.decorations = null;
		this.lines.dispose();
		this.lines = null;
		this.configuration = null;
		this.model = null;
	}

	private _onTabSizeChange(newTabSize: number): boolean {
		var lineMappingChanged = this.lines.setTabSize(newTabSize, (eventType: string, payload: any) => this.emit(eventType, payload));
		if (lineMappingChanged) {
			this.emit(editorCommon.ViewEventNames.LineMappingChangedEvent);
			this.decorations.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
			this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
		}
		return lineMappingChanged;
	}

	private _onWrappingIndentChange(newWrappingIndent: editorCommon.WrappingIndent): boolean {
		var lineMappingChanged = this.lines.setWrappingIndent(newWrappingIndent, (eventType: string, payload: any) => this.emit(eventType, payload));
		if (lineMappingChanged) {
			this.emit(editorCommon.ViewEventNames.LineMappingChangedEvent);
			this.decorations.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
			this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
		}
		return lineMappingChanged;
	}

	private _restoreCenteredModelRange(range: Range): void {
		// modelLine -> viewLine
		var newCenteredViewRange = this.convertModelRangeToViewRange(range);

		// Send a reveal event to restore the centered content
		var restoreRevealEvent: editorCommon.IViewRevealRangeEvent = {
			range: newCenteredViewRange,
			verticalType: editorCommon.VerticalRevealType.Center,
			revealHorizontal: false,
			revealCursor: false
		};
		this.emit(editorCommon.ViewEventNames.RevealRangeEvent, restoreRevealEvent);
	}

	private _onWrappingColumnChange(newWrappingColumn: number, columnsForFullWidthChar: number): boolean {
		let lineMappingChanged = this.lines.setWrappingColumn(newWrappingColumn, columnsForFullWidthChar, (eventType: string, payload: any) => this.emit(eventType, payload));
		if (lineMappingChanged) {
			this.emit(editorCommon.ViewEventNames.LineMappingChangedEvent);
			this.decorations.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
			this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
		}
		return lineMappingChanged;
	}

	public addEventSource(eventSource: IEventEmitter): void {
		this.listenersToRemove.push(eventSource.addBulkListener2((events: EmitterEvent[]) => this.onEvents(events)));
	}

	private onEvents(events: EmitterEvent[]): void {
		try {
			this._beginDeferredEmit();
			this._onEvents(events);
		} finally {
			this._endDeferredEmit();
		}
	}

	private static _containsModelContentChangeEvent(events: EmitterEvent[]): boolean {
		for (let i = 0, len = events.length; i < len; i++) {
			let eventType = events[i].getType();
			if (eventType === editorCommon.EventType.ModelRawContentChanged) {
				return true;
			}
		}
		return false;
	}

	private static _containsWrappingRelatedEvents(events: EmitterEvent[]): boolean {
		for (let i = 0, len = events.length; i < len; i++) {
			let eventType = events[i].getType();
			if (eventType === editorCommon.EventType.ModelOptionsChanged) {
				return true;
			}
			if (eventType === editorCommon.EventType.ConfigurationChanged) {
				return true;
			}
		}
		return false;
	}

	public getCenteredRangeInViewport(): Range {
		if (this._centeredViewLine === -1) {
			// Never got rendered
			return null;
		}
		let viewLineNumber = this._centeredViewLine;
		let currentCenteredViewRange = new Range(viewLineNumber, this.getLineMinColumn(viewLineNumber), viewLineNumber, this.getLineMaxColumn(viewLineNumber));
		return this.convertViewRangeToModelRange(currentCenteredViewRange);
	}

	private _onEvents(events: EmitterEvent[]): void {

		// We might need to restore the current centered view range in the following circumstances:
		// All of these changes might lead to a new line mapping:
		// (a) model tabSize changed
		// (b) wrappingIndent changed
		// (c) wrappingColumn changed
		// (d) fontInfo changed
		// However, we cannot restore the current centered line if the model has changed its content
		// because we cannot convert the view range to a model range.

		let previousCenteredModelRange: Range = null;
		if (!ViewModel._containsModelContentChangeEvent(events) && ViewModel._containsWrappingRelatedEvents(events)) {
			previousCenteredModelRange = this.getCenteredRangeInViewport();
		}

		let i: number,
			len: number,
			e: EmitterEvent,
			data: any,
			modelContentChangedEvent: editorCommon.IModelContentChangedEvent,
			hadOtherModelChange = false,
			hadModelLineChangeThatChangedLineMapping = false,
			revealPreviousCenteredModelRange = false;

		for (i = 0, len = events.length; i < len; i++) {
			e = events[i];
			data = e.getData();

			switch (e.getType()) {

				case editorCommon.EventType.ModelRawContentChanged:
					modelContentChangedEvent = <editorCommon.IModelContentChangedEvent>data;

					switch (modelContentChangedEvent.changeType) {
						case editorCommon.EventType.ModelRawContentChangedFlush:
							this.onModelFlushed(<editorCommon.IModelContentChangedFlushEvent>modelContentChangedEvent);
							hadOtherModelChange = true;
							break;

						case editorCommon.EventType.ModelRawContentChangedLinesDeleted:
							this.onModelLinesDeleted(<editorCommon.IModelContentChangedLinesDeletedEvent>modelContentChangedEvent);
							hadOtherModelChange = true;
							break;

						case editorCommon.EventType.ModelRawContentChangedLinesInserted:
							this.onModelLinesInserted(<editorCommon.IModelContentChangedLinesInsertedEvent>modelContentChangedEvent);
							hadOtherModelChange = true;
							break;

						case editorCommon.EventType.ModelRawContentChangedLineChanged:
							hadModelLineChangeThatChangedLineMapping = this.onModelLineChanged(<editorCommon.IModelContentChangedLineChangedEvent>modelContentChangedEvent);
							break;

						default:
							console.info('ViewModel received unknown event: ');
							console.info(e);
					}
					break;

				case editorCommon.EventType.ModelTokensChanged:
					this.onModelTokensChanged(<editorCommon.IModelTokensChangedEvent>data);
					break;

				case editorCommon.EventType.ModelLanguageChanged:
					// That's ok, a model tokens changed event will follow shortly
					break;

				case editorCommon.EventType.ModelContentChanged2:
					// Ignore
					break;

				case editorCommon.EventType.ModelOptionsChanged:
					// A tab size change causes a line mapping changed event => all view parts will repaint OK, no further event needed here
					let prevLineCount = this.lines.getViewLineCount();
					let tabSizeChanged = this._onTabSizeChange(this.model.getOptions().tabSize);
					let newLineCount = this.lines.getViewLineCount();
					if (tabSizeChanged && prevLineCount !== newLineCount) {
						revealPreviousCenteredModelRange = true;
					}

					break;

				case editorCommon.EventType.ModelDecorationsChanged:
					this.onModelDecorationsChanged(<editorCommon.IModelDecorationsChangedEvent>data);
					break;

				case editorCommon.EventType.ModelDispose:
					// Ignore, since the editor will take care of this and destroy the view shortly
					break;

				case editorCommon.EventType.CursorPositionChanged:
					this.onCursorPositionChanged(<editorCommon.ICursorPositionChangedEvent>data);
					this._lastCursorPosition = (<editorCommon.ICursorPositionChangedEvent>data).position;
					break;

				case editorCommon.EventType.CursorSelectionChanged:
					this.onCursorSelectionChanged(<editorCommon.ICursorSelectionChangedEvent>data);
					break;

				case editorCommon.EventType.CursorRevealRange:
					this.onCursorRevealRange(<editorCommon.ICursorRevealRangeEvent>data);
					break;

				case editorCommon.EventType.CursorScrollRequest:
					this.onCursorScrollRequest(<editorCommon.ICursorScrollRequestEvent>data);
					break;

				case editorCommon.EventType.ConfigurationChanged:
					revealPreviousCenteredModelRange = this._onWrappingIndentChange(this.configuration.editor.wrappingInfo.wrappingIndent) || revealPreviousCenteredModelRange;
					revealPreviousCenteredModelRange = this._onWrappingColumnChange(this.configuration.editor.wrappingInfo.wrappingColumn, this.configuration.editor.fontInfo.typicalFullwidthCharacterWidth / this.configuration.editor.fontInfo.typicalHalfwidthCharacterWidth) || revealPreviousCenteredModelRange;

					this._renderCustomLineNumbers = this.configuration.editor.viewInfo.renderCustomLineNumbers;
					this._renderRelativeLineNumbers = this.configuration.editor.viewInfo.renderRelativeLineNumbers;

					if ((<editorCommon.IConfigurationChangedEvent>data).readOnly) {
						// Must read again all decorations due to readOnly filtering
						this.decorations.reset();
						this.emit(editorCommon.ViewEventNames.DecorationsChangedEvent, {});
					}
					this.emit(e.getType(), <editorCommon.IConfigurationChangedEvent>data);
					break;

				default:
					console.info('View received unknown event: ');
					console.info(e);
			}
		}

		if (!hadOtherModelChange && hadModelLineChangeThatChangedLineMapping) {
			this.emit(editorCommon.ViewEventNames.LineMappingChangedEvent);
			this.decorations.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
			this.cursors.onLineMappingChanged((eventType: string, payload: any) => this.emit(eventType, payload));
		}

		if (revealPreviousCenteredModelRange && previousCenteredModelRange) {
			this._restoreCenteredModelRange(previousCenteredModelRange);
		}
	}

	// --- begin inbound event conversion
	private onModelFlushed(e: editorCommon.IModelContentChangedFlushEvent): void {
		this.lines.onModelFlushed(e.versionId, (eventType: string, payload: any) => this.emit(eventType, payload));
		this.decorations.reset();
	}
	private onModelDecorationsChanged(e: editorCommon.IModelDecorationsChangedEvent): void {
		this.decorations.onModelDecorationsChanged(e, (eventType: string, payload: any) => this.emit(eventType, payload));
	}
	private onModelLinesDeleted(e: editorCommon.IModelContentChangedLinesDeletedEvent): void {
		this.lines.onModelLinesDeleted(e.versionId, e.fromLineNumber, e.toLineNumber, (eventType: string, payload: any) => this.emit(eventType, payload));
	}
	private onModelTokensChanged(e: editorCommon.IModelTokensChangedEvent): void {
		let viewRanges: { fromLineNumber: number; toLineNumber: number; }[] = [];

		for (let i = 0, len = e.ranges.length; i < len; i++) {
			let modelRange = e.ranges[i];
			let viewStartLineNumber = this.convertModelPositionToViewPosition(modelRange.fromLineNumber, 1).lineNumber;
			let viewEndLineNumber = this.convertModelPositionToViewPosition(modelRange.toLineNumber, this.model.getLineMaxColumn(modelRange.toLineNumber)).lineNumber;
			viewRanges[i] = {
				fromLineNumber: viewStartLineNumber,
				toLineNumber: viewEndLineNumber
			};
		}

		var e: editorCommon.IViewTokensChangedEvent = {
			ranges: viewRanges
		};
		this.emit(editorCommon.ViewEventNames.TokensChangedEvent, e);
	}
	private onModelLineChanged(e: editorCommon.IModelContentChangedLineChangedEvent): boolean {
		var lineMappingChanged = this.lines.onModelLineChanged(e.versionId, e.lineNumber, e.detail, (eventType: string, payload: any) => this.emit(eventType, payload));
		return lineMappingChanged;
	}
	private onModelLinesInserted(e: editorCommon.IModelContentChangedLinesInsertedEvent): void {
		this.lines.onModelLinesInserted(e.versionId, e.fromLineNumber, e.toLineNumber, e.detail.split('\n'), (eventType: string, payload: any) => this.emit(eventType, payload));
	}

	public validateViewRange(viewStartLineNumber: number, viewStartColumn: number, viewEndLineNumber: number, viewEndColumn: number, modelRange: Range): Range {
		var validViewStart = this.validateViewPosition(viewStartLineNumber, viewStartColumn, modelRange.getStartPosition());
		var validViewEnd = this.validateViewPosition(viewEndLineNumber, viewEndColumn, modelRange.getEndPosition());
		return new Range(validViewStart.lineNumber, validViewStart.column, validViewEnd.lineNumber, validViewEnd.column);
	}

	public validateViewPosition(viewLineNumber: number, viewColumn: number, expectedModelPosition: Position): Position {
		return this.lines.validateViewPosition(viewLineNumber, viewColumn, expectedModelPosition);
	}

	private onCursorPositionChanged(e: editorCommon.ICursorPositionChangedEvent): void {
		this.cursors.onCursorPositionChanged(e, (eventType: string, payload: any) => this.emit(eventType, payload));
	}
	private onCursorSelectionChanged(e: editorCommon.ICursorSelectionChangedEvent): void {
		this.cursors.onCursorSelectionChanged(e, (eventType: string, payload: any) => this.emit(eventType, payload));
	}
	private onCursorRevealRange(e: editorCommon.ICursorRevealRangeEvent): void {
		// Ensure event has viewRange
		if (!e.viewRange) {
			e = {
				range: e.range,
				viewRange: this.convertModelRangeToViewRange(e.range),
				verticalType: e.verticalType,
				revealHorizontal: e.revealHorizontal,
				revealCursor: e.revealCursor,
			};
		}
		this.cursors.onCursorRevealRange(e, (eventType: string, payload: any) => this.emit(eventType, payload));
	}
	private onCursorScrollRequest(e: editorCommon.ICursorScrollRequestEvent): void {
		this.cursors.onCursorScrollRequest(e, (eventType: string, payload: any) => this.emit(eventType, payload));
	}
	// --- end inbound event conversion

	public getTabSize(): number {
		return this.model.getOptions().tabSize;
	}

	public getLineCount(): number {
		return this.lines.getViewLineCount();
	}

	/**
	 * Gives a hint that a lot of requests are about to come in for these line numbers.
	 */
	public setViewport(startLineNumber: number, endLineNumber: number, centeredLineNumber: number): void {
		this._centeredViewLine = centeredLineNumber;
		this.lines.warmUpLookupCache(startLineNumber, endLineNumber);
	}

	public getLineIndentGuide(lineNumber: number): number {
		return this.lines.getViewLineIndentGuide(lineNumber);
	}

	public getLineContent(lineNumber: number): string {
		return this.lines.getViewLineContent(lineNumber);
	}

	public getLineMinColumn(lineNumber: number): number {
		return this.lines.getViewLineMinColumn(lineNumber);
	}

	public getLineMaxColumn(lineNumber: number): number {
		return this.lines.getViewLineMaxColumn(lineNumber);
	}

	public getLineFirstNonWhitespaceColumn(lineNumber: number): number {
		var result = strings.firstNonWhitespaceIndex(this.getLineContent(lineNumber));
		if (result === -1) {
			return 0;
		}
		return result + 1;
	}

	public getLineLastNonWhitespaceColumn(lineNumber: number): number {
		var result = strings.lastNonWhitespaceIndex(this.getLineContent(lineNumber));
		if (result === -1) {
			return 0;
		}
		return result + 2;
	}

	public getLineRenderLineNumber(viewLineNumber: number): string {
		let modelPosition = this.convertViewPositionToModelPosition(viewLineNumber, 1);
		if (modelPosition.column !== 1) {
			return '';
		}
		let modelLineNumber = modelPosition.lineNumber;

		if (this._renderCustomLineNumbers) {
			return this._renderCustomLineNumbers(modelLineNumber);
		}

		if (this._renderRelativeLineNumbers) {
			let diff = Math.abs(this._lastCursorPosition.lineNumber - modelLineNumber);
			if (diff === 0) {
				return '<span class="relative-current-line-number">' + modelLineNumber + '</span>';
			}
			return String(diff);
		}

		return String(modelLineNumber);
	}

	public getMaxLineNumber(): number {
		// The largest value for a line number will be that of the model line count
		return this.model.getLineCount();
	}

	public getDecorationsInViewport(visibleRange: Range): ViewModelDecoration[] {
		return this.decorations.getDecorationsViewportData(visibleRange).decorations;
	}

	public getViewLineRenderingData(visibleRange: Range, lineNumber: number): ViewLineRenderingData {
		let mightContainRTL = this.model.mightContainRTL();
		let mightContainNonBasicASCII = this.model.mightContainNonBasicASCII();
		let tabSize = this.getTabSize();
		let lineData = this.lines.getViewLineRenderingData(lineNumber);
		let allInlineDecorations = this.decorations.getDecorationsViewportData(visibleRange).inlineDecorations;
		let inlineDecorations = allInlineDecorations[lineNumber - visibleRange.startLineNumber];

		return new ViewLineRenderingData(
			lineData.minColumn,
			lineData.maxColumn,
			lineData.content,
			mightContainRTL,
			mightContainNonBasicASCII,
			lineData.tokens,
			inlineDecorations,
			tabSize
		);
	}

	public getAllOverviewRulerDecorations(): ViewModelDecoration[] {
		return this.decorations.getAllOverviewRulerDecorations();
	}

	public getEOL(): string {
		return this.model.getEOL();
	}

	public getValueInRange(range: Range, eol: editorCommon.EndOfLinePreference): string {
		var modelRange = this.convertViewRangeToModelRange(range);
		return this.model.getValueInRange(modelRange, eol);
	}

	// View -> Model conversion and related methods

	public convertViewPositionToModelPosition(viewLineNumber: number, viewColumn: number): Position {
		return this.lines.convertViewPositionToModelPosition(viewLineNumber, viewColumn);
	}

	public convertViewRangeToModelRange(viewRange: Range): Range {
		var start = this.convertViewPositionToModelPosition(viewRange.startLineNumber, viewRange.startColumn);
		var end = this.convertViewPositionToModelPosition(viewRange.endLineNumber, viewRange.endColumn);
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public convertViewSelectionToModelSelection(viewSelection: editorCommon.ISelection): Selection {
		let selectionStart = this.convertViewPositionToModelPosition(viewSelection.selectionStartLineNumber, viewSelection.selectionStartColumn);
		let position = this.convertViewPositionToModelPosition(viewSelection.positionLineNumber, viewSelection.positionColumn);
		return new Selection(selectionStart.lineNumber, selectionStart.column, position.lineNumber, position.column);
	}

	// Model -> View conversion and related methods

	public getModelLineContent(modelLineNumber: number): string {
		return this.model.getLineContent(modelLineNumber);
	}

	public getModelLineMaxColumn(modelLineNumber: number): number {
		return this.model.getLineMaxColumn(modelLineNumber);
	}

	public validateModelPosition(position: editorCommon.IPosition): Position {
		return this.model.validatePosition(position);
	}

	public convertModelPositionToViewPosition(modelLineNumber: number, modelColumn: number): Position {
		return this.lines.convertModelPositionToViewPosition(modelLineNumber, modelColumn);
	}

	public convertModelRangeToViewRange(modelRange: Range): Range {
		var start = this.convertModelPositionToViewPosition(modelRange.startLineNumber, modelRange.startColumn);
		var end = this.convertModelPositionToViewPosition(modelRange.endLineNumber, modelRange.endColumn);
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public convertWholeLineModelRangeToViewRange(modelRange: Range): Range {
		var start = this.convertModelPositionToViewPosition(modelRange.startLineNumber, 1);
		var end = this.convertModelPositionToViewPosition(modelRange.endLineNumber, this.model.getLineMaxColumn(modelRange.endLineNumber));
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public modelPositionIsVisible(position: Position): boolean {
		return this.lines.modelPositionIsVisible(position.lineNumber, position.column);
	}

}