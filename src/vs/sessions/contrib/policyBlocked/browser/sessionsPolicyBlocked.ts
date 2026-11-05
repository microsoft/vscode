/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsPolicyBlocked.css';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { $, addDisposableGenericMouseDownListener, append, EventType, addDisposableListener, getActiveElement, getWindow, isHTMLElement, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { URI } from '../../../../base/common/uri.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IWorkbenchLayoutService, Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IManagedSettingsFreshness, ManagedSettingsFreshnessFailure, ManagedSettingsFreshnessState } from '../../../../platform/policy/common/managedSettingsFreshness.js';
import { IManagedSettingsUpdateInfo } from '../../../../workbench/services/policies/common/managedSettingsUpdate.js';
import { getOrganizationSupportActionLabel, getOrganizationSupportActionTooltip, openOrganizationSupport } from '../../../../workbench/services/policies/common/organizationSupport.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

export const enum SessionsBlockedReason {
	AgentDisabled = 'agentDisabled',
	/** Transient loading state — blocks UI but shows only a progress bar. */
	Loading = 'loading',
	/** Signed in but not in an approved org — must switch accounts. */
	AccountPolicyGate = 'accountPolicyGate',
	ManagedSettingsRefresh = 'managedSettingsRefresh',
	UpdateRequired = 'updateRequired',
}

export interface ISessionsBlockedOverlayOptions {
	readonly reason: SessionsBlockedReason;
	readonly approvedOrganizations?: readonly string[];
	readonly accountName?: string;
	readonly freshness?: Extract<IManagedSettingsFreshness, { state: ManagedSettingsFreshnessState.Blocked }>;
	readonly updateInfo?: IManagedSettingsUpdateInfo;
	/** The organization's validated support page, offered wherever the overlay says to contact an administrator. */
	readonly supportUrl?: string;
	readonly shouldFocus?: boolean;
	/** The label of the action to focus when this overlay replaces one where it had focus. */
	readonly focusAction?: string;
}

/** The card's keyboard-focusable actions, in tab order. */
function getFocusableActions(card: HTMLElement): HTMLElement[] {
	const actions: HTMLElement[] = [];
	const walker = card.ownerDocument.createTreeWalker(card, NodeFilter.SHOW_ELEMENT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (isHTMLElement(node) && node.tabIndex >= 0 && !node.hasAttribute('disabled') && node.getAttribute('aria-disabled') !== 'true') {
			actions.push(node);
		}
	}
	return actions;
}

/**
 * Full-window impassable overlay shown when the Agents app is blocked.
 */
export class SessionsPolicyBlockedOverlay extends Disposable {

	private readonly overlay: HTMLElement;
	private readonly previouslyFocused: Element | null;

