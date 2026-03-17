/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsWalkthrough.css';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
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

export type WalkthroughOutcome = 'completed' | 'dismissed' | 'startTour';

/**
 * Multi-step onboarding walkthrough overlay:
 *   Step 1 - Sign in
 *   Step 2 - Import from VS Code
 *   Step 3 - Ready / Start Tour
 */
export class SessionsWalkthroughOverlay extends Disposable {

	private readonly overlay: HTMLElement;
	private readonly card: HTMLElement;
	private readonly dotsContainer: HTMLElement;
	private readonly contentContainer: HTMLElement;
	private readonly footerContainer: HTMLElement;
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
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.overlay = append(container, $('.sessions-walkthrough-overlay'));
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', localize('walkthrough.aria', "Sessions onboarding walkthrough"));
		this._register(toDisposable(() => this.overlay.remove()));

		this.card = append(this.overlay, $('.sessions-walkthrough-card'));

		// Progress dots (top)
		this.dotsContainer = append(this.card, $('.sessions-walkthrough-dots'));

		// Scrollable content area (middle)
		this.contentContainer = append(this.card, $('.sessions-walkthrough-content'));

		// Fixed footer (bottom)
		this.footerContainer = append(this.card, $('.sessions-walkthrough-footer'));

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
	// Step rendering

	private _renderStep(): void {
		this._renderDots();

		// Clear content and footer
		this.contentContainer.textContent = '';
		this.footerContainer.textContent = '';

		switch (this.currentStep) {
			case 0: this._renderSignIn(); break;
			case 1: this._renderImportSettings(); break;
			case 2: this._renderFeatures(); break;
		}
	}

	/** Renders the fixed footer with consistent button layout across all steps. */
	private _renderFooter(
		primaryLabel: string,
		onPrimary: () => void,
		options?: { secondaryLabel?: string; onSecondary?: () => void; showBack?: boolean },
	): void {
		const row = append(this.footerContainer, $('.sessions-walkthrough-button-row'));

		// Back button (left side) — secondary styled, only on steps > 0
		if (options?.showBack && this.currentStep > 0) {
			const backBtn = this._register(new Button(row, { ...defaultButtonStyles, secondary: true }));
			backBtn.label = localize('walkthrough.back', "Back");
			this._register(backBtn.onDidClick(() => {
				this.currentStep--;
				this._renderStep();
			}));
		}

		// Primary button (right side)
		const primaryBtn = this._register(new Button(row, { ...defaultButtonStyles }));
		primaryBtn.label = primaryLabel;
		primaryBtn.focus();
		this._register(primaryBtn.onDidClick(onPrimary));

		// Skip link (below the button row, if provided)
		if (options?.secondaryLabel && options.onSecondary) {
			const skipLink = append(this.footerContainer, $('button.sessions-walkthrough-skip', undefined, options.secondaryLabel));
			this._register(addDisposableListener(skipLink, EventType.CLICK, e => {
				EventHelper.stop(e);
				options.onSecondary!();
			}));
		}
	}

	// ------------------------------------------------------------------
	// Step 1: Sign In

	private _renderSignIn(): void {
		const header = append(this.contentContainer, $('.sessions-walkthrough-header'));
		const iconEl = append(header, $('span.sessions-walkthrough-icon'));
		iconEl.appendChild(renderIcon(Codicon.agent));
		append(header, $('h2', undefined, localize('walkthrough.step1.title', "Welcome to Sessions")));
		append(header, $('p', undefined, localize('walkthrough.step1.subtitle', "Sign in to start building with your AI agent.")));

		// If already signed in, just show a Continue button
		if (this._isAlreadySetUp()) {
			this._renderFooter(
				localize('walkthrough.step1.continue', "Continue"),
				() => this._advance(),
			);
			return;
		}

		// Sign-in provider buttons rendered directly in content
		const providers = append(this.contentContainer, $('.sessions-walkthrough-providers'));

		const providerData: Array<{ label: string; cssClass: string }> = [
			{ label: localize('walkthrough.signin.github', "Continue with GitHub"), cssClass: 'provider-github' },
			{ label: localize('walkthrough.signin.microsoft', "Continue with Microsoft"), cssClass: 'provider-microsoft' },
			{ label: localize('walkthrough.signin.apple', "Continue with Apple"), cssClass: 'provider-apple' },
		];

		const providerButtons: HTMLButtonElement[] = [];
		for (const provider of providerData) {
			const btn = append(providers, $(`button.sessions-walkthrough-provider-btn.${provider.cssClass}`)) as HTMLButtonElement;
			providerButtons.push(btn);
			append(btn, $('span.sessions-walkthrough-provider-label', undefined, provider.label));
		}

		// Spinner + error below providers
		const spinnerContainer = append(this.footerContainer, $('.sessions-walkthrough-spinner'));
		spinnerContainer.style.display = 'none';
		const errorContainer = append(this.footerContainer, $('p.sessions-walkthrough-error'));
		errorContainer.style.display = 'none';

		for (const btn of providerButtons) {
			this._register(addDisposableListener(btn, EventType.CLICK, () => this._runSignIn(providerButtons, spinnerContainer, errorContainer)));
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

	private async _runSignIn(providerButtons: HTMLButtonElement[], spinner: HTMLElement, error: HTMLElement): Promise<void> {
		// Disable all provider buttons
		for (const btn of providerButtons) {
			btn.disabled = true;
		}

		error.style.display = 'none';

		spinner.textContent = '';
		spinner.appendChild(renderIcon(Codicon.loading));
		append(spinner, $('span', undefined, localize('walkthrough.settingUp', "Setting up\u2026")));
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
				append(spinner, $('span', undefined, localize('walkthrough.restarting', "Completing setup\u2026")));

				this.logService.info('[sessions walkthrough] Restarting extension host after setup');
				const stopped = await this.extensionService.stopExtensionHosts(
					localize('walkthrough.restart', "Completing sessions setup")
				);
				if (stopped) {
					await this.extensionService.startExtensionHosts();
				}
				this._advance();
			} else {
				for (const btn of providerButtons) {
					btn.disabled = false;
				}
				spinner.style.display = 'none';
			}
		} catch (err) {
			this.logService.error('[sessions walkthrough] Sign-in failed:', err);
			error.textContent = localize('walkthrough.error', "Something went wrong. Please try again.");
			error.style.display = '';
			for (const btn of providerButtons) {
				btn.disabled = false;
			}
			spinner.style.display = 'none';
		}
	}

