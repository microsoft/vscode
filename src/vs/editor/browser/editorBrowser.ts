/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEmitterEvent, IEventEmitter} from 'vs/base/common/eventEmitter';
import {IDisposable} from 'vs/base/common/lifecycle';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IMouseEvent} from 'vs/base/browser/mouseEvent';
import {IInstantiationService, IConstructorSignature1} from 'vs/platform/instantiation/common/instantiation';
import * as editorCommon from 'vs/editor/common/editorCommon';

export interface IDynamicViewOverlay extends IDisposable {
	shouldCallRender2(ctx:IRenderingContext): boolean;
	render2(lineNumber:number): string[];
}

export interface IContentWidgetData {
	widget: IContentWidget;
	position: IContentWidgetPosition;
}

export interface IOverlayWidgetData {
	widget: IOverlayWidget;
	position: IOverlayWidgetPosition;
}

export interface ICodeEditorHelper {
	getScrollTop(): number;
	setScrollTop(scrollTop:number): void;
	getScrollLeft(): number;
	setScrollLeft(scrollLeft:number): void;
	getScrollHeight(): number;
	getScrollWidth(): number;
	getVerticalOffsetForPosition(lineNumber:number, column:number): number;
	delegateVerticalScrollbarMouseDown(browserEvent:MouseEvent): void;
	getOffsetForColumn(lineNumber:number, column:number): number;
}

export interface IKeyboardHandlerHelper {
	viewDomNode:HTMLElement;
	textArea:HTMLTextAreaElement;
	visibleRangeForPositionRelativeToEditor(lineNumber:number, column:number): editorCommon.VisibleRange;
	flushAnyAccumulatedEvents(): void;
}

export interface IPointerHandlerHelper {
	viewDomNode:HTMLElement;
	linesContentDomNode:HTMLElement;

	focusTextArea(): void;
	isDirty(): boolean;

	getScrollTop(): number;
	setScrollTop(scrollTop:number): void;
	getScrollLeft(): number;
	setScrollLeft(scrollLeft:number): void;

	isAfterLines(verticalOffset:number): boolean;
	getLineNumberAtVerticalOffset(verticalOffset: number): number;
	getVerticalOffsetForLineNumber(lineNumber: number): number;
	getWhitespaceAtVerticalOffset(verticalOffset:number): editorCommon.IViewWhitespaceViewportData;
	shouldSuppressMouseDownOnViewZone(viewZoneId:number): boolean;

	/**
	 * Decode an Editor.IPosition from a rendered dom node
	 */
	getPositionFromDOMInfo(spanNode:HTMLElement, offset:number): editorCommon.IPosition;

	visibleRangeForPosition2(lineNumber:number, column:number): editorCommon.VisibleRange;
	getLineWidth(lineNumber:number): number;
}

export interface IView extends IDisposable {
	domNode: HTMLElement;

	getInternalEventBus(): IEventEmitter;

	createOverviewRuler(cssClassName:string, minimumHeight:number, maximumHeight:number): IOverviewRuler;
	getCodeEditorHelper(): ICodeEditorHelper;

	getCenteredRangeInViewport(): editorCommon.IEditorRange;

	change(callback:(changeAccessor:IViewZoneChangeAccessor) => any): boolean;
	getWhitespaces(): editorCommon.IEditorWhitespace[];
	renderOnce(callback:() => any): any;

	render(now:boolean, everything:boolean): void;
	setAriaActiveDescendant(id:string): void;

	focus(): void;
	isFocused(): boolean;

	saveState(): editorCommon.IViewState;
	restoreState(state:editorCommon.IViewState): void;

	addContentWidget(widgetData: IContentWidgetData): void;
	layoutContentWidget(widgetData: IContentWidgetData): void;
	removeContentWidget(widgetData: IContentWidgetData): void;

