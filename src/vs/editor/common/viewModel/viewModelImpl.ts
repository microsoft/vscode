/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { EmitterEvent, IEventEmitter } from 'vs/base/common/eventEmitter';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { TokenizationRegistry, ColorId, LanguageId } from 'vs/editor/common/modes';
import { tokenizeLineToHTML } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { ViewModelCursors } from 'vs/editor/common/viewModel/viewModelCursors';
import { ViewModelDecorations } from 'vs/editor/common/viewModel/viewModelDecorations';
import { MinimapLinesRenderingData, ViewLineRenderingData, ViewModelDecoration, IViewModelListener, IViewModel, ICoordinatesConverter, ViewEventsCollector } from 'vs/editor/common/viewModel/viewModel';
import { SplitLinesCollection } from 'vs/editor/common/viewModel/splitLinesCollection';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import * as errors from 'vs/base/common/errors';
import { MinimapTokensColorTracker } from 'vs/editor/common/view/minimapCharRenderer';

export class CoordinatesConverter implements ICoordinatesConverter {

	private readonly _lines: SplitLinesCollection;

	constructor(lines: SplitLinesCollection) {
		this._lines = lines;
	}

	// View -> Model conversion and related methods

	public convertViewPositionToModelPosition(viewPosition: Position): Position {
		return this._lines.convertViewPositionToModelPosition(viewPosition.lineNumber, viewPosition.column);
	}

	public convertViewRangeToModelRange(viewRange: Range): Range {
		let start = this._lines.convertViewPositionToModelPosition(viewRange.startLineNumber, viewRange.startColumn);
		let end = this._lines.convertViewPositionToModelPosition(viewRange.endLineNumber, viewRange.endColumn);
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public convertViewSelectionToModelSelection(viewSelection: Selection): Selection {
		let selectionStart = this._lines.convertViewPositionToModelPosition(viewSelection.selectionStartLineNumber, viewSelection.selectionStartColumn);
		let position = this._lines.convertViewPositionToModelPosition(viewSelection.positionLineNumber, viewSelection.positionColumn);
		return new Selection(selectionStart.lineNumber, selectionStart.column, position.lineNumber, position.column);
	}

	public validateViewPosition(viewPosition: Position, expectedModelPosition: Position): Position {
		return this._lines.validateViewPosition(viewPosition.lineNumber, viewPosition.column, expectedModelPosition);
	}

	public validateViewRange(viewRange: Range, expectedModelRange: Range): Range {
		var validViewStart = this._lines.validateViewPosition(viewRange.startLineNumber, viewRange.startColumn, expectedModelRange.getStartPosition());
		var validViewEnd = this._lines.validateViewPosition(viewRange.endLineNumber, viewRange.endColumn, expectedModelRange.getEndPosition());
		return new Range(validViewStart.lineNumber, validViewStart.column, validViewEnd.lineNumber, validViewEnd.column);
	}

	// Model -> View conversion and related methods

	public convertModelPositionToViewPosition(modelPosition: Position): Position {
		return this._lines.convertModelPositionToViewPosition(modelPosition.lineNumber, modelPosition.column);
	}

	public convertModelRangeToViewRange(modelRange: Range): Range {
		let start = this._lines.convertModelPositionToViewPosition(modelRange.startLineNumber, modelRange.startColumn);
		let end = this._lines.convertModelPositionToViewPosition(modelRange.endLineNumber, modelRange.endColumn);
		return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
	}

	public convertModelSelectionToViewSelection(modelSelection: Selection): Selection {
		let selectionStart = this._lines.convertModelPositionToViewPosition(modelSelection.selectionStartLineNumber, modelSelection.selectionStartColumn);
		let position = this._lines.convertModelPositionToViewPosition(modelSelection.positionLineNumber, modelSelection.positionColumn);
		return new Selection(selectionStart.lineNumber, selectionStart.column, position.lineNumber, position.column);
	}

	public modelPositionIsVisible(modelPosition: Position): boolean {
		return this._lines.modelPositionIsVisible(modelPosition.lineNumber, modelPosition.column);
	}

}

export class ViewModel implements IViewModel {

