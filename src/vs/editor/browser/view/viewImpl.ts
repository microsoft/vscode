/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IPointerHandlerHelper } from 'vs/editor/browser/controller/mouseHandler';
import { PointerHandler } from 'vs/editor/browser/controller/pointerHandler';
import { ITextAreaHandlerHelper, TextAreaHandler } from 'vs/editor/browser/controller/textAreaHandler';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { ICommandDelegate, ViewController } from 'vs/editor/browser/view/viewController';
import { ViewOutgoingEvents } from 'vs/editor/browser/view/viewOutgoingEvents';
import { ContentViewOverlays, MarginViewOverlays } from 'vs/editor/browser/view/viewOverlays';
import { PartFingerprint, PartFingerprints, ViewPart } from 'vs/editor/browser/view/viewPart';
import { ViewContentWidgets } from 'vs/editor/browser/viewParts/contentWidgets/contentWidgets';
import { CurrentLineHighlightOverlay } from 'vs/editor/browser/viewParts/currentLineHighlight/currentLineHighlight';
import { CurrentLineMarginHighlightOverlay } from 'vs/editor/browser/viewParts/currentLineMarginHighlight/currentLineMarginHighlight';
import { DecorationsOverlay } from 'vs/editor/browser/viewParts/decorations/decorations';
import { EditorScrollbar } from 'vs/editor/browser/viewParts/editorScrollbar/editorScrollbar';
import { GlyphMarginOverlay } from 'vs/editor/browser/viewParts/glyphMargin/glyphMargin';
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
import { Cursor } from 'vs/editor/common/controller/cursor';
import { Position } from 'vs/editor/common/core/position';
import { IConfiguration } from 'vs/editor/common/editorCommon';
import { RenderingContext } from 'vs/editor/common/view/renderingContext';
import { ViewContext } from 'vs/editor/common/view/viewContext';
import { ViewEventDispatcher } from 'vs/editor/common/view/viewEventDispatcher';
import * as viewEvents from 'vs/editor/common/view/viewEvents';
import { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';
import { ViewEventHandler } from 'vs/editor/common/viewModel/viewEventHandler';
import { IViewModel } from 'vs/editor/common/viewModel/viewModel';
import { IThemeService, getThemeTypeSelector } from 'vs/platform/theme/common/themeService';

export interface IContentWidgetData {
	widget: editorBrowser.IContentWidget;
	position: editorBrowser.IContentWidgetPosition | null;
}

export interface IOverlayWidgetData {
	widget: editorBrowser.IOverlayWidget;
	position: editorBrowser.IOverlayWidgetPosition | null;
}

const invalidFunc = () => { throw new Error(`Invalid change accessor`); };

export class View extends ViewEventHandler {

	private readonly eventDispatcher: ViewEventDispatcher;

	private _scrollbar: EditorScrollbar;
	private readonly _context: ViewContext;
	private readonly _cursor: Cursor;

	// The view lines
	private viewLines: ViewLines;

	// These are parts, but we must do some API related calls on them, so we keep a reference
	private viewZones: ViewZones;
	private contentWidgets: ViewContentWidgets;
	private overlayWidgets: ViewOverlayWidgets;
	private viewCursors: ViewCursors;
	private viewParts: ViewPart[];

	private readonly _textAreaHandler: TextAreaHandler;
	private readonly pointerHandler: PointerHandler;

	private readonly outgoingEvents: ViewOutgoingEvents;

	// Dom nodes
	private linesContent: FastDomNode<HTMLElement>;
	public domNode: FastDomNode<HTMLElement>;
	private overflowGuardContainer: FastDomNode<HTMLElement>;

	// Actual mutable state
	private _renderAnimationFrame: IDisposable | null;

	constructor(
		commandDelegate: ICommandDelegate,
		configuration: IConfiguration,
		themeService: IThemeService,
		model: IViewModel,
		cursor: Cursor,
		outgoingEvents: ViewOutgoingEvents
	) {
		super();
		this._cursor = cursor;
		this._renderAnimationFrame = null;
		this.outgoingEvents = outgoingEvents;

		const viewController = new ViewController(configuration, model, this.outgoingEvents, commandDelegate);

		// The event dispatcher will always go through _renderOnce before dispatching any events
		this.eventDispatcher = new ViewEventDispatcher((callback: () => void) => this._renderOnce(callback));

		// Ensure the view is the first event handler in order to update the layout
		this.eventDispatcher.addEventHandler(this);

		// The view context is passed on to most classes (basically to reduce param. counts in ctors)
		this._context = new ViewContext(configuration, themeService.getTheme(), model, this.eventDispatcher);

		this._register(themeService.onThemeChange(theme => {
			this._context.theme = theme;
			this.eventDispatcher.emit(new viewEvents.ViewThemeChangedEvent());
			this.render(true, false);
		}));

		this.viewParts = [];

		// Keyboard handler
		this._textAreaHandler = new TextAreaHandler(this._context, viewController, this.createTextAreaHandlerHelper());
		this.viewParts.push(this._textAreaHandler);

		// These two dom nodes must be constructed up front, since references are needed in the layout provider (scrolling & co.)
		this.linesContent = createFastDomNode(document.createElement('div'));
		this.linesContent.setClassName('lines-content' + ' monaco-editor-background');
		this.linesContent.setPosition('absolute');

		this.domNode = createFastDomNode(document.createElement('div'));
		this.domNode.setClassName(this.getEditorClassName());

		this.overflowGuardContainer = createFastDomNode(document.createElement('div'));
		PartFingerprints.write(this.overflowGuardContainer, PartFingerprint.OverflowGuard);
		this.overflowGuardContainer.setClassName('overflow-guard');

		this._scrollbar = new EditorScrollbar(this._context, this.linesContent, this.domNode, this.overflowGuardContainer);
		this.viewParts.push(this._scrollbar);

		// View Lines
		this.viewLines = new ViewLines(this._context, this.linesContent);

		// View Zones
		this.viewZones = new ViewZones(this._context);
		this.viewParts.push(this.viewZones);

		// Decorations overview ruler
		const decorationsOverviewRuler = new DecorationsOverviewRuler(this._context);
		this.viewParts.push(decorationsOverviewRuler);


		const scrollDecoration = new ScrollDecorationViewPart(this._context);
		this.viewParts.push(scrollDecoration);

		const contentViewOverlays = new ContentViewOverlays(this._context);
		this.viewParts.push(contentViewOverlays);
		contentViewOverlays.addDynamicOverlay(new CurrentLineHighlightOverlay(this._context));
		contentViewOverlays.addDynamicOverlay(new SelectionsOverlay(this._context));
		contentViewOverlays.addDynamicOverlay(new IndentGuidesOverlay(this._context));
		contentViewOverlays.addDynamicOverlay(new DecorationsOverlay(this._context));

		const marginViewOverlays = new MarginViewOverlays(this._context);
		this.viewParts.push(marginViewOverlays);
		marginViewOverlays.addDynamicOverlay(new CurrentLineMarginHighlightOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new GlyphMarginOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new MarginViewLineDecorationsOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new LinesDecorationsOverlay(this._context));
		marginViewOverlays.addDynamicOverlay(new LineNumbersOverlay(this._context));

		const margin = new Margin(this._context);
		margin.getDomNode().appendChild(this.viewZones.marginDomNode);
		margin.getDomNode().appendChild(marginViewOverlays.getDomNode());
		this.viewParts.push(margin);

		// Content widgets
		this.contentWidgets = new ViewContentWidgets(this._context, this.domNode);
		this.viewParts.push(this.contentWidgets);

		this.viewCursors = new ViewCursors(this._context);
		this.viewParts.push(this.viewCursors);

		// Overlay widgets
		this.overlayWidgets = new ViewOverlayWidgets(this._context);
		this.viewParts.push(this.overlayWidgets);

		const rulers = new Rulers(this._context);
		this.viewParts.push(rulers);

		const minimap = new Minimap(this._context);
		this.viewParts.push(minimap);

		// -------------- Wire dom nodes up

		if (decorationsOverviewRuler) {
			const overviewRulerData = this._scrollbar.getOverviewRulerLayoutInfo();
			overviewRulerData.parent.insertBefore(decorationsOverviewRuler.getDomNode(), overviewRulerData.insertBefore);
		}

		this.linesContent.appendChild(contentViewOverlays.getDomNode());
		this.linesContent.appendChild(rulers.domNode);
		this.linesContent.appendChild(this.viewZones.domNode);
		this.linesContent.appendChild(this.viewLines.getDomNode());
		this.linesContent.appendChild(this.contentWidgets.domNode);
		this.linesContent.appendChild(this.viewCursors.getDomNode());
		this.overflowGuardContainer.appendChild(margin.getDomNode());
		this.overflowGuardContainer.appendChild(this._scrollbar.getDomNode());
		this.overflowGuardContainer.appendChild(scrollDecoration.getDomNode());
		this.overflowGuardContainer.appendChild(this._textAreaHandler.textArea);
		this.overflowGuardContainer.appendChild(this._textAreaHandler.textAreaCover);
		this.overflowGuardContainer.appendChild(this.overlayWidgets.getDomNode());
		this.overflowGuardContainer.appendChild(minimap.getDomNode());
		this.domNode.appendChild(this.overflowGuardContainer);
		this.domNode.appendChild(this.contentWidgets.overflowingContentWidgetsDomNode);

		this._setLayout();

		// Pointer handler
		this.pointerHandler = this._register(new PointerHandler(this._context, viewController, this.createPointerHandlerHelper()));

		this._register(model.addEventListener((events: viewEvents.ViewEvent[]) => {
			this.eventDispatcher.emitMany(events);
		}));

		this._register(this._cursor.addEventListener((events: viewEvents.ViewEvent[]) => {
			this.eventDispatcher.emitMany(events);
		}));
	}

	private _flushAccumulatedAndRenderNow(): void {
		this._renderNow();
	}

	private createPointerHandlerHelper(): IPointerHandlerHelper {
		return {
			viewDomNode: this.domNode.domNode,
			linesContentDomNode: this.linesContent.domNode,

			focusTextArea: () => {
				this.focus();
			},

			getLastViewCursorsRenderData: () => {
				return this.viewCursors.getLastRenderData() || [];
			},
			shouldSuppressMouseDownOnViewZone: (viewZoneId: string) => {
				return this.viewZones.shouldSuppressMouseDownOnViewZone(viewZoneId);
			},
			shouldSuppressMouseDownOnWidget: (widgetId: string) => {
				return this.contentWidgets.shouldSuppressMouseDownOnWidget(widgetId);
			},
			getPositionFromDOMInfo: (spanNode: HTMLElement, offset: number) => {
				this._flushAccumulatedAndRenderNow();
				return this.viewLines.getPositionFromDOMInfo(spanNode, offset);
			},

			visibleRangeForPosition2: (lineNumber: number, column: number) => {
				this._flushAccumulatedAndRenderNow();
				return this.viewLines.visibleRangeForPosition(new Position(lineNumber, column));
			},

			getLineWidth: (lineNumber: number) => {
				this._flushAccumulatedAndRenderNow();
				return this.viewLines.getLineWidth(lineNumber);
			}
		};
	}

	private createTextAreaHandlerHelper(): ITextAreaHandlerHelper {
		return {
			visibleRangeForPositionRelativeToEditor: (lineNumber: number, column: number) => {
				this._flushAccumulatedAndRenderNow();
				return this.viewLines.visibleRangeForPosition(new Position(lineNumber, column));
			}
		};
	}

	private _setLayout(): void {
		const layoutInfo = this._context.configuration.editor.layoutInfo;
		this.domNode.setWidth(layoutInfo.width);
		this.domNode.setHeight(layoutInfo.height);

		this.overflowGuardContainer.setWidth(layoutInfo.width);
		this.overflowGuardContainer.setHeight(layoutInfo.height);

		this.linesContent.setWidth(1000000);
		this.linesContent.setHeight(1000000);

	}

	private getEditorClassName() {
		const focused = this._textAreaHandler.isFocused() ? ' focused' : '';
		return this._context.configuration.editor.editorClassName + ' ' + getThemeTypeSelector(this._context.theme.type) + focused;
	}

	// --- begin event handlers

	public onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		if (e.editorClassName) {
			this.domNode.setClassName(this.getEditorClassName());
		}
		if (e.layoutInfo) {
			this._setLayout();
		}
		return false;
	}
	public onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boolean {
		this.domNode.setClassName(this.getEditorClassName());
		this._context.model.setHasFocus(e.isFocused);
		if (e.isFocused) {
			this.outgoingEvents.emitViewFocusGained();
		} else {
			this.outgoingEvents.emitViewFocusLost();
		}
		return false;
	}
	public onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		this.outgoingEvents.emitScrollChanged(e);
		return false;
	}
	public onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boolean {
		this.domNode.setClassName(this.getEditorClassName());
		return false;
	}

	// --- end event handlers

	public dispose(): void {
		if (this._renderAnimationFrame !== null) {
			this._renderAnimationFrame.dispose();
			this._renderAnimationFrame = null;
		}

		this.eventDispatcher.removeEventHandler(this);
		this.outgoingEvents.dispose();

		this.viewLines.dispose();

		// Destroy view parts
		for (let i = 0, len = this.viewParts.length; i < len; i++) {
			this.viewParts[i].dispose();
		}
		this.viewParts = [];

		super.dispose();
	}

	private _renderOnce(callback: () => any): any {
		const r = safeInvokeNoArg(callback);
		this._scheduleRender();
		return r;
	}

	private _scheduleRender(): void {
		if (this._renderAnimationFrame === null) {
			this._renderAnimationFrame = dom.runAtThisOrScheduleAtNextAnimationFrame(this._onRenderScheduled.bind(this), 100);
		}
	}

	private _onRenderScheduled(): void {
		this._renderAnimationFrame = null;
		this._flushAccumulatedAndRenderNow();
	}

	private _renderNow(): void {
		safeInvokeNoArg(() => this._actualRender());
	}

	private _getViewPartsToRender(): ViewPart[] {
		let result: ViewPart[] = [], resultLen = 0;
		for (let i = 0, len = this.viewParts.length; i < len; i++) {
			const viewPart = this.viewParts[i];
			if (viewPart.shouldRender()) {
				result[resultLen++] = viewPart;
			}
		}
		return result;
	}

	private _actualRender(): void {
		if (!dom.isInDOM(this.domNode.domNode)) {
			return;
		}

		let viewPartsToRender = this._getViewPartsToRender();

		if (!this.viewLines.shouldRender() && viewPartsToRender.length === 0) {
			// Nothing to render
			return;
		}

		const partialViewportData = this._context.viewLayout.getLinesViewportData();
		this._context.model.setViewport(partialViewportData.startLineNumber, partialViewportData.endLineNumber, partialViewportData.centeredLineNumber);

		const viewportData = new ViewportData(
			this._cursor.getViewSelections(),
			partialViewportData,
			this._context.viewLayout.getWhitespaceViewportData(),
			this._context.model
		);

		if (this.contentWidgets.shouldRender()) {
			// Give the content widgets a chance to set their max width before a possible synchronous layout
			this.contentWidgets.onBeforeRender(viewportData);
		}

		if (this.viewLines.shouldRender()) {
			this.viewLines.renderText(viewportData);
			this.viewLines.onDidRender();

			// Rendering of viewLines might cause scroll events to occur, so collect view parts to render again
			viewPartsToRender = this._getViewPartsToRender();
		}

		const renderingContext = new RenderingContext(this._context.viewLayout, viewportData, this.viewLines);

		// Render the rest of the parts
		for (let i = 0, len = viewPartsToRender.length; i < len; i++) {
			const viewPart = viewPartsToRender[i];
			viewPart.prepareRender(renderingContext);
		}

		for (let i = 0, len = viewPartsToRender.length; i < len; i++) {
			const viewPart = viewPartsToRender[i];
			viewPart.render(renderingContext);
			viewPart.onDidRender();
		}
	}

	// --- BEGIN CodeEditor helpers

	public delegateVerticalScrollbarMouseDown(browserEvent: IMouseEvent): void {
		this._scrollbar.delegateVerticalScrollbarMouseDown(browserEvent);
	}

	public restoreState(scrollPosition: { scrollLeft: number; scrollTop: number; }): void {
		this._context.viewLayout.setScrollPositionNow({ scrollTop: scrollPosition.scrollTop });
		this._context.model.tokenizeViewport();
		this._renderNow();
		this.viewLines.updateLineWidths();
		this._context.viewLayout.setScrollPositionNow({ scrollLeft: scrollPosition.scrollLeft });
	}

	public getOffsetForColumn(modelLineNumber: number, modelColumn: number): number {
		const modelPosition = this._context.model.validateModelPosition({
			lineNumber: modelLineNumber,
			column: modelColumn
		});
		const viewPosition = this._context.model.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
		this._flushAccumulatedAndRenderNow();
		const visibleRange = this.viewLines.visibleRangeForPosition(new Position(viewPosition.lineNumber, viewPosition.column));
		if (!visibleRange) {
			return -1;
		}
		return visibleRange.left;
	}

	public getTargetAtClientPoint(clientX: number, clientY: number): editorBrowser.IMouseTarget | null {
		return this.pointerHandler.getTargetAtClientPoint(clientX, clientY);
	}

	public createOverviewRuler(cssClassName: string): OverviewRuler {
		return new OverviewRuler(this._context, cssClassName);
	}

	public change(callback: (changeAccessor: editorBrowser.IViewZoneChangeAccessor) => any): boolean {
		let zonesHaveChanged = false;

		this._renderOnce(() => {
			const changeAccessor: editorBrowser.IViewZoneChangeAccessor = {
				addZone: (zone: editorBrowser.IViewZone): string => {
					zonesHaveChanged = true;
					return this.viewZones.addZone(zone);
				},
				removeZone: (id: string): void => {
					if (!id) {
						return;
					}
					zonesHaveChanged = this.viewZones.removeZone(id) || zonesHaveChanged;
				},
				layoutZone: (id: string): void => {
					if (!id) {
						return;
					}
					zonesHaveChanged = this.viewZones.layoutZone(id) || zonesHaveChanged;
				}
			};

			safeInvoke1Arg(callback, changeAccessor);

			// Invalidate changeAccessor
			changeAccessor.addZone = invalidFunc;
			changeAccessor.removeZone = invalidFunc;
			changeAccessor.layoutZone = invalidFunc;

			if (zonesHaveChanged) {
				this._context.viewLayout.onHeightMaybeChanged();
				this._context.privateViewEventBus.emit(new viewEvents.ViewZonesChangedEvent());
			}
		});
		return zonesHaveChanged;
	}

	public render(now: boolean, everything: boolean): void {
		if (everything) {
			// Force everything to render...
			this.viewLines.forceShouldRender();
			for (let i = 0, len = this.viewParts.length; i < len; i++) {
				const viewPart = this.viewParts[i];
				viewPart.forceShouldRender();
			}
		}
		if (now) {
			this._flushAccumulatedAndRenderNow();
		} else {
			this._scheduleRender();
		}
	}

	public focus(): void {
		this._textAreaHandler.focusTextArea();
	}

	public isFocused(): boolean {
		return this._textAreaHandler.isFocused();
	}

	public addContentWidget(widgetData: IContentWidgetData): void {
		this.contentWidgets.addWidget(widgetData.widget);
		this.layoutContentWidget(widgetData);
		this._scheduleRender();
	}

	public layoutContentWidget(widgetData: IContentWidgetData): void {
		const newPosition = widgetData.position ? widgetData.position.position : null;
		const newRange = widgetData.position ? widgetData.position.range || null : null;
		const newPreference = widgetData.position ? widgetData.position.preference : null;
		this.contentWidgets.setWidgetPosition(widgetData.widget, newPosition, newRange, newPreference);
		this._scheduleRender();
	}

	public removeContentWidget(widgetData: IContentWidgetData): void {
		this.contentWidgets.removeWidget(widgetData.widget);
		this._scheduleRender();
	}

	public addOverlayWidget(widgetData: IOverlayWidgetData): void {
		this.overlayWidgets.addWidget(widgetData.widget);
		this.layoutOverlayWidget(widgetData);
		this._scheduleRender();
	}

	public layoutOverlayWidget(widgetData: IOverlayWidgetData): void {
		const newPreference = widgetData.position ? widgetData.position.preference : null;
		const shouldRender = this.overlayWidgets.setWidgetPosition(widgetData.widget, newPreference);
		if (shouldRender) {
			this._scheduleRender();
		}
	}

	public removeOverlayWidget(widgetData: IOverlayWidgetData): void {
		this.overlayWidgets.removeWidget(widgetData.widget);
		this._scheduleRender();
	}

	// --- END CodeEditor helpers

}

function safeInvokeNoArg(func: Function): any {
	try {
		return func();
	} catch (e) {
		onUnexpectedError(e);
	}
}

function safeInvoke1Arg(func: Function, arg1: any): any {
	try {
		return func(arg1);
	} catch (e) {
		onUnexpectedError(e);
	}
}
