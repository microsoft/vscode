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
 * Variation B — Side-Nav Modal
 *
 * A modal with a persistent step list on the left sidebar,
 * and content area on the right. Steps can be clicked to navigate.
 * The sidebar shows completion state with numbered circles.
 */
export class OnboardingVariationB extends Disposable {

	private readonly _onDidComplete = this._register(new Emitter<void>());
	readonly onDidComplete: Event<void> = this._onDidComplete.event;

	private readonly _onDidDismiss = this._register(new Emitter<void>());
	readonly onDidDismiss: Event<void> = this._onDidDismiss.event;

	private overlay: HTMLElement | undefined;
	private card: HTMLElement | undefined;
	private stepListContainer: HTMLElement | undefined;
	private contentArea: HTMLElement | undefined;
	private titleEl: HTMLElement | undefined;
	private subtitleEl: HTMLElement | undefined;
	private bodyEl: HTMLElement | undefined;
	private footerEl: HTMLElement | undefined;

	private currentStepIndex = 0;
	private readonly steps = ONBOARDING_STEPS;
	private readonly completedSteps = new Set<OnboardingStepId>();
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
		this.overlay = append(container, $('.onboarding-b-overlay'));
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', localize('onboarding.b.aria', "Welcome to Visual Studio Code"));

		// Card (horizontal layout)
		this.card = append(this.overlay, $('.onboarding-b-card'));

		// Left sidebar
		const sidebar = append(this.card, $('.onboarding-b-sidebar'));

		const sidebarHeader = append(sidebar, $('.onboarding-b-sidebar-header'));
		const sidebarTitle = append(sidebarHeader, $('div.onboarding-b-sidebar-title'));
		sidebarTitle.textContent = localize('onboarding.b.title', "Get Started");
		const sidebarSubtitle = append(sidebarHeader, $('div.onboarding-b-sidebar-subtitle'));
		sidebarSubtitle.textContent = localize('onboarding.b.subtitle', "Set up your environment");

		this.stepListContainer = append(sidebar, $('nav.onboarding-b-step-list'));
		this.stepListContainer.setAttribute('role', 'tablist');
		this.stepListContainer.setAttribute('aria-orientation', 'vertical');
		this._renderStepList();

		const sidebarFooter = append(sidebar, $('.onboarding-b-sidebar-footer'));
		const skipLink = append(sidebarFooter, $<HTMLButtonElement>('button.onboarding-b-skip-link'));
		skipLink.textContent = localize('onboarding.b.skipAll', "Skip setup");
		this.disposables.add(addDisposableListener(skipLink, EventType.CLICK, () => this._dismiss('skip')));

		// Right content
		this.contentArea = append(this.card, $('.onboarding-b-content'));
		this.titleEl = append(this.contentArea, $('h2.onboarding-b-step-title'));
		this.subtitleEl = append(this.contentArea, $('p.onboarding-b-step-subtitle'));
		this.bodyEl = append(this.contentArea, $('div.onboarding-b-step-body'));
		this.footerEl = append(this.contentArea, $('div.onboarding-b-footer'));

		this._renderStep();
		this._renderFooter();

