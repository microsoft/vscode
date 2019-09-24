/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IHostService = createDecorator<IHostService>('hostService');

export interface IHostService {

	_serviceBrand: undefined;

	//#region Window

	/**
	 * The number of windows that belong to the current client session.
	 */
	readonly windowCount: Promise<number>;

	/**
	 * Opens an empty window. The optional parameter allows to define if
	 * a new window should open or the existing one change to an empty.
	 */
	openEmptyWindow(options?: { reuse?: boolean, remoteAuthority?: string }): Promise<void>;

	/**
	 * Switch between fullscreen and normal window.
	 */
	toggleFullScreen(): Promise<void>;

	//#endregion

	//#region Lifecycle

	/**
	 * Restart the entire application.
	 */
	restart(): Promise<void>;

	/**
	 * Reload the currently active window.
	 */
	reload(): Promise<void>;

	/**
	 * Closes the currently opened folder/workspace and returns to an empty
	 * window.
	 */
	closeWorkspace(): Promise<void>;

	//#endregion
}
