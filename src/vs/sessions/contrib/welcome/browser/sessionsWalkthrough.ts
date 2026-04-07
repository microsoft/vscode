/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsWalkthrough.css';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { $, append, EventType, addDisposableListener, getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatSetupStrategy } from '../../../../workbench/contrib/chat/browser/chatSetup/chatSetup.js';
import { URI } from '../../../../base/common/uri.js';

export type WalkthroughOutcome = 'completed' | 'dismissed';

const fadeDuration = 200;
const resetMessageDuration = 2000;
const dismissDuration = 250;
const fallbackChatAgentLinks = {
	termsStatementUrl: 'https://aka.ms/github-copilot-terms-statement',
	privacyStatementUrl: 'https://aka.ms/github-copilot-privacy-statement',
	publicCodeMatchesUrl: 'https://aka.ms/github-copilot-match-public-code',
	manageSettingsUrl: 'https://aka.ms/github-copilot-settings'
};

/**
 * Sign-in onboarding overlay:
 *   - Sign in via GitHub / Google / Apple
 */
export class SessionsWalkthroughOverlay extends Disposable {

	private readonly overlay: HTMLElement;
	private readonly card: HTMLElement;
	private readonly contentContainer: HTMLElement;
	private readonly footerContainer: HTMLElement;
	private readonly disclaimerElement: HTMLElement;
	private readonly disclaimerLinks: readonly HTMLAnchorElement[];
	private readonly stepDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly previouslyFocusedElement: HTMLElement | undefined;
	private currentFocusableElements: readonly HTMLElement[] = [];
	private _resolveOutcome!: (outcome: WalkthroughOutcome) => void;
	private _outcomeResolved = false;

	/** Resolves when the user completes or dismisses the walkthrough. */
	readonly outcome: Promise<WalkthroughOutcome> = new Promise(resolve => { this._resolveOutcome = resolve; });

