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

/**
 * Full-window impassable overlay shown when the Agents app has been
 * disabled via group policy. Blocks all user interaction.
 */
export class SessionsPolicyBlockedOverlay extends Disposable {

	private readonly overlay: HTMLElement;

	constructor(
		container: HTMLElement,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
	) {
		super();

		this.overlay = append(container, $('.sessions-policy-blocked-overlay'));
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', localize('policyBlocked.aria', "Agents disabled by organization policy"));
		this.overlay.tabIndex = -1;
		this.overlay.focus();
		this._register(toDisposable(() => this.overlay.remove()));

		const card = append(this.overlay, $('.sessions-policy-blocked-card'));

		// Block keyboard shortcuts while the overlay is present, but allow
		// interaction with focusable elements inside the card.
		this._register(addDisposableListener(getWindow(this.overlay), EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (card.contains(e.target as Node)) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
		}, true));

		// Block mouse interaction on the overlay background, but allow
		// clicks through to card children (e.g. the "Open VS Code" button).
		this._register(addDisposableGenericMouseDownListener(this.overlay, e => {
			if (e.target === this.overlay) {
				e.preventDefault();
				e.stopPropagation();
			}
		}));

		// Sessions logo
		append(card, $('div.sessions-policy-blocked-logo'));

		// Title
		append(card, $('h2', undefined, localize('policyBlocked.title', "Agents Disabled")));

		// Description
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

		// Open VS Code button
		const button = this._register(new Button(card, { ...defaultButtonStyles, secondary: true }));
		button.label = localize('policyBlocked.openVSCode', "Open VS Code");
		this._register(button.onDidClick(() => this._openVSCode()));
	}

	private _openVSCode(): void {
		const scheme = this.productService.parentPolicyConfig?.urlProtocol ?? this.productService.urlProtocol;
		this.openerService.open(URI.from({ scheme, query: 'windowId=_blank' }), { openExternal: true });
	}
}