	private readonly lines: SplitLinesCollection;
	private readonly editorId: number;
	private readonly configuration: editorCommon.IConfiguration;
	private readonly model: editorCommon.IModel;
	public readonly coordinatesConverter: ICoordinatesConverter;

	private listenersToRemove: IDisposable[];
	private _toDispose: IDisposable[];
	private readonly decorations: ViewModelDecorations;
	private readonly cursors: ViewModelCursors;

	private _renderCustomLineNumbers: (lineNumber: number) => string;
	private _renderRelativeLineNumbers: boolean;
	private _lastCursorPosition: Position;

	private _centeredViewLine: number;

	private _listeners: IViewModelListener[];

	constructor(lines: SplitLinesCollection, editorId: number, configuration: editorCommon.IConfiguration, model: editorCommon.IModel) {
		this.lines = lines;

		this.editorId = editorId;
		this.configuration = configuration;
		this.model = model;
		this.configuration.setMaxLineNumber(this.model.getLineCount());

		this.coordinatesConverter = new CoordinatesConverter(this.lines);

		this._lastCursorPosition = new Position(1, 1);
		this._renderCustomLineNumbers = this.configuration.editor.viewInfo.renderCustomLineNumbers;
		this._renderRelativeLineNumbers = this.configuration.editor.viewInfo.renderRelativeLineNumbers;

		this._centeredViewLine = -1;

		this.decorations = new ViewModelDecorations(this.editorId, this.model, this.configuration, this.coordinatesConverter);
		this.decorations.reset();

		this.cursors = new ViewModelCursors(this.configuration, this.coordinatesConverter);

		this.listenersToRemove = [];
		this._toDispose = [];
		this.listenersToRemove.push(this.model.addBulkListener((events: EmitterEvent[]) => this.onEvents(events)));
		this._toDispose.push(this.configuration.onDidChange((e) => {
			this.onEvents([new EmitterEvent(editorCommon.EventType.ConfigurationChanged, e)]);
		}));
		this._toDispose.push(MinimapTokensColorTracker.getInstance().onDidChange(() => {
			this._emit([new viewEvents.ViewTokensColorsChangedEvent()]);
		}));

		this._listeners = [];
	}

	public setHiddenAreas(ranges: editorCommon.IRange[]): void {
		let eventsCollector = new ViewEventsCollector();
		this._setHiddenAreas(eventsCollector, ranges);
		this._emit(eventsCollector.finalize());
	}

	private _setHiddenAreas(eventsCollector: ViewEventsCollector, ranges: editorCommon.IRange[]): void {
		let lineMappingChanged = this.lines.setHiddenAreas(eventsCollector, ranges);
		if (lineMappingChanged) {
			eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
			this.decorations.onLineMappingChanged(eventsCollector);
			this.cursors.onLineMappingChanged(eventsCollector);
		}
	}

	public dispose(): void {
		this.listenersToRemove = dispose(this.listenersToRemove);
		this._toDispose = dispose(this._toDispose);
		this.decorations.dispose();
		this.lines.dispose();
		this._listeners = [];
	}

	public addEventListener(listener: (events: viewEvents.ViewEvent[]) => void): IDisposable {
		this._listeners.push(listener);
		return {
			dispose: () => {
				let listeners = this._listeners;
				for (let i = 0, len = listeners.length; i < len; i++) {
					if (listeners[i] === listener) {
						listeners.splice(i, 1);
						break;
					}
				}
			}
		};
	}

	private _emit(events: viewEvents.ViewEvent[]): void {
		let listeners = this._listeners.slice(0);
		for (let i = 0, len = listeners.length; i < len; i++) {
			safeInvokeListener(listeners[i], events);
		}
	}

	private _onTabSizeChange(eventsCollector: ViewEventsCollector, newTabSize: number): boolean {
		var lineMappingChanged = this.lines.setTabSize(eventsCollector, newTabSize);
		if (lineMappingChanged) {
			eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
			this.decorations.onLineMappingChanged(eventsCollector);
			this.cursors.onLineMappingChanged(eventsCollector);
		}
		return lineMappingChanged;
	}

