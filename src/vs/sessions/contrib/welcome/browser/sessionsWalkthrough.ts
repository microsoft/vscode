/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsWalkthrough.css';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { $, append, EventType, addDisposableListener, getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatSetupStrategy } from '../../../../workbench/contrib/chat/browser/chatSetup/chatSetup.js';

export type WalkthroughOutcome = 'completed' | 'dismissed';

/**
 * Sign-in onboarding overlay:
 *   - Sign in via GitHub / Google / Apple
 *   - Success state with "Get Started" button
 */
export class SessionsWalkthroughOverlay extends Disposable {

	private readonly overlay: HTMLElement;
	private readonly card: HTMLElement;
	private readonly contentContainer: HTMLElement;
	private readonly footerContainer: HTMLElement;
	private readonly stepDisposables = this._register(new MutableDisposable<DisposableStore>());
	private readonly previouslyFocusedElement: HTMLElement | undefined;
	private _resolveOutcome!: (outcome: WalkthroughOutcome) => void;
	private _outcomeResolved = false;

	/** Resolves when the user completes or dismisses the walkthrough. */
	readonly outcome: Promise<WalkthroughOutcome> = new Promise(resolve => { this._resolveOutcome = resolve; });

	constructor(
		container: HTMLElement,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
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

		this._renderSignIn();
	}

	// ------------------------------------------------------------------
	// Sign In

