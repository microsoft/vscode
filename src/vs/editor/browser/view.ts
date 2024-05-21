/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { inputLatency } from 'vs/base/browser/performance';
import { CodeWindow } from 'vs/base/browser/window';
import { BugIndicatingError, onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IPointerHandlerHelper } from 'vs/editor/browser/controller/mouseHandler';
import { PointerHandlerLastRenderData } from 'vs/editor/browser/controller/mouseTarget';
import { PointerHandler } from 'vs/editor/browser/controller/pointerHandler';
import { IVisibleRangeProvider, TextAreaHandler } from 'vs/editor/browser/controller/textAreaHandler';
import { IContentWidget, IContentWidgetPosition, IEditorAriaOptions, IGlyphMarginWidget, IGlyphMarginWidgetPosition, IMouseTarget, IOverlayWidget, IOverlayWidgetPosition, IViewZoneChangeAccessor } from 'vs/editor/browser/editorBrowser';
import { RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ICommandDelegate, ViewController } from 'vs/editor/browser/view/viewController';
import { ContentViewOverlays, MarginViewOverlays } from 'vs/editor/browser/view/viewOverlays';
import { PartFingerprint, PartFingerprints, ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewUserInputEvents } from 'vs/editor/browser/view/viewUserInputEvents';
import { BlockDecorations } from 'vs/editor/browser/viewParts/blockDecorations/blockDecorations';
import { ViewContentWidgets } from 'vs/editor/browser/viewParts/contentWidgets/contentWidgets';
import { CurrentLineHighlightOverlay, CurrentLineMarginHighlightOverlay } from 'vs/editor/browser/viewParts/currentLineHighlight/currentLineHighlight';
import { DecorationsOverlay } from 'vs/editor/browser/viewParts/decorations/decorations';
import { EditorScrollbar } from 'vs/editor/browser/viewParts/editorScrollbar/editorScrollbar';
import { GlyphMarginWidgets } from 'vs/editor/browser/viewParts/glyphMargin/glyphMargin';
import { IndentGuidesOverlay } from 'vs/editor/browser/viewParts/indentGuides/indentGuides';
import { LineNumbersOverlay } from 'vs/editor/browser/viewParts/lineNumbers/lineNumbers';
import { ViewLines } from 'vs/editor/browser/viewParts/lines/viewLines';
import { LinesDecorationsOverlay } from 'vs/editor/browser/viewParts/linesDecorations/linesDecorations';
import { Margin } from 'vs/editor/browser/viewParts/margin/margin';
import { MarginViewLineDecorationsOverlay } from 'vs/editor/browser/viewParts/marginDecorations/marginDecorations';
import { Minimap } from 'vs/editor/browser/viewParts/minimap/minimap';
import { ViewOverlayWidgets } from 'vs/editor/browser/viewParts/overlayWidgets/overlayWidgets';
import { DecorationsOverviewRuler } from 'vs/editor/browser/viewParts/overviewRuler/decorationsOverviewRuler';
import { OverviewRuler } from 'vs/editor/browser/viewParts/overviewRuler/overviewRuler';
import { Rulers } from 'vs/editor/browser/viewParts/rulers/rulers';
import { ScrollDecorationViewPart } from 'vs/editor/browser/viewParts/scrollDecoration/scrollDecoration';
import { SelectionsOverlay } from 'vs/editor/browser/viewParts/selections/selections';
import { ViewCursors } from 'vs/editor/browser/viewParts/viewCursors/viewCursors';
import { ViewZones } from 'vs/editor/browser/viewParts/viewZones/viewZones';
import { WhitespaceOverlay } from 'vs/editor/browser/viewParts/whitespace/whitespace';
import { IEditorConfiguration } from 'vs/editor/common/config/editorConfiguration';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { GlyphMarginLane, IGlyphMarginLanesModel } from 'vs/editor/common/model';
import { ViewEventHandler } from 'vs/editor/common/viewEventHandler';
import * as viewEvents from 'vs/editor/common/viewEvents';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { IViewModel } from 'vs/editor/common/viewModel';
import { ViewContext } from 'vs/editor/common/viewModel/viewContext';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IColorTheme, getThemeTypeSelector } from 'vs/platform/theme/common/themeService';


export interface IContentWidgetData {
	widget: IContentWidget;
	position: IContentWidgetPosition | null;
}

