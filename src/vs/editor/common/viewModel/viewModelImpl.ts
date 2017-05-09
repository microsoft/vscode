/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { EmitterEvent } from 'vs/base/common/eventEmitter';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { Position, IPosition } from 'vs/editor/common/core/position';
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
import * as textModelEvents from 'vs/editor/common/model/textModelEvents';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import { CursorEventType, ICursorPositionChangedEvent, VerticalRevealType, ICursorSelectionChangedEvent, ICursorRevealRangeEvent, CursorScrollRequest } from 'vs/editor/common/controller/cursorEvents';
import { Cursor } from 'vs/editor/common/controller/cursor';
import { CharacterHardWrappingLineMapperFactory } from "vs/editor/common/viewModel/characterHardWrappingLineMapper";
import { ViewLayout } from 'vs/editor/common/viewLayout/viewLayout';

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

export class ViewModel extends Disposable implements IViewModel {

	private readonly editorId: number;
	private readonly configuration: editorCommon.IConfiguration;
	private readonly model: editorCommon.IModel;
	private readonly lines: SplitLinesCollection;
	public readonly coordinatesConverter: ICoordinatesConverter;
	public readonly viewLayout: ViewLayout;

	private readonly decorations: ViewModelDecorations;
	private readonly cursors: ViewModelCursors;

	private _isDisposing: boolean;
	private _centeredViewLine: number;
	private _listeners: IViewModelListener[];

	constructor(editorId: number, configuration: editorCommon.IConfiguration, model: editorCommon.IModel) {
		super();

		this.editorId = editorId;
		this.configuration = configuration;
		this.model = model;

		const conf = this.configuration.editor;

		let hardWrappingLineMapperFactory = new CharacterHardWrappingLineMapperFactory(
			conf.wrappingInfo.wordWrapBreakBeforeCharacters,
			conf.wrappingInfo.wordWrapBreakAfterCharacters,
			conf.wrappingInfo.wordWrapBreakObtrusiveCharacters
		);

		this.lines = new SplitLinesCollection(
			this.model,
			hardWrappingLineMapperFactory,
			this.model.getOptions().tabSize,
			conf.wrappingInfo.wrappingColumn,
			conf.fontInfo.typicalFullwidthCharacterWidth / conf.fontInfo.typicalHalfwidthCharacterWidth,
			conf.wrappingInfo.wrappingIndent
		);

		this.configuration.setMaxLineNumber(this.model.getLineCount());

		this.coordinatesConverter = new CoordinatesConverter(this.lines);

		this.viewLayout = this._register(new ViewLayout(this.configuration, this.getLineCount()));

		this._register(this.viewLayout.onDidScroll((e) => {
			this._emit([new viewEvents.ViewScrollChangedEvent(e)]);
		}));

		this._isDisposing = false;
		this._centeredViewLine = -1;
		this._listeners = [];

		this.decorations = new ViewModelDecorations(this.editorId, this.model, this.configuration, this.coordinatesConverter);

		this.cursors = new ViewModelCursors(this.configuration, this.coordinatesConverter);

		this._register(this.model.addBulkListener((events: EmitterEvent[]) => {
			if (this._isDisposing) {
				// Disposing the lines might end up sending model decoration changed events
				// ...we no longer care about them...
				return;
			}
			let eventsCollector = new ViewEventsCollector();
			this._onModelEvents(eventsCollector, events);
			this._emit(eventsCollector.finalize());
		}));

		this._register(this.configuration.onDidChange((e) => {
			const eventsCollector = new ViewEventsCollector();
			this._onConfigurationChanged(eventsCollector, e);
			this._emit(eventsCollector.finalize());
		}));

		this._register(MinimapTokensColorTracker.getInstance().onDidChange(() => {
			this._emit([new viewEvents.ViewTokensColorsChangedEvent()]);
		}));
	}

	public dispose(): void {
		this._isDisposing = true;
		this.decorations.dispose();
		this.lines.dispose();
		this._listeners = [];
		super.dispose();
	}

	private _emit(events: viewEvents.ViewEvent[]): void {
		const listeners = this._listeners.slice(0);
		for (let i = 0, len = listeners.length; i < len; i++) {
			safeInvokeListener(listeners[i], events);
		}
	}

	public addEventSource(cursor: Cursor): void {
		this._register(cursor.addBulkListener((events: EmitterEvent[]) => {
			const eventsCollector = new ViewEventsCollector();
			this._onCursorEvents(eventsCollector, events);
			this._emit(eventsCollector.finalize());
		}));
	}

