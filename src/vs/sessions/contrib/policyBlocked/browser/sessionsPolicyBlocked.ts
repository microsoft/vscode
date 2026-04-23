/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsPolicyBlocked.css';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { $, addDisposableGenericMouseDownListener, append, EventType, addDisposableListener, getWindow } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { URI } from '../../../../base/common/uri.js';

export const enum SessionsBlockedReason {
	AgentDisabled = 'agentDisabled',
	/** Transient loading state — blocks UI but shows only a progress bar. */
	Loading = 'loading',
}

export interface ISessionsBlockedOverlayOptions {
	readonly reason: SessionsBlockedReason;
}

/**
 * Full-window impassable overlay shown when the Agents app is blocked.
 * Supports multiple blocking reasons with different messaging and actions.
 */
export class SessionsPolicyBlockedOverlay extends Disposable {

	private readonly overlay: HTMLElement;

	constructor(
		container: HTMLElement,
		options: ISessionsBlockedOverlayOptions,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
	) {
		super();

		this.overlay = append(container, $('.sessions-policy-blocked-overlay'));
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.tabIndex = -1;
		this.overlay.focus();
		this._register(toDisposable(() => this.overlay.remove()));

		const card = append(this.overlay, $('.sessions-policy-blocked-card'));

		this._register(addDisposableListener(getWindow(this.overlay), EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (card.contains(e.target as Node)) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
		}, true));

		this._register(addDisposableGenericMouseDownListener(this.overlay, e => {
			if (e.target === this.overlay) {
				e.preventDefault();
				e.stopPropagation();
			}
		}));

		// Sessions logo
		append(card, $('div.sessions-policy-blocked-logo'));

		switch (options.reason) {
			case SessionsBlockedReason.AgentDisabled:
				this._renderAgentDisabled(card);
				break;
			case SessionsBlockedReason.Loading:
				this._renderLoading(card);
				break;
		}
	}

	private _renderAgentDisabled(card: HTMLElement): void {
		this.overlay.setAttribute('aria-label', localize('policyBlocked.aria', "Agents disabled by organization policy"));

		append(card, $('h2', undefined, localize('policyBlocked.title', "Agents Disabled")));

		const description = append(card, $('p'));
		append(description, document.createTextNode(localize('policyBlocked.description', "Your organization has disabled Agents via policy.")));
		append(description, document.createTextNode(' '));
		const learnMore = append(description, $('a.sessions-policy-blocked-link')) as HTMLAnchorElement;
		learnMore.textContent = localize('policyBlocked.learnMore', "Learn more");
		learnMore.href = 'https://aka.ms/VSCode/Agents/docs';
		this._register(addDisposableListener(learnMore, EventType.CLICK, (e) => {
			e.preventDefault();
			this.openerService.open(URI.parse('https://aka.ms/VSCode/Agents/docs'));
		}));

		const button = this._register(new Button(card, { ...defaultButtonStyles, secondary: true }));
		button.label = localize('policyBlocked.openVSCode', "Open VS Code");
		this._register(button.onDidClick(() => this._openVSCode()));
	}

	private _renderLoading(card: HTMLElement): void {
		this.overlay.setAttribute('aria-label', localize('loading.aria', "Loading"));
		append(card, $('div.sessions-policy-blocked-progress-bar', undefined,
			$('div.sessions-policy-blocked-progress-bar-fill')
		));
	}

	private _openVSCode(): void {
		const scheme = this.productService.parentPolicyConfig?.urlProtocol ?? this.productService.urlProtocol;
		this.openerService.open(URI.from({ scheme, query: 'windowId=_blank' }), { openExternal: true });
	}
}