	constructor(
		container: HTMLElement,
		private readonly options: ISessionsBlockedOverlayOptions,
		@ICommandService private readonly commandService: ICommandService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ISessionsService private readonly sessionsService: ISessionsService,
	) {
		super();

		this.previouslyFocused = getActiveElement();
		this.overlay = append(container, $('.sessions-policy-blocked-overlay'));
		this.overlay.setAttribute('role', options.reason === SessionsBlockedReason.UpdateRequired ? 'region' : 'dialog');
		if (options.reason !== SessionsBlockedReason.UpdateRequired) {
			this.overlay.setAttribute('aria-modal', 'true');
		}
		this.overlay.tabIndex = -1;
		this._register(toDisposable(() => this.overlay.remove()));

		const workbenchRoot = layoutService.mainContainer;
		workbenchRoot.classList.add('sessions-policy-blocked');
		this._register(toDisposable(() => workbenchRoot.classList.remove('sessions-policy-blocked')));

		// Every card scrolls, so its actions stay reachable in a short window or with large text.
		const scrollContent = $('.sessions-policy-blocked-scroll-content');
		const scrollable = this._register(new DomScrollableElement(scrollContent, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto, useShadows: false }));
		const revealFocusedAction = () => {
			const focusedElement = getActiveElement();
			if (isHTMLElement(focusedElement) && scrollContent.contains(focusedElement)) {
				focusedElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
				scrollable.scanDomNode();
			}
		};
		const scrollContainer = append(this.overlay, scrollable.getDomNode());
		scrollContainer.classList.add('sessions-policy-blocked-scrollable');
		this._register(addDisposableListener(scrollContent, EventType.SCROLL, () => scrollable.setScrollPosition({ scrollTop: scrollContent.scrollTop })));
		const focusScroll = this._register(new MutableDisposable());
		this._register(addDisposableListener(scrollContent, EventType.FOCUS_IN, () => {
			// Reveal after the browser's native focus scrolling.
			focusScroll.value = scheduleAtNextAnimationFrame(getWindow(scrollContent), revealFocusedAction);
		}));
		const card = append(scrollContent, $('.sessions-policy-blocked-card'));
		if (options.reason === SessionsBlockedReason.UpdateRequired) {
			this.overlay.classList.add('update-required');
			const inertParts = new Map<HTMLElement, boolean>();
			this._register(toDisposable(() => {
				for (const [part, inert] of inertParts) {
					part.inert = inert;
				}
			}));
			const layout = () => {
				this.overlay.style.top = `${layoutService.mainContainerOffset.top}px`;
				for (const id of [Parts.SESSIONS_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.PANEL_PART, Parts.AUXILIARYBAR_PART, Parts.CUSTOM_VIEW_GRID_PART]) {
					const part = layoutService.getContainer(mainWindow, id);
					if (part && !inertParts.has(part)) {
						inertParts.set(part, part.inert);
						part.inert = true;
					}
				}
				scrollable.scanDomNode();
				revealFocusedAction();
			};
			layout();
			this._register(layoutService.onDidLayoutMainContainer(layout));
		} else {
			this._register(layoutService.onDidLayoutMainContainer(() => {
				scrollable.scanDomNode();
				revealFocusedAction();
			}));
		}

