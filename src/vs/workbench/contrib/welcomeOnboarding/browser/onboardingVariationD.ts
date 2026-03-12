/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { $, append, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
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
	ONBOARDING_THEME_OPTIONS,
	ONBOARDING_KEYMAP_OPTIONS,
	IOnboardingThemeOption,
} from '../common/onboardingTypes.js';

/**
 * The phases of the agentic onboarding conversation.
 */
const enum AgentPhase {
	Welcome = 0,
	SignIn = 1,
	Theme = 2,
	Keymap = 3,
	Sessions = 4,
	Complete = 5,
}


/**
 * Variation D — Agentic Full-Screen Chat
 *
 * A full-screen experience where only the chat is visible. Copilot acts
 * as a setup guide, sending messages that walk the user through sign-in,
 * theme selection, keymap preference, and agent sessions introduction.
 *
 * The conversation starts automatically with a welcome message from
 * Copilot. Interactive elements (buttons, theme cards, keymap pills)
 * are embedded directly in chat messages.
 */
export class OnboardingVariationD extends Disposable {

	private readonly _onDidComplete = this._register(new Emitter<void>());
	readonly onDidComplete: Event<void> = this._onDidComplete.event;

	private container: HTMLElement | undefined;
	private messagesEl: HTMLElement | undefined;
	private inputEl: HTMLInputElement | undefined;
	private sendBtn: HTMLButtonElement | undefined;

	private phase: AgentPhase = AgentPhase.Welcome;
	private readonly disposables = this._register(new DisposableStore());
	private readonly messageDisposables = this._register(new DisposableStore());

	private selectedThemeId = 'dark-modern';
	private selectedKeymapId = 'vscode';

	constructor(
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();

		const currentTheme = this.themeService.getColorTheme();
		const match = ONBOARDING_THEME_OPTIONS.find(t => t.themeId === currentTheme.label);
		if (match) {
			this.selectedThemeId = match.id;
		}
	}

	/**
	 * Render the full-screen chat into the given container.
	 */
	render(parent: HTMLElement): HTMLElement {
		this.container = append(parent, $('.onboarding-d-container'));

		// Messages area
		this.messagesEl = append(this.container, $('.onboarding-d-messages'));

		// Input area
		const inputArea = append(this.container, $('.onboarding-d-input-area'));
		const inputRow = append(inputArea, $('.onboarding-d-input-row'));
		this.inputEl = append(inputRow, $<HTMLInputElement>('input.onboarding-d-input'));
		this.inputEl.type = 'text';
		this.inputEl.placeholder = localize('onboarding.d.input.placeholder', "Type a message...");

		this.sendBtn = append(inputRow, $<HTMLButtonElement>('button.onboarding-d-send-btn'));
		this.sendBtn.type = 'button';
		this.sendBtn.appendChild(renderIcon(Codicon.send));
		this.sendBtn.setAttribute('aria-label', localize('onboarding.d.send', "Send"));

		// Handle send
		this.disposables.add(addDisposableListener(this.sendBtn, EventType.CLICK, () => this._handleUserInput()));
		this.disposables.add(addDisposableListener(this.inputEl, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			if (event.keyCode === KeyCode.Enter && !e.shiftKey) {
				e.preventDefault();
				this._handleUserInput();
			}
		}));

		// Start the conversation after a beat
		setTimeout(() => this._runPhase(AgentPhase.Welcome), 400);

