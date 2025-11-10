/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { FocusMode } from '../../../../platform/native/common/native.js';
import { IWindowOpenable, IOpenWindowOptions, IOpenEmptyWindowOptions, IPoint, IRectangle, IOpenedMainWindow, IOpenedAuxiliaryWindow } from '../../../../platform/window/common/window.js';

export const IHostService = createDecorator<IHostService>('hostService');

/**
 * A set of methods supported in both web and native environments.
 *
 * @see {@link INativeHostService} for methods that are specific to native
 * environments.
 */
export interface IHostService {

	readonly _serviceBrand: undefined;

	//#region Focus

	/**
	 * Emitted when the focus of the window changes.
	 *
	 * Note: this considers the main window as well as auxiliary windows
	 * when they are in focus. As long as the main window or any of its
	 * auxiliary windows have focus, this event fires with `true`. It will
	 * fire with `false` when neither the main window nor any of its
	 * auxiliary windows have focus.
	 */
	readonly onDidChangeFocus: Event<boolean>;

	/**
	 * Find out if the window or any of its auxiliary windows have focus.
	 */
	readonly hasFocus: boolean;

	/**
	 * Find out if the window had the last focus.
	 */
	hadLastFocus(): Promise<boolean>;

	/**
	 * Attempt to bring the window to the foreground and focus it.
	 *
	 * @param options How to focus the window, defaults to {@link FocusMode.Transfer}
	 */
	focus(targetWindow: Window, options?: { mode?: FocusMode }): Promise<void>;

	//#endregion

	//#region Window

	/**
	 * Emitted when the active window changes between main window
	 * and auxiliary windows.
	 */
	readonly onDidChangeActiveWindow: Event<number>;

	/**
	 * Emitted when the window with the given identifier changes
	 * its fullscreen state.
	 */
	readonly onDidChangeFullScreen: Event<{ windowId: number; fullscreen: boolean }>;

	/**
	 * Opens an empty window. The optional parameter allows to define if
	 * a new window should open or the existing one change to an empty.
	 */
	openWindow(options?: IOpenEmptyWindowOptions): Promise<void>;

	/**
	 * Opens the provided array of openables in a window with the provided options.
	 */
	openWindow(toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void>;

	/**
	 * Switch between fullscreen and normal window.
	 */
	toggleFullScreen(targetWindow: Window): Promise<void>;

	/**
	 * Bring a window to the front and restore it if needed.
	 */
	moveTop(targetWindow: Window): Promise<void>;

	/**
	 * Get the location of the mouse cursor and its display bounds or `undefined` if unavailable.
	 */
	getCursorScreenPoint(): Promise<{ readonly point: IPoint; readonly display: IRectangle } | undefined>;

	/**
	 * Get the list of opened windows, optionally including auxiliary windows.
	 */
	getWindows(options: { includeAuxiliaryWindows: true }): Promise<Array<IOpenedMainWindow | IOpenedAuxiliaryWindow>>;
	getWindows(options: { includeAuxiliaryWindows: false }): Promise<Array<IOpenedMainWindow>>;

	//#endregion

	//#region Lifecycle

	/**
	 * Restart the entire application.
	 */
	restart(): Promise<void>;

	/**
	 * Reload the currently active main window.
	 */
	reload(options?: { disableExtensions?: boolean }): Promise<void>;

	/**
	 * Attempt to close the active main window.
	 */
	close(): Promise<void>;

	/**
	 * Execute an asynchronous `expectedShutdownTask`. While this task is
	 * in progress, attempts to quit the application will not be vetoed with a dialog.
	 */
	withExpectedShutdown<T>(expectedShutdownTask: () => Promise<T>): Promise<T>;

	//#endregion

	//#region Screenshots

	/**
	 * Captures a screenshot.
	 */
	getScreenshot(rect?: IRectangle): Promise<VSBuffer | undefined>;

	//#endregion

	//#region Native Handle

	/**
	 * Get the native handle of the window.
	 */
	getNativeWindowHandle(windowId: number): Promise<VSBuffer | undefined>;

	//#endregion
}