		// Backdrop click
		this.disposables.add(addDisposableListener(this.overlay, EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (e.target === this.overlay) {
				this._dismiss('skip');
			}
		}));

		// Keyboard
		this.disposables.add(addDisposableListener(this.overlay, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Escape) {
				e.preventDefault();
				e.stopPropagation();
				this._dismiss('skip');
			}
			if (event.keyCode === KeyCode.Tab) {
				this._trapTab(e, event.shiftKey);
			}
		}));

		// Entrance
		this.overlay.classList.add('entering');
		getActiveWindow().requestAnimationFrame(() => {
			this.overlay?.classList.remove('entering');
			this.overlay?.classList.add('visible');
		});
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

	private _goToStep(index: number): void {
		if (index < 0 || index >= this.steps.length) {
			return;
		}
		this.currentStepIndex = index;
		this._renderStepList();
		this._renderStep();
		this._renderFooter();
	}

	private _renderStepList(): void {
		if (!this.stepListContainer) {
			return;
		}

		clearNode(this.stepListContainer);

		for (let i = 0; i < this.steps.length; i++) {
			const stepId = this.steps[i];
			const item = append(this.stepListContainer, $<HTMLButtonElement>('button.onboarding-b-step-item'));
			item.type = 'button';
			item.setAttribute('role', 'tab');
			item.setAttribute('aria-selected', i === this.currentStepIndex ? 'true' : 'false');

			if (i === this.currentStepIndex) {
				item.classList.add('active');
			}
			if (this.completedSteps.has(stepId)) {
				item.classList.add('completed');
			}

			const number = append(item, $('span.onboarding-b-step-number'));
			if (!this.completedSteps.has(stepId)) {
				number.textContent = `${i + 1}`;
			}

			const label = append(item, $('span'));
			label.textContent = getOnboardingStepTitle(stepId);

			this.disposables.add(addDisposableListener(item, EventType.CLICK, () => {
				this._goToStep(i);
			}));
		}
	}

	private _renderStep(): void {
		if (!this.titleEl || !this.subtitleEl || !this.bodyEl) {
			return;
		}

		this.stepDisposables.clear();

		const stepId = this.steps[this.currentStepIndex];
		this.titleEl.textContent = getOnboardingStepTitle(stepId);
		this.subtitleEl.textContent = getOnboardingStepSubtitle(stepId);

		clearNode(this.bodyEl);

		switch (stepId) {
			case OnboardingStepId.SignIn:
				this._renderSignInStep(this.bodyEl);
				break;
			case OnboardingStepId.Personalize:
				this._renderPersonalizeStep(this.bodyEl);
				break;
			case OnboardingStepId.Extensions:
				this._renderExtensionsStep(this.bodyEl);
				break;
			case OnboardingStepId.AgentSessions:
				this._renderAgentSessionsStep(this.bodyEl);
				break;
		}
	}

	private _renderFooter(): void {
		if (!this.footerEl) {
			return;
		}

		clearNode(this.footerEl);

		const isLast = this.currentStepIndex === this.steps.length - 1;

		const nextBtn = append(this.footerEl, $<HTMLButtonElement>('button.onboarding-b-btn.onboarding-b-btn-primary'));
		nextBtn.type = 'button';
		nextBtn.textContent = isLast
			? localize('onboarding.b.finish', "Get Started")
			: localize('onboarding.b.continue', "Continue");

		this.stepDisposables.add(addDisposableListener(nextBtn, EventType.CLICK, () => {
			// Mark current step as completed
			this.completedSteps.add(this.steps[this.currentStepIndex]);

			if (isLast) {
				this._dismiss('complete');
			} else {
				this._goToStep(this.currentStepIndex + 1);
			}
		}));
	}

	// =====================================================================
	// Step: Sign In
	// =====================================================================

	private _renderSignInStep(container: HTMLElement): void {
		const wrapper = append(container, $('div.onboarding-b-signin'));

		const githubBtn = this._createSignInButton(wrapper, Codicon.github, localize('onboarding.b.signin.github', "Continue with GitHub"));
		this.stepDisposables.add(addDisposableListener(githubBtn, EventType.CLICK, () => this._handleSignIn('github', ['user:email'])));

		const msBtn = this._createSignInButton(wrapper, Codicon.account, localize('onboarding.b.signin.microsoft', "Continue with Microsoft"));
		this.stepDisposables.add(addDisposableListener(msBtn, EventType.CLICK, () => this._handleSignIn('microsoft', ['openid', 'profile', 'email'])));

		const note = append(wrapper, $('p.onboarding-b-signin-note'));
		note.textContent = localize(
			'onboarding.b.signin.note',
			"Copilot is available to try without signing in. Sign in to sync settings and access the full GitHub integration."
		);
	}

	private _createSignInButton(parent: HTMLElement, icon: ThemeIcon, label: string): HTMLButtonElement {
		const btn = append(parent, $<HTMLButtonElement>('button.onboarding-b-signin-btn'));
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
				this.completedSteps.add(OnboardingStepId.SignIn);
				this._renderStepList();
			}
		} catch {
			this.notificationService.notify({
				severity: Severity.Error,
				message: localize('onboarding.b.signin.error', "Sign-in failed. You can try again from the Accounts menu."),
			});
		}
	}

	// =====================================================================
	// Step: Personalize
	// =====================================================================

	private _renderPersonalizeStep(container: HTMLElement): void {
		const wrapper = append(container, $('div.onboarding-b-personalize'));

		// Themes
		const themeSection = append(wrapper, $('div'));
		const themeLabel = append(themeSection, $('div.onboarding-b-section-label'));
		themeLabel.textContent = localize('onboarding.b.theme', "Color Theme");

		const themeGrid = append(themeSection, $('div.onboarding-b-theme-grid'));
		themeGrid.setAttribute('role', 'radiogroup');

		const themeCards: HTMLElement[] = [];
		for (const theme of ONBOARDING_THEME_OPTIONS) {
			this._createThemeCard(themeGrid, theme, themeCards);
		}

		// Keymaps
		const keymapSection = append(wrapper, $('div'));
		const keymapLabel = append(keymapSection, $('div.onboarding-b-section-label'));
		keymapLabel.textContent = localize('onboarding.b.keymap', "Keyboard Shortcuts");

		const keymapList = append(keymapSection, $('div.onboarding-b-keymap-list'));

		const keymapPills: HTMLButtonElement[] = [];
		for (const keymap of ONBOARDING_KEYMAP_OPTIONS) {
			const pill = append(keymapList, $<HTMLButtonElement>('button.onboarding-b-keymap-pill'));
			pill.type = 'button';
			pill.textContent = keymap.label;
			pill.title = keymap.description;
			keymapPills.push(pill);

			if (keymap.id === this.selectedKeymapId) {
				pill.classList.add('selected');
			}

			this.stepDisposables.add(addDisposableListener(pill, EventType.CLICK, () => {
				this.selectedKeymapId = keymap.id;
				this._applyKeymap(keymap.id);
				for (const p of keymapPills) {
					p.classList.remove('selected');
				}
				pill.classList.add('selected');
			}));
		}
	}

	private _createThemeCard(parent: HTMLElement, theme: IOnboardingThemeOption, allCards: HTMLElement[]): void {
		const card = append(parent, $('div.onboarding-b-theme-card'));
		allCards.push(card);
		card.setAttribute('role', 'radio');
		card.setAttribute('aria-checked', theme.id === this.selectedThemeId ? 'true' : 'false');
		card.setAttribute('aria-label', theme.label);
		card.setAttribute('tabindex', '0');

		if (theme.id === this.selectedThemeId) {
			card.classList.add('selected');
		}

		const preview = append(card, $('div.onboarding-b-theme-preview'));
		preview.style.backgroundColor = theme.preview.background;
		this._renderCodePreview(preview, theme);

		const label = append(card, $('div.onboarding-b-theme-label'));
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

	private _renderCodePreview(container: HTMLElement, theme: IOnboardingThemeOption): void {
		const lines = [
			[
				{ text: 'function ', color: theme.preview.keyword },
				{ text: 'greet', color: theme.preview.function },
				{ text: '() {', color: theme.preview.foreground },
			],
			[
				{ text: '  ', color: theme.preview.foreground },
				{ text: '// hello', color: theme.preview.comment },
			],
			[
				{ text: '  ', color: theme.preview.foreground },
				{ text: 'return ', color: theme.preview.keyword },
				{ text: '"Hi"', color: theme.preview.string },
			],
			[
				{ text: '}', color: theme.preview.foreground },
			],
		];

		for (const line of lines) {
			const lineEl = append(container, $('div.onboarding-b-code-line'));
			for (const token of line) {
				const span = append(lineEl, $('span'));
				span.textContent = token.text;
				span.style.color = token.color;
			}
		}
	}

	private _selectTheme(theme: IOnboardingThemeOption): void {
		this.selectedThemeId = theme.id;
		this.themeService.setColorTheme(theme.themeId, undefined);
	}

	private async _applyKeymap(keymapId: string): Promise<void> {
		const keymap = ONBOARDING_KEYMAP_OPTIONS.find(k => k.id === keymapId);
		if (!keymap?.extensionId) {
			return;
		}

		try {
			const gallery = await this.extensionGalleryService.getExtensions([{ id: keymap.extensionId }], CancellationToken.None);
			if (gallery.length > 0) {
				await this.extensionManagementService.installFromGallery(gallery[0]);
			}
		} catch {
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize('onboarding.b.keymap.error', "Could not install {0} keymap.", keymap.label),
			});
		}
	}

	// =====================================================================
	// Step: Extensions
	// =====================================================================

	private _renderExtensionsStep(container: HTMLElement): void {
		const wrapper = append(container, $('div.onboarding-b-sessions'));

		for (const ext of ONBOARDING_RECOMMENDED_EXTENSIONS) {
			const row = append(wrapper, $('div.onboarding-b-feature-row'));
			row.appendChild(renderIcon(this._getExtIcon(ext.icon)));
			const textContainer = append(row, $('div.onboarding-b-feature-text'));
			const titleEl = append(textContainer, $('div.onboarding-b-feature-title'));
			titleEl.textContent = ext.name;
			const descEl = append(textContainer, $('div.onboarding-b-feature-desc'));
			descEl.textContent = ext.description;

			const installBtn = append(row, $<HTMLButtonElement>('button.onboarding-a-ext-install'));
			installBtn.type = 'button';
			installBtn.textContent = localize('onboarding.b.ext.install', "Install");
			this.stepDisposables.add(addDisposableListener(installBtn, EventType.CLICK, () => {
				installBtn.textContent = localize('onboarding.b.ext.installed', "Installed");
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

	// =====================================================================
	// Step: Agent Sessions
	// =====================================================================

	private _renderAgentSessionsStep(container: HTMLElement): void {
		const wrapper = append(container, $('div.onboarding-b-sessions'));

		const features = append(wrapper, $('div.onboarding-b-sessions-features'));

		this._createFeatureRow(features, Codicon.cloud, localize('onboarding.b.sessions.cloud', "Cloud Sessions"), localize('onboarding.b.sessions.cloud.desc', "Code keeps running in the cloud, even when your laptop is closed."));
		this._createFeatureRow(features, Codicon.deviceDesktop, localize('onboarding.b.sessions.local', "Local Sessions"), localize('onboarding.b.sessions.local.desc', "Full access to your machine, tools, and local environment."));
		this._createFeatureRow(features, Codicon.layers, localize('onboarding.b.sessions.parallel', "Parallel Sessions"), localize('onboarding.b.sessions.parallel.desc', "Run multiple agent sessions at once. Review when ready."));
		this._createFeatureRow(features, Codicon.github, localize('onboarding.b.sessions.github', "GitHub Integration"), localize('onboarding.b.sessions.github.desc', "Create PRs, manage issues, and review code — all from the agent."));

		const docs = append(wrapper, $('div.onboarding-b-sessions-docs'));
		this._createDocLink(docs, localize('onboarding.b.sessions.learnMore', "Agent sessions docs"), 'https://code.visualstudio.com/docs/copilot/agent-sessions');
		this._createDocLink(docs, localize('onboarding.b.sessions.github.docs', "GitHub integration"), 'https://code.visualstudio.com/docs/copilot/github');
	}

	private _createFeatureRow(parent: HTMLElement, icon: ThemeIcon, title: string, description: string): void {
		const row = append(parent, $('div.onboarding-b-feature-row'));
		row.appendChild(renderIcon(icon));
		const textContainer = append(row, $('div.onboarding-b-feature-text'));
		const titleEl = append(textContainer, $('div.onboarding-b-feature-title'));
		titleEl.textContent = title;
		const descEl = append(textContainer, $('div.onboarding-b-feature-desc'));
		descEl.textContent = description;
	}

	private _createDocLink(parent: HTMLElement, label: string, href: string): void {
		const link = append(parent, $<HTMLAnchorElement>('a.onboarding-b-doc-link'));
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
		this.stepListContainer = undefined;
		this.contentArea = undefined;
		this.titleEl = undefined;
		this.subtitleEl = undefined;
		this.bodyEl = undefined;
		this.footerEl = undefined;
		this.focusableElements.length = 0;
		this._isShowing = false;
		this.disposables.clear();
		this.stepDisposables.clear();

		if (this.previouslyFocusedElement) {
			this.previouslyFocusedElement.focus();
			this.previouslyFocusedElement = undefined;
		}

		this.currentStepIndex = 0;
		this.completedSteps.clear();
	}

	override dispose(): void {
		this._removeFromDOM();
		super.dispose();
	}
}
