/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionsSetUp.css';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { DeferredPromise, disposableTimeout } from '../../base/common/async.js';
import { createDecorator, IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';
import { IUserDataProfileStorageService } from '../../platform/userDataProfile/common/userDataProfileStorageService.js';
import { IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ChatEntitlementContext, IChatEntitlementService } from '../../workbench/services/chat/common/chatEntitlementService.js';
import { isWeb } from '../../base/common/platform.js';
import { IDefaultAccountService } from '../../platform/defaultAccount/common/defaultAccount.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { IWorkbenchEnvironmentService } from '../../workbench/services/environment/common/environmentService.js';
import { IAuthenticationService } from '../../workbench/services/authentication/common/authentication.js';
import { ICommandService } from '../../platform/commands/common/commands.js';
import { IWorkbenchLayoutService } from '../../workbench/services/layout/browser/layoutService.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';
import { IHostService } from '../../workbench/services/host/browser/host.js';
import { IMarkdownRendererService } from '../../platform/markdown/browser/markdownRenderer.js';
import { WELCOME_COMPLETE_KEY } from '../common/welcome.js';
import { SessionsWelcomeVisibleContext } from '../common/contextkeys.js';

import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { Codicon } from '../../base/common/codicons.js';
import { $, append } from '../../base/browser/dom.js';
import { Dialog, DialogContentsAlignment } from '../../base/browser/ui/dialog/dialog.js';
import { createWorkbenchDialogOptions } from '../../workbench/browser/parts/dialogs/dialog.js';
import { MarkdownString } from '../../base/common/htmlContent.js';
import { localize } from '../../nls.js';

const AIDisabledConfig = 'chat.disableAIFeatures';

export const ISessionsSetUpService = createDecorator<ISessionsSetUpService>('sessionsSetUpService');

export interface ISessionsSetUpService {
	readonly _serviceBrand: undefined;
	/**
	 * Resolves when the welcome/setup flow has completed (or immediately
	 * if it is not currently active). Use this to defer work until after
	 * the user has finished the initial sign-in or setup dialog.
	 */
	whenWelcomeDone(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal welcome widget — owns all the welcome UI logic.
// Receives service callbacks as constructor params to avoid circular injection.
// ---------------------------------------------------------------------------

function shouldSkipSessionsWelcome(environmentService: IWorkbenchEnvironmentService): boolean {
	const envArgs = (environmentService as IWorkbenchEnvironmentService & { args?: Record<string, unknown> }).args;
	if (envArgs?.['skip-sessions-welcome']) {
		return true;
	}
	return typeof globalThis.location !== 'undefined' && new URLSearchParams(globalThis.location.search).has('skip-sessions-welcome');
}

class SessionsSetUpWidget extends Disposable {

	private readonly dialogRef = this._register(new MutableDisposable<DisposableStore>());
	private readonly watcherRef = this._register(new MutableDisposable());

	// Non-service params must come before @-decorated service params
	constructor(
		private readonly onCompleted: () => void,
		private readonly serviceWhenSetupDone: () => Promise<boolean>,
		private readonly serviceMarkDone: () => void,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IProductService private readonly productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ILogService private readonly logService: ILogService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IHostService private readonly hostService: IHostService,
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
	) {
		super();
		this._start();
	}

	private _start(): void {
		if (!this.productService.defaultChatAgent?.chatExtensionId) {
			this.onCompleted();
			return;
		}

		if (shouldSkipSessionsWelcome(this.environmentService)) {
			this.onCompleted();
			return;
		}

		if (isWeb) {
			this._checkWebAuth();
			this._watchWebAuth();
			return;
		}

		const isFirstLaunch = !this.storageService.getBoolean(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION, false);

		if (isFirstLaunch) {
			this._showWelcome(true);
		} else {
			this._watchSignInState();
		}
	}

	private async _checkWebAuth(): Promise<void> {
		try {
			const sessions = await this.authenticationService.getSessions('github');
			if (sessions.length > 0) {
				this.logService.info('[sessions welcome] GitHub session found on web, skipping welcome');
				this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				this.onCompleted();
				return;
			}
		} catch {
			// Provider not available yet — show dialog
		}
		this._showWelcome(false);
	}

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
			this.logService.info('[sessions welcome] GitHub session removed on web, re-showing welcome');
			this.storageService.remove(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION);
			this._showWelcome(false);
		}));
	}

	private async _watchSignInState(): Promise<void> {
		const initialAccount = await this.defaultAccountService.getDefaultAccount();
		if (this.dialogRef.value) {
			return;
		}
		if (!initialAccount) {
			this._showWelcome(false);
			return;
		}
		await this._ensureAIFeaturesEnabled();
		this.onCompleted();
		this.watcherRef.value = this._watchActiveState(true);
	}

	private _watchActiveState(signedIn: boolean): IDisposable {
		const disposables = new DisposableStore();

		disposables.add(this.defaultAccountService.onDidChangeDefaultAccount(account => {
			const nowSignedIn = account !== null;
			if (signedIn && !nowSignedIn) {
				this.storageService.remove(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION);
				this._showWelcome(false);
			}
			signedIn = nowSignedIn;
		}));

		disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AIDisabledConfig)) {
				if (this.configurationService.getValue<boolean>(AIDisabledConfig)) {
					this._showAIDisabledDialog();
				} else {
					// AI features re-enabled — dismiss any AI disabled dialog
					this.dialogRef.clear();
				}
			}
		}));

		return disposables;
	}

	private async _ensureAIFeaturesEnabled(): Promise<void> {
		if (this.configurationService.getValue<boolean>(AIDisabledConfig)) {
			this.logService.info('[sessions welcome] AI features disabled, enabling');
			await this.configurationService.updateValue(AIDisabledConfig, false);
		}
	}

	private async _showAIDisabledDialog(): Promise<void> {
		if (this.dialogRef.value) {
			return;
		}

		this.logService.info('[sessions welcome] AI features disabled, showing enable dialog');

		const disposables = new DisposableStore();
		this.dialogRef.value = disposables;

		const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(this.contextKeyService);
		welcomeVisibleKey.set(true);
		disposables.add(toDisposable(() => welcomeVisibleKey.reset()));

		const dialog = disposables.add(new Dialog(
			this.layoutService.activeContainer,
			'',
			[localize('sessions.aiDisabled.enable', "Enable AI Features")],
			createWorkbenchDialogOptions({
				type: 'none',
				extraClasses: ['chat-setup-dialog', 'sessions-welcome-dialog'],
				detail: localize('sessions.aiDisabled.detail', "Enable AI features to continue using Agents."),
				icon: Codicon.agent,
				alignment: DialogContentsAlignment.Vertical,
				cancelId: 1,
				disableCloseButton: true,
				disableCloseAction: true,
			}, this.keybindingService, this.layoutService, this.hostService)
		));

		const { button } = await dialog.show();
		disposables.dispose();
		this.dialogRef.clear();

		if (button === 0) {
			this.logService.info('[sessions welcome] User chose to enable AI features');
			await this.configurationService.updateValue(AIDisabledConfig, false);
		}
	}

	private async _showWelcome(isFirstLaunch: boolean): Promise<void> {
		if (this.dialogRef.value) {
			return;
		}

		this.watcherRef.clear();
		this.dialogRef.value = new DisposableStore();

		const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(this.contextKeyService);
		welcomeVisibleKey.set(true);
		this.dialogRef.value.add(toDisposable(() => welcomeVisibleKey.reset()));

		if (isFirstLaunch) {
			const overlay = this._showLoadingOverlay();
			this.dialogRef.value.add(overlay);

			const account = await this.defaultAccountService.getDefaultAccount();
			if (this._store.isDisposed) {
				return;
			}

			overlay.element.classList.add('sessions-loading-dismissed');
			this.dialogRef.value.add(disposableTimeout(() => overlay.element.remove(), 200));

			if (account) {
				const setupDone = await this.serviceWhenSetupDone();
				if (this._store.isDisposed) {
					return;
				}

				if (setupDone) {
					this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
					this.dialogRef.clear();
					this._watchSignInState();
					return;
				}

				await this._showWelcomeDialog();
			} else {
				await this._showSignInDialog();
			}
		} else {
			await this._showSignInDialog();
		}

		this.dialogRef.clear();
		await this._ensureAIFeaturesEnabled();
		this._watchSignInState();
	}

	private _showLoadingOverlay(): { element: HTMLElement } & IDisposable {
		const overlay = append(this.layoutService.mainContainer, $('div.sessions-loading-overlay'));
		overlay.setAttribute('role', 'status');
		overlay.setAttribute('aria-busy', 'true');
		overlay.setAttribute('aria-label', localize('loading', "Loading"));
		append(overlay, $('div.sessions-loading-icon.codicon.codicon-agent'));
		return { element: overlay, dispose: () => overlay.remove() };
	}

	private async _showSignInDialog(): Promise<void> {
		this.logService.info('[sessions welcome] Showing sign-in dialog');

		const signingInDialogRef = new MutableDisposable<DisposableStore>();

		const success = await this.commandService.executeCommand<boolean>('workbench.action.chat.triggerSetup', undefined, {
			forceSignInDialog: true,
			dialogIcon: Codicon.agent,
			dialogTitle: localize('sessions.signIn', "Sign in to use Agents"),
			disableCloseButton: true,
			onSignInStarted: () => {
				const disposables = new DisposableStore();
				signingInDialogRef.value = disposables;
				const dialog = disposables.add(new Dialog(
					this.layoutService.activeContainer,
					localize('sessions.signingIn', "Signing in…"),
					[],
					createWorkbenchDialogOptions({
						type: 'none',
						extraClasses: ['chat-setup-dialog', 'sessions-welcome-dialog'],
						detail: localize('sessions.signingIn.detail', "Please complete sign-in in the browser."),
						icon: Codicon.agent,
						alignment: DialogContentsAlignment.Vertical,
						cancelId: 0,
						disableCloseButton: true,
						disableDefaultAction: true,
					}, this.keybindingService, this.layoutService, this.hostService)
				));
				dialog.show();
			}
		});

		signingInDialogRef.dispose();

		if (success) {
			this.logService.info('[sessions welcome] Sign-in completed successfully');
			this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
			this.serviceMarkDone();
		} else {
			this.logService.info('[sessions welcome] Sign-in was canceled or failed');
		}
	}

	private async _showWelcomeDialog(): Promise<void> {
		this.logService.info('[sessions welcome] Showing welcome dialog');

		const disposables = new DisposableStore();
		const productName = localize('walkthrough.productName', "{0} - Agents", this.productService.nameLong);

		const dialog = disposables.add(new Dialog(
			this.layoutService.activeContainer,
			localize('sessions.welcome.title', "Welcome to {0}", productName),
			[localize('sessions.welcome.getStarted', "Get Started")],
			createWorkbenchDialogOptions({
				type: 'none',
				extraClasses: ['chat-setup-dialog', 'sessions-welcome-dialog', 'sessions-main-welcome-dialog'],
				detail: localize('sessions.welcome.detail', "Your AI-powered coding experience where agents explore, build, and iterate with you."),
				icon: Codicon.agent,
				alignment: DialogContentsAlignment.Vertical,
				cancelId: 1,
				disableCloseButton: true,
				renderFooter: footer => footer.appendChild(this._createWelcomeFooter(disposables)),
			}, this.keybindingService, this.layoutService, this.hostService)
		));

		await dialog.show();
		disposables.dispose();

		this.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		this.serviceMarkDone();
	}

	private _createWelcomeFooter(disposables: DisposableStore): HTMLElement {
		const element = $('.chat-setup-dialog-footer');
		const defaultChatAgent = this.productService.defaultChatAgent;
		const providerName = defaultChatAgent?.provider?.default?.name ?? 'GitHub';
		const termsUrl = defaultChatAgent?.termsStatementUrl ?? '';
		const privacyUrl = defaultChatAgent?.privacyStatementUrl ?? '';
		const publicCodeUrl = defaultChatAgent?.publicCodeMatchesUrl ?? '';
		const settingsUrl = defaultChatAgent?.manageSettingsUrl ?? '';

		const footer = localize(
			{ key: 'welcomeFooter', comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}', '{Locked="]({4})"}', '{Locked="]({5})"}'] },
			"By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}). {3} Copilot may show [public code]({4}) suggestions and use your data to improve the product. You can change these [settings]({5}) anytime.",
			providerName, termsUrl, privacyUrl, providerName, publicCodeUrl, settingsUrl
		);
		element.appendChild($('p', undefined, disposables.add(this.markdownRendererService.render(new MarkdownString(footer, { isTrusted: true }))).element));

		return element;
	}
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SessionsSetUpService extends Disposable implements ISessionsSetUpService {

	declare readonly _serviceBrand: undefined;

	private readonly _initPromise: Promise<void>;
	private readonly _welcomeDoneDeferred = new DeferredPromise<void>();

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataProfileStorageService private readonly userDataProfileStorageService: IUserDataProfileStorageService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._initPromise = this.initialize();

		this._register(this.instantiationService.createInstance(
			SessionsSetUpWidget,
			() => this._welcomeDoneDeferred.complete(),
			() => this.whenSetupDone(),
			() => this.markDone()
		));
	}

	private async whenSetupDone(): Promise<boolean> {
		await this._initPromise;
		return this.chatEntitlementService.sentiment.completed === true;
	}

	private markDone(): void {
		this.chatEntitlementService.markSetupCompleted();
	}

	whenWelcomeDone(): Promise<void> {
		return this._welcomeDoneDeferred.p;
	}

	private async initialize(): Promise<void> {
		if (this.chatEntitlementService.sentiment.completed) {
			return;
		}

		try {
			const defaultProfile = this.userDataProfilesService.defaultProfile;
			await this.userDataProfileStorageService.withProfileScopedStorageService(defaultProfile, async storageService => {
				const defaultContext = this.instantiationService
					.createChild(new ServiceCollection([IStorageService, storageService]))
					.createInstance(ChatEntitlementContext);
				try {
					if (defaultContext.state.completed) {
						this.logService.info('[sessions welcome] Setup already completed in default profile, marking done locally');
						this.markDone();
					}
				} finally {
					defaultContext.dispose();
				}
			});
		} catch (error) {
			this.logService.error('[sessions welcome] Failed to read setup state from default profile:', error);
		}
	}
}
