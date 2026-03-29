/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/welcomeOverlay.css';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { $, append } from '../../../../base/browser/dom.js';
import { autorun } from '../../../../base/common/observable.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { localize, localize2 } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from '../../../../workbench/contrib/chat/browser/actions/chatActions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { isWeb } from '../../../../base/common/platform.js';

const WELCOME_COMPLETE_KEY = 'workbench.agentsession.welcomeComplete';

class SessionsWelcomeOverlay extends Disposable {

	private readonly overlay: HTMLElement;
	private readonly _onDidComplete = this._register(new Emitter<void>());
	readonly onDidComplete = this._onDidComplete.event;

	constructor(
		container: HTMLElement,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILogService private readonly logService: ILogService,
		@IAuthenticationService _authenticationService: IAuthenticationService,
	) {
		super();

		this.overlay = append(container, $('.sessions-welcome-overlay'));
		this.overlay.setAttribute('role', 'dialog');
		this.overlay.setAttribute('aria-modal', 'true');
		this.overlay.setAttribute('aria-label', localize('welcomeOverlay.aria', "Sign in to use Sessions"));
		this._register(toDisposable(() => this.overlay.remove()));

		const card = append(this.overlay, $('.sessions-welcome-card'));

		// Header — large icon + title, centered
		const header = append(card, $('.sessions-welcome-header'));
		const iconEl = append(header, $('span.sessions-welcome-icon'));
		iconEl.appendChild(renderIcon(Codicon.agent));
		append(header, $('h2', undefined, localize('welcomeTitle', "Sign in to use Sessions")));
		append(header, $('p.sessions-welcome-subtitle', undefined, localize('welcomeSubtitle', "Agent-powered development")));

		// Action area
		const actionArea = append(card, $('.sessions-welcome-action-area'));
		const actionButton = this._register(new Button(actionArea, { ...defaultButtonStyles }));
		actionButton.label = localize('sessions.getStarted', "Get Started");

		// Device code UI — hidden initially
		const deviceCodeContainer = append(card, $('.sessions-welcome-device-code'));
		deviceCodeContainer.style.display = 'none';

		const spinnerContainer = append(actionArea, $('.sessions-welcome-spinner'));
		spinnerContainer.style.display = 'none';

		const errorContainer = append(actionArea, $('p.sessions-welcome-error'));
		errorContainer.style.display = 'none';

		this._register(actionButton.onDidClick(() => this._runSetup(actionButton, spinnerContainer, errorContainer, deviceCodeContainer)));

		// Focus the button so the overlay traps keyboard input
		actionButton.focus();
	}

