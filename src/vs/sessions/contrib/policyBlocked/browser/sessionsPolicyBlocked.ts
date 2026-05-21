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
import { ICommandService } from '../../../../platform/commands/common/commands.js';

export const enum SessionsBlockedReason {
	AgentDisabled = 'agentDisabled',
	/** Transient loading state — blocks UI but shows only a progress bar. */
	Loading = 'loading',
	/** Signed in but not in an approved org — must switch accounts. */
	AccountPolicyGate = 'accountPolicyGate',
}

export interface ISessionsBlockedOverlayOptions {
	readonly reason: SessionsBlockedReason;
	readonly approvedOrganizations?: readonly string[];
	readonly accountName?: string;
}

/**
 * Full-window impassable overlay shown when the Agents app is blocked.
 */
export class SessionsPolicyBlockedOverlay extends Disposable {

	private readonly overlay: HTMLElement;

	constructor(
		container: HTMLElement,
		options: ISessionsBlockedOverlayOptions,
		@ICommandService private readonly commandService: ICommandService,
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

		append(card, $('div.sessions-policy-blocked-logo'));

		switch (options.reason) {
			case SessionsBlockedReason.AgentDisabled:
				this._renderAgentDisabled(card);
				break;
			case SessionsBlockedReason.Loading:
				this._renderLoading(card);
				break;
			case SessionsBlockedReason.AccountPolicyGate:
				this._renderAccountPolicyGate(card, options);
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

	private _renderAccountPolicyGate(card: HTMLElement, options: ISessionsBlockedOverlayOptions): void {
		this.overlay.setAttribute('aria-label', localize('accountGate.aria', "Sign-in required by your administrator"));

		append(card, $('h2', undefined, localize('accountGate.title', "Sign-In Required")));

		const description = append(card, $('p'));
		if (options.accountName) {
			append(description, document.createTextNode(
				localize('accountGate.descriptionWithAccount', "The account \"{0}\" is not a member of an organization that your administrator allows for Agents.", options.accountName)
			));
		} else {
			append(description, document.createTextNode(
				localize('accountGate.descriptionNoAccount', "Your administrator restricts Agents to members of the organizations below.")
			));
		}

		const approvedOrgs = options.approvedOrganizations ?? [];
		const hasConcreteOrgs = approvedOrgs.length > 0 && !approvedOrgs.includes('*');
		if (hasConcreteOrgs) {
			const orgSection = append(card, $('div.sessions-policy-blocked-orgs'));
			append(orgSection, $('p.sessions-policy-blocked-orgs-label', undefined,
				localize('accountGate.approvedOrgs', "Allowed organizations:")
			));
			const orgList = append(orgSection, $('ul'));
			for (const org of approvedOrgs) {
				append(orgList, $('li', undefined, org));
			}
		}

		const footer = append(card, $('p.sessions-policy-blocked-footer'));
		append(footer, document.createTextNode(localize('accountGate.contactAdmin', "Contact your administrator for more information.")));
		append(footer, document.createTextNode(' '));
		const learnMore = append(footer, $('a.sessions-policy-blocked-link')) as HTMLAnchorElement;
		learnMore.textContent = localize('accountGate.learnMore', "Learn more");
		learnMore.href = 'https://code.visualstudio.com/docs/enterprise/overview';
		this._register(addDisposableListener(learnMore, EventType.CLICK, (e) => {
			e.preventDefault();
			this.openerService.open(URI.parse('https://code.visualstudio.com/docs/enterprise/overview'));
		}));

		const signInButton = this._register(new Button(card, { ...defaultButtonStyles }));
		signInButton.label = localize('accountGate.signIn', "Sign In");
		this._register(signInButton.onDidClick(() => {
			this.commandService.executeCommand('workbench.action.agenticSignIn');
		}));
	}

	private _openVSCode(): void {
		const scheme = this.productService.parentPolicyConfig?.urlProtocol ?? this.productService.urlProtocol;
		this.openerService.open(URI.from({ scheme, query: 'windowId=_blank' }), { openExternal: true });
	}
}
