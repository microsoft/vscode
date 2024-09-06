/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayQueue } from '../../../base/common/arrays.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
import { Color } from '../../../base/common/color.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import * as platform from '../../../base/common/platform.js';
import * as strings from '../../../base/common/strings.js';
import { ConfigurationChangedEvent, EditorOption, EDITOR_FONT_DEFAULTS, filterValidationDecorations } from '../config/editorOptions.js';
import { CursorsController } from '../cursor/cursor.js';
import { CursorConfiguration, CursorState, EditOperationType, IColumnSelectData, PartialCursorState } from '../cursorCommon.js';
import { CursorChangeReason } from '../cursorEvents.js';
import { IPosition, Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { ISelection, Selection } from '../core/selection.js';
import { ICommand, ICursorState, IViewState, ScrollType } from '../editorCommon.js';
import { IEditorConfiguration } from '../config/editorConfiguration.js';
import { EndOfLinePreference, IAttachedView, ICursorStateComputer, IGlyphMarginLanesModel, IIdentifiedSingleEditOperation, ITextModel, PositionAffinity, TrackedRangeStickiness } from '../model.js';
import { IActiveIndentGuideInfo, BracketGuideOptions, IndentGuide } from '../textModelGuides.js';
import { ModelDecorationMinimapOptions, ModelDecorationOptions, ModelDecorationOverviewRulerOptions } from '../model/textModel.js';
import * as textModelEvents from '../textModelEvents.js';
import { TokenizationRegistry } from '../languages.js';
import { ColorId } from '../encodedTokenAttributes.js';
import { ILanguageConfigurationService } from '../languages/languageConfigurationRegistry.js';
import { PLAINTEXT_LANGUAGE_ID } from '../languages/modesRegistry.js';
import { tokenizeLineToHTML } from '../languages/textToHtmlTokenizer.js';
import { EditorTheme } from '../editorTheme.js';
import * as viewEvents from '../viewEvents.js';
import { ViewLayout } from '../viewLayout/viewLayout.js';
import { MinimapTokensColorTracker } from './minimapTokensColorTracker.js';
import { ILineBreaksComputer, ILineBreaksComputerFactory, InjectedText } from '../modelLineProjectionData.js';
import { ViewEventHandler } from '../viewEventHandler.js';
import { ICoordinatesConverter, InlineDecoration, IViewModel, IWhitespaceChangeAccessor, MinimapLinesRenderingData, OverviewRulerDecorationsGroup, ViewLineData, ViewLineRenderingData, ViewModelDecoration } from '../viewModel.js';
import { ViewModelDecorations } from './viewModelDecorations.js';
import { FocusChangedEvent, HiddenAreasChangedEvent, ModelContentChangedEvent, ModelDecorationsChangedEvent, ModelLanguageChangedEvent, ModelLanguageConfigurationChangedEvent, ModelOptionsChangedEvent, ModelTokensChangedEvent, OutgoingViewModelEvent, ReadOnlyEditAttemptEvent, ScrollChangedEvent, ViewModelEventDispatcher, ViewModelEventsCollector, ViewZonesChangedEvent } from '../viewModelEventDispatcher.js';
import { IViewModelLines, ViewModelLinesFromModelAsIs, ViewModelLinesFromProjectedModel } from './viewModelLines.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { GlyphMarginLanesModel } from './glyphLanesModel.js';

const USE_IDENTITY_LINES_COLLECTION = true;

export class ViewModel extends Disposable implements IViewModel {

	private readonly _editorId: number;
	private readonly _configuration: IEditorConfiguration;
	public readonly model: ITextModel;
	private readonly _eventDispatcher: ViewModelEventDispatcher;
	public readonly onEvent: Event<OutgoingViewModelEvent>;
	public cursorConfig: CursorConfiguration;
	private readonly _updateConfigurationViewLineCount: RunOnceScheduler;
	private _hasFocus: boolean;
	private readonly _viewportStart: ViewportStart;
	private readonly _lines: IViewModelLines;
	public readonly coordinatesConverter: ICoordinatesConverter;
	public readonly viewLayout: ViewLayout;
	private readonly _cursor: CursorsController;
	private readonly _decorations: ViewModelDecorations;
	public readonly glyphLanes: IGlyphMarginLanesModel;

	constructor(
		editorId: number,
		configuration: IEditorConfiguration,
		model: ITextModel,
		domLineBreaksComputerFactory: ILineBreaksComputerFactory,
		monospaceLineBreaksComputerFactory: ILineBreaksComputerFactory,
		scheduleAtNextAnimationFrame: (callback: () => void) => IDisposable,
		private readonly languageConfigurationService: ILanguageConfigurationService,
		private readonly _themeService: IThemeService,
		private readonly _attachedView: IAttachedView,
		private readonly _transactionalTarget: IBatchableTarget,
	) {
		super();

		this._editorId = editorId;
		this._configuration = configuration;
		this.model = model;
		this._eventDispatcher = new ViewModelEventDispatcher();
		this.onEvent = this._eventDispatcher.onEvent;
		this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
		this._updateConfigurationViewLineCount = this._register(new RunOnceScheduler(() => this._updateConfigurationViewLineCountNow(), 0));
		this._hasFocus = false;
		this._viewportStart = ViewportStart.create(this.model);
		this.glyphLanes = new GlyphMarginLanesModel(0);

		if (USE_IDENTITY_LINES_COLLECTION && this.model.isTooLargeForTokenization()) {

			this._lines = new ViewModelLinesFromModelAsIs(this.model);

		} else {
			const options = this._configuration.options;
			const fontInfo = options.get(EditorOption.fontInfo);
			const wrappingStrategy = options.get(EditorOption.wrappingStrategy);
			const wrappingInfo = options.get(EditorOption.wrappingInfo);
			const wrappingIndent = options.get(EditorOption.wrappingIndent);
			const wordBreak = options.get(EditorOption.wordBreak);

			this._lines = new ViewModelLinesFromProjectedModel(
				this._editorId,
				this.model,
				domLineBreaksComputerFactory,
				monospaceLineBreaksComputerFactory,
				fontInfo,
				this.model.getOptions().tabSize,
				wrappingStrategy,
				wrappingInfo.wrappingColumn,
				wrappingIndent,
				wordBreak
			);
		}

		this.coordinatesConverter = this._lines.createCoordinatesConverter();

		this._cursor = this._register(new CursorsController(model, this, this.coordinatesConverter, this.cursorConfig));

		this.viewLayout = this._register(new ViewLayout(this._configuration, this.getLineCount(), scheduleAtNextAnimationFrame));

		this._register(this.viewLayout.onDidScroll((e) => {
			if (e.scrollTopChanged) {
				this._handleVisibleLinesChanged();
			}
			if (e.scrollTopChanged) {
				this._viewportStart.invalidate();
			}
			this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewScrollChangedEvent(e));
			this._eventDispatcher.emitOutgoingEvent(new ScrollChangedEvent(
				e.oldScrollWidth, e.oldScrollLeft, e.oldScrollHeight, e.oldScrollTop,
				e.scrollWidth, e.scrollLeft, e.scrollHeight, e.scrollTop
			));
		}));

		this._register(this.viewLayout.onDidContentSizeChange((e) => {
			this._eventDispatcher.emitOutgoingEvent(e);
		}));

		this._decorations = new ViewModelDecorations(this._editorId, this.model, this._configuration, this._lines, this.coordinatesConverter);

		this._registerModelEvents();

		this._register(this._configuration.onDidChangeFast((e) => {
			try {
				const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
				this._onConfigurationChanged(eventsCollector, e);
			} finally {
				this._eventDispatcher.endEmitViewEvents();
			}
		}));

		this._register(MinimapTokensColorTracker.getInstance().onDidChange(() => {
			this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewTokensColorsChangedEvent());
		}));

		this._register(this._themeService.onDidColorThemeChange((theme) => {
			this._invalidateDecorationsColorCache();
			this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewThemeChangedEvent(theme));
		}));

		this._updateConfigurationViewLineCountNow();
	}

	public override dispose(): void {
		// First remove listeners, as disposing the lines might end up sending
		// model decoration changed events ... and we no longer care about them ...
		super.dispose();
		this._decorations.dispose();
		this._lines.dispose();
		this._viewportStart.dispose();
		this._eventDispatcher.dispose();
	}

	public createLineBreaksComputer(): ILineBreaksComputer {
		return this._lines.createLineBreaksComputer();
	}

	public addViewEventHandler(eventHandler: ViewEventHandler): void {
		this._eventDispatcher.addViewEventHandler(eventHandler);
	}

	public removeViewEventHandler(eventHandler: ViewEventHandler): void {
		this._eventDispatcher.removeViewEventHandler(eventHandler);
	}

	private _updateConfigurationViewLineCountNow(): void {
		this._configuration.setViewLineCount(this._lines.getViewLineCount());
	}

	private getModelVisibleRanges(): Range[] {
		const linesViewportData = this.viewLayout.getLinesViewportData();
		const viewVisibleRange = new Range(
			linesViewportData.startLineNumber,
			this.getLineMinColumn(linesViewportData.startLineNumber),
			linesViewportData.endLineNumber,
			this.getLineMaxColumn(linesViewportData.endLineNumber)
		);
		const modelVisibleRanges = this._toModelVisibleRanges(viewVisibleRange);
		return modelVisibleRanges;
	}

	public visibleLinesStabilized(): void {
		const modelVisibleRanges = this.getModelVisibleRanges();
		this._attachedView.setVisibleLines(modelVisibleRanges, true);
	}

	private _handleVisibleLinesChanged(): void {
		const modelVisibleRanges = this.getModelVisibleRanges();
		this._attachedView.setVisibleLines(modelVisibleRanges, false);
	}

	public setHasFocus(hasFocus: boolean): void {
		this._hasFocus = hasFocus;
		this._cursor.setHasFocus(hasFocus);
		this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewFocusChangedEvent(hasFocus));
		this._eventDispatcher.emitOutgoingEvent(new FocusChangedEvent(!hasFocus, hasFocus));
	}

	public onCompositionStart(): void {
		this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewCompositionStartEvent());
	}

	public onCompositionEnd(): void {
		this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewCompositionEndEvent());
	}

	private _captureStableViewport(): StableViewport {
		// We might need to restore the current start view range, so save it (if available)
		// But only if the scroll position is not at the top of the file
		if (this._viewportStart.isValid && this.viewLayout.getCurrentScrollTop() > 0) {
			const previousViewportStartViewPosition = new Position(this._viewportStart.viewLineNumber, this.getLineMinColumn(this._viewportStart.viewLineNumber));
			const previousViewportStartModelPosition = this.coordinatesConverter.convertViewPositionToModelPosition(previousViewportStartViewPosition);
			return new StableViewport(previousViewportStartModelPosition, this._viewportStart.startLineDelta);
		}
		return new StableViewport(null, 0);
	}

	private _onConfigurationChanged(eventsCollector: ViewModelEventsCollector, e: ConfigurationChangedEvent): void {
		const stableViewport = this._captureStableViewport();
		const options = this._configuration.options;
		const fontInfo = options.get(EditorOption.fontInfo);
		const wrappingStrategy = options.get(EditorOption.wrappingStrategy);
		const wrappingInfo = options.get(EditorOption.wrappingInfo);
		const wrappingIndent = options.get(EditorOption.wrappingIndent);
		const wordBreak = options.get(EditorOption.wordBreak);

		if (this._lines.setWrappingSettings(fontInfo, wrappingStrategy, wrappingInfo.wrappingColumn, wrappingIndent, wordBreak)) {
			eventsCollector.emitViewEvent(new viewEvents.ViewFlushedEvent());
			eventsCollector.emitViewEvent(new viewEvents.ViewLineMappingChangedEvent());
			eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
			this._cursor.onLineMappingChanged(eventsCollector);
			this._decorations.onLineMappingChanged();
			this.viewLayout.onFlushed(this.getLineCount());

			this._updateConfigurationViewLineCount.schedule();
		}

		if (e.hasChanged(EditorOption.readOnly)) {
			// Must read again all decorations due to readOnly filtering
			this._decorations.reset();
			eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
		}

		if (e.hasChanged(EditorOption.renderValidationDecorations)) {
			this._decorations.reset();
			eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
		}

		eventsCollector.emitViewEvent(new viewEvents.ViewConfigurationChangedEvent(e));
		this.viewLayout.onConfigurationChanged(e);

		stableViewport.recoverViewportStart(this.coordinatesConverter, this.viewLayout);

		if (CursorConfiguration.shouldRecreate(e)) {
			this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
			this._cursor.updateConfiguration(this.cursorConfig);
		}
	}

	private _registerModelEvents(): void {

		this._register(this.model.onDidChangeContentOrInjectedText((e) => {
			try {
				const eventsCollector = this._eventDispatcher.beginEmitViewEvents();

				let hadOtherModelChange = false;
				let hadModelLineChangeThatChangedLineMapping = false;

				const changes = (e instanceof textModelEvents.InternalModelContentChangeEvent ? e.rawContentChangedEvent.changes : e.changes);
				const versionId = (e instanceof textModelEvents.InternalModelContentChangeEvent ? e.rawContentChangedEvent.versionId : null);

				// Do a first pass to compute line mappings, and a second pass to actually interpret them
				const lineBreaksComputer = this._lines.createLineBreaksComputer();
				for (const change of changes) {
					switch (change.changeType) {
						case textModelEvents.RawContentChangedType.LinesInserted: {
							for (let lineIdx = 0; lineIdx < change.detail.length; lineIdx++) {
								const line = change.detail[lineIdx];
								let injectedText = change.injectedTexts[lineIdx];
								if (injectedText) {
									injectedText = injectedText.filter(element => (!element.ownerId || element.ownerId === this._editorId));
								}
								lineBreaksComputer.addRequest(line, injectedText, null);
							}
							break;
						}
						case textModelEvents.RawContentChangedType.LineChanged: {
							let injectedText: textModelEvents.LineInjectedText[] | null = null;
							if (change.injectedText) {
								injectedText = change.injectedText.filter(element => (!element.ownerId || element.ownerId === this._editorId));
							}
							lineBreaksComputer.addRequest(change.detail, injectedText, null);
							break;
						}
					}
				}
				const lineBreaks = lineBreaksComputer.finalize();
				const lineBreakQueue = new ArrayQueue(lineBreaks);

				for (const change of changes) {
					switch (change.changeType) {
						case textModelEvents.RawContentChangedType.Flush: {
							this._lines.onModelFlushed();
							eventsCollector.emitViewEvent(new viewEvents.ViewFlushedEvent());
							this._decorations.reset();
							this.viewLayout.onFlushed(this.getLineCount());
							hadOtherModelChange = true;
							break;
						}
						case textModelEvents.RawContentChangedType.LinesDeleted: {
							const linesDeletedEvent = this._lines.onModelLinesDeleted(versionId, change.fromLineNumber, change.toLineNumber);
							if (linesDeletedEvent !== null) {
								eventsCollector.emitViewEvent(linesDeletedEvent);
								this.viewLayout.onLinesDeleted(linesDeletedEvent.fromLineNumber, linesDeletedEvent.toLineNumber);
							}
							hadOtherModelChange = true;
							break;
						}
						case textModelEvents.RawContentChangedType.LinesInserted: {
							const insertedLineBreaks = lineBreakQueue.takeCount(change.detail.length);
							const linesInsertedEvent = this._lines.onModelLinesInserted(versionId, change.fromLineNumber, change.toLineNumber, insertedLineBreaks);
							if (linesInsertedEvent !== null) {
								eventsCollector.emitViewEvent(linesInsertedEvent);
								this.viewLayout.onLinesInserted(linesInsertedEvent.fromLineNumber, linesInsertedEvent.toLineNumber);
							}
							hadOtherModelChange = true;
							break;
						}
						case textModelEvents.RawContentChangedType.LineChanged: {
							const changedLineBreakData = lineBreakQueue.dequeue()!;
							const [lineMappingChanged, linesChangedEvent, linesInsertedEvent, linesDeletedEvent] =
								this._lines.onModelLineChanged(versionId, change.lineNumber, changedLineBreakData);
							hadModelLineChangeThatChangedLineMapping = lineMappingChanged;
							if (linesChangedEvent) {
								eventsCollector.emitViewEvent(linesChangedEvent);
							}
							if (linesInsertedEvent) {
								eventsCollector.emitViewEvent(linesInsertedEvent);
								this.viewLayout.onLinesInserted(linesInsertedEvent.fromLineNumber, linesInsertedEvent.toLineNumber);
							}
							if (linesDeletedEvent) {
								eventsCollector.emitViewEvent(linesDeletedEvent);
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

				if (versionId !== null) {
					this._lines.acceptVersionId(versionId);
				}
				this.viewLayout.onHeightMaybeChanged();

				if (!hadOtherModelChange && hadModelLineChangeThatChangedLineMapping) {
					eventsCollector.emitViewEvent(new viewEvents.ViewLineMappingChangedEvent());
					eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
					this._cursor.onLineMappingChanged(eventsCollector);
					this._decorations.onLineMappingChanged();
				}
			} finally {
				this._eventDispatcher.endEmitViewEvents();
			}

			// Update the configuration and reset the centered view line
			const viewportStartWasValid = this._viewportStart.isValid;
			this._viewportStart.invalidate();
			this._configuration.setModelLineCount(this.model.getLineCount());
			this._updateConfigurationViewLineCountNow();

			// Recover viewport
			if (!this._hasFocus && this.model.getAttachedEditorCount() >= 2 && viewportStartWasValid) {
				const modelRange = this.model._getTrackedRange(this._viewportStart.modelTrackedRange);
				if (modelRange) {
					const viewPosition = this.coordinatesConverter.convertModelPositionToViewPosition(modelRange.getStartPosition());
					const viewPositionTop = this.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
					this.viewLayout.setScrollPosition({ scrollTop: viewPositionTop + this._viewportStart.startLineDelta }, ScrollType.Immediate);
				}
			}

			try {
				const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
				if (e instanceof textModelEvents.InternalModelContentChangeEvent) {
					eventsCollector.emitOutgoingEvent(new ModelContentChangedEvent(e.contentChangedEvent));
				}
				this._cursor.onModelContentChanged(eventsCollector, e);
			} finally {
				this._eventDispatcher.endEmitViewEvents();
			}

			this._handleVisibleLinesChanged();
		}));

		this._register(this.model.onDidChangeTokens((e) => {
			const viewRanges: { fromLineNumber: number; toLineNumber: number }[] = [];
			for (let j = 0, lenJ = e.ranges.length; j < lenJ; j++) {
				const modelRange = e.ranges[j];
				const viewStartLineNumber = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.fromLineNumber, 1)).lineNumber;
				const viewEndLineNumber = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.toLineNumber, this.model.getLineMaxColumn(modelRange.toLineNumber))).lineNumber;
				viewRanges[j] = {
					fromLineNumber: viewStartLineNumber,
					toLineNumber: viewEndLineNumber
				};
			}
			this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewTokensChangedEvent(viewRanges));
			this._eventDispatcher.emitOutgoingEvent(new ModelTokensChangedEvent(e));
		}));

		this._register(this.model.onDidChangeLanguageConfiguration((e) => {
			this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewLanguageConfigurationEvent());
			this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
			this._cursor.updateConfiguration(this.cursorConfig);
			this._eventDispatcher.emitOutgoingEvent(new ModelLanguageConfigurationChangedEvent(e));
		}));

		this._register(this.model.onDidChangeLanguage((e) => {
			this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
			this._cursor.updateConfiguration(this.cursorConfig);
			this._eventDispatcher.emitOutgoingEvent(new ModelLanguageChangedEvent(e));
		}));

		this._register(this.model.onDidChangeOptions((e) => {
			// A tab size change causes a line mapping changed event => all view parts will repaint OK, no further event needed here
			if (this._lines.setTabSize(this.model.getOptions().tabSize)) {
				try {
					const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
					eventsCollector.emitViewEvent(new viewEvents.ViewFlushedEvent());
					eventsCollector.emitViewEvent(new viewEvents.ViewLineMappingChangedEvent());
					eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
					this._cursor.onLineMappingChanged(eventsCollector);
					this._decorations.onLineMappingChanged();
					this.viewLayout.onFlushed(this.getLineCount());
				} finally {
					this._eventDispatcher.endEmitViewEvents();
				}
				this._updateConfigurationViewLineCount.schedule();
			}

			this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
			this._cursor.updateConfiguration(this.cursorConfig);

			this._eventDispatcher.emitOutgoingEvent(new ModelOptionsChangedEvent(e));
		}));

		this._register(this.model.onDidChangeDecorations((e) => {
			this._decorations.onModelDecorationsChanged();
			this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewDecorationsChangedEvent(e));
			this._eventDispatcher.emitOutgoingEvent(new ModelDecorationsChangedEvent(e));
		}));
	}

	private readonly hiddenAreasModel = new HiddenAreasModel();
	private previousHiddenAreas: readonly Range[] = [];

	public setHiddenAreas(ranges: Range[], source?: unknown): void {
		this.hiddenAreasModel.setHiddenAreas(source, ranges);
		const mergedRanges = this.hiddenAreasModel.getMergedRanges();
		if (mergedRanges === this.previousHiddenAreas) {
			return;
		}

		this.previousHiddenAreas = mergedRanges;

		const stableViewport = this._captureStableViewport();

		let lineMappingChanged = false;
		try {
			const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
			lineMappingChanged = this._lines.setHiddenAreas(mergedRanges);
			if (lineMappingChanged) {
				eventsCollector.emitViewEvent(new viewEvents.ViewFlushedEvent());
				eventsCollector.emitViewEvent(new viewEvents.ViewLineMappingChangedEvent());
				eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
				this._cursor.onLineMappingChanged(eventsCollector);
				this._decorations.onLineMappingChanged();
				this.viewLayout.onFlushed(this.getLineCount());
				this.viewLayout.onHeightMaybeChanged();
			}

			const firstModelLineInViewPort = stableViewport.viewportStartModelPosition?.lineNumber;
			const firstModelLineIsHidden = firstModelLineInViewPort && mergedRanges.some(range => range.startLineNumber <= firstModelLineInViewPort && firstModelLineInViewPort <= range.endLineNumber);
			if (!firstModelLineIsHidden) {
				stableViewport.recoverViewportStart(this.coordinatesConverter, this.viewLayout);
			}
		} finally {
			this._eventDispatcher.endEmitViewEvents();
		}
		this._updateConfigurationViewLineCount.schedule();

		if (lineMappingChanged) {
			this._eventDispatcher.emitOutgoingEvent(new HiddenAreasChangedEvent());
		}
	}

	public getVisibleRangesPlusViewportAboveBelow(): Range[] {
		const layoutInfo = this._configuration.options.get(EditorOption.layoutInfo);
		const lineHeight = this._configuration.options.get(EditorOption.lineHeight);
		const linesAround = Math.max(20, Math.round(layoutInfo.height / lineHeight));
		const partialData = this.viewLayout.getLinesViewportData();
		const startViewLineNumber = Math.max(1, partialData.completelyVisibleStartLineNumber - linesAround);
		const endViewLineNumber = Math.min(this.getLineCount(), partialData.completelyVisibleEndLineNumber + linesAround);

		return this._toModelVisibleRanges(new Range(
			startViewLineNumber, this.getLineMinColumn(startViewLineNumber),
			endViewLineNumber, this.getLineMaxColumn(endViewLineNumber)
		));
	}

	public getVisibleRanges(): Range[] {
		const visibleViewRange = this.getCompletelyVisibleViewRange();
		return this._toModelVisibleRanges(visibleViewRange);
	}

	public getHiddenAreas(): Range[] {
		return this._lines.getHiddenAreas();
	}

	private _toModelVisibleRanges(visibleViewRange: Range): Range[] {
		const visibleRange = this.coordinatesConverter.convertViewRangeToModelRange(visibleViewRange);
		const hiddenAreas = this._lines.getHiddenAreas();

		if (hiddenAreas.length === 0) {
			return [visibleRange];
		}

		const result: Range[] = [];
		let resultLen = 0;
		let startLineNumber = visibleRange.startLineNumber;
		let startColumn = visibleRange.startColumn;
		const endLineNumber = visibleRange.endLineNumber;
		const endColumn = visibleRange.endColumn;
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

	public saveState(): IViewState {
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

	public reduceRestoreState(state: IViewState): { scrollLeft: number; scrollTop: number } {
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

	private _reduceRestoreStateCompatibility(state: IViewState): { scrollLeft: number; scrollTop: number } {
		return {
			scrollLeft: state.scrollLeft,
			scrollTop: state.scrollTopWithoutViewZones!
		};
	}

	private getTabSize(): number {
		return this.model.getOptions().tabSize;
	}

	public getLineCount(): number {
		return this._lines.getViewLineCount();
	}

	/**
	 * Gives a hint that a lot of requests are about to come in for these line numbers.
	 */
	public setViewport(startLineNumber: number, endLineNumber: number, centeredLineNumber: number): void {
		this._viewportStart.update(this, startLineNumber);
	}

	public getActiveIndentGuide(lineNumber: number, minLineNumber: number, maxLineNumber: number): IActiveIndentGuideInfo {
		return this._lines.getActiveIndentGuide(lineNumber, minLineNumber, maxLineNumber);
	}

	public getLinesIndentGuides(startLineNumber: number, endLineNumber: number): number[] {
		return this._lines.getViewLinesIndentGuides(startLineNumber, endLineNumber);
	}

	public getBracketGuidesInRangeByLine(startLineNumber: number, endLineNumber: number, activePosition: IPosition | null, options: BracketGuideOptions): IndentGuide[][] {
		return this._lines.getViewLinesBracketGuides(startLineNumber, endLineNumber, activePosition, options);
	}

	public getLineContent(lineNumber: number): string {
		return this._lines.getViewLineContent(lineNumber);
	}

	public getLineLength(lineNumber: number): number {
		return this._lines.getViewLineLength(lineNumber);
	}

	public getLineMinColumn(lineNumber: number): number {
		return this._lines.getViewLineMinColumn(lineNumber);
	}

	public getLineMaxColumn(lineNumber: number): number {
		return this._lines.getViewLineMaxColumn(lineNumber);
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

	public getMinimapDecorationsInRange(range: Range): ViewModelDecoration[] {
		return this._decorations.getMinimapDecorationsInRange(range);
	}

	public getDecorationsInViewport(visibleRange: Range): ViewModelDecoration[] {
		return this._decorations.getDecorationsViewportData(visibleRange).decorations;
	}

	public getInjectedTextAt(viewPosition: Position): InjectedText | null {
		return this._lines.getInjectedTextAt(viewPosition);
	}

	public getViewportViewLineRenderingData(visibleRange: Range, lineNumber: number): ViewLineRenderingData {
		const allInlineDecorations = this._decorations.getDecorationsViewportData(visibleRange).inlineDecorations;
		const inlineDecorations = allInlineDecorations[lineNumber - visibleRange.startLineNumber];
		return this._getViewLineRenderingData(lineNumber, inlineDecorations);
	}

	public getViewLineRenderingData(lineNumber: number): ViewLineRenderingData {
		const inlineDecorations = this._decorations.getInlineDecorationsOnLine(lineNumber);
		return this._getViewLineRenderingData(lineNumber, inlineDecorations);
	}

	private _getViewLineRenderingData(lineNumber: number, inlineDecorations: InlineDecoration[]): ViewLineRenderingData {
		const mightContainRTL = this.model.mightContainRTL();
		const mightContainNonBasicASCII = this.model.mightContainNonBasicASCII();
		const tabSize = this.getTabSize();
		const lineData = this._lines.getViewLineData(lineNumber);

		if (lineData.inlineDecorations) {
			inlineDecorations = [
				...inlineDecorations,
				...lineData.inlineDecorations.map(d =>
					d.toInlineDecoration(lineNumber)
				)
			];
		}

		return new ViewLineRenderingData(
			lineData.minColumn,
			lineData.maxColumn,
			lineData.content,
			lineData.continuesWithWrappedLine,
			mightContainRTL,
			mightContainNonBasicASCII,
			lineData.tokens,
			inlineDecorations,
			tabSize,
			lineData.startVisibleColumn
		);
	}

	public getViewLineData(lineNumber: number): ViewLineData {
		return this._lines.getViewLineData(lineNumber);
	}

	public getMinimapLinesRenderingData(startLineNumber: number, endLineNumber: number, needed: boolean[]): MinimapLinesRenderingData {
		const result = this._lines.getViewLinesData(startLineNumber, endLineNumber, needed);
		return new MinimapLinesRenderingData(
			this.getTabSize(),
			result
		);
	}

	public getAllOverviewRulerDecorations(theme: EditorTheme): OverviewRulerDecorationsGroup[] {
		const decorations = this.model.getOverviewRulerDecorations(this._editorId, filterValidationDecorations(this._configuration.options));
		const result = new OverviewRulerDecorations();
		for (const decoration of decorations) {
			const decorationOptions = <ModelDecorationOptions>decoration.options;
			const opts = decorationOptions.overviewRuler;
			if (!opts) {
				continue;
			}
			const lane = <number>opts.position;
			if (lane === 0) {
				continue;
			}
			const color = opts.getColor(theme.value);
			const viewStartLineNumber = this.coordinatesConverter.getViewLineNumberOfModelPosition(decoration.range.startLineNumber, decoration.range.startColumn);
			const viewEndLineNumber = this.coordinatesConverter.getViewLineNumberOfModelPosition(decoration.range.endLineNumber, decoration.range.endColumn);

			result.accept(color, decorationOptions.zIndex, viewStartLineNumber, viewEndLineNumber, lane);
		}
		return result.asArray;
	}

	private _invalidateDecorationsColorCache(): void {
		const decorations = this.model.getOverviewRulerDecorations();
		for (const decoration of decorations) {
			const opts1 = <ModelDecorationOverviewRulerOptions>decoration.options.overviewRuler;
			opts1?.invalidateCachedColor();
			const opts2 = <ModelDecorationMinimapOptions>decoration.options.minimap;
			opts2?.invalidateCachedColor();
		}
	}

	public getValueInRange(range: Range, eol: EndOfLinePreference): string {
		const modelRange = this.coordinatesConverter.convertViewRangeToModelRange(range);
		return this.model.getValueInRange(modelRange, eol);
	}

	public getValueLengthInRange(range: Range, eol: EndOfLinePreference): number {
		const modelRange = this.coordinatesConverter.convertViewRangeToModelRange(range);
		return this.model.getValueLengthInRange(modelRange, eol);
	}

	public modifyPosition(position: Position, offset: number): Position {
		const modelPosition = this.coordinatesConverter.convertViewPositionToModelPosition(position);
		const resultModelPosition = this.model.modifyPosition(modelPosition, offset);
		return this.coordinatesConverter.convertModelPositionToViewPosition(resultModelPosition);
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

	public getPlainTextToCopy(modelRanges: Range[], emptySelectionClipboard: boolean, forceCRLF: boolean): string | string[] {
		const newLineCharacter = forceCRLF ? '\r\n' : this.model.getEOL();

		modelRanges = modelRanges.slice(0);
		modelRanges.sort(Range.compareRangesUsingStarts);

		let hasEmptyRange = false;
		let hasNonEmptyRange = false;
		for (const range of modelRanges) {
			if (range.isEmpty()) {
				hasEmptyRange = true;
			} else {
				hasNonEmptyRange = true;
			}
		}

		if (!hasNonEmptyRange) {
			// all ranges are empty
			if (!emptySelectionClipboard) {
				return '';
			}

			const modelLineNumbers = modelRanges.map((r) => r.startLineNumber);

			let result = '';
			for (let i = 0; i < modelLineNumbers.length; i++) {
				if (i > 0 && modelLineNumbers[i - 1] === modelLineNumbers[i]) {
					continue;
				}
				result += this.model.getLineContent(modelLineNumbers[i]) + newLineCharacter;
			}
			return result;
		}

		if (hasEmptyRange && emptySelectionClipboard) {
			// mixed empty selections and non-empty selections
			const result: string[] = [];
			let prevModelLineNumber = 0;
			for (const modelRange of modelRanges) {
				const modelLineNumber = modelRange.startLineNumber;
				if (modelRange.isEmpty()) {
					if (modelLineNumber !== prevModelLineNumber) {
						result.push(this.model.getLineContent(modelLineNumber));
					}
				} else {
					result.push(this.model.getValueInRange(modelRange, forceCRLF ? EndOfLinePreference.CRLF : EndOfLinePreference.TextDefined));
				}
				prevModelLineNumber = modelLineNumber;
			}
			return result.length === 1 ? result[0] : result;
		}

		const result: string[] = [];
		for (const modelRange of modelRanges) {
			if (!modelRange.isEmpty()) {
				result.push(this.model.getValueInRange(modelRange, forceCRLF ? EndOfLinePreference.CRLF : EndOfLinePreference.TextDefined));
			}
		}
		return result.length === 1 ? result[0] : result;
	}

	public getRichTextToCopy(modelRanges: Range[], emptySelectionClipboard: boolean): { html: string; mode: string } | null {
		const languageId = this.model.getLanguageId();
		if (languageId === PLAINTEXT_LANGUAGE_ID) {
			return null;
		}

		if (modelRanges.length !== 1) {
			// no multiple selection support at this time
			return null;
		}

		let range = modelRanges[0];
		if (range.isEmpty()) {
			if (!emptySelectionClipboard) {
				// nothing to copy
				return null;
			}
			const lineNumber = range.startLineNumber;
			range = new Range(lineNumber, this.model.getLineMinColumn(lineNumber), lineNumber, this.model.getLineMaxColumn(lineNumber));
		}

		const fontInfo = this._configuration.options.get(EditorOption.fontInfo);
		const colorMap = this._getColorMap();
		const hasBadChars = (/[:;\\\/<>]/.test(fontInfo.fontFamily));
		const useDefaultFontFamily = (hasBadChars || fontInfo.fontFamily === EDITOR_FONT_DEFAULTS.fontFamily);
		let fontFamily: string;
		if (useDefaultFontFamily) {
			fontFamily = EDITOR_FONT_DEFAULTS.fontFamily;
		} else {
			fontFamily = fontInfo.fontFamily;
			fontFamily = fontFamily.replace(/"/g, '\'');
			const hasQuotesOrIsList = /[,']/.test(fontFamily);
			if (!hasQuotesOrIsList) {
				const needsQuotes = /[+ ]/.test(fontFamily);
				if (needsQuotes) {
					fontFamily = `'${fontFamily}'`;
				}
			}
			fontFamily = `${fontFamily}, ${EDITOR_FONT_DEFAULTS.fontFamily}`;
		}

		return {
			mode: languageId,
			html: (
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
			)
		};
	}

	private _getHTMLToCopy(modelRange: Range, colorMap: string[]): string {
		const startLineNumber = modelRange.startLineNumber;
		const startColumn = modelRange.startColumn;
		const endLineNumber = modelRange.endLineNumber;
		const endColumn = modelRange.endColumn;

		const tabSize = this.getTabSize();

		let result = '';

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			const lineTokens = this.model.tokenization.getLineTokens(lineNumber);
			const lineContent = lineTokens.getLineContent();
			const startOffset = (lineNumber === startLineNumber ? startColumn - 1 : 0);
			const endOffset = (lineNumber === endLineNumber ? endColumn - 1 : lineContent.length);

			if (lineContent === '') {
				result += '<br>';
			} else {
				result += tokenizeLineToHTML(lineContent, lineTokens.inflate(), colorMap, startOffset, endOffset, tabSize, platform.isWindows);
			}
		}

		return result;
	}

	private _getColorMap(): string[] {
		const colorMap = TokenizationRegistry.getColorMap();
		const result: string[] = ['#000000'];
		if (colorMap) {
			for (let i = 1, len = colorMap.length; i < len; i++) {
				result[i] = Color.Format.CSS.formatHex(colorMap[i]);
			}
		}
		return result;
	}

	//#region cursor operations

	public getPrimaryCursorState(): CursorState {
		return this._cursor.getPrimaryCursorState();
	}
	public getLastAddedCursorIndex(): number {
		return this._cursor.getLastAddedCursorIndex();
	}
	public getCursorStates(): CursorState[] {
		return this._cursor.getCursorStates();
	}
	public setCursorStates(source: string | null | undefined, reason: CursorChangeReason, states: PartialCursorState[] | null): boolean {
		return this._withViewEventsCollector(eventsCollector => this._cursor.setStates(eventsCollector, source, reason, states));
	}
	public getCursorColumnSelectData(): IColumnSelectData {
		return this._cursor.getCursorColumnSelectData();
	}
	public getCursorAutoClosedCharacters(): Range[] {
		return this._cursor.getAutoClosedCharacters();
	}
	public setCursorColumnSelectData(columnSelectData: IColumnSelectData): void {
		this._cursor.setCursorColumnSelectData(columnSelectData);
	}
	public getPrevEditOperationType(): EditOperationType {
		return this._cursor.getPrevEditOperationType();
	}
	public setPrevEditOperationType(type: EditOperationType): void {
		this._cursor.setPrevEditOperationType(type);
	}
	public getSelection(): Selection {
		return this._cursor.getSelection();
	}
	public getSelections(): Selection[] {
		return this._cursor.getSelections();
	}
	public getPosition(): Position {
		return this._cursor.getPrimaryCursorState().modelState.position;
	}
	public setSelections(source: string | null | undefined, selections: readonly ISelection[], reason = CursorChangeReason.NotSet): void {
		this._withViewEventsCollector(eventsCollector => this._cursor.setSelections(eventsCollector, source, selections, reason));
	}
	public saveCursorState(): ICursorState[] {
		return this._cursor.saveState();
	}
	public restoreCursorState(states: ICursorState[]): void {
		this._withViewEventsCollector(eventsCollector => this._cursor.restoreState(eventsCollector, states));
	}

	private _executeCursorEdit(callback: (eventsCollector: ViewModelEventsCollector) => void): void {
		if (this._cursor.context.cursorConfig.readOnly) {
			// we cannot edit when read only...
			this._eventDispatcher.emitOutgoingEvent(new ReadOnlyEditAttemptEvent());
			return;
		}
		this._withViewEventsCollector(callback);
	}
	public executeEdits(source: string | null | undefined, edits: IIdentifiedSingleEditOperation[], cursorStateComputer: ICursorStateComputer): void {
		this._executeCursorEdit(eventsCollector => this._cursor.executeEdits(eventsCollector, source, edits, cursorStateComputer));
	}
	public startComposition(): void {
		this._executeCursorEdit(eventsCollector => this._cursor.startComposition(eventsCollector));
	}
	public endComposition(source?: string | null | undefined): void {
		this._executeCursorEdit(eventsCollector => this._cursor.endComposition(eventsCollector, source));
	}
	public type(text: string, source?: string | null | undefined): void {
		this._executeCursorEdit(eventsCollector => this._cursor.type(eventsCollector, text, source));
	}
	public compositionType(text: string, replacePrevCharCnt: number, replaceNextCharCnt: number, positionDelta: number, source?: string | null | undefined): void {
		this._executeCursorEdit(eventsCollector => this._cursor.compositionType(eventsCollector, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta, source));
	}
	public paste(text: string, pasteOnNewLine: boolean, multicursorText?: string[] | null | undefined, source?: string | null | undefined): void {
		this._executeCursorEdit(eventsCollector => this._cursor.paste(eventsCollector, text, pasteOnNewLine, multicursorText, source));
	}
	public cut(source?: string | null | undefined): void {
		this._executeCursorEdit(eventsCollector => this._cursor.cut(eventsCollector, source));
	}
	public executeCommand(command: ICommand, source?: string | null | undefined): void {
		this._executeCursorEdit(eventsCollector => this._cursor.executeCommand(eventsCollector, command, source));
	}
	public executeCommands(commands: ICommand[], source?: string | null | undefined): void {
		this._executeCursorEdit(eventsCollector => this._cursor.executeCommands(eventsCollector, commands, source));
	}
	public revealAllCursors(source: string | null | undefined, revealHorizontal: boolean, minimalReveal: boolean = false): void {
		this._withViewEventsCollector(eventsCollector => this._cursor.revealAll(eventsCollector, source, minimalReveal, viewEvents.VerticalRevealType.Simple, revealHorizontal, ScrollType.Smooth));
	}
	public revealPrimaryCursor(source: string | null | undefined, revealHorizontal: boolean, minimalReveal: boolean = false): void {
		this._withViewEventsCollector(eventsCollector => this._cursor.revealPrimary(eventsCollector, source, minimalReveal, viewEvents.VerticalRevealType.Simple, revealHorizontal, ScrollType.Smooth));
	}
	public revealTopMostCursor(source: string | null | undefined): void {
		const viewPosition = this._cursor.getTopMostViewPosition();
		const viewRange = new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column);
		this._withViewEventsCollector(eventsCollector => eventsCollector.emitViewEvent(new viewEvents.ViewRevealRangeRequestEvent(source, false, viewRange, null, viewEvents.VerticalRevealType.Simple, true, ScrollType.Smooth)));
	}
	public revealBottomMostCursor(source: string | null | undefined): void {
		const viewPosition = this._cursor.getBottomMostViewPosition();
		const viewRange = new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column);
		this._withViewEventsCollector(eventsCollector => eventsCollector.emitViewEvent(new viewEvents.ViewRevealRangeRequestEvent(source, false, viewRange, null, viewEvents.VerticalRevealType.Simple, true, ScrollType.Smooth)));
	}
	public revealRange(source: string | null | undefined, revealHorizontal: boolean, viewRange: Range, verticalType: viewEvents.VerticalRevealType, scrollType: ScrollType): void {
		this._withViewEventsCollector(eventsCollector => eventsCollector.emitViewEvent(new viewEvents.ViewRevealRangeRequestEvent(source, false, viewRange, null, verticalType, revealHorizontal, scrollType)));
	}

	//#endregion

	//#region viewLayout
	public changeWhitespace(callback: (accessor: IWhitespaceChangeAccessor) => void): void {
		const hadAChange = this.viewLayout.changeWhitespace(callback);
		if (hadAChange) {
			this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewZonesChangedEvent());
			this._eventDispatcher.emitOutgoingEvent(new ViewZonesChangedEvent());
		}
	}
	//#endregion

	private _withViewEventsCollector<T>(callback: (eventsCollector: ViewModelEventsCollector) => T): T {
		return this._transactionalTarget.batchChanges(() => {
			try {
				const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
				return callback(eventsCollector);
			} finally {
				this._eventDispatcher.endEmitViewEvents();
			}
		});
	}

	public batchEvents(callback: () => void): void {
		this._withViewEventsCollector(() => { callback(); });
	}

	normalizePosition(position: Position, affinity: PositionAffinity): Position {
		return this._lines.normalizePosition(position, affinity);
	}

	/**
	 * Gets the column at which indentation stops at a given line.
	 * @internal
	*/
	getLineIndentColumn(lineNumber: number): number {
		return this._lines.getLineIndentColumn(lineNumber);
	}
}

export interface IBatchableTarget {
	/**
	 * Allows the target to apply the changes introduced by the callback in a batch.
	*/
	batchChanges<T>(cb: () => T): T;
}

class ViewportStart implements IDisposable {

	public static create(model: ITextModel): ViewportStart {
		const viewportStartLineTrackedRange = model._setTrackedRange(null, new Range(1, 1, 1, 1), TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
		return new ViewportStart(model, 1, false, viewportStartLineTrackedRange, 0);
	}

	public get viewLineNumber(): number {
		return this._viewLineNumber;
	}

	public get isValid(): boolean {
		return this._isValid;
	}

	public get modelTrackedRange(): string {
		return this._modelTrackedRange;
	}

	public get startLineDelta(): number {
		return this._startLineDelta;
	}

	private constructor(
		private readonly _model: ITextModel,
		private _viewLineNumber: number,
		private _isValid: boolean,
		private _modelTrackedRange: string,
		private _startLineDelta: number,
	) { }

	public dispose(): void {
		this._model._setTrackedRange(this._modelTrackedRange, null, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
	}

	public update(viewModel: IViewModel, startLineNumber: number): void {
		const position = viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(startLineNumber, viewModel.getLineMinColumn(startLineNumber)));
		const viewportStartLineTrackedRange = viewModel.model._setTrackedRange(this._modelTrackedRange, new Range(position.lineNumber, position.column, position.lineNumber, position.column), TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
		const viewportStartLineTop = viewModel.viewLayout.getVerticalOffsetForLineNumber(startLineNumber);
		const scrollTop = viewModel.viewLayout.getCurrentScrollTop();

		this._viewLineNumber = startLineNumber;
		this._isValid = true;
		this._modelTrackedRange = viewportStartLineTrackedRange;
		this._startLineDelta = scrollTop - viewportStartLineTop;
	}

	public invalidate(): void {
		this._isValid = false;
	}
}

class OverviewRulerDecorations {

	private readonly _asMap: { [color: string]: OverviewRulerDecorationsGroup } = Object.create(null);
	readonly asArray: OverviewRulerDecorationsGroup[] = [];

	public accept(color: string, zIndex: number, startLineNumber: number, endLineNumber: number, lane: number): void {
		const prevGroup = this._asMap[color];

		if (prevGroup) {
			const prevData = prevGroup.data;
			const prevLane = prevData[prevData.length - 3];
			const prevEndLineNumber = prevData[prevData.length - 1];
			if (prevLane === lane && prevEndLineNumber + 1 >= startLineNumber) {
				// merge into prev
				if (endLineNumber > prevEndLineNumber) {
					prevData[prevData.length - 1] = endLineNumber;
				}
				return;
			}

			// push
			prevData.push(lane, startLineNumber, endLineNumber);
		} else {
			const group = new OverviewRulerDecorationsGroup(color, zIndex, [lane, startLineNumber, endLineNumber]);
			this._asMap[color] = group;
			this.asArray.push(group);
		}
	}
}

class HiddenAreasModel {
	private readonly hiddenAreas = new Map<unknown, Range[]>();
	private shouldRecompute = false;
	private ranges: Range[] = [];

	setHiddenAreas(source: unknown, ranges: Range[]): void {
		const existing = this.hiddenAreas.get(source);
		if (existing && rangeArraysEqual(existing, ranges)) {
			return;
		}
		this.hiddenAreas.set(source, ranges);
		this.shouldRecompute = true;
	}

	/**
	 * The returned array is immutable.
	*/
	getMergedRanges(): readonly Range[] {
		if (!this.shouldRecompute) {
			return this.ranges;
		}
		this.shouldRecompute = false;
		const newRanges = Array.from(this.hiddenAreas.values()).reduce((r, hiddenAreas) => mergeLineRangeArray(r, hiddenAreas), []);
		if (rangeArraysEqual(this.ranges, newRanges)) {
			return this.ranges;
		}
		this.ranges = newRanges;
		return this.ranges;
	}
}

function mergeLineRangeArray(arr1: Range[], arr2: Range[]): Range[] {
	const result = [];
	let i = 0;
	let j = 0;
	while (i < arr1.length && j < arr2.length) {
		const item1 = arr1[i];
		const item2 = arr2[j];

		if (item1.endLineNumber < item2.startLineNumber - 1) {
			result.push(arr1[i++]);
		} else if (item2.endLineNumber < item1.startLineNumber - 1) {
			result.push(arr2[j++]);
		} else {
			const startLineNumber = Math.min(item1.startLineNumber, item2.startLineNumber);
			const endLineNumber = Math.max(item1.endLineNumber, item2.endLineNumber);
			result.push(new Range(startLineNumber, 1, endLineNumber, 1));
			i++;
			j++;
		}
	}
	while (i < arr1.length) {
		result.push(arr1[i++]);
	}
	while (j < arr2.length) {
		result.push(arr2[j++]);
	}
	return result;
}

function rangeArraysEqual(arr1: Range[], arr2: Range[]): boolean {
	if (arr1.length !== arr2.length) {
		return false;
	}
	for (let i = 0; i < arr1.length; i++) {
		if (!arr1[i].equalsRange(arr2[i])) {
			return false;
		}
	}
	return true;
}

/**
 * Maintain a stable viewport by trying to keep the first line in the viewport constant.
 */
class StableViewport {
	constructor(
		public readonly viewportStartModelPosition: Position | null,
		public readonly startLineDelta: number
	) { }

	public recoverViewportStart(coordinatesConverter: ICoordinatesConverter, viewLayout: ViewLayout): void {
		if (!this.viewportStartModelPosition) {
			return;
		}
		const viewPosition = coordinatesConverter.convertModelPositionToViewPosition(this.viewportStartModelPosition);
		const viewPositionTop = viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
		viewLayout.setScrollPosition({ scrollTop: viewPositionTop + this.startLineDelta }, ScrollType.Immediate);
	}
}
