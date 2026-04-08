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
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { SessionsWalkthroughOverlay, WalkthroughOutcome } from './sessionsWalkthrough.js';
import { WELCOME_COMPLETE_KEY } from '../../../common/welcome.js';

function shouldSkipSessionsWelcome(environmentService: IWorkbenchEnvironmentService): boolean {
	const envArgs = (environmentService as IWorkbenchEnvironmentService & { args?: Record<string, unknown> }).args;
	if (envArgs?.['skip-sessions-welcome']) {
		return true;
	}

	return typeof globalThis.location !== 'undefined' && new URLSearchParams(globalThis.location.search).has('skip-sessions-welcome');
}

function needsChatSetup(chatEntitlementService: Pick<IChatEntitlementService, 'sentiment' | 'entitlement' | 'anonymous'>, includeUnknown: boolean = true): boolean {
	const { sentiment, entitlement } = chatEntitlementService;
	return (
		!sentiment?.completed || // Setup not yet completed
		sentiment?.disabled ||
		entitlement === ChatEntitlement.Available ||
		(
			includeUnknown &&
			entitlement === ChatEntitlement.Unknown &&
			!chatEntitlementService.anonymous
		)
	);
}

function shouldPersistWelcomeCompletion(outcome: WalkthroughOutcome, chatEntitlementService: Pick<IChatEntitlementService, 'sentiment' | 'entitlement' | 'anonymous'>): boolean {
	return outcome === 'completed' || !needsChatSetup(chatEntitlementService);
}

export function resetSessionsWelcome(
	storageService: Pick<IStorageService, 'remove' | 'store'>,
	instantiationService: IInstantiationService,
	layoutService: IWorkbenchLayoutService,
	chatEntitlementService: Pick<IChatEntitlementService, 'sentimentObs' | 'entitlementObs' | 'sentiment' | 'entitlement' | 'anonymous'>,
	contextKeyService: IContextKeyService,
	environmentService: IWorkbenchEnvironmentService,
	logService: ILogService,
): void {
	// Clear completion marker
	storageService.remove(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION);

	if (shouldSkipSessionsWelcome(environmentService)) {
		return;
	}

	// Immediately show the walkthrough overlay
	const store = new DisposableStore();
	const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(contextKeyService);
	welcomeVisibleKey.set(true);
	store.add(toDisposable(() => welcomeVisibleKey.reset()));

	const walkthrough = store.add(instantiationService.createInstance(
		SessionsWalkthroughOverlay,
		layoutService.mainContainer,
	));

	store.add(autorun(reader => {
		chatEntitlementService.sentimentObs.read(reader);
		chatEntitlementService.entitlementObs.read(reader);

		if (!needsChatSetup(chatEntitlementService)) {
			storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			walkthrough.complete();
			store.dispose();
		}
	}));

	walkthrough.outcome
		.then(outcome => {
			logService.info(`[sessions welcome] Developer reset walkthrough finished with outcome: ${outcome}`);
			if (shouldPersistWelcomeCompletion(outcome, chatEntitlementService)) {
				storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			}
		})
		.finally(() => {
			store.dispose();
		});
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
		@ILogService private readonly logService: ILogService,
	) {
		super();

		if (!this.productService.defaultChatAgent?.chatExtensionId) {
			return;
		}

		// Allow automated tests to skip the welcome overlay entirely.
		// Desktop: --skip-sessions-welcome CLI flag
		// Web: ?skip-sessions-welcome query parameter
		if (shouldSkipSessionsWelcome(this.environmentService)) {
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
			this.watchEntitlementState();
		}
	}

	/**
	 * Watches entitlement and sentiment observables after setup has already
	 * completed. If the user's state changes such that setup is needed again
	 * (e.g. extension uninstalled/disabled), shows the welcome overlay.
	 *
	 * {@link ChatEntitlement.Unknown} is intentionally ignored here while the
	 * welcome completion marker remains set: it is almost always a transient
	 * state caused by a stale OAuth token being refreshed after an update.
	 * Explicit sign-out clears that marker first so the next Unknown transition
	 * immediately returns the user to the sign-in walkthrough.
	 */
	private watchEntitlementState(): void {
		let setupComplete = !this._needsChatSetup(false);
		this.watcherRef.value = autorun(reader => {
			this.chatEntitlementService.sentimentObs.read(reader);
			this.chatEntitlementService.entitlementObs.read(reader);

			const includeUnknown = !this.storageService.getBoolean(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION, false);
			const needsSetup = this._needsChatSetup(includeUnknown);
			if (setupComplete && needsSetup) {
				this.showWalkthrough();
			}
			setupComplete = !needsSetup;
		});
	}

	private _needsChatSetup(includeUnknown: boolean = true): boolean {
		return needsChatSetup(this.chatEntitlementService, includeUnknown);
	}

	private showWalkthrough(): void {
		if (this.overlayRef.value) {
			return;
		}

		this.watcherRef.clear();
		this.overlayRef.value = new DisposableStore();
		let welcomeCompletionStored = false;

		// Mark the welcome overlay as visible for titlebar disabling
		const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(this.contextKeyService);
		welcomeVisibleKey.set(true);
		this.overlayRef.value.add(toDisposable(() => welcomeVisibleKey.reset()));

		const walkthrough = this.overlayRef.value.add(this.instantiationService.createInstance(
			SessionsWalkthroughOverlay,
			this.layoutService.mainContainer,
		));

		// When chat setup completes (observables flip), persist completion and
		// finish the walkthrough so the app can render immediately.
		this.overlayRef.value.add(autorun(reader => {
			this.chatEntitlementService.sentimentObs.read(reader);
			this.chatEntitlementService.entitlementObs.read(reader);

			if (!welcomeCompletionStored && !this._needsChatSetup()) {
				welcomeCompletionStored = true;
				this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				walkthrough.complete();
			}
		}));

		// Handle the walkthrough outcome
		walkthrough.outcome.then(outcome => {
			this.logService.info(`[sessions welcome] Walkthrough finished with outcome: ${outcome}`);
			if (!welcomeCompletionStored && shouldPersistWelcomeCompletion(outcome, this.chatEntitlementService)) {
				welcomeCompletionStored = true;
				this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			}
			this.overlayRef.clear();
			this.watchEntitlementState();
		});
	}
}

registerWorkbenchContribution2(SessionsWelcomeContribution.ID, SessionsWelcomeContribution, WorkbenchPhase.BlockRestore);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.resetSessionsWelcome',
			title: localize2('resetSessionsWelcome', "Reset Agents Welcome"),
			category: Categories.Developer,
			f1: true,
		});
	}
	run(accessor: ServicesAccessor): void {
		const storageService = accessor.get(IStorageService);
		const instantiationService = accessor.get(IInstantiationService);
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const chatEntitlementService = accessor.get(IChatEntitlementService);
		const contextKeyService = accessor.get(IContextKeyService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);
		const logService = accessor.get(ILogService);
		resetSessionsWelcome(storageService, instantiationService, layoutService, chatEntitlementService, contextKeyService, environmentService, logService);
	}
});
