/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEventEmitter} from 'vs/base/common/eventEmitter';
import {IDisposable} from 'vs/base/common/lifecycle';
import {IKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {IMouseEvent} from 'vs/base/browser/mouseEvent';
import {IInstantiationService, IConstructorSignature1} from 'vs/platform/instantiation/common/instantiation';
import * as editorCommon from 'vs/editor/common/editorCommon';

export interface IContentWidgetData {
	widget: IContentWidget;
	position: IContentWidgetPosition;
}

export interface IOverlayWidgetData {
	widget: IOverlayWidget;
	position: IOverlayWidgetPosition;
}

export interface ICodeEditorHelper {
	getScrollWidth(): number;
	getScrollLeft(): number;

	getScrollHeight(): number;
	getScrollTop(): number;

	setScrollPosition(position:editorCommon.INewScrollPosition): void;

	getVerticalOffsetForPosition(lineNumber:number, column:number): number;
	delegateVerticalScrollbarMouseDown(browserEvent:MouseEvent): void;
	getOffsetForColumn(lineNumber:number, column:number): number;
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

export interface IViewportInfo {
	visibleRange: editorCommon.IEditorRange;
	width:number;
	height:number;
	deltaTop:number;
	deltaLeft:number;
}

// --- end View Event Handlers & Parts

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

export class ColorZone {
	_colorZoneBrand: void;

	from: number;
	to: number;
	colorId: number;
	position: editorCommon.OverviewRulerLane;

	constructor(from:number, to:number, colorId:number, position: editorCommon.OverviewRulerLane) {
		this.from = from|0;
		this.to = to|0;
		this.colorId = colorId|0;
		this.position = position|0;
	}
}

/**
 * A zone in the overview ruler
 */
export class OverviewRulerZone {
	_overviewRulerZoneBrand: void;

	startLineNumber: number;
	endLineNumber: number;
	position: editorCommon.OverviewRulerLane;
	forceHeight: number;

	private _color: string;
	private _darkColor: string;

	private _colorZones: ColorZone[];

	constructor(
		startLineNumber: number, endLineNumber: number,
		position: editorCommon.OverviewRulerLane,
		forceHeight: number,
		color: string, darkColor: string
	) {
		this.startLineNumber = startLineNumber;
		this.endLineNumber = endLineNumber;
		this.position = position;
		this.forceHeight = forceHeight;
		this._color = color;
		this._darkColor = darkColor;
		this._colorZones = null;
	}

	public getColor(useDarkColor:boolean): string {
		if (useDarkColor) {
			return this._darkColor;
		}
		return this._color;
	}

	public equals(other:OverviewRulerZone): boolean {
		return (
			this.startLineNumber === other.startLineNumber
			&& this.endLineNumber === other.endLineNumber
			&& this.position === other.position
			&& this.forceHeight === other.forceHeight
			&& this._color === other._color
			&& this._darkColor === other._darkColor
		);
	}

	public compareTo(other:OverviewRulerZone): number {
		if (this.startLineNumber === other.startLineNumber) {
			if (this.endLineNumber === other.endLineNumber) {
				if (this.forceHeight === other.forceHeight) {
					if (this.position === other.position) {
						if (this._darkColor === other._darkColor) {
							if (this._color === other._color) {
								return 0;
							}
							return this._color < other._color ? -1 : 1;
						}
						return this._darkColor < other._darkColor ? -1 : 1;
					}
					return this.position - other.position;
				}
				return this.forceHeight - other.forceHeight;
			}
			return this.endLineNumber - other.endLineNumber;
		}
		return this.startLineNumber - other.startLineNumber;
	}

	public setColorZones(colorZones:ColorZone[]): void {
		this._colorZones = colorZones;
	}

	public getColorZones(): ColorZone[] {
		return this._colorZones;
	}
}
/**
 * An overview ruler
 */
export interface IOverviewRuler {
	getDomNode(): HTMLElement;
	dispose(): void;
	setZones(zones:OverviewRulerZone[]): void;
	setLayout(position:editorCommon.OverviewRulerPosition): void;
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

	/**
	 * Apply the same font settings as the editor to `target`.
	 */
	applyFontInfo(target:HTMLElement): void;
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
