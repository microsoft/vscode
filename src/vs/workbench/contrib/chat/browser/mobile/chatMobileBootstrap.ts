/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IChatWidget } from '../chat.js';

/**
 * Applies the mobile-web-phone overrides to a single {@link IChatWidget}.
 *
 * The bootstrap is the only place in the codebase that *uses* mobile-specific
 * APIs on chat widgets. It centralises:
 *
 *  - Switching the transcript's virtualised list to native browser overflow
 *    scrolling, which restores momentum / rubber-band scrolling.
 *  - Short-circuiting synthetic gesture dispatch on the rows container so the
 *    OS long-press selection menu and copy/paste callout work.
 *
 * Returns a disposable that reverts both effects.
 */
export class ChatMobileBootstrap {

	static enable(widget: IChatWidget): IDisposable {
		const store = new DisposableStore();
		store.add(widget.enableNativeTouchScroll());
		return store;
	}
}
