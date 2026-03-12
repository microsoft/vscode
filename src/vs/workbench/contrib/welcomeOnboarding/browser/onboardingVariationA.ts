/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { $, append, addDisposableListener, EventType, clearNode, getActiveWindow } from '../../../../base/browser/dom.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IExtensionGalleryService, IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
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

/**
 * Variation A — Classic Wizard Modal
 *
 * A centered modal overlay with progress dots, clean step transitions,
 * and polished navigation. Sits on top of the agent sessions welcome
 * tab. When dismissed, the welcome tab is revealed underneath.
 *
 * Steps:
 * 1. Sign In — GitHub/Microsoft sign-in buttons with skip option
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

	private readonly focusableElements: HTMLElement[] = [];
	private selectedThemeId = 'dark-modern';
	private selectedKeymapId = 'vscode';

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@INotificationService private readonly notificationService: INotificationService,
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
		this.focusableElements.push(this.skipButton);

		const footerRight = append(footer, $('.onboarding-a-footer-right'));

		this.backButton = append(footerRight, $<HTMLButtonElement>('button.onboarding-a-btn.onboarding-a-btn-secondary'));
		this.backButton.textContent = localize('onboarding.back', "Back");
		this.backButton.type = 'button';
		this.focusableElements.push(this.backButton);

		this.nextButton = append(footerRight, $<HTMLButtonElement>('button.onboarding-a-btn.onboarding-a-btn-primary'));
		this.nextButton.type = 'button';
		this.focusableElements.push(this.nextButton);
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

		this.nextButton.focus();
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
		}
	}

	private _prevStep(): void {
		if (this.currentStepIndex > 0) {
			this.currentStepIndex--;
			this._renderStep();
			this._renderProgress();
			this._updateButtonStates();
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

		const stepId = this.steps[this.currentStepIndex];
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

		// Primary CTA: Continue with GitHub
		const githubBtn = this._createSignInButton(wrapper, Codicon.github, localize('onboarding.signIn.github', "Continue with GitHub"));
		githubBtn.classList.add('primary');
		this.stepDisposables.add(addDisposableListener(githubBtn, EventType.CLICK, () => {
			this._handleSignIn('github', ['user:email']);
		}));

		// Divider
		const divider = append(wrapper, $('span.onboarding-a-signin-divider'));
		divider.textContent = localize('onboarding.signIn.orWith', "or continue with");

		// Secondary icon buttons row
		const iconRow = append(wrapper, $('.onboarding-a-signin-icon-row'));

		// Google
		const googleBtn = append(iconRow, $<HTMLButtonElement>('button.onboarding-a-signin-icon-btn'));
		googleBtn.type = 'button';
		googleBtn.title = localize('onboarding.signIn.google', "Google");
		googleBtn.appendChild(renderIcon(Codicon.globe));
		this.stepDisposables.add(addDisposableListener(googleBtn, EventType.CLICK, () => {
			this._handleSignIn('github', ['user:email']); // placeholder
		}));

		// Microsoft
		const msBtn = append(iconRow, $<HTMLButtonElement>('button.onboarding-a-signin-icon-btn'));
		msBtn.type = 'button';
		msBtn.title = localize('onboarding.signIn.microsoft', "Microsoft");
		msBtn.appendChild(renderIcon(Codicon.account));
		this.stepDisposables.add(addDisposableListener(msBtn, EventType.CLICK, () => {
			this._handleSignIn('microsoft', ['openid', 'profile', 'email']);
		}));

		// Apple
		const appleBtn = append(iconRow, $<HTMLButtonElement>('button.onboarding-a-signin-icon-btn'));
		appleBtn.type = 'button';
		appleBtn.title = localize('onboarding.signIn.apple', "Apple");
		appleBtn.appendChild(renderIcon(Codicon.heart));
		this.stepDisposables.add(addDisposableListener(appleBtn, EventType.CLICK, () => {
			this._handleSignIn('github', ['user:email']); // placeholder
		}));

		// Note about anonymous access
		const note = append(wrapper, $('p.onboarding-a-signin-note'));
		note.textContent = localize(
			'onboarding.signIn.anonNote',
			"You can try Copilot features without signing in. Sign in to sync settings, access GitHub, and unlock the full experience."
		);
	}

	private _createSignInButton(parent: HTMLElement, icon: ThemeIcon, label: string): HTMLButtonElement {
		const btn = append(parent, $<HTMLButtonElement>('button.onboarding-a-signin-btn'));
		btn.type = 'button';
		btn.appendChild(renderIcon(icon));
		const labelEl = append(btn, $('span'));
		labelEl.textContent = label;
		return btn;
	}

	private async _handleSignIn(providerId: string, scopes: string[]): Promise<void> {
		try {
			const session = await this.authenticationService.createSession(providerId, scopes);
			if (session) {
				this._renderStep(); // Re-render to show success
			}
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('onboarding.signIn.error', "Sign-in failed. You can try again later from the Accounts menu."),
			});
		}
	}

	// =====================================================================
	// Step: Personalize (Theme + Keymap)
	// =====================================================================

	private _renderPersonalizeStep(container: HTMLElement): void {
		const wrapper = append(container, $('.onboarding-a-personalize'));

		// Theme section
		const themeSection = append(wrapper, $('div'));
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
		const keymapSection = append(wrapper, $('div'));
		const keymapLabel = append(keymapSection, $('div.onboarding-a-section-label'));
		keymapLabel.textContent = localize('onboarding.personalize.keymap', "Keyboard Mapping");

		const keymapList = append(keymapSection, $('.onboarding-a-keymap-list'));
		keymapList.setAttribute('role', 'radiogroup');
		keymapList.setAttribute('aria-label', localize('onboarding.personalize.keymapLabel', "Choose a keyboard mapping"));

		const keymapPills: HTMLButtonElement[] = [];
		for (const keymap of ONBOARDING_KEYMAP_OPTIONS) {
			const pill = append(keymapList, $<HTMLButtonElement>('button.onboarding-a-keymap-pill'));
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
		const card = append(parent, $('div.onboarding-a-theme-card'));
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

		// Sidebar (narrow strip)
		const sidebar = append(skeleton, $('div.onboarding-a-skeleton-sidebar'));
		sidebar.style.backgroundColor = theme.preview.selection;
		for (let i = 0; i < 4; i++) {
			const icon = append(sidebar, $('div.onboarding-a-skeleton-sidebar-icon'));
			icon.style.backgroundColor = theme.preview.lineNumber;
		}

		// Main area
		const main = append(skeleton, $('div.onboarding-a-skeleton-main'));

		// Tab bar
		const tabBar = append(main, $('div.onboarding-a-skeleton-tabs'));
		tabBar.style.borderBottom = `1px solid ${theme.preview.selection}`;
		const activeTab = append(tabBar, $('div.onboarding-a-skeleton-tab'));
		activeTab.style.borderBottom = `2px solid ${theme.preview.keyword}`;
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
			case 'code': return Codicon.code;
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

			const installBtn = append(row, $<HTMLButtonElement>('button.onboarding-a-ext-install'));
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

		// Feature cards
		this._createFeatureCard(features, Codicon.cloud, localize('onboarding.sessions.cloud', "Cloud Sessions"), localize('onboarding.sessions.cloud.desc', "Run agents in the cloud. Code keeps running even when you close the window."));
		this._createFeatureCard(features, Codicon.deviceDesktop, localize('onboarding.sessions.local', "Local Sessions"), localize('onboarding.sessions.local.desc', "Run agents locally with full access to your machine and tools."));
		this._createFeatureCard(features, Codicon.layers, localize('onboarding.sessions.parallel', "Parallel Sessions"), localize('onboarding.sessions.parallel.desc', "Run multiple sessions simultaneously. Review results when you are ready."));

		// Doc links
		const docs = append(wrapper, $('.onboarding-a-sessions-docs'));
		this._createDocLink(docs, localize('onboarding.sessions.learnMore', "Learn about agent sessions"), 'https://code.visualstudio.com/docs/copilot/agent-sessions');
		this._createDocLink(docs, localize('onboarding.sessions.github', "GitHub integration docs"), 'https://code.visualstudio.com/docs/copilot/github');
	}

	private _createFeatureCard(parent: HTMLElement, icon: ThemeIcon, title: string, description: string): void {
		const card = append(parent, $('.onboarding-a-feature-card'));
		card.appendChild(renderIcon(icon));
		const titleEl = append(card, $('div.onboarding-a-feature-title'));
		titleEl.textContent = title;
		const descEl = append(card, $('div.onboarding-a-feature-desc'));
		descEl.textContent = description;
	}

	private _createDocLink(parent: HTMLElement, label: string, href: string): void {
		const link = append(parent, $<HTMLAnchorElement>('a.onboarding-a-doc-link'));
		link.textContent = label;
		link.href = href;
		link.target = '_blank';
		link.rel = 'noopener';
		link.prepend(renderIcon(Codicon.linkExternal));
	}

	// =====================================================================
	// Focus trap
	// =====================================================================

	private _trapTab(e: KeyboardEvent, shiftKey: boolean): void {
		if (!this.overlay) {
			return;
		}

		const allFocusable = this.focusableElements;

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
		this.focusableElements.length = 0;
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
