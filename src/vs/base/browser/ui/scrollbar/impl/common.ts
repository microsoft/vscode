/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import ScrollableElement = require('vs/base/browser/ui/scrollbar/scrollableElement');
import {IScrollable} from 'vs/base/common/scrollable';

export interface IMouseWheelEvent {
	browserEvent: MouseWheelEvent;
	deltaX:number;
	deltaY:number;
	preventDefault(): void;
	stopPropagation(): void;
}

export interface IDimensions {
	width:number;
	height:number;
}

export interface IScrollbar {
	domNode:HTMLElement;
	destroy(): void;
	slider:HTMLElement;
	onElementSize(size:number): void;
	onElementScrollSize(scrollSize:number): void;
	onElementScrollPosition(scrollPosition:number): void;
	beginReveal(): void;
	beginHide(): void;
	delegateMouseDown(browserEvent:MouseEvent): void;
	validateScrollPosition(scrollPosition:number): number;
	setDesiredScrollPosition(scrollPosition:number): void;
}

export interface IParent {
	onMouseWheel(mouseWheelEvent:IMouseWheelEvent): void;
	onDragStart(): void;
	onDragEnd(): void;
}

export enum Visibility {
	Auto,
	Hidden,
	Visible
};

export function visibilityFromString(visibility:string): Visibility {
	switch (visibility) {
		case 'hidden':
			return Visibility.Hidden;
		case 'visible':
			return Visibility.Visible;
		default:
			return Visibility.Auto;
	}
}

export interface IOptions {
	/**
	 * Prevent the scrollbar rendering from using translate3d.
	 */
	forbidTranslate3dUse: boolean;

	/**
	 * CSS Class name for the scrollable element
	 */
	className:string;

	/**
	 * Drop subtle horizontal and vertical shadows.
	 */
	useShadows:boolean;

	/**
	 * Handle mouse wheel (listen to mouse wheel scrolling).
	 */
	handleMouseWheel:boolean;

	/**
	 * Flip axes. Treat vertical scrolling like horizontal and vice-versa.
	 */
	flipAxes: boolean;

	/**
	 * A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.
	 * Defaults to 1.
	 */
	mouseWheelScrollSensitivity: number;

	/**
	 * Height for vertical arrows (top/bottom) and width for horizontal arrows (left/right).
	 */
	arrowSize:number;

	/**
	 * The scrollable that will react to all the scrolling logic.
	 */
	scrollable:IScrollable;

	/**
	 * The dom node events should be bound to.
	 */
	listenOnDomNode:HTMLElement;

	/**
	 * Visibility of the horizontal scrollbar.
	 */
	horizontal:Visibility;

	/**
	 * Height (in px) of the horizontal scrollbar.
	 */
	horizontalScrollbarSize:number;

	/**
	 * Height (in px) of the horizontal scrollbar slider.
	 */
	horizontalSliderSize:number;

	/**
	 * Render arrows (left/right) for the horizontal scrollbar.
	 */
	horizontalHasArrows:boolean;

	/**
	 * Visibility of the vertical scrollbar.
	 */
	vertical:Visibility;

	/**
	 * Width (in px) of the vertical scrollbar.
	 */
	verticalScrollbarSize:number;

	/**
	 * Width (in px) of the vertical scrollbar slider.
	 */
	verticalSliderSize:number;

	/**
	 * Render arrows (top/bottom) for the vertical scrollbar.
	 */
	verticalHasArrows: boolean;

	/**
	 * Add a `last-scroll-time` attribute to scroll targets or parents of scroll targets matching the following class name
	 */
	saveLastScrollTimeOnClassName: string;
}