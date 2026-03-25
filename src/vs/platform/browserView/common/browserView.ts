/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { UriComponents } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';

const commandPrefix = 'workbench.action.browser';
export enum BrowserViewCommandId {
	// Tab management
	Open = `${commandPrefix}.open`,
	NewTab = `${commandPrefix}.newTab`,
	QuickOpen = `${commandPrefix}.quickOpen`,
	CloseAll = `${commandPrefix}.closeAll`,
	CloseAllInGroup = `${commandPrefix}.closeAllInGroup`,

	// Navigation
	GoBack = `${commandPrefix}.goBack`,
	GoForward = `${commandPrefix}.goForward`,
	Reload = `${commandPrefix}.reload`,
	HardReload = `${commandPrefix}.hardReload`,

	// Editor actions
	FocusUrlInput = `${commandPrefix}.focusUrlInput`,
	OpenExternal = `${commandPrefix}.openExternal`,
	OpenSettings = `${commandPrefix}.openSettings`,

	// Chat actions
	AddElementToChat = `${commandPrefix}.addElementToChat`,
	AddConsoleLogsToChat = `${commandPrefix}.addConsoleLogsToChat`,

	// Dev Tools
	ToggleDevTools = `${commandPrefix}.toggleDevTools`,

	// Storage
	ClearGlobalStorage = `${commandPrefix}.clearGlobalStorage`,
	ClearWorkspaceStorage = `${commandPrefix}.clearWorkspaceStorage`,
	ClearEphemeralStorage = `${commandPrefix}.clearEphemeralStorage`,

	// Find in page
	ShowFind = `${commandPrefix}.showFind`,
	HideFind = `${commandPrefix}.hideFind`,
	FindNext = `${commandPrefix}.findNext`,
	FindPrevious = `${commandPrefix}.findPrevious`,
}

export interface IBrowserViewBounds {
	windowId: number;
	x: number;
	y: number;
	width: number;
	height: number;
	zoomFactor: number;
	cornerRadius: number;
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
	certificateError: IBrowserViewCertificateError | undefined;
	storageScope: BrowserViewStorageScope;
	browserZoomIndex: number;
}

export interface IBrowserViewNavigationEvent {
	url: string;
	title: string;
	canGoBack: boolean;
	canGoForward: boolean;
	certificateError: IBrowserViewCertificateError | undefined;
}

export interface IBrowserViewLoadingEvent {
	loading: boolean;
	error?: IBrowserViewLoadError;
}

export interface IBrowserViewLoadError {
	url: string;
	errorCode: number;
	errorDescription: string;
	certificateError?: IBrowserViewCertificateError;
}

export interface IBrowserViewCertificateError {
	host: string;
	fingerprint: string;
	error: string;
	url: string;
	hasTrustedException: boolean;
	issuerName: string;
	subjectName: string;
	validStart: number;
	validExpiry: number;
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
	favicon: string | undefined;
}

export enum BrowserNewPageLocation {
	Foreground = 'foreground',
	Background = 'background',
	NewWindow = 'newWindow'
}
export interface IBrowserViewNewPageRequest {
	resource: UriComponents;
	url: string;
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

/**
 * Discrete zoom levels matching Edge/Chrome.
 * Note: When those browsers say "33%" and "67%" zoom, they really mean 33.33...% and 66.66...%
 */
export const browserZoomFactors = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] as const;
export const browserZoomDefaultIndex = browserZoomFactors.indexOf(1);
export function browserZoomLabel(zoomFactor: number): string {
	return localize('browserZoomPercent', "{0}%", Math.round(zoomFactor * 100));
}
export function browserZoomAccessibilityLabel(zoomFactor: number): string {
	return localize('browserZoomAccessibilityLabel', "Page Zoom: {0}%", Math.round(zoomFactor * 100));
}

/**
 * This should match the isolated world ID defined in `preload-browserView.ts`.
 */
export const browserViewIsolatedWorldId = 999;

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
	 * Get the state of an existing browser view by ID, or throw if it doesn't exist
	 * @param id The browser view identifier
	 * @return The state of the browser view for the given ID
	 * @throws If no browser view exists for the given ID
	 */
	getState(id: string): Promise<IBrowserViewState>;

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
	 * @param hard Whether to do a hard reload (bypassing cache)
	 */
	reload(id: string, hard?: boolean): Promise<void>;

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
	 * Get the currently selected text in the browser view.
	 * Returns immediately with empty string if the page is still loading.
	 * @param id The browser view identifier
	 * @returns The selected text, or empty string if no selection or page is loading
	 */
	getSelectedText(id: string): Promise<string>;

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

	/** Set the browser zoom index (independent from VS Code zoom). */
	setBrowserZoomIndex(id: string, zoomIndex: number): Promise<void>;

	/**
	 * Trust a certificate for a given host in the browser view's session.
	 * The page will be automatically reloaded after trusting.
	 * @param id The browser view identifier
	 * @param host The hostname that presented the certificate
	 * @param fingerprint The SHA-256 fingerprint of the certificate to trust
	 */
	trustCertificate(id: string, host: string, fingerprint: string): Promise<void>;

	/**
	 * Revoke trust for a previously trusted certificate.
	 * The browser view will be automatically closed after revoking.
	 * @param id The browser view identifier
	 * @param host The hostname to revoke the certificate for
	 * @param fingerprint The SHA-256 fingerprint of the certificate to revoke
	 */
	untrustCertificate(id: string, host: string, fingerprint: string): Promise<void>;

	/**
	 * Update the keybinding accelerators used in browser view context menus.
	 * @param keybindings A map of command ID to accelerator label
	 */
	updateKeybindings(keybindings: { [commandId: string]: string }): Promise<void>;
}
