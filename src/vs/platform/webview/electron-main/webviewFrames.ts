/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WebContents, WebFrameMain } from 'electron';
import { Schemas } from '../../../base/common/network.js';

/**
 * Whether keyboard focus is in a frame that the content of a webview embeds, such as an `<iframe>`
 * of another origin. Webviews only see the key presses of their own document.
 */
export function isFocusInFrameNestedInWebview(contents: WebContents): boolean {
	try {
		// The focused frame first, the main frame of the window last
		const frames: WebFrameMain[] = [];
		for (let frame = contents.focusedFrame; frame; frame = frame.parent) {
			frames.push(frame);
		}

		// The outermost webview frame is the webview itself, and its child frame holds the content
		for (let i = frames.length - 1; i >= 0; i--) {
			if (frames[i].url.startsWith(`${Schemas.vscodeWebview}:`)) {
				return i >= 2;
			}
		}

		return false;
	} catch {
		// Electron throws for frames that are going away
		return false;
	}
}