	private _onWrappingIndentChange(eventsCollector: ViewEventsCollector, newWrappingIndent: editorCommon.WrappingIndent): boolean {
		var lineMappingChanged = this.lines.setWrappingIndent(eventsCollector, newWrappingIndent);
		if (lineMappingChanged) {
			eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
			this.decorations.onLineMappingChanged(eventsCollector);
			this.cursors.onLineMappingChanged(eventsCollector);
		}
		return lineMappingChanged;
	}

	private _restoreCenteredModelRange(eventsCollector: ViewEventsCollector, range: Range): void {
		// modelLine -> viewLine
		var newCenteredViewRange = this.coordinatesConverter.convertModelRangeToViewRange(range);

		// Send a reveal event to restore the centered content
		eventsCollector.emit(new viewEvents.ViewRevealRangeRequestEvent(
			newCenteredViewRange,
			editorCommon.VerticalRevealType.Center,
			false,
			false
		));
	}

	private _onWrappingColumnChange(eventsCollector: ViewEventsCollector, newWrappingColumn: number, columnsForFullWidthChar: number): boolean {
		let lineMappingChanged = this.lines.setWrappingColumn(eventsCollector, newWrappingColumn, columnsForFullWidthChar);
		if (lineMappingChanged) {
			eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
			this.decorations.onLineMappingChanged(eventsCollector);
			this.cursors.onLineMappingChanged(eventsCollector);
		}
		return lineMappingChanged;
	}

	public addEventSource(eventSource: IEventEmitter): void {
		this.listenersToRemove.push(eventSource.addBulkListener2((events: EmitterEvent[]) => this.onEvents(events)));
	}

	private onEvents(events: EmitterEvent[]): void {
		let eventsCollector = new ViewEventsCollector();
		this._onEvents(eventsCollector, events);
		this._emit(eventsCollector.finalize());
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
			// Never got rendered or not rendered since last content change event
			return null;
		}
		let viewLineNumber = this._centeredViewLine;
		let currentCenteredViewRange = new Range(viewLineNumber, this.getLineMinColumn(viewLineNumber), viewLineNumber, this.getLineMaxColumn(viewLineNumber));
		return this.coordinatesConverter.convertViewRangeToModelRange(currentCenteredViewRange);
	}

