/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from '../../../../base/browser/dom.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isLinux } from '../../../../base/common/platform.js';

/**
 * On Linux, a middle-click delivers the X11 primary selection as a paste into
 * whatever editable element gains focus right after the click. When an action
 * launched from a middle-click opens a terminal, which then takes focus, that
 * stray paste is executed by the shell. preventDefault on the click itself
 * cannot stop it (the click target is not editable), so swallow the paste the
 * browser dispatches right after the click. No real paste can happen within
 * this window.
 */
export function swallowMiddleClickPaste(targetWindow: Window, timeout = 250): IDisposable {
	if (!isLinux) {
		return { dispose() { } };
	}

	const guard = new DisposableStore();

	guard.add(addDisposableListener(targetWindow, 'paste', e => {
		e.preventDefault();
		e.stopImmediatePropagation();
	}, true));

	// Fallback for paste paths that only dispatch `beforeinput` (Chromium 60+).
	guard.add(addDisposableListener(targetWindow, 'beforeinput', (e: InputEvent) => {
		if (e.inputType === 'insertFromPaste') {
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}, true));

	const timeoutHandle = targetWindow.setTimeout(() => guard.dispose(), timeout);
	guard.add(toDisposable(() => targetWindow.clearTimeout(timeoutHandle)));

	return toDisposable(() => guard.dispose());
}
