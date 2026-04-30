/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsWalkthrough.css';
import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { $, addDisposableGenericMouseDownListener, append, EventType, addDisposableListener, getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { FileAccess } from '../../../../base/common/network.js';
import { IProductOnboardingTheme } from '../../../../base/common/product.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { URI } from '../../../../base/common/uri.js';
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { ChatSetupStrategy } from '../../../../workbench/contrib/chat/browser/chatSetup/chatSetup.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IWorkbenchThemeService } from '../../../../workbench/services/themes/common/workbenchThemeService.js';
import { IVSCodeThemeImporterService } from '../../../services/vscode/common/vsCodeThemeImporter.js';

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
	private _isShowingWelcome = false;
	private _isShowingSignIn = false;
	private _isShowingThemeStep = false;

	/**
	 * Whether the overlay is currently displaying the signed-in welcome
	 * greeting (as opposed to the sign-in provider buttons). When `true`,
	 * external callers should **not** auto-dismiss the overlay — the user
	 * is expected to click "Get Started" to proceed.
	 */
	get isShowingWelcome(): boolean { return this._isShowingWelcome; }

	/**
	 * Whether the overlay is currently displaying the sign-in buttons.
	 * Only `true` after the sign-in screen has been fully rendered —
	 * deliberately `false` during the loading phase so that external
	 * account resolution (e.g. VS Code signing in) cannot auto-dismiss
	 * the overlay before the user has had a chance to interact.
	 */
	get isShowingSignIn(): boolean { return this._isShowingSignIn; }

	/**
	 * Transition to the theme selection step. Called by external code
	 * (e.g. the contribution) when the user signs in while the sign-in
	 * screen is visible, so the user still gets to pick a theme before
	 * the overlay dismisses.
	 */
	showThemeStep(): void {
		this._isShowingSignIn = false;
		this._renderThemeStep();
	}

	/** Resolves when the user completes or dismisses the walkthrough. */
	readonly outcome: Promise<WalkthroughOutcome> = new Promise(resolve => { this._resolveOutcome = resolve; });

	constructor(
		container: HTMLElement,
		private readonly _isFirstLaunch: boolean,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
		@IVSCodeThemeImporterService private readonly vsCodeThemeImporter: IVSCodeThemeImporterService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
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
				if (this._isShowingThemeStep) {
					// Remove the theme setting to reset to default
					this.themeService.setColorTheme(undefined, ConfigurationTarget.USER);
					this._isShowingWelcome = false;
					this._isShowingThemeStep = false;
					this.complete();
				}
				e.preventDefault();
				e.stopPropagation();
				return;
			}

			if (e.key === 'Tab') {
				this._trapFocus(e);
			}
		}));
		this._register(addDisposableGenericMouseDownListener(this.overlay, e => {
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

		// Set synchronously so the autorun in the contribution doesn't
		// auto-dismiss before the async _renderSignIn completes.
		// On first launch, optimistically assume signed in — the welcome
		// screen renders the same regardless, and we update before painting.
		if (this._isFirstLaunch) {
			this._isShowingWelcome = true;
		}

		if (this._isFirstLaunch) {
			// First launch: render a loading state while the default account resolves.
			// Reading `currentDefaultAccount` synchronously here would always return null
			// and cause us to render the sign-in screen for users who are actually signed in.
			this._renderLoading();
			this.defaultAccountService.getDefaultAccount().then(() => {
				if (this._outcomeResolved) {
					return;
				}
				this._isShowingWelcome = this._isSignedIn();
				this._renderSignIn();
			});
		} else {
			// Sign-out scenario (returning user who is now signed out): account is
			// already known to be null, so render the sign-in screen immediately.
			this._isShowingWelcome = false;
			this._renderSignIn();
		}
	}

	/**
	 * Renders a centered animated agents icon as the loading state.
	 * Used while the default account is being resolved on startup, before
	 * the welcome content is rendered.
	 */
	private _renderLoading(): void {
		this.contentContainer.textContent = '';
		this.footerContainer.textContent = '';
		this.disclaimerElement.classList.add('hidden');

		const loadingIndicator = append(this.contentContainer, $('div.sessions-walkthrough-loading-indicator')) as HTMLElement;
		loadingIndicator.setAttribute('role', 'status');
		loadingIndicator.setAttribute('aria-busy', 'true');
		loadingIndicator.setAttribute('aria-label', localize('walkthrough.loading', "Loading"));
		append(loadingIndicator, $('div.sessions-walkthrough-logo.sessions-walkthrough-loading-icon'));
	}

	// ------------------------------------------------------------------
	// Sign In

	private _renderSignIn(): void {
		const stepDisposables = this.stepDisposables.value = new DisposableStore();

		this.contentContainer.textContent = '';
		this.footerContainer.textContent = '';
		this.disclaimerElement.classList.toggle('hidden', this.disclaimerLinks.length === 0);

		const productName = this.productService.nameLong;

		// Horizontal layout: icon left, text + buttons right
		const layout = append(this.contentContainer, $('.sessions-walkthrough-hero'));

		append(layout, $('div.sessions-walkthrough-logo'));

		const right = append(layout, $('.sessions-walkthrough-hero-text'));

		// First time + signed in → welcome greeting with "Get Started"
		if (this._isFirstLaunch && this._isSignedIn()) {
			this._renderWelcome(stepDisposables, right, productName);
			return;
		}

		// Always show the welcome title/subtitle with sign-in buttons,
		// whether it's the first launch or a returning user who is signed out.
		const titleEl = append(right, $('h2', undefined, localize('walkthrough.welcome.title', "Welcome to {0}", productName)));
		const subtitleEl = append(right, $('p', undefined, localize('walkthrough.welcome.subtitle', "Your AI-powered application where agents explore, build, and iterate with you.")));
		append(right, $('p.sessions-walkthrough-tagline', undefined, localize('walkthrough.welcome.tagline', "Happy Agentic Coding!")));

		this._renderSignInButtons(stepDisposables, right, titleEl, subtitleEl);
	}

	private _renderSignInButtons(stepDisposables: DisposableStore, right: HTMLElement, titleEl: HTMLElement, subtitleEl: HTMLElement): void {
		this._isShowingSignIn = true;
		const signInActions = append(right, $('.sessions-walkthrough-sign-in-actions'));
		const providerRow = append(signInActions, $('.sessions-walkthrough-providers-row'));

		const githubBtn = append(providerRow, $('button.sessions-walkthrough-provider-btn.sessions-walkthrough-provider-primary.provider-github')) as HTMLButtonElement;
		append(githubBtn, $('span.sessions-walkthrough-provider-label', undefined, localize('walkthrough.signin.github', "Sign in with GitHub")));

		// Desktop-only provider buttons
		let providerButtons: HTMLButtonElement[];
		if (isWeb) {
			providerButtons = [githubBtn];
		} else {
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

			providerButtons = [githubBtn, googleBtn, appleBtn, enterpriseBtn];
		}

		// Error feedback below providers
		const errorContainer = append(this.footerContainer, $('p.sessions-walkthrough-error'));
		errorContainer.style.display = 'none';

		// Focus the first provider button so keyboard users can interact immediately
		disposableTimeout(() => {
			if (this.overlay.isConnected && !githubBtn.disabled) {
				githubBtn.focus();
			}
		}, 0, stepDisposables);

		this.currentFocusableElements = [...providerButtons, ...this.disclaimerLinks];

		if (isWeb) {
			// Web: GitHub button uses IAuthenticationService with product scopes
			stepDisposables.add(addDisposableListener(githubBtn, EventType.CLICK, () => this._runSignInWeb(
				providerButtons,
				errorContainer,
				titleEl,
				subtitleEl,
				signInActions
			)));
		} else {
			// Desktop: each button uses a different ChatSetupStrategy
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
	}

	// ------------------------------------------------------------------
	// Welcome (first launch + signed in)

	private _renderWelcome(stepDisposables: DisposableStore, right: HTMLElement, productName: string): void {
		this._isShowingWelcome = true;
		this.disclaimerElement.classList.toggle('hidden', this.disclaimerLinks.length === 0);

		append(right, $('h2', undefined, localize('walkthrough.welcome.title', "Welcome to {0}", productName)));
		append(right, $('p', undefined, localize('walkthrough.welcome.subtitle', "Your AI-powered application where agents explore, build, and iterate with you.")));
		append(right, $('p.sessions-walkthrough-tagline', undefined, localize('walkthrough.welcome.tagline', "Happy Agentic Coding!")));

		const actions = append(right, $('.sessions-walkthrough-welcome-actions'));
		const getStartedBtn = append(actions, $('button.sessions-walkthrough-get-started-btn')) as HTMLButtonElement;
		getStartedBtn.textContent = localize('walkthrough.welcome.getStarted', "Get Started");
		stepDisposables.add(addDisposableListener(getStartedBtn, EventType.CLICK, () => {
			this._isShowingWelcome = false;
			this._renderThemeStep();
		}));

		this.currentFocusableElements = [getStartedBtn, ...this.disclaimerLinks];

		disposableTimeout(() => {
			if (this.overlay.isConnected) {
				getStartedBtn.focus();
			}
		}, 0, stepDisposables);
	}

	private _isSignedIn(): boolean {
		return this.defaultAccountService.currentDefaultAccount !== null;
	}

	// ------------------------------------------------------------------
	// Theme Step

	private _renderThemeStep(): void {
		const stepDisposables = this.stepDisposables.value = new DisposableStore();
		this._isShowingWelcome = true;
		this._isShowingThemeStep = true;

		// Start resolving the parent VS Code theme during the fade-out
		const parentThemePromise = !isWeb
			? this.vsCodeThemeImporter.getVSCodeTheme()
			: Promise.resolve(undefined);

		// Fade out current content, then render theme step
		this.contentContainer.classList.add('sessions-walkthrough-fade-out');
		stepDisposables.add(disposableTimeout(async () => {
			if (!this.overlay.isConnected) {
				return;
			}
			const parentTheme = await parentThemePromise;
			if (!this.overlay.isConnected) {
				return;
			}
			// Only show the VS Code theme option if the parent theme is different from the 4 onboarding themes
			const allOnboardingThemes = this.productService.onboardingThemes ?? [];
			const shownThemes = allOnboardingThemes.filter(t => !t.id.startsWith('solarized'));
			const parentThemeSettingsId = shownThemes.some(t => t.themeId === parentTheme) ? undefined : parentTheme;
			this.contentContainer.classList.remove('sessions-walkthrough-fade-out');
			this._renderThemeStepContent(stepDisposables, parentThemeSettingsId);
		}, fadeDuration));
	}

	private _renderThemeStepContent(stepDisposables: DisposableStore, parentThemeSettingsId: string | undefined): void {
		this.contentContainer.textContent = '';
		this.footerContainer.textContent = '';
		this.disclaimerElement.classList.add('hidden');

		// Header
		const header = append(this.contentContainer, $('.sessions-walkthrough-theme-header'));
		append(header, $('h2', undefined, localize('walkthrough.theme.title', "Choose Your Theme")));
		append(header, $('p', undefined, localize('walkthrough.theme.subtitle', "Pick a color theme to make it yours. You can always change it later.")));

		// Build theme list — exclude solarized variants for the base set
		const allOnboardingThemes = this.productService.onboardingThemes ?? [];
		const themes = allOnboardingThemes.filter(t => !t.id.startsWith('solarized'));

		const themeGrid = append(this.contentContainer, $('.sessions-walkthrough-theme-grid'));
		themeGrid.setAttribute('role', 'radiogroup');
		themeGrid.setAttribute('aria-label', localize('walkthrough.theme.ariaLabel', "Choose a color theme"));

		// Pre-select the onboarding theme matching the current theme, or fall back to first
		const currentTheme = this.themeService.getColorTheme();
		let selectedThemeId = themes.find(t => t.themeId === currentTheme.settingsId)?.id ?? themes[0]?.id;

		const themeCards: HTMLElement[] = [];
		let vscodeThemeBtn: HTMLElement | undefined;
		for (const theme of themes) {
			const card = this._createThemeCard(stepDisposables, themeGrid, theme, themeCards, selectedThemeId, id => {
				selectedThemeId = id;
				if (vscodeThemeBtn) {
					vscodeThemeBtn.classList.remove('selected');
					vscodeThemeBtn.setAttribute('aria-checked', 'false');
				}
			});
			themeCards.push(card);
		}

		// Show a VS Code theme option as a radio-style button below the grid
		if (parentThemeSettingsId) {
			const parentName = this.productService.embedded?.nameShort ?? 'VS Code';
			const option = append(this.contentContainer, $('.sessions-walkthrough-vscode-theme-option'));
			vscodeThemeBtn = append(option, $('div.sessions-walkthrough-vscode-theme-radio'));
			vscodeThemeBtn.setAttribute('role', 'radio');
			vscodeThemeBtn.setAttribute('aria-checked', 'false');
			vscodeThemeBtn.setAttribute('tabindex', '0');
			const labelText = localize(
				'walkthrough.theme.useVSCodeTheme',
				"Use My {0} Theme \u00b7 {1}",
				parentName,
				parentThemeSettingsId,
			);
			vscodeThemeBtn.textContent = labelText;
			const selectVSCodeTheme = async () => {
				for (const c of themeCards) {
					c.classList.remove('selected');
					c.setAttribute('aria-checked', 'false');
				}
				vscodeThemeBtn!.classList.add('selected');
				vscodeThemeBtn!.setAttribute('aria-checked', 'true');

				// Apply the theme immediately if it's already available (built-in)
				const allThemes = await this.themeService.getColorThemes();
				const match = allThemes.find(t => t.settingsId === parentThemeSettingsId);
				if (match) {
					this.themeService.setColorTheme(match.id, ConfigurationTarget.USER);
				} else {
					// Theme needs extension install
					vscodeThemeBtn!.textContent = localize('walkthrough.theme.importing', "Importing theme\u2026");
					await this.vsCodeThemeImporter.importVSCodeTheme();
					vscodeThemeBtn!.textContent = labelText;
				}
			};
			stepDisposables.add(addDisposableListener(vscodeThemeBtn, EventType.CLICK, selectVSCodeTheme));
			stepDisposables.add(addDisposableListener(vscodeThemeBtn, EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					vscodeThemeBtn!.click();
				}
			}));
		}

		// Footer with Continue button
		const actions = append(this.footerContainer, $('.sessions-walkthrough-theme-footer'));
		const continueBtn = append(actions, $('button.sessions-walkthrough-get-started-btn')) as HTMLButtonElement;
		continueBtn.textContent = localize('walkthrough.theme.continue', "Continue");
		stepDisposables.add(addDisposableListener(continueBtn, EventType.CLICK, () => {
			this._isShowingWelcome = false;
			this._isShowingThemeStep = false;
			this.complete();
		}));

		this.currentFocusableElements = [...themeCards, ...(vscodeThemeBtn ? [vscodeThemeBtn] : []), continueBtn];

		stepDisposables.add(disposableTimeout(() => {
			if (this.overlay.isConnected) {
				continueBtn.focus();
			}
		}, 0));
	}

	private _createThemeCard(stepDisposables: DisposableStore, parent: HTMLElement, theme: IProductOnboardingTheme, allCards: HTMLElement[], selectedThemeId: string, onSelect: (id: string) => void): HTMLElement {
		const card = append(parent, $('div.sessions-walkthrough-theme-card'));
		card.setAttribute('role', 'radio');
		card.setAttribute('aria-checked', theme.id === selectedThemeId ? 'true' : 'false');
		card.setAttribute('aria-label', theme.label);
		card.setAttribute('tabindex', '0');

		if (theme.id === selectedThemeId) {
			card.classList.add('selected');
		}

		// SVG preview image
		const preview = append(card, $('div.sessions-walkthrough-theme-preview'));
		const img = append(preview, $<HTMLImageElement>('img.sessions-walkthrough-theme-preview-img'));
		img.alt = '';
		img.src = FileAccess.asBrowserUri(`vs/workbench/contrib/welcomeOnboarding/browser/media/theme-preview-${theme.id}.svg`).toString(true);

		// Label
		const label = append(card, $('div.sessions-walkthrough-theme-label'));
		label.textContent = theme.label;

		stepDisposables.add(addDisposableListener(card, EventType.CLICK, () => {
			onSelect(theme.id);
			this._applyTheme(theme);
			for (const c of allCards) {
				c.classList.remove('selected');
				c.setAttribute('aria-checked', 'false');
			}
			card.classList.add('selected');
			card.setAttribute('aria-checked', 'true');
		}));

		stepDisposables.add(addDisposableListener(card, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				card.click();
			}
		}));

		return card;
	}

	private async _applyTheme(theme: IProductOnboardingTheme): Promise<void> {
		const allThemes = await this.themeService.getColorThemes();
		const match = allThemes.find(t => t.settingsId === theme.themeId);
		if (match) {
			this.themeService.setColorTheme(match.id, ConfigurationTarget.USER);
		}
	}

	private async _runSignIn(providerButtons: HTMLButtonElement[], error: HTMLElement, strategy: ChatSetupStrategy, titleEl: HTMLElement, subtitleEl: HTMLElement, signInActions: HTMLElement): Promise<void> {
		await this._fadeToProgress(providerButtons, error, titleEl, subtitleEl, signInActions);
		if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
			return;
		}

		try {
			const success = await this.commandService.executeCommand<boolean>(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, {
				setupStrategy: strategy
			});

			if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
				return;
			}

			if (success) {
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
				this._renderThemeStep();
			} else {
				await this._showErrorAndReset(error, localize('walkthrough.canceledError', "Sign-in was canceled. Please try again."));
			}
		} catch (err) {
			this.logService.error('[sessions walkthrough] Sign-in failed:', err);
			await this._showErrorAndReset(error, localize('walkthrough.signInError', "Something went wrong. Please try again."));
		}
	}

	/**
	 * Web sign-in: uses IAuthenticationService to create a GitHub session
	 * with the scopes defined in product.json. On production vscode.dev
	 * this triggers an OAuth popup. On localhost the embedder's
	 * env-contributed auth provider handles the flow (e.g. device code).
	 */
	private async _runSignInWeb(providerButtons: HTMLButtonElement[], error: HTMLElement, titleEl: HTMLElement, subtitleEl: HTMLElement, signInActions: HTMLElement): Promise<void> {
		await this._fadeToProgress(providerButtons, error, titleEl, subtitleEl, signInActions);
		if (this._shouldAbortUpdate(titleEl, subtitleEl)) {
			return;
		}

		try {
			const scopes = this.productService.defaultChatAgent?.providerScopes?.[0]
				?? ['read:user', 'user:email', 'repo', 'workflow'];
			await this.authenticationService.createSession('github', scopes, { activateImmediate: true });
			this._renderThemeStep();
		} catch (err) {
			this.logService.error('[sessions walkthrough] Web sign-in failed:', err);
			await this._showErrorAndReset(error, localize('walkthrough.signInError', "Something went wrong. Please try again."));
		}
	}

	private async _fadeToProgress(providerButtons: HTMLButtonElement[], error: HTMLElement, titleEl: HTMLElement, subtitleEl: HTMLElement, signInActions: HTMLElement): Promise<void> {
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
	}

	private async _showErrorAndReset(error: HTMLElement, message: string): Promise<void> {
		error.textContent = message;
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
