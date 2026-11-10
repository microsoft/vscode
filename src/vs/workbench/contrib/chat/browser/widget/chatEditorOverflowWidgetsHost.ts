/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, getWindow } from '../../../../../base/browser/dom.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';

/**
 * The element that the editor widgets of a chat input, such as its suggest widget, overflow into. It lives in the
 * container of the window that the chat shows in, so that those widgets show in that window.
 */
export class ChatEditorOverflowWidgetsHost extends Disposable {

	readonly element = $('.chat-editor-overflow.monaco-editor');

	constructor(
		private readonly anchor: HTMLElement,
		private readonly layoutService: ILayoutService,
	) {
		super();
		this.layoutService.getContainer(getWindow(this.anchor)).appendChild(this.element);
		this._register(toDisposable(() => this.element.remove()));
	}

	/**
	 * Moves the element into the container of the window that the anchor shows in. A chat can render before it is
	 * attached, such as in a view that its window attaches later, which leaves the element in the main window.
	 */
	update(): void {
		if (!this.anchor.isConnected) {
			return;
		}
		const container = this.layoutService.getContainer(getWindow(this.anchor));
		if (this.element.parentElement !== container) {
			container.appendChild(this.element);
		}
	}
}