	private _onCursorEvents(eventsCollector: ViewEventsCollector, events: EmitterEvent[]): void {
		for (let i = 0, len = events.length; i < len; i++) {
			const _e = events[i];
			const type = _e.type;
			const data = _e.data;

			switch (type) {
				case CursorEventType.CursorPositionChanged: {
					const e = <ICursorPositionChangedEvent>data;
					this.cursors.onCursorPositionChanged(eventsCollector, e);
					break;
				}
				case CursorEventType.CursorSelectionChanged: {
					const e = <ICursorSelectionChangedEvent>data;
					this.cursors.onCursorSelectionChanged(eventsCollector, e);
					break;
				}
				case CursorEventType.CursorRevealRange: {
					const e = <ICursorRevealRangeEvent>data;
					this.cursors.onCursorRevealRange(eventsCollector, e);
					break;
				}
				case CursorEventType.CursorScrollRequest: {
					const e = <CursorScrollRequest>data;
					this.viewLayout.setScrollPosition({
						scrollTop: e.desiredScrollTop
					});
					break;
				}
				default:
					console.info('View received unknown event: ');
					console.info(type, data);
			}
		}
	}

	private _onConfigurationChanged(eventsCollector: ViewEventsCollector, e: IConfigurationChangedEvent): void {

		// We might need to restore the current centered view range, so save it (if available)
		const previousCenteredModelRange = this.getCenteredRangeInViewport();
		let revealPreviousCenteredModelRange = false;

		const conf = this.configuration.editor;

		if (this.lines.setWrappingSettings(conf.wrappingInfo.wrappingIndent, conf.wrappingInfo.wrappingColumn, conf.fontInfo.typicalFullwidthCharacterWidth / conf.fontInfo.typicalHalfwidthCharacterWidth)) {
			eventsCollector.emit(new viewEvents.ViewFlushedEvent());
			eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
			this.decorations.onLineMappingChanged(eventsCollector);
			this.cursors.onLineMappingChanged(eventsCollector);
			this.viewLayout.onFlushed(this.getLineCount());
			revealPreviousCenteredModelRange = true;
		}

		if (e.readOnly) {
			// Must read again all decorations due to readOnly filtering
			this.decorations.reset();
			eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
		}

		eventsCollector.emit(new viewEvents.ViewConfigurationChangedEvent(e));
		this.viewLayout.onConfigurationChanged(e);

		if (revealPreviousCenteredModelRange && previousCenteredModelRange) {
			// modelLine -> viewLine
			const newCenteredViewRange = this.coordinatesConverter.convertModelRangeToViewRange(previousCenteredModelRange);

			// Send a reveal event to restore the centered content
			eventsCollector.emit(new viewEvents.ViewRevealRangeRequestEvent(
				newCenteredViewRange,
				VerticalRevealType.Center,
				false
			));
		}
	}