		this._register(addDisposableListener(getWindow(this.overlay), EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (options.reason === SessionsBlockedReason.UpdateRequired) {
				return;
			}
			// Dialogs and quick picks opened from the card, such as link protection, render outside it.
			if (isHTMLElement(e.target) && e.target.closest('.monaco-dialog-modal-block, .quick-input-widget')) {
				return;
			}
			if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey && this._cycleFocusWithinCard(card, e.target, e.shiftKey)) {
				e.preventDefault();
				e.stopPropagation();
				return;
			}
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

		let defaultFocus: HTMLElement = this.overlay;
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
			case SessionsBlockedReason.ManagedSettingsRefresh:
				this._renderManagedSettingsRefresh(card, options.freshness);
				break;
			case SessionsBlockedReason.UpdateRequired:
				defaultFocus = this._renderUpdateRequired(card, options.updateInfo!).element;
				break;
		}
		scrollable.scanDomNode();
		if (options.shouldFocus !== false) {
			// A rerender keeps focus on the same action, or moves it to the primary action if that one was removed.
			const actions = getFocusableActions(card);
			const focusTarget = options.focusAction === undefined
				? defaultFocus
				: actions.find(action => action.textContent === options.focusAction)
				?? actions.find(action => action.classList.contains('monaco-button'))
				?? actions[0]
				?? defaultFocus;
			focusTarget.focus();
		}
	}

	hasFocus(): boolean {
		return this.overlay.contains(getActiveElement());
	}

	/** The label of the focused card action, so a rerender can focus the same action again. */
	getFocusedAction(): string | undefined {
		const focused = getActiveElement();
		return isHTMLElement(focused) && focused !== this.overlay && this.overlay.contains(focused) ? focused.textContent ?? undefined : undefined;
	}

	/**
	 * Keeps Tab focus within the card: from the overlay or another surface it enters the card,
	 * and from the last or first action it wraps around. Returns whether focus was moved.
	 */
	private _cycleFocusWithinCard(card: HTMLElement, target: EventTarget | null, backwards: boolean): boolean {
		const actions = getFocusableActions(card);
		if (!actions.length) {
			return false;
		}
		const first = actions[0];
		const last = actions[actions.length - 1];
		const inCard = isHTMLElement(target) && card.contains(target);
		if (inCard && target !== (backwards ? first : last)) {
			return false;
		}
		(backwards ? last : first).focus();
		return true;
	}

	override dispose(): void {
		const restoreFocus = this.options.reason === SessionsBlockedReason.UpdateRequired && this.hasFocus();
		super.dispose();
		if (!restoreFocus) {
			return;
		}

		if (isHTMLElement(this.previouslyFocused) && this.previouslyFocused.isConnected
			&& this.previouslyFocused !== this.previouslyFocused.ownerDocument.body
			&& this.previouslyFocused !== this.previouslyFocused.ownerDocument.documentElement) {
			this.previouslyFocused.focus({ preventScroll: true });
			if (getActiveElement() === this.previouslyFocused) {
				return;
			}
		}
		this.sessionsService.focusActiveSession();
	}

	private _renderUpdateRequired(card: HTMLElement, info: IManagedSettingsUpdateInfo): Button {
		this.overlay.setAttribute('aria-label', info.title);
		append(card, $('h2', undefined, info.title));
		append(card, $('p', undefined, info.message));
		if (info.detail) {
			append(card, $('p', undefined, info.detail));
		}
		if (info.updateStatus) {
			append(card, $('p', undefined, info.updateStatus));
		}
		let updateButton: Button | undefined;
		if (info.action) {
			const action = info.action;
			updateButton = this._register(new Button(card, defaultButtonStyles));
			updateButton.label = action.label;
			this._register(updateButton.onDidClick(() => this.openerService.open(action.href, { allowCommands: true })));
		}
		const button = this._register(new Button(card, { ...defaultButtonStyles, secondary: true }));
		button.label = localize('managedSettingsUpdate.openEditorWindow', "Open Editor Window");
		this._register(button.onDidClick(() => this._openVSCode()));
		return updateButton ?? button;
	}

	private _renderAgentDisabled(card: HTMLElement): void {
		this.overlay.setAttribute('aria-label', localize('policyBlocked.aria', "Agents disabled by your organization"));

		append(card, $('h2', undefined, localize('policyBlocked.title', "Agents Disabled")));

		const description = append(card, $('p'));
		append(description, document.createTextNode(localize('policyBlocked.description', "Agents are disabled by your organization. Contact your administrator.")));
		append(description, document.createTextNode(' '));
		const learnMore = append(description, $('a.sessions-policy-blocked-link')) as HTMLAnchorElement;
		learnMore.textContent = localize('policyBlocked.learnMore', "Learn more");
		learnMore.href = 'https://aka.ms/VSCode/Agents/docs';
		this._register(addDisposableListener(learnMore, EventType.CLICK, (e) => {
			e.preventDefault();
			this.openerService.open(URI.parse('https://aka.ms/VSCode/Agents/docs'));
		}));

		this._renderOrganizationSupportButton(card, false);
		const button = this._register(new Button(card, { ...defaultButtonStyles, secondary: true }));
		button.label = localize('policyBlocked.openVSCode', "Open VS Code");
		this._register(button.onDidClick(() => this._openVSCode()));
	}

	/** Offers the organization's support page, when it provides one, as the next step after "Contact your administrator". */
	private _renderOrganizationSupportButton(card: HTMLElement, secondary: boolean): void {
		const supportUrl = this.options.supportUrl;
		if (!supportUrl) {
			return;
		}
		const label = getOrganizationSupportActionLabel();
		const button = this._register(new Button(card, { ...defaultButtonStyles, secondary, title: getOrganizationSupportActionTooltip(supportUrl), ariaLabel: label }));
		button.label = label;
		this._register(button.onDidClick(() => openOrganizationSupport(this.openerService, supportUrl)));
	}

	private _renderLoading(card: HTMLElement): void {
		this.overlay.setAttribute('aria-label', localize('loading.aria', "Loading"));
		append(card, $('div.sessions-policy-blocked-progress-bar', undefined,
			$('div.sessions-policy-blocked-progress-bar-fill')
		));
	}

	private _renderAccountPolicyGate(card: HTMLElement, options: ISessionsBlockedOverlayOptions): void {
		this.overlay.setAttribute('aria-label', localize('accountGate.aria', "Sign-in required by your organization"));

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
		this._renderOrganizationSupportButton(card, true);
	}

	private _renderManagedSettingsRefresh(card: HTMLElement, freshness: ISessionsBlockedOverlayOptions['freshness']): void {
		this.overlay.setAttribute('aria-label', localize('managedSettingsRefresh.aria', "Managed settings refresh required"));
		append(card, $('h2', undefined, localize('managedSettingsRefresh.title', "Managed Settings Unavailable")));

		const message = freshness?.failure === ManagedSettingsFreshnessFailure.NoToken
			? localize('managedSettingsRefresh.noToken', "Sign in so {0} can refresh your organization's managed settings before starting an agent.", this.productService.nameShort)
			: freshness?.failure === ManagedSettingsFreshnessFailure.RateLimited
				? localize('managedSettingsRefresh.rateLimited', "Your organization's managed settings service is rate limiting requests. Try again later.")
				: freshness?.failure === ManagedSettingsFreshnessFailure.NoUrl
					? localize('managedSettingsRefresh.noUrl', "{0} cannot locate your organization's managed settings service. Contact your administrator.", this.productService.nameShort)
					: freshness?.failure === ManagedSettingsFreshnessFailure.UpdateRequired
						? localize('managedSettingsRefresh.updateRequired', "Update {0} to a version that supports your organization's managed settings before starting an agent.", this.productService.nameShort)
						: localize('managedSettingsRefresh.failed', "Your organization requires {0} to refresh managed settings whenever it starts or reloads. An error prevented the required policy from being retrieved, so agents are unavailable. Retry, or contact your organization's administrator if the issue persists.", this.productService.nameShort);
		append(card, $('p', undefined, message));

		if (freshness?.failure === ManagedSettingsFreshnessFailure.NoToken) {
			const signInButton = this._register(new Button(card, { ...defaultButtonStyles }));
			signInButton.label = localize('managedSettingsRefresh.signIn', "Sign In");
			this._register(signInButton.onDidClick(() => this.commandService.executeCommand('workbench.action.agenticSignIn')));
		} else if (freshness?.failure !== ManagedSettingsFreshnessFailure.NoUrl
			&& freshness?.failure !== ManagedSettingsFreshnessFailure.UpdateRequired) {
			const retryButton = this._register(new Button(card, { ...defaultButtonStyles }));
			retryButton.label = localize('managedSettingsRefresh.retry', "Retry");
			this._register(retryButton.onDidClick(() => this.defaultAccountService.refresh({ forceRefresh: true, retryManagedSettings: true })));
		}
		if (freshness?.failure !== ManagedSettingsFreshnessFailure.NoToken
			&& freshness?.failure !== ManagedSettingsFreshnessFailure.RateLimited
			&& freshness?.failure !== ManagedSettingsFreshnessFailure.UpdateRequired) {
			this._renderOrganizationSupportButton(card, true);
		}

		const openVSCodeButton = this._register(new Button(card, { ...defaultButtonStyles, secondary: true }));
		openVSCodeButton.label = localize('managedSettingsRefresh.openVSCode', "Open VS Code");
		this._register(openVSCodeButton.onDidClick(() => this._openVSCode()));
	}

	private _openVSCode(): void {
		const scheme = this.productService.parentPolicyConfig?.urlProtocol ?? this.productService.urlProtocol;
		this.openerService.open(URI.from({ scheme, query: 'windowId=_blank' }), { openExternal: true });
	}
}
