/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IScrollable} from 'vs/base/common/scrollable';

export interface IScrollableElementCreationOptions {
	/**
	 * Prevent the scrollbar rendering from using translate3d. Defaults to false.
	 */
	forbidTranslate3dUse?: boolean;

	/**
	 * CSS Class name for the scrollable element.
	 */
	className?: string;

	/**
	 * Drop subtle horizontal and vertical shadows.
	 * Defaults to false.
	 */
	useShadows?: boolean;

	/**
	 * Handle mouse wheel (listen to mouse wheel scrolling).
	 * Defaults to true
	 */
	handleMouseWheel?: boolean;

	/**
	 * Flip axes. Treat vertical scrolling like horizontal and vice-versa.
	 * Defaults to false;
	 */
	flipAxes?: boolean;

	/**
	 * A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.
	 * Defaults to 1.
	 */
	mouseWheelScrollSensitivity?: number;

	/**
	 * Height for vertical arrows (top/bottom) and width for horizontal arrows (left/right).
	 * Defaults to 11.
	 */
	arrowSize?: number;

	/**
	 * The scrollable that will react to all the scrolling logic.
	 * If no scrollable is provided, a dom node scrollable will be created automatically.
	 */
	scrollable?: IScrollable;

	/**
	 * The dom node events should be bound to.
	 * If no listenOnDomNode is provided, the dom node passed to the constructor will be used for event listening.
	 */
	listenOnDomNode?: HTMLElement;

	/**
	 * Control the visibility of the horizontal scrollbar.
	 * Accepted values: 'auto' (on mouse over), 'visible' (always visible), 'hidden' (never visible)
	 * Defaults to 'auto'.
	 */
	horizontal?: string;

	/**
	 * Height (in px) of the horizontal scrollbar.
	 * Defaults to 10.
	 */
	horizontalScrollbarSize?: number;

	/**
	 * Height (in px) of the horizontal scrollbar slider.
	 * Defaults to `horizontalScrollbarSize`
	 */
	horizontalSliderSize?: number;

	/**
	 * Render arrows (left/right) for the horizontal scrollbar.
	 * Defaults to false.
	 */
	horizontalHasArrows?: boolean;

	/**
	 * Control the visibility of the vertical scrollbar.
	 * Accepted values: 'auto' (on mouse over), 'visible' (always visible), 'hidden' (never visible)
	 * Defaults to 'auto'.
	 */
	vertical?: string;

	/**
	 * Width (in px) of the vertical scrollbar.
	 * Defaults to 10.
	 */
	verticalScrollbarSize?: number;

	/**
	 * Width (in px) of the vertical scrollbar slider.
	 * Defaults to `verticalScrollbarSize`
	 */
	verticalSliderSize?: number;

	/**
	 * Render arrows (top/bottom) for the vertical scrollbar.
	 * Defaults to false.
	 */
	verticalHasArrows?: boolean;

	/**
	 * Add a `last-scroll-time` attribute to scroll targets or parents of scroll targets matching the following class name
	 */
	saveLastScrollTimeOnClassName?: string;
}

export interface IOverviewRulerLayoutInfo {
	parent: HTMLElement;
	insertBefore: HTMLElement;
}

export interface IDimensions {
	width: number;
	height: number;
}

/**
 * An Element that uses fancy scrollbars.
 */
export interface IScrollableElement {

	verticalScrollbarWidth: number;

	horizontalScrollbarHeight: number;

	/**
	 * Get the generated 'scrollable' dom node
	 */
	getDomNode(): HTMLElement;

	/**
	 * Let the scrollable element know that the generated dom node's width / height might have changed.
	 */
	onElementDimensions(dimensions?: IDimensions): void;

	/**
	 * Let the scrollable element know that the contained dom node's width / height might have changed.
	 */
	onElementInternalDimensions(): void;

	/**
	 * Dispose.
	 */
	dispose(): void;

	/**
	 * Update the class name of the scrollable element.
	 */
	updateClassName(newClassName: string): void;

	/**
	 * Update configuration options for the scrollbar.
	 * Really this is Editor.IEditorScrollbarOptions, but base shouldn't
	 * depend on Editor.
	 */
	updateOptions(newOptions: IScrollableElementCreationOptions): void;

	getOverviewRulerLayoutInfo(): IOverviewRulerLayoutInfo;

	/**
	 * Delegate a mouse down event to the vertical scrollbar.
	 * This is to help with clicking somewhere else and having the scrollbar react.
	 */
	delegateVerticalScrollbarMouseDown(browserEvent: MouseEvent): void;

}

export interface IMouseWheelEvent {
	browserEvent: MouseWheelEvent;
	deltaX: number;
	deltaY: number;
	preventDefault(): void;
	stopPropagation(): void;
}

export interface IScrollbar {
	domNode: HTMLElement;
	dispose(): void;
	slider: HTMLElement;
	onElementSize(size: number): void;
	onElementScrollSize(scrollSize: number): void;
	onElementScrollPosition(scrollPosition: number): void;
	beginReveal(): void;
	beginHide(): void;
	delegateMouseDown(browserEvent: MouseEvent): void;
	validateScrollPosition(scrollPosition: number): number;
	setDesiredScrollPosition(scrollPosition: number): void;
}

export interface IParent {
	onMouseWheel(mouseWheelEvent: IMouseWheelEvent): void;
	onDragStart(): void;
	onDragEnd(): void;
}

export enum Visibility {
	Auto,
	Hidden,
	Visible
}

export function visibilityFromString(visibility: string): Visibility {
	switch (visibility) {
		case 'hidden':
			return Visibility.Hidden;
		case 'visible':
			return Visibility.Visible;
		default:
			return Visibility.Auto;
	}
}

export interface IScrollableElementOptions {
	forbidTranslate3dUse: boolean;
	className: string;
	useShadows: boolean;
	handleMouseWheel: boolean;
	flipAxes: boolean;
	mouseWheelScrollSensitivity: number;
	arrowSize: number;
	scrollable: IScrollable;
	listenOnDomNode: HTMLElement;
	horizontal: Visibility;
	horizontalScrollbarSize: number;
	horizontalSliderSize: number;
	horizontalHasArrows: boolean;
	vertical: Visibility;
	verticalScrollbarSize: number;
	verticalSliderSize: number;
	verticalHasArrows: boolean;
	saveLastScrollTimeOnClassName: string;
}
