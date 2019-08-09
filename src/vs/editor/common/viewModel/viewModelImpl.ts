/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from 'vs/base/common/color';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as strings from 'vs/base/common/strings';
import { IConfigurationChangedEvent, EDITOR_FONT_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { EndOfLinePreference, IActiveIndentGuideInfo, ITextModel, TrackedRangeStickiness, TextModelResolvedOptions } from 'vs/editor/common/model';
import { ModelDecorationOverviewRulerOptions, ModelDecorationMinimapOptions } from 'vs/editor/common/model/textModel';
import * as textModelEvents from 'vs/editor/common/model/textModelEvents';
import { ColorId, LanguageId, TokenizationRegistry } from 'vs/editor/common/modes';
import { tokenizeLineToHTML } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { MinimapTokensColorTracker } from 'vs/editor/common/view/minimapCharRenderer';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { ViewLayout } from 'vs/editor/common/viewLayout/viewLayout';
import { CharacterHardWrappingLineMapperFactory } from 'vs/editor/common/viewModel/characterHardWrappingLineMapper';
import { IViewModelLinesCollection, IdentityLinesCollection, SplitLinesCollection } from 'vs/editor/common/viewModel/splitLinesCollection';
import { ICoordinatesConverter, IOverviewRulerDecorations, IViewModel, MinimapLinesRenderingData, ViewLineData, ViewLineRenderingData, ViewModelDecoration } from 'vs/editor/common/viewModel/viewModel';
import { ViewModelDecorations } from 'vs/editor/common/viewModel/viewModelDecorations';
import { ITheme } from 'vs/platform/theme/common/themeService';
import { RunOnceScheduler } from 'vs/base/common/async';

const USE_IDENTITY_LINES_COLLECTION = true;

export class ViewModel extends viewEvents.ViewEventEmitter implements IViewModel {

	private readonly editorId: number;
	private readonly configuration: editorCommon.IConfiguration;
	private readonly model: ITextModel;
	private readonly _tokenizeViewportSoon: RunOnceScheduler;
	private hasFocus: boolean;
	private viewportStartLine: number;
	private viewportStartLineTrackedRange: string | null;
	private viewportStartLineDelta: number;
	private readonly lines: IViewModelLinesCollection;
	public readonly coordinatesConverter: ICoordinatesConverter;
	public readonly viewLayout: ViewLayout;
	private readonly decorations: ViewModelDecorations;

	constructor(editorId: number, configuration: editorCommon.IConfiguration, model: ITextModel, scheduleAtNextAnimationFrame: (callback: () => void) => IDisposable) {
		super();

		this.editorId = editorId;
		this.configuration = configuration;
		this.model = model;
		this._tokenizeViewportSoon = this._register(new RunOnceScheduler(() => this.tokenizeViewport(), 50));
		this.hasFocus = false;
		this.viewportStartLine = -1;
		this.viewportStartLineTrackedRange = null;
		this.viewportStartLineDelta = 0;

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

		this.viewLayout = this._register(new ViewLayout(this.configuration, this.getLineCount(), scheduleAtNextAnimationFrame));

		this._register(this.viewLayout.onDidScroll((e) => {
			if (e.scrollTopChanged) {
				this._tokenizeViewportSoon.schedule();
			}
			try {
				const eventsCollector = this._beginEmit();
				eventsCollector.emit(new viewEvents.ViewScrollChangedEvent(e));
			} finally {
				this._endEmit();
			}
		}));

		this.decorations = new ViewModelDecorations(this.editorId, this.model, this.configuration, this.lines, this.coordinatesConverter);

		this._registerModelEvents();

		this._register(this.configuration.onDidChange((e) => {
			try {
				const eventsCollector = this._beginEmit();
				this._onConfigurationChanged(eventsCollector, e);
			} finally {
				this._endEmit();
			}
		}));

		this._register(MinimapTokensColorTracker.getInstance().onDidChange(() => {
			try {
				const eventsCollector = this._beginEmit();
				eventsCollector.emit(new viewEvents.ViewTokensColorsChangedEvent());
			} finally {
				this._endEmit();
			}
		}));
	}

	public dispose(): void {
		// First remove listeners, as disposing the lines might end up sending
		// model decoration changed events ... and we no longer care about them ...
		super.dispose();
		this.decorations.dispose();
		this.lines.dispose();
		this.viewportStartLineTrackedRange = this.model._setTrackedRange(this.viewportStartLineTrackedRange, null, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
	}

	public tokenizeViewport(): void {
		const linesViewportData = this.viewLayout.getLinesViewportData();
		const startPosition = this.coordinatesConverter.convertViewPositionToModelPosition(new Position(linesViewportData.startLineNumber, 1));
		const endPosition = this.coordinatesConverter.convertViewPositionToModelPosition(new Position(linesViewportData.endLineNumber, 1));
		this.model.tokenizeViewport(startPosition.lineNumber, endPosition.lineNumber);
	}

	public setHasFocus(hasFocus: boolean): void {
		this.hasFocus = hasFocus;
	}

	private _onConfigurationChanged(eventsCollector: viewEvents.ViewEventsCollector, e: IConfigurationChangedEvent): void {

		// We might need to restore the current centered view range, so save it (if available)
		let previousViewportStartModelPosition: Position | null = null;
		if (this.viewportStartLine !== -1) {
			let previousViewportStartViewPosition = new Position(this.viewportStartLine, this.getLineMinColumn(this.viewportStartLine));
			previousViewportStartModelPosition = this.coordinatesConverter.convertViewPositionToModelPosition(previousViewportStartViewPosition);
		}
		let restorePreviousViewportStart = false;

		const conf = this.configuration.editor;

		if (this.lines.setWrappingSettings(conf.wrappingInfo.wrappingIndent, conf.wrappingInfo.wrappingColumn, conf.fontInfo.typicalFullwidthCharacterWidth / conf.fontInfo.typicalHalfwidthCharacterWidth)) {
			eventsCollector.emit(new viewEvents.ViewFlushedEvent());
			eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
			eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
			this.decorations.onLineMappingChanged();
			this.viewLayout.onFlushed(this.getLineCount());

			if (this.viewLayout.getCurrentScrollTop() !== 0) {
				// Never change the scroll position from 0 to something else...
				restorePreviousViewportStart = true;
			}
		}

		if (e.readOnly) {
			// Must read again all decorations due to readOnly filtering
			this.decorations.reset();
			eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
		}

		eventsCollector.emit(new viewEvents.ViewConfigurationChangedEvent(e));
		this.viewLayout.onConfigurationChanged(e);

		if (restorePreviousViewportStart && previousViewportStartModelPosition) {
			const viewPosition = this.coordinatesConverter.convertModelPositionToViewPosition(previousViewportStartModelPosition);
			const viewPositionTop = this.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
			this.viewLayout.setScrollPositionNow({ scrollTop: viewPositionTop + this.viewportStartLineDelta });
		}
	}

	private _registerModelEvents(): void {

		this._register(this.model.onDidChangeRawContentFast((e) => {
			try {
				const eventsCollector = this._beginEmit();

				let hadOtherModelChange = false;
				let hadModelLineChangeThatChangedLineMapping = false;

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
							const linesInsertedEvent = this.lines.onModelLinesInserted(versionId, change.fromLineNumber, change.toLineNumber, change.detail);
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
				this.viewLayout.onHeightMaybeChanged();

				if (!hadOtherModelChange && hadModelLineChangeThatChangedLineMapping) {
					eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
					eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
					this.decorations.onLineMappingChanged();
				}
			} finally {
				this._endEmit();
			}

			// Update the configuration and reset the centered view line
			this.viewportStartLine = -1;
			this.configuration.setMaxLineNumber(this.model.getLineCount());

			// Recover viewport
			if (!this.hasFocus && this.model.getAttachedEditorCount() >= 2 && this.viewportStartLineTrackedRange) {
				const modelRange = this.model._getTrackedRange(this.viewportStartLineTrackedRange);
				if (modelRange) {
					const viewPosition = this.coordinatesConverter.convertModelPositionToViewPosition(modelRange.getStartPosition());
					const viewPositionTop = this.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
					this.viewLayout.setScrollPositionNow({ scrollTop: viewPositionTop + this.viewportStartLineDelta });
				}
			}
		}));

		this._register(this.model.onDidChangeTokens((e) => {
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
			try {
				const eventsCollector = this._beginEmit();
				eventsCollector.emit(new viewEvents.ViewTokensChangedEvent(viewRanges));
			} finally {
				this._endEmit();
			}

			if (e.tokenizationSupportChanged) {
				this._tokenizeViewportSoon.schedule();
			}
		}));

		this._register(this.model.onDidChangeLanguageConfiguration((e) => {
			try {
				const eventsCollector = this._beginEmit();
				eventsCollector.emit(new viewEvents.ViewLanguageConfigurationEvent());
			} finally {
				this._endEmit();
			}
		}));

		this._register(this.model.onDidChangeOptions((e) => {
			// A tab size change causes a line mapping changed event => all view parts will repaint OK, no further event needed here
			if (this.lines.setTabSize(this.model.getOptions().tabSize)) {
				this.decorations.onLineMappingChanged();
				this.viewLayout.onFlushed(this.getLineCount());
				try {
					const eventsCollector = this._beginEmit();
					eventsCollector.emit(new viewEvents.ViewFlushedEvent());
					eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
					eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
				} finally {
					this._endEmit();
				}
			}
		}));

		this._register(this.model.onDidChangeDecorations((e) => {
			this.decorations.onModelDecorationsChanged();
			try {
				const eventsCollector = this._beginEmit();
				eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
			} finally {
				this._endEmit();
			}
		}));
	}

	public setHiddenAreas(ranges: Range[]): void {
		try {
			const eventsCollector = this._beginEmit();
			let lineMappingChanged = this.lines.setHiddenAreas(ranges);
			if (lineMappingChanged) {
				eventsCollector.emit(new viewEvents.ViewFlushedEvent());
				eventsCollector.emit(new viewEvents.ViewLineMappingChangedEvent());
				eventsCollector.emit(new viewEvents.ViewDecorationsChangedEvent());
				this.decorations.onLineMappingChanged();
				this.viewLayout.onFlushed(this.getLineCount());
				this.viewLayout.onHeightMaybeChanged();
			}
		} finally {
			this._endEmit();
		}
	}

	public getVisibleRanges(): Range[] {
		const visibleViewRange = this.getCompletelyVisibleViewRange();
		const visibleRange = this.coordinatesConverter.convertViewRangeToModelRange(visibleViewRange);
		const hiddenAreas = this.lines.getHiddenAreas();

		if (hiddenAreas.length === 0) {
			return [visibleRange];
		}

		let result: Range[] = [], resultLen = 0;
		let startLineNumber = visibleRange.startLineNumber;
		let startColumn = visibleRange.startColumn;
		let endLineNumber = visibleRange.endLineNumber;
		let endColumn = visibleRange.endColumn;
		for (let i = 0, len = hiddenAreas.length; i < len; i++) {
			const hiddenStartLineNumber = hiddenAreas[i].startLineNumber;
			const hiddenEndLineNumber = hiddenAreas[i].endLineNumber;

			if (hiddenEndLineNumber < startLineNumber) {
				continue;
			}
			if (hiddenStartLineNumber > endLineNumber) {
				continue;
			}

			if (startLineNumber < hiddenStartLineNumber) {
				result[resultLen++] = new Range(
					startLineNumber, startColumn,
					hiddenStartLineNumber - 1, this.model.getLineMaxColumn(hiddenStartLineNumber - 1)
				);
			}
			startLineNumber = hiddenEndLineNumber + 1;
			startColumn = 1;
		}

		if (startLineNumber < endLineNumber || (startLineNumber === endLineNumber && startColumn < endColumn)) {
			result[resultLen++] = new Range(
				startLineNumber, startColumn,
				endLineNumber, endColumn
			);
		}

		return result;
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

	public saveState(): editorCommon.IViewState {
		const compatViewState = this.viewLayout.saveState();

		const scrollTop = compatViewState.scrollTop;
		const firstViewLineNumber = this.viewLayout.getLineNumberAtVerticalOffset(scrollTop);
		const firstPosition = this.coordinatesConverter.convertViewPositionToModelPosition(new Position(firstViewLineNumber, this.getLineMinColumn(firstViewLineNumber)));
		const firstPositionDeltaTop = this.viewLayout.getVerticalOffsetForLineNumber(firstViewLineNumber) - scrollTop;

		return {
			scrollLeft: compatViewState.scrollLeft,
			firstPosition: firstPosition,
			firstPositionDeltaTop: firstPositionDeltaTop
		};
	}

	public reduceRestoreState(state: editorCommon.IViewState): { scrollLeft: number; scrollTop: number; } {
		if (typeof state.firstPosition === 'undefined') {
			// This is a view state serialized by an older version
			return this._reduceRestoreStateCompatibility(state);
		}

		const modelPosition = this.model.validatePosition(state.firstPosition);
		const viewPosition = this.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
		const scrollTop = this.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber) - state.firstPositionDeltaTop;
		return {
			scrollLeft: state.scrollLeft,
			scrollTop: scrollTop
		};
	}

	private _reduceRestoreStateCompatibility(state: editorCommon.IViewState): { scrollLeft: number; scrollTop: number; } {
		return {
			scrollLeft: state.scrollLeft,
			scrollTop: state.scrollTopWithoutViewZones!
		};
	}

	private getTabSize(): number {
		return this.model.getOptions().tabSize;
	}

	public getOptions(): TextModelResolvedOptions {
		return this.model.getOptions();
	}

	public getLineCount(): number {
		return this.lines.getViewLineCount();
	}

	/**
	 * Gives a hint that a lot of requests are about to come in for these line numbers.
	 */
	public setViewport(startLineNumber: number, endLineNumber: number, centeredLineNumber: number): void {
		this.lines.warmUpLookupCache(startLineNumber, endLineNumber);

		this.viewportStartLine = startLineNumber;
		let position = this.coordinatesConverter.convertViewPositionToModelPosition(new Position(startLineNumber, this.getLineMinColumn(startLineNumber)));
		this.viewportStartLineTrackedRange = this.model._setTrackedRange(this.viewportStartLineTrackedRange, new Range(position.lineNumber, position.column, position.lineNumber, position.column), TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
		const viewportStartLineTop = this.viewLayout.getVerticalOffsetForLineNumber(startLineNumber);
		const scrollTop = this.viewLayout.getCurrentScrollTop();
		this.viewportStartLineDelta = scrollTop - viewportStartLineTop;
	}

	public getActiveIndentGuide(lineNumber: number, minLineNumber: number, maxLineNumber: number): IActiveIndentGuideInfo {
		return this.lines.getActiveIndentGuide(lineNumber, minLineNumber, maxLineNumber);
	}

	public getLinesIndentGuides(startLineNumber: number, endLineNumber: number): number[] {
		return this.lines.getViewLinesIndentGuides(startLineNumber, endLineNumber);
	}

	public getLineContent(lineNumber: number): string {
		return this.lines.getViewLineContent(lineNumber);
	}

	public getLineLength(lineNumber: number): number {
		return this.lines.getViewLineLength(lineNumber);
	}

	public getLineMinColumn(lineNumber: number): number {
		return this.lines.getViewLineMinColumn(lineNumber);
	}

	public getLineMaxColumn(lineNumber: number): number {
		return this.lines.getViewLineMaxColumn(lineNumber);
	}

	public getLineFirstNonWhitespaceColumn(lineNumber: number): number {
		const result = strings.firstNonWhitespaceIndex(this.getLineContent(lineNumber));
		if (result === -1) {
			return 0;
		}
		return result + 1;
	}

	public getLineLastNonWhitespaceColumn(lineNumber: number): number {
		const result = strings.lastNonWhitespaceIndex(this.getLineContent(lineNumber));
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
			lineData.continuesWithWrappedLine,
			mightContainRTL,
			mightContainNonBasicASCII,
			lineData.tokens,
			inlineDecorations,
			tabSize
		);
	}

	public getViewLineData(lineNumber: number): ViewLineData {
		return this.lines.getViewLineData(lineNumber);
	}

	public getMinimapLinesRenderingData(startLineNumber: number, endLineNumber: number, needed: boolean[]): MinimapLinesRenderingData {
		let result = this.lines.getViewLinesData(startLineNumber, endLineNumber, needed);
		return new MinimapLinesRenderingData(
			this.getTabSize(),
			result
		);
	}

	public getAllOverviewRulerDecorations(theme: ITheme): IOverviewRulerDecorations {
		return this.lines.getAllOverviewRulerDecorations(this.editorId, this.configuration.editor.readOnly, theme);
	}

	public invalidateOverviewRulerColorCache(): void {
		const decorations = this.model.getOverviewRulerDecorations();
		for (const decoration of decorations) {
			const opts = <ModelDecorationOverviewRulerOptions>decoration.options.overviewRuler;
			if (opts) {
				opts.invalidateCachedColor();
			}
		}
	}

	public invalidateMinimapColorCache(): void {
		const decorations = this.model.getAllDecorations();
		for (const decoration of decorations) {
			const opts = <ModelDecorationMinimapOptions>decoration.options.minimap;
			if (opts) {
				opts.invalidateCachedColor();
			}
		}
	}

	public getValueInRange(range: Range, eol: EndOfLinePreference): string {
		const modelRange = this.coordinatesConverter.convertViewRangeToModelRange(range);
		return this.model.getValueInRange(modelRange, eol);
	}

	public getModelLineMaxColumn(modelLineNumber: number): number {
		return this.model.getLineMaxColumn(modelLineNumber);
	}

	public validateModelPosition(position: IPosition): Position {
		return this.model.validatePosition(position);
	}

	public validateModelRange(range: IRange): Range {
		return this.model.validateRange(range);
	}

	public deduceModelPositionRelativeToViewPosition(viewAnchorPosition: Position, deltaOffset: number, lineFeedCnt: number): Position {
		const modelAnchor = this.coordinatesConverter.convertViewPositionToModelPosition(viewAnchorPosition);
		if (this.model.getEOL().length === 2) {
			// This model uses CRLF, so the delta must take that into account
			if (deltaOffset < 0) {
				deltaOffset -= lineFeedCnt;
			} else {
				deltaOffset += lineFeedCnt;
			}
		}

		const modelAnchorOffset = this.model.getOffsetAt(modelAnchor);
		const resultOffset = modelAnchorOffset + deltaOffset;
		return this.model.getPositionAt(resultOffset);
	}

	public getEOL(): string {
		return this.model.getEOL();
	}

	public getPlainTextToCopy(ranges: Range[], emptySelectionClipboard: boolean, forceCRLF: boolean): string | string[] {
		const newLineCharacter = forceCRLF ? '\r\n' : this.model.getEOL();

		ranges = ranges.slice(0);
		ranges.sort(Range.compareRangesUsingStarts);
		const nonEmptyRanges = ranges.filter((r) => !r.isEmpty());

		if (nonEmptyRanges.length === 0) {
			if (!emptySelectionClipboard) {
				return '';
			}

			const modelLineNumbers = ranges.map((r) => {
				const viewLineStart = new Position(r.startLineNumber, 1);
				return this.coordinatesConverter.convertViewPositionToModelPosition(viewLineStart).lineNumber;
			});

			let result = '';
			for (let i = 0; i < modelLineNumbers.length; i++) {
				if (i > 0 && modelLineNumbers[i - 1] === modelLineNumbers[i]) {
					continue;
				}
				result += this.model.getLineContent(modelLineNumbers[i]) + newLineCharacter;
			}
			return result;
		}

		let result: string[] = [];
		for (const nonEmptyRange of nonEmptyRanges) {
			result.push(this.getValueInRange(nonEmptyRange, forceCRLF ? EndOfLinePreference.CRLF : EndOfLinePreference.TextDefined));
		}
		return result.length === 1 ? result[0] : result;
	}

	public getHTMLToCopy(viewRanges: Range[], emptySelectionClipboard: boolean): string | null {
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
		const fontFamily = fontInfo.fontFamily === EDITOR_FONT_DEFAULTS.fontFamily ? fontInfo.fontFamily : `'${fontInfo.fontFamily}', ${EDITOR_FONT_DEFAULTS.fontFamily}`;

		return (
			`<div style="`
			+ `color: ${colorMap[ColorId.DefaultForeground]};`
			+ `background-color: ${colorMap[ColorId.DefaultBackground]};`
			+ `font-family: ${fontFamily};`
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
		let result: string[] = ['#000000'];
		if (colorMap) {
			for (let i = 1, len = colorMap.length; i < len; i++) {
				result[i] = Color.Format.CSS.formatHex(colorMap[i]);
			}
		}
		return result;
	}
}
