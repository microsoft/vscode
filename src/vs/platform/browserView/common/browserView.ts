/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { URI } from '../../../base/common/uri.js';

export interface IBrowserViewBounds {
	windowId: number;
	x: number;
	y: number;
	width: number;
	height: number;
	zoomFactor: number;
}

export interface IBrowserViewCaptureScreenshotOptions {
	quality?: number;
	rect?: { x: number; y: number; width: number; height: number };
}

export interface IBrowserViewState {
	url: string;
	title: string;
	canGoBack: boolean;
	canGoForward: boolean;
	loading: boolean;
	focused: boolean;
	visible: boolean;
	isDevToolsOpen: boolean;
	lastScreenshot: VSBuffer | undefined;
	lastFavicon: string | undefined;
	lastError: IBrowserViewLoadError | undefined;
	storageScope: BrowserViewStorageScope;
}

export interface IBrowserViewNavigationEvent {
	url: string;
	canGoBack: boolean;
	canGoForward: boolean;
}

export interface IBrowserViewLoadingEvent {
	loading: boolean;
	error?: IBrowserViewLoadError;
}

export interface IBrowserViewLoadError {
	url: string;
	errorCode: number;
	errorDescription: string;
}

export interface IBrowserViewFocusEvent {
	focused: boolean;
}

export interface IBrowserViewVisibilityEvent {
	visible: boolean;
}

export interface IBrowserViewDevToolsStateEvent {
	isDevToolsOpen: boolean;
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

export enum BrowserNewPageLocation {
	Foreground = 'foreground',
	Background = 'background',
	NewWindow = 'newWindow'
}
export interface IBrowserViewNewPageRequest {
	resource: URI;
	location: BrowserNewPageLocation;
	// Only applicable if location is NewWindow
	position?: { x?: number; y?: number; width?: number; height?: number };
}

export interface IBrowserViewFindInPageOptions {
	recompute?: boolean;
	forward?: boolean;
	matchCase?: boolean;
}

export interface IBrowserViewFindInPageResult {
	activeMatchOrdinal: number;
	matches: number;
	selectionArea?: { x: number; y: number; width: number; height: number };
	finalUpdate: boolean;
}

export enum BrowserViewStorageScope {
	Global = 'global',
	Workspace = 'workspace',
	Ephemeral = 'ephemeral'
}

export const ipcBrowserViewChannelName = 'browserView';

export interface IBrowserViewService {
	/**
	 * Dynamic events that return an Event for a specific browser view ID.
	 */
	onDynamicDidNavigate(id: string): Event<IBrowserViewNavigationEvent>;
	onDynamicDidChangeLoadingState(id: string): Event<IBrowserViewLoadingEvent>;
	onDynamicDidChangeFocus(id: string): Event<IBrowserViewFocusEvent>;
	onDynamicDidChangeVisibility(id: string): Event<IBrowserViewVisibilityEvent>;
	onDynamicDidChangeDevToolsState(id: string): Event<IBrowserViewDevToolsStateEvent>;
	onDynamicDidKeyCommand(id: string): Event<IBrowserViewKeyDownEvent>;
	onDynamicDidChangeTitle(id: string): Event<IBrowserViewTitleChangeEvent>;
	onDynamicDidChangeFavicon(id: string): Event<IBrowserViewFaviconChangeEvent>;
	onDynamicDidRequestNewPage(id: string): Event<IBrowserViewNewPageRequest>;
	onDynamicDidFindInPage(id: string): Event<IBrowserViewFindInPageResult>;
	onDynamicDidClose(id: string): Event<void>;

	/**
	 * Get or create a browser view instance
	 * @param id The browser view identifier
	 * @param scope The storage scope for the browser view. Ignored if the view already exists.
	 * @param workspaceId Workspace identifier for session isolation. Only used if scope is 'workspace'.
	 */
	getOrCreateBrowserView(id: string, scope: BrowserViewStorageScope, workspaceId?: string): Promise<IBrowserViewState>;

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
	 * Toggle developer tools for the browser view.
	 * @param id The browser view identifier
	 */
	toggleDevTools(id: string): Promise<void>;

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
	 * @param options Screenshot options (quality and rect)
	 * @returns Screenshot as a buffer
	 */
	captureScreenshot(id: string, options?: IBrowserViewCaptureScreenshotOptions): Promise<VSBuffer>;

	/**
	 * Dispatch a key event to the browser view
	 * @param id The browser view identifier
	 * @param keyEvent The key event data
	 */
	dispatchKeyEvent(id: string, keyEvent: IBrowserViewKeyDownEvent): Promise<void>;

	/**
	 * Focus the browser view
	 * @param id The browser view identifier
	 */
	focus(id: string): Promise<void>;

	/**
	 * Find text in the browser view's page
	 * @param id The browser view identifier
	 * @param text The text to search for
	 * @param options Find options (forward direction, find next)
	 */
	findInPage(id: string, text: string, options?: IBrowserViewFindInPageOptions): Promise<void>;

	/**
	 * Stop the find in page session
	 * @param id The browser view identifier
	 * @param keepSelection Whether to keep the current selection
	 */
	stopFindInPage(id: string, keepSelection?: boolean): Promise<void>;

	/**
	 * Clear all storage data for the global browser session
	 */
	clearGlobalStorage(): Promise<void>;

	/**
	 * Clear all storage data for a specific workspace browser session
	 * @param workspaceId The workspace identifier
	 */
	clearWorkspaceStorage(workspaceId: string): Promise<void>;

	/**
	 * Clear storage data for a specific browser view
	 * @param id The browser view identifier
	 */
	clearStorage(id: string): Promise<void>;
}