	private _onEvents(eventsCollector: ViewEventsCollector, events: EmitterEvent[]): void {

		const containsModelContentChangeEvent = ViewModel._containsModelContentChangeEvent(events);
		if (containsModelContentChangeEvent) {
			this._centeredViewLine = -1;
			this.configuration.setMaxLineNumber(this.model.getLineCount());
		}

		// We might need to restore the current centered view range in the following circumstances:
		// All of these changes might lead to a new line mapping:
		// (a) model tabSize changed
		// (b) wrappingIndent changed
		// (c) wrappingColumn changed
		// (d) fontInfo changed
		// However, we cannot restore the current centered line if the model has changed its content
		// because we cannot convert the view range to a model range.

		let previousCenteredModelRange: Range = null;
		if (!containsModelContentChangeEvent && ViewModel._containsWrappingRelatedEvents(events)) {
			previousCenteredModelRange = this.getCenteredRangeInViewport();
		}

		let hadOtherModelChange = false;
		let hadModelLineChangeThatChangedLineMapping = false;
		let revealPreviousCenteredModelRange = false;

		for (let i = 0, len = events.length; i < len; i++) {
			let e = events[i];
			let data = e.getData();

			switch (e.getType()) {

				case editorCommon.EventType.ModelRawContentChanged:
					let modelContentChangedEvent = <editorCommon.IModelContentChangedEvent>data;

					switch (modelContentChangedEvent.changeType) {
						case editorCommon.EventType.ModelRawContentChangedFlush:
							this.onModelFlushed(eventsCollector, <editorCommon.IModelContentChangedFlushEvent>modelContentChangedEvent);
							hadOtherModelChange = true;
							break;

						case editorCommon.EventType.ModelRawContentChangedLinesDeleted:
							this.onModelLinesDeleted(eventsCollector, <editorCommon.IModelContentChangedLinesDeletedEvent>modelContentChangedEvent);
							hadOtherModelChange = true;
							break;

						case editorCommon.EventType.ModelRawContentChangedLinesInserted:
							this.onModelLinesInserted(eventsCollector, <editorCommon.IModelContentChangedLinesInsertedEvent>modelContentChangedEvent);
							hadOtherModelChange = true;
							break;

						case editorCommon.EventType.ModelRawContentChangedLineChanged:
							hadModelLineChangeThatChangedLineMapping = this.onModelLineChanged(eventsCollector, <editorCommon.IModelContentChangedLineChangedEvent>modelContentChangedEvent);
							break;

						default:
							console.info('ViewModel received unknown event: ');
							console.info(e);
					}
					break;

				case editorCommon.EventType.ModelTokensChanged:
					this.onModelTokensChanged(eventsCollector, <editorCommon.IModelTokensChangedEvent>data);
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
					let tabSizeChanged = this._onTabSizeChange(eventsCollector, this.model.getOptions().tabSize);
					let newLineCount = this.lines.getViewLineCount();
					if (tabSizeChanged && prevLineCount !== newLineCount) {
						revealPreviousCenteredModelRange = true;
					}

					break;

				case editorCommon.EventType.ModelDecorationsChanged:
					this.onModelDecorationsChanged(eventsCollector, <editorCommon.IModelDecorationsChangedEvent>data);
					break;

				case editorCommon.EventType.ModelDispose:
					// Ignore, since the editor will take care of this and destroy the view shortly
					break;

				case editorCommon.EventType.CursorPositionChanged:
					this.onCursorPositionChanged(eventsCollector, <editorCommon.ICursorPositionChangedEvent>data);
					this._lastCursorPosition = (<editorCommon.ICursorPositionChangedEvent>data).position;
					break;

				case editorCommon.EventType.CursorSelectionChanged:
					this.onCursorSelectionChanged(eventsCollector, <editorCommon.ICursorSelectionChangedEvent>data);
					break;

				case editorCommon.EventType.CursorRevealRange:
					this.onCursorRevealRange(eventsCollector, <editorCommon.ICursorRevealRangeEvent>data);
					break;

				case editorCommon.EventType.CursorScrollRequest:
					this.onCursorScrollRequest(eventsCollector, <editorCommon.ICursorScrollRequestEvent>data);
					break;

				case editorCommon.EventType.ConfigurationChanged:
					revealPreviousCenteredModelRange = this._onWrappingIndentChange(eventsCollector, this.configuration.editor.wrappingInfo.wrappingIndent) || revealPreviousCenteredModelRange;
					revealPreviousCenteredModelRange = this._onWrappingColumnChange(eventsCollector, this.configuration.editor.wrappingInfo.wrappingColumn, this.configuration.editor.fontInfo.typicalFullwidthCharacterWidth / this.configuration.editor.fontInfo.typicalHalfwidthCharacterWidth) || revealPreviousCenteredModelRange;

					this._renderCustomLineNumbers = this.configuration.editor.viewInfo.renderCustomLineNumbers;
					this._renderRelativeLineNumbers = this.configuration.editor.viewInfo.renderRelativeLineNumbers;

					if ((<editorCommon.IConfigurationChangedEvent>data).readOnly) {
						// Must read again all decorations due to readOnly filtering
						this.decorations.reset();
						eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
					}
					eventsCollector.emit(new viewEvents.ViewConfigurationChangedEvent(<editorCommon.IConfigurationChangedEvent>data));
					break;

				default:
					console.info('View received unknown event: ');
					console.info(e);
			}
		}

		if (!hadOtherModelChange && hadModelLineChangeThatChangedLineMapping) {
			eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
			this.decorations.onLineMappingChanged(eventsCollector);
			this.cursors.onLineMappingChanged(eventsCollector);
		}

		if (revealPreviousCenteredModelRange && previousCenteredModelRange) {
			this._restoreCenteredModelRange(eventsCollector, previousCenteredModelRange);
		}
	}

