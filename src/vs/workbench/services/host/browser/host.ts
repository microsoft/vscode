/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWindowOpenable, IOpenWindowOptions, IOpenEmptyWindowOptions, IPoint, IRectangle } from 'vs/platform/window/common/window';

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
	 * @param options Pass `force: true` if you want to make the window take
	 * focus even if the application does not have focus currently. This option
	 * should only be used if it is necessary to steal focus from the current
	 * focused application which may not be VSCode. It may not be supported
	 * in all environments.
	 */
	focus(targetWindow: Window, options?: { force: boolean }): Promise<void>;

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

	//#region File

	getPathForFile(file: File): string | undefined;

	//#endregion
}
