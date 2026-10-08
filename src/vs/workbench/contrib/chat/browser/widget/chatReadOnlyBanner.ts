/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatReadOnlyBanner.css';
import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';

export const CHAT_READ_ONLY_BANNER_HEIGHT = 26;

export class ChatReadOnlyBanner extends Disposable {

	readonly domNode: HTMLElement;

	private _visible = false;
	private readonly text: HTMLElement;
	private readonly hover = this._register(new MutableDisposable());
	private currentMessage: string | undefined;

	constructor(
		private readonly defaultMessage: string = localize('chatReadOnlyBanner.archivedMessage', "Archived sessions are read-only."),
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();

		this.domNode = dom.$('.chat-readonly-banner');
		this.domNode.setAttribute('role', 'status');

		const icon = dom.append(this.domNode, dom.$('.chat-readonly-banner-icon'));
		const renderedIcon = renderIcon(Codicon.lock);
		renderedIcon.setAttribute('aria-hidden', 'true');
		icon.appendChild(renderedIcon);

		this.text = dom.append(this.domNode, dom.$('span.chat-readonly-banner-text'));
		this.setMessage();

		this.setVisible(false);
	}

	get visible(): boolean {
		return this._visible;
	}

	setMessage(message = this.defaultMessage): void {
		if (message === this.currentMessage) {
			return;
		}
		this.currentMessage = message;
		this.text.textContent = message;
		this.hover.value = this.hoverService.setupDelayedHover(this.text, { content: message });
	}

	setVisible(visible: boolean): void {
		this._visible = visible;
		this.domNode.classList.toggle('hidden', !visible);
	}
}
