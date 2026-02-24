/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { autorun } from '../../../../base/common/observable.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ISessionsWelcomeService } from '../common/sessionsWelcomeService.js';
import { SessionsWelcomeService } from './sessionsWelcomeService.js';
import { SessionsWelcomeOverlay } from './sessionsWelcomeOverlay.js';
import { CopilotChatInstallStep } from './steps/copilotChatInstallStep.js';
import { GitHubSignInStep } from './steps/gitHubSignInStep.js';
import { SessionsWelcomeCompleteContext } from '../../../common/contextkeys.js';

const WELCOME_COMPLETE_KEY = 'workbench.agentsession.welcomeComplete';

// Register the service
registerSingleton(ISessionsWelcomeService, SessionsWelcomeService, InstantiationType.Eager);

class SessionsWelcomeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsWelcome';

	private readonly overlayRef = this._register(new MutableDisposable<DisposableStore>());
	private readonly watcherRef = this._register(new MutableDisposable());

	constructor(
		@ISessionsWelcomeService private readonly welcomeService: ISessionsWelcomeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Bind context key to the observable
		this._register(bindContextKey(
			SessionsWelcomeCompleteContext,
			this.contextKeyService,
			reader => this.welcomeService.isComplete.read(reader),
		));

		// Only proceed if the product is configured with a default chat agent
		if (!this.productService.defaultChatAgent?.chatExtensionId) {
			return;
		}

		const isFirstLaunch = !this.storageService.getBoolean(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION, false);

		this.registerSteps();
		this.welcomeService.initialize();

		if (isFirstLaunch) {
			// First launch: show the welcome overlay immediately
			this.showOverlay();
		} else {
			// Returning user: only show if Copilot Chat is not installed
			this.showOverlayIfNeededAfterInit();
		}
	}

	private registerSteps(): void {
		const stepStore = this._register(new DisposableStore());

		// Step 1: Install Copilot Chat extension
		const copilotStep = this.instantiationService.createInstance(CopilotChatInstallStep);
		stepStore.add(this.welcomeService.registerStep(copilotStep));

		// Step 2: Sign in with GitHub
		const signInStep = this.instantiationService.createInstance(GitHubSignInStep);
		stepStore.add(signInStep);
		stepStore.add(this.welcomeService.registerStep(signInStep));
	}

	private async showOverlayIfNeededAfterInit(): Promise<void> {
		// Wait for extension host to know what's installed
		await this.welcomeService.whenInitialized;

		// For returning users, only the Copilot Chat install state is a
		// reliable trigger. Auth session restore races at startup, so we
		// don't re-show the overlay just because sign-in hasn't resolved.
		// If everything is already satisfied, skip.
		if (this.welcomeService.isComplete.get()) {
			this.watchForSignOutOrTokenExpiry();
			return;
		}

		this.showOverlay();
	}

	/**
	 * After the welcome flow has been completed once, watch for sign-out
	 * or token expiry and re-show the overlay when that happens.
	 */
	private watchForSignOutOrTokenExpiry(): void {
		let wasComplete = this.welcomeService.isComplete.get();
		this.watcherRef.value = autorun(reader => {
			const isComplete = this.welcomeService.isComplete.read(reader);
			if (wasComplete && !isComplete) {
				this.showOverlay();
			}
			wasComplete = isComplete;
		});
	}

	private showOverlay(): void {
		if (this.overlayRef.value) {
			return; // overlay already shown
		}

		this.overlayRef.value = new DisposableStore();

		const overlay = this.overlayRef.value.add(this.instantiationService.createInstance(
			SessionsWelcomeOverlay,
			this.layoutService.mainContainer,
		));

		// When all steps are satisfied, restart the extension host (so the
		// chat extension picks up the auth session cleanly) then dismiss.
		this.overlayRef.value.add(overlay.onDidDismiss(() => {
			this.overlayRef.clear();
			this.watchForSignOutOrTokenExpiry();
		}));

		this.overlayRef.value.add(autorun(reader => {
			const isComplete = this.welcomeService.isComplete.read(reader);
			if (!isComplete) {
				return;
			}

			this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			this.restartExtensionHostThenDismiss(overlay);
		}));
	}

	/**
	 * After the welcome flow completes (extension installed + user signed in),
	 * restart the extension host so the chat extension picks up the new auth
	 * session cleanly, then dismiss the overlay. The overlay stays visible
	 * during the restart so the user doesn't see a broken intermediate state.
	 */
	private async restartExtensionHostThenDismiss(overlay: SessionsWelcomeOverlay): Promise<void> {
		this.logService.info('[sessions welcome] Restarting extension host after welcome completion');
		const stopped = await this.extensionService.stopExtensionHosts(
			localize('sessionsWelcome.restart', "Completing sessions setup")
		);
		if (stopped) {
			await this.extensionService.startExtensionHosts();
		}
		overlay.dismiss();
	}
}

registerWorkbenchContribution2(SessionsWelcomeContribution.ID, SessionsWelcomeContribution, WorkbenchPhase.BlockRestore);

// Debug command to reset welcome state so the overlay shows again on next launch
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