export interface IOverlayWidgetData {
	widget: IOverlayWidget;
	position: IOverlayWidgetPosition | null;
}

export interface IGlyphMarginWidgetData {
	widget: IGlyphMarginWidget;
	position: IGlyphMarginWidgetPosition;
}

export class View extends ViewEventHandler {

	private readonly _scrollbar: EditorScrollbar;
	private readonly _context: ViewContext;
	private _selections: Selection[];

	// The view lines
	private readonly _viewLines: ViewLines;

	// These are parts, but we must do some API related calls on them, so we keep a reference
	private readonly _viewZones: ViewZones;
	private readonly _contentWidgets: ViewContentWidgets;
	private readonly _overlayWidgets: ViewOverlayWidgets;
	private readonly _glyphMarginWidgets: GlyphMarginWidgets;
	private readonly _viewCursors: ViewCursors;
	private readonly _viewParts: ViewPart[];

	private readonly _textAreaHandler: TextAreaHandler;
	private readonly _pointerHandler: PointerHandler;

	// Dom nodes
	private readonly _linesContent: FastDomNode<HTMLElement>;
	public readonly domNode: FastDomNode<HTMLElement>;
	private readonly _overflowGuardContainer: FastDomNode<HTMLElement>;

	// Actual mutable state
	private _shouldRecomputeGlyphMarginLanes: boolean = false;
	private _renderAnimationFrame: IDisposable | null;