	addOverlayWidget(widgetData: IOverlayWidgetData): void;
	layoutOverlayWidget(widgetData: IOverlayWidgetData): void;
	removeOverlayWidget(widgetData: IOverlayWidgetData): void;
}

export interface IViewZoneData {
	viewZoneId: number;
	positionBefore:editorCommon.IEditorPosition;
	positionAfter:editorCommon.IEditorPosition;
	position: editorCommon.IEditorPosition;
	afterLineNumber: number;
}

export interface IMouseDispatchData {
	position: editorCommon.IEditorPosition;
	/**
	 * Desired mouse column (e.g. when position.column gets clamped to text length -- clicking after text on a line).
	 */
	mouseColumn: number;
	startedOnLineNumbers: boolean;

	inSelectionMode: boolean;
	mouseDownCount: number;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
}

export interface IViewController {
	dispatchMouse(data:IMouseDispatchData);

	moveTo(source:string, position:editorCommon.IEditorPosition): void;

	paste(source:string, text:string, pasteOnNewLine:boolean): void;
	type(source: string, text: string): void;
	replacePreviousChar(source: string, text: string, replaceCharCnt:number): void;
	cut(source:string): void;

	emitKeyDown(e:IKeyboardEvent): void;
	emitKeyUp(e:IKeyboardEvent): void;
	emitContextMenu(e:IEditorMouseEvent): void;
	emitMouseMove(e:IEditorMouseEvent): void;
	emitMouseLeave(e:IEditorMouseEvent): void;
	emitMouseUp(e:IEditorMouseEvent): void;
	emitMouseDown(e:IEditorMouseEvent): void;
}

export var ClassNames = {
	TEXTAREA_COVER: 'textAreaCover',
	TEXTAREA: 'inputarea',
	LINES_CONTENT: 'lines-content',
	OVERFLOW_GUARD: 'overflow-guard',
	VIEW_LINES: 'view-lines',
	VIEW_LINE: 'view-line',
	SCROLLABLE_ELEMENT: 'editor-scrollable',
	CONTENT_WIDGETS: 'contentWidgets',
	OVERFLOWING_CONTENT_WIDGETS: 'overflowingContentWidgets',
	OVERLAY_WIDGETS: 'overlayWidgets',
	MARGIN_VIEW_OVERLAYS: 'margin-view-overlays',
	LINE_NUMBERS: 'line-numbers',
	GLYPH_MARGIN: 'glyph-margin',
	SCROLL_DECORATION: 'scroll-decoration',
	VIEW_CURSORS_LAYER: 'cursors-layer',
	VIEW_ZONES: 'view-zones'
};

export interface IRestrictedRenderingContext {
	linesViewportData:editorCommon.IViewLinesViewportData;

	scrollWidth:number;
	scrollHeight:number;

	visibleRange:editorCommon.IEditorRange;
	bigNumbersDelta:number;

	viewportTop:number;
	viewportWidth:number;
	viewportHeight:number;
	viewportLeft:number;

	getScrolledTopFromAbsoluteTop(absoluteTop:number): number;
	getViewportVerticalOffsetForLineNumber(lineNumber:number): number;
	lineIsVisible(lineNumber:number): boolean;

	getDecorationsInViewport(): editorCommon.IModelDecoration[];
}

export interface IRenderingContext extends IRestrictedRenderingContext {

	linesVisibleRangesForRange(range:editorCommon.IRange, includeNewLines:boolean): editorCommon.LineVisibleRanges[];

	visibleRangeForPosition(position:editorCommon.IPosition): editorCommon.VisibleRange;
}

export interface IViewEventHandler {
	handleEvents(events:IEmitterEvent[]): void;
}

export interface IViewportInfo {
	visibleRange: editorCommon.IEditorRange;
	width:number;
	height:number;
	deltaTop:number;
	deltaLeft:number;
}

export interface IViewPart extends IDisposable {
	onBeforeForcedLayout(): void;
	onReadAfterForcedLayout(ctx:IRenderingContext): void;
	onWriteAfterForcedLayout(): void;
}

