/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { $, append, addDisposableListener, EventType, clearNode, getActiveWindow } from '../../../../base/browser/dom.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { isWindows, isMacintosh, isLinux } from '../../../../base/common/platform.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IGalleryExtension, IExtensionGalleryService, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import product from '../../../../platform/product/common/product.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import {
	OnboardingStepId,
	ONBOARDING_STEPS,
	ONBOARDING_THEME_OPTIONS,
	ONBOARDING_KEYMAP_OPTIONS,
	ONBOARDING_RECOMMENDED_EXTENSIONS,
	ONBOARDING_AI_PREFERENCE_OPTIONS,
	AiCollaborationMode,
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
	private selectedThemeId = 'dark-2026';
	private selectedKeymapId = 'vscode';
	private _detectedEditorIds: Set<string> | undefined;
	private _galleryExtensions: Map<string, IGalleryExtension> | undefined;
	private _userSignedIn = false;
	private selectedAiMode: AiCollaborationMode = AiCollaborationMode.Balanced;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ICommandService private readonly commandService: ICommandService,
		@IFileService private readonly fileService: IFileService,
		@IPathService private readonly pathService: IPathService,
	) {
		super();

		// Detect currently active theme
		const currentTheme = this.themeService.getColorTheme();
		const matchingTheme = ONBOARDING_THEME_OPTIONS.find(t => t.themeId === currentTheme.settingsId);
		if (matchingTheme) {
			this.selectedThemeId = matchingTheme.id;
		}

		// Start detecting installed editors early so results are ready by the Personalize step
		this._detectInstalledEditors().then(ids => { this._detectedEditorIds = ids; });

		// Pre-fetch gallery data so extension icons are ready by the Extensions step
		this._prefetchGalleryExtensions();
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

		let handled = false;
		const onTransitionEnd = () => {
			if (handled) {
				return;
			}
			handled = true;
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
			const leavingStep = this.steps[this.currentStepIndex];
			if (leavingStep === OnboardingStepId.Personalize) {
				this._applyKeymap(this.selectedKeymapId);
			}
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
		if (stepId === OnboardingStepId.AgentSessions) {
			this._renderAgentSessionsSubtitle(this.subtitleEl);
		} else if (stepId === OnboardingStepId.Personalize) {
			this._renderPersonalizeSubtitle(this.subtitleEl);
		} else {
			this.subtitleEl.textContent = getOnboardingStepSubtitle(stepId);
		}

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
			case OnboardingStepId.AiPreference:
				this._renderAiPreferenceStep(this.contentEl);
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
		brandIcon.setAttribute('role', 'img');
		brandIcon.setAttribute('aria-label', product.nameLong);

		const content = append(wrapper, $('.onboarding-a-signin-content'));
		const contentMain = append(content, $('.onboarding-a-signin-content-main'));
		const title = append(contentMain, $('h2.onboarding-a-signin-title'));
		title.textContent = localize('onboarding.signIn.heroTitle', "Welcome to VS Code");

		const subtitle = append(contentMain, $('p.onboarding-a-signin-subtitle'));
		subtitle.textContent = localize('onboarding.signIn.heroSubtitle', "Sign in to continue with AI-powered development in VS Code.");

		const actions = append(contentMain, $('.onboarding-a-signin-actions'));

		const githubBtn = this._registerStepFocusable(this._createSignInButton(actions, 'github', localize('onboarding.signIn.github', "Continue with GitHub"), {
			emphasized: true,
			label: localize('onboarding.signIn.github.aria', "Continue with GitHub")
		}));
		this.stepDisposables.add(addDisposableListener(githubBtn, EventType.CLICK, () => {
			this._handleSignIn();
		}));

		const googleBtn = this._registerStepFocusable(this._createSignInButton(actions, 'google', localize('onboarding.signIn.google', "Continue with Google"), {
			iconOnly: true,
			label: localize('onboarding.signIn.google', "Continue with Google")
		}));
		this.stepDisposables.add(addDisposableListener(googleBtn, EventType.CLICK, () => {
			this._handleSignIn('google');
		}));

		const appleBtn = this._registerStepFocusable(this._createSignInButton(actions, 'apple', localize('onboarding.signIn.apple', "Continue with Apple"), {
			iconOnly: true,
			label: localize('onboarding.signIn.apple', "Continue with Apple")
		}));
		this.stepDisposables.add(addDisposableListener(appleBtn, EventType.CLICK, () => {
			this._handleSignIn('apple');
		}));

		const gheBtn = this._registerStepFocusable(this._createSignInButton(actions, 'github-enterprise', localize('onboarding.signIn.ghe', "GHE.com"), {
			textOnly: true,
			label: localize('onboarding.signIn.ghe.aria', "Continue with GitHub Enterprise")
		}));
		this.stepDisposables.add(addDisposableListener(gheBtn, EventType.CLICK, () => {
			this._handleEnterpriseSignIn();
		}));

		const footer = append(content, $('.onboarding-a-signin-footer'));

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

	private _createSignInButton(parent: HTMLElement, providerClass: 'github' | 'github-enterprise' | 'google' | 'apple', label: string, options?: { emphasized?: boolean; iconOnly?: boolean; textOnly?: boolean; label?: string }): HTMLButtonElement {
		const isCompact = options?.iconOnly || options?.textOnly;
		const btn = append(parent, $<HTMLButtonElement>(isCompact ? 'button.onboarding-a-signin-icon-btn' : 'button.onboarding-a-signin-btn'));
		btn.type = 'button';
		btn.title = options?.label ?? label;
		btn.setAttribute('aria-label', options?.label ?? label);
		if (options?.emphasized) {
			btn.classList.add('primary');
		}

		if (!options?.textOnly) {
			const mark = append(btn, $('span.onboarding-a-provider-mark'));
			mark.classList.add(providerClass);
			mark.setAttribute('aria-hidden', 'true');
			if (providerClass === 'github' || providerClass === 'github-enterprise') {
				mark.appendChild(renderIcon(Codicon.github));
			}
		}

		if (!options?.iconOnly) {
			const labelEl = append(btn, $('span.onboarding-a-signin-btn-label'));
			labelEl.textContent = label;
		}

		return btn;
	}

	private async _handleSignIn(socialProvider?: string): Promise<void> {
		try {
			const account = await this.defaultAccountService.signIn({
				extraAuthorizeParameters: { get_started_with: 'copilot-vscode' },
				provider: socialProvider,
			});
			if (account) {
				this._userSignedIn = true;
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

			const account = await this.defaultAccountService.signIn({
				extraAuthorizeParameters: { get_started_with: 'copilot-vscode' },
			});
			if (account) {
				this._userSignedIn = true;
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

		// Keyboard Mapping section — only shown when another editor is detected
		const keymapOptions = this._detectedEditorIds
			? ONBOARDING_KEYMAP_OPTIONS.filter(k => this._detectedEditorIds!.has(k.id))
			: [];
		const hasOtherEditors = this._hasOtherEditors();

		if (hasOtherEditors) {
			const keymapSection = append(wrapper, $('div.onboarding-a-personalize-section.onboarding-a-personalize-section-keymap'));
			const keymapLabel = append(keymapSection, $('div.onboarding-a-section-label'));
			keymapLabel.textContent = localize('onboarding.personalize.keymap', "Keyboard Mapping");

			const keymapHint = append(keymapSection, $('div.onboarding-a-theme-hint'));
			keymapHint.textContent = localize('onboarding.personalize.keymapHint', "Coming from another editor? Import your keyboard mapping to feel right at home.");

			const keymapList = append(keymapSection, $('.onboarding-a-keymap-list'));
			keymapList.setAttribute('role', 'radiogroup');
			keymapList.setAttribute('aria-label', localize('onboarding.personalize.keymapLabel', "Choose a keyboard mapping"));

			const keymapPills: HTMLButtonElement[] = [];
			for (const keymap of keymapOptions) {
				const pill = this._registerStepFocusable(append(keymapList, $<HTMLButtonElement>('button.onboarding-a-keymap-pill')));
				pill.type = 'button';
				pill.setAttribute('role', 'radio');
				pill.setAttribute('aria-checked', keymap.id === this.selectedKeymapId ? 'true' : 'false');
				pill.title = keymap.description;
				keymapPills.push(pill);

				const labelSpan = append(pill, $('span'));
				labelSpan.textContent = keymap.label;

				if (keymap.id === this.selectedKeymapId) {
					pill.classList.add('selected');
				}

				this.stepDisposables.add(addDisposableListener(pill, EventType.CLICK, () => {
					this.selectedKeymapId = keymap.id;

					for (const p of keymapPills) {
						p.classList.remove('selected');
						p.setAttribute('aria-checked', 'false');
					}
					pill.classList.add('selected');
					pill.setAttribute('aria-checked', 'true');
				}));
			}
		}

	}

	private _renderPersonalizeSubtitle(container: HTMLElement): void {
		clearNode(container);
		const modifier = isMacintosh ? 'Cmd' : 'Ctrl';
		container.append(
			localize('onboarding.personalize.tip.prefix', "Tip: Press "),
			this._createKbd(localize({ key: 'onboarding.personalize.tip.modifier', comment: ['This is a keyboard modifier key, Ctrl on Windows/Linux or Cmd on Mac'] }, "{0}", modifier)),
			'+',
			this._createKbd(localize('onboarding.personalize.tip.shift', "Shift")),
			'+',
			this._createKbd(localize('onboarding.personalize.tip.p', "P")),
			localize('onboarding.personalize.tip.suffix', " to access all VS Code commands."),
		);
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

	// =====================================================================
	// Step: Extensions
	// =====================================================================

	private _renderExtensionsStep(container: HTMLElement): void {
		const wrapper = append(container, $('div.onboarding-a-extensions'));

		const extList = append(wrapper, $('div.onboarding-a-ext-list'));

		// Build a map of icon elements so we can update them once gallery data arrives
		const iconElements = new Map<string, HTMLElement>();

		for (const ext of ONBOARDING_RECOMMENDED_EXTENSIONS) {
			const row = append(extList, $('div.onboarding-a-ext-row'));

			const iconEl = append(row, $('div.onboarding-a-ext-icon'));
			// Start with a codicon placeholder
			iconEl.appendChild(renderIcon(this._getExtIcon(ext.icon)));
			iconElements.set(ext.id.toLowerCase(), iconEl);

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
				installBtn.textContent = localize('onboarding.ext.installing', "Installing...");
				installBtn.disabled = true;
				this._installExtension(ext.id).then(
					() => {
						installBtn.textContent = localize('onboarding.ext.installed', "Installed");
						installBtn.classList.add('installed');
					},
					() => {
						installBtn.textContent = localize('onboarding.ext.install', "Install");
						installBtn.disabled = false;
					}
				);
			}));
		}

		// Apply gallery icons — if prefetch finished, icons render immediately; otherwise they swap in once ready
		this._applyExtensionIcons(iconElements);
	}

	private async _prefetchGalleryExtensions(): Promise<void> {
		try {
			const ids = ONBOARDING_RECOMMENDED_EXTENSIONS.map(ext => ({ id: ext.id }));
			const extensions = await this.extensionGalleryService.getExtensions(ids, CancellationToken.None);
			const map = new Map<string, IGalleryExtension>();
			for (const ext of extensions) {
				map.set(ext.identifier.id.toLowerCase(), ext);
			}
			this._galleryExtensions = map;
		} catch {
			// Gallery unavailable — icons will stay as codicon placeholders
		}
	}

	private async _applyExtensionIcons(iconElements: Map<string, HTMLElement>): Promise<void> {
		// Wait for prefetch if it hasn't completed yet
		if (!this._galleryExtensions) {
			await this._prefetchGalleryExtensions();
		}
		if (!this._galleryExtensions) {
			return;
		}
		for (const [id, galleryExt] of this._galleryExtensions) {
			const iconAsset = galleryExt.assets.icon;
			if (!iconAsset) {
				continue;
			}
			const iconEl = iconElements.get(id);
			if (!iconEl) {
				continue;
			}
			const img = $<HTMLImageElement>('img.onboarding-a-ext-icon-img');
			img.alt = '';
			img.src = iconAsset.uri;
			this.stepDisposables.add(addDisposableListener(img, EventType.ERROR, () => {
				if (iconAsset.fallbackUri) {
					img.src = iconAsset.fallbackUri;
				}
			}, { once: true }));
			this.stepDisposables.add(addDisposableListener(img, EventType.LOAD, () => {
				clearNode(iconEl);
				iconEl.appendChild(img);
			}, { once: true }));
		}
	}

	private _getExtIcon(iconName: string): ThemeIcon {
		switch (iconName) {
			case 'wand': return Codicon.wand;
			case 'lightbulb': return Codicon.lightbulb;
			case 'symbol-misc': return Codicon.symbolMisc;
			case 'git-pull-request': return Codicon.gitPullRequest;
			default: return Codicon.extensions;
		}
	}

	private async _selectTheme(theme: IOnboardingThemeOption): Promise<void> {
		this.selectedThemeId = theme.id;
		const allThemes = await this.themeService.getColorThemes();
		const match = allThemes.find(t => t.settingsId === theme.themeId);
		if (match) {
			this.themeService.setColorTheme(match.id, ConfigurationTarget.USER);
		}
	}

	private async _installExtension(extensionId: string): Promise<void> {
		try {
			const gallery = await this.extensionGalleryService.getExtensions([{ id: extensionId }], CancellationToken.None);
			if (gallery.length > 0) {
				await this.extensionManagementService.installFromGallery(gallery[0], { context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true } });
			}
		} catch (err) {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('onboarding.ext.installError', "Could not install extension. You can install it later from the Extensions view."),
			});
			throw err;
		}
	}

	private async _applyKeymap(keymapId: string): Promise<void> {
		const keymap = ONBOARDING_KEYMAP_OPTIONS.find(k => k.id === keymapId);
		if (!keymap?.extensionId) {
			return; // VS Code default, nothing to install
		}

		try {
			const gallery = await this.extensionGalleryService.getExtensions([{ id: keymap.extensionId }], CancellationToken.None);
			if (gallery.length > 0) {
				await this.extensionManagementService.installFromGallery(gallery[0], { context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true } });
			}
		} catch {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('onboarding.keymap.installError', "Could not install {0} keymap. You can install it later from Extensions.", keymap.label),
			});
		}
	}

	private _hasOtherEditors(): boolean {
		const keymapOptions = this._detectedEditorIds
			? ONBOARDING_KEYMAP_OPTIONS.filter(k => this._detectedEditorIds!.has(k.id))
			: [];
		return keymapOptions.some(k => k.id !== 'vscode');
	}

	/**
	 * Checks common install paths for known editors and returns the set of
	 * keymap option IDs whose editors are found on this machine.
	 * Always includes 'vscode' (the default). In web environments or on
	 * unknown platforms, returns only 'vscode'.
	 */
	private async _detectInstalledEditors(): Promise<Set<string>> {
		const detected = new Set<string>(['vscode']);
		const home = this.pathService.userHome({ preferLocal: true });

		interface EditorCheck { id: string; paths: URI[] }
		const checks: EditorCheck[] = [];

		if (isWindows) {
			const localAppData = URI.joinPath(home, 'AppData', 'Local');
			checks.push(
				{ id: 'cursor', paths: [URI.joinPath(localAppData, 'Programs', 'cursor', 'Cursor.exe')] },
				{ id: 'windsurf', paths: [URI.joinPath(localAppData, 'Programs', 'windsurf', 'Windsurf.exe')] },
				{ id: 'sublime', paths: [URI.file('C:\\Program Files\\Sublime Text\\sublime_text.exe'), URI.file('C:\\Program Files\\Sublime Text 3\\sublime_text.exe')] },
				{ id: 'intellij', paths: [URI.joinPath(localAppData, 'JetBrains', 'Toolbox')] },
				{ id: 'vim', paths: [URI.joinPath(home, '_vimrc'), URI.joinPath(localAppData, 'nvim', 'init.vim'), URI.joinPath(localAppData, 'nvim', 'init.lua')] },
			);
		} else if (isMacintosh) {
			checks.push(
				{ id: 'cursor', paths: [URI.file('/Applications/Cursor.app')] },
				{ id: 'windsurf', paths: [URI.file('/Applications/Windsurf.app')] },
				{ id: 'sublime', paths: [URI.file('/Applications/Sublime Text.app')] },
				{ id: 'intellij', paths: [URI.file('/Applications/IntelliJ IDEA.app'), URI.file('/Applications/IntelliJ IDEA CE.app')] },
				{ id: 'vim', paths: [URI.joinPath(home, '.vimrc'), URI.joinPath(home, '.config', 'nvim', 'init.vim'), URI.joinPath(home, '.config', 'nvim', 'init.lua')] },
			);
		} else if (isLinux) {
			checks.push(
				{ id: 'cursor', paths: [URI.file('/usr/bin/cursor'), URI.file('/usr/local/bin/cursor')] },
				{ id: 'windsurf', paths: [URI.file('/usr/bin/windsurf'), URI.file('/usr/local/bin/windsurf')] },
				{ id: 'sublime', paths: [URI.file('/usr/bin/subl'), URI.file('/opt/sublime_text/sublime_text')] },
				{ id: 'intellij', paths: [URI.joinPath(home, '.local', 'share', 'JetBrains', 'Toolbox'), URI.file('/opt/idea')] },
				{ id: 'vim', paths: [URI.joinPath(home, '.vimrc'), URI.joinPath(home, '.config', 'nvim', 'init.vim'), URI.joinPath(home, '.config', 'nvim', 'init.lua')] },
			);
		}

		await Promise.all(checks.map(async check => {
			for (const path of check.paths) {
				try {
					if (await this.fileService.exists(path)) {
						detected.add(check.id);
						return;
					}
				} catch {
					// Path not accessible — skip
				}
			}
		}));

		return detected;
	}

	// =====================================================================
	// Step: AI Preference
	// =====================================================================

	private _renderAiPreferenceStep(container: HTMLElement): void {
		const wrapper = append(container, $('.onboarding-a-ai-pref'));

		const cards = append(wrapper, $('.onboarding-a-ai-pref-cards'));

		const allCards: HTMLButtonElement[] = [];
		for (const option of ONBOARDING_AI_PREFERENCE_OPTIONS) {
			const card = this._registerStepFocusable(append(cards, $<HTMLButtonElement>('button.onboarding-a-ai-pref-card')));
			card.type = 'button';
			card.dataset.id = option.id;
			allCards.push(card);

			if (option.id === this.selectedAiMode) {
				card.classList.add('selected');
			}

			const iconEl = append(card, $('span.onboarding-a-ai-pref-card-icon'));
			iconEl.setAttribute('aria-hidden', 'true');
			const icon = Codicon[option.icon as keyof typeof Codicon] ?? Codicon.sparkle;
			iconEl.appendChild(renderIcon(icon));

			const titleEl = append(card, $('div.onboarding-a-ai-pref-card-title'));
			titleEl.textContent = option.label;

			const descEl = append(card, $('div.onboarding-a-ai-pref-card-desc'));
			descEl.textContent = option.description;

			this.stepDisposables.add(addDisposableListener(card, EventType.CLICK, () => {
				this.selectedAiMode = option.id;
				for (const c of allCards) {
					c.classList.toggle('selected', c.dataset.id === option.id);
				}
				this._applyAiPreference(option.id);
			}));
		}

		const hint = append(wrapper, $('div.onboarding-a-ai-pref-hint'));
		hint.textContent = localize('onboarding.aiPref.hint', "You can change this anytime in Settings.");
	}

	private _applyAiPreference(mode: AiCollaborationMode): void {
		switch (mode) {
			case AiCollaborationMode.CodeFirst:
				this.configurationService.updateValue('chat.agent.autoFix', false, ConfigurationTarget.USER);
				break;
			case AiCollaborationMode.Balanced:
				this.configurationService.updateValue('chat.agent.autoFix', true, ConfigurationTarget.USER);
				break;
			case AiCollaborationMode.AgentForward:
				this.configurationService.updateValue('chat.agent.autoFix', true, ConfigurationTarget.USER);
				break;
		}
	}

	// =====================================================================
	// Step: Agent Sessions
	// =====================================================================

	private _renderAgentSessionsSubtitle(el: HTMLElement): void {
		clearNode(el);
		const keys = isMacintosh
			? ['\u2318', '\u2325', 'I']  // ⌘, ⌥, I
			: ['Ctrl', 'Alt', 'I'];
		const shortcut = keys.map(k => this._createKbd(k));
		el.append(
			localize('onboarding.step.agentSessions.subtitle.before', "Tip: Press "),
		);
		for (let i = 0; i < shortcut.length; i++) {
			if (i > 0) {
				el.append(' + ');
			}
			el.append(shortcut[i]);
		}
		el.append(
			localize('onboarding.step.agentSessions.subtitle.after', " to open Chat"),
		);
	}

	private _renderAgentSessionsStep(container: HTMLElement): void {
		const wrapper = append(container, $('.onboarding-a-sessions'));

		const features = append(wrapper, $('.onboarding-a-sessions-features'));

		// Left column: Local + Cloud — Right column: Copilot CLI + Inline
		const { card: localCard } = this._createFeatureCard(features, Codicon.deviceDesktop, localize('onboarding.sessions.local', "Local Sessions"), localize('onboarding.sessions.local.desc', "Run agents locally with full access to your machine and tools."));
		this.stepDisposables.add(addDisposableListener(localCard, EventType.CLICK, () => {
			this._dismiss('complete');
			this.commandService.executeCommand('workbench.action.chat.openNewChatSessionInPlace.local', 'sidebar');
		}));

		const { card: parallelCard } = this._createFeatureCard(features, Codicon.worktree, localize('onboarding.sessions.worktree', "Copilot CLI"), localize('onboarding.sessions.worktree.desc', "Branch off and work in parallel with isolated worktrees."));
		this.stepDisposables.add(addDisposableListener(parallelCard, EventType.CLICK, () => {
			this._dismiss('complete');
			this.commandService.executeCommand('workbench.action.chat.openNewChatSessionInPlace.copilotcli', 'sidebar');
		}));

		const { card: cloudCard } = this._createFeatureCard(features, Codicon.cloud, localize('onboarding.sessions.cloud', "Cloud Sessions"), localize('onboarding.sessions.cloud.desc', "Run agents in the cloud. Code keeps running even when you close the window."));
		this.stepDisposables.add(addDisposableListener(cloudCard, EventType.CLICK, () => {
			this._dismiss('complete');
			this.commandService.executeCommand('workbench.action.chat.openNewChatSessionInPlace.copilot-cloud-agent', 'sidebar');
		}));

		const { card: inlineCard, descEl: inlineDesc } = this._createFeatureCard(features, Codicon.keyboardTab, localize('onboarding.sessions.inline', "Inline Suggestions"));
		inlineDesc.append(
			localize('onboarding.sessions.inline.desc1', "As you type, AI suggests code inline. Press "),
			this._createKbd(localize('onboarding.sessions.inline.tab', "Tab")),
			localize('onboarding.sessions.inline.desc2', " to accept or "),
			this._createKbd(localize('onboarding.sessions.inline.esc', "Esc")),
			localize('onboarding.sessions.inline.desc3', " to dismiss."),
		);
		this.stepDisposables.add(addDisposableListener(inlineCard, EventType.CLICK, () => {
			this._dismiss('complete');
			this.commandService.executeCommand('workbench.action.chat.open');
		}));

		// Doc links + optional sign-in nudge on the same row
		const docs = append(wrapper, $('.onboarding-a-sessions-docs'));
		this._createDocLink(docs, localize('onboarding.sessions.videoTutorials', "Watch video tutorials"), 'https://aka.ms/vscode-getting-started-video');

		// Conditional sign-in nudge if user skipped sign-in on step 1
		if (!this._userSignedIn) {
			this._renderSignInNudge(docs);
		}
	}

	private _renderSignInNudge(parent: HTMLElement): void {
		const nudge = append(parent, $('.onboarding-a-signin-nudge'));

		const btn = this._registerStepFocusable(append(nudge, $<HTMLButtonElement>('button.onboarding-a-signin-nudge-btn')));
		btn.type = 'button';
		btn.textContent = localize('onboarding.sessions.signInNudge', "Sign in for AI Powered Features");
		this.stepDisposables.add(addDisposableListener(btn, EventType.CLICK, async () => {
			await this._handleSignIn();
			if (this._userSignedIn) {
				// Remove nudge after successful sign-in and re-render
				nudge.remove();
			}
		}));
	}

	private _createFeatureCard(parent: HTMLElement, icon: ThemeIcon, title: string, description?: string): { card: HTMLElement; descEl: HTMLElement } {
		const card = this._registerStepFocusable(append(parent, $('button.onboarding-a-feature-card')));
		(card as HTMLButtonElement).type = 'button';
		card.appendChild(renderIcon(icon));
		const titleEl = append(card, $('div.onboarding-a-feature-title'));
		titleEl.textContent = title;
		const descEl = append(card, $('div.onboarding-a-feature-desc'));
		if (description) {
			descEl.textContent = description;
		}
		return { card, descEl };
	}

	private _createKbd(label: string): HTMLElement {
		const kbd = $('kbd.onboarding-a-kbd');
		kbd.textContent = label;
		return kbd;
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