		return this.container;
	}

	private _handleUserInput(): void {
		if (!this.inputEl) {
			return;
		}

		const text = this.inputEl.value.trim();
		if (!text) {
			return;
		}

		this._addMessage('user', text);
		this.inputEl.value = '';

		// If user types anything during a phase, advance to next
		this._advancePhase();
	}

	private _advancePhase(): void {
		if (this.phase < AgentPhase.Complete) {
			this.phase++;
			setTimeout(() => this._runPhase(this.phase), 600);
		}
	}

	private async _runPhase(phase: AgentPhase): Promise<void> {
		this.messageDisposables.clear();

		switch (phase) {
			case AgentPhase.Welcome:
				this._showWelcome();
				break;
			case AgentPhase.SignIn:
				this._showSignIn();
				break;
			case AgentPhase.Theme:
				this._showTheme();
				break;
			case AgentPhase.Keymap:
				this._showKeymap();
				break;
			case AgentPhase.Sessions:
				this._showSessions();
				break;
			case AgentPhase.Complete:
				this._showComplete();
				break;
		}
	}

	// =====================================================================
	// Phases
	// =====================================================================

	private _showWelcome(): void {
		const actions = this._createActions();

		const getStartedBtn = this._addActionButton(actions, Codicon.sparkle, localize('onboarding.d.welcome.start', "Let's go!"));
		this.messageDisposables.add(addDisposableListener(getStartedBtn, EventType.CLICK, () => {
			this._addMessage('user', localize('onboarding.d.welcome.userReply', "Let's go!"));
			this.phase = AgentPhase.SignIn;
			setTimeout(() => this._runPhase(AgentPhase.SignIn), 500);
		}));

		this._addAssistantMessage(
			localize('onboarding.d.welcome.text', "Hey! I'm Copilot, your AI coding partner. I'll help you set up VS Code in just a minute. Ready?"),
			actions
		);
	}

	private _showSignIn(): void {
		const actions = this._createActions();

		const githubBtn = this._addActionButton(actions, Codicon.github, localize('onboarding.d.signin.github', "Sign in with GitHub"));
		this.messageDisposables.add(addDisposableListener(githubBtn, EventType.CLICK, async () => {
			githubBtn.disabled = true;
			try {
				const session = await this.authenticationService.createSession('github', ['user:email']);
				if (session) {
					this._addSuccessIndicator(actions, localize('onboarding.d.signin.success', "Signed in as {0}", session.account.label));
					this.phase = AgentPhase.Theme;
					setTimeout(() => this._runPhase(AgentPhase.Theme), 800);
				}
			} catch {
				githubBtn.disabled = false;
				this.notificationService.notify({
					severity: Severity.Error,
					message: localize('onboarding.d.signin.error', "Sign-in failed. You can try again or skip."),
				});
			}
		}));

		const msBtn = this._addActionButton(actions, Codicon.account, localize('onboarding.d.signin.ms', "Sign in with Microsoft"));
		this.messageDisposables.add(addDisposableListener(msBtn, EventType.CLICK, async () => {
			msBtn.disabled = true;
			try {
				const session = await this.authenticationService.createSession('microsoft', ['openid', 'profile', 'email']);
				if (session) {
					this._addSuccessIndicator(actions, localize('onboarding.d.signin.success', "Signed in as {0}", session.account.label));
					this.phase = AgentPhase.Theme;
					setTimeout(() => this._runPhase(AgentPhase.Theme), 800);
				}
			} catch {
				msBtn.disabled = false;
				this.notificationService.notify({
					severity: Severity.Error,
					message: localize('onboarding.d.signin.error', "Sign-in failed. You can try again or skip."),
				});
			}
		}));

		const skipBtn = this._addActionButton(actions, Codicon.arrowRight, localize('onboarding.d.signin.skip', "Skip for now"));
		this.messageDisposables.add(addDisposableListener(skipBtn, EventType.CLICK, () => {
			this._addMessage('user', localize('onboarding.d.signin.skipReply', "I'll sign in later."));
			this.phase = AgentPhase.Theme;
			setTimeout(() => this._runPhase(AgentPhase.Theme), 500);
		}));

		this._addAssistantMessage(
			localize('onboarding.d.signin.text', "First, let's connect your account. This syncs your settings across devices and unlocks GitHub features like pull requests and issues. You can also try Copilot without signing in."),
			actions
		);
	}

	private _showTheme(): void {
		const actions = this._createActions();

		// Theme grid
		const themeGrid = append(actions, $('.onboarding-d-theme-grid'));
		const themeCards: HTMLElement[] = [];
		for (const theme of ONBOARDING_THEME_OPTIONS) {
			themeCards.push(this._createThemeCard(themeGrid, theme, actions, themeCards));
		}

		this._addAssistantMessage(
			localize('onboarding.d.theme.text', "Nice! Now let's make VS Code feel like home. Pick a color theme — you can always change it later."),
			actions
		);
	}

	private _createThemeCard(parent: HTMLElement, theme: IOnboardingThemeOption, actionsContainer: HTMLElement, allCards: HTMLElement[]): HTMLElement {
		const card = append(parent, $('div.onboarding-d-theme-card'));
		card.setAttribute('tabindex', '0');
		card.setAttribute('aria-label', theme.label);

		if (theme.id === this.selectedThemeId) {
			card.classList.add('selected');
		}

		const preview = append(card, $('div.onboarding-d-theme-preview'));
		preview.style.backgroundColor = theme.preview.background;

		const lines = [
			[{ text: 'fn ', color: theme.preview.keyword }, { text: 'main', color: theme.preview.function }, { text: '() {', color: theme.preview.foreground }],
			[{ text: '  ', color: theme.preview.foreground }, { text: '"hi"', color: theme.preview.string }],
			[{ text: '}', color: theme.preview.foreground }],
		];
		for (const line of lines) {
			const lineEl = append(preview, $('div.onboarding-d-code-line'));
			for (const token of line) {
				const span = append(lineEl, $('span'));
				span.textContent = token.text;
				span.style.color = token.color;
			}
		}

		const label = append(card, $('div.onboarding-d-theme-label'));
		label.textContent = theme.label;

		this.messageDisposables.add(addDisposableListener(card, EventType.CLICK, () => {
			this.selectedThemeId = theme.id;
			this.themeService.setColorTheme(theme.themeId, undefined);

			for (const c of allCards) {
				c.classList.remove('selected');
			}
			card.classList.add('selected');

			this._addSuccessIndicator(actionsContainer, localize('onboarding.d.theme.applied', "Applied {0}", theme.label));
			this._addMessage('user', localize('onboarding.d.theme.userReply', "I'll go with {0}.", theme.label));
			this.phase = AgentPhase.Keymap;
			setTimeout(() => this._runPhase(AgentPhase.Keymap), 600);
		}));

		this.messageDisposables.add(addDisposableListener(card, EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				card.click();
			}
		}));

		return card;
	}

	private _showKeymap(): void {
		const actions = this._createActions();

		const keymapList = append(actions, $('div.onboarding-d-keymap-list'));
		const keymapPills: HTMLButtonElement[] = [];
		for (const keymap of ONBOARDING_KEYMAP_OPTIONS) {
			const pill = append(keymapList, $<HTMLButtonElement>('button.onboarding-d-keymap-pill'));
			pill.type = 'button';
			pill.textContent = keymap.label;
			pill.title = keymap.description;
			keymapPills.push(pill);

			if (keymap.id === this.selectedKeymapId) {
				pill.classList.add('selected');
			}

			this.messageDisposables.add(addDisposableListener(pill, EventType.CLICK, () => {
				this.selectedKeymapId = keymap.id;
				this._applyKeymap(keymap.id);

				for (const p of keymapPills) {
					p.classList.remove('selected');
				}
				pill.classList.add('selected');

				this._addSuccessIndicator(actions, localize('onboarding.d.keymap.applied', "Set to {0}", keymap.label));
				this._addMessage('user', localize('onboarding.d.keymap.userReply', "{0} shortcuts, please.", keymap.label));
				this.phase = AgentPhase.Sessions;
				setTimeout(() => this._runPhase(AgentPhase.Sessions), 600);
			}));
		}

		this._addAssistantMessage(
			localize('onboarding.d.keymap.text', "Great choice! What keyboard shortcuts do you prefer? If you're coming from another editor, pick its keymap to feel right at home."),
			actions
		);
	}

	private _showSessions(): void {
		const actions = this._createActions();

		const featureList = append(actions, $('div.onboarding-d-feature-list'));

		const features: Array<{ icon: ThemeIcon; text: string }> = [
			{ icon: Codicon.cloud, text: localize('onboarding.d.sessions.cloud', "Cloud sessions — agents keep coding even when you close your laptop") },
			{ icon: Codicon.deviceDesktop, text: localize('onboarding.d.sessions.local', "Local sessions — full access to your machine, tools, and environment") },
			{ icon: Codicon.layers, text: localize('onboarding.d.sessions.parallel', "Parallel sessions — run multiple agents on different tasks simultaneously") },
			{ icon: Codicon.github, text: localize('onboarding.d.sessions.github', "GitHub integration — create PRs, manage issues, review code from chat") },
		];

		for (const feature of features) {
			const item = append(featureList, $('div.onboarding-d-feature-item'));
			item.appendChild(renderIcon(feature.icon));
			const text = append(item, $('span'));
			text.textContent = feature.text;
		}

		const gotItBtn = this._addActionButton(actions, Codicon.check, localize('onboarding.d.sessions.gotIt', "Awesome, let's start!"));
		this.messageDisposables.add(addDisposableListener(gotItBtn, EventType.CLICK, () => {
			this._addMessage('user', localize('onboarding.d.sessions.userReply', "This sounds amazing. Let's go!"));
			this.phase = AgentPhase.Complete;
			setTimeout(() => this._runPhase(AgentPhase.Complete), 600);
		}));

		this._addAssistantMessage(
			localize('onboarding.d.sessions.text', "One more thing — VS Code now has agent sessions. Think of them as AI coding partners that can work alongside you:"),
			actions
		);
	}

	private _showComplete(): void {
		this._addAssistantMessage(
			localize('onboarding.d.complete.text', "You're all set! Your environment is configured and ready to go. You can always adjust these settings later. Happy coding!"),
			undefined
		);

		setTimeout(() => this._onDidComplete.fire(), 1500);
	}

	// =====================================================================
	// Message helpers
	// =====================================================================

	private _addMessage(role: 'assistant' | 'user', text: string, actionsEl?: HTMLElement): void {
		if (!this.messagesEl) {
			return;
		}

		const msg = append(this.messagesEl, $(`.onboarding-d-message.${role}`));

		// Avatar
		const avatar = append(msg, $('div.onboarding-d-avatar'));
		if (role === 'assistant') {
			avatar.appendChild(renderIcon(Codicon.copilot));
		} else {
			avatar.appendChild(renderIcon(Codicon.account));
		}

		// Bubble
		const bubble = append(msg, $('div.onboarding-d-bubble'));
		const sender = append(bubble, $('div.onboarding-d-bubble-sender'));
		sender.textContent = role === 'assistant'
			? localize('onboarding.d.copilot', "Copilot")
			: localize('onboarding.d.you', "You");

		const textEl = append(bubble, $('div.onboarding-d-bubble-text'));
		const p = append(textEl, $('p'));
		p.textContent = text;

		if (actionsEl) {
			bubble.appendChild(actionsEl);
		}

		// Scroll to bottom
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
	}

	private _addAssistantMessage(text: string, actionsEl: HTMLElement | undefined): void {
		this._addMessage('assistant', text, actionsEl);
	}

	private _createActions(): HTMLElement {
		return $('div.onboarding-d-actions');
	}

	private _addActionButton(parent: HTMLElement, icon: ThemeIcon, label: string): HTMLButtonElement {
		const btn = append(parent, $<HTMLButtonElement>('button.onboarding-d-action-btn'));
		btn.type = 'button';
		btn.appendChild(renderIcon(icon));
		const labelSpan = append(btn, $('span'));
		labelSpan.textContent = label;
		return btn;
	}

	private _addSuccessIndicator(parent: HTMLElement, text: string): void {
		const success = append(parent, $('div.onboarding-d-success'));
		success.appendChild(renderIcon(Codicon.check));
		const label = append(success, $('span'));
		label.textContent = text;
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
				message: localize('onboarding.d.keymap.error', "Could not install {0} keymap. You can install it later from Extensions.", keymap.label),
			});
		}
	}

	override dispose(): void {
		this.container?.remove();
		super.dispose();
	}
}