// --- end View Event Handlers & Parts

export interface IViewContext {

	addEventHandler(eventHandler:IViewEventHandler): void;
	removeEventHandler(eventHandler:IViewEventHandler): void;

	configuration:editorCommon.IConfiguration;
	model: editorCommon.IViewModel;
	privateViewEventBus:editorCommon.IViewEventBus;
}

export interface ILayoutProvider extends IVerticalLayoutProvider, IScrollingProvider {

	dispose():void;

	getCenteredViewLineNumberInViewport(): number;

	getCurrentViewport(): editorCommon.IViewport;

	onMaxLineWidthChanged(width:number): void;

	saveState(): editorCommon.IViewState;
	restoreState(state:editorCommon.IViewState): void;
}

export interface IScrollingProvider {

	getOverviewRulerInsertData(): { parent: HTMLElement; insertBefore: HTMLElement; };
	getScrollbarContainerDomNode(): HTMLElement;
	delegateVerticalScrollbarMouseDown(browserEvent:MouseEvent): void;

	// This is for the glyphs, line numbers, etc.
	getScrolledTopFromAbsoluteTop(top:number): number;

	getScrollHeight(): number;
	getScrollWidth(): number;
	getScrollLeft(): number;
	setScrollLeft(scrollLeft:number): void;
	getScrollTop(): number;
	setScrollTop(scrollTop:number): void;
}

export interface IVerticalLayoutProvider {

	/**
	 * Compute vertical offset (top) of line number
	 */
	getVerticalOffsetForLineNumber(lineNumber:number): number;

	/**
	 * Returns the height in pixels for `lineNumber`.
	 */
	heightInPxForLine(lineNumber:number): number;

	/**
	 * Return line number at `verticalOffset` or closest line number
	 */
	getLineNumberAtVerticalOffset(verticalOffset:number): number;

	/**
	 * Compute content height (including one extra scroll page if necessary)
	 */
	getTotalHeight(): number;

	/**
	 * Compute the lines that need to be rendered in the current viewport position.
	 */
	getLinesViewportData(): editorCommon.IViewLinesViewportData;
}

/**
 * A view zone is a full horizontal rectangle that 'pushes' text down.
 * The editor reserves space for view zones when rendering.
 */
export interface IViewZone {
	/**
	 * The line number after which this zone should appear.
	 * Use 0 to place a view zone before the first line number.
	 */
	afterLineNumber:number;
	/**
	 * The column after which this zone should appear.
	 * If not set, the maxLineColumn of `afterLineNumber` will be used.
	 */
	afterColumn?:number;
	/**
	 * Suppress mouse down events.
	 * If set, the editor will attach a mouse down listener to the view zone and .preventDefault on it.
	 * Defaults to false
	 */
	suppressMouseDown?:boolean;
	/**
	 * The height in lines of the view zone.
	 * If specified, `heightInPx` will be used instead of this.
	 * If neither `heightInPx` nor `heightInLines` is specified, a default of `heightInLines` = 1 will be chosen.
	 */
	heightInLines?:number;
	/**
	 * The height in px of the view zone.
	 * If this is set, the editor will give preference to it rather than `heightInLines` above.
	 * If neither `heightInPx` nor `heightInLines` is specified, a default of `heightInLines` = 1 will be chosen.
	 */
	heightInPx?: number;
	/**
	 * The dom node of the view zone
	 */
	domNode:HTMLElement;
	/**
	 * Callback which gives the relative top of the view zone as it appears (taking scrolling into account).
	 */
	onDomNodeTop?:(top: number) =>void;
	/**
	 * Callback which gives the height in pixels of the view zone.
	 */
	onComputedHeight?:(height: number) =>void;
}
/**
 * An accessor that allows for zones to be added or removed.
 */