	private _renderSignIn(): void {
		const stepDisposables = this.stepDisposables.value = new DisposableStore();

		this.contentContainer.textContent = '';
		this.footerContainer.textContent = '';

		// Horizontal layout: icon left, text + buttons right
		const layout = append(this.contentContainer, $('.sessions-walkthrough-hero'));

		append(layout, $('div.sessions-walkthrough-logo'));

		const right = append(layout, $('.sessions-walkthrough-hero-text'));
		const titleEl = append(right, $('h2', undefined, localize('walkthrough.step1.title', "Welcome to Agents")));
		const subtitleEl = append(right, $('p', undefined, localize('walkthrough.step1.subtitle', "Sign in to continue with agent-powered development.")));

		// If already signed in, go straight to success
		if (this._isAlreadySetUp()) {
			this._showSignInSuccess().catch(err => this.logService.error('[sessions walkthrough] Failed to show sign-in success:', err));
			return;
		}

		// Sign-in button row inside the right column. We keep the dedicated
		// Google/Apple affordances in the UI, but intentionally route all of them
		// through the default GitHub provider flow because it already exposes
		// Apple/Google social sign-in options on the hosted auth page.
		const providerRow = append(right, $('.sessions-walkthrough-providers-row'));

		// Primary sign-in button
		const githubBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.provider-github')) as HTMLButtonElement;
		append(githubBtn, $('span.sessions-walkthrough-provider-label', undefined, localize('walkthrough.signin.githubCopilot', "Continue with GitHub Copilot")));

		// Google: icon-only
		const googleBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-icon-only.provider-google')) as HTMLButtonElement;
		googleBtn.setAttribute('aria-label', localize('walkthrough.signin.google', "Continue with Google"));
		googleBtn.title = localize('walkthrough.signin.google', "Continue with Google");

		// Apple: icon-only
		const appleBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-icon-only.provider-apple')) as HTMLButtonElement;
		appleBtn.setAttribute('aria-label', localize('walkthrough.signin.apple', "Continue with Apple"));
		appleBtn.title = localize('walkthrough.signin.apple', "Continue with Apple");

		// Error feedback below providers
		const errorContainer = append(this.footerContainer, $('p.sessions-walkthrough-error'));
		errorContainer.style.display = 'none';

		// Focus the first provider button so keyboard users can interact immediately
		disposableTimeout(() => {
			if (this.overlay.isConnected && !githubBtn.disabled) {
				githubBtn.focus();
			}
		}, 0, stepDisposables);

		const providerButtons = [githubBtn, googleBtn, appleBtn];
		for (const button of providerButtons) {
			stepDisposables.add(addDisposableListener(button, EventType.CLICK, () => this._runSignIn(
				providerButtons,
				errorContainer,
				ChatSetupStrategy.SetupWithoutEnterpriseProvider,
				titleEl,
				subtitleEl,
				providerRow
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

	private async _runSignIn(providerButtons: HTMLButtonElement[], error: HTMLElement, strategy: ChatSetupStrategy, titleEl: HTMLElement, subtitleEl: HTMLElement, providerRow: HTMLElement): Promise<void> {
		// Disable all provider buttons
		for (const btn of providerButtons) {
			btn.disabled = true;
		}

		error.style.display = 'none';

		// Fade the content
		this.contentContainer.classList.add('sessions-walkthrough-fade-out');
		await new Promise(resolve => setTimeout(resolve, 200));
		if (this._shouldAbortUpdate(titleEl, subtitleEl, providerRow)) {
			return;
		}

		// Swap title and subtitle in-place
		titleEl.textContent = localize('walkthrough.settingUp', "Signing in\u2026");
		subtitleEl.textContent = localize('walkthrough.poweredBy', "Complete authorization in your browser.");

		// Replace provider buttons with progress bar
		const heroText = providerRow.parentElement;
		if (!heroText) {
			return;
		}
		providerRow.remove();
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

				// Show personalized success state
				await this._showSignInSuccess();
			} else {
				// Show cancellation feedback, then reset to sign-in
				error.textContent = localize('walkthrough.canceledError', "Sign-in was canceled. Please try again.");
				error.style.display = '';
				await new Promise(resolve => setTimeout(resolve, 2000));
				if (this._shouldAbortUpdate(error)) {
					return;
				}
				error.style.display = 'none';

				this.contentContainer.classList.add('sessions-walkthrough-fade-out');
				await new Promise(resolve => setTimeout(resolve, 200));
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
			await new Promise(resolve => setTimeout(resolve, 2000));
			if (this._shouldAbortUpdate(error)) {
				return;
			}
			error.style.display = 'none';

			this.contentContainer.classList.add('sessions-walkthrough-fade-out');
			await new Promise(resolve => setTimeout(resolve, 200));
			if (!this.overlay.isConnected) {
				return;
			}
			this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
			this._renderSignIn();
		}
	}

	private async _showSignInSuccess(): Promise<void> {
		const stepDisposables = this.stepDisposables.value = new DisposableStore();

		// Get user's account name
		const account = await this.defaultAccountService.getDefaultAccount();
		const userName = account?.accountName ?? '';
		if (!this.overlay.isConnected) {
			return;
		}

		// Fade out current content
		this.contentContainer.classList.add('sessions-walkthrough-fade-out');
		await new Promise(resolve => setTimeout(resolve, 200));
		if (!this.overlay.isConnected) {
			return;
		}

		// Rebuild content in hero format
		this.contentContainer.textContent = '';
		this.footerContainer.textContent = '';

		const layout = append(this.contentContainer, $('.sessions-walkthrough-hero'));

		const right = append(layout, $('.sessions-walkthrough-hero-text'));

		// Welcome message
		if (userName) {
			append(right, $('h2', undefined, localize('walkthrough.welcomeUser', "Welcome, {0}", userName)));
		} else {
			append(right, $('h2', undefined, localize('walkthrough.welcomeBack', "You\u2019re all set")));
		}

		append(right, $('p', undefined, localize('walkthrough.successSubtitle', "You\u2019re signed in and ready to go.")));

		// Get Started button
		const actions = append(right, $('.sessions-walkthrough-success-actions'));

		const getStartedBtn = stepDisposables.add(new Button(actions, { ...defaultButtonStyles }));
		getStartedBtn.label = localize('walkthrough.getStarted', "Get Started");
		getStartedBtn.focus();
		stepDisposables.add(getStartedBtn.onDidClick(() => {
			this._finish('completed');
		}));

		// Fade in
		this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
	}

	// ------------------------------------------------------------------
	// Lifecycle

	private _finish(outcome: WalkthroughOutcome): void {
		this.overlay.classList.add('sessions-walkthrough-dismissed');
		this._register(disposableTimeout(() => this.dispose(), 250));
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
		this.previouslyFocusedElement?.isConnected && this.previouslyFocusedElement.focus();
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
		return Array.from(this.card.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
			.filter(element => element.getClientRects().length > 0);
	}

	private _shouldAbortUpdate(...elements: HTMLElement[]): boolean {
		return !this.overlay.isConnected || elements.some(element => !element.isConnected);
	}
}
