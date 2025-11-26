/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';

export interface IBrowserViewBounds {
	windowId: number;
	x: number;
	y: number;
	width: number;
	height: number;
	zoomFactor: number;
}

export interface IBrowserViewState {
	url: string;
	title: string;
	canGoBack: boolean;
	canGoForward: boolean;
	loading: boolean;
	lastScreenshot: string | undefined;
	lastFavicon: string | undefined;
}

export interface IBrowserViewNavigationEvent {
	url: string;
	canGoBack: boolean;
	canGoForward: boolean;
}

export interface IBrowserViewLoadingEvent {
	loading: boolean;
}

export interface IBrowserViewFocusEvent {
	focused: boolean;
}

export interface IBrowserViewKeyDownEvent {
	key: string;
	keyCode: number;
	code: string;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	metaKey: boolean;
	repeat: boolean;
}

export interface IBrowserViewTitleChangeEvent {
	title: string;
}

export interface IBrowserViewFaviconChangeEvent {
	favicon: string;
}

export interface IBrowserViewNewPageRequest {
	url: string;
	name?: string;
	background: boolean;
}

export const ipcBrowserViewChannelName = 'browserView';

export interface IBrowserViewService {
	/**
	 * Dynamic events that return an Event for a specific browser view ID.
	 */
	onDynamicDidNavigate(id: string): Event<IBrowserViewNavigationEvent>;
	onDynamicDidChangeLoadingState(id: string): Event<IBrowserViewLoadingEvent>;
	onDynamicDidChangeFocus(id: string): Event<IBrowserViewFocusEvent>;
	onDynamicDidKeyCommand(id: string): Event<IBrowserViewKeyDownEvent>;
	onDynamicDidChangeTitle(id: string): Event<IBrowserViewTitleChangeEvent>;
	onDynamicDidChangeFavicon(id: string): Event<IBrowserViewFaviconChangeEvent>;
	onDynamicDidRequestNewPage(id: string): Event<IBrowserViewNewPageRequest>;

	/**
	 * Get or create a browser view instance
	 * @param id The browser view identifier
	 * @param workspaceId Optional workspace identifier for session isolation
	 */
	getOrCreateBrowserView(id: string, workspaceId?: string): Promise<IBrowserViewState>;

	/**
	 * Destroy a browser view instance
	 * @param id The browser view identifier
	 */
	destroyBrowserView(id: string): Promise<void>;

	/**
	 * Update the bounds of a browser view
	 * @param id The browser view identifier
	 * @param bounds The new bounds for the view
	 */
	layout(id: string, bounds: IBrowserViewBounds): Promise<void>;

	/**
	 * Set the visibility of a browser view
	 * @param id The browser view identifier
	 * @param visible Whether the view should be visible
	 */
	setVisible(id: string, visible: boolean): Promise<void>;

	/**
	 * Navigate the browser view to a URL
	 * @param id The browser view identifier
	 * @param url The URL to navigate to
	 */
	loadURL(id: string, url: string): Promise<void>;

	/**
	 * Get the current URL of a browser view
	 * @param id The browser view identifier
	 */
	getURL(id: string): Promise<string>;

	/**
	 * Go back in navigation history
	 * @param id The browser view identifier
	 */
	goBack(id: string): Promise<void>;

	/**
	 * Go forward in navigation history
	 * @param id The browser view identifier
	 */
	goForward(id: string): Promise<void>;

	/**
	 * Reload the current page
	 * @param id The browser view identifier
	 */
	reload(id: string): Promise<void>;

	/**
	 * Check if the view can go back
	 * @param id The browser view identifier
	 */
	canGoBack(id: string): Promise<boolean>;

	/**
	 * Check if the view can go forward
	 * @param id The browser view identifier
	 */
	canGoForward(id: string): Promise<boolean>;

	/**
	 * Capture a screenshot of the browser view
	 * @param id The browser view identifier
	 * @param quality The quality of the screenshot (0-100)
	 * @returns Data URL of the screenshot, or undefined if capture failed
	 */
	captureScreenshot(id: string, quality?: number): Promise<string>;

	/**
	 * Dispatch a key event to the browser view
	 * @param viewId The browser view identifier
	 * @param keyEvent The key event data
	 */
	dispatchKeyEvent(viewId: string, keyEvent: IBrowserViewKeyDownEvent): Promise<void>;

	/**
	 * Focus the browser view
	 * @param id The browser view identifier
	 */
	focus(id: string): Promise<void>;
}