export interface IViewZoneChangeAccessor {
	/**
	 * Create a new view zone.
	 * @param zone Zone to create
	 * @return A unique identifier to the view zone.
	 */
	addZone(zone: IViewZone): number;
	/**
	 * Remove a zone
	 * @param id A unique identifier to the view zone, as returned by the `addZone` call.
	 */
	removeZone(id: number): void;
	/**
	 * Change a zone's position.
	 * The editor will rescan the `afterLineNumber` and `afterColumn` properties of a view zone.
	 */
	layoutZone(id: number): void;
}

/**
 * A positioning preference for rendering content widgets.
 */
export enum ContentWidgetPositionPreference {
	/**
	 * Place the content widget exactly at a position
	 */
	EXACT,
	/**
	 * Place the content widget above a position
	 */
	ABOVE,
	/**
	 * Place the content widget below a position
	 */
	BELOW
}
/**
 * A position for rendering content widgets.
 */
export interface IContentWidgetPosition {
	/**
	 * Desired position for the content widget.
	 * `preference` will also affect the placement.
	 */
	position: editorCommon.IPosition;
	/**
	 * Placement preference for position, in order of preference.
	 */
	preference: ContentWidgetPositionPreference[];
}
/**
 * A content widget renders inline with the text and can be easily placed 'near' an editor position.
 */
export interface IContentWidget {
	/**
	 * Render this content widget in a location where it could overflow the editor's view dom node.
	 */
	allowEditorOverflow?: boolean;
	/**
	 * Get a unique identifier of the content widget.
	 */
	getId(): string;
	/**
	 * Get the dom node of the content widget.
	 */
	getDomNode(): HTMLElement;
	/**
	 * Get the placement of the content widget.
	 * If null is returned, the content widget will be placed off screen.
	 */
	getPosition(): IContentWidgetPosition;
}

/**
 * A positioning preference for rendering overlay widgets.
 */
export enum OverlayWidgetPositionPreference {
	/**
	 * Position the overlay widget in the top right corner
	 */
	TOP_RIGHT_CORNER,

	/**
	 * Position the overlay widget in the bottom right corner
	 */
	BOTTOM_RIGHT_CORNER,

	/**
	 * Position the overlay widget in the top center
	 */
	TOP_CENTER
}
/**
 * A position for rendering overlay widgets.
 */
export interface IOverlayWidgetPosition {
	/**
	 * The position preference for the overlay widget.
	 */
	preference: OverlayWidgetPositionPreference;
}
/**
 * An overlay widgets renders on top of the text.
 */
export interface IOverlayWidget {
	/**
	 * Get a unique identifier of the overlay widget.
	 */
	getId(): string;
	/**
	 * Get the dom node of the overlay widget.
	 */
	getDomNode(): HTMLElement;
	/**
	 * Get the placement of the overlay widget.
	 * If null is returned, the overlay widget is responsible to place itself.
	 */
	getPosition(): IOverlayWidgetPosition;
}

/**
 * Target hit with the mouse in the editor.
 */
export interface IMouseTarget {
	/**
	 * The target element
	 */
	element: Element;
	/**
	 * The target type
	 */
	type: editorCommon.MouseTargetType;
	/**
	 * The 'approximate' editor position
	 */
	position: editorCommon.IEditorPosition;
	/**
	 * Desired mouse column (e.g. when position.column gets clamped to text length -- clicking after text on a line).
	 */
	mouseColumn: number;
	/**
	 * The 'approximate' editor range
	 */
	range: editorCommon.IEditorRange;
	/**
	 * Some extra detail.
	 */
	detail: any;
}
/**
 * A mouse event originating from the editor.
 */
export interface IEditorMouseEvent {
	event: IMouseEvent;
	target: IMouseTarget;
}

export type ISimpleEditorContributionCtor = IConstructorSignature1<ICodeEditor, editorCommon.IEditorContribution>;

/**
 * An editor contribution descriptor that will be used to construct editor contributions
 */
