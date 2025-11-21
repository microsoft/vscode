/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';

export interface IBrowserViewBounds {
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
}

export interface IBrowserViewNavigationEvent {
	id: string;
	url: string;
	canGoBack: boolean;
	canGoForward: boolean;
}

export interface IBrowserViewLoadingEvent {
	id: string;
	loading: boolean;
}

export interface IBrowserViewPaintEvent {
	id: string;
	dataUrl: string;
}

export interface IBrowserViewFocusEvent {
	id: string;
	focused: boolean;
}

export interface IBrowserViewKeyDownEvent {
	viewId: string;
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
	id: string;
	title: string;
}

export interface IBrowserViewFaviconChangeEvent {
	id: string;
	favicon: string;
}

export interface IBrowserViewCreateOptions {
	offscreen?: boolean;
}

export const ipcBrowserViewChannelName = 'browserView';

export interface IBrowserViewService {
	readonly _serviceBrand: undefined;

	readonly onDidPaint: Event<IBrowserViewPaintEvent>;
	readonly onDidNavigate: Event<IBrowserViewNavigationEvent>;
	readonly onDidChangeLoadingState: Event<IBrowserViewLoadingEvent>;
	readonly onDidChangeFocus: Event<IBrowserViewFocusEvent>;
	readonly onDidKeyCommand: Event<IBrowserViewKeyDownEvent>;
	readonly onDidChangeTitle: Event<IBrowserViewTitleChangeEvent>;
	readonly onDidChangeFavicons: Event<IBrowserViewFaviconChangeEvent>;

	/**
	 * Get or create a browser view instance
	 * @param id The browser view identifier
	 * @param windowId The window identifier to host the view
	 * @param offscreen Whether to create the view in offscreen mode
	 */
	getOrCreateBrowserView(id: string, windowId: number, options?: IBrowserViewCreateOptions): Promise<IBrowserViewState>;

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
	captureScreenshot(id: string, quality?: number): Promise<VSBuffer | undefined>;

	/**
	 * Dispatch a key event to the browser view
	 * @param viewId The browser view identifier
	 * @param keyEvent The key event data
	 */
	dispatchKeyEvent(viewId: string, keyEvent: IBrowserViewKeyDownEvent): Promise<void>;
}
