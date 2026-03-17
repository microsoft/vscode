/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize2 } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ChatEntitlement, ChatEntitlementService, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { SessionsWalkthroughOverlay } from './sessionsWalkthrough.js';
import { SessionsTourOverlay } from './sessionsTour.js';

const WELCOME_COMPLETE_KEY = 'workbench.agentsession.welcomeComplete';
const TOUR_COMPLETE_KEY = 'workbench.agentsession.tourComplete';

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
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		if (!this.productService.defaultChatAgent?.chatExtensionId) {
			return;
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
			this.showWalkthrough();
		} else {
			this.showWalkthroughIfNeeded();
		}
	}

	private showWalkthroughIfNeeded(): void {
		if (this._needsChatSetup()) {
			this.showWalkthrough();
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
				this.showWalkthrough();
			}
			wasComplete = !needsSetup;
		});
	}

	private _needsChatSetup(): boolean {
		const { sentiment, entitlement } = this.chatEntitlementService;
		if (
			!sentiment?.installed ||                            // Extension not installed: run setup to install
			sentiment?.disabled ||                              // Extension disabled: run setup to enable
			entitlement === ChatEntitlement.Available ||         // Entitlement available: run setup to sign up
			(
				entitlement === ChatEntitlement.Unknown &&        // Entitlement unknown: sign in / sign up
				!this.chatEntitlementService.anonymous           // unless anonymous access is enabled
			)
		) {
			return true;
		}

		return false;
	}

	private showWalkthrough(): void {
		if (this.overlayRef.value) {
			return;
		}

		this.watcherRef.clear();
		this.overlayRef.value = new DisposableStore();

		// Mark the welcome overlay as visible for titlebar disabling
		const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(this.contextKeyService);
		welcomeVisibleKey.set(true);
		this.overlayRef.value.add(toDisposable(() => welcomeVisibleKey.reset()));

		const walkthrough = this.overlayRef.value.add(this.instantiationService.createInstance(
			SessionsWalkthroughOverlay,
			this.layoutService.mainContainer,
		));

		// When chat setup completes (observables flip), persist completion
		this.overlayRef.value.add(autorun(reader => {
			this.chatEntitlementService.sentimentObs.read(reader);
			this.chatEntitlementService.entitlementObs.read(reader);

			if (!this._needsChatSetup()) {
				this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			}
		}));

		// Handle the walkthrough outcome
		walkthrough.outcome.then(outcome => {
			this.logService.info(`[sessions welcome] Walkthrough finished with outcome: ${outcome}`);
			this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			this.overlayRef.clear();
			this.watchForRegressions();

			if (outcome === 'startTour') {
				this._startTour();
			}
		});
	}

	private _startTour(): void {
		this.logService.info('[sessions welcome] Starting product tour');
		const store = new DisposableStore();
		const tour = store.add(this.instantiationService.createInstance(
			SessionsTourOverlay,
			this.layoutService.mainContainer,
		));

		tour.finished.then(() => {
			this.logService.info('[sessions welcome] Tour finished');
			this.storageService.store(TOUR_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			store.dispose();
		});
	}
}

registerWorkbenchContribution2(SessionsWelcomeContribution.ID, SessionsWelcomeContribution, WorkbenchPhase.BlockRestore);

// Developer: reset walkthrough and immediately re-show it
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.resetSessionsWelcome',
			title: localize2('resetSessionsWelcome', "Reset Sessions Welcome"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyW,
			},
		});
	}
	run(accessor: ServicesAccessor): void {
		const storageService = accessor.get(IStorageService);
		const instantiationService = accessor.get(IInstantiationService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const contextKeyService = accessor.get(IContextKeyService);
		const logService = accessor.get(ILogService);

		// Clear completion markers
		storageService.remove(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION);
		storageService.remove(TOUR_COMPLETE_KEY, StorageScope.APPLICATION);

		// Immediately show the walkthrough overlay
		const store = new DisposableStore();
		const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(contextKeyService);
		welcomeVisibleKey.set(true);
		store.add(toDisposable(() => welcomeVisibleKey.reset()));

		const walkthrough = store.add(instantiationService.createInstance(
			SessionsWalkthroughOverlay,
			layoutService.mainContainer,
		));

		walkthrough.outcome.then(outcome => {
			logService.info(`[sessions welcome] Developer reset walkthrough finished with outcome: ${outcome}`);
			storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			store.dispose();

			if (outcome === 'startTour') {
				const tourStore = new DisposableStore();
				const tour = tourStore.add(instantiationService.createInstance(
					SessionsTourOverlay,
					layoutService.mainContainer,
				));
				tour.finished.then(() => {
					logService.info('[sessions welcome] Tour finished from developer reset');
					storageService.store(TOUR_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
					tourStore.dispose();
				});
			}
		});
	}
});

// Developer: launch the tour directly (e.g. from Command Palette)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.startSessionsTour',
			title: localize2('startSessionsTour', "Start Sessions Tour"),
			category: Categories.Developer,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyT,
			},
		});
	}
	run(accessor: ServicesAccessor): void {
		const instantiationService = accessor.get(IInstantiationService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const storageService = accessor.get(IStorageService);
		const logService = accessor.get(ILogService);

		const store = new DisposableStore();
		const tour = store.add(instantiationService.createInstance(
			SessionsTourOverlay,
			layoutService.mainContainer,
		));

		tour.finished.then(() => {
			logService.info('[sessions tour] Tour finished from developer action');
			storageService.store(TOUR_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			store.dispose();
		});
	}
});

// Developer: reset tour completion marker
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.resetSessionsTour',
			title: localize2('resetSessionsTour', "Reset Sessions Tour"),
			category: Categories.Developer,
			f1: true,
		});
	}
	run(accessor: ServicesAccessor): void {
		accessor.get(IStorageService).remove(TOUR_COMPLETE_KEY, StorageScope.APPLICATION);
	}
});
