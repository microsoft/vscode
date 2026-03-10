/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// @kycutler https://github.com/microsoft/vscode/issues/300319

	/**
	 * An integrated browser page displayed in an editor tab.
	 */
	export interface BrowserTab {
		/** The current URL of the page. */
		readonly url: string;

		/** The current page title. */
		readonly title: string;

		/** The page icon (favicon or a default globe icon). */
		readonly icon: IconPath;

		/** Create a new CDP session that exposes this browser tab. */
		startCDPSession(): Thenable<BrowserCDPSession>;
	}

	/**
	 * A CDP (Chrome DevTools Protocol) session that provides a bidirectional message channel.
	 *
	 * Create a session via {@link BrowserTab.startCDPSession}.
	 */
	export interface BrowserCDPSession {
		/** Fires when a CDP message is received from an attached target. */
		readonly onDidReceiveMessage: Event<unknown>;

		/** Fires when this session is closed. */
		readonly onDidClose: Event<void>;

		/** Send a CDP request message to an attached target. */
		sendMessage(message: unknown): Thenable<void>;

		/** Close this session and detach all targets. */
		close(): Thenable<void>;
	}

	/** Options for {@link window.openBrowserTab}. */
	export interface BrowserTabShowOptions {
		/**
		 * The view column to show the browser in. Defaults to {@link ViewColumn.Active}.
		 * Use {@linkcode ViewColumn.Beside} to open next to the current editor.
		 */
		viewColumn?: ViewColumn;

		/** When `true`, the browser tab will not take focus. */
		preserveFocus?: boolean;

		/** When `true`, the browser tab will open in the background. */
		background?: boolean;
	}

	export namespace window {
		/** The currently open browser tabs. */
		export const browserTabs: readonly BrowserTab[];

		/** Fires when a browser tab is opened. */
		export const onDidOpenBrowserTab: Event<BrowserTab>;

		/** Fires when a browser tab is closed. */
		export const onDidCloseBrowserTab: Event<BrowserTab>;

		/** The currently active browser tab. */
		export const activeBrowserTab: BrowserTab | undefined;

		/** Fires when {@link activeBrowserTab} changes. */
		export const onDidChangeActiveBrowserTab: Event<BrowserTab | undefined>;

		/** Fires when a browser tab's state (url, title, or icon) changes. */
		export const onDidChangeBrowserTabState: Event<BrowserTab>;

		/**
		 * Open a browser tab at the given URL.
		 *
		 * @param url The URL to navigate to.
		 * @param options Controls where and how the browser tab is shown.
		 * @returns The {@link BrowserTab} representing the opened page.
		 */
		export function openBrowserTab(url: string, options?: BrowserTabShowOptions): Thenable<BrowserTab>;
	}
}