export interface IEditorContributionDescriptor {
	/**
	 * Create an instance of the contribution
	 */
	createInstance(instantiationService:IInstantiationService, editor:ICodeEditor): editorCommon.IEditorContribution;
}

/**
 * A zone in the overview ruler
 */
export interface IOverviewRulerZone {
	startLineNumber: number;
	endLineNumber: number;
	forceHeight?: number;
	color: string;
	darkColor: string;
	position: editorCommon.OverviewRulerLane;
}
/**
 * An overview ruler
 */
export interface IOverviewRuler {
	getDomNode(): HTMLElement;
	dispose(): void;
	setZones(zones:IOverviewRulerZone[]): void;
	setLayout(position:editorCommon.IOverviewRulerPosition): void;
}
/**
 * A rich code editor.
 */
export interface ICodeEditor extends editorCommon.ICommonCodeEditor {

	/**
	 * Returns the editor's dom node
	 */
	getDomNode(): HTMLElement;

	/**
	 * Add a content widget. Widgets must have unique ids, otherwise they will be overwritten.
	 */
	addContentWidget(widget: IContentWidget): void;
	/**
	 * Layout/Reposition a content widget. This is a ping to the editor to call widget.getPosition()
	 * and update appropiately.
	 */
	layoutContentWidget(widget: IContentWidget): void;
	/**
	 * Remove a content widget.
	 */
	removeContentWidget(widget: IContentWidget): void;

	/**
	 * Add an overlay widget. Widgets must have unique ids, otherwise they will be overwritten.
	 */
	addOverlayWidget(widget: IOverlayWidget): void;
	/**
	 * Layout/Reposition an overlay widget. This is a ping to the editor to call widget.getPosition()
	 * and update appropiately.
	 */
	layoutOverlayWidget(widget: IOverlayWidget): void;
	/**
	 * Remove an overlay widget.
	 */
	removeOverlayWidget(widget: IOverlayWidget): void;

	/**
	 * Change the view zones. View zones are lost when a new model is attached to the editor.
	 */
	changeViewZones(callback: (accessor: IViewZoneChangeAccessor) => void): void;

	/**
	 * Returns the range that is currently centered in the view port.
	 */
	getCenteredRangeInViewport(): editorCommon.IEditorRange;

	/**
	 * Get the view zones.
	 */
	getWhitespaces(): editorCommon.IEditorWhitespace[];

	/**
	 * Get the horizontal position (left offset) for the column w.r.t to the beginning of the line.
	 * This method works only if the line `lineNumber` is currently rendered (in the editor's viewport).
	 * Use this method with caution.
	 */
	getOffsetForColumn(lineNumber: number, column: number): number;

	/**
	 * Force an editor render now.
	 */
	render(): void;

	/**
	 * Get the vertical position (top offset) for the line w.r.t. to the first line.
	 */
	getTopForLineNumber(lineNumber: number): number;

	/**
	 * Get the vertical position (top offset) for the position w.r.t. to the first line.
	 */
	getTopForPosition(lineNumber: number, column: number): number;

	/**
	 * Get the visible position for `position`.
	 * The result position takes scrolling into account and is relative to the top left corner of the editor.
	 * Explanation 1: the results of this method will change for the same `position` if the user scrolls the editor.
	 * Explanation 2: the results of this method will not change if the container of the editor gets repositioned.
	 * Warning: the results of this method are innacurate for positions that are outside the current editor viewport.
	 */
	getScrolledVisiblePosition(position: editorCommon.IPosition): { top: number; left: number; height: number; };

	/**
	 * Set the model ranges that will be hidden in the view.
	 */
	setHiddenAreas(ranges:editorCommon.IRange[]): void;

	setAriaActiveDescendant(id:string): void;
}

/**
 * A rich diff editor.
 */
export interface IDiffEditor extends editorCommon.ICommonDiffEditor {
	/**
	 * @see ICodeEditor.getDomNode
	 */
	getDomNode(): HTMLElement;
}