	private async _runSetup(button: Button, spinner: HTMLElement, error: HTMLElement, deviceCodeContainer: HTMLElement): Promise<void> {
		button.enabled = false;
		error.style.display = 'none';

		spinner.textContent = '';
		spinner.appendChild(renderIcon(Codicon.loading));
		append(spinner, $('span', undefined, localize('sessions.settingUp', "Setting up…")));
		spinner.style.display = '';

		try {
			let success: boolean | undefined;

			if (isWeb) {
				// On web, use GitHub Device Code flow via sessions auth proxy.
				// This avoids needing a client_secret which may be stale in dev.
				try {
					// Step 1: Request a device code
					const codeResp = await fetch('/sessions/api/auth/device/code', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ scope: 'user:email' })
					});
					if (!codeResp.ok) {
						throw new Error(`Device code request failed: ${codeResp.status}`);
					}
					const codeData = await codeResp.json() as {
						device_code: string;
						user_code: string;
						verification_uri: string;
						interval: number;
						expires_in: number;
					};

					// Step 2: Show the user code and open GitHub verification URL
					button.element.style.display = 'none';
					spinner.style.display = 'none';
					deviceCodeContainer.textContent = '';
					deviceCodeContainer.style.display = '';

					const instruction = append(deviceCodeContainer, $('p', undefined,
						localize('sessions.deviceCode.instruction', "Enter this code on GitHub:")
					));
					instruction.style.marginBottom = '8px';

					const codeDisplay = append(deviceCodeContainer, $('code.sessions-welcome-user-code'));
					codeDisplay.textContent = codeData.user_code;
					codeDisplay.style.cssText = 'font-size: 24px; font-weight: bold; letter-spacing: 4px; display: block; text-align: center; padding: 12px; margin: 8px 0; user-select: all; cursor: pointer;';

					// Copy to clipboard on click
					codeDisplay.addEventListener('click', () => {
						navigator.clipboard?.writeText(codeData.user_code);
					});

					const linkButton = this._register(new Button(deviceCodeContainer, { ...defaultButtonStyles }));
					linkButton.label = localize('sessions.deviceCode.openGithub', "Open GitHub");
					this._register(linkButton.onDidClick(() => {
						globalThis.open(codeData.verification_uri, '_blank');
					}));

					const waitingMsg = append(deviceCodeContainer, $('p.sessions-welcome-waiting'));
					waitingMsg.style.cssText = 'margin-top: 12px; opacity: 0.7; text-align: center;';
					waitingMsg.textContent = localize('sessions.deviceCode.waiting', "Waiting for authorization…");

					// Step 3: Poll for token
					const interval = Math.max((codeData.interval || 5) * 1000, 5000);
					const deadline = Date.now() + (codeData.expires_in || 900) * 1000;
					let token: string | undefined;

					while (Date.now() < deadline) {
						await new Promise<void>(r => setTimeout(r, interval));
						const tokenResp = await fetch('/sessions/api/auth/device/token', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ device_code: codeData.device_code })
						});
						const tokenData = await tokenResp.json() as {
							access_token?: string;
							error?: string;
						};

						if (tokenData.access_token) {
							token = tokenData.access_token;
							break;
						}
						if (tokenData.error === 'expired_token' || tokenData.error === 'access_denied') {
							throw new Error(tokenData.error);
						}
						// 'authorization_pending' or 'slow_down' — keep polling
					}

					if (token) {
						// Hide device code UI, show completion spinner
						deviceCodeContainer.style.display = 'none';
						spinner.textContent = '';
						spinner.appendChild(renderIcon(Codicon.loading));
						append(spinner, $('span', undefined, localize('sessions.completing', "Completing setup…")));
						spinner.style.display = '';

						// Store token persistently for host discovery
						globalThis.localStorage.setItem('sessions.github.token', token);
						globalThis.localStorage.setItem('sessions.welcome.done', 'true');
						success = true;
					}
				} catch (e) {
					this.logService.error('[sessions welcome] Device code auth failed:', e);
					throw e;
				}
			} else {
				// On desktop, use the Copilot setup flow
				success = await this.commandService.executeCommand<boolean>(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, {
					dialogIcon: Codicon.agent,
					dialogTitle: this.chatEntitlementService.anonymous ?
						localize('sessions.startUsingSessions', "Start using Sessions") :
						localize('sessions.signinRequired', "Sign in to use Sessions"),
				});
			}

			if (success) {
				if (isWeb) {
					// On web, just dismiss the overlay — no extension host restart needed
					this.logService.info('[sessions welcome] Auth complete on web, dismissing overlay');
					this._onDidComplete.fire();
					this.dismiss();
				} else {
					spinner.textContent = '';
					spinner.appendChild(renderIcon(Codicon.loading));
					append(spinner, $('span', undefined, localize('sessions.restarting', "Completing setup…")));

					this.logService.info('[sessions welcome] Restarting extension host after setup completion');
					const stopped = await this.extensionService.stopExtensionHosts(
						localize('sessionsWelcome.restart', "Completing sessions setup")
					);
					if (stopped) {
						await this.extensionService.startExtensionHosts();
					}
				}
			} else {
				button.enabled = true;
				spinner.style.display = 'none';
			}
		} catch (err) {
			this.logService.error('[sessions welcome] Setup failed:', err);
			error.textContent = localize('sessions.setupError', "Something went wrong. Please try again.");
			error.style.display = '';
			button.enabled = true;
			spinner.style.display = 'none';
		}
	}

	dismiss(): void {
		this.overlay.classList.add('sessions-welcome-overlay-dismissed');
		const handle = setTimeout(() => this.dispose(), 200);
		this._register(toDisposable(() => clearTimeout(handle)));
	}
}

