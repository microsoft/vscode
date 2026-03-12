/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { $, append, addDisposableListener, EventType, getActiveWindow } from '../../../../base/browser/dom.js';
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
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import {
	ONBOARDING_THEME_OPTIONS,
	ONBOARDING_KEYMAP_OPTIONS,
	PROJECT_STARTER_CARDS,
	IOnboardingThemeOption,
	IProjectStarterCard,
} from '../common/onboardingTypes.js';

/** Maps project card icon names to codicons */
function getProjectIcon(iconName: string): ThemeIcon {
	switch (iconName) {
		case 'game': return Codicon.symbolEvent;
		case 'globe': return Codicon.globe;
		case 'server': return Codicon.server;
		case 'graph': return Codicon.graphLine;
		case 'terminal': return Codicon.terminal;
		case 'checklist': return Codicon.checklist;
		default: return Codicon.file;
	}
}

/**
 * Variation C — Chat-Integrated Welcome
 *
 * Renders as the full welcome tab content. Chat input is always visible
 * at the bottom. Above the input are project starter cards that inject
 * prompts. Setup steps (sign-in, theme, keymap) are shown as clickable
 * inline cards that open mini-modals for configuration.
 */
export class OnboardingVariationC extends Disposable {

	private readonly _onDidComplete = this._register(new Emitter<void>());
	readonly onDidComplete: Event<void> = this._onDidComplete.event;

	private readonly _onDidRequestPrompt = this._register(new Emitter<string>());
	/** Fires when a project starter card is clicked. The event value is the prompt text. */
	readonly onDidRequestPrompt: Event<string> = this._onDidRequestPrompt.event;

	private container: HTMLElement | undefined;
	private readonly disposables = this._register(new DisposableStore());
	private readonly inlineDisposables = this._register(new DisposableStore());

