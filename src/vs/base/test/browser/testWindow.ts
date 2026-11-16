/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWindow } from '../../browser/dom.js';
import { ensureCodeWindow } from '../../browser/window.js';
import { IDisposable } from '../../common/lifecycle.js';

let nextTestWindowId = 100_000;

/**
 * Gives the window of an iframe that a test created and attached its own window ID, and registers it, as the
 * auxiliary window service does for real windows. State that is kept per window ID, such as the animation frame
 * queue, is otherwise shared by every such iframe, so one test's iframe can affect another test's.
 * Dispose the returned registration when the iframe is removed.
 */
export function registerTestIframe(iframe: HTMLIFrameElement): IDisposable {
	const targetWindow = iframe.contentWindow;
	if (!targetWindow) {
		throw new Error('Attach the iframe to a document before registering its window.');
	}
	ensureCodeWindow(targetWindow, nextTestWindowId++);
	return registerWindow(targetWindow);
}