	constructor(
		commandDelegate: ICommandDelegate,
		configuration: IEditorConfiguration,
		colorTheme: IColorTheme,
		model: IViewModel,
		userInputEvents: ViewUserInputEvents,
		overflowWidgetsDomNode: HTMLElement | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
		this._selections = [new Selection(1, 1, 1, 1)];
		this._renderAnimationFrame = null;

		const viewController = new ViewController(configuration, model, userInputEvents, commandDelegate);

		// The view context is passed on to most classes (basically to reduce param. counts in ctors)
		this._context = new ViewContext(configuration, colorTheme, model);

		// Ensure the view is the first event handler in order to update the layout
		this._context.addEventHandler(this);

		this._viewParts = [];

		// Keyboard handler
		this._textAreaHandler = this._instantiationService.createInstance(TextAreaHandler, this._context, viewController, this._createTextAreaHandlerHelper());
		this._viewParts.push(this._textAreaHandler);

		// These two dom nodes must be constructed up front, since references are needed in the layout provider (scrolling & co.)
		this._linesContent = createFastDomNode(document.createElement('div'));
		this._linesContent.setClassName('lines-content' + ' monaco-editor-background');
		this._linesContent.setPosition('absolute');

		this.domNode = createFastDomNode(document.createElement('div'));
		this.domNode.setClassName(this._getEditorClassName());
		// Set role 'code' for better screen reader support https://github.com/microsoft/vscode/issues/93438
		this.domNode.setAttribute('role', 'code');

		this._overflowGuardContainer = createFastDomNode(document.createElement('div'));
		PartFingerprints.write(this._overflowGuardContainer, PartFingerprint.OverflowGuard);
		this._overflowGuardContainer.setClassName('overflow-guard');

		this._scrollbar = new EditorScrollbar(this._context, this._linesContent, this.domNode, this._overflowGuardContainer);
		this._viewParts.push(this._scrollbar);

		// View Lines
		this._viewLines = new ViewLines(this._context, this._linesContent);

		// View Zones
		this._viewZones = new ViewZones(this._context);
		this._viewParts.push(this._viewZones);

		// Decorations overview ruler
		const decorationsOverviewRuler = new DecorationsOverviewRuler(this._context);
		this._viewParts.push(decorationsOverviewRuler);


		const scrollDecoration = new ScrollDecorationViewPart(this._context);
		this._viewParts.push(scrollDecoration);

		const contentViewOverlays = new ContentViewOverlays(this._context);
		this._viewParts.push(contentViewOverlays);
		contentViewOverlays.addDynamicOverlay(new CurrentLineHighlightOverlay(this._context));
		contentViewOverlays.addDynamicOverlay(new SelectionsOverlay(this._context));
		contentViewOverlays.addDynamicOverlay(new IndentGuidesOverlay(this._context));
		contentViewOverlays.addDynamicOverlay(new DecorationsOverlay(this._context));
		contentViewOverlays.addDynamicOverlay(new WhitespaceOverlay(this._context));

		const marginViewOverlays = new MarginViewOverlays(this._context);
		this._viewParts.push(marginViewOverlays);
		marginViewOverlays.addDynamicOverlay(new CurrentLineMarginHighlightOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new MarginViewLineDecorationsOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new LinesDecorationsOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new LineNumbersOverlay(this._context));

		// Glyph margin widgets
		this._glyphMarginWidgets = new GlyphMarginWidgets(this._context);
		this._viewParts.push(this._glyphMarginWidgets);

		const margin = new Margin(this._context);
		margin.getDomNode().appendChild(this._viewZones.marginDomNode);
		margin.getDomNode().appendChild(marginViewOverlays.getDomNode());
		margin.getDomNode().appendChild(this._glyphMarginWidgets.domNode);
		this._viewParts.push(margin);

		// Content widgets
		this._contentWidgets = new ViewContentWidgets(this._context, this.domNode);
		this._viewParts.push(this._contentWidgets);

		this._viewCursors = new ViewCursors(this._context);
		this._viewParts.push(this._viewCursors);

		// Overlay widgets
		this._overlayWidgets = new ViewOverlayWidgets(this._context, this.domNode);
		this._viewParts.push(this._overlayWidgets);

		const rulers = new Rulers(this._context);
		this._viewParts.push(rulers);

		const blockOutline = new BlockDecorations(this._context);
		this._viewParts.push(blockOutline);

		const minimap = new Minimap(this._context);
		this._viewParts.push(minimap);

		// -------------- Wire dom nodes up

		if (decorationsOverviewRuler) {
			const overviewRulerData = this._scrollbar.getOverviewRulerLayoutInfo();
			overviewRulerData.parent.insertBefore(decorationsOverviewRuler.getDomNode(), overviewRulerData.insertBefore);
		}

		this._linesContent.appendChild(contentViewOverlays.getDomNode());
		this._linesContent.appendChild(rulers.domNode);
		this._linesContent.appendChild(this._viewZones.domNode);
		this._linesContent.appendChild(this._viewLines.getDomNode());
		this._linesContent.appendChild(this._contentWidgets.domNode);
		this._linesContent.appendChild(this._viewCursors.getDomNode());
		this._overflowGuardContainer.appendChild(margin.getDomNode());
		this._overflowGuardContainer.appendChild(this._scrollbar.getDomNode());
		this._overflowGuardContainer.appendChild(scrollDecoration.getDomNode());
		this._overflowGuardContainer.appendChild(this._textAreaHandler.textArea);
		this._overflowGuardContainer.appendChild(this._textAreaHandler.textAreaCover);
		this._overflowGuardContainer.appendChild(this._overlayWidgets.getDomNode());
		this._overflowGuardContainer.appendChild(minimap.getDomNode());
		this._overflowGuardContainer.appendChild(blockOutline.domNode);
		this.domNode.appendChild(this._overflowGuardContainer);

		if (overflowWidgetsDomNode) {
			overflowWidgetsDomNode.appendChild(this._contentWidgets.overflowingContentWidgetsDomNode.domNode);
			overflowWidgetsDomNode.appendChild(this._overlayWidgets.overflowingOverlayWidgetsDomNode.domNode);
		} else {
			this.domNode.appendChild(this._contentWidgets.overflowingContentWidgetsDomNode);
			this.domNode.appendChild(this._overlayWidgets.overflowingOverlayWidgetsDomNode);
		}

		this._applyLayout();

		// Pointer handler
		this._pointerHandler = this._register(new PointerHandler(this._context, viewController, this._createPointerHandlerHelper()));
	}

