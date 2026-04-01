/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { $, append, addDisposableListener, EventType, clearNode, getActiveWindow } from '../../../../base/browser/dom.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { IAuthenticationCreateSessionOptions, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import product from '../../../../platform/product/common/product.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import {
	OnboardingStepId,
	ONBOARDING_STEPS,
	ONBOARDING_THEME_OPTIONS,
	ONBOARDING_KEYMAP_OPTIONS,
	ONBOARDING_RECOMMENDED_EXTENSIONS,
	IOnboardingThemeOption,
	getOnboardingStepTitle,
	getOnboardingStepSubtitle,
} from '../common/onboardingTypes.js';

const defaultChat = {
	publicCodeMatchesUrl: product.defaultChatAgent?.publicCodeMatchesUrl ?? '',
	provider: product.defaultChatAgent?.provider ?? { default: { id: 'github', name: 'GitHub' }, enterprise: { id: 'github-enterprise', name: 'GitHub Enterprise' }, apple: { id: '', name: '' }, google: { id: '', name: '' } },
	manageSettingsUrl: product.defaultChatAgent?.manageSettingsUrl ?? '',
	providerUriSetting: product.defaultChatAgent?.providerUriSetting ?? 'github-enterprise.uri',
	termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? '',
	privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? ''
};

/**
 * Variation A — Classic Wizard Modal
 *
 * A centered modal overlay with progress dots, clean step transitions,
 * and polished navigation. Sits on top of the agent sessions welcome
 * tab. When dismissed, the welcome tab is revealed underneath.
 *
 * Steps:
 * 1. Sign In — sessions-style sign-in hero with GitHub Copilot, Google, and Apple options
 * 2. Personalize — Theme selection grid + keymap pills
 * 3. Agent Sessions — Feature cards showcasing AI capabilities
 */
export class OnboardingVariationA extends Disposable {

	private readonly _onDidComplete = this._register(new Emitter<void>());
	readonly onDidComplete: Event<void> = this._onDidComplete.event;

	private readonly _onDidDismiss = this._register(new Emitter<void>());
	readonly onDidDismiss: Event<void> = this._onDidDismiss.event;

	private overlay: HTMLElement | undefined;
	private card: HTMLElement | undefined;
	private bodyEl: HTMLElement | undefined;
	private progressContainer: HTMLElement | undefined;
	private stepLabelEl: HTMLElement | undefined;
	private titleEl: HTMLElement | undefined;
	private subtitleEl: HTMLElement | undefined;
	private contentEl: HTMLElement | undefined;
	private backButton: HTMLButtonElement | undefined;
	private nextButton: HTMLButtonElement | undefined;
	private skipButton: HTMLButtonElement | undefined;

	private currentStepIndex = 0;
	private readonly steps = ONBOARDING_STEPS;
	private readonly disposables = this._register(new DisposableStore());
	private readonly stepDisposables = this._register(new DisposableStore());
	private previouslyFocusedElement: HTMLElement | undefined;
	private _isShowing = false;