	// --- begin inbound event conversion
	private onModelFlushed(eventsCollector: ViewEventsCollector, e: editorCommon.IModelContentChangedFlushEvent): void {
		this.lines.onModelFlushed(eventsCollector, e.versionId);
		this.decorations.reset();
	}
	private onModelDecorationsChanged(eventsCollector: ViewEventsCollector, e: editorCommon.IModelDecorationsChangedEvent): void {
		this.decorations.onModelDecorationsChanged(eventsCollector, e);
	}
	private onModelLinesDeleted(eventsCollector: ViewEventsCollector, e: editorCommon.IModelContentChangedLinesDeletedEvent): void {
		this.lines.onModelLinesDeleted(eventsCollector, e.versionId, e.fromLineNumber, e.toLineNumber);
	}
	private onModelTokensChanged(eventsCollector: ViewEventsCollector, e: editorCommon.IModelTokensChangedEvent): void {
		let viewRanges: { fromLineNumber: number; toLineNumber: number; }[] = [];

		for (let i = 0, len = e.ranges.length; i < len; i++) {
			let modelRange = e.ranges[i];
			let viewStartLineNumber = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.fromLineNumber, 1)).lineNumber;
			let viewEndLineNumber = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.toLineNumber, this.model.getLineMaxColumn(modelRange.toLineNumber))).lineNumber;
			viewRanges[i] = {
				fromLineNumber: viewStartLineNumber,
				toLineNumber: viewEndLineNumber
			};
		}

		eventsCollector.emit(new viewEvents.ViewTokensChangedEvent(viewRanges));
	}
	private onModelLineChanged(eventsCollector: ViewEventsCollector, e: editorCommon.IModelContentChangedLineChangedEvent): boolean {
		var lineMappingChanged = this.lines.onModelLineChanged(eventsCollector, e.versionId, e.lineNumber, e.detail);
		return lineMappingChanged;
	}
	private onModelLinesInserted(eventsCollector: ViewEventsCollector, e: editorCommon.IModelContentChangedLinesInsertedEvent): void {
		this.lines.onModelLinesInserted(eventsCollector, e.versionId, e.fromLineNumber, e.toLineNumber, e.detail.split('\n'));
	}

	private onCursorPositionChanged(eventsCollector: ViewEventsCollector, e: editorCommon.ICursorPositionChangedEvent): void {
		this.cursors.onCursorPositionChanged(eventsCollector, e);
	}
	private onCursorSelectionChanged(eventsCollector: ViewEventsCollector, e: editorCommon.ICursorSelectionChangedEvent): void {
		this.cursors.onCursorSelectionChanged(eventsCollector, e);
	}
	private onCursorRevealRange(eventsCollector: ViewEventsCollector, e: editorCommon.ICursorRevealRangeEvent): void {
		// Ensure event has viewRange
		if (!e.viewRange) {
			e = {
				range: e.range,
				viewRange: this.coordinatesConverter.convertModelRangeToViewRange(e.range),
				verticalType: e.verticalType,
				revealHorizontal: e.revealHorizontal,
				revealCursor: e.revealCursor,
			};
		}
		this.cursors.onCursorRevealRange(eventsCollector, e);
	}
	private onCursorScrollRequest(eventsCollector: ViewEventsCollector, e: editorCommon.ICursorScrollRequestEvent): void {
		this.cursors.onCursorScrollRequest(eventsCollector, e);
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
		let modelPosition = this.coordinatesConverter.convertViewPositionToModelPosition(new Position(viewLineNumber, 1));
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

	public getDecorationsInViewport(visibleRange: Range): ViewModelDecoration[] {
		return this.decorations.getDecorationsViewportData(visibleRange).decorations;
	}

	public getViewLineRenderingData(visibleRange: Range, lineNumber: number): ViewLineRenderingData {
		let mightContainRTL = this.model.mightContainRTL();
		let mightContainNonBasicASCII = this.model.mightContainNonBasicASCII();
		let tabSize = this.getTabSize();
		let lineData = this.lines.getViewLineData(lineNumber);
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

	public getMinimapLinesRenderingData(startLineNumber: number, endLineNumber: number, needed: boolean[]): MinimapLinesRenderingData {
		let result = this.lines.getViewLinesData(startLineNumber, endLineNumber, needed);
		return new MinimapLinesRenderingData(
			this.getTabSize(),
			result
		);
	}

	public getAllOverviewRulerDecorations(): ViewModelDecoration[] {
		return this.decorations.getAllOverviewRulerDecorations();
	}

	public getEOL(): string {
		return this.model.getEOL();
	}

	public getValueInRange(range: Range, eol: editorCommon.EndOfLinePreference): string {
		var modelRange = this.coordinatesConverter.convertViewRangeToModelRange(range);
		return this.model.getValueInRange(modelRange, eol);
	}

	public getModelLineContent(modelLineNumber: number): string {
		return this.model.getLineContent(modelLineNumber);
	}

	public getModelLineMaxColumn(modelLineNumber: number): number {
		return this.model.getLineMaxColumn(modelLineNumber);
	}

	public validateModelPosition(position: editorCommon.IPosition): Position {
		return this.model.validatePosition(position);
	}

	public getPlainTextToCopy(ranges: Range[], enableEmptySelectionClipboard: boolean): string {
		let newLineCharacter = this.getEOL();

		if (ranges.length === 1) {
			let range: Range = ranges[0];
			if (range.isEmpty()) {
				if (enableEmptySelectionClipboard) {
					let modelLineNumber = this.coordinatesConverter.convertViewPositionToModelPosition(new Position(range.startLineNumber, 1)).lineNumber;
					return this.getModelLineContent(modelLineNumber) + newLineCharacter;
				} else {
					return '';
				}
			}

			return this.getValueInRange(range, editorCommon.EndOfLinePreference.TextDefined);
		} else {
			ranges = ranges.slice(0).sort(Range.compareRangesUsingStarts);
			let result: string[] = [];
			for (let i = 0; i < ranges.length; i++) {
				result.push(this.getValueInRange(ranges[i], editorCommon.EndOfLinePreference.TextDefined));
			}

			return result.join(newLineCharacter);
		}
	}

	public getHTMLToCopy(viewRanges: Range[], enableEmptySelectionClipboard: boolean): string {
		if (this.model.getLanguageIdentifier().id === LanguageId.PlainText) {
			return null;
		}

		if (viewRanges.length !== 1) {
			// no multiple selection support at this time
			return null;
		}

		let range = this.coordinatesConverter.convertViewRangeToModelRange(viewRanges[0]);
		if (range.isEmpty()) {
			if (!enableEmptySelectionClipboard) {
				// nothing to copy
				return null;
			}
			let lineNumber = range.startLineNumber;
			range = new Range(lineNumber, this.model.getLineMinColumn(lineNumber), lineNumber, this.model.getLineMaxColumn(lineNumber));
		}

		const fontInfo = this.configuration.editor.fontInfo;
		const colorMap = this._getColorMap();

		return (
			`<div style="`
			+ `color: ${colorMap[ColorId.DefaultForeground]};`
			+ `background-color: ${colorMap[ColorId.DefaultBackground]};`
			+ `font-family: ${fontInfo.fontFamily};`
			+ `font-weight: ${fontInfo.fontWeight};`
			+ `font-size: ${fontInfo.fontSize}px;`
			+ `line-height: ${fontInfo.lineHeight}px;`
			+ `white-space: pre;`
			+ `">`
			+ this._getHTMLToCopy(range, colorMap)
			+ '</div>'
		);
	}

	private _getHTMLToCopy(modelRange: Range, colorMap: string[]): string {
		const startLineNumber = modelRange.startLineNumber;
		const startColumn = modelRange.startColumn;
		const endLineNumber = modelRange.endLineNumber;
		const endColumn = modelRange.endColumn;

		const tabSize = this.getTabSize();

		let result = '';

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			const lineTokens = this.model.getLineTokens(lineNumber);
			const lineContent = lineTokens.getLineContent();
			const startOffset = (lineNumber === startLineNumber ? startColumn - 1 : 0);
			const endOffset = (lineNumber === endLineNumber ? endColumn - 1 : lineContent.length);

			if (lineContent === '') {
				result += '<br>';
			} else {
				result += tokenizeLineToHTML(lineContent, lineTokens.inflate(), colorMap, startOffset, endOffset, tabSize);
			}
		}

		return result;
	}

	private _getColorMap(): string[] {
		let colorMap = TokenizationRegistry.getColorMap();
		let result: string[] = [null];
		for (let i = 1, len = colorMap.length; i < len; i++) {
			result[i] = colorMap[i].toRGBHex();
		}
		return result;
	}
}

function safeInvokeListener(listener: IViewModelListener, events: viewEvents.ViewEvent[]): void {
	try {
		listener(events);
	} catch (e) {
		errors.onUnexpectedError(e);
	}
}