export class SessionsWelcomeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsWelcome';

	private readonly overlayRef = this._register(new MutableDisposable<DisposableStore>());
	private readonly watcherRef = this._register(new MutableDisposable());

	constructor(
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		if (!this.productService.defaultChatAgent?.chatExtensionId) {
			return;
		}

		// On web, skip the welcome overlay if we've already completed OAuth
		// (the device code flow stores a marker in localStorage)
		if (isWeb && typeof globalThis.localStorage !== 'undefined') {
			const welcomeDone = globalThis.localStorage.getItem('sessions.welcome.done');
			if (welcomeDone === 'true') {
				return;
			}
		}

		// Allow automated tests to skip the welcome overlay entirely.
		// Desktop: --skip-sessions-welcome CLI flag
		// Web: ?skip-sessions-welcome query parameter
		const envArgs = (this.environmentService as IWorkbenchEnvironmentService & { args?: Record<string, unknown> }).args;
		if (envArgs?.['skip-sessions-welcome']) {
			return;
		}
		if (typeof globalThis.location !== 'undefined' && new URLSearchParams(globalThis.location.search).has('skip-sessions-welcome')) {
			return;
		}

		const isFirstLaunch = !this.storageService.getBoolean(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION, false);
		if (isFirstLaunch) {
			this.showOverlay();
		} else {
			this.showOverlayIfNeeded();
		}
	}

	private showOverlayIfNeeded(): void {
		if (this._needsChatSetup()) {
			this.showOverlay();
		} else {
			this.watchEntitlementState();
		}
	}

	/**
	 * Watches entitlement and sentiment observables after setup has already
	 * completed. If the user's state changes such that setup is needed again
	 * (e.g. extension uninstalled/disabled), shows the welcome overlay.
	 *
	 * {@link ChatEntitlement.Unknown} is intentionally ignored here: it is
	 * almost always a transient state caused by a stale OAuth token being
	 * refreshed after an update. A genuine sign-out will be caught on the
	 * next app launch via the initial {@link showOverlayIfNeeded} check.
	 */
	private watchEntitlementState(): void {
		let setupComplete = !this._needsChatSetup(false);
		this.watcherRef.value = autorun(reader => {
			this.chatEntitlementService.sentimentObs.read(reader);
			this.chatEntitlementService.entitlementObs.read(reader);

			const needsSetup = this._needsChatSetup(false);
			if (setupComplete && needsSetup) {
				this.showOverlay();
			}
			setupComplete = !needsSetup;
		});
	}

	private _needsChatSetup(includeUnknown: boolean = true): boolean {
		const { sentiment, entitlement } = this.chatEntitlementService;
		if (
			!sentiment?.installed ||						// Extension not installed: run setup to install
			sentiment?.disabled ||							// Extension disabled: run setup to enable
			entitlement === ChatEntitlement.Available ||	// Entitlement available: run setup to sign up
			(
				includeUnknown &&
				entitlement === ChatEntitlement.Unknown &&	// Entitlement unknown: run setup to sign in / sign up
				!this.chatEntitlementService.anonymous		// unless anonymous access is enabled
			)
		) {
			return true;
		}

		return false;
	}

	private showOverlay(): void {
		if (this.overlayRef.value) {
			return;
		}

		this.watcherRef.clear();
		this.overlayRef.value = new DisposableStore();

		// Mark the welcome overlay as visible for titlebar disabling
		const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(this.contextKeyService);
		welcomeVisibleKey.set(true);
		this.overlayRef.value.add(toDisposable(() => welcomeVisibleKey.reset()));

		const overlay = this.overlayRef.value.add(this.instantiationService.createInstance(
			SessionsWelcomeOverlay,
			this.layoutService.mainContainer,
		));

		// On web, the overlay fires onDidComplete when device code auth finishes
		if (isWeb) {
			this.overlayRef.value.add(overlay.onDidComplete(() => {
				this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				this.overlayRef.clear();
			}));
		}

		// When setup completes (observables flip), dismiss and watch again
		this.overlayRef.value.add(autorun(reader => {
			this.chatEntitlementService.sentimentObs.read(reader);
			this.chatEntitlementService.entitlementObs.read(reader);

			if (!this._needsChatSetup()) {
				this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				overlay.dismiss();
				this.overlayRef.clear();
				this.watchEntitlementState();
			}
		}));
	}
}

registerWorkbenchContribution2(SessionsWelcomeContribution.ID, SessionsWelcomeContribution, WorkbenchPhase.BlockRestore);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.resetSessionsWelcome',
			title: localize2('resetSessionsWelcome', "Reset Sessions Welcome"),
			category: Categories.Developer,
			f1: true,
		});
	}
	run(accessor: ServicesAccessor): void {
		const storageService = accessor.get(IStorageService);
		storageService.remove(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION);
	}
});
