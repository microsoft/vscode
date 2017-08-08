/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { EmitterEvent } from 'vs/base/common/eventEmitter';
import * as strings from 'vs/base/common/strings';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { TokenizationRegistry, ColorId, LanguageId } from 'vs/editor/common/modes';
import { tokenizeLineToHTML } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { ViewModelDecorations } from 'vs/editor/common/viewModel/viewModelDecorations';
import { MinimapLinesRenderingData, ViewLineRenderingData, ViewModelDecoration, IViewModel, ICoordinatesConverter, ViewEventsCollector } from 'vs/editor/common/viewModel/viewModel';
import { SplitLinesCollection, IViewModelLinesCollection, IdentityLinesCollection } from 'vs/editor/common/viewModel/splitLinesCollection';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { MinimapTokensColorTracker } from 'vs/editor/common/view/minimapCharRenderer';
import * as textModelEvents from 'vs/editor/common/model/textModelEvents';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import { CharacterHardWrappingLineMapperFactory } from 'vs/editor/common/viewModel/characterHardWrappingLineMapper';
import { ViewLayout } from 'vs/editor/common/viewLayout/viewLayout';
import { Color } from 'vs/base/common/color';

const USE_IDENTITY_LINES_COLLECTION = true;

export class ViewModel extends viewEvents.ViewEventEmitter implements IViewModel {

	private readonly editorId: number;
	private readonly configuration: editorCommon.IConfiguration;
	private readonly model: editorCommon.IModel;
	private readonly lines: IViewModelLinesCollection;
	public readonly coordinatesConverter: ICoordinatesConverter;
	public readonly viewLayout: ViewLayout;

	private readonly decorations: ViewModelDecorations;

	private _isDisposing: boolean;
	private _centeredViewLine: number;

	constructor(editorId: number, configuration: editorCommon.IConfiguration, model: editorCommon.IModel) {
		super();

		this.editorId = editorId;
		this.configuration = configuration;
		this.model = model;

		if (USE_IDENTITY_LINES_COLLECTION && this.model.isTooLargeForTokenization()) {

			this.lines = new IdentityLinesCollection(this.model);

		} else {
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
		}

		this.coordinatesConverter = this.lines.createCoordinatesConverter();

		this.viewLayout = this._register(new ViewLayout(this.configuration, this.getLineCount()));

		this._register(this.viewLayout.onDidScroll((e) => {
			this._emit([new viewEvents.ViewScrollChangedEvent(e)]);
		}));

		this._isDisposing = false;
		this._centeredViewLine = -1;

		this.decorations = new ViewModelDecorations(this.editorId, this.model, this.configuration, this.coordinatesConverter);

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
		super.dispose();
	}

	private _onConfigurationChanged(eventsCollector: ViewEventsCollector, e: IConfigurationChangedEvent): void {

		// We might need to restore the current centered view range, so save it (if available)
		const previousCenteredModelRange = this.getCenteredRangeInViewport();
		let revealPreviousCenteredModelRange = false;

		const conf = this.configuration.editor;

		if (this.lines.setWrappingSettings(conf.wrappingInfo.wrappingIndent, conf.wrappingInfo.wrappingColumn, conf.fontInfo.typicalFullwidthCharacterWidth / conf.fontInfo.typicalHalfwidthCharacterWidth)) {
			eventsCollector.emit(new viewEvents.ViewFlushedEvent());
			eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
			eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
			this.decorations.onLineMappingChanged();
			this.viewLayout.onFlushed(this.getLineCount());

			if (this.viewLayout.getScrollTop() !== 0) {
				// Never change the scroll position from 0 to something else...
				revealPreviousCenteredModelRange = true;
			}
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
				viewEvents.VerticalRevealType.Center,
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
							case textModelEvents.RawContentChangedType.EOLChanged: {
								// Nothing to do. The new version will be accepted below
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
						eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
						this.decorations.onLineMappingChanged();
						this.viewLayout.onFlushed(this.getLineCount());
					}

					break;
				}
				case textModelEvents.TextModelEventType.ModelDecorationsChanged: {
					const e = <textModelEvents.IModelDecorationsChangedEvent>data;
					this.decorations.onModelDecorationsChanged(e);
					eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
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
			eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
			this.decorations.onLineMappingChanged();
		}
	}

	public setHiddenAreas(ranges: Range[]): void {
		let eventsCollector = new ViewEventsCollector();
		let lineMappingChanged = this.lines.setHiddenAreas(ranges);
		if (lineMappingChanged) {
			eventsCollector.emit(new viewEvents.ViewFlushedEvent());
			eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
			eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
			this.decorations.onLineMappingChanged();
			this.viewLayout.onFlushed(this.getLineCount());
		}
		this._emit(eventsCollector.finalize());
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

	public getCompletelyVisibleViewRange(): Range {
		const partialData = this.viewLayout.getLinesViewportData();
		const startViewLineNumber = partialData.completelyVisibleStartLineNumber;
		const endViewLineNumber = partialData.completelyVisibleEndLineNumber;

		return new Range(
			startViewLineNumber, this.getLineMinColumn(startViewLineNumber),
			endViewLineNumber, this.getLineMaxColumn(endViewLineNumber)
		);
	}

	public getCompletelyVisibleViewRangeAtScrollTop(scrollTop: number): Range {
		const partialData = this.viewLayout.getLinesViewportDataAtScrollTop(scrollTop);
		const startViewLineNumber = partialData.completelyVisibleStartLineNumber;
		const endViewLineNumber = partialData.completelyVisibleEndLineNumber;

		return new Range(
			startViewLineNumber, this.getLineMinColumn(startViewLineNumber),
			endViewLineNumber, this.getLineMaxColumn(endViewLineNumber)
		);
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

	public getPlainTextToCopy(ranges: Range[], emptySelectionClipboard: boolean): string {
		let newLineCharacter = this.model.getEOL();

		if (ranges.length === 1) {
			let range: Range = ranges[0];
			if (range.isEmpty()) {
				if (emptySelectionClipboard) {
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

	public getHTMLToCopy(viewRanges: Range[], emptySelectionClipboard: boolean): string {
		if (this.model.getLanguageIdentifier().id === LanguageId.PlainText) {
			return null;
		}

		if (viewRanges.length !== 1) {
			// no multiple selection support at this time
			return null;
		}

		let range = this.coordinatesConverter.convertViewRangeToModelRange(viewRanges[0]);
		if (range.isEmpty()) {
			if (!emptySelectionClipboard) {
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
			result[i] = Color.Format.CSS.formatHex(colorMap[i]);
		}
		return result;
	}
}
