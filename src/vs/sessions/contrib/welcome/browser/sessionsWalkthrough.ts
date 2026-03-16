/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsWalkthrough.css';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { $, append, EventHelper, EventType, addDisposableListener } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IWorkbenchThemeService, ThemeSettingTarget } from '../../../../workbench/services/themes/common/workbenchThemeService.js';
import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';

const DARK_THEME_ID = 'VS Code Dark';
const LIGHT_THEME_ID = 'VS Code Light';
const SYSTEM_THEME_ID = 'auto';

export type WalkthroughOutcome = 'completed' | 'dismissed' | 'startTour';

/**
 * Multi-step onboarding walkthrough overlay:
 *   Step 1 – Sign in
 *   Step 2 – Pick a theme
 *   Step 3 – Explore features / Start Tour
 */
export class SessionsWalkthroughOverlay extends Disposable {

	private readonly overlay: HTMLElement;
	private readonly card: HTMLElement;
	private readonly dotsContainer: HTMLElement;
	private currentStep = 0;
	private readonly totalSteps = 3;
	private _resolveOutcome!: (outcome: WalkthroughOutcome) => void;

	/** Resolves when the user completes or dismisses the walkthrough. */
	readonly outcome: Promise<WalkthroughOutcome> = new Promise(resolve => { this._resolveOutcome = resolve; });

	constructor(
		container: HTMLElement,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.overlay = append(container, $('.sessions-walkthrough-overlay'));
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', localize('walkthrough.aria', "Sessions onboarding walkthrough"));
		this._register(toDisposable(() => this.overlay.remove()));

		this.card = append(this.overlay, $('.sessions-walkthrough-card'));

		// Progress dots
		this.dotsContainer = append(this.card, $('.sessions-walkthrough-dots'));
		this._renderDots();

		// Render initial step
		this._renderStep();
	}

	// ------------------------------------------------------------------
	// Dots

	private _renderDots(): void {
		this.dotsContainer.textContent = '';
		for (let i = 0; i < this.totalSteps; i++) {
			const dot = append(this.dotsContainer, $('span.sessions-walkthrough-dot'));
			if (i === this.currentStep) {
				dot.classList.add('active');
			}
		}
	}

	// ------------------------------------------------------------------
	// Step rendering (clears and re-renders the card body)

	private _renderStep(): void {
		// Remove everything after the dots row
		const nodes = Array.from(this.card.childNodes);
		for (const node of nodes) {
			if (node !== this.dotsContainer) {
				this.card.removeChild(node);
			}
		}
		this._renderDots();

		switch (this.currentStep) {
			case 0: return this._renderSignIn();
			case 1: return this._renderThemePicker();
			case 2: return this._renderFeatures();
		}
	}

	// ------------------------------------------------------------------
	// Step 1: Sign In