	// ------------------------------------------------------------------
	// Step 2: Import from VS Code

	private _renderImportSettings(): void {
		const header = append(this.contentContainer, $('.sessions-walkthrough-header'));
		append(header, $('h2', undefined, localize('walkthrough.import.title', "Import from VS Code")));
		append(header, $('p', undefined, localize('walkthrough.import.subtitle', "Bring over your existing setup so Sessions feels familiar.")));

		const items = append(this.contentContainer, $('.sessions-walkthrough-import-list'));

		const importOptions: Array<{ icon: typeof Codicon.colorMode; label: string; desc: string; checked: boolean }> = [
			{
				icon: Codicon.colorMode,
				label: localize('import.theme', "Color Theme"),
				desc: localize('import.theme.desc', "Your current VS Code color theme"),
				checked: true,
			},
			{
				icon: Codicon.notebook,
				label: localize('import.instructions', "Agent Instructions"),
				desc: localize('import.instructions.desc', "Custom instructions, prompts, and agent configurations"),
				checked: true,
			},
			{
				icon: Codicon.settingsGear,
				label: localize('import.settings', "Editor Settings"),
				desc: localize('import.settings.desc', "Font size, tab width, key bindings, and other preferences"),
				checked: true,
			},
			{
				icon: Codicon.extensions,
				label: localize('import.extensions', "Extensions"),
				desc: localize('import.extensions.desc', "Language support, linters, and other installed extensions"),
				checked: false,
			},
		];

		for (const opt of importOptions) {
			const row = append(items, $('.sessions-walkthrough-import-item'));
			if (opt.checked) {
				row.classList.add('selected');
			}

			const check = append(row, $('span.sessions-walkthrough-import-check'));
			check.appendChild(renderIcon(Codicon.check));

			const iconEl = append(row, $('span.sessions-walkthrough-import-icon'));
			iconEl.appendChild(renderIcon(opt.icon));

			const text = append(row, $('.sessions-walkthrough-import-text'));
			append(text, $('span.sessions-walkthrough-import-label', undefined, opt.label));
			append(text, $('span.sessions-walkthrough-import-desc', undefined, opt.desc));

			// Clicking the row toggles selection
			this._register(addDisposableListener(row, EventType.CLICK, () => {
				row.classList.toggle('selected');
			}));
		}

		// Disclaimer
		const disclaimer = append(this.contentContainer, $('p.sessions-walkthrough-disclaimer'));
		disclaimer.textContent = localize('walkthrough.import.disclaimer', "These can be changed or removed at any time from Settings.");

		// Footer
		this._renderFooter(
			localize('walkthrough.import.cta', "Import Selected"),
			() => {
				this.logService.info('[sessions walkthrough] Import selected (not yet implemented)');
				this._advance();
			},
			{
				showBack: true,
				secondaryLabel: localize('walkthrough.import.skip', "Skip"),
				onSecondary: () => this._advance(),
			},
		);
	}

	// ------------------------------------------------------------------
	// Step 3: Ready / Start Tour

	private _renderFeatures(): void {
		const header = append(this.contentContainer, $('.sessions-walkthrough-header'));
		append(header, $('h2', undefined, localize('walkthrough.step3.title', "You're Ready")));
		append(header, $('p', undefined, localize('walkthrough.step3.subtitle', "Here's what you can do with Sessions.")));

		const features = append(this.contentContainer, $('.sessions-walkthrough-features'));

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

		this._renderFooter(
			localize('walkthrough.step3.startTour', "Take the Tour"),
			() => this._finish('startTour'),
			{
				showBack: true,
				secondaryLabel: localize('walkthrough.step3.close', "Skip Tour"),
				onSecondary: () => this._finish('completed'),
			},
		);
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
