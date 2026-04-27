/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWeb } from '../../../../base/common/platform.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { localize2 } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { SessionsWalkthroughOverlay, WalkthroughOutcome } from './sessionsWalkthrough.js';
import { WELCOME_COMPLETE_KEY } from '../../../common/welcome.js';

function shouldSkipSessionsWelcome(environmentService: IWorkbenchEnvironmentService): boolean {
	const envArgs = (environmentService as IWorkbenchEnvironmentService & { args?: Record<string, unknown> }).args;
	if (envArgs?.['skip-sessions-welcome']) {
		return true;
	}

	return typeof globalThis.location !== 'undefined' && new URLSearchParams(globalThis.location.search).has('skip-sessions-welcome');
}

function shouldPersistWelcomeCompletion(outcome: WalkthroughOutcome, defaultAccountService: IDefaultAccountService): boolean {
	return outcome === 'completed' || defaultAccountService.currentDefaultAccount !== null;
}

export function resetSessionsWelcome(
	storageService: Pick<IStorageService, 'remove' | 'store'>,
	instantiationService: IInstantiationService,
	layoutService: IWorkbenchLayoutService,
	defaultAccountService: IDefaultAccountService,
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
		true,
	));

	store.add(defaultAccountService.onDidChangeDefaultAccount(account => {
		if (!walkthrough.isShowingWelcome && walkthrough.isShowingSignIn && account !== null) {
			storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			walkthrough.complete();
			store.dispose();
		}
	}));

	walkthrough.outcome
		.then(outcome => {
			logService.info(`[sessions welcome] Developer reset walkthrough finished with outcome: ${outcome}`);
			if (shouldPersistWelcomeCompletion(outcome, defaultAccountService)) {
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
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
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

		if (isWeb) {
			// On web, show the walkthrough if the user is not authenticated.
			// Auth is handled by the walkthrough's GitHub button via
			// IAuthenticationService. Discovery runs separately after auth.
			this._checkWebAuth();
			this._watchWebAuth();
			return;
		}
		const isFirstLaunch = !this.storageService.getBoolean(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION, false);

		if (isFirstLaunch) {
			// First launch: show the overlay immediately with a loading animation
			// while the default account resolves, then render the appropriate screen.
			this.showWalkthrough(true);
		} else {
			// Returning user: don't block with a loading screen — resolve the account
			// in the background. If signed out, showWalkthrough will be called then.
			this.watchSignInState();
		}
	}

	/**
	 * Web-only: check if the user has a GitHub session. If not, show the
	 * walkthrough so they can sign in. If they're already authenticated,
	 * skip the walkthrough and let discovery handle the rest.
	 */
	private async _checkWebAuth(): Promise<void> {
		try {
			const sessions = await this.authenticationService.getSessions('github');
			if (sessions.length > 0) {
				this.logService.info('[sessions welcome] GitHub session found on web, skipping walkthrough');
				this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				return;
			}
		} catch {
			// Provider not available yet — show walkthrough
		}
		this.showWalkthrough(false);
	}

	/**
	 * Web-only: react to GitHub session loss. When the user's last GitHub
	 * session is removed (token expired, secret storage wiped, or explicit
	 * sign-out from the account menu), clear the welcome completion marker
	 * and show the sign-in walkthrough again. Without this, passive sign-out
	 * leaves the user on a seemingly-working workbench with a stale UI.
	 */
	private _watchWebAuth(): void {
		this._register(this.authenticationService.onDidChangeSessions(async e => {
			if (e.providerId !== 'github' || !e.event.removed?.length) {
				return;
			}
			try {
				const remaining = await this.authenticationService.getSessions('github');
				if (remaining.length > 0) {
					return;
				}
			} catch {
				// Provider became unavailable — treat as signed out
			}
			this.logService.info('[sessions welcome] GitHub session removed on web, re-showing walkthrough');
			this.storageService.remove(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION);
			this.showWalkthrough(false);
		}));
	}

	/**
	 * Watches the default account after setup has already completed. If the
	 * user signs out, shows the welcome (sign-in) overlay again. Also
	 * handles the case where the account resolves to null at startup (the
	 * user was signed out since their last session).
	 */
	private async watchSignInState(): Promise<void> {
		const initialAccount = await this.defaultAccountService.getDefaultAccount();
		if (this.overlayRef.value) {
			return; // overlay already shown by another path
		}
		if (!initialAccount) {
			this.showWalkthrough(false);
			return;
		}
		let signedIn = true;
		this.watcherRef.value = this.defaultAccountService.onDidChangeDefaultAccount(account => {
			const nowSignedIn = account !== null;
			if (signedIn && !nowSignedIn) {
				// Clear the completion marker so that on the next reload the
				// welcome overlay's loading animation covers startup, instead
				// of briefly showing the workbench before the sign-in screen.
				this.storageService.remove(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION);
				this.showWalkthrough(false);
			}
			signedIn = nowSignedIn;
		});
	}

	private showWalkthrough(isFirstLaunch: boolean): void {
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
			isFirstLaunch,
		));

		// When the user signs in, persist completion and finish the walkthrough.
		// Only auto-complete once the sign-in screen is actually visible — not
		// during the loading phase — so external account resolution (e.g. VS Code
		// signing in while the Agents loading animation is still showing) cannot
		// dismiss the overlay before the user has seen or interacted with it.
		this.overlayRef.value.add(this.defaultAccountService.onDidChangeDefaultAccount(account => {
			if (!welcomeCompletionStored && !walkthrough.isShowingWelcome && walkthrough.isShowingSignIn && account !== null) {
				welcomeCompletionStored = true;
				this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				walkthrough.complete();
			}
		}));

		// Handle the walkthrough outcome
		walkthrough.outcome.then(outcome => {
			this.logService.info(`[sessions welcome] Walkthrough finished with outcome: ${outcome}`);
			if (this._store.isDisposed) {
				return;
			}
			if (!welcomeCompletionStored && shouldPersistWelcomeCompletion(outcome, this.defaultAccountService)) {
				welcomeCompletionStored = true;
				this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			}
			this.overlayRef.clear();
			this.watchSignInState();
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
		const defaultAccountService = accessor.get(IDefaultAccountService);
		const contextKeyService = accessor.get(IContextKeyService);
		const environmentService = accessor.get(IWorkbenchEnvironmentService);
		const logService = accessor.get(ILogService);
		resetSessionsWelcome(storageService, instantiationService, layoutService, defaultAccountService, contextKeyService, environmentService, logService);
	}
});
