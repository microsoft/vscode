/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatReadOnlyBanner.css';
import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, MutableDisposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../../platform/opener/browser/link.js';

export const CHAT_READ_ONLY_BANNER_HEIGHT = 26;

export class ChatReadOnlyBanner extends Disposable {

	readonly domNode: HTMLElement;

	private _visible = false;
	private readonly text: HTMLElement;
	private readonly actionContainer: HTMLElement;
	private readonly actionLink: Link;
	private readonly hover = this._register(new MutableDisposable<IDisposable>());
	private action: { label: string; tooltip?: string; run(): Promise<void> } | undefined;
	private runningAction: typeof this.action;

	constructor(
		private readonly defaultMessage: string = localize('chatReadOnlyBanner.archivedMessage', "Archived sessions are read-only."),
		@IHoverService private readonly hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.domNode = dom.$('.chat-readonly-banner');
		this.domNode.setAttribute('role', 'status');

		const icon = dom.append(this.domNode, dom.$('.chat-readonly-banner-icon'));
		const renderedIcon = renderIcon(Codicon.lock);
		renderedIcon.setAttribute('aria-hidden', 'true');
		icon.appendChild(renderedIcon);

		this.text = dom.append(this.domNode, dom.$('span.chat-readonly-banner-text'));
		this.actionContainer = dom.append(this.domNode, dom.$('span'));
		this.actionContainer.style.flexShrink = '0';
		this.actionLink = this._register(instantiationService.createInstance(Link, this.actionContainer, { label: '', href: '#' }, {
			opener: () => { void this.runAction().catch(onUnexpectedError); },
		}));
		this.setMessage();
		this.setAction();

		this.setVisible(false);
	}

	get visible(): boolean {
		return this._visible;
	}

	setMessage(message = this.defaultMessage): void {
		if (this.text.textContent !== message) {
			this.text.textContent = message;
			this.hover.value = this.hoverService.setupDelayedHover(this.text, { content: message });
		}
	}

	setAction(action?: { label: string; tooltip?: string; run(): Promise<void> }): void {
		if (this.action?.label !== action?.label || this.action?.tooltip !== action?.tooltip) {
			this.actionLink.link = { label: action?.label ?? '', href: '#', title: action?.tooltip };
		}
		this.action = action;
		this.actionContainer.hidden = !action;
		this.actionLink.enabled = !!action && this.runningAction !== action;
	}

	async runAction(): Promise<void> {
		const action = this.action;
		if (!action || this.runningAction === action) {
			return;
		}
		this.runningAction = action;
		this.actionLink.enabled = false;
		try {
			await action.run();
		} finally {
			if (this.runningAction === action) {
				this.runningAction = undefined;
				if (!this._store.isDisposed) {
					this.actionLink.enabled = !!this.action;
				}
			}
		}
	}

	setVisible(visible: boolean): void {
		this._visible = visible;
		this.domNode.classList.toggle('hidden', !visible);
	}
}