	private selectedThemeId = 'dark-modern';
	private selectedKeymapId = 'vscode';
	private completedSetup = new Set<string>();
	private setupCards = new Map<string, HTMLElement>();

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		const currentTheme = this.themeService.getColorTheme();
		const matchingTheme = ONBOARDING_THEME_OPTIONS.find(t => t.themeId === currentTheme.label);
		if (matchingTheme) {
			this.selectedThemeId = matchingTheme.id;
		}
	}

	/**
	 * Render the welcome content into the given container.
	 * This replaces the standard welcome tab content.
	 */
	render(parent: HTMLElement): HTMLElement {
		this.container = append(parent, $('.onboarding-c-container'));

		// Header
		const header = append(this.container, $('.onboarding-c-header'));
		const logo = append(header, $('div.onboarding-c-logo'));
		logo.appendChild(renderIcon(Codicon.copilot));
		const title = append(header, $('h1.onboarding-c-title'));
		title.textContent = localize('onboarding.c.title', "Welcome to VS Code");
		const subtitle = append(header, $('p.onboarding-c-subtitle'));
		subtitle.textContent = localize('onboarding.c.subtitle', "Your AI-powered coding environment is ready. Set up or start building.");

		// Setup cards row
		this._renderSetupCards(this.container);

		// Section: Start a project
		const projectLabel = append(this.container, $('div.onboarding-c-section-label'));
		projectLabel.textContent = localize('onboarding.c.startProject', "Start a Project");

		// Project starter cards grid
		this._renderProjectGrid(this.container);

		// Chat area placeholder (real ChatInputPart would be reparented here)
		this._renderChatPlaceholder(this.container);

		// Quick links
		this._renderLinks(this.container);

		return this.container;
	}

	private _renderSetupCards(parent: HTMLElement): void {
		const row = append(parent, $('div.onboarding-c-setup-row'));

		// Sign In card
		const signInCard = this._createSetupCard(
			row,
			Codicon.account,
			localize('onboarding.c.setup.signIn', "Sign In"),
			localize('onboarding.c.setup.signIn.desc', "Sync & GitHub"),
			'signIn'
		);
		this.disposables.add(addDisposableListener(signInCard, EventType.CLICK, () => {
			this._showSignInInline();
		}));

		// Theme card
		const themeCard = this._createSetupCard(
			row,
			Codicon.paintcan,
			localize('onboarding.c.setup.theme', "Theme & Keys"),
			localize('onboarding.c.setup.theme.desc', "Customize your look"),
			'personalize'
		);
		this.disposables.add(addDisposableListener(themeCard, EventType.CLICK, () => {
			this._showPersonalizeInline();
		}));

		// Agent Sessions card
		const sessionsCard = this._createSetupCard(
			row,
			Codicon.sparkle,
			localize('onboarding.c.setup.sessions', "Agent Sessions"),
			localize('onboarding.c.setup.sessions.desc', "Cloud & local AI"),
			'sessions'
		);
		this.disposables.add(addDisposableListener(sessionsCard, EventType.CLICK, () => {
			this._showSessionsInline();
		}));
	}

	private _createSetupCard(parent: HTMLElement, icon: ThemeIcon, title: string, description: string, id: string): HTMLButtonElement {
		const card = append(parent, $<HTMLButtonElement>('button.onboarding-c-setup-card'));
		card.type = 'button';
		this.setupCards.set(id, card);

		if (this.completedSetup.has(id)) {
			card.classList.add('completed');
		}

		card.appendChild(renderIcon(this.completedSetup.has(id) ? Codicon.check : icon));

		const text = append(card, $('div.onboarding-c-setup-card-text'));
		const titleEl = append(text, $('div.onboarding-c-setup-card-title'));
		titleEl.textContent = title;
		const descEl = append(text, $('div.onboarding-c-setup-card-desc'));
		descEl.textContent = description;

		return card;
	}

	private _renderProjectGrid(parent: HTMLElement): void {
		const grid = append(parent, $('div.onboarding-c-project-grid'));

		for (const project of PROJECT_STARTER_CARDS) {
			this._createProjectCard(grid, project);
		}
	}

	private _createProjectCard(parent: HTMLElement, project: IProjectStarterCard): void {
		const card = append(parent, $<HTMLButtonElement>('button.onboarding-c-project-card'));
		card.type = 'button';

		const header = append(card, $('div.onboarding-c-project-card-header'));
		header.appendChild(renderIcon(getProjectIcon(project.icon)));
		const title = append(header, $('span.onboarding-c-project-card-title'));
		title.textContent = project.title;

		const desc = append(card, $('div.onboarding-c-project-card-desc'));
		desc.textContent = project.description;

		const tags = append(card, $('div.onboarding-c-project-card-tags'));
		for (const tag of project.tags) {
			const tagEl = append(tags, $('span.onboarding-c-project-tag'));
			tagEl.textContent = tag;
		}

		this.disposables.add(addDisposableListener(card, EventType.CLICK, () => {
			this._onDidRequestPrompt.fire(project.prompt);
		}));
	}

	private _renderChatPlaceholder(parent: HTMLElement): void {
		const chatArea = append(parent, $('div.onboarding-c-chat-area'));
		const placeholder = append(chatArea, $<HTMLButtonElement>('button.onboarding-c-chat-placeholder'));
		placeholder.type = 'button';
		placeholder.appendChild(renderIcon(Codicon.sparkle));
		const text = append(placeholder, $('span'));
		text.textContent = localize('onboarding.c.chat.placeholder', "Ask Copilot anything, or pick a project above to get started...");

		this.disposables.add(addDisposableListener(placeholder, EventType.CLICK, () => {
			// Focus the real chat input if available
			this.commandService.executeCommand('workbench.action.chat.open');
		}));
	}

	private _renderLinks(parent: HTMLElement): void {
		const links = append(parent, $('div.onboarding-c-links'));
		this._createLink(links, localize('onboarding.c.link.docs', "Documentation"), 'https://code.visualstudio.com/docs');
		this._createLink(links, localize('onboarding.c.link.sessions', "Agent Sessions"), 'https://code.visualstudio.com/docs/copilot/agent-sessions');
		this._createLink(links, localize('onboarding.c.link.extensions', "Extensions"), 'https://marketplace.visualstudio.com/vscode');
		this._createLink(links, localize('onboarding.c.link.shortcuts', "Keyboard Shortcuts"), 'https://code.visualstudio.com/docs/getstarted/keybindings');
	}

	private _createLink(parent: HTMLElement, label: string, href: string): void {
		const link = append(parent, $<HTMLAnchorElement>('a.onboarding-c-link'));
		link.textContent = label;
		link.href = href;
		link.target = '_blank';
		link.rel = 'noopener';
	}

	// =====================================================================
	// Inline mini-modals
	// =====================================================================

	private _showSignInInline(): void {
		const { overlay, card } = this._createInlineOverlay(
			localize('onboarding.c.inline.signIn', "Sign In"),
			localize('onboarding.c.inline.signIn.subtitle', "Connect your accounts to sync settings and access GitHub")
		);

		const body = append(card, $('div.onboarding-c-signin'));

		const githubBtn = this._createInlineSignInButton(body, Codicon.github, localize('onboarding.c.inline.github', "Continue with GitHub"));
		this.inlineDisposables.add(addDisposableListener(githubBtn, EventType.CLICK, async () => {
			try {
				const session = await this.authenticationService.createSession('github', ['user:email']);
				if (session) {
					this._markSetupComplete('signIn');
					this._dismissInlineOverlay(overlay);
				}
			} catch {
				this.notificationService.notify({ severity: Severity.Error, message: localize('onboarding.c.inline.signIn.error', "Sign-in failed. Try again from the Accounts menu.") });
			}
		}));

		const msBtn = this._createInlineSignInButton(body, Codicon.account, localize('onboarding.c.inline.microsoft', "Continue with Microsoft"));
		this.inlineDisposables.add(addDisposableListener(msBtn, EventType.CLICK, async () => {
			try {
				const session = await this.authenticationService.createSession('microsoft', ['openid', 'profile', 'email']);
				if (session) {
					this._markSetupComplete('signIn');
					this._dismissInlineOverlay(overlay);
				}
			} catch {
				this.notificationService.notify({ severity: Severity.Error, message: localize('onboarding.c.inline.signIn.error', "Sign-in failed. Try again from the Accounts menu.") });
			}
		}));

		const note = append(body, $('p.onboarding-c-signin-note'));
		note.textContent = localize('onboarding.c.inline.signIn.note', "Copilot is available without signing in. Sign in for settings sync and GitHub features.");
	}

	private _createInlineSignInButton(parent: HTMLElement, icon: ThemeIcon, label: string): HTMLButtonElement {
		const btn = append(parent, $<HTMLButtonElement>('button.onboarding-c-signin-btn'));
		btn.type = 'button';
		btn.appendChild(renderIcon(icon));
		const labelEl = append(btn, $('span'));
		labelEl.textContent = label;
		return btn;
	}

	private _showPersonalizeInline(): void {
		const { overlay, card } = this._createInlineOverlay(
			localize('onboarding.c.inline.personalize', "Make It Yours"),
			localize('onboarding.c.inline.personalize.subtitle', "Choose your theme and keyboard shortcuts")
		);

		// Theme grid
		const themeLabel = append(card, $('div.onboarding-c-section-label'));
		themeLabel.textContent = localize('onboarding.c.inline.theme', "Color Theme");
		themeLabel.style.marginBottom = '8px';

		const themeGrid = append(card, $('div.onboarding-c-theme-grid'));
		const themeCards: HTMLElement[] = [];
		for (const theme of ONBOARDING_THEME_OPTIONS) {
			this._createInlineThemeCard(themeGrid, theme, themeCards);
		}

		// Keymap list
		const keymapLabel = append(card, $('div.onboarding-c-section-label'));
		keymapLabel.textContent = localize('onboarding.c.inline.keymap', "Keyboard Shortcuts");
		keymapLabel.style.marginTop = '16px';
		keymapLabel.style.marginBottom = '8px';

		const keymapList = append(card, $('div.onboarding-c-keymap-list'));
		const keymapPills: HTMLButtonElement[] = [];
		for (const keymap of ONBOARDING_KEYMAP_OPTIONS) {
			const pill = append(keymapList, $<HTMLButtonElement>('button.onboarding-c-keymap-pill'));
			pill.type = 'button';
			pill.textContent = keymap.label;
			pill.title = keymap.description;
			keymapPills.push(pill);
			if (keymap.id === this.selectedKeymapId) {
				pill.classList.add('selected');
			}

			this.inlineDisposables.add(addDisposableListener(pill, EventType.CLICK, () => {
				this.selectedKeymapId = keymap.id;
				this._applyKeymap(keymap.id);
				for (const p of keymapPills) {
					p.classList.remove('selected');
				}
				pill.classList.add('selected');
			}));
		}

		// Done button
		const footer = append(card, $('div.onboarding-c-inline-footer'));
		const doneBtn = append(footer, $<HTMLButtonElement>('button.onboarding-c-btn.onboarding-c-btn-primary'));
		doneBtn.type = 'button';
		doneBtn.textContent = localize('onboarding.c.inline.done', "Done");
		this.inlineDisposables.add(addDisposableListener(doneBtn, EventType.CLICK, () => {
			this._markSetupComplete('personalize');
			this._dismissInlineOverlay(overlay);
		}));
	}

	private _createInlineThemeCard(parent: HTMLElement, theme: IOnboardingThemeOption, allCards: HTMLElement[]): void {
		const card = append(parent, $('div.onboarding-c-theme-card'));
		allCards.push(card);
		card.setAttribute('tabindex', '0');
		card.setAttribute('aria-label', theme.label);

		if (theme.id === this.selectedThemeId) {
			card.classList.add('selected');
		}

		const preview = append(card, $('div.onboarding-c-theme-preview'));
		preview.style.backgroundColor = theme.preview.background;
		this._renderCodePreview(preview, theme);

		const label = append(card, $('div.onboarding-c-theme-label'));
		label.textContent = theme.label;

		this.inlineDisposables.add(addDisposableListener(card, EventType.CLICK, () => {
			this.selectedThemeId = theme.id;
			this.themeService.setColorTheme(theme.themeId, undefined);
			for (const c of allCards) {
				c.classList.remove('selected');
			}
			card.classList.add('selected');
		}));
	}

	private _renderCodePreview(container: HTMLElement, theme: IOnboardingThemeOption): void {
		const lines = [
			[{ text: 'fn ', color: theme.preview.keyword }, { text: 'main', color: theme.preview.function }, { text: '() {', color: theme.preview.foreground }],
			[{ text: '  ', color: theme.preview.foreground }, { text: '// go', color: theme.preview.comment }],
			[{ text: '}', color: theme.preview.foreground }],
		];
		for (const line of lines) {
			const lineEl = append(container, $('div.onboarding-c-code-line'));
			for (const token of line) {
				const span = append(lineEl, $('span'));
				span.textContent = token.text;
				span.style.color = token.color;
			}
		}
	}

	private _showSessionsInline(): void {
		const { overlay, card } = this._createInlineOverlay(
			localize('onboarding.c.inline.sessions', "Agent Sessions"),
			localize('onboarding.c.inline.sessions.subtitle', "AI coding agents that run in the background")
		);

		const features: Array<{ icon: ThemeIcon; title: string; desc: string }> = [
			{ icon: Codicon.cloud, title: localize('onboarding.c.inline.cloud', "Cloud Sessions"), desc: localize('onboarding.c.inline.cloud.desc', "Agents run in the cloud. Code keeps going when you step away.") },
			{ icon: Codicon.deviceDesktop, title: localize('onboarding.c.inline.local', "Local Sessions"), desc: localize('onboarding.c.inline.local.desc', "Full access to your OS, filesystem, and local tools.") },
			{ icon: Codicon.layers, title: localize('onboarding.c.inline.parallel', "Parallel Sessions"), desc: localize('onboarding.c.inline.parallel.desc', "Run multiple agents at once across different tasks.") },
			{ icon: Codicon.github, title: localize('onboarding.c.inline.ghIntegration', "GitHub Integration"), desc: localize('onboarding.c.inline.github.desc', "Create PRs, manage issues, and code review \u2014 directly from chat.") },
		];

		for (const feature of features) {
			const row = append(card, $('div'));
			row.style.display = 'flex';
			row.style.alignItems = 'flex-start';
			row.style.gap = '10px';
			row.style.marginBottom = '12px';
			row.appendChild(renderIcon(feature.icon));
			const text = append(row, $('div'));
			const title = append(text, $('div'));
			title.textContent = feature.title;
			title.style.fontWeight = '600';
			title.style.fontSize = '13px';
			const desc = append(text, $('div'));
			desc.textContent = feature.desc;
			desc.style.fontSize = '12px';
			desc.style.color = 'var(--vscode-descriptionForeground)';
		}

		const footer = append(card, $('div.onboarding-c-inline-footer'));
		const doneBtn = append(footer, $<HTMLButtonElement>('button.onboarding-c-btn.onboarding-c-btn-primary'));
		doneBtn.type = 'button';
		doneBtn.textContent = localize('onboarding.c.inline.gotIt', "Got It");
		this.inlineDisposables.add(addDisposableListener(doneBtn, EventType.CLICK, () => {
			this._markSetupComplete('sessions');
			this._dismissInlineOverlay(overlay);
		}));
	}

	// =====================================================================
	// Inline overlay helpers
	// =====================================================================

	private _createInlineOverlay(title: string, subtitle: string): { overlay: HTMLElement; card: HTMLElement } {
		this.inlineDisposables.clear();

		const overlay = append(this.layoutService.activeContainer, $('div.onboarding-c-inline-overlay'));
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');

		const card = append(overlay, $('div.onboarding-c-inline-card'));
		card.style.position = 'relative';

		const titleEl = append(card, $('h2.onboarding-c-inline-title'));
		titleEl.textContent = title;
		const subtitleEl = append(card, $('p.onboarding-c-inline-subtitle'));
		subtitleEl.textContent = subtitle;

		// Backdrop click
		this.inlineDisposables.add(addDisposableListener(overlay, EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (e.target === overlay) {
				this._dismissInlineOverlay(overlay);
			}
		}));

		// Escape
		this.inlineDisposables.add(addDisposableListener(overlay, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Escape) {
				e.preventDefault();
				this._dismissInlineOverlay(overlay);
			}
		}));

		// Animate in
		getActiveWindow().requestAnimationFrame(() => overlay.classList.add('visible'));

		return { overlay, card };
	}

	private _dismissInlineOverlay(overlay: HTMLElement): void {
		overlay.classList.remove('visible');
		setTimeout(() => overlay.remove(), 250);
		this.inlineDisposables.clear();
	}

	private _markSetupComplete(id: string): void {
		this.completedSetup.add(id);
		const card = this.setupCards.get(id);
		if (card) {
			card.classList.add('completed');
		}

		// Check if all complete
		if (this.completedSetup.has('signIn') && this.completedSetup.has('personalize') && this.completedSetup.has('sessions')) {
			this._onDidComplete.fire();
		}
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
				message: localize('onboarding.c.keymap.error', "Could not install {0} keymap.", keymap.label),
			});
		}
	}

	override dispose(): void {
		this.container?.remove();
		super.dispose();
	}
}