	private _computeGlyphMarginLanes(): IGlyphMarginLanesModel {
		const model = this._context.viewModel.model;
		const laneModel = this._context.viewModel.glyphLanes;
		type Glyph = { range: Range; lane: GlyphMarginLane; persist?: boolean };
		let glyphs: Glyph[] = [];
		let maxLineNumber = 0;

		// Add all margin decorations
		glyphs = glyphs.concat(model.getAllMarginDecorations().map((decoration) => {
			const lane = decoration.options.glyphMargin?.position ?? GlyphMarginLane.Center;
			maxLineNumber = Math.max(maxLineNumber, decoration.range.endLineNumber);
			return { range: decoration.range, lane, persist: decoration.options.glyphMargin?.persistLane };
		}));

		// Add all glyph margin widgets
		glyphs = glyphs.concat(this._glyphMarginWidgets.getWidgets().map((widget) => {
			const range = model.validateRange(widget.preference.range);
			maxLineNumber = Math.max(maxLineNumber, range.endLineNumber);
			return { range, lane: widget.preference.lane };
		}));

		// Sorted by their start position
		glyphs.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));

		laneModel.reset(maxLineNumber);
		for (const glyph of glyphs) {
			laneModel.push(glyph.lane, glyph.range, glyph.persist);
		}

		return laneModel;
	}

	private _createPointerHandlerHelper(): IPointerHandlerHelper {
		return {
			viewDomNode: this.domNode.domNode,
			linesContentDomNode: this._linesContent.domNode,
			viewLinesDomNode: this._viewLines.getDomNode().domNode,

			focusTextArea: () => {
				this.focus();
			},

			dispatchTextAreaEvent: (event: CustomEvent) => {
				this._textAreaHandler.textArea.domNode.dispatchEvent(event);
			},

			getLastRenderData: (): PointerHandlerLastRenderData => {
				const lastViewCursorsRenderData = this._viewCursors.getLastRenderData() || [];
				const lastTextareaPosition = this._textAreaHandler.getLastRenderData();
				return new PointerHandlerLastRenderData(lastViewCursorsRenderData, lastTextareaPosition);
			},
			renderNow: (): void => {
				this.render(true, false);
			},
			shouldSuppressMouseDownOnViewZone: (viewZoneId: string) => {
				return this._viewZones.shouldSuppressMouseDownOnViewZone(viewZoneId);
			},
			shouldSuppressMouseDownOnWidget: (widgetId: string) => {
				return this._contentWidgets.shouldSuppressMouseDownOnWidget(widgetId);
			},
			getPositionFromDOMInfo: (spanNode: HTMLElement, offset: number) => {
				this._flushAccumulatedAndRenderNow();
				return this._viewLines.getPositionFromDOMInfo(spanNode, offset);
			},

			visibleRangeForPosition: (lineNumber: number, column: number) => {
				this._flushAccumulatedAndRenderNow();
				return this._viewLines.visibleRangeForPosition(new Position(lineNumber, column));
			},

			getLineWidth: (lineNumber: number) => {
				this._flushAccumulatedAndRenderNow();
				return this._viewLines.getLineWidth(lineNumber);
			}
		};
	}

	private _createTextAreaHandlerHelper(): IVisibleRangeProvider {
		return {
			visibleRangeForPosition: (position: Position) => {
				this._flushAccumulatedAndRenderNow();
				return this._viewLines.visibleRangeForPosition(position);
			}
		};
	}

	private _applyLayout(): void {
		const options = this._context.configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		this.domNode.setWidth(layoutInfo.width);
		this.domNode.setHeight(layoutInfo.height);

		this._overflowGuardContainer.setWidth(layoutInfo.width);
		this._overflowGuardContainer.setHeight(layoutInfo.height);

		// https://stackoverflow.com/questions/38905916/content-in-google-chrome-larger-than-16777216-px-not-being-rendered
		this._linesContent.setWidth(16777216);
		this._linesContent.setHeight(16777216);
	}

	private _getEditorClassName() {
		const focused = this._textAreaHandler.isFocused() ? ' focused' : '';
		return this._context.configuration.options.get(EditorOption.editorClassName) + ' ' + getThemeTypeSelector(this._context.theme.type) + focused;
	}

	// --- begin event handlers
	public override handleEvents(events: viewEvents.ViewEvent[]): void {
		super.handleEvents(events);
		this._scheduleRender();
	}
	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		this.domNode.setClassName(this._getEditorClassName());
		this._applyLayout();
		return false;
	}
	public override onCursorStateChanged(e: viewEvents.ViewCursorStateChangedEvent): boolean {
		this._selections = e.selections;
		return false;
	}
	public override onDecorationsChanged(e: viewEvents.ViewDecorationsChangedEvent): boolean {
		if (e.affectsGlyphMargin) {
			this._shouldRecomputeGlyphMarginLanes = true;
		}
		return false;
	}
	public override onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boolean {
		this.domNode.setClassName(this._getEditorClassName());
		return false;
	}
	public override onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean {
		this._context.theme.update(e.theme);
		this.domNode.setClassName(this._getEditorClassName());
		return false;
	}

	// --- end event handlers

	public override dispose(): void {
		if (this._renderAnimationFrame !== null) {
			this._renderAnimationFrame.dispose();
			this._renderAnimationFrame = null;
		}

		this._contentWidgets.overflowingContentWidgetsDomNode.domNode.remove();

		this._context.removeEventHandler(this);

		this._viewLines.dispose();

		// Destroy view parts
		for (const viewPart of this._viewParts) {
			viewPart.dispose();
		}

		super.dispose();
	}

	private _scheduleRender(): void {
		if (this._store.isDisposed) {
			throw new BugIndicatingError();
		}
		if (this._renderAnimationFrame === null) {
			const rendering = this._createCoordinatedRendering();
			this._renderAnimationFrame = EditorRenderingCoordinator.INSTANCE.scheduleCoordinatedRendering({
				window: dom.getWindow(this.domNode.domNode),
				prepareRenderText: () => {
					if (this._store.isDisposed) {
						throw new BugIndicatingError();
					}
					try {
						return rendering.prepareRenderText();
					} finally {
						this._renderAnimationFrame = null;
					}
				},
				renderText: () => {
					if (this._store.isDisposed) {
						throw new BugIndicatingError();
					}
					return rendering.renderText();
				},
				prepareRender: (viewParts: ViewPart[], ctx: RenderingContext) => {
					if (this._store.isDisposed) {
						throw new BugIndicatingError();
					}
					return rendering.prepareRender(viewParts, ctx);
				},
				render: (viewParts: ViewPart[], ctx: RestrictedRenderingContext) => {
					if (this._store.isDisposed) {
						throw new BugIndicatingError();
					}
					return rendering.render(viewParts, ctx);
				}
			});
		}
	}

	private _flushAccumulatedAndRenderNow(): void {
		const rendering = this._createCoordinatedRendering();
		safeInvokeNoArg(() => rendering.prepareRenderText());
		const data = safeInvokeNoArg(() => rendering.renderText());
		if (data) {
			const [viewParts, ctx] = data;
			safeInvokeNoArg(() => rendering.prepareRender(viewParts, ctx));
			safeInvokeNoArg(() => rendering.render(viewParts, ctx));
		}
	}

	private _getViewPartsToRender(): ViewPart[] {
		const result: ViewPart[] = [];
		let resultLen = 0;
		for (const viewPart of this._viewParts) {
			if (viewPart.shouldRender()) {
				result[resultLen++] = viewPart;
			}
		}
		return result;
	}

	private _createCoordinatedRendering() {
		return {
			prepareRenderText: () => {
				if (this._shouldRecomputeGlyphMarginLanes) {
					this._shouldRecomputeGlyphMarginLanes = false;
					const model = this._computeGlyphMarginLanes();
					this._context.configuration.setGlyphMarginDecorationLaneCount(model.requiredLanes);
				}
				inputLatency.onRenderStart();
			},
			renderText: (): [ViewPart[], RenderingContext] | null => {
				if (!this.domNode.domNode.isConnected) {
					return null;
				}
				let viewPartsToRender = this._getViewPartsToRender();
				if (!this._viewLines.shouldRender() && viewPartsToRender.length === 0) {
					// Nothing to render
					return null;
				}
				const partialViewportData = this._context.viewLayout.getLinesViewportData();
				this._context.viewModel.setViewport(partialViewportData.startLineNumber, partialViewportData.endLineNumber, partialViewportData.centeredLineNumber);

				const viewportData = new ViewportData(
					this._selections,
					partialViewportData,
					this._context.viewLayout.getWhitespaceViewportData(),
					this._context.viewModel
				);

				if (this._contentWidgets.shouldRender()) {
					// Give the content widgets a chance to set their max width before a possible synchronous layout
					this._contentWidgets.onBeforeRender(viewportData);
				}

				if (this._viewLines.shouldRender()) {
					this._viewLines.renderText(viewportData);
					this._viewLines.onDidRender();

					// Rendering of viewLines might cause scroll events to occur, so collect view parts to render again
					viewPartsToRender = this._getViewPartsToRender();
				}

				return [viewPartsToRender, new RenderingContext(this._context.viewLayout, viewportData, this._viewLines)];
			},
			prepareRender: (viewPartsToRender: ViewPart[], ctx: RenderingContext) => {
				for (const viewPart of viewPartsToRender) {
					viewPart.prepareRender(ctx);
				}
			},
			render: (viewPartsToRender: ViewPart[], ctx: RestrictedRenderingContext) => {
				for (const viewPart of viewPartsToRender) {
					viewPart.render(ctx);
					viewPart.onDidRender();
				}
			}
		};
	}

	// --- BEGIN CodeEditor helpers

	public delegateVerticalScrollbarPointerDown(browserEvent: PointerEvent): void {
		this._scrollbar.delegateVerticalScrollbarPointerDown(browserEvent);
	}

	public delegateScrollFromMouseWheelEvent(browserEvent: IMouseWheelEvent) {
		this._scrollbar.delegateScrollFromMouseWheelEvent(browserEvent);
	}

	public restoreState(scrollPosition: { scrollLeft: number; scrollTop: number }): void {
		this._context.viewModel.viewLayout.setScrollPosition({
			scrollTop: scrollPosition.scrollTop,
			scrollLeft: scrollPosition.scrollLeft
		}, ScrollType.Immediate);
		this._context.viewModel.visibleLinesStabilized();
	}

	public getOffsetForColumn(modelLineNumber: number, modelColumn: number): number {
		const modelPosition = this._context.viewModel.model.validatePosition({
			lineNumber: modelLineNumber,
			column: modelColumn
		});
		const viewPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
		this._flushAccumulatedAndRenderNow();
		const visibleRange = this._viewLines.visibleRangeForPosition(new Position(viewPosition.lineNumber, viewPosition.column));
		if (!visibleRange) {
			return -1;
		}
		return visibleRange.left;
	}

	public getTargetAtClientPoint(clientX: number, clientY: number): IMouseTarget | null {
		const mouseTarget = this._pointerHandler.getTargetAtClientPoint(clientX, clientY);
		if (!mouseTarget) {
			return null;
		}
		return ViewUserInputEvents.convertViewToModelMouseTarget(mouseTarget, this._context.viewModel.coordinatesConverter);
	}

	public createOverviewRuler(cssClassName: string): OverviewRuler {
		return new OverviewRuler(this._context, cssClassName);
	}

	public change(callback: (changeAccessor: IViewZoneChangeAccessor) => any): void {
		this._viewZones.changeViewZones(callback);
		this._scheduleRender();
	}

	public render(now: boolean, everything: boolean): void {
		if (everything) {
			// Force everything to render...
			this._viewLines.forceShouldRender();
			for (const viewPart of this._viewParts) {
				viewPart.forceShouldRender();
			}
		}
		if (now) {
			this._flushAccumulatedAndRenderNow();
		} else {
			this._scheduleRender();
		}
	}

	public writeScreenReaderContent(reason: string): void {
		this._textAreaHandler.writeScreenReaderContent(reason);
	}

	public focus(): void {
		this._textAreaHandler.focusTextArea();
	}

	public isFocused(): boolean {
		return this._textAreaHandler.isFocused();
	}

	public refreshFocusState() {
		this._textAreaHandler.refreshFocusState();
	}

	public setAriaOptions(options: IEditorAriaOptions): void {
		this._textAreaHandler.setAriaOptions(options);
	}

	public addContentWidget(widgetData: IContentWidgetData): void {
		this._contentWidgets.addWidget(widgetData.widget);
		this.layoutContentWidget(widgetData);
		this._scheduleRender();
	}

	public layoutContentWidget(widgetData: IContentWidgetData): void {
		this._contentWidgets.setWidgetPosition(
			widgetData.widget,
			widgetData.position?.position ?? null,
			widgetData.position?.secondaryPosition ?? null,
			widgetData.position?.preference ?? null,
			widgetData.position?.positionAffinity ?? null
		);
		this._scheduleRender();
	}

	public removeContentWidget(widgetData: IContentWidgetData): void {
		this._contentWidgets.removeWidget(widgetData.widget);
		this._scheduleRender();
	}

	public addOverlayWidget(widgetData: IOverlayWidgetData): void {
		this._overlayWidgets.addWidget(widgetData.widget);
		this.layoutOverlayWidget(widgetData);
		this._scheduleRender();
	}

	public layoutOverlayWidget(widgetData: IOverlayWidgetData): void {
		const shouldRender = this._overlayWidgets.setWidgetPosition(widgetData.widget, widgetData.position);
		if (shouldRender) {
			this._scheduleRender();
		}
	}

	public removeOverlayWidget(widgetData: IOverlayWidgetData): void {
		this._overlayWidgets.removeWidget(widgetData.widget);
		this._scheduleRender();
	}

	public addGlyphMarginWidget(widgetData: IGlyphMarginWidgetData): void {
		this._glyphMarginWidgets.addWidget(widgetData.widget);
		this._shouldRecomputeGlyphMarginLanes = true;
		this._scheduleRender();
	}

	public layoutGlyphMarginWidget(widgetData: IGlyphMarginWidgetData): void {
		const newPreference = widgetData.position;
		const shouldRender = this._glyphMarginWidgets.setWidgetPosition(widgetData.widget, newPreference);
		if (shouldRender) {
			this._shouldRecomputeGlyphMarginLanes = true;
			this._scheduleRender();
		}
	}

	public removeGlyphMarginWidget(widgetData: IGlyphMarginWidgetData): void {
		this._glyphMarginWidgets.removeWidget(widgetData.widget);
		this._shouldRecomputeGlyphMarginLanes = true;
		this._scheduleRender();
	}

	// --- END CodeEditor helpers

}

