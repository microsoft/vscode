/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/welcomeOverlay.css';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
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

const WELCOME_COMPLETE_KEY = 'workbench.agentsession.welcomeComplete';

class SessionsWelcomeOverlay extends Disposable {

	private readonly overlay: HTMLElement;

	constructor(
		container: HTMLElement,
		@IChatEntitlementService private readonly chatEntitlementService: ChatEntitlementService,
		@ICommandService private readonly commandService: ICommandService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILogService private readonly logService: ILogService,
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

		const spinnerContainer = append(actionArea, $('.sessions-welcome-spinner'));
		spinnerContainer.style.display = 'none';

		const errorContainer = append(actionArea, $('p.sessions-welcome-error'));
		errorContainer.style.display = 'none';

		this._register(actionButton.onDidClick(() => this._runSetup(actionButton, spinnerContainer, errorContainer)));

		// Focus the button so the overlay traps keyboard input
		actionButton.focus();
	}

	private async _runSetup(button: Button, spinner: HTMLElement, error: HTMLElement): Promise<void> {
		button.enabled = false;
		error.style.display = 'none';

		spinner.textContent = '';
		spinner.appendChild(renderIcon(Codicon.loading));
		append(spinner, $('span', undefined, localize('sessions.settingUp', "Setting up…")));
		spinner.style.display = '';

		try {
			const success = await this.commandService.executeCommand<boolean>(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID, {
				dialogIcon: Codicon.agent,
				dialogTitle: this.chatEntitlementService.anonymous ?
					localize('sessions.startUsingSessions', "Start using Sessions") :
					localize('sessions.signinRequired', "Sign in to use Sessions"),
				dialogHideSkip: true
			});

			if (success) {
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

class SessionsWelcomeContribution extends Disposable implements IWorkbenchContribution {

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
	) {
		super();

		if (!this.productService.defaultChatAgent?.chatExtensionId) {
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
			this.watchForRegressions();
		}
	}

	private watchForRegressions(): void {
		let wasComplete = !this._needsChatSetup();
		this.watcherRef.value = autorun(reader => {
			this.chatEntitlementService.sentimentObs.read(reader);
			this.chatEntitlementService.entitlementObs.read(reader);

			const needsSetup = this._needsChatSetup();
			if (wasComplete && needsSetup) {
				this.showOverlay();
			}
			wasComplete = !needsSetup;
		});
	}

	private _needsChatSetup(): boolean {
		const { sentiment, entitlement } = this.chatEntitlementService;
		if (
			!sentiment?.installed ||						// Extension not installed: run setup to install
			sentiment?.disabled ||							// Extension disabled: run setup to enable
			entitlement === ChatEntitlement.Available ||	// Entitlement available: run setup to sign up
			(
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

		// When setup completes (observables flip), dismiss and watch again
		this.overlayRef.value.add(autorun(reader => {
			this.chatEntitlementService.sentimentObs.read(reader);
			this.chatEntitlementService.entitlementObs.read(reader);

			if (!this._needsChatSetup()) {
				this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				overlay.dismiss();
				this.overlayRef.clear();
				this.watchForRegressions();
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