	private readonly footerFocusableElements: HTMLElement[] = [];
	private readonly stepFocusableElements: HTMLElement[] = [];
	private selectedThemeId = 'dark-modern';
	private selectedKeymapId = 'vscode';

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		// Detect currently active theme
		const currentTheme = this.themeService.getColorTheme();
		const matchingTheme = ONBOARDING_THEME_OPTIONS.find(t => t.themeId === currentTheme.label);
		if (matchingTheme) {
			this.selectedThemeId = matchingTheme.id;
		}
	}

	get isShowing(): boolean {
		return this._isShowing;
	}

	show(): void {
		if (this.overlay) {
			return;
		}

		this._isShowing = true;
		this.previouslyFocusedElement = getActiveWindow().document.activeElement as HTMLElement | undefined;

		const container = this.layoutService.activeContainer;

		// Overlay
		this.overlay = append(container, $('.onboarding-a-overlay'));
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', localize('onboarding.a.aria', "Welcome to Visual Studio Code"));

		// Card
		this.card = append(this.overlay, $('.onboarding-a-card'));

		// Header with progress
		const header = append(this.card, $('.onboarding-a-header'));
		this.progressContainer = append(header, $('.onboarding-a-progress'));
		this.stepLabelEl = append(header, $('span.onboarding-a-step-label'));
		this._renderProgress();

		// Body
		this.bodyEl = append(this.card, $('.onboarding-a-body'));
		this.titleEl = append(this.bodyEl, $('h2.onboarding-a-step-title'));
		this.subtitleEl = append(this.bodyEl, $('p.onboarding-a-step-subtitle'));
		this.contentEl = append(this.bodyEl, $('.onboarding-a-step-content'));
		this._renderStep();

		// Footer
		const footer = append(this.card, $('.onboarding-a-footer'));

		this.skipButton = append(footer, $<HTMLButtonElement>('button.onboarding-a-btn.onboarding-a-btn-ghost'));
		this.skipButton.textContent = localize('onboarding.skip', "Skip");
		this.skipButton.type = 'button';
		this.footerFocusableElements.push(this.skipButton);

		const footerRight = append(footer, $('.onboarding-a-footer-right'));

		this.backButton = append(footerRight, $<HTMLButtonElement>('button.onboarding-a-btn.onboarding-a-btn-secondary'));
		this.backButton.textContent = localize('onboarding.back', "Back");
		this.backButton.type = 'button';
		this.footerFocusableElements.push(this.backButton);

		this.nextButton = append(footerRight, $<HTMLButtonElement>('button.onboarding-a-btn.onboarding-a-btn-primary'));
		this.nextButton.type = 'button';
		this.footerFocusableElements.push(this.nextButton);
		this._updateButtonStates();

		// Event handlers
		this.disposables.add(addDisposableListener(this.skipButton, EventType.CLICK, () => this._dismiss('skip')));
		this.disposables.add(addDisposableListener(this.backButton, EventType.CLICK, () => this._prevStep()));
		this.disposables.add(addDisposableListener(this.nextButton, EventType.CLICK, () => {
			if (this._isLastStep()) {
				this._dismiss('complete');
			} else {
				this._nextStep();
			}
		}));

		this.disposables.add(addDisposableListener(this.overlay, EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (e.target === this.overlay) {
				this._dismiss('skip');
			}
		}));

		this.disposables.add(addDisposableListener(this.overlay, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);

			if (event.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this._dismiss('skip');
				return;
			}

			if (event.keyCode === KeyCode.Tab) {
				this._trapTab(e, event.shiftKey);
			}
		}));

		// Entrance animation
		this.overlay.classList.add('entering');
		getActiveWindow().requestAnimationFrame(() => {
			this.overlay?.classList.remove('entering');
			this.overlay?.classList.add('visible');
		});

		this._focusCurrentStepElement();
	}

	private _dismiss(reason: 'complete' | 'skip'): void {
		if (!this.overlay) {
			return;
		}

		this.overlay.classList.remove('visible');
		this.overlay.classList.add('exiting');

		const onTransitionEnd = () => {
			this._removeFromDOM();
			if (reason === 'complete') {
				this._onDidComplete.fire();
			}
			this._onDidDismiss.fire();
		};

		this.overlay.addEventListener('transitionend', onTransitionEnd, { once: true });
		setTimeout(onTransitionEnd, 400);
	}

	private _nextStep(): void {
		if (this.currentStepIndex < this.steps.length - 1) {
			this.currentStepIndex++;
			this._renderStep();
			this._renderProgress();
			this._updateButtonStates();
			this._focusCurrentStepElement();
		}
	}

	private _prevStep(): void {
		if (this.currentStepIndex > 0) {
			this.currentStepIndex--;
			this._renderStep();
			this._renderProgress();
			this._updateButtonStates();
			this._focusCurrentStepElement();
		}
	}

	private _isLastStep(): boolean {
		return this.currentStepIndex === this.steps.length - 1;
	}

	private _renderProgress(): void {
		if (!this.progressContainer || !this.stepLabelEl) {
			return;
		}

		clearNode(this.progressContainer);

		for (let i = 0; i < this.steps.length; i++) {
			const dot = append(this.progressContainer, $('span.onboarding-a-progress-dot'));
			if (i === this.currentStepIndex) {
				dot.classList.add('active');
			} else if (i < this.currentStepIndex) {
				dot.classList.add('completed');
			}
		}

		this.stepLabelEl.textContent = localize(
			'onboarding.stepOf',
			"{0} of {1}",
			this.currentStepIndex + 1,
			this.steps.length
		);
	}

	private _renderStep(): void {
		if (!this.titleEl || !this.subtitleEl || !this.contentEl) {
			return;
		}

		this.stepDisposables.clear();
		this.stepFocusableElements.length = 0;

		const stepId = this.steps[this.currentStepIndex];
		const useSignInHero = stepId === OnboardingStepId.SignIn;
		this.titleEl.style.display = useSignInHero ? 'none' : '';
		this.subtitleEl.style.display = useSignInHero ? 'none' : '';
		this.titleEl.textContent = getOnboardingStepTitle(stepId);
		this.subtitleEl.textContent = getOnboardingStepSubtitle(stepId);

		clearNode(this.contentEl);

		switch (stepId) {
			case OnboardingStepId.SignIn:
				this._renderSignInStep(this.contentEl);
				break;
			case OnboardingStepId.Personalize:
				this._renderPersonalizeStep(this.contentEl);
				break;
			case OnboardingStepId.Extensions:
				this._renderExtensionsStep(this.contentEl);
				break;
			case OnboardingStepId.AgentSessions:
				this._renderAgentSessionsStep(this.contentEl);
				break;
		}

		this.bodyEl?.setAttribute('aria-label', localize(
			'onboarding.step.aria',
			"Step {0} of {1}: {2}",
			this.currentStepIndex + 1,
			this.steps.length,
			getOnboardingStepTitle(stepId)
		));
	}

	private _updateButtonStates(): void {
		if (this.backButton) {
			this.backButton.disabled = this.currentStepIndex === 0;
		}
		if (this.nextButton) {
			this.nextButton.textContent = this._isLastStep()
				? localize('onboarding.getStarted', "Get Started")
				: localize('onboarding.next', "Continue");
		}
		if (this.skipButton) {
			this.skipButton.style.visibility = this._isLastStep() ? 'hidden' : 'visible';
		}
	}

	// =====================================================================
	// Step: Sign In
	// =====================================================================

	private _renderSignInStep(container: HTMLElement): void {
		const wrapper = append(container, $('.onboarding-a-signin'));
		const brand = append(wrapper, $('.onboarding-a-signin-brand'));
		const brandIcon = append(brand, $('span.onboarding-a-signin-brand-icon'));
		brandIcon.setAttribute('aria-hidden', 'true');
		brandIcon.appendChild(renderIcon(Codicon.vscode));

		const content = append(wrapper, $('.onboarding-a-signin-content'));
		const contentMain = append(content, $('.onboarding-a-signin-content-main'));
		const title = append(contentMain, $('h2.onboarding-a-signin-title'));
		title.textContent = localize('onboarding.signIn.heroTitle', "Welcome to VS Code");

		const subtitle = append(contentMain, $('p.onboarding-a-signin-subtitle'));
		subtitle.textContent = localize('onboarding.signIn.heroSubtitle', "Sign in to continue with AI-powered development in VS Code.");

		const actions = append(contentMain, $('.onboarding-a-signin-actions'));

		const githubBtn = this._registerStepFocusable(this._createSignInButton(actions, 'github', localize('onboarding.signIn.githubCopilot', "Continue with GitHub Copilot"), {
			emphasized: true,
			label: localize('onboarding.signIn.githubCopilot.aria', "Continue with GitHub Copilot")
		}));
		this.stepDisposables.add(addDisposableListener(githubBtn, EventType.CLICK, () => {
			this._handleSignIn('github', ['user:email']);
		}));

		const googleBtn = this._registerStepFocusable(this._createSignInButton(actions, 'google', localize('onboarding.signIn.google', "Continue with Google"), {
			iconOnly: true,
			label: localize('onboarding.signIn.google', "Continue with Google")
		}));
		this.stepDisposables.add(addDisposableListener(googleBtn, EventType.CLICK, () => {
			this._handleSignIn('github', ['user:email'], { provider: 'google' });
		}));

		const appleBtn = this._registerStepFocusable(this._createSignInButton(actions, 'apple', localize('onboarding.signIn.apple', "Continue with Apple"), {
			iconOnly: true,
			label: localize('onboarding.signIn.apple', "Continue with Apple")
		}));
		this.stepDisposables.add(addDisposableListener(appleBtn, EventType.CLICK, () => {
			this._handleSignIn('github', ['user:email'], { provider: 'apple' });
		}));

		const footer = append(content, $('.onboarding-a-signin-footer'));
		const enterpriseLink = this._registerStepFocusable(append(footer, $<HTMLButtonElement>('button.onboarding-a-signin-inline-link')));
		enterpriseLink.type = 'button';
		enterpriseLink.textContent = localize('onboarding.signIn.enterpriseLink', "Sign in with GitHub Enterprise (ghe.com)");
		this.stepDisposables.add(addDisposableListener(enterpriseLink, EventType.CLICK, () => {
			this._handleEnterpriseSignIn();
		}));

		const disclaimer = append(footer, $('.onboarding-a-signin-disclaimer'));
		disclaimer.append(localize('onboarding.signIn.disclaimer.prefix', "By continuing, you agree to {0}'s ", defaultChat.provider.default.name));
		this._createInlineLink(disclaimer, localize('onboarding.signIn.disclaimer.terms', "Terms"), defaultChat.termsStatementUrl);
		disclaimer.append(localize('onboarding.signIn.disclaimer.middle', " and "));
		this._createInlineLink(disclaimer, localize('onboarding.signIn.disclaimer.privacy', "Privacy Statement"), defaultChat.privacyStatementUrl);
		disclaimer.append(localize('onboarding.signIn.disclaimer.copilotPrefix', ". {0} Copilot may show ", defaultChat.provider.default.name));
		this._createInlineLink(disclaimer, localize('onboarding.signIn.disclaimer.publicCode', "public code"), defaultChat.publicCodeMatchesUrl);
		disclaimer.append(localize('onboarding.signIn.disclaimer.settingsPrefix', " suggestions and use your data to improve the product. You can change these "));
		this._createInlineLink(disclaimer, localize('onboarding.signIn.disclaimer.settings', "settings"), defaultChat.manageSettingsUrl);
		disclaimer.append(localize('onboarding.signIn.disclaimer.suffix', " anytime."));
	}

	private _createSignInButton(parent: HTMLElement, providerClass: 'github' | 'google' | 'apple', label: string, options?: { emphasized?: boolean; iconOnly?: boolean; label?: string }): HTMLButtonElement {
		const btn = append(parent, $<HTMLButtonElement>(options?.iconOnly ? 'button.onboarding-a-signin-icon-btn' : 'button.onboarding-a-signin-btn'));
		btn.type = 'button';
		btn.title = options?.label ?? label;
		btn.setAttribute('aria-label', options?.label ?? label);
		if (options?.emphasized) {
			btn.classList.add('primary');
		}

		const mark = append(btn, $('span.onboarding-a-provider-mark'));
		mark.classList.add(providerClass);
		mark.setAttribute('aria-hidden', 'true');
		if (providerClass === 'github') {
			mark.appendChild(renderIcon(Codicon.github));
		}

		if (!options?.iconOnly) {
			const labelEl = append(btn, $('span.onboarding-a-signin-btn-label'));
			labelEl.textContent = label;
		}

		return btn;
	}

	private async _handleSignIn(providerId: string, scopes: string[], options?: IAuthenticationCreateSessionOptions): Promise<void> {
		try {
			const session = await this.authenticationService.createSession(providerId, scopes, options);
			if (session) {
				this._nextStep();
			}
		} catch (error) {
			if (isCancellationError(error)) {
				return;
			}

			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('onboarding.signIn.error', "Sign-in failed. You can try again later from the Accounts menu."),
			});
		}
	}

	private async _handleEnterpriseSignIn(): Promise<void> {
		try {
			const configured = await this._ensureEnterpriseInstance();
			if (!configured) {
				return;
			}

			const session = await this.authenticationService.createSession(defaultChat.provider.enterprise.id, ['user:email']);
			if (session) {
				this._nextStep();
			}
		} catch (error) {
			if (isCancellationError(error)) {
				return;
			}

			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('onboarding.signIn.enterprise.error', "GitHub Enterprise sign-in failed. Check your instance URL and try again."),
			});
		}
	}

	private async _ensureEnterpriseInstance(): Promise<boolean> {
		const domainRegEx = /^[a-zA-Z\-_]+$/;
		const fullUriRegEx = /^(https:\/\/)?([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.ghe\.com\/?$/;

		const uri = this.configurationService.getValue<string>(defaultChat.providerUriSetting);
		if (typeof uri === 'string' && fullUriRegEx.test(uri)) {
			return true;
		}

		let isSingleWord = false;
		const result = await this.quickInputService.input({
			prompt: localize('onboarding.signIn.enterprise.prompt', "What is your {0} instance?", defaultChat.provider.enterprise.name),
			placeHolder: localize('onboarding.signIn.enterprise.placeholder', 'i.e. "octocat" or "https://octocat.ghe.com"...'),
			ignoreFocusLost: true,
			value: uri,
			validateInput: async value => {
				isSingleWord = false;
				if (!value) {
					return undefined;
				}

				if (domainRegEx.test(value)) {
					isSingleWord = true;
					return {
						content: localize('onboarding.signIn.enterprise.resolve', "Will resolve to {0}", `https://${value}.ghe.com`),
						severity: Severity.Info
					};
				}

				if (!fullUriRegEx.test(value)) {
					return {
						content: localize('onboarding.signIn.enterprise.invalid', 'You must enter a valid {0} instance (i.e. "octocat" or "https://octocat.ghe.com")', defaultChat.provider.enterprise.name),
						severity: Severity.Error
					};
				}

				return undefined;
			}
		});

		if (!result) {
			return false;
		}

		let resolvedUri = result;
		if (isSingleWord) {
			resolvedUri = `https://${resolvedUri}.ghe.com`;
		} else if (!result.toLowerCase().startsWith('https://')) {
			resolvedUri = `https://${result}`;
		}

		await this.configurationService.updateValue(defaultChat.providerUriSetting, resolvedUri, ConfigurationTarget.USER);
		return true;
	}

	// =====================================================================
	// Step: Personalize (Theme + Keymap)
	// =====================================================================

	private _renderPersonalizeStep(container: HTMLElement): void {
		const wrapper = append(container, $('.onboarding-a-personalize'));

		// Theme section
		const themeSection = append(wrapper, $('div.onboarding-a-personalize-section.onboarding-a-personalize-section-theme'));
		const themeLabel = append(themeSection, $('div.onboarding-a-section-label'));
		themeLabel.textContent = localize('onboarding.personalize.theme', "Color Theme");

		const themeGrid = append(themeSection, $('.onboarding-a-theme-grid'));
		themeGrid.setAttribute('role', 'radiogroup');
		themeGrid.setAttribute('aria-label', localize('onboarding.personalize.themeLabel', "Choose a color theme"));

		const themeCards: HTMLElement[] = [];
		for (const theme of ONBOARDING_THEME_OPTIONS) {
			this._createThemeCard(themeGrid, theme, themeCards);
		}

		const themeHint = append(themeSection, $('div.onboarding-a-theme-hint'));
		themeHint.textContent = localize('onboarding.personalize.themeHint', "You can browse and install more themes later from the Extensions view.");

		// Keyboard Mapping section
		const keymapSection = append(wrapper, $('div.onboarding-a-personalize-section.onboarding-a-personalize-section-keymap'));
		const keymapLabel = append(keymapSection, $('div.onboarding-a-section-label'));
		keymapLabel.textContent = localize('onboarding.personalize.keymap', "Keyboard Mapping");

		const keymapHint = append(keymapSection, $('div.onboarding-a-theme-hint'));
		keymapHint.textContent = localize('onboarding.personalize.keymapHint', "Coming from another editor? Import your keyboard mapping to feel right at home.");

		const keymapList = append(keymapSection, $('.onboarding-a-keymap-list'));
		keymapList.setAttribute('role', 'radiogroup');
		keymapList.setAttribute('aria-label', localize('onboarding.personalize.keymapLabel', "Choose a keyboard mapping"));

		const keymapPills: HTMLButtonElement[] = [];
		for (const keymap of ONBOARDING_KEYMAP_OPTIONS) {
			const pill = this._registerStepFocusable(append(keymapList, $<HTMLButtonElement>('button.onboarding-a-keymap-pill')));
			pill.type = 'button';
			pill.setAttribute('role', 'radio');
			pill.setAttribute('aria-checked', keymap.id === this.selectedKeymapId ? 'true' : 'false');
			pill.title = keymap.description;
			keymapPills.push(pill);

			// Icon + label
			pill.appendChild(renderIcon(this._getKeymapIcon(keymap.icon)));
			const labelSpan = append(pill, $('span'));
			labelSpan.textContent = keymap.label;

			if (keymap.id === this.selectedKeymapId) {
				pill.classList.add('selected');
			}

			this.stepDisposables.add(addDisposableListener(pill, EventType.CLICK, () => {
				this.selectedKeymapId = keymap.id;
				this._applyKeymap(keymap.id);

				for (const p of keymapPills) {
					p.classList.remove('selected');
					p.setAttribute('aria-checked', 'false');
				}
				pill.classList.add('selected');
				pill.setAttribute('aria-checked', 'true');
			}));
		}
	}

	private _createThemeCard(parent: HTMLElement, theme: IOnboardingThemeOption, allCards: HTMLElement[]): void {
		const card = this._registerStepFocusable(append(parent, $('div.onboarding-a-theme-card')));
		allCards.push(card);
		card.setAttribute('role', 'radio');
		card.setAttribute('aria-checked', theme.id === this.selectedThemeId ? 'true' : 'false');
		card.setAttribute('aria-label', theme.label);
		card.setAttribute('tabindex', '0');

		if (theme.id === this.selectedThemeId) {
			card.classList.add('selected');
		}

		// Mini VS Code skeleton preview
		const preview = append(card, $('div.onboarding-a-theme-preview'));
		preview.style.backgroundColor = theme.preview.background;
		this._renderEditorSkeleton(preview, theme);

		// Label
		const label = append(card, $('div.onboarding-a-theme-label'));
		label.textContent = theme.label;

		this.stepDisposables.add(addDisposableListener(card, EventType.CLICK, () => {
			this._selectTheme(theme);
			for (const c of allCards) {
				c.classList.remove('selected');
				c.setAttribute('aria-checked', 'false');
			}
			card.classList.add('selected');
			card.setAttribute('aria-checked', 'true');
		}));

		this.stepDisposables.add(addDisposableListener(card, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				card.click();
			}
		}));
	}

	/**
	 * Renders a mini VS Code editor skeleton with sidebar, tabs, and code area.
	 */
	private _renderEditorSkeleton(container: HTMLElement, theme: IOnboardingThemeOption): void {
		const skeleton = append(container, $('div.onboarding-a-skeleton'));

		// Sidebar (narrow strip — uses actual theme sidebar color)
		const sidebar = append(skeleton, $('div.onboarding-a-skeleton-sidebar'));
		sidebar.style.backgroundColor = theme.preview.sidebarBackground;
		for (let i = 0; i < 4; i++) {
			const icon = append(sidebar, $('div.onboarding-a-skeleton-sidebar-icon'));
			icon.style.backgroundColor = theme.preview.lineNumber;
		}

		// Main area
		const main = append(skeleton, $('div.onboarding-a-skeleton-main'));

		// Tab bar (uses actual theme tab bar background)
		const tabBar = append(main, $('div.onboarding-a-skeleton-tabs'));
		tabBar.style.backgroundColor = theme.preview.tabBarBackground;
		tabBar.style.borderBottom = `1px solid ${theme.preview.lineNumber}40`;
		const activeTab = append(tabBar, $('div.onboarding-a-skeleton-tab'));
		activeTab.style.borderBottom = `2px solid ${theme.preview.tabActiveBorder}`;
		activeTab.style.color = theme.preview.foreground;
		activeTab.textContent = 'index.ts';
		const inactiveTab = append(tabBar, $('div.onboarding-a-skeleton-tab.inactive'));
		inactiveTab.style.color = theme.preview.lineNumber;
		inactiveTab.textContent = 'app.ts';

		// Code area with lines
		const codeArea = append(main, $('div.onboarding-a-skeleton-code'));
		const lines = [
			[{ text: 'function ', color: theme.preview.keyword }, { text: 'greet', color: theme.preview.function }, { text: '() {', color: theme.preview.foreground }],
			[{ text: '  ', color: theme.preview.foreground }, { text: '// hello', color: theme.preview.comment }],
			[{ text: '  ', color: theme.preview.foreground }, { text: 'return ', color: theme.preview.keyword }, { text: '"Hi"', color: theme.preview.string }],
			[{ text: '}', color: theme.preview.foreground }],
		];
		for (const line of lines) {
			const lineEl = append(codeArea, $('div.onboarding-a-code-line'));
			for (const token of line) {
				const span = append(lineEl, $('span'));
				span.textContent = token.text;
				span.style.color = token.color;
			}
		}
	}

	/** Maps keymap icon name strings to codicons. */
	private _getKeymapIcon(iconName: string): ThemeIcon {
		switch (iconName) {
			case 'code': return Codicon.vscode;
			case 'edit': return Codicon.edit;
			case 'cloud': return Codicon.cloud;
			case 'file-code': return Codicon.fileCode;
			case 'coffee': return Codicon.coffee;
			case 'terminal': return Codicon.terminal;
			default: return Codicon.keyboard;
		}
	}

	// =====================================================================
	// Step: Extensions
	// =====================================================================

	private _renderExtensionsStep(container: HTMLElement): void {
		const wrapper = append(container, $('div.onboarding-a-extensions'));

		const extList = append(wrapper, $('div.onboarding-a-ext-list'));

		for (const ext of ONBOARDING_RECOMMENDED_EXTENSIONS) {
			const row = append(extList, $('div.onboarding-a-ext-row'));

			const iconEl = append(row, $('div.onboarding-a-ext-icon'));
			iconEl.appendChild(renderIcon(this._getExtIcon(ext.icon)));

			const info = append(row, $('div.onboarding-a-ext-info'));
			const nameRow = append(info, $('div.onboarding-a-ext-name-row'));
			const name = append(nameRow, $('span.onboarding-a-ext-name'));
			name.textContent = ext.name;
			const publisher = append(nameRow, $('span.onboarding-a-ext-publisher'));
			publisher.textContent = ext.publisher;
			const desc = append(info, $('div.onboarding-a-ext-desc'));
			desc.textContent = ext.description;

			const installBtn = this._registerStepFocusable(append(row, $<HTMLButtonElement>('button.onboarding-a-ext-install')));
			installBtn.type = 'button';
			installBtn.textContent = localize('onboarding.ext.install', "Install");

			this.stepDisposables.add(addDisposableListener(installBtn, EventType.CLICK, () => {
				installBtn.textContent = localize('onboarding.ext.installed', "Installed");
				installBtn.disabled = true;
				installBtn.classList.add('installed');
			}));
		}
	}

	private _getExtIcon(iconName: string): ThemeIcon {
		switch (iconName) {
			case 'wand': return Codicon.wand;
			case 'lightbulb': return Codicon.lightbulb;
			case 'symbol-misc': return Codicon.symbolMisc;
			case 'git-merge': return Codicon.gitMerge;
			case 'open-preview': return Codicon.openPreview;
			default: return Codicon.extensions;
		}
	}

	private _selectTheme(theme: IOnboardingThemeOption): void {
		this.selectedThemeId = theme.id;
		this.themeService.setColorTheme(theme.themeId, undefined);
	}

	private async _applyKeymap(keymapId: string): Promise<void> {
		const keymap = ONBOARDING_KEYMAP_OPTIONS.find(k => k.id === keymapId);
		if (!keymap?.extensionId) {
			return; // VS Code default, nothing to install
		}

		try {
			const gallery = await this.extensionGalleryService.getExtensions([{ id: keymap.extensionId }], CancellationToken.None);
			if (gallery.length > 0) {
				await this.extensionManagementService.installFromGallery(gallery[0]);
			}
		} catch {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('onboarding.keymap.installError', "Could not install {0} keymap. You can install it later from Extensions.", keymap.label),
			});
		}
	}

	// =====================================================================
	// Step: Agent Sessions
	// =====================================================================

	private _renderAgentSessionsStep(container: HTMLElement): void {
		const wrapper = append(container, $('.onboarding-a-sessions'));

		const features = append(wrapper, $('.onboarding-a-sessions-features'));

		// Clickable feature cards that launch sessions
		const cloudCard = this._createFeatureCard(features, Codicon.cloud, localize('onboarding.sessions.cloud', "Cloud Sessions"), localize('onboarding.sessions.cloud.desc', "Run agents in the cloud. Code keeps running even when you close the window."));
		this.stepDisposables.add(addDisposableListener(cloudCard, EventType.CLICK, () => {
			this._dismiss('complete');
			this.commandService.executeCommand('workbench.action.chat.open');
		}));

		const localCard = this._createFeatureCard(features, Codicon.deviceDesktop, localize('onboarding.sessions.local', "Local Sessions"), localize('onboarding.sessions.local.desc', "Run agents locally with full access to your machine and tools."));
		this.stepDisposables.add(addDisposableListener(localCard, EventType.CLICK, () => {
			this._dismiss('complete');
			this.commandService.executeCommand('workbench.action.chat.open');
		}));

		const parallelCard = this._createFeatureCard(features, Codicon.gitBranch, localize('onboarding.sessions.worktree', "Worktree Sessions"), localize('onboarding.sessions.worktree.desc', "Branch off and work in parallel with isolated worktrees."));
		this.stepDisposables.add(addDisposableListener(parallelCard, EventType.CLICK, () => {
			this._dismiss('complete');
			this.commandService.executeCommand('workbench.action.chat.open');
		}));

		// Doc links
		const docs = append(wrapper, $('.onboarding-a-sessions-docs'));
		this._createDocLink(docs, localize('onboarding.sessions.learnMore', "Learn about agent sessions"), 'https://code.visualstudio.com/docs/copilot/agent-sessions');
		this._createDocLink(docs, localize('onboarding.sessions.github', "GitHub integration docs"), 'https://code.visualstudio.com/docs/copilot/github');
	}

	private _createFeatureCard(parent: HTMLElement, icon: ThemeIcon, title: string, description: string): HTMLElement {
		const card = this._registerStepFocusable(append(parent, $('button.onboarding-a-feature-card')));
		(card as HTMLButtonElement).type = 'button';
		card.appendChild(renderIcon(icon));
		const titleEl = append(card, $('div.onboarding-a-feature-title'));
		titleEl.textContent = title;
		const descEl = append(card, $('div.onboarding-a-feature-desc'));
		descEl.textContent = description;
		return card;
	}

	private _createDocLink(parent: HTMLElement, label: string, href: string): void {
		const link = this._registerStepFocusable(append(parent, $<HTMLAnchorElement>('a.onboarding-a-doc-link')));
		link.textContent = label;
		link.href = href;
		link.target = '_blank';
		link.rel = 'noopener';
		link.prepend(renderIcon(Codicon.linkExternal));
	}

	private _createInlineLink(parent: HTMLElement, label: string, href: string): HTMLAnchorElement {
		const link = this._registerStepFocusable(append(parent, $<HTMLAnchorElement>('a.onboarding-a-inline-link')));
		link.textContent = label;
		link.href = href;
		link.target = '_blank';
		link.rel = 'noopener';
		return link;
	}

	// =====================================================================
	// Focus trap
	// =====================================================================

	private _trapTab(e: KeyboardEvent, shiftKey: boolean): void {
		if (!this.overlay) {
			return;
		}

		const allFocusable = this._getFocusableElements();

		if (allFocusable.length === 0) {
			e.preventDefault();
			return;
		}

		const first = allFocusable[0];
		const last = allFocusable[allFocusable.length - 1];

		if (shiftKey && getActiveWindow().document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!shiftKey && getActiveWindow().document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	private _getFocusableElements(): HTMLElement[] {
		return [...this.stepFocusableElements, ...this.footerFocusableElements].filter(element => this._isTabbable(element));
	}

	private _focusCurrentStepElement(): void {
		const stepFocusable = this.stepFocusableElements.find(element => this._isTabbable(element));
		(stepFocusable ?? this.nextButton ?? this.skipButton)?.focus();
	}

	private _registerStepFocusable<T extends HTMLElement>(element: T): T {
		this.stepFocusableElements.push(element);
		return element;
	}

	private _isTabbable(element: HTMLElement): boolean {
		if (!element.isConnected || element.getAttribute('aria-hidden') === 'true' || element.tabIndex === -1 || element.hasAttribute('disabled')) {
			return false;
		}

		const computedStyle = getActiveWindow().getComputedStyle(element);
		return computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden';
	}

	// =====================================================================
	// Cleanup
	// =====================================================================

	private _removeFromDOM(): void {
		if (this.overlay) {
			this.overlay.remove();
			this.overlay = undefined;
		}

		this.card = undefined;
		this.bodyEl = undefined;
		this.progressContainer = undefined;
		this.stepLabelEl = undefined;
		this.titleEl = undefined;
		this.subtitleEl = undefined;
		this.contentEl = undefined;
		this.backButton = undefined;
		this.nextButton = undefined;
		this.skipButton = undefined;
		this.footerFocusableElements.length = 0;
		this.stepFocusableElements.length = 0;
		this._isShowing = false;
		this.disposables.clear();
		this.stepDisposables.clear();

		if (this.previouslyFocusedElement) {
			this.previouslyFocusedElement.focus();
			this.previouslyFocusedElement = undefined;
		}

		this.currentStepIndex = 0;
	}

	override dispose(): void {
		this._removeFromDOM();
		super.dispose();
	}
}
