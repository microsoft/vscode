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

/**
 * Resolves once the iframe's window has the viewport of the iframe's box. WebKit can report a freshly attached
 * iframe's viewport as 0x0 until its document is laid out and a frame is rendered, so tests that measure or hit
 * test inside the iframe must wait for this first.
 */
export async function whenTestIframeLaidOut(iframe: HTMLIFrameElement): Promise<void> {
	const targetWindow = iframe.contentWindow;
	const ownerWindow = iframe.ownerDocument.defaultView;
	if (!targetWindow || !ownerWindow) {
		throw new Error('Attach the iframe to a document before waiting for its layout.');
	}
	iframe.getBoundingClientRect();
	await new Promise<void>(resolve => ownerWindow.requestAnimationFrame(() => resolve()));
	const expected = [iframe.clientWidth, iframe.clientHeight];
	const actual = [targetWindow.innerWidth, targetWindow.innerHeight];
	if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
		throw new Error(`The iframe's viewport is ${actual.join('x')} after a rendered frame, expected ${expected.join('x')}.`);
	}
}
