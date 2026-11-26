/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, getWindow } from '../../../../../base/browser/dom.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';

/**
 * Listens to the window that a chat shows in losing focus. A chat can render before it is attached, such as in a view
 * that its window attaches later, and move between windows, so the listener follows the window of the anchor.
 */
export class ChatWindowBlurListener extends Disposable {

	private readonly listener = this._register(new MutableDisposable());
	private window: Window | undefined;

	constructor(
		private readonly anchor: HTMLElement,
		private readonly onDidBlur: () => void,
	) {
		super();
		this.update();
	}

	/** Listens to the window that the anchor shows in now, unless it already does. */
	update(): void {
		const targetWindow = getWindow(this.anchor);
		if (targetWindow !== this.window) {
			this.window = targetWindow;
			this.listener.value = addDisposableListener(targetWindow, EventType.BLUR, () => this.onDidBlur());
		}
	}
}
