/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { MenuBarVisibility } from 'vs/platform/windows/common/windows';

export const enum Parts {
	ACTIVITYBAR_PART,
	SIDEBAR_PART,
	PANEL_PART,
	EDITOR_PART,
	STATUSBAR_PART,
	TITLEBAR_PART,
	MENUBAR_PART
}

export const enum Position {
	LEFT,
	RIGHT,
	BOTTOM
}
export function PositionToString(position: Position): string {
	switch (position) {
		case Position.LEFT: return 'LEFT';
		case Position.RIGHT: return 'RIGHT';
		case Position.BOTTOM: return 'BOTTOM';
	}
}

export interface ILayoutOptions {
	toggleMaximizedPanel?: boolean;
	source?: Parts;
}

export interface IDimension {
	readonly width: number;
	readonly height: number;
}

export const IPartService = createDecorator<IPartService>('partService');

export interface IPartService {
	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Emits when the visibility of the title bar changes.
	 */
	onTitleBarVisibilityChange: Event<void>;

	/**
	 * Emits when the editor part's layout changes.
	 */
	onEditorLayout: Event<IDimension>;

	/**
	 * Asks the part service if all parts have been fully restored. For editor part
	 * this means that the contents of editors have loaded.
	 */
	isRestored(): boolean;

	/**
	 * Returns whether the given part has the keyboard focus or not.
	 */
	hasFocus(part: Parts): boolean;

	/**
	 * Returns the parts HTML element, if there is one.
	 */
	getContainer(part: Parts): HTMLElement;

	/**
	 * Returns if the part is visible.
	 */
	isVisible(part: Parts): boolean;

	/**
	 * Set activity bar hidden or not
	 */
	setActivityBarHidden(hidden: boolean): void;

	/**
	 * Number of pixels (adjusted for zooming) that the title bar (if visible) pushes down the workbench contents.
	 */
	getTitleBarOffset(): number;

	/**
	 * Set sidebar hidden or not
	 */
	setSideBarHidden(hidden: boolean): void;

	/**
	 * Set panel part hidden or not
	 */
	setPanelHidden(hidden: boolean): void;

	/**
	 * Maximizes the panel height if the panel is not already maximized.
	 * Shrinks the panel to the default starting size if the panel is maximized.
	 */
	toggleMaximizedPanel(): void;

	/**
	 * Returns true if the panel is maximized.
	 */
	isPanelMaximized(): boolean;

	/**
	 * Gets the current side bar position. Note that the sidebar can be hidden too.
	 */
	getSideBarPosition(): Position;

	/**
	 * Gets the current menubar visibility.
	 */
	getMenubarVisibility(): MenuBarVisibility;

	/**
	 * Gets the current panel position. Note that the panel can be hidden too.
	 */
	getPanelPosition(): Position;

	/**
	 * Sets the panel position.
	 */
	setPanelPosition(position: Position): void;

	/**
	 * Returns the element that contains the workbench.
	 */
	getWorkbenchElement(): HTMLElement;

	/**
	 * Toggles the workbench in and out of zen mode - parts get hidden and window goes fullscreen.
	 */
	toggleZenMode(): void;

	/**
	 * Returns whether the centered editor layout is active.
	 */
	isEditorLayoutCentered(): boolean;

	/**
	 * Sets the workbench in and out of centered editor layout.
	 */
	centerEditorLayout(active: boolean): void;

	/**
	 * Resizes currently focused part on main access
	 */
	resizePart(part: Parts, sizeChange: number): void;
}
