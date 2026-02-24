/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { localize2 } from '../../../../nls.js';
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

	constructor(
		@ISessionsWelcomeService private readonly welcomeService: ISessionsWelcomeService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IStorageService private readonly storageService: IStorageService,
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
		stepStore.add(signInStep.disposable);
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
			return;
		}

		this.showOverlay();
	}

	private showOverlay(): void {
		const overlay = this.instantiationService.createInstance(
			SessionsWelcomeOverlay,
			this.layoutService.mainContainer,
		);
		this._register(overlay);

		// Mark welcome as complete once the overlay is dismissed (all steps satisfied)
		overlay.onDidDismiss(() => {
			this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		});
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
