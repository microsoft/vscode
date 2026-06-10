/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IPlaywrightService = createDecorator<IPlaywrightService>('playwrightService');

export interface IInvokeFunctionResult {
	result?: unknown;
	error?: string;
	summary: string;
	/** When present the function did not complete within the timeout. Pass this ID to {@link IPlaywrightService.waitForDeferredResult} to keep waiting. */
	deferredResultId?: string;
}

/**
 * A service for using Playwright to connect to and automate the integrated browser.
 *
 * The service maintains a separate Playwright browser instance per session. Callers
 * must pass a {@link sessionId} to every method so operations are routed to the
 * correct instance. Page tracking is shared globally across all sessions.
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
	 * @param sessionId Identifies the session making the request.
	 * @param url The URL to open in the new page.
	 * @returns An object containing the new page's view ID and a summary of its initial state.
	 */
	openPage(sessionId: string, url: string): Promise<{ pageId: string; summary: string }>;

	/**
	 * Gets a summary of the page's current state, including its DOM and visual representation.
	 * @param sessionId Identifies the session making the request.
	 * @param pageId The browser view ID identifying the page to read.
	 * @returns The summary of the page's current state.
	 */
	getSummary(sessionId: string, pageId: string): Promise<string>;

	/**
	 * Run a function with access to a Playwright page and return its raw result, or throw an error.
	 * The first function argument is always the Playwright `page` object, and additional arguments can be passed after.
	 * @param sessionId Identifies the session making the request.
	 * @param pageId The browser view ID identifying the page to operate on.
	 * @param fnDef The function code to execute. Should contain the function definition but not its invocation, e.g. `async (page, arg1, arg2) => { ... }`.
	 * @param args Additional arguments to pass to the function after the `page` object.
	 * @returns The result of the function execution.
	 */
	invokeFunctionRaw<T>(sessionId: string, pageId: string, fnDef: string, ...args: unknown[]): Promise<T>;

	/**
	 * Run a function with access to a Playwright page and return a result for tool output, including error handling.
	 * The first function argument is always the Playwright `page` object, and additional arguments can be passed after.
	 *
	 * When {@link timeoutMs} is provided, the call races against that timeout.
	 * If the timeout fires before the function completes, or the function is otherwise interrupted,
	 * the in-flight promise is stored as a *deferred result* and the returned object includes a
	 * {@link deferredResultId} that can be passed to {@link waitForDeferredResult} to resume waiting.
	 * When {@link timeoutMs} is omitted the function runs to completion with no deferral.
	 *
	 * @param sessionId Identifies the session making the request.
	 * @param pageId The browser view ID identifying the page to operate on.
	 * @param fnDef The function code to execute. Should contain the function definition but not its invocation, e.g. `async (page, arg1, arg2) => { ... }`.
	 * @param args Additional arguments to pass to the function after the `page` object.
	 * @param timeoutMs Maximum time (in ms) to wait for the function to complete before deferring. When omitted the call awaits indefinitely.
	 * @returns The result of the function execution, including a page summary and optionally a deferredResultId if the call did not complete.
	 */
	invokeFunction(sessionId: string, pageId: string, fnDef: string, args?: unknown[], timeoutMs?: number): Promise<IInvokeFunctionResult>;

	/**
	 * Continue waiting for a previously deferred function invocation.
	 *
	 * @param sessionId Identifies the session making the request.
	 * @param deferredResultId The ID returned from a timed-out {@link invokeFunction} call.
	 * @param timeoutMs Maximum time (in ms) to wait before returning a deferred result again.
	 * @returns The same shape as {@link invokeFunction}. If the result is still not
	 * available after the timeout, {@link deferredResultId} is returned again.
	 */
	waitForDeferredResult(sessionId: string, deferredResultId: string, timeoutMs: number): Promise<IInvokeFunctionResult>;

	/**
	 * Responds to a file chooser dialog on the given page.
	 * @param sessionId Identifies the session making the request.
	 * @param pageId The browser view ID identifying the page.
	 * @param files The list of files to select in the file chooser. Empty to dismiss the dialog without selecting files.
	 * @returns An object with the page summary afterwards.
	 */
	replyToFileChooser(sessionId: string, pageId: string, files: string[]): Promise<{ summary: string }>;

	/**
	 * Responds to a dialog (alert, confirm, prompt) on the given page.
	 * @param sessionId Identifies the session making the request.
	 * @param pageId The browser view ID identifying the page.
	 * @param accept Whether to accept or dismiss the dialog.
	 * @param promptText Optional text to enter into a prompt dialog.
	 * @returns An object with the page summary afterwards.
	 */
	replyToDialog(sessionId: string, pageId: string, accept: boolean, promptText?: string): Promise<{ summary: string }>;

	/**
	 * Dispose a session's Playwright browser connection and release its resources.
	 * The session will be lazily recreated if needed.
	 * @param sessionId Identifies the session to dispose.
	 */
	disposeSession(sessionId: string): Promise<void>;
}
