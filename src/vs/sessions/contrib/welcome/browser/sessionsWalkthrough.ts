/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsWalkthrough.css';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { $, append, EventType, addDisposableListener } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
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
	private _resolveOutcome!: (outcome: WalkthroughOutcome) => void;

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

		this.overlay = append(container, $('.sessions-walkthrough-overlay'));
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', localize('walkthrough.aria', "Sessions onboarding walkthrough"));
		this._register(toDisposable(() => this.overlay.remove()));

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
		this.contentContainer.textContent = '';
		this.footerContainer.textContent = '';

		// Horizontal layout: icon left, text + buttons right
		const layout = append(this.contentContainer, $('.sessions-walkthrough-hero'));

		const iconEl = append(layout, $('span.sessions-walkthrough-icon.sessions-walkthrough-icon-large'));
		iconEl.appendChild(renderIcon(Codicon.agent));

		const right = append(layout, $('.sessions-walkthrough-hero-text'));
		const titleEl = append(right, $('h2', undefined, localize('walkthrough.step1.title', "Welcome to Sessions")));
		const subtitleEl = append(right, $('p', undefined, localize('walkthrough.step1.subtitle', "Sign in to continue with agent-powered development.")));

		// If already signed in, go straight to success
		if (this._isAlreadySetUp()) {
			this._showSignInSuccess();
			return;
		}

		// Provider buttons row inside the right column
		const providerRow = append(right, $('.sessions-walkthrough-providers-row'));

		// GitHub: text button
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

		const providerButtons = [githubBtn, googleBtn, appleBtn];
		const providerStrategies = [
			ChatSetupStrategy.SetupWithoutEnterpriseProvider, // GitHub
			ChatSetupStrategy.SetupWithGoogleProvider,
			ChatSetupStrategy.SetupWithAppleProvider,
		];

		// Spinner + error below providers
		const spinnerContainer = append(this.footerContainer, $('.sessions-walkthrough-spinner'));
		spinnerContainer.style.display = 'none';
		const errorContainer = append(this.footerContainer, $('p.sessions-walkthrough-error'));
		errorContainer.style.display = 'none';

		for (let i = 0; i < providerButtons.length; i++) {
			const strategy = providerStrategies[i];
			this._register(addDisposableListener(providerButtons[i], EventType.CLICK, () => this._runSignIn(providerButtons, spinnerContainer, errorContainer, strategy, titleEl, subtitleEl, providerRow)));
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

	private async _runSignIn(providerButtons: HTMLButtonElement[], spinner: HTMLElement, error: HTMLElement, strategy: ChatSetupStrategy, titleEl: HTMLElement, subtitleEl: HTMLElement, providerRow: HTMLElement): Promise<void> {
		// Disable all provider buttons
		for (const btn of providerButtons) {
			btn.disabled = true;
		}

		error.style.display = 'none';
		spinner.style.display = 'none';

		// Fade the content
		this.contentContainer.classList.add('sessions-walkthrough-fade-out');
		await new Promise(resolve => setTimeout(resolve, 200));

		// Swap title and subtitle in-place
		titleEl.textContent = localize('walkthrough.settingUp', "Setting up\u2026");
		subtitleEl.textContent = localize('walkthrough.poweredBy', "Sessions is powered by GitHub Copilot");

		// Replace provider buttons with progress bar
		const heroText = providerRow.parentElement!;
		providerRow.remove();
		append(heroText, $('.sessions-walkthrough-progress-bar', undefined, $('.sessions-walkthrough-progress-bar-fill')));

		// Fade back in
		this.contentContainer.classList.remove('sessions-walkthrough-fade-out');

		try {
			const success = await this.commandService.executeCommand<boolean>(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, {
				setupStrategy: strategy,
				dialogHideSkip: true
			});

			if (success) {
				// Update title
				titleEl.textContent = localize('walkthrough.signingIn', "Signing you in\u2026");

				this.logService.info('[sessions walkthrough] Restarting extension host after setup');
				const stopped = await this.extensionService.stopExtensionHosts(
					localize('walkthrough.restart', "Completing sessions setup")
				);
				if (stopped) {
					await this.extensionService.startExtensionHosts();
				}

				// Show personalized success state
				await this._showSignInSuccess();
			} else {
				// Fade back to sign-in state
				this.contentContainer.classList.add('sessions-walkthrough-fade-out');
				await new Promise(resolve => setTimeout(resolve, 200));
				this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
				this._renderSignIn();
			}
		} catch (err) {
			this.logService.error('[sessions walkthrough] Sign-in failed:', err);
			this.contentContainer.classList.add('sessions-walkthrough-fade-out');
			await new Promise(resolve => setTimeout(resolve, 200));
			this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
			this._renderSignIn();
		}
	}

	private async _showSignInSuccess(): Promise<void> {
		// Get user's account name
		const account = await this.defaultAccountService.getDefaultAccount();
		const userName = account?.accountName ?? '';

		// Fade out current content
		this.contentContainer.classList.add('sessions-walkthrough-fade-out');
		await new Promise(resolve => setTimeout(resolve, 200));

		// Rebuild content in hero format
		this.contentContainer.textContent = '';
		this.footerContainer.textContent = '';

		const layout = append(this.contentContainer, $('.sessions-walkthrough-hero'));

		// Large check circle icon
		const iconEl = append(layout, $('span.sessions-walkthrough-icon.sessions-walkthrough-icon-large.sessions-walkthrough-success-icon'));
		iconEl.appendChild(renderIcon(Codicon.check));

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

		const getStartedBtn = this._register(new Button(actions, { ...defaultButtonStyles }));
		getStartedBtn.label = localize('walkthrough.getStarted', "Get Started");
		getStartedBtn.focus();
		this._register(getStartedBtn.onDidClick(() => {
			this._finish('completed');
		}));

		// Fade in
		this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
	}

	// ------------------------------------------------------------------
	// Lifecycle

	private _finish(outcome: WalkthroughOutcome): void {
		this.overlay.classList.add('sessions-walkthrough-dismissed');
		const handle = setTimeout(() => this.dispose(), 250);
		this._register(toDisposable(() => clearTimeout(handle)));
		this._resolveOutcome(outcome);
	}

	dismiss(): void {
		this._finish('dismissed');
	}
}
