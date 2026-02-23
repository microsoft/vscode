/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IPlaywrightService = createDecorator<IPlaywrightService>('playwrightService');

/**
 * A service for using Playwright to connect to and automate the integrated browser.
 *
 * Pages must be explicitly tracked via {@link startTrackingPage} (or implicitly via
 * {@link openPage}) before they can be interacted with.
 */
export interface IPlaywrightService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when the set of tracked pages changes.
	 * The event value is the full list of currently tracked view IDs.
	 */
	readonly onDidChangeTrackedPages: Event<readonly string[]>;

	/**
	 * Start tracking an existing browser view so that agent
	 * tools can interact with it.
	 * @param viewId The browser view identifier.
	 */
	startTrackingPage(viewId: string): Promise<void>;

	/**
	 * Stop tracking a browser view.
	 * @param viewId The browser view identifier.
	 */
	stopTrackingPage(viewId: string): Promise<void>;

	/**
	 * Whether the given page is currently tracked by the service.
	 */
	isPageTracked(viewId: string): Promise<boolean>;

	/**
	 * Get the list of currently tracked page IDs.
	 */
	getTrackedPages(): Promise<readonly string[]>;

	/**
	 * Opens a new page in the browser and returns its associated view ID.
	 * The page is automatically added to the tracked pages.
	 * @param url The URL to open in the new page.
	 * @returns An object containing the new page's view ID and a summary of its initial state.
	 */
	openPage(url: string): Promise<{ pageId: string; summary: string }>;

	/**
	 * Gets a summary of the page's current state, including its DOM and visual representation.
	 * @param pageId The browser view ID identifying the page to read.
	 * @returns The summary of the page's current state.
	 */
	getSummary(pageId: string): Promise<string>;

	/**
	 * Run a function with access to a Playwright page.
	 * The first function argument is always the Playwright `page` object, and additional arguments can be passed after.
	 * @param pageId The browser view ID identifying the page to operate on.
	 * @param fnDef The function code to execute. Should contain the function definition but not its invocation, e.g. `async (page, arg1, arg2) => { ... }`.
	 * @param args Additional arguments to pass to the function after the `page` object.
	 * @returns The result of the function execution, including a page summary.
	 */
	invokeFunction(pageId: string, fnDef: string, ...args: unknown[]): Promise<{ result: unknown; summary: string }>;

	/**
	 * Takes a screenshot of the current page viewport and returns it as a VSBuffer.
	 * @param pageId The browser view ID identifying the page to capture.
	 * @param selector Optional Playwright selector to capture a specific element instead of the viewport.
	 * @param fullPage Whether to capture the full scrollable page instead of just the viewport.
	 * @returns The screenshot image data.
	 */
	captureScreenshot(pageId: string, selector?: string, fullPage?: boolean): Promise<VSBuffer>;

	/**
	 * Responds to a file chooser dialog on the given page.
	 * @param pageId The browser view ID identifying the page.
	 * @param files The list of files to select in the file chooser. Empty to dismiss the dialog without selecting files.
	 * @returns An object with the page summary afterwards.
	 */
	replyToFileChooser(pageId: string, files: string[]): Promise<{ summary: string }>;

	/**
	 * Responds to a dialog (alert, confirm, prompt) on the given page.
	 * @param pageId The browser view ID identifying the page.
	 * @param accept Whether to accept or dismiss the dialog.
	 * @param promptText Optional text to enter into a prompt dialog.
	 * @returns An object with the page summary afterwards.
	 */
	replyToDialog(pageId: string, accept: boolean, promptText?: string): Promise<{ summary: string }>;
}
