/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StandardMouseEvent } from './mouseEvent.js';
import { IActionViewItemOptions } from './ui/actionbar/actionViewItems.js';
import { IActionViewItem } from './ui/actionbar/actionbar.js';
import { AnchorAlignment, AnchorAxisAlignment, IAnchor, IContextViewCloseAnimation } from './ui/contextview/contextview.js';
import { IAction, IActionRunner } from '../common/actions.js';
import { ResolvedKeybinding } from '../common/keybindings.js';
import { OmitOptional } from '../common/types.js';
import { IDisposable, toDisposable } from '../common/lifecycle.js';

export interface IContextMenuEvent {
	readonly shiftKey?: boolean;
	readonly ctrlKey?: boolean;
	readonly altKey?: boolean;
	readonly metaKey?: boolean;
}

/**
 * A specific context menu location to position the menu at.
 * Uses some TypeScript type tricks to prevent allowing to
 * pass in a `MouseEvent` and force people to use `StandardMouseEvent`.
 */
type ContextMenuLocation = OmitOptional<IAnchor> & { getModifierState?: never };

export interface IContextMenuDelegate {
	/**
	 * The anchor where to position the context view.
	 * Use a `HTMLElement` to position the view at the element,
	 * a `StandardMouseEvent` to position it at the mouse position
	 * or an `ContextMenuLocation` to position it at a specific location.
	 */
	getAnchor(): HTMLElement | StandardMouseEvent | ContextMenuLocation;
	getActions(): readonly IAction[];
	getCheckedActionsRepresentation?(action: IAction): 'radio' | 'checkbox';
	getActionViewItem?(action: IAction, options: IActionViewItemOptions): IActionViewItem | undefined;
	getActionsContext?(event?: IContextMenuEvent): unknown;
	getKeyBinding?(action: IAction): ResolvedKeybinding | undefined;
	getMenuClassName?(): string;
	onHide?(didCancel: boolean): void;
	closeAnimation?: IContextViewCloseAnimation;
	actionRunner?: IActionRunner;
	skipTelemetry?: boolean;
	/**
	 * `true` focuses the first enabled action; `false` or `undefined` leaves the menu without a selection.
	 * A number selects a zero-based index in {@link getActions}, counting separators and each submenu as one item; non-integer or out-of-range indices are ignored.
	 */
	autoSelectItem?: boolean | number;
	anchorAlignment?: AnchorAlignment;
	anchorAxisAlignment?: AnchorAxisAlignment;
	/**
	 * The element to render the context menu in. When unset, a context menu that is
	 * anchored to an element or a mouse event is rendered in the nearest
	 * {@link markAsContextMenuHost context menu host} of that element, if any.
	 */
	domForShadowRoot?: HTMLElement;
	/**
	 * Mount the shadow root in the window container instead of `domForShadowRoot`.
	 * Use this when the provided element is inside a stacking context that cannot contain the menu.
	 */
	useWindowContainerForShadowRoot?: boolean;
	/**
	 * custom context menus with higher layers are rendered higher in z-index order
	 */
	layer?: number;
}

export interface IContextMenuProvider {
	showContextMenu(delegate: IContextMenuDelegate): void;
}

/** Normalizes initial selection consistently for HTML and native context menus. */
export function getContextMenuAutoSelectItem(delegate: IContextMenuDelegate, actions: readonly IAction[]): boolean | number {
	const selection = delegate.autoSelectItem;
	if (typeof selection === 'number') {
		return Number.isInteger(selection) && selection >= 0 && selection < actions.length ? selection : false;
	}
	return selection === true;
}

const CONTEXT_MENU_HOST_ATTRIBUTE = 'data-context-menu-host';

/**
 * Declares `element` as a context menu host: context menus that are triggered from
 * within it (anchored to one of its descendants or to a mouse event targeting one)
 * and that do not specify `domForShadowRoot` are rendered inside of the nearest
 * such host. Use this for elements that own focus, e.g. overlays that hide when
 * focus moves out of them, so that opening a context menu keeps focus within.
 */
export function markAsContextMenuHost(element: HTMLElement): IDisposable {
	element.setAttribute(CONTEXT_MENU_HOST_ATTRIBUTE, '');
	return toDisposable(() => element.removeAttribute(CONTEXT_MENU_HOST_ATTRIBUTE));
}

/**
 * Returns the nearest {@link markAsContextMenuHost context menu host} of `element`
 * (including `element` itself). Does not cross shadow roots.
 */
export function findContextMenuHost(element: HTMLElement | undefined): HTMLElement | undefined {
	return element?.closest<HTMLElement>(`[${CONTEXT_MENU_HOST_ATTRIBUTE}]`) ?? undefined;
}