	constructor(
		container: HTMLElement,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const activeElement = getActiveElement();
		this.previouslyFocusedElement = isHTMLElement(activeElement) ? activeElement : undefined;

		this.overlay = append(container, $('.sessions-walkthrough-overlay'));
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', localize('walkthrough.aria', "Agents onboarding walkthrough"));
		this._register(toDisposable(() => this.overlay.remove()));
		this._register(addDisposableListener(this.overlay, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				return;
			}

			if (e.key === 'Tab') {
				this._trapFocus(e);
			}
		}));
		this._register(addDisposableListener(this.overlay, EventType.MOUSE_DOWN, e => {
			if (e.target === this.overlay) {
				e.preventDefault();
				e.stopPropagation();
			}
		}));

		this.card = append(this.overlay, $('.sessions-walkthrough-card'));

		// Scrollable content area
		this.contentContainer = append(this.card, $('.sessions-walkthrough-content'));

		// Fixed footer
		this.footerContainer = append(this.card, $('.sessions-walkthrough-footer'));
		const disclaimer = this._createDisclaimer();
		this.disclaimerElement = disclaimer.element;
		this.disclaimerLinks = disclaimer.links;

		this._renderSignIn();
	}

	// ------------------------------------------------------------------
	// Sign In

	private _renderSignIn(): void {
		const stepDisposables = this.stepDisposables.value = new DisposableStore();

		this.contentContainer.textContent = '';
		this.footerContainer.textContent = '';
		this.disclaimerElement.classList.toggle('hidden', this.disclaimerLinks.length === 0);

		// Horizontal layout: icon left, text + buttons right
		const layout = append(this.contentContainer, $('.sessions-walkthrough-hero'));

		append(layout, $('div.sessions-walkthrough-logo'));

		const right = append(layout, $('.sessions-walkthrough-hero-text'));
		const titleEl = append(right, $('h2', undefined, localize('walkthrough.step1.title', "Welcome to Agents")));
		const subtitleEl = append(right, $('p', undefined, localize('walkthrough.step1.subtitle', "Sign in to continue with agent-powered development.")));

		// If already signed in, finish immediately so the app can render.
		if (this._isAlreadySetUp()) {
			this.complete();
			return;
		}

		const signInActions = append(right, $('.sessions-walkthrough-sign-in-actions'));
		const providerRow = append(signInActions, $('.sessions-walkthrough-providers-row'));

		const githubBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-primary.provider-github')) as HTMLButtonElement;
		append(githubBtn, $('span.sessions-walkthrough-provider-label', undefined, localize('walkthrough.signin.github', "Continue with GitHub")));

		const googleBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-icon-only.provider-google')) as HTMLButtonElement;
		googleBtn.setAttribute('aria-label', localize('walkthrough.signin.google', "Continue with Google"));
		googleBtn.title = localize('walkthrough.signin.google', "Continue with Google");

		const appleBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-icon-only.provider-apple')) as HTMLButtonElement;
		appleBtn.setAttribute('aria-label', localize('walkthrough.signin.apple', "Continue with Apple"));
		appleBtn.title = localize('walkthrough.signin.apple', "Continue with Apple");

		const enterpriseProviderName = this.productService.defaultChatAgent?.provider?.enterprise?.name || 'GHE';
		const enterpriseBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-compact.provider-enterprise')) as HTMLButtonElement;
		enterpriseBtn.setAttribute('aria-label', localize('walkthrough.signin.enterprise', "Continue with {0}", enterpriseProviderName));
		enterpriseBtn.title = localize('walkthrough.signin.enterprise', "Continue with {0}", enterpriseProviderName);
		append(enterpriseBtn, $('span.sessions-walkthrough-provider-label', undefined, enterpriseProviderName));

		// Error feedback below providers
		const errorContainer = append(this.footerContainer, $('p.sessions-walkthrough-error'));
		errorContainer.style.display = 'none';

		// Focus the first provider button so keyboard users can interact immediately
		disposableTimeout(() => {
			if (this.overlay.isConnected && !githubBtn.disabled) {
				githubBtn.focus();
			}
		}, 0, stepDisposables);

		const providerButtons = [githubBtn, googleBtn, appleBtn, enterpriseBtn];
		this.currentFocusableElements = [...providerButtons, ...this.disclaimerLinks];
		const providerStrategies = [
			ChatSetupStrategy.SetupWithoutEnterpriseProvider,
			ChatSetupStrategy.SetupWithGoogleProvider,
			ChatSetupStrategy.SetupWithAppleProvider,
			ChatSetupStrategy.SetupWithEnterpriseProvider,
		];
		for (let i = 0; i < providerButtons.length; i++) {
			const strategy = providerStrategies[i];
			stepDisposables.add(addDisposableListener(providerButtons[i], EventType.CLICK, () => this._runSignIn(
				providerButtons,
				errorContainer,
				strategy,
				titleEl,
				subtitleEl,
				signInActions
			)));
		}
	}

	private _isAlreadySetUp(): boolean {
		const { sentiment, entitlement } = this.chatEntitlementService;
		return !!(
			sentiment?.installed &&
			!sentiment?.disabled &&
			entitlement !== ChatEntitlement.Available &&
			!(entitlement === ChatEntitlement.Unknown && !this.chatEntitlementService.anonymous)
		);
	}

	private async _runSignIn(providerButtons: HTMLButtonElement[], error: HTMLElement, strategy: ChatSetupStrategy, titleEl: HTMLElement, subtitleEl: HTMLElement, signInActions: HTMLElement): Promise<void> {
		// Disable all provider buttons
		for (const btn of providerButtons) {
			btn.disabled = true;
		}
		this.currentFocusableElements = [];

		error.style.display = 'none';

		// Fade the content
		this.disclaimerElement.classList.add('hidden');
		this.contentContainer.classList.add('sessions-walkthrough-fade-out');
		await this._wait(fadeDuration);
		if (this._shouldAbortUpdate(titleEl, subtitleEl, signInActions)) {
			return;
		}

		// Swap title and subtitle in-place
		titleEl.textContent = localize('walkthrough.settingUp', "Signing in\u2026");
		subtitleEl.textContent = localize('walkthrough.poweredBy', "Complete authorization in your browser.");

		// Replace sign-in actions with progress bar
		const heroText = signInActions.parentElement;
		if (!heroText) {
			return;
		}
		signInActions.remove();
		append(heroText, $('.sessions-walkthrough-progress-bar', undefined, $('.sessions-walkthrough-progress-bar-fill')));

		// Fade back in
		this.contentContainer.classList.remove('sessions-walkthrough-fade-out');

		try {
			const success = await this.commandService.executeCommand<boolean>(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, {
				setupStrategy: strategy
			});
			if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
				return;
			}

			if (success) {
				// Update title and subtitle for the finishing phase
				titleEl.textContent = localize('walkthrough.signingIn', "Finishing setup\u2026");
				subtitleEl.textContent = localize('walkthrough.finishingSubtitle', "Getting everything ready for you.");

				this.logService.info('[sessions walkthrough] Restarting extension host after setup');
				const stopped = await this.extensionService.stopExtensionHosts(
					localize('walkthrough.restart', "Completing Agents setup")
				);
				if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
					return;
				}
				if (stopped) {
					await this.extensionService.startExtensionHosts();
					if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
						return;
					}
				}

				this.complete();
			} else {
				// Show cancellation feedback, then reset to sign-in
				error.textContent = localize('walkthrough.canceledError', "Sign-in was canceled. Please try again.");
				error.style.display = '';
				await this._wait(resetMessageDuration);
				if (this._shouldAbortUpdate(error)) {
					return;
				}
				error.style.display = 'none';

				this.contentContainer.classList.add('sessions-walkthrough-fade-out');
				await this._wait(fadeDuration);
				if (!this.overlay.isConnected) {
					return;
				}
				this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
				this._renderSignIn();
			}
		} catch (err) {
			this.logService.error('[sessions walkthrough] Sign-in failed:', err);

			// Show error feedback, then reset to sign-in
			error.textContent = localize('walkthrough.signInError', "Something went wrong. Please try again.");
			error.style.display = '';
			await this._wait(resetMessageDuration);
			if (this._shouldAbortUpdate(error)) {
				return;
			}
			error.style.display = 'none';

			this.contentContainer.classList.add('sessions-walkthrough-fade-out');
			await this._wait(fadeDuration);
			if (!this.overlay.isConnected) {
				return;
			}
			this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
			this._renderSignIn();
		}
	}

	// ------------------------------------------------------------------
	// Lifecycle

	complete(): void {
		this._finish('completed');
	}

	private _finish(outcome: WalkthroughOutcome): void {
		this.overlay.classList.add('sessions-walkthrough-dismissed');
		this._register(disposableTimeout(() => this.dispose(), dismissDuration));
		if (!this._outcomeResolved) {
			this._outcomeResolved = true;
			this._resolveOutcome(outcome);
		}
	}

	dismiss(): void {
		this._finish('dismissed');
	}

	override dispose(): void {
		// If the overlay is disposed without an explicit finish (e.g. cleared by
		// the owner's DisposableStore), treat it as a dismissal so that `outcome`
		// always resolves and callers are never left waiting on a pending promise.
		if (!this._outcomeResolved) {
			this._outcomeResolved = true;
			this._resolveOutcome('dismissed');
		}
		super.dispose();
		if (this.previouslyFocusedElement?.isConnected) {
			this.previouslyFocusedElement.focus();
		}
	}

	private _trapFocus(event: KeyboardEvent): void {
		const focusableElements = this._getFocusableElements();
		if (!focusableElements.length) {
			return;
		}

		const activeElement = getActiveElement();
		const fallbackElement = event.shiftKey ? focusableElements[focusableElements.length - 1] : focusableElements[0];
		if (!isHTMLElement(activeElement)) {
			event.preventDefault();
			fallbackElement?.focus();
			return;
		}

		const focusedIndex = focusableElements.indexOf(activeElement);
		if (focusedIndex === -1) {
			event.preventDefault();
			fallbackElement?.focus();
			return;
		}

		if (!event.shiftKey && focusedIndex === focusableElements.length - 1) {
			event.preventDefault();
			focusableElements[0].focus();
		} else if (event.shiftKey && focusedIndex === 0) {
			event.preventDefault();
			focusableElements[focusableElements.length - 1]?.focus();
		}
	}

	private _getFocusableElements(): HTMLElement[] {
		return this.currentFocusableElements.filter(element => element.isConnected);
	}

	private _wait(duration: number): Promise<void> {
		return new Promise(resolve => {
			let didResolve = false;
			const timeoutDisposables = this.stepDisposables.value?.add(new DisposableStore()) ?? this._register(new DisposableStore());
			const complete = () => {
				if (didResolve) {
					return;
				}

				didResolve = true;
				timeoutDisposables.dispose();
				resolve();
			};

			timeoutDisposables.add(disposableTimeout(complete, duration));
			timeoutDisposables.add(toDisposable(complete));
		});
	}

	private _shouldAbortUpdate(...elements: HTMLElement[]): boolean {
		return !this.overlay.isConnected || elements.some(element => !element.isConnected);
	}

	private _createDisclaimer(): { element: HTMLElement; links: readonly HTMLAnchorElement[] } {
		const defaultChatAgent = this.productService.defaultChatAgent;
		const disclaimer = append(this.overlay, $('p.sessions-walkthrough-disclaimer.hidden'));
		const termsStatementUrl = defaultChatAgent?.termsStatementUrl || fallbackChatAgentLinks.termsStatementUrl;
		const privacyStatementUrl = defaultChatAgent?.privacyStatementUrl || fallbackChatAgentLinks.privacyStatementUrl;
		const publicCodeMatchesUrl = defaultChatAgent?.publicCodeMatchesUrl || fallbackChatAgentLinks.publicCodeMatchesUrl;
		const manageSettingsUrl = defaultChatAgent?.manageSettingsUrl || fallbackChatAgentLinks.manageSettingsUrl;

		const termsLink = this._appendDisclaimerLink(termsStatementUrl, localize('walkthrough.disclaimer.terms', "Terms"));
		const privacyLink = this._appendDisclaimerLink(privacyStatementUrl, localize('walkthrough.disclaimer.privacy', "Privacy Statement"));
		const publicCodeLink = this._appendDisclaimerLink(publicCodeMatchesUrl, localize('walkthrough.disclaimer.publicCode', "public code"));
		const settingsLink = this._appendDisclaimerLink(manageSettingsUrl, localize('walkthrough.disclaimer.settings', "settings"));

		append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.prefix', "By continuing, you agree to GitHub's ")));
		disclaimer.appendChild(termsLink);
		append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.middle', " and ")));
		disclaimer.appendChild(privacyLink);
		append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.suffix', ". GitHub Copilot may show ")));
		disclaimer.appendChild(publicCodeLink);
		append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.final', " suggestions and use your data to improve the product. You can change these ")));
		disclaimer.appendChild(settingsLink);
		append(disclaimer, document.createTextNode(localize('walkthrough.disclaimer.end', " anytime.")));

		return {
			element: disclaimer,
			links: [termsLink, privacyLink, publicCodeLink, settingsLink]
		};
	}

	private _appendDisclaimerLink(href: string, label: string): HTMLAnchorElement {
		const link = $('a', { href }, label) as HTMLAnchorElement;
		this._register(addDisposableListener(link, EventType.CLICK, e => {
			e.preventDefault();
			e.stopPropagation();
			if (href) {
				void this.openerService.open(URI.parse(href), { fromUserGesture: true });
			}
		}));
		return link;
	}
}
