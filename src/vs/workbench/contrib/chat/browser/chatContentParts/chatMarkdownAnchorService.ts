/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, isActiveElement } from '../../../../../base/browser/dom.js';
import { Disposable, IDisposable, combinedDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InlineAnchorWidget } from '../chatInlineAnchorWidget.js';


export const IChatMarkdownAnchorService = createDecorator<IChatMarkdownAnchorService>('chatMarkdownAnchorService');

export interface IChatMarkdownAnchorService {

	readonly _serviceBrand: undefined;

	/**
	 * Returns the currently focused anchor if any
	 */
	readonly lastFocusedAnchor: InlineAnchorWidget | undefined;

	register(widget: InlineAnchorWidget): IDisposable;
}

export class ChatMarkdownAnchorService extends Disposable implements IChatMarkdownAnchorService {

	declare readonly _serviceBrand: undefined;

	private _widgets: InlineAnchorWidget[] = [];
	private _lastFocusedWidget: InlineAnchorWidget | undefined = undefined;

	get lastFocusedAnchor(): InlineAnchorWidget | undefined {
		return this._lastFocusedWidget;
	}

	private setLastFocusedList(widget: InlineAnchorWidget | undefined): void {
		this._lastFocusedWidget = widget;
	}

	register(widget: InlineAnchorWidget): IDisposable {
		if (this._widgets.some(other => other === widget)) {
			throw new Error('Cannot register the same widget multiple times');
		}

		// Keep in our lists list
		this._widgets.push(widget);

		const element = widget.getHTMLElement();

		// Check for currently being focused
		if (isActiveElement(element)) {
			this.setLastFocusedList(widget);
		}

		return combinedDisposable(
			addDisposableListener(element, 'focus', () => this.setLastFocusedList(widget)),
			toDisposable(() => this._widgets.splice(this._widgets.indexOf(widget), 1)),
			addDisposableListener(element, 'blur', () => {
				if (this._lastFocusedWidget === widget) {
					this.setLastFocusedList(undefined);
				}
			}),
		);
	}
}