function safeInvokeNoArg<T>(func: () => T): T | null {
	try {
		return func();
	} catch (e) {
		onUnexpectedError(e);
		return null;
	}
}

interface ICoordinatedRendering {
	readonly window: CodeWindow;
	prepareRenderText(): void;
	renderText(): [ViewPart[], RenderingContext] | null;
	prepareRender(viewParts: ViewPart[], ctx: RenderingContext): void;
	render(viewParts: ViewPart[], ctx: RestrictedRenderingContext): void;
}

class EditorRenderingCoordinator {

	public static INSTANCE = new EditorRenderingCoordinator();

	private _coordinatedRenderings: ICoordinatedRendering[] = [];
	private _animationFrameRunners = new Map<CodeWindow, IDisposable>();

	private constructor() { }

	scheduleCoordinatedRendering(rendering: ICoordinatedRendering): IDisposable {
		this._coordinatedRenderings.push(rendering);
		this._scheduleRender(rendering.window);
		return {
			dispose: () => {
				const renderingIndex = this._coordinatedRenderings.indexOf(rendering);
				if (renderingIndex === -1) {
					return;
				}
				this._coordinatedRenderings.splice(renderingIndex, 1);

				if (this._coordinatedRenderings.length === 0) {
					// There are no more renderings to coordinate => cancel animation frames
					for (const [_, disposable] of this._animationFrameRunners) {
						disposable.dispose();
					}
					this._animationFrameRunners.clear();
				}
			}
		};
	}