	private _renderSignIn(): void {
		const header = append(this.card, $('.sessions-walkthrough-header'));
		const iconEl = append(header, $('span.sessions-walkthrough-icon'));
		iconEl.appendChild(renderIcon(Codicon.agent));
		append(header, $('h2', undefined, localize('walkthrough.step1.title', "Welcome to Sessions")));
		append(header, $('p', undefined, localize('walkthrough.step1.subtitle', "Agent-powered development at your fingertips. Sign in to get started.")));

		const actionArea = append(this.card, $('.sessions-walkthrough-actions'));
		const button = this._register(new Button(actionArea, { ...defaultButtonStyles }));
		button.label = localize('walkthrough.step1.cta', "Get Started");

		const spinnerContainer = append(actionArea, $('.sessions-walkthrough-spinner'));
		spinnerContainer.style.display = 'none';
		const errorContainer = append(actionArea, $('p.sessions-walkthrough-error'));
		errorContainer.style.display = 'none';

		this._register(button.onDidClick(() => this._runSignIn(button, spinnerContainer, errorContainer)));

		// Already signed in → skip to step 2
		if (this._isAlreadySetUp()) {
			this._advance();
			return;
		}

		button.focus();
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

	private async _runSignIn(button: Button, spinner: HTMLElement, error: HTMLElement): Promise<void> {
		button.enabled = false;
		error.style.display = 'none';

		spinner.textContent = '';
		spinner.appendChild(renderIcon(Codicon.loading));
		append(spinner, $('span', undefined, localize('walkthrough.settingUp', "Setting up…")));
		spinner.style.display = '';

		try {
			const success = await this.commandService.executeCommand<boolean>(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, {
				dialogIcon: Codicon.agent,
				dialogTitle: this.chatEntitlementService.anonymous
					? localize('walkthrough.startUsing', "Start using Sessions")
					: localize('walkthrough.signinRequired', "Sign in to use Sessions"),
				dialogHideSkip: true
			});

			if (success) {
				spinner.textContent = '';
				spinner.appendChild(renderIcon(Codicon.loading));
				append(spinner, $('span', undefined, localize('walkthrough.restarting', "Completing setup…")));

				this.logService.info('[sessions walkthrough] Restarting extension host after setup');
				const stopped = await this.extensionService.stopExtensionHosts(
					localize('walkthrough.restart', "Completing sessions setup")
				);
				if (stopped) {
					await this.extensionService.startExtensionHosts();
				}
				this._advance();
			} else {
				button.enabled = true;
				spinner.style.display = 'none';
			}
		} catch (err) {
			this.logService.error('[sessions walkthrough] Sign-in failed:', err);
			error.textContent = localize('walkthrough.error', "Something went wrong. Please try again.");
			error.style.display = '';
			button.enabled = true;
			spinner.style.display = 'none';
		}
	}

	// ------------------------------------------------------------------
	// Step 2: Theme Picker

	private _selectedTheme: string | null = null;
	private readonly _stepStore = this._register(new DisposableStore());

	private _renderThemePicker(): void {
		this._stepStore.clear();

		const header = append(this.card, $('.sessions-walkthrough-header'));
		append(header, $('h2', undefined, localize('walkthrough.step2.title', "Choose your style")));
		append(header, $('p', undefined, localize('walkthrough.step2.subtitle', "Pick a theme for Sessions. You can always change it later.")));

		const currentThemeId = this.themeService.getColorTheme().settingsId ?? '';

		const picker = append(this.card, $('.sessions-walkthrough-theme-picker'));
		const themes: Array<{ id: string; label: string; dataTheme: string }> = [
			{ id: DARK_THEME_ID, label: localize('theme.dark', "Dark"), dataTheme: 'dark' },
			{ id: LIGHT_THEME_ID, label: localize('theme.light', "Light"), dataTheme: 'light' },
			{ id: SYSTEM_THEME_ID, label: localize('theme.system', "System"), dataTheme: 'system' },
		];

		// Determine which tile should be initially selected
		let initialSelected = DARK_THEME_ID;
		if (currentThemeId.toLowerCase().includes('light')) {
			initialSelected = LIGHT_THEME_ID;
		}
		this._selectedTheme = initialSelected;

		for (const theme of themes) {
			const tile = append(picker, $('.sessions-walkthrough-theme-tile'));
			tile.dataset['theme'] = theme.dataTheme;
			if (theme.id === initialSelected) {
				tile.classList.add('selected');
			}

			// Mini swatch
			const swatch = append(tile, $('.sessions-walkthrough-theme-swatch'));
			append(swatch, $('.swatch-titlebar'));
			const swatchBody = append(swatch, $('div'));
			swatchBody.style.display = 'flex';
			swatchBody.style.height = '100%';
			append(swatchBody, $('.swatch-sidebar'));
			append(swatchBody, $('.swatch-content'));

			append(tile, $('span.sessions-walkthrough-theme-label', undefined, theme.label));

			this._stepStore.add(addDisposableListener(tile, EventType.CLICK, async () => {
				// Deselect all tiles
				for (const t of picker.querySelectorAll('.sessions-walkthrough-theme-tile')) {
					t.classList.remove('selected');
				}
				tile.classList.add('selected');
				this._selectedTheme = theme.id;

				if (theme.id === SYSTEM_THEME_ID) {
					// Use auto-detect
					await this.themeService.setColorTheme(undefined, 'auto' as ThemeSettingTarget);
				} else {
					await this.themeService.setColorTheme(theme.id, 'preview' as ThemeSettingTarget);
				}
			}));
		}

		const actionArea = append(this.card, $('.sessions-walkthrough-actions'));
		const button = this._register(new Button(actionArea, { ...defaultButtonStyles }));
		button.label = localize('walkthrough.step2.cta', "Continue");
		button.focus();

		this._stepStore.add(button.onDidClick(async () => {
			// Persist the previewed theme
			if (this._selectedTheme && this._selectedTheme !== SYSTEM_THEME_ID) {
				await this.themeService.setColorTheme(this._selectedTheme, ConfigurationTarget.USER);
			}
			this._advance();
		}));
	}

	// ------------------------------------------------------------------
	// Step 3: Features + Tour/Close

	private _renderFeatures(): void {
		const header = append(this.card, $('.sessions-walkthrough-header'));
		append(header, $('h2', undefined, localize('walkthrough.step3.title', "You're ready to build")));
		append(header, $('p', undefined, localize('walkthrough.step3.subtitle', "Here's what you can do with Sessions.")));

		const features = append(this.card, $('.sessions-walkthrough-features'));

		const featureData: Array<{ icon: typeof Codicon.commentDiscussion; title: string; desc: string }> = [
			{
				icon: Codicon.commentDiscussion,
				title: localize('feature.chat.title', "Chat with your AI agent"),
				desc: localize('feature.chat.desc', "Ask questions, generate code, run tasks, and fix bugs — all through natural language."),
			},
			{
				icon: Codicon.history,
				title: localize('feature.sessions.title', "Manage multiple sessions"),
				desc: localize('feature.sessions.desc', "Switch between parallel workstreams. Each session has its own isolated context."),
			},
			{
				icon: Codicon.gitPullRequest,
				title: localize('feature.changes.title', "Review and apply changes"),
				desc: localize('feature.changes.desc', "See every file the agent touches. Approve or discard changes before they land."),
			},
		];

		for (const f of featureData) {
			const item = append(features, $('.sessions-walkthrough-feature'));
			const iconEl = append(item, $('span.sessions-walkthrough-feature-icon'));
			iconEl.appendChild(renderIcon(f.icon));
			const text = append(item, $('.sessions-walkthrough-feature-text'));
			append(text, $('h4', undefined, f.title));
			append(text, $('p', undefined, f.desc));
		}

		const actionArea = append(this.card, $('.sessions-walkthrough-actions'));
		const tourButton = this._register(new Button(actionArea, { ...defaultButtonStyles }));
		tourButton.label = localize('walkthrough.step3.startTour', "Start Tour");
		tourButton.focus();

		this._register(tourButton.onDidClick(() => this._finish('startTour')));

		const closeLink = append(actionArea, $('button.sessions-walkthrough-link', undefined, localize('walkthrough.step3.close', "Close")));
		this._register(addDisposableListener(closeLink, EventType.CLICK, e => {
			EventHelper.stop(e);
			this._finish('completed');
		}));
	}

	// ------------------------------------------------------------------
	// Navigation helpers

	private _advance(): void {
		this.currentStep++;
		if (this.currentStep >= this.totalSteps) {
			this._finish('completed');
		} else {
			this._renderStep();
		}
	}

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