	private _onModelEvents(eventsCollector: ViewEventsCollector, events: EmitterEvent[]): void {

		// A quick check if there are model content change events incoming
		// in order to update the configuration and reset the centered view line
		for (let i = 0, len = events.length; i < len; i++) {
			const eventType = events[i].type;
			if (eventType === textModelEvents.TextModelEventType.ModelRawContentChanged2) {
				// There is a content change event
				this._centeredViewLine = -1;
				this.configuration.setMaxLineNumber(this.model.getLineCount());

				break;
			}
		}

		let hadOtherModelChange = false;
		let hadModelLineChangeThatChangedLineMapping = false;

		for (let i = 0, len = events.length; i < len; i++) {
			const _e = events[i];
			const type = _e.type;
			const data = _e.data;

			switch (type) {

				case textModelEvents.TextModelEventType.ModelRawContentChanged2: {
					const e = <textModelEvents.ModelRawContentChangedEvent>data;
					const changes = e.changes;
					const versionId = e.versionId;

					for (let j = 0, lenJ = changes.length; j < lenJ; j++) {
						const change = changes[j];

						switch (change.changeType) {
							case textModelEvents.RawContentChangedType.Flush: {
								this.lines.onModelFlushed();
								eventsCollector.emit(new viewEvents.ViewFlushedEvent());
								this.decorations.reset();
								this.viewLayout.onFlushed(this.getLineCount());
								hadOtherModelChange = true;
								break;
							}
							case textModelEvents.RawContentChangedType.LinesDeleted: {
								const linesDeletedEvent = this.lines.onModelLinesDeleted(versionId, change.fromLineNumber, change.toLineNumber);
								if (linesDeletedEvent !== null) {
									eventsCollector.emit(linesDeletedEvent);
									this.viewLayout.onLinesDeleted(linesDeletedEvent.fromLineNumber, linesDeletedEvent.toLineNumber);
								}
								hadOtherModelChange = true;
								break;
							}
							case textModelEvents.RawContentChangedType.LinesInserted: {
								const linesInsertedEvent = this.lines.onModelLinesInserted(versionId, change.fromLineNumber, change.toLineNumber, change.detail.split('\n'));
								if (linesInsertedEvent !== null) {
									eventsCollector.emit(linesInsertedEvent);
									this.viewLayout.onLinesInserted(linesInsertedEvent.fromLineNumber, linesInsertedEvent.toLineNumber);
								}
								hadOtherModelChange = true;
								break;
							}
							case textModelEvents.RawContentChangedType.LineChanged: {
								const [lineMappingChanged, linesChangedEvent, linesInsertedEvent, linesDeletedEvent] = this.lines.onModelLineChanged(versionId, change.lineNumber, change.detail);
								hadModelLineChangeThatChangedLineMapping = lineMappingChanged;
								if (linesChangedEvent) {
									eventsCollector.emit(linesChangedEvent);
								}
								if (linesInsertedEvent) {
									eventsCollector.emit(linesInsertedEvent);
									this.viewLayout.onLinesInserted(linesInsertedEvent.fromLineNumber, linesInsertedEvent.toLineNumber);
								}
								if (linesDeletedEvent) {
									eventsCollector.emit(linesDeletedEvent);
									this.viewLayout.onLinesDeleted(linesDeletedEvent.fromLineNumber, linesDeletedEvent.toLineNumber);
								}
								break;
							}
						}
					}
					this.lines.acceptVersionId(versionId);

					break;
				}
				case textModelEvents.TextModelEventType.ModelTokensChanged: {
					const e = <textModelEvents.IModelTokensChangedEvent>data;

					let viewRanges: { fromLineNumber: number; toLineNumber: number; }[] = [];
					for (let j = 0, lenJ = e.ranges.length; j < lenJ; j++) {
						const modelRange = e.ranges[j];
						const viewStartLineNumber = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.fromLineNumber, 1)).lineNumber;
						const viewEndLineNumber = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.toLineNumber, this.model.getLineMaxColumn(modelRange.toLineNumber))).lineNumber;
						viewRanges[j] = {
							fromLineNumber: viewStartLineNumber,
							toLineNumber: viewEndLineNumber
						};
					}
					eventsCollector.emit(new viewEvents.ViewTokensChangedEvent(viewRanges));
					break;
				}
				case textModelEvents.TextModelEventType.ModelLanguageChanged: {
					// That's ok, a model tokens changed event will follow shortly
					break;
				}
				case textModelEvents.TextModelEventType.ModelContentChanged: {
					// Ignore
					break;
				}
				case textModelEvents.TextModelEventType.ModelOptionsChanged: {
					// A tab size change causes a line mapping changed event => all view parts will repaint OK, no further event needed here
					if (this.lines.setTabSize(this.model.getOptions().tabSize)) {
						eventsCollector.emit(new viewEvents.ViewFlushedEvent());
						eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
						this.decorations.onLineMappingChanged(eventsCollector);
						this.cursors.onLineMappingChanged(eventsCollector);
						this.viewLayout.onFlushed(this.getLineCount());
					}

					break;
				}
				case textModelEvents.TextModelEventType.ModelDecorationsChanged: {
					const e = <textModelEvents.IModelDecorationsChangedEvent>data;
					this.decorations.onModelDecorationsChanged(eventsCollector, e);
					break;
				}
				case textModelEvents.TextModelEventType.ModelDispose: {
					// Ignore, since the editor will take care of this and destroy the view shortly
					break;
				}
				default:
					console.info('View received unknown event: ');
					console.info(type, data);
			}
		}

		if (!hadOtherModelChange && hadModelLineChangeThatChangedLineMapping) {
			eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
			this.decorations.onLineMappingChanged(eventsCollector);
			this.cursors.onLineMappingChanged(eventsCollector);
		}
	}

	public setHiddenAreas(ranges: Range[]): void {
		let eventsCollector = new ViewEventsCollector();
		let lineMappingChanged = this.lines.setHiddenAreas(ranges);
		if (lineMappingChanged) {
			eventsCollector.emit(new viewEvents.ViewFlushedEvent());
			eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
			this.decorations.onLineMappingChanged(eventsCollector);
			this.cursors.onLineMappingChanged(eventsCollector);
			this.viewLayout.onFlushed(this.getLineCount());
		}
		this._emit(eventsCollector.finalize());
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

	public getCenteredRangeInViewport(): Range {
		if (this._centeredViewLine === -1) {
			// Never got rendered or not rendered since last content change event
			return null;
		}
		let viewLineNumber = this._centeredViewLine;
		let currentCenteredViewRange = new Range(viewLineNumber, this.getLineMinColumn(viewLineNumber), viewLineNumber, this.getLineMaxColumn(viewLineNumber));
		return this.coordinatesConverter.convertViewRangeToModelRange(currentCenteredViewRange);
	}

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

	public getValueInRange(range: Range, eol: editorCommon.EndOfLinePreference): string {
		var modelRange = this.coordinatesConverter.convertViewRangeToModelRange(range);
		return this.model.getValueInRange(modelRange, eol);
	}

	public getModelLineMaxColumn(modelLineNumber: number): number {
		return this.model.getLineMaxColumn(modelLineNumber);
	}

	public validateModelPosition(position: IPosition): Position {
		return this.model.validatePosition(position);
	}

	public getPlainTextToCopy(ranges: Range[], enableEmptySelectionClipboard: boolean): string {
		let newLineCharacter = this.model.getEOL();

		if (ranges.length === 1) {
			let range: Range = ranges[0];
			if (range.isEmpty()) {
				if (enableEmptySelectionClipboard) {
					let modelLineNumber = this.coordinatesConverter.convertViewPositionToModelPosition(new Position(range.startLineNumber, 1)).lineNumber;
					return this.model.getLineContent(modelLineNumber) + newLineCharacter;
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