	private _scheduleRender(window: CodeWindow): void {
		if (!this._animationFrameRunners.has(window)) {
			const runner = () => {
				this._animationFrameRunners.delete(window);
				this._onRenderScheduled();
			};
			this._animationFrameRunners.set(window, dom.runAtThisOrScheduleAtNextAnimationFrame(window, runner, 100));
		}
	}

	private _onRenderScheduled(): void {
		const coordinatedRenderings = this._coordinatedRenderings.slice(0);
		this._coordinatedRenderings = [];

		for (const rendering of coordinatedRenderings) {
			safeInvokeNoArg(() => rendering.prepareRenderText());
		}

		const datas: ([ViewPart[], RenderingContext] | null)[] = [];
		for (let i = 0, len = coordinatedRenderings.length; i < len; i++) {
			const rendering = coordinatedRenderings[i];
			datas[i] = safeInvokeNoArg(() => rendering.renderText());
		}

		for (let i = 0, len = coordinatedRenderings.length; i < len; i++) {
			const rendering = coordinatedRenderings[i];
			const data = datas[i];
			if (!data) {
				continue;
			}
			const [viewParts, ctx] = data;
			safeInvokeNoArg(() => rendering.prepareRender(viewParts, ctx));
		}

		for (let i = 0, len = coordinatedRenderings.length; i < len; i++) {
			const rendering = coordinatedRenderings[i];
			const data = datas[i];
			if (!data) {
				continue;
			}
			const [viewParts, ctx] = data;
			safeInvokeNoArg(() => rendering.render(viewParts, ctx));
		}
	}
}
